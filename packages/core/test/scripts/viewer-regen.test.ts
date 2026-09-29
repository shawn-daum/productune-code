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
async function waitFor(check: () => boolean, ms = 4000): Promise<boolean> {
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
