/**
 * T-802 — background, coalesced viewer regeneration on ANY docs/**\/*.md write.
 *
 * Before this ticket, `prdt-auto-open.sh`'s only regen path lived inside the
 * T-746 VIEWER_DOC branch, gated behind the T-559 subagent guard — a worker's
 * write of a viewer-tracked doc never regenerated anything, and a ticket write
 * (not in the VIEWER_DOC allowlist at all) never regenerated regardless of who
 * wrote it. This suite proves the NEW path: any Write/Edit/MultiEdit of a
 * docs/**\/*.md file — PO or worker, ticket or wiki or PRD — schedules a
 * background `prdt viewer --no-open`, opens nothing, does not block the hook's
 * own return, and coalesces a burst into a handful of runs, not one per write.
 *
 * `open` is stubbed (never a real window); the regen is driven through a
 * stub `prdt` binary (never the real node generator) so timing is ours to
 * control — a short artificial delay creates deliberate overlap for the
 * coalescing assertion, matching this repo's async-hook-test convention
 * (meta-backup-trigger.test.ts's `waitForCalls`).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-auto-open.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}
function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

/** A project root with `.prdt/po-state.json` (find_proj's marker) plus one
 *  ticket and one wiki page under docs/. */
function project(dir: string): string {
  const root = path.join(dir, 'proj')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md'),
    '---\nid: T-001\nslug: first\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nhello\n')
  fs.mkdirSync(path.join(root, 'docs', 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'wiki', 'fact--x.md'), '---\ntitle: x\ntype: fact\nstatus: live\n---\nbody\n')
  return root
}

/** Fake `open` (logs argv, never opens) + a stub `prdt` that only answers
 *  `viewer --no-open`: appends one byte to $PRDT_TEST_COUNT (proving how many
 *  times regen actually ran), sleeps $PRDT_TEST_SLEEP seconds first (to force
 *  overlap for the coalescing test), then writes viewer.html under the cwd
 *  it was called with (the worker always sets cwd=root). */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t802-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const openLog = path.join(dir, 'open.log')
  fs.writeFileSync(path.join(bin, 'open'), `#!/usr/bin/env bash\necho "$@" >> "${openLog}"\n`, { mode: 0o755 })
  const prdtStub = path.join(dir, 'prdt-stub')
  fs.writeFileSync(prdtStub, [
    '#!/usr/bin/env bash',
    'if [ "${1:-}" = "viewer" ] && [ "${2:-}" = "--no-open" ]; then',
    '  [ -n "$PRDT_TEST_COUNT" ] && printf x >> "$PRDT_TEST_COUNT"',
    '  [ -n "$PRDT_TEST_SLEEP" ] && sleep "$PRDT_TEST_SLEEP"',
    '  mkdir -p "$(pwd)/.prdt/scratch/viewer"',
    '  echo "<!doctype html>" > "$(pwd)/.prdt/scratch/viewer/viewer.html"',
    '  echo "[viewer](file://$(pwd)/.prdt/scratch/viewer/viewer.html)"',
    '  exit 0',
    'fi',
    'exit 2',
  ].join('\n') + '\n', { mode: 0o755 })
  const prdtHome = path.join(dir, 'prdt-home')
  fs.mkdirSync(prdtHome)
  const countFile = path.join(dir, 'count')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PRDT_HOME: prdtHome,
    PRDT_BIN: prdtStub,
    PRDT_TEST_COUNT: countFile,
  }
  delete env.PRDT_GUI_SESSION
  delete env.PRDT_TEST_SLEEP
  return { dir, openLog, countFile, env, prdtHome }
}

function readLog(p: string): string {
  try { return fs.readFileSync(p, 'utf8').trim() } catch { return '' }
}
function countOf(p: string): number {
  try { return fs.readFileSync(p, 'utf8').length } catch { return 0 }
}

function writeEvent(tool: string, filePath: string, agentType?: string): string {
  const ev: Record<string, unknown> = { hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: filePath } }
  if (agentType !== undefined) ev.agent_type = agentType
  return JSON.stringify(ev)
}

/** The regen is a genuinely detached background process — poll for it. */
async function waitFor(check: () => boolean, ms = 20000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return check()
}

const RUN = hasJq() && !!PYTHON3

describe.skipIf(!RUN)('T-802 — background regen on any docs/**/*.md write', () => {
  test('a worker Write of a ticket (not in the T-746 open allowlist) regenerates viewer.html and opens nothing', async () => {
    const s = sandbox()
    const root = project(s.dir)
    const target = path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md')
    execFileSync('bash', [HOOK], { input: writeEvent('Write', target, 'developer'), env: s.env })

    const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    expect(await waitFor(() => fs.existsSync(viewer))).toBe(true)
    expect(readLog(s.openLog)).toBe('')
  })

  test('the PO (no agent_type) writing a ticket also regenerates, and still opens nothing (tickets are outside the open allowlist)', async () => {
    const s = sandbox()
    const root = project(s.dir)
    const target = path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md')
    execFileSync('bash', [HOOK], { input: writeEvent('Write', target), env: s.env })

    const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    expect(await waitFor(() => fs.existsSync(viewer))).toBe(true)
    expect(readLog(s.openLog)).toBe('')
  })

  test('Edit and MultiEdit of a docs/**/*.md file regenerate exactly like a Write', async () => {
    for (const tool of ['Edit', 'MultiEdit']) {
      const s = sandbox()
      const root = project(s.dir)
      const target = path.join(root, 'docs', 'wiki', 'fact--x.md')
      execFileSync('bash', [HOOK], { input: writeEvent(tool, target, 'qa'), env: s.env })

      const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
      expect(await waitFor(() => fs.existsSync(viewer)), tool).toBe(true)
      expect(readLog(s.openLog), tool).toBe('')
    }
  })

  test('auto-open=off suppresses opening but not regeneration', async () => {
    const s = sandbox()
    const root = project(s.dir)
    fs.writeFileSync(path.join(s.prdtHome, 'auto-open'), 'off\n')
    const target = path.join(root, 'docs', 'wiki', 'fact--x.md')
    execFileSync('bash', [HOOK], { input: writeEvent('Write', target), env: s.env })

    const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    expect(await waitFor(() => fs.existsSync(viewer))).toBe(true)
    expect(readLog(s.openLog)).toBe('')
  })

  test('a write outside docs/ never schedules a regen', async () => {
    const s = sandbox()
    const root = project(s.dir)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    const target = path.join(root, 'src', 'index.ts')
    fs.writeFileSync(target, 'export {}\n')
    execFileSync('bash', [HOOK], { input: writeEvent('Write', target), env: s.env })

    // Give a background job every chance to have shown up, then confirm none did.
    await new Promise((r) => setTimeout(r, 300))
    expect(fs.existsSync(s.countFile)).toBe(false)
    expect(fs.existsSync(path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html'))).toBe(false)
  })

  test('the --open hand-off mode never schedules a regen (it opens an already-generated link, it writes nothing)', async () => {
    const s = sandbox()
    const root = project(s.dir)
    const f = path.join(root, 'docs', 'wiki', 'fact--x.md')
    execFileSync('bash', [HOOK, '--open', f], { env: s.env, input: '' })
    await new Promise((r) => setTimeout(r, 300))
    expect(fs.existsSync(s.countFile)).toBe(false)
  })

  test('a burst of rapid writes regenerates once or a few times, never once per write', async () => {
    const s = sandbox()
    const root = project(s.dir)
    const env = { ...s.env, PRDT_TEST_SLEEP: '0.3' }
    const N = 6
    // A ticket path on purpose: it is outside the T-746 VIEWER_DOC open
    // allowlist, so this exercises ONLY the new background regen path, never
    // the pre-existing synchronous "get the jump link to open" call that
    // T-746 already makes for a PO write of a viewer-tracked doc (wiki/PRD/
    // features/artifacts) — mixing the two in one count would conflate two
    // independent call sites.
    const target = path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md')
    for (let i = 0; i < N; i++) {
      execFileSync('bash', [HOOK], { input: writeEvent('Write', target, i % 2 ? 'developer' : undefined), env })
    }
    // Wait until the count file goes quiet (no growth for two consecutive polls)
    // — proves the single-flight loop has drained, not just "at least one ran".
    let last = -1
    let stable = 0
    const t0 = Date.now()
    while (Date.now() - t0 < 6000 && stable < 3) {
      const c = countOf(s.countFile)
      if (c === last) stable++
      else { stable = 0; last = c }
      await new Promise((r) => setTimeout(r, 200))
    }
    const finalCount = countOf(s.countFile)
    expect(finalCount).toBeGreaterThan(0)
    expect(finalCount).toBeLessThan(N)
    expect(readLog(s.openLog)).toBe('')
  })
})

/**
 * T-838 — a `prdt` subcommand that changes a viewer-read document schedules
 * the SAME T-802 worker itself (decision T-837: no Bash hook). Driven through
 * the real CLI with `$PRDT_BIN` pointing at a stub generator, so every count
 * below is a real run of the worker's `viewer --no-open` call.
 */
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function cliSandbox(opts: { fail?: boolean; sleep?: string; viewer?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t838-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const openLog = path.join(dir, 'open.log')
  fs.writeFileSync(path.join(bin, 'open'), `#!/usr/bin/env bash\necho "$@" >> "${openLog}"\n`, { mode: 0o755 })
  const stub = path.join(dir, 'prdt-stub')
  fs.writeFileSync(stub, [
    '#!/usr/bin/env bash',
    'if [ "${1:-}" = "viewer" ] && [ "${2:-}" = "--no-open" ]; then',
    '  printf x >> "$PRDT_TEST_COUNT"',
    '  [ -n "$PRDT_TEST_SLEEP" ] && sleep "$PRDT_TEST_SLEEP"',
    '  [ -n "$PRDT_TEST_FAIL" ] && exit 1',
    '  echo "<!doctype html>" > "$(pwd)/.prdt/scratch/viewer/viewer.html"',
    '  find "$(pwd)/docs/tickets" -name "T-*.md" | sed "s#.*/##" >> "$(pwd)/.prdt/scratch/viewer/viewer.html"',
    '  exit 0',
    'fi',
    'exit 2',
  ].join('\n') + '\n', { mode: 0o755 })
  const prdtHome = path.join(dir, 'prdt-home')
  fs.mkdirSync(prdtHome)
  const root = path.join(dir, 'proj')
  fs.mkdirSync(root)
  const countFile = path.join(dir, 'count')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PRDT_HOME: prdtHome,
    PRDT_BIN: stub,
    PRDT_TEST_COUNT: countFile,
    PRDT_META_BACKUP: '0',
    CI: '1',
  }
  delete env.PRDT_GUI_SESSION
  delete env.PRDT_TEST_SLEEP
  delete env.PRDT_TEST_FAIL
  delete env.PRDT_VIEWER_REGEN_BACKOFF_SECS
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}, input = '') =>
    execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: root, env: { ...env, ...extra }, input, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
    })
  run(['init', '--json', '--slug', 'proj', '--yes'])
  const vdir = path.join(root, '.prdt', 'scratch', 'viewer')
  if (opts.viewer !== false) {
    fs.mkdirSync(vdir, { recursive: true })
    fs.writeFileSync(path.join(vdir, 'viewer.html'), 'stale\n')
  }
  if (opts.fail) env.PRDT_TEST_FAIL = '1'
  if (opts.sleep) env.PRDT_TEST_SLEEP = opts.sleep
  return { dir, root, run, countFile, openLog, vdir, env }
}

/** Wait until the count file stops growing, then return it. */
async function settledCount(p: string, minWaitMs = 400): Promise<number> {
  await new Promise((r) => setTimeout(r, minWaitMs))
  let last = -1
  let stable = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 6000 && stable < 3) {
    const c = countOf(p)
    if (c === last) stable++
    else { stable = 0; last = c }
    await new Promise((r) => setTimeout(r, 150))
  }
  return countOf(p)
}

function newTicket(s: ReturnType<typeof cliSandbox>, slug: string): string {
  const out = s.run(['tickets', 'new', '--type', 'impl', '--slug', slug])
  return out.match(/\[(T-\d+)\]/)![1]
}

describe.skipIf(!RUN)('T-838 — doc-writing prdt subcommands regenerate the viewer themselves', () => {
  test('tickets new regenerates viewer.html in the background and opens nothing', async () => {
    const s = cliSandbox()
    newTicket(s, 'first')
    expect(await waitFor(() => countOf(s.countFile) > 0)).toBe(true)
    expect(await waitFor(() => fs.readFileSync(path.join(s.vdir, 'viewer.html'), 'utf8').startsWith('<!doctype'))).toBe(true)
    expect(readLog(s.openLog)).toBe('')
  })

  test('tickets fmt regenerates after a rewrite; --check, --dry-run and an already formatted ticket do not', async () => {
    const s = cliSandbox()
    const id = newTicket(s, 'fmt-me')
    await settledCount(s.countFile)
    const base = countOf(s.countFile)
    const f = path.join(s.root, 'docs', 'tickets', 'v0.1', `${id}.md`)
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## problem', '## Problem'))
    try { s.run(['tickets', 'fmt', id, '--check']) } catch { /* exits 1 on a violation, by design */ }
    s.run(['tickets', 'fmt', id, '--dry-run'])
    expect(await settledCount(s.countFile)).toBe(base)
    s.run(['tickets', 'fmt', id])
    expect(await waitFor(() => countOf(s.countFile) > base)).toBe(true)
    const after = await settledCount(s.countFile)
    expect(s.run(['tickets', 'fmt', id])).toContain('already formatted')
    expect(await settledCount(s.countFile)).toBe(after)
  })

  test('wiki reindex regenerates when index.md changes, not when it is rewritten unchanged', async () => {
    const s = cliSandbox()
    s.run(['wiki', 'reindex'])
    expect(await settledCount(s.countFile)).toBe(0)
    fs.writeFileSync(path.join(s.root, 'docs', 'wiki', 'fact--y.md'), '---\ntitle: y\ntype: fact\nstatus: live\n---\nbody\n')
    s.run(['wiki', 'reindex'])
    expect(await waitFor(() => countOf(s.countFile) > 0)).toBe(true)
  })

  test('schedule report and artifacts sync regenerate; a repeat with nothing new does not', async () => {
    const s = cliSandbox()
    s.run(['schedule', 'report'])
    expect(await waitFor(() => countOf(s.countFile) > 0)).toBe(true)
    let base = await settledCount(s.countFile)
    s.run(['schedule', 'report'])
    expect(await settledCount(s.countFile)).toBe(base)
    fs.mkdirSync(path.join(s.root, 'docs', 'artifacts', 'v0.1'), { recursive: true })
    fs.writeFileSync(path.join(s.root, 'docs', 'artifacts', 'v0.1', 'note.md'), 'hi\n')
    s.run(['artifacts', 'sync'])
    expect(await waitFor(() => countOf(s.countFile) > base)).toBe(true)
    base = await settledCount(s.countFile)
    s.run(['artifacts', 'sync'])
    expect(await settledCount(s.countFile)).toBe(base)
    expect(readLog(s.openLog)).toBe('')
  })

  test('read-only commands, the dispatch gate\'s `schedule record`, and a project without a viewer regenerate nothing', async () => {
    const s = cliSandbox()
    s.run(['tickets'])
    s.run(['schedule'])
    s.run(['doctor'])
    try { s.run(['schedule', 'record'], {}, JSON.stringify({ tool_name: 'Agent', tool_input: {} })) } catch { /* gate-internal */ }
    expect(await settledCount(s.countFile)).toBe(0)

    const n = cliSandbox({ viewer: false })
    newTicket(n, 'no-viewer')
    expect(await settledCount(n.countFile)).toBe(0)
    expect(fs.existsSync(path.join(n.vdir, 'viewer.html'))).toBe(false)
  })

  test('the command neither waits on the regen nor fails when it cannot run', async () => {
    const s = cliSandbox({ sleep: '3' })
    const t0 = Date.now()
    newTicket(s, 'fast')
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(await waitFor(() => countOf(s.countFile) > 0)).toBe(true)

    const b = cliSandbox()
    const out = b.run(['tickets', 'new', '--type', 'impl', '--slug', 'broken'], { PRDT_BIN: path.join(b.dir, 'no-such-prdt') })
    expect(out).toMatch(/\[T-\d+\]/)
  })

  test('20 doc-writing calls against a failing generator make at most a few attempts (failure stamp)', async () => {
    const s = cliSandbox({ fail: true })
    for (let i = 0; i < 20; i++) newTicket(s, `burst-${i}`)
    const attempts = await settledCount(s.countFile)
    expect(attempts).toBeGreaterThan(0)
    expect(attempts).toBeLessThanOrEqual(3)
    expect(fs.existsSync(path.join(s.vdir, '.regen-failed'))).toBe(true)
  })

  test('a success after the backoff window clears the failure stamp', async () => {
    const s = cliSandbox({ fail: true })
    newTicket(s, 'fails')
    expect(await waitFor(() => fs.existsSync(path.join(s.vdir, '.regen-failed')))).toBe(true)
    await settledCount(s.countFile)
    const base = countOf(s.countFile)
    delete s.env.PRDT_TEST_FAIL
    newTicket(s, 'recovers-too-soon')
    expect(await settledCount(s.countFile)).toBe(base)
    s.run(['tickets', 'new', '--type', 'impl', '--slug', 'recovers'], { PRDT_VIEWER_REGEN_BACKOFF_SECS: '0' })
    expect(await waitFor(() => !fs.existsSync(path.join(s.vdir, '.regen-failed')))).toBe(true)
    expect(countOf(s.countFile)).toBe(base + 1)
  })

  // T-850 (final review C3): a failing regen, then a working generator — the
  // request skipped inside the backoff window is retried by the next
  // doc-writing command once the stamp is older than the window.
  test('reviewer sequence: failing generator, then a working one — the next doc write after the window shows the second ticket', async () => {
    const s = cliSandbox({ fail: true })
    newTicket(s, 'first')
    expect(await waitFor(() => fs.existsSync(path.join(s.vdir, '.regen-failed')))).toBe(true)
    await settledCount(s.countFile)
    delete s.env.PRDT_TEST_FAIL
    const second = newTicket(s, 'second')
    await settledCount(s.countFile)
    expect(fs.readFileSync(path.join(s.vdir, 'viewer.html'), 'utf8')).not.toContain(second)
    const old = Date.now() / 1000 - 120
    fs.utimesSync(path.join(s.vdir, '.regen-failed'), old, old)
    newTicket(s, 'third')
    // The detached worker writes viewer.html first and clears .regen-failed only
    // after the generator exits: wait for BOTH (a load-dependent gap between the
    // two), with a generous timeout, instead of asserting the stamp right after.
    expect(await waitFor(() =>
      fs.readFileSync(path.join(s.vdir, 'viewer.html'), 'utf8').includes(second) &&
      !fs.existsSync(path.join(s.vdir, '.regen-failed')), 20000)).toBe(true)
  })

  test('a successful manual prdt viewer removes .regen-failed, so the next doc write regenerates at once', async () => {
    const s = cliSandbox({ fail: true })
    newTicket(s, 'first')
    expect(await waitFor(() => fs.existsSync(path.join(s.vdir, '.regen-failed')))).toBe(true)
    await settledCount(s.countFile)
    delete s.env.PRDT_TEST_FAIL
    const out = s.run(['viewer', '--no-open'], { PRDT_BIN: '' })
    expect(out).toContain('viewer.html')
    expect(fs.existsSync(path.join(s.vdir, '.regen-failed'))).toBe(false)
    const second = newTicket(s, 'second')
    expect(await waitFor(() => fs.readFileSync(path.join(s.vdir, 'viewer.html'), 'utf8').includes(second))).toBe(true)
  }, 30000)
})

/**
 * T-842 — a repository can commit symlinks under `.prdt/scratch/`. The regen
 * worker (hook path and CLI path alike) and the viewer / jump-page writers must
 * never write THROUGH one: every victim outside the project keeps its bytes and
 * mtime, the regeneration is skipped, and the calling command still succeeds.
 * QA repro (2026-09-30): viewer.html -> v1, .regen-dirty -> v2, .regen-failed
 * -> v3 (targets older than the 60 s backoff), then a doc-writing command —
 * v2 became `1`, v3 a Unix timestamp.
 */
type Snap = Record<string, { bytes: string; mtimeMs: number }>

/** A scratch "home" holding victim files, all stamped an hour old. */
function victimHome(dir: string) {
  const home = path.join(dir, 'home')
  fs.mkdirSync(home, { recursive: true })
  const old = Date.now() / 1000 - 3600
  const mk = (rel: string, body = `victim ${rel}\n`) => {
    const p = path.join(home, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
    fs.utimesSync(p, old, old)
    return p
  }
  const snapshot = (): Snap => {
    const out: Snap = {}
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else { const st = fs.lstatSync(p); out[path.relative(home, p)] = { bytes: fs.readFileSync(p, 'utf8'), mtimeMs: st.mtimeMs } }
      }
    }
    walk(home)
    return out
  }
  return { home, mk, snapshot }
}

type Layout = 'files' | 'viewer-dir' | 'scratch-dir' | 'at-dir'

/** Plant one attack layout under `root`'s `.prdt/scratch/`. */
function plant(root: string, v: ReturnType<typeof victimHome>, layout: Layout) {
  const scratch = path.join(root, '.prdt', 'scratch')
  const vdir = path.join(scratch, 'viewer')
  if (layout === 'files') {
    fs.mkdirSync(vdir, { recursive: true })
    fs.rmSync(path.join(vdir, 'viewer.html'), { force: true })
    fs.symlinkSync(v.mk('victim1'), path.join(vdir, 'viewer.html'))
    fs.symlinkSync(v.mk('victim2'), path.join(vdir, '.regen-dirty'))
    fs.symlinkSync(v.mk('victim3'), path.join(vdir, '.regen-failed'))
    fs.symlinkSync(v.mk('victim4'), path.join(vdir, '.regen-lock'))
  } else if (layout === 'viewer-dir') {
    fs.rmSync(vdir, { recursive: true, force: true })
    fs.mkdirSync(scratch, { recursive: true })
    v.mk('vdir/viewer.html', 'victim viewer\n')
    v.mk('vdir/.regen-dirty')
    v.mk('vdir/.regen-failed')
    v.mk('vdir/at/T-001.html')
    fs.symlinkSync(path.join(v.home, 'vdir'), vdir)
  } else if (layout === 'scratch-dir') {
    fs.rmSync(scratch, { recursive: true, force: true })
    v.mk('sdir/viewer/viewer.html', 'victim viewer\n')
    v.mk('sdir/viewer/.regen-failed')
    fs.symlinkSync(path.join(v.home, 'sdir'), scratch)
  } else {
    fs.mkdirSync(vdir, { recursive: true })
    if (!fs.existsSync(path.join(vdir, 'viewer.html'))) fs.writeFileSync(path.join(vdir, 'viewer.html'), 'stale\n')
    fs.rmSync(path.join(vdir, 'at'), { recursive: true, force: true })
    v.mk('atdir/T-001.html')
    v.mk('atdir/docs/wiki/fact--x.md.html')
    fs.symlinkSync(path.join(v.home, 'atdir'), path.join(vdir, 'at'))
  }
}

const LAYOUTS: Layout[] = ['files', 'viewer-dir', 'scratch-dir', 'at-dir']

describe.skipIf(!RUN)('T-842 — regen state files and scratch writers never follow a committed symlink', () => {
  for (const layout of LAYOUTS) {
    test(`CLI path (tickets new, wiki reindex): every victim unchanged — ${layout}`, async () => {
      const s = cliSandbox()
      const v = victimHome(s.dir)
      s.env.HOME = v.home
      plant(s.root, v, layout)
      const before = v.snapshot()
      const env = {}
      const out = s.run(['tickets', 'new', '--type', 'impl', '--slug', 'planted'], env)
      expect(out).toMatch(/\[T-\d+\]/)
      fs.writeFileSync(path.join(s.root, 'docs', 'wiki', 'fact--z.md'), '---\ntitle: z\ntype: fact\nstatus: live\n---\nbody\n')
      s.run(['wiki', 'reindex'], env)
      const count = await settledCount(s.countFile, 800)
      expect(v.snapshot()).toEqual(before)
      // Only the at/-dir layout leaves the viewer directory itself intact, so
      // only there may the worker still regenerate viewer.html.
      if (layout !== 'at-dir') expect(count).toBe(0)
      expect(readLog(s.openLog)).toBe('')
    })
  }

  for (const layout of LAYOUTS) {
    test(`hook path (Write/Edit of docs/**/*.md): every victim unchanged — ${layout}`, async () => {
      const s = sandbox()
      const root = project(s.dir)
      const v = victimHome(s.dir)
      plant(root, v, layout)
      const before = v.snapshot()
      const env = { ...s.env, HOME: v.home }
      for (const [tool, rel] of [['Write', 'docs/tickets/v1.0/T-001.md'], ['Edit', 'docs/wiki/fact--x.md']]) {
        const r = execFileSync('bash', [HOOK], { input: writeEvent(tool, path.join(root, rel), 'developer'), env, encoding: 'utf8' })
        expect(r).toBe('{}')
      }
      const count = await settledCount(s.countFile, 800)
      expect(v.snapshot()).toEqual(before)
      if (layout !== 'at-dir') expect(count).toBe(0)
      expect(readLog(s.openLog)).toBe('')
    })
  }

  for (const layout of LAYOUTS) {
    test(`real \`prdt viewer\` (generator + at/ jump page) writes nothing outside the project — ${layout}`, () => {
      const s = cliSandbox()
      const v = victimHome(s.dir)
      s.env.HOME = v.home
      plant(s.root, v, layout)
      const before = v.snapshot()
      const env = {}
      const id = newTicket(s, 'jump')
      const out = s.run(['viewer', '--no-open', id, path.join('docs', 'wiki', 'index.md')], env)
      expect(out).toContain('file://')
      expect(v.snapshot()).toEqual(before)
    })
  }
  // QA round 2: a hard link is a regular file, so S_ISREG alone let O_TRUNC
  // write through it into the linked inode.
  test('a hard link at .regen-dirty, .regen-failed or .regen-lock is never written through', async () => {
    const s = cliSandbox()
    const v = victimHome(s.dir)
    for (const name of ['.regen-dirty', '.regen-failed', '.regen-lock']) {
      fs.linkSync(v.mk(`hl-${name}`), path.join(s.vdir, name))
    }
    const before = v.snapshot()
    s.run(['tickets', 'new', '--type', 'impl', '--slug', 'hardlink'])
    const count = await settledCount(s.countFile, 800)
    expect(v.snapshot()).toEqual(before)
    expect(count).toBe(0)
  })

  // T-715's exact-mode contract: the jump page mode equals atomic_write_text's
  // under any umask (os.open()'s mode is masked; the fchmod re-asserts it).
  for (const umask of ['022', '077']) {
    test(`jump page mode equals atomic_write_text's under umask ${umask}`, () => {
      const s = cliSandbox()
      const probe = [
        'import importlib.machinery, importlib.util, os, sys, tempfile',
        'from pathlib import Path',
        'spec = importlib.util.spec_from_loader("prdt_mod", importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1]))',
        'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
        `os.umask(0o${umask})`,
        'root = Path(sys.argv[2]); viewer = root / ".prdt/scratch/viewer/viewer.html"',
        'page = m.viewer_jump(viewer, "T-001")',
        'base = m.atomic_write_text(Path(tempfile.mkdtemp()) / "base.html", "x")',
        'print(oct(os.stat(page).st_mode & 0o777), oct(os.stat(base).st_mode & 0o777))',
      ].join('\n')
      const out = execFileSync('python3', ['-c', probe, PRDT_CLI, s.root], { env: s.env, encoding: 'utf8' }).trim()
      const [jump, base] = out.split(' ')
      expect(base).toBe('0o644')
      expect(jump).toBe(base)
    })
  }

  // QA round 2: the message names the actual linked component.
  const MESSAGE_LAYOUTS: Array<[string, string]> = [['viewer', '.prdt/scratch/viewer'], ['scratch', '.prdt/scratch'], ['prdt', '.prdt']]
  for (const [which, linked] of MESSAGE_LAYOUTS) {
    test(`prdt viewer names the linked path ${linked} and says to remove the link itself`, () => {
      const s = cliSandbox()
      const target = path.join(s.dir, 'elsewhere')
      fs.mkdirSync(path.join(target, 'scratch', 'viewer'), { recursive: true })
      fs.mkdirSync(path.join(target, 'viewer'), { recursive: true })
      const dot = path.join(s.root, '.prdt')
      if (which === 'viewer') {
        fs.rmSync(s.vdir, { recursive: true, force: true })
        fs.symlinkSync(target, s.vdir)
      } else if (which === 'scratch') {
        fs.rmSync(path.join(dot, 'scratch'), { recursive: true, force: true })
        fs.symlinkSync(target, path.join(dot, 'scratch'))
      } else {
        const moved = path.join(s.dir, 'prdt-moved')
        fs.renameSync(dot, moved)
        fs.symlinkSync(moved, dot)
      }
      let err = ''
      try { s.run(['viewer', '--no-open']) } catch (e: any) { err = String(e.stderr) }
      expect(err).toContain(`prdt viewer: ${linked} 가 심볼릭 링크라서`)
      if (which === 'prdt') {
        // T-850 (final review C1): `.prdt` holds the project's state — never tell the user to delete it
        expect(err).toContain('따라가지 않아요')
        expect(err).toContain('자동')
        expect(err).not.toMatch(/지우|지운|삭제/)
      } else {
        expect(err).toContain(`${linked} 링크 자체만 지운`)
      }
      // the other two components are not named as the link, and no trailing-slash command is offered
      for (const other of ['.prdt/scratch/viewer', '.prdt/scratch', '.prdt']) {
        if (other !== linked) expect(err).not.toContain(`prdt viewer: ${other} `)
      }
      expect(err).not.toMatch(/rm |\/ /)
    })
  }

  // T-850 (final review C2): a refusal not caused by a symlink names the path
  // that failed and why, never a link that does not exist.
  const viewerErr = (s: ReturnType<typeof cliSandbox>) => {
    try { s.run(['viewer', '--no-open']); return '' } catch (e: any) { return String(e.stderr) }
  }
  test('a regular file at .prdt/scratch: the message names it and says it is not a folder', () => {
    const s = cliSandbox()
    fs.rmSync(path.join(s.root, '.prdt', 'scratch'), { recursive: true, force: true })
    fs.writeFileSync(path.join(s.root, '.prdt', 'scratch'), 'x\n')
    const err = viewerErr(s)
    expect(err).toContain('prdt viewer: .prdt/scratch 가')
    expect(err).toContain('폴더가 아니')
    expect(err).not.toContain('심볼릭')
    expect(err).not.toContain('.prdt/scratch/viewer')
    expect(fs.readFileSync(path.join(s.root, '.prdt', 'scratch'), 'utf8')).toBe('x\n')
  })

  for (const [label, rel, missing] of [
    ['an unwritable .prdt/scratch (viewer folder missing)', '.prdt/scratch', true],
    ['an unwritable .prdt/scratch/viewer', '.prdt/scratch/viewer', false],
  ] as Array<[string, string, boolean]>) {
    test(`${label}: the message names that folder and the permission, not a symlink`, () => {
      const s = cliSandbox({ viewer: !missing })
      if (missing) fs.rmSync(s.vdir, { recursive: true, force: true })
      const dir = path.join(s.root, rel)
      fs.mkdirSync(dir, { recursive: true })
      fs.chmodSync(dir, 0o555)
      try {
        const err = viewerErr(s)
        expect(err).toContain(`prdt viewer: ${rel} `)
        expect(err).toContain('쓰기 권한이 없어')
        expect(err).not.toContain('심볼릭')
      } finally {
        fs.chmodSync(dir, 0o755)
      }
    })
  }
})
