/**
 * prdt-doctor-test-setup-rebuild.test.ts — the accumulation layer of T-537.
 *
 * The rule ("expensive shared setup is built once per file and reused") lives in
 * three places: developer habit (write time), the code-review playbook (diff
 * time), and this doctor check (accumulation time). Only the third has a view of
 * the thing that actually hurt: on 2026-08-31 this repo ran install.sh 84 times
 * across 13 files, 558s of work, and EVERY diff that added one was fine on its
 * own. Cost showed up only in the sum, and no sum appears in a diff.
 *
 * What the check is, exactly: a static count of a SHAPE — N test bodies in one
 * file each OPENING with a call to the same in-file process-spawning helper.
 * Time-based checking was rejected, not deferred (doctor is a ~0.6s static
 * reader; measuring a suite means running it). So this is a heuristic, and the
 * negative set below binds as hard as the positive one — the let-throughs are
 * design, not gaps, and a check that grew teeth on them would fire on
 * subject-runners (a file whose subject IS the setup act) and be turned off.
 *
 * DIFFERENT ROUTE: every expectation is fixed by CONSTRUCTION. The fixture
 * builder is TOLD how many bodies to emit and the assertion quotes that number
 * as a literal. The test never asks the check, or a second copy of its regexes,
 * what the answer should be.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HABIT = path.join(CORE_ROOT, 'discipline', 'developer', 'habit.md')
const REVIEW = path.join(CORE_ROOT, 'discipline', 'developer', 'playbooks', 'code-review.md')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version'])

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-setuprebuild-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.8', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'test']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

function write(rel: string, body: string): void {
  const p = path.join(projectRoot, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body.endsWith('\n') ? body : body + '\n')
}

const SPAWN_HELPER = (name: string) =>
  `function ${name}(dir: string) {\n` +
  `  execFileSync('bash', ['install.sh'], { cwd: dir })\n` +
  `}`

// NOTE: this file is itself an emit-class file — it carries `execFileSync` as
// DATA, in the fixture strings below. That used to read to the check exactly
// like a call, and the only thing keeping the file from reporting itself was
// where the literals happened to sit. The check now blanks single-line string
// literals before reading, so the dodge is no longer load-bearing; the
// emit-class is pinned in the negative set instead.
const SPAWN_IMPORT = `import { execFileSync } from 'child_process'`

/** `cases` test bodies whose FIRST statement calls `helper`. The caller states
 *  the count; assertions quote it as a literal. */
function perCaseRebuild(rel: string, cases: number, helper = 'install'): void {
  const out = [SPAWN_IMPORT, SPAWN_HELPER(helper)]
  for (let i = 0; i < cases; i++) {
    out.push(`test('case ${i}', () => {`, `  ${helper}(tmp())`, `  expect(1).toBe(1)`, `})`)
  }
  write(rel, out.join('\n'))
}

/** Only this check's lines. Everything else doctor says belongs to another check. */
function setupWarnings(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
  // proof the run reached the end — silence below is then a verdict, not a crash
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n').filter(l => l.startsWith('⚠ tests:')).map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('the positive control — the shape the check exists for', () => {
  test('5 bodies opening with the same spawn-backed helper IS reported, with file, helper and count', () => {
    perCaseRebuild('test/offender.test.ts', 5)
    const w = setupWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('test/offender.test.ts (install opens 5 test bodies)')
    expect(w[0]).toContain('expensive shared setup is built once per file and reused')
  })

  test('hoisting the setup to once-per-file drives the same file to silence', () => {
    // red first (above), then the repair — the check is seen in both states
    perCaseRebuild('test/offender.test.ts', 5)
    expect(setupWarnings()).toHaveLength(1)
    const out = [SPAWN_IMPORT, SPAWN_HELPER('install'),
      `let shared: string`, `beforeAll(() => {`, `  shared = tmp()`, `  install(shared)`, `})`]
    for (let i = 0; i < 5; i++) {
      out.push(`test('case ${i}', () => {`, `  expect(read(shared)).toBe(${i})`, `})`)
    }
    write('test/offender.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('a direct spawn as the opening statement counts without any helper', () => {
    const out = [SPAWN_IMPORT]
    for (let i = 0; i < 5; i++) {
      out.push(`test('case ${i}', () => {`, `  execFileSync('bash', ['install.sh'])`, `})`)
    }
    write('test/direct.test.ts', out.join('\n'))
    expect(setupWarnings()[0]).toContain('test/direct.test.ts (<direct spawn> opens 5 test bodies)')
  })

  test('the shape is language-general, not a vitest dialect — python trips it too', () => {
    const out = ['import subprocess', '', 'def seed():', '    subprocess.run(["bash", "install.sh"])', '']
    for (let i = 0; i < 5; i++) out.push(`def test_case_${i}():`, '    seed()', '    assert True', '')
    write('test/test_seed.py', out.join('\n'))
    expect(setupWarnings()[0]).toContain('test/test_seed.py (seed opens 5 test bodies)')
  })

  test('the warning states its own limit — it counts a shape, it does not measure cost', () => {
    // acceptance: a warning that overstates itself is its own defect class
    perCaseRebuild('test/offender.test.ts', 5)
    const line = setupWarnings()[0]
    expect(line).toContain('this counts a shape, it does not measure cost')
    expect(line).toContain('a genuinely slow suite can pass unflagged')
    expect(line).toContain('subject IS the setup act')
    expect(line).toContain('deleting or weakening an assertion to clear this line is the defect')
  })

  test('doctor stays non-blocking with the check firing — exit 0, never a gate', () => {
    perCaseRebuild('test/offender.test.ts', 5)
    const r = execFileSync('python3', [PRDT_CLI, 'doctor'],
      { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
    expect(r).toContain('⚠ tests:')
    expect(r).toContain('(non-blocking)')   // execFileSync would have thrown on non-zero exit
  })
})

describe.skipIf(!CAN_RUN)('the threshold — calibrated at 5, anti-false-positive', () => {
  test('4 bodies stay silent; the 5th is what trips it', () => {
    perCaseRebuild('test/four.test.ts', 4)
    expect(setupWarnings()).toEqual([])
    perCaseRebuild('test/four.test.ts', 5)
    expect(setupWarnings()).toHaveLength(1)
  })

  test('the count is per HELPER, not per file — 4 + 4 through two helpers stays silent', () => {
    const out = [SPAWN_IMPORT]
    for (const h of ['alpha', 'beta']) {
      out.push(SPAWN_HELPER(h))
      for (let i = 0; i < 4; i++) out.push(`test('${h} ${i}', () => {`, `  ${h}(tmp())`, `})`)
    }
    write('test/split.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('the negative set — what the heuristic DELIBERATELY lets through', () => {
  // Each of these is a known blind spot named in the check's own comment block.
  // They are pinned so a later "tightening" has to argue with the reason, and so
  // nobody reads silence here as a bug.

  test('a helper that spawns nothing is not expensive — 10 bodies, silent', () => {
    const out = [`function seed(dir: string) {`, `  fs.writeFileSync(dir + '/x', 'y')`, `}`]
    for (let i = 0; i < 10; i++) out.push(`test('case ${i}', () => {`, `  seed(tmp())`, `})`)
    write('test/cheap.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('an fs-only helper does NOT inherit a spawn from a test body below it', () => {
    // The leak class, from the field: packages/gui/electron/prdt-bootstrap.test.ts.
    // The helper's body window used to run to the next DEFINITION — i.e. straight
    // through every test that followed it, the commonest layout — so one spawn
    // anywhere downstream dressed a mkdir/writeFileSync helper as spawn-backed.
    // The window now also ends at the first test opener. The pin above ("10
    // bodies, silent") could never have caught this: nothing followed it.
    const out = [SPAWN_IMPORT,
      `function seed(dir: string) {`,
      `  fs.mkdirSync(dir, { recursive: true })`,
      `  fs.writeFileSync(dir + '/x', 'y')`,
      `}`]
    for (let i = 0; i < 6; i++) {
      out.push(`test('case ${i}', () => {`, `  seed(tmp())`, `  expect(1).toBe(1)`, `})`)
    }
    // an unrelated subject-runner far below, then one more def — the exact
    // sandwich that made the window span the spawn
    out.push(`test('runs the CLI mid-body, nothing to do with seed', () => {`,
      `  const dir = arrange()`,
      `  execFileSync('bash', ['install.sh'], { cwd: dir })`,
      `  expect(1).toBe(1)`, `})`,
      `function laterHelper(): number {`, `  return 1`, `}`)
    write('test/leak.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('an opener whose call VARIES per case is the subject, not a rebuild', () => {
    // The rule is "the same setup, rebuilt per case". These 8 bodies each build
    // a DIFFERENT one, so no hoist could merge them — and the variation lives
    // only inside a string literal, which the emit-class blanking must not eat.
    const out = [SPAWN_IMPORT, SPAWN_HELPER('install')]
    for (let i = 0; i < 8; i++) {
      out.push(`test('case ${i}', () => {`, `  install({ mode: 'variant-${i}' })`, `})`)
    }
    write('test/varying.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('a test that GENERATES test code is not one that spawns — the emit-class', () => {
    // A generator carries `execFileSync` as string data and reads identically to
    // a caller. This file is that class too (see the SPAWN_IMPORT note), so
    // without this the file pinning the check is one refactor from accusing
    // itself. Single-line literals are blanked before the reader looks.
    const out = [
      `function emitSpawnFixture(dir: string) {`,
      "  const src = `import { execFileSync } from 'child_process'`",
      `  fs.writeFileSync(dir + '/gen.test.ts', src)`,
      `}`]
    for (let i = 0; i < 5; i++) {
      out.push(`test('case ${i}', () => {`, `  emitSpawnFixture(tmp())`, `})`)
    }
    write('test/emit.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('a comment naming the helper is not a call to it', () => {
    // "// no install(): this case deliberately skips the setup" is a sentence
    // about the helper, and counting it inflated a real offender's number.
    const out = [SPAWN_IMPORT, SPAWN_HELPER('install')]
    for (let i = 0; i < 8; i++) {
      out.push(`test('case ${i}', () => {`, `  // no install(): this case starts empty`,
        `  expect(1).toBe(1)`, `})`)
    }
    write('test/commented.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])

    // and the other direction: a comment ABOVE the call must not hide the call
    const withCall = [SPAWN_IMPORT, SPAWN_HELPER('install')]
    for (let i = 0; i < 5; i++) {
      withCall.push(`test('case ${i}', () => {`, `  // rebuild from scratch`,
        `  install(tmp())`, `})`)
    }
    write('test/commented.test.ts', withCall.join('\n'))
    expect(setupWarnings()[0]).toContain('test/commented.test.ts (install opens 5 test bodies)')
  })

  test('a spawn MID-body is a subject-runner, not a rebuild — the opener position is the discriminator', () => {
    // a test that arranges state and THEN runs the CLI is asserting on that run;
    // catching it would fire on every CLI test in every prdt project
    const out = [SPAWN_IMPORT]
    for (let i = 0; i < 8; i++) {
      out.push(`test('case ${i}', () => {`, `  const dir = arrange(${i})`,
        `  execFileSync('bash', ['install.sh'], { cwd: dir })`, `  expect(1).toBe(1)`, `})`)
    }
    write('test/subject.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('a rebuild routed through an IMPORTED helper slips past — the body is not in this file', () => {
    const out = [`import { install } from './helpers'`]
    for (let i = 0; i < 8; i++) out.push(`test('case ${i}', () => {`, `  install(tmp())`, `})`)
    write('test/imported.test.ts', out.join('\n'))
    write('test/helpers.ts',
      SPAWN_IMPORT + '\n' + SPAWN_HELPER('install'))
    expect(setupWarnings()).toEqual([])
  })

  test('a multi-line test signature slips past — the call is no longer the opening statement', () => {
    const out = [SPAWN_IMPORT, SPAWN_HELPER('install')]
    for (let i = 0; i < 8; i++) {
      out.push(`test(`, `  'case ${i}',`, `  () => {`, `    install(tmp())`, `  },`, `)`)
    }
    write('test/multiline.test.ts', out.join('\n'))
    expect(setupWarnings()).toEqual([])
  })

  test('a non-test file with the identical shape is not a test file', () => {
    perCaseRebuild('test/offender.test.ts', 5)
    fs.renameSync(path.join(projectRoot, 'test', 'offender.test.ts'),
      path.join(projectRoot, 'test', 'offender.ts'))
    expect(setupWarnings()).toEqual([])
  })

  test('vendored and built trees are pruned — node_modules and dist never counted', () => {
    perCaseRebuild('node_modules/pkg/thing.test.ts', 9)
    perCaseRebuild('dist/thing.test.ts', 9)
    perCaseRebuild('.cache/thing.test.ts', 9)
    expect(setupWarnings()).toEqual([])
  })

  test('a project with no test files at all is silent', () => {
    write('src/index.ts', 'export const x = 1')
    expect(setupWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('the report — one line however many files, worst first', () => {
  test('offenders are ordered by count and the tail is summarised, not dumped', () => {
    // 7 offenders by construction: counts 11, 10, 9, 8, 7, 6, 5
    const counts = [11, 10, 9, 8, 7, 6, 5]
    counts.forEach((n, i) => perCaseRebuild(`test/f${i}.test.ts`, n, `h${i}`))
    const w = setupWarnings()
    expect(w).toHaveLength(1)              // one line, never one per file
    expect(w[0]).toContain('test/f0.test.ts (h0 opens 11 test bodies)')
    expect(w[0]).toContain('test/f4.test.ts (h4 opens 7 test bodies)')
    expect(w[0]).toContain('(+2 more files)')
    expect(w[0]).not.toContain('test/f5.test.ts')
    expect(w[0].indexOf('test/f0.test.ts')).toBeLessThan(w[0].indexOf('test/f1.test.ts'))
  })
})

describe('the rule doctor counts is the rule the discipline ships', () => {
  const habit = fs.readFileSync(HABIT, 'utf-8')
  const review = fs.readFileSync(REVIEW, 'utf-8')

  test('developer habit carries the rule in general form, inside the test-first clause', () => {
    const clause = habit.split('\n').find(l => l.includes('Test-first where logic lives')) ?? ''
    expect(clause).toContain('built once per test file and reused')
    // general form: an actor on a project with no installer must read it as theirs
    for (const noun of ['installer run', 'seeded database', 'started container', 'large fixture build']) {
      expect(clause).toContain(noun)
    }
    // and the carve-out that stops speed eating correctness
    expect(clause).toContain('idempotency, first-run vs update parity, cleanup')
    expect(clause).toContain('no assertion is deleted or weakened to make a suite faster')
  })

  test('the code-review playbook lets a reviewer reach a verdict from the diff alone', () => {
    expect(review).toContain('the per-case setup call is visible in the diff itself')
    expect(review).toContain('never propose deleting or weakening an assertion for speed')
  })

  test('both files stay under their caps', () => {
    expect(habit.replace(/\n$/, '').split('\n').length).toBeLessThanOrEqual(40)   // worker_habit
    const body = review.replace(/^---\n[\s\S]*?\n---\n/, '')
    expect(body.replace(/\n$/, '').split('\n').length).toBeLessThanOrEqual(80)    // playbook_body
  })
})
