/**
 * prdt doctor — the discipline↔execution verdict line (T-560).
 *
 * v1.8's acceptance bar is a single number: `prdt doctor` judges "0
 * discipline↔execution mismatches". Before this slice the tool could not
 * produce that number — it printed a flat warning list and a total, and the
 * split into families was done by a human reading 27 lines. So the bar itself
 * stood in the failure class this round exists to close: a 0 that can mean
 * "nothing found" or "nobody looked", indistinguishably.
 *
 * What is pinned here is BEHAVIOR, never wording (the ticket says so
 * explicitly, and T-525 / T-566 R4 each measured a check that broke the
 * moment a message was reworded):
 *
 *   - the counts move with the state of the repo, not with the text of any
 *     warning — introduce exactly one family violation, the violation count
 *     goes up by exactly one;
 *   - a check that could not look is NOT folded into the violation count —
 *     forcing a family check to skip moves it from `ran` to `skipped` while
 *     the roster total stays constant, and the verdict stops claiming a clean
 *     0;
 *   - membership is DECLARED per check: every roster entry carries a family
 *     from the fixed vocabulary, and a check registered without one is
 *     reported rather than silently filed in neither family.
 *
 * The machine tail on the verdict line (`[verdict=… violations=N ran=N
 * skipped=N no-evidence=N unclassified=N]`) is the contract these tests read.
 * The human half of the line is free to be rewritten.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let claudeDir: string
let projectDir: string
let disciplineDir: string

type Verdict = {
  line: string
  verdict: string
  violations: number
  ran: number
  skipped: number
  noEvidence: number
  unclassified: number
}

function runDoctor(): string {
  return execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir, CLAUDE_DIR: claudeDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  })
}

/** Parse the machine tail off the one verdict line doctor prints. Reading the
 *  tail (not the prose) is what keeps these assertions wording-independent. */
function verdict(out: string = runDoctor()): Verdict {
  const lines = out.split('\n').filter((l) => /\[verdict=/.test(l))
  expect(lines.length).toBe(1)
  const line = lines[0]
  const num = (k: string): number => {
    const m = line.match(new RegExp(`\\b${k}=(\\d+)`))
    expect(m, `${k}= missing from verdict tail: ${line}`).not.toBeNull()
    return Number(m![1])
  }
  const v = line.match(/\bverdict=([a-z-]+)/)
  expect(v, `verdict= missing from tail: ${line}`).not.toBeNull()
  return {
    line,
    verdict: v![1],
    violations: num('violations'),
    ran: num('ran'),
    skipped: num('skipped'),
    noEvidence: num('no-evidence'),
    unclassified: num('unclassified'),
  }
}

/** Every check the roster knows about, whatever state it ended in. Constant
 *  across fixtures — that is the point of asserting on it. */
function rosterTotal(v: Verdict): number { return v.ran + v.skipped + v.noEvidence }

function poStatePath(): string { return path.join(projectDir, '.prdt', 'po-state.json') }

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-verdict-'))
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  machineHome = path.join(sandbox, 'prdt-home')
  claudeDir = path.join(sandbox, 'claude')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  // An "installed machine" fixture: hooks/ present is the one signal several
  // family checks read to decide they have anything to look at (the same gate
  // hook_registration_warnings and statusline_warnings already used before
  // this slice). Its presence is what lets the skip test below REMOVE it.
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
})

afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt doctor — discipline↔execution verdict line', () => {
  test('the verdict line exists, is printed once, and its counts come from the tool', () => {
    const v = verdict()
    expect(['clean', 'violations', 'not-established']).toContain(v.verdict)
    expect(rosterTotal(v)).toBeGreaterThan(0)
    // Nothing is filed in neither family: the roster is fully declared.
    expect(v.unclassified).toBe(0)
  })

  test('one family violation moves the verdict count by exactly one', () => {
    const before = verdict()
    // `state:` is a declared member of the family, and an unexpected key is
    // worth exactly one warning line — so the delta is unambiguous. Nothing
    // about the warning's WORDING is read here; only the count moves.
    const st = JSON.parse(fs.readFileSync(poStatePath(), 'utf8'))
    st.not_a_real_field = 1
    fs.writeFileSync(poStatePath(), JSON.stringify(st, null, 2))

    const after = verdict()
    expect(after.violations).toBe(before.violations + 1)
    expect(after.verdict).toBe('violations')
    // The classification is additive: the flat warning list did not shrink.
    expect(runDoctor()).toContain('not_a_real_field')
    expect(rosterTotal(after)).toBe(rosterTotal(before))
  })

  test('a family check that cannot look is not folded into the 0', () => {
    const before = verdict()
    // Remove the install mirror the statusline / hook checks read. They then
    // have nothing to look AT — which is exactly the state that used to be
    // indistinguishable from "looked, found nothing".
    fs.rmSync(path.join(machineHome, 'hooks'), { recursive: true, force: true })

    const after = verdict()
    expect(after.skipped).toBeGreaterThan(before.skipped)
    expect(after.ran).toBeLessThan(before.ran)
    // The skipped checks did not vanish from the denominator — the roster is
    // the same size, the checks just moved states.
    expect(rosterTotal(after)).toBe(rosterTotal(before))
    // And the line does not claim a clean bill of health off a 0 it did not earn.
    if (after.violations === 0) expect(after.verdict).toBe('not-established')
    // Each skipped check is named, so the reader can see WHICH eye was closed.
    const out = runDoctor()
    expect(out.split('\n').filter((l) => /could not look/.test(l)).length).toBeGreaterThan(0)
  })

  test('no-evidence is a verdict state, not a standing no-action warning (T-523/T-564)', () => {
    // A repo that promotes by local merge: a real git repo, no pre-push hook
    // naming a PR path, no origin/main history to read. `promotion_policy`
    // calls that `no-evidence` — correct behaviour, nothing for the owner to
    // fix — and before this slice it cost a permanent warning line on every
    // single doctor run.
    const codeRoot = path.join(projectDir, 'code')
    execFileSync('git', ['init', '-q', '-b', 'dev'], { cwd: codeRoot, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q',
      '--allow-empty', '-m', 'init'], { cwd: codeRoot, stdio: 'ignore' })

    const out = runDoctor()
    const v = verdict(out)
    expect(v.noEvidence).toBeGreaterThan(0)
    // It is no longer a ⚠ line — it is the third state on the verdict line.
    expect(out.split('\n').filter((l) => l.startsWith('⚠') && /promotion path/.test(l))).toEqual([])
    // And a state of "we could not establish it" never reads as clean.
    if (v.violations === 0) expect(v.verdict).toBe('not-established')
  })

  test('T-572 ①: an unverified pre-push hook is a skip, never a violation', () => {
    // `prdt init` already installed the managed hook — overwrite it with one
    // prdt does not own, which is exactly the state the verdict misfiled
    // before T-572 (a counted `ran` warning, despite the warning's own text
    // saying "we could not verify this", never "this disagrees").
    const hookFile = path.join(projectDir, 'code', '.git', 'hooks', 'pre-push')
    const before = verdict()
    fs.writeFileSync(hookFile, '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    const out = runDoctor()
    const after = verdict(out)
    expect(after.violations).toBe(before.violations)
    expect(after.skipped).toBeGreaterThan(before.skipped)
    expect(rosterTotal(after)).toBe(rosterTotal(before))
    expect(out).toContain('could not look · main-push block')
    expect(out).toContain('main-push block UNVERIFIED')
    if (after.violations === 0) expect(after.verdict).toBe('not-established')
  })

  test('T-572 reverse fixture: a REAL main-push mismatch (hooksPath makes the block inert) still counts', () => {
    // Proves the ① reclassification did not blunt the check generally — an
    // actually-broken repo (discipline says main is blocked; git will not
    // even look at the managed hook because core.hooksPath points elsewhere
    // and nothing lives there) must still land as a violation.
    const codeRoot = path.join(projectDir, 'code')
    const before = verdict()
    const emptyHooksDir = path.join(sandbox, 'elsewhere-hooks')
    fs.mkdirSync(emptyHooksDir, { recursive: true })
    execFileSync('git', ['config', '--local', 'core.hooksPath', emptyHooksDir], { cwd: codeRoot })

    const out = runDoctor()
    const after = verdict(out)
    expect(after.violations).toBe(before.violations + 1)
    expect(after.verdict).toBe('violations')
    expect(out).toContain('main-push block INACTIVE')
  })

  test('T-572 ②: the PR-promotion-path report is real information, not a counted mismatch', () => {
    // T-506 made the discipline text say "promote by the path doctor names
    // for THIS repo" — so a repo measured to promote via PR is discipline
    // and execution AGREEING, not a mismatch, even though the line stays a
    // ⚠ finding a person reads before promoting.
    const codeRoot = path.join(projectDir, 'code')
    execFileSync('git', ['checkout', '-qb', 'main'], { cwd: codeRoot })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q',
      '--allow-empty', '-m', 'init'], { cwd: codeRoot })
    execFileSync('git', ['checkout', '-qb', 'dev'], { cwd: codeRoot })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q',
      '--allow-empty', '-m', 'work'], { cwd: codeRoot })
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: codeRoot })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'merge', '--no-ff', '-q',
      '-m', 'Merge pull request #7 from acme/dev', 'dev'], { cwd: codeRoot })

    const before = verdict()
    const out = runDoctor()
    const after = verdict(out)
    expect(out).toContain('promotion to main here goes through a PR')
    expect(out.split('\n').some((l) => l.startsWith('⚠') && /promotion to main here goes through a PR/.test(l))).toBe(true)
    // it printed, ran, but did not move the mismatch count
    expect(after.ran).toBeGreaterThan(before.ran - 1)
    expect(after.violations).toBe(before.violations)
  })

  test('membership is declared per check, and an undeclared one is surfaced', () => {
    // Structural, not textual: ask the script itself. Every roster entry must
    // carry a family from the fixed vocabulary, and the verdict function must
    // report — never silently absorb — a record whose family is not one of them.
    const probe = `
import importlib.util, importlib.machinery
# The CLI ships extensionless, so it needs an explicit source loader — and it
# guards its entry point with __name__, which is what makes importing it safe.
loader = importlib.machinery.SourceFileLoader("prdt", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
assert m.DOCTOR_FAMILIES, "no family vocabulary declared"
rec = lambda **k: dict({"name": "x", "family": m.FAMILY_DE, "state": "ran",
                        "reason": None, "warnings": []}, **k)
clean = m.doctor_verdict_lines([rec()])
assert "verdict=clean" in clean[0], clean
bad = m.doctor_verdict_lines([rec(), rec(name="mystery", family=None)])
assert "unclassified=1" in bad[0], bad
assert "verdict=clean" not in bad[0], bad
assert any("mystery" in l for l in bad), bad
# T-581: a check answered by a HUMAN record is neither ran nor skipped — it
# does not hold the verdict at not-established, but the tail counts it apart
# and a detail line names it, so "we verified" and "a person told us" never
# collapse into one number.
att = m.doctor_verdict_lines([rec(), m.doctor_record("hook", m.FAMILY_DE, m.Attested("a person read it"))])
assert "verdict=clean" in att[0], att
assert "attested=1" in att[0] and "ran=1" in att[0], att
assert any("human record" in l and "hook" in l for l in att), att
assert "attested=0" in clean[0], clean
# T-581 QA P4: the head sentence and the machine tail are one line and must
# agree. "all 2 check(s) ran" beside "ran=1" is this line contradicting itself,
# on a line whose entire purpose is that its numbers do not lie. An attested
# check was ANSWERED, not run.
assert "all 2 check(s) ran" not in att[0], att
assert "answered" in att[0] and "ran=1" in att[0] and "attested=1" in att[0], att
assert "all 1 check(s) ran" in clean[0], clean
print("ok")
`
    const out = execFileSync('python3', ['-c', probe], { encoding: 'utf-8', timeout: 30000 })
    expect(out.trim()).toBe('ok')
  })
})
