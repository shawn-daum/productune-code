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

const PY_RAW = /\.write_text\(|\.write_bytes\(|\bopen\([^()]*,\s*['"][wax]b?\+?['"]|\batomic_write_text\(|shutil\.(?:copyfile|copy2?|move)\(/
const TS_RAW = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|copyFileSync|renameSync|atomicWriteFileSync|atomicWriteFile)\(|\b(?:fs|fsp|promises)\.(?:rename|copyFile)\(/

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
  for (const f of shell) add(scanFlat(rel(f), read(f), PY_RAW))
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
  'core/scripts/prdt::reindex_wiki': 1,
  'core/scripts/prdt::scaffold_releases': 1,
  'core/scripts/prdt::write_machine_index': 1,
  'core/scripts/prdt::cmd_menus': 1,
  'core/scripts/prdt::wiki_promote': 2,
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
