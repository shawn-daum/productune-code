/**
 * state-write-ratchet.test.ts — T-908 (T-848 S5): a ratchet over raw file
 * writes. Project-local state (`.prdt/**`) is written only through the
 * link-refusing primitives — Python `state_write` / `state_open_dir` /
 * `state_append` (scripts/prdt), the hooks' `prdt_safe_fs.py`, Node
 * `stateWriteFileSync` (src/fs/state-write.ts). Every OTHER raw write call
 * (Python `.write_text` / `.write_bytes` / `open(..., 'w'|'a'|'x')` /
 * `atomic_write_text`; Node `writeFileSync` / `appendFile` / `renameSync` / … /
 * `atomicWriteFileSync`) is counted per scope below. A new raw write — or one
 * more in a scope already listed — fails this test: route it through a
 * primitive, or, when its target is provably outside `.prdt/` (home, docs
 * text, a user-chosen path), add it to ALLOW with the reason. An entry whose
 * count no longer matches also fails: lower or delete it, so the list can
 * only shrink.
 */
import fs from 'fs'
import path from 'path'
import { describe, test, expect } from 'vitest'

const PKGS = path.resolve(__dirname, '..', '..', '..')
const rel = (p: string) => path.relative(PKGS, p).split(path.sep).join('/')

// open(...) with a write mode anywhere in its args (nested parens one deep: open(str(p), "w")),
// Path.open("w"), os.open with a write/create flag, os.write
const PY_RAW = new RegExp([
  String.raw`\.write_text\(`, String.raw`\.write_bytes\(`, String.raw`\batomic_write_text\(`, String.raw`shutil\.(?:copyfile|copy2?|move)\(`,
  String.raw`\bopen\((?:[^()]|\([^()]*\))*,\s*(?:mode\s*=\s*)?['"][wax]b?\+?['"]`,
  String.raw`\.open\(\s*(?:mode\s*=\s*)?['"][wax]b?\+?['"]`,
  String.raw`\bos\.open\([^\n]*\bO_(?:WRONLY|RDWR|CREAT|APPEND|TRUNC)\b`, String.raw`\bos\.write\(`,
].join('|'))
const TS_RAW = new RegExp([
  String.raw`\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|copyFileSync|renameSync|atomicWriteFileSync|atomicWriteFile)\(`,
  String.raw`\b(?:fs|fsp|promises)\.(?:rename|copyFile)\(`,
  String.raw`\bwriteSync\(`, String.raw`\bopenSync\([^\n]*(?:['"][wa]x?\+?['"]|O_WRONLY|O_RDWR|O_CREAT|O_APPEND)`,
].join('|'))
/** A `>` / `>>` redirect to a file or variable path in shell (not `>&`, `>=`, `->`, `2>&1`, /dev/null). */
const SH_REDIR = /(?<![<>=\-|&\\])(?<![0-9]>)>>?(?![>&=])\s*["']?(?!\/dev\/null)[$./~A-Za-z_{]/

/** Python functions that ARE the primitives (their own raw calls are the point). */
const PY_PRIMITIVES = new Set(['atomic_write_text', 'state_write', 'state_append', 'state_open_dir'])
/** Files that ARE a primitive. */
const PRIMITIVE_FILES = new Set(['core/scripts/prdt_safe_fs.py', 'core/src/fs/state-write.ts', 'core/src/fs/atomic-write.ts'])

const isComment = (line: string) => /^\s*(#|\/\/|\*|\/\*)/.test(line)

/** Count raw writes per scope: Python → `<file>::<def>`; shell/TS → `<file>`. */
export function scanPython(file: string, text: string): Record<string, number> {
  const out: Record<string, number> = {}
  let scope = '(module)'
  for (const line of text.split('\n')) {
    const d = /^(?:async )?def (\w+)/.exec(line)
    if (d) scope = d[1]
    if (isComment(line) || !PY_RAW.test(line) || /^\s*def /.test(line)) continue
    if (PY_PRIMITIVES.has(scope)) continue
    const k = `${file}::${scope}`
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}
export function scanFlat(file: string, text: string, re: RegExp): Record<string, number> {
  let n = 0
  for (const line of text.split('\n')) if (!isComment(line) && re.test(line) && !/^\s*(export )?(async )?function /.test(line)) n++
  return n ? { [file]: n } : {}
}

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'build' || e.name === '__pycache__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, keep, out)
    else if (keep(p)) out.push(p)
  }
  return out
}

function scanRepo(): Record<string, number> {
  const all: Record<string, number> = {}
  const add = (r: Record<string, number>) => { for (const [k, v] of Object.entries(r)) all[k] = (all[k] ?? 0) + v }
  const read = (p: string) => fs.readFileSync(p, 'utf8')
  const prdt = path.join(PKGS, 'core', 'scripts', 'prdt')
  add(scanPython(rel(prdt), read(prdt)))
  const scripts = path.join(PKGS, 'core', 'scripts')
  // hooks and the status line carry embedded Python — counted per file
  const shell = [...walk(path.join(scripts, 'hooks'), (f) => f.endsWith('.sh')), path.join(scripts, 'statusline-prdt.sh')]
  for (const f of shell) add(scanFlat(rel(f), read(f), new RegExp(`${PY_RAW.source}|${SH_REDIR.source}`)))
  const isSrc = (f: string) => /\.(ts|tsx|mjs)$/.test(f) && !/\.(test|spec)\.|test-fixtures|\/tests?\//.test(f)
  for (const root of [path.join(PKGS, 'core', 'src'), path.join(PKGS, 'gui', 'electron'), path.join(PKGS, 'gui', 'src'), path.join(PKGS, 'gui', 'shared'), path.join(PKGS, 'viewer')]) {
    if (!fs.existsSync(root)) continue
    for (const f of walk(root, isSrc)) {
      const r = rel(f)
      if (PRIMITIVE_FILES.has(r)) continue
      add(scanFlat(r, read(f), TS_RAW))
    }
  }
  return all
}

/** Today's remaining raw sites (T-908). Shrink only. */
const ALLOW: Record<string, number> = {
  // docs / release text the CLI scaffolds or derives (not under .prdt/)
  'core/scripts/prdt::scaffold_releases': 1,
  'core/scripts/prdt::cmd_menus': 1,
  'core/scripts/prdt::wiki_promote': 1,
  'core/scripts/prdt::cmd_tickets_new': 1,
  'core/scripts/prdt::cmd_tickets_fmt': 1,
  'core/scripts/prdt::schedule_report': 1,
  'core/scripts/prdt::write_artifact_manifest': 1,
  // home-directory state (~/.prdt, ~/.claude.json) and the git pre-push hook — outside any project's .prdt/
  'core/scripts/prdt::set_trust_accepted': 2,
  'core/scripts/prdt::ensure_prepush_hook': 1,
  'core/scripts/prdt::_inbox_write': 1,
  'core/scripts/prdt::_inbox_lock': 1,
  'core/scripts/prdt::_feedback_lock': 1,
  'core/scripts/prdt::cmd_feedback': 1,
  'core/scripts/prdt::register_write': 1,
  'core/scripts/prdt::_write_token': 1,
  'core/scripts/prdt::_dispatch_cap_put': 1,
  'core/scripts/prdt::viewer_install_deps': 1,
  'core/scripts/prdt::_write_update_state': 1,
  'core/scripts/prdt::_resource_write_failed_stop': 1,
  'core/scripts/prdt::_resource_clear_failed_stop': 1,
  'core/scripts/prdt::cmd_resource': 2,
  'core/scripts/prdt::_lume_resident_resources': 1,
  'core/scripts/prdt::write_canary_latch': 1,
  'core/scripts/prdt::_machine_env_store': 1, // T-1109: ~/.prdt/env/.env (machine scope, 0600) — outside any project's .prdt/
  'core/scripts/prdt::_env_write_all': 1, // T-1119: os.write of masked child output to our stdout/stderr fd — no file
  'core/scripts/prdt::_env_run_masked': 1, // T-1119: os.write of relayed terminal input to the child's pty master — no file
  // a log file opened as the child's stdout fd (Popen), not a text write
  'core/scripts/prdt::cmd_test_cloud': 1,
  // lock files / exclusive creates with dir_fd + O_NOFOLLOW by design (index.db create, track and resource locks) and /dev/null opens
  'core/scripts/prdt::_index_db_prepare': 1,
  'core/scripts/prdt::_track_lock': 2,
  'core/scripts/prdt::_resource_lock': 1,
  'core/scripts/prdt::main': 1,
  // hook / status-line shell: `>` `>>` redirects (temp files, stderr captures, per-session stamps) — not audited for .prdt targets; hooks write project state through prdt_safe_fs.py
  'core/scripts/hooks/prdt-audience-inject.sh': 2,
  'core/scripts/hooks/prdt-auto-open.sh': 1,
  'core/scripts/hooks/prdt-call-governor.sh': 6,
  'core/scripts/hooks/prdt-dispatch-gate.sh': 13,
  'core/scripts/hooks/prdt-identity-guard.sh': 3,
  'core/scripts/hooks/prdt-inbox-inject.sh': 1,
  'core/scripts/hooks/prdt-overrides-inject.sh': 1,
  'core/scripts/hooks/prdt-post-dispatch.sh': 8,
  'core/scripts/hooks/prdt-question-check.sh': 2,
  'core/scripts/hooks/prdt-return-check.sh': 7,
  'core/scripts/hooks/prdt-secret-guard.sh': 2,
  'core/scripts/hooks/prdt-session-start.sh': 4,
  'core/scripts/hooks/prdt-user-prompt.sh': 7, // T-1081: +1 = cap_jsonl's trim of $PRDT_HOME/run/form-outline-counts.jsonl (home, never .prdt/)
  'core/scripts/hooks/prdt-worktree-guard.sh': 1,
  'core/scripts/statusline-prdt.sh': 6,
  'core/src/git-workflow/meta-backup.ts': 2,
  // TypeScript — core src / GUI electron / the generator's direct dev mode; targets not yet audited for .prdt/ (T-848 follow-up)
  'core/src/git-workflow/autosave.ts': 1,
  'core/src/git-workflow/meta-git.ts': 1,
  'core/src/git-workflow/meta-migrate.ts': 6,
  'core/src/git-workflow/rules.ts': 2,
  'core/src/git-workflow/worktree.ts': 2,
  'core/src/github.ts': 1,
  'core/src/settings/plan-tier.ts': 1,
  'core/src/settings/register.ts': 1,
  'core/src/settings/ui-settings.ts': 1,
  // viewer: doctrine copy into a fresh mkdtemp dir used as the throwaway PRDT_HOME for `--plan` (T-1050) — outside any project / state dir
  'viewer/lib/discipline-load.mjs': 1,
  'gui/electron/chat-store.ts': 2,
  'gui/electron/claude-installer.ts': 1,
  'gui/electron/ipc/attachments.ts': 1,
  'gui/electron/ipc/doctrine.ts': 1,
  'gui/electron/ipc/html.ts': 1,
  'gui/electron/ipc/mcp.ts': 2,
  'gui/electron/ipc/onboarding.ts': 2,
  'gui/electron/ipc/project.ts': 1,
  'gui/electron/ipc/projectEnv.ts': 1,
  'gui/electron/ipc/settings.ts': 1,
  'gui/electron/mechanical-write.ts': 1,
  'gui/electron/po-session-config.ts': 1,
  'gui/electron/prdt-bootstrap.ts': 10,
  'gui/electron/toolchain.ts': 4,
  'viewer/cli.mjs': 3,
}

describe('state-write ratchet (T-908)', () => {
  test('the scanner flags raw writes and ignores the primitives', () => {
    expect(scanPython('f', 'def a():\n    p.write_text("x")\n    open(q, "w")\n    atomic_write_text(p, t)\n')).toEqual({ 'f::a': 3 })
    expect(scanPython('f', 'def a():\n    p.open("w")\n    open(str(p), "a")\n    open(p, mode="w")\n    os.open(p, os.O_WRONLY)\n    os.write(fd, b)\n    os.open(p, os.O_RDONLY)\n    open(p)\n')).toEqual({ 'f::a': 5 })
    expect(scanFlat('s.sh', 'echo x > "$F"\necho y >> out.txt\nx 2>&1\nx >/dev/null\nx >&2\njq \'. >= 4\'\nx | jq -r .a\n', SH_REDIR)).toEqual({ 's.sh': 2 })
    expect(scanFlat('g.ts', 'const fd = fs.openSync(p, "w")\nfs.writeSync(fd, d)\nfs.openSync(p, "r")\n', TS_RAW)).toEqual({ 'g.ts': 2 })
    expect(scanPython('f', 'def state_write(r):\n    p.write_text("x")\n')).toEqual({})
    expect(scanPython('f', 'def a():\n    # p.write_text("x")\n    state_write(root, p, t)\n    open(q)\n')).toEqual({})
    expect(scanFlat('g.ts', 'fs.writeFileSync(p, d)\nstateWriteFileSync(root, p, d)\n', TS_RAW)).toEqual({ 'g.ts': 1 })
    expect(scanFlat('g.ts', '// fs.writeFileSync(p, d)\nfs.rename(a, b)\n', TS_RAW)).toEqual({ 'g.ts': 1 })
  })

  test('no raw write outside the allowlist, and no allowlist entry looser than the code', () => {
    const found = scanRepo()
    if (process.env.RATCHET_PRINT) console.log(JSON.stringify(found, null, 2))
    const grew = Object.entries(found).filter(([k, n]) => n > (ALLOW[k] ?? 0)).map(([k, n]) => `${k}: ${n} raw write(s), allowed ${ALLOW[k] ?? 0}`)
    const loose = Object.entries(ALLOW).filter(([k, n]) => (found[k] ?? 0) < n).map(([k, n]) => `${k}: allowed ${n}, found ${found[k] ?? 0} — lower the entry`)
    expect({ grew, loose }).toEqual({ grew: [], loose: [] })
  })
})
