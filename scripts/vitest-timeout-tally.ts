/**
 * vitest-timeout-tally.ts — T-649. The run's failures, sorted into TIMEOUT
 * DEATHS and ASSERTION FAILURES, printed once at the end.
 *
 * A red run on this machine has been either of two things: a regression, or a
 * busy machine. vitest's summary (`Tests 3 failed`) does not say which, and on
 * 2026-09-17 the PO read the second as the first twice in one day. This
 * reporter adds one block after the default reporter:
 *
 *   [timeouts] budget: scale 2.4 (load 9.8/14 cpus) · subprocess quick 12s …
 *   [timeouts] timeout deaths 3 (subprocess 2 · test 1 · hook 0) · assertion failures 0
 *   [timeouts]   test/scripts/x.test.ts > case name — subprocess
 *
 * "timeout deaths N · assertion failures 0" is the busy-machine signature; a
 * non-zero assertion count is the thing to read.
 *
 * Classification, per failed test case, by the FIRST error attached:
 *   subprocess  `SubprocessTimeout` (scripts/vitest-subprocess-timeout-shim.cjs)
 *   test        vitest: "Test timed out in Nms."
 *   hook        vitest: "Hook timed out in Nms." / "… hook timed out after Nms."
 *   assertion   anything else — a real failure, or an error this run cannot
 *               tell from one
 *
 * This is NOT a floor: `--reporter=<x>` on the CLI replaces the config's
 * reporter list and this block goes with it. The run's exit code is unchanged
 * either way. The floor that must survive every flag is the T-450 verdict in
 * vitest-real-home-verdict.ts, and this file does not touch it.
 *
 * The timeouts module is INJECTED (constructor argument) rather than required
 * here: the config file is bundled by esbuild, so a `createRequire` in this
 * module would resolve relative to the wrong file.
 */

import type { Reporter, TestCase, TestModule } from 'vitest/node'

export type TimeoutKind = 'subprocess' | 'test' | 'hook'
export type FailureKind = TimeoutKind | 'assertion'

interface TimeoutsModule {
  describe(): string
  maxWorkers(): number
}

interface ErrorLike {
  name?: string
  message?: string
}

const TEST_TIMED_OUT = /^Test timed out in \d+ms/
const HOOK_TIMED_OUT = /^Hook timed out in \d+ms|hook timed out after \d+ms/

export function classify(errors: ReadonlyArray<ErrorLike> | undefined): FailureKind {
  const first = errors?.[0]
  if (!first) return 'assertion'
  const message = first.message ?? ''
  if (first.name === 'SubprocessTimeout' || message.includes('[SUBPROCESS TIMEOUT]')) return 'subprocess'
  if (TEST_TIMED_OUT.test(message)) return 'test'
  if (HOOK_TIMED_OUT.test(message)) return 'hook'
  return 'assertion'
}

interface Row {
  file: string
  name: string
  kind: FailureKind
}

export class TimeoutTallyReporter implements Reporter {
  private readonly timeouts: TimeoutsModule
  private readonly out: (line: string) => void

  constructor(timeouts: TimeoutsModule, out: (line: string) => void = (l) => process.stdout.write(`${l}\n`)) {
    this.timeouts = timeouts
    this.out = out
  }

  onTestRunStart(): void {
    this.out(`[timeouts] budget: ${this.timeouts.describe()} · maxWorkers ${this.timeouts.maxWorkers()}`)
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const rows: Row[] = []
    for (const mod of testModules) {
      for (const tc of mod.children.allTests('failed')) rows.push(this.row(mod, tc))
    }
    const count = (k: FailureKind) => rows.filter((r) => r.kind === k).length
    const deaths = count('subprocess') + count('test') + count('hook')
    this.out(`[timeouts] budget: ${this.timeouts.describe()}`)
    this.out(
      `[timeouts] timeout deaths ${deaths} (subprocess ${count('subprocess')} · test ${count('test')} · hook ${count('hook')})` +
        ` · assertion failures ${count('assertion')}`,
    )
    for (const r of rows) this.out(`[timeouts]   ${r.file} > ${r.name} — ${r.kind}`)
  }

  private row(mod: TestModule, tc: TestCase): Row {
    return { file: mod.relativeModuleId, name: tc.fullName, kind: classify(tc.result().errors) }
  }
}
