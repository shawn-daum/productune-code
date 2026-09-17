/**
 * T-578 — `prdt-session-start.sh --self-load <agent_type> [--page p]`: the
 * self-load procedure the agents/prdt-*.md stubs point at lives in the hook,
 * once, and prints the SAME set the hook would have injected.
 *
 * Why paged: the Bash tool has an output cap of its own (~30,000 chars →
 * persisted to a file, 2 KB preview; observed 2026-09-04 on Claude Code
 * 2.1.260), so the pre-T-578 one-shot `cat` of 24–45 KB was truncated exactly
 * the way the hook payload was before T-577. Every page below is measured
 * against a REAL run over the repo's actual discipline.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync, spawn } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const SESSION_HOOK = path.join(HOOKS, 'prdt-session-start.sh')
const AGENTS = path.join(CORE_ROOT, 'agents')
// A byte-identical snapshot of the hook as it was actually installed on this machine
// pre-T-578 (extracted via `git show HEAD:…` — HEAD at T-578 slice-A time is that exact
// commit, 34,021 B, 0 real `--self-load` support: it falls through its arg parser's
// `*) shift` branch, then unconditionally reads stdin). A real stale mirror, not a
// hand-simulated one — see the two tests below.
const PRE_T578_HOOK_FIXTURE = path.join(CORE_ROOT, 'test', 'fixtures', 'pre-t578-session-start.sh')

function hasBin(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}

/**
 * Kill an entire process tree rooted at `pid`, without `detached`/process-group
 * tricks. `detached: true` is hard-refused repo-wide (packages/gui/tests/isolation-rules.cjs,
 * T-450 Rule 6: a detached child can outlive a test run undetected), and a plain
 * child's pid is not a process-group id, so `process.kill(-pid, …)` would either
 * throw or — worse — hit the WRONG group. Walk `ps -eo pid,ppid` instead to find
 * every live descendant (the hook's inner `bash`, and the `cat` it forked), then
 * SIGKILL each one directly, deepest first so a parent's exit never races a still-
 * enumerable child off the list.
 */
function killProcessTree(rootPid: number): void {
  let table: string
  try {
    table = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' })
  } catch {
    return // no `ps` (unexpected on darwin/linux CI) — nothing more we can do here
  }
  const childrenOf = new Map<number, number[]>()
  for (const line of table.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (!m) continue
    const [, pidStr, ppidStr] = m
    const ppid = Number(ppidStr)
    const list = childrenOf.get(ppid) ?? []
    list.push(Number(pidStr))
    childrenOf.set(ppid, list)
  }
  const order: number[] = []
  const stack = [rootPid]
  while (stack.length) {
    const cur = stack.pop()!
    order.push(cur)
    for (const kid of childrenOf.get(cur) ?? []) stack.push(kid)
  }
  for (const pid of order.reverse()) {
    if (pid === rootPid) continue // caller kills the root itself, after this
    try { process.kill(pid, 'SIGKILL') } catch { /* already exited */ }
  }
}
const READY = hasBin('jq', ['--version']) && hasBin('python3', ['--version'])

// Pinned independently of the hook (T-484 lesson): the check must not import
// the number it checks.
const PAGE_BUDGET_BYTES = 28000
const PART_BUDGET_BYTES = 8000

const PERSONAS = ['po', 'designer', 'developer', 'qa'] as const
type Persona = (typeof PERSONAS)[number]

function realHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-home-'))
  fs.cpSync(path.join(CORE_ROOT, 'discipline'), path.join(home, 'discipline'), { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(home, 'doctrine.md'))
  // the sibling hooks self-load runs for the override layers
  fs.mkdirSync(path.join(home, 'hooks'))
  for (const h of ['prdt-session-start.sh', 'prdt-overrides-inject.sh', 'prdt-project-overrides-inject.sh']) {
    fs.copyFileSync(path.join(HOOKS, h), path.join(home, 'hooks', h))
  }
  // T-578 fix: also copy the registered part-N slot siblings (prdt-session-start-p2.sh…).
  // `runPart` below now executes the hook FROM this home dir (not the repo hook dir), so
  // its own `HOOK_DIR`-based slot count (`for _w in "$HOOK_DIR"/prdt-session-start-p[0-9]*.sh`)
  // must see the same siblings a real install would register here — otherwise selfLoad
  // (which ignores SLOTS entirely, per the hook's own selfload-mode comment) and runPart
  // (which is slot-gated) would silently read two different "how much is installed"
  // realities even though both claim to describe this one temp home (T-578 grill finding).
  for (const f of fs.readdirSync(HOOKS)) {
    if (/^prdt-session-start-p\d+\.sh$/.test(f)) fs.copyFileSync(path.join(HOOKS, f), path.join(home, 'hooks', f))
  }
  fs.mkdirSync(path.join(home, 'overrides'))
  return home
}

function selfLoad(home: string, agent: string, page?: number, cwd = os.tmpdir(), stdin = ''): { out: string; err: string; status: number | null } {
  const args = [path.join(home, 'hooks', 'prdt-session-start.sh'), '--self-load', agent]
  if (page !== undefined) args.push('--page', String(page))
  const r = spawnSync('bash', args, { input: stdin, encoding: 'utf8', cwd, env: { ...process.env, PRDT_HOME: home } })
  return { out: r.stdout, err: r.stderr, status: r.status }
}

function runPart(home: string, persona: Persona, part: number): string {
  // Read from `home`'s own copied hook, not the repo's (T-578 grill finding): the hook
  // resolves its sibling-slot count from `$(dirname "$0")`, so running the repo path here
  // while `selfLoad` reads the temp home means the two never actually describe one
  // install — a mismatch this test could not have caught. Both now execute the SAME dir.
  const out = execFileSync('bash', [path.join(home, 'hooks', 'prdt-session-start.sh'), '--part', String(part)], {
    input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: `prdt-${persona}`, cwd: os.tmpdir() }),
    encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
  })
  return out.trim() ? (JSON.parse(out).hookSpecificOutput.additionalContext as string) : ''
}

function allPages(home: string, agent: string): string[] {
  const pages: string[] = []
  for (let p = 1; p <= 20; p++) {
    const r = selfLoad(home, agent, p)
    if (r.status !== 0) break
    pages.push(r.out)
  }
  return pages
}

describe.skipIf(!READY)('--self-load prints the hook set, paged for the Bash tool (T-578)', () => {
  for (const persona of PERSONAS) {
    test(`${persona}: every page under ${PAGE_BUDGET_BYTES} B, every hook part present verbatim, pages agree on P`, () => {
      const home = realHome()
      const agent = `prdt-${persona}`
      const pages = allPages(home, agent)
      expect(pages.length).toBeGreaterThan(1)   // the real set never fits one Bash output
      const joined = pages.join('\n')
      pages.forEach((pg, i) => {
        expect(Buffer.byteLength(pg, 'utf8'), `page ${i + 1} bytes`).toBeLessThanOrEqual(PAGE_BUDGET_BYTES)
        expect(pg).toMatch(new RegExp(`----- prdt self-load · page ${i + 1}/${pages.length} for ${agent} -----`))
        if (i + 1 < pages.length) {
          expect(pg).toContain(`--self-load ${agent} --page ${i + 2}`)
          expect(pg).toMatch(/complete only with all \d+ pages read/)
        } else {
          expect(pg).toMatch(/All \d+ page\(s\) read: the set is complete/)
          expect(pg).toContain('never read bare')
        }
      })
      // Same delivery as the hook path: every part the slots would render, byte for byte.
      let n = 0
      for (let k = 1; k <= 20; k++) {
        const part = runPart(home, persona, k)
        if (!part) break
        n++
        expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(PART_BUDGET_BYTES)
        expect(joined, `part ${k} verbatim in the pages`).toContain(part)
      }
      expect(n).toBeGreaterThan(1)
      const headers = joined.match(/^\[prdt discipline — prdt-\w+ session start · part \d+\/\d+\]/gm) ?? []
      expect(headers.length).toBe(n)
      // Nothing the slot count would have withheld: self-load has no slots to run short of.
      expect(joined).not.toContain('NOT DELIVERED')
    })
  }

  test('both override layers ride the LAST page, rendered by their own hooks (gutter, layer header)', () => {
    const home = realHome()
    fs.writeFileSync(path.join(home, 'overrides', 'developer.md'), '# machine\n\n- machine rule α\n')
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-proj-'))
    fs.mkdirSync(path.join(proj, '.prdt', 'overrides'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), '{"schema_version":1,"stage":"build","version":"v1","current_task":null}\n')
    fs.writeFileSync(path.join(proj, '.prdt', 'overrides', 'developer.md'), '- project rule β\n')
    const pages: string[] = []
    for (let p = 1; p <= 20; p++) {
      const r = selfLoad(home, 'prdt-developer', p, proj)
      if (r.status !== 0) break
      pages.push(r.out)
    }
    const last = pages[pages.length - 1]
    const before = pages.slice(0, -1).join('\n')
    expect(last).toContain('[prdt discipline — machine overrides for prdt-developer]')
    expect(last).toContain('| - machine rule α')
    expect(last).toContain('[prdt discipline — PROJECT overrides for prdt-developer')
    expect(last).toContain('| - project rule β')
    expect(before).not.toContain('machine rule α')
    expect(before).not.toContain('project rule β')
    // the override blocks come BEFORE the page footer, never after it
    expect(last.indexOf('| - project rule β')).toBeLessThan(last.indexOf('----- prdt self-load · page'))
  })

  test('an absent override file prints nothing — the same silence as the hook path', () => {
    const home = realHome()
    const pages = allPages(home, 'prdt-qa')
    expect(pages.join('\n')).not.toContain('[prdt discipline — machine overrides')
    expect(pages.join('\n')).not.toContain('[prdt discipline — project overrides')
  })

  test('stdin is not an input: an event on stdin naming another agent does not change the persona', () => {
    const home = realHome()
    const r = selfLoad(home, 'prdt-designer', 1, os.tmpdir(), JSON.stringify({ agent_type: 'prdt-po', cwd: os.tmpdir() }))
    expect(r.status).toBe(0)
    expect(r.out).toContain('[prdt discipline — prdt-designer session start · part 1/')
    expect(r.out).not.toContain('prdt-po session start')
  })

  test('mirror MISSING: the persona-specific rule is printed by the hook (worker vs PO), exit 0', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-empty-'))
    fs.mkdirSync(path.join(home, 'hooks'))
    fs.copyFileSync(SESSION_HOOK, path.join(home, 'hooks', 'prdt-session-start.sh'))
    const w = selfLoad(home, 'prdt-qa')
    expect(w.status).toBe(0)
    expect(w.out).toContain('[prdt discipline — MISSING]')
    expect(w.out).toContain('`needs_info: true`')
    expect(w.out).toContain('Never hand anyone a command to run')
    expect(w.out).not.toContain('You are the PO')
    const po = selfLoad(home, 'prdt-po')
    expect(po.status).toBe(0)
    expect(po.out).toContain('You are the PO')
    expect(po.out).toContain('run it yourself')
    expect(po.out).not.toContain('needs_info')
    // neither prints a single discipline part
    expect(w.out + po.out).not.toContain('session start · part')
  })

  test('bad inputs fail loud: unknown agent type → exit 1; page past the end → exit 1, empty stdout', () => {
    const home = realHome()
    const bad = selfLoad(home, 'prdt-nobody')
    expect(bad.status).toBe(1)
    expect(bad.err).toContain('--self-load takes a prdt agent type')
    const far = selfLoad(home, 'prdt-developer', 99)
    expect(far.status).toBe(1)
    expect(far.out).toBe('')
    expect(far.err).toMatch(/--page 99 is out of range/)
  })

  test('self-load never consumes the PO one-shot migration flag', () => {
    const home = realHome()
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-mig-'))
    fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), '{"schema_version":1,"stage":"build","version":"v1","current_task":null}\n')
    const flag = path.join(proj, '.prdt', 'migration-briefing-pending')
    fs.writeFileSync(flag, '{"migrated":true}\n')
    const r = selfLoad(home, 'prdt-po', 1, proj)
    expect(r.status).toBe(0)
    expect(r.out).not.toContain('MIGRATION ONBOARDING')
    expect(fs.existsSync(flag)).toBe(true)
  })
})

// T-578 grill finding (MEDIUM): the stub's own predicate — "absent or reports MISSING" —
// named only two outcomes. A STALE mirror (a pre-T-578 hook, installed before this
// feature existed) is a real third one: it does not recognize `--self-load` at all,
// falls through its arg parser's catch-all, and unconditionally reads stdin. With an
// open stdin that blocks past any tool timeout; with stdin closed it exits 0 having
// printed nothing — neither "absent" nor a MISSING report, so the old predicate left a
// persona with no STOP signal at all. These two tests pin the fix against the REAL
// installed pre-T-578 hook (fixture above), not a stand-in for one.
describe('stale (pre-T-578) mirror hook: the stub survives it (T-578 grill fix)', () => {
  function writeFixtureHook(home: string): string {
    fs.mkdirSync(path.join(home, 'hooks'), { recursive: true })
    const hookPath = path.join(home, 'hooks', 'prdt-session-start.sh')
    fs.copyFileSync(PRE_T578_HOOK_FIXTURE, hookPath)
    fs.chmodSync(hookPath, 0o755)
    return hookPath
  }
  /** the exact self-load command the developer stub tells the agent to run, `~/.prdt/…` rewritten to the real fixture path under test */
  function stubSelfLoadCommand(hookPath: string): string {
    const stub = fs.readFileSync(path.join(AGENTS, 'prdt-developer.md'), 'utf8')
    const m = stub.match(/`(bash ~\/\.prdt\/hooks\/prdt-session-start\.sh --self-load prdt-developer[^`]*)`/)
    if (!m) throw new Error('prdt-developer.md: no self-load command found in the expected backtick shape')
    return m[1].replace('~/.prdt/hooks/prdt-session-start.sh', hookPath)
  }

  test("the stub's exact command, run against a real pre-T-578 hook: closes stdin, does not hang, and produces the MISSING outcome (empty output, no discipline header)", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-stale-'))
    const hookPath = writeFixtureHook(home)
    const cmd = stubSelfLoadCommand(hookPath)
    expect(cmd).toContain('</dev/null')   // the fix under test: the stub itself closes stdin
    const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', timeout: 5000 })
    expect(r.signal).toBeNull()           // finished on its own — the 5s guard never had to fire
    expect(r.status).toBe(0)
    // Not literally "[prdt discipline — MISSING]" — this pre-T-578 hook has no idea
    // `--self-load` exists. It is silence: empty stdout, no `[prdt discipline —` header
    // at all. That silence is exactly the third outcome the broadened stub predicate
    // ("absent, prints nothing … or reports MISSING") now treats as MISSING.
    expect(r.stdout).toBe('')
    expect(r.stdout).not.toMatch(/\[prdt discipline —/)
  })

  test('the same command WITHOUT the stdin redirect blocks indefinitely against that hook — why the redirect is load-bearing', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t578-stale-hang-'))
    const hookPath = writeFixtureHook(home)
    const cmdWithRedirect = stubSelfLoadCommand(hookPath)
    const cmdNoRedirect = cmdWithRedirect.replace(/\s*<\/dev\/null\s*$/, '')
    expect(cmdNoRedirect).not.toContain('</dev/null')
    // spawnSync with no `input` closes stdin itself, which would mask exactly the bug
    // QA found (that only shows up with stdin genuinely left open, as the Bash tool's
    // own shell leaves it — measured 2026-09-04, killed by hand past the 120s tool
    // timeout). `spawn` with a stdin pipe nobody writes to or closes reproduces that.
    //
    // The blocked `cat` is a GRANDCHILD (this `bash -c` execs the stub's inner
    // `bash …prdt-session-start.sh`, which forks `cat`), and SIGKILL to `child`'s
    // pid alone never reaches children that are already running — only the whole
    // tree does. `detached: true` + negative-pid kill would normally be how a test
    // reaps a subtree like this, but `detached` is hard-refused repo-wide (T-450
    // Rule 6, packages/gui/tests/isolation-rules.cjs), so `killProcessTree` walks
    // `ps` instead. It runs in `finally` so it fires whether the assertion below
    // passes, fails, or throws — an early return must still reap (T-579 leak fix:
    // killing only `child` left the inner shell and its `cat` running past the
    // test, orphaned onto init).
    const child = spawn('bash', ['-c', cmdNoRedirect], { stdio: ['pipe', 'pipe', 'pipe'] })
    try {
      const stillBlocked = await new Promise<boolean>((resolve) => {
        let exited = false
        child.on('exit', () => { exited = true })
        setTimeout(() => resolve(!exited), 1500)
      })
      expect(stillBlocked).toBe(true)
    } finally {
      if (child.pid) killProcessTree(child.pid)
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        try { process.kill(child.pid, 'SIGKILL') } catch { /* already gone */ }
      }
      // Wait for the actual reap of the direct child (not just the signal) so
      // nothing outlives this test — but never hang the suite if it is already gone.
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve()
        child.once('exit', () => resolve())
        setTimeout(resolve, 1000)
      })
    }
  })
})
