/**
 * real-home-tripwire-reporter.ts — T-450. ATTRIBUTION, not the floor.
 *
 * WHAT THIS FILE IS NOT, ANY MORE
 *
 * R1 made this reporter the whole guarantee, on the reasoning that a reporter is
 * the only Playwright hook that sees every test without the spec cooperating.
 * That reasoning was right about COVERAGE and wrong about DURABILITY, and QA broke
 * it twice:
 *
 *   S3  `onBegin` — the earliest reporter callback — fires AFTER `globalSetup`. A
 *       globalSetup that deleted the real home was completely invisible: exit 0,
 *       "real home unchanged", home actually gone.
 *   S4  `--reporter=line` REPLACES the config's reporter array, so one everyday
 *       flag silently removed the entire floor. The tell was already visible in
 *       R1's own code: `PRODUCTUNE_TRIPWIRE=off` announces itself loudly, and a
 *       mechanism that can be removed more quietly than the documented off-switch
 *       is not a floor.
 *
 * So the guarantee moved to `real-home-tripwire.ts`:
 *   • ARM at `playwright.config.ts` MODULE SCOPE — earlier than globalSetup, and
 *     earlier than any reporter exists;
 *   • VERDICT in `real-home-tripwire-teardown.ts`, wired as `globalTeardown` — a
 *     config field with no CLI override, and a throw there exits 1 even when
 *     every test passed (measured).
 *
 * WHAT IT STILL DOES, AND WHY IT IS WORTH KEEPING
 *
 * Naming the individual test a mutation can be blamed on. The verdict can only say
 * "somewhere in this run"; this says "first observed after <test>", which is the
 * difference between a usable report and a bisect. It is a convenience layer over
 * a guarantee that no longer depends on it — if a flag removes this reporter, the
 * run still fails, with a less specific message.
 *
 *   onBegin     adopt the baseline armed by the config (never take a new one)
 *   onTestEnd   re-fingerprint, attribute the first drift to that test, re-baseline
 *   onEnd       force `failed` too, so the failure is visible in the reporter's own
 *               summary rather than only in the teardown error
 *
 * `PRODUCTUNE_TRIPWIRE=off` disarms the whole mechanism, loudly. It exists for ONE
 * caller: PART 2 of `scripts/verify-isolation-bypass-matrix.sh`, whose negative
 * control has to show today's behaviour (green while mutating) in order to
 * demonstrate that the tripwire changes it. (T-450 / S15: this comment used to
 * point at `scripts/verify-real-home-tripwire.sh`, which has never existed.)
 */

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import {
  diffSnapshots,
  formatDrift,
  readArmedBaseline,
  snapshotRealHome,
  tripwireDisabled,
} from './real-home-tripwire'
import type { HomeSnapshot, SurfaceDrift } from './real-home-tripwire'

const DISABLED = tripwireDisabled()

export default class RealHomeTripwireReporter implements Reporter {
  private baseline: HomeSnapshot | null = null
  private readonly drifts: Array<{ culprit: string; drift: SurfaceDrift[] }> = []
  private failedToSnapshot: string | null = null

  /** Reporters must not swallow the run; a broken tripwire is reported, not fatal. */
  private snapshot(): HomeSnapshot | null {
    try {
      return snapshotRealHome()
    } catch (err) {
      this.failedToSnapshot = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    if (DISABLED) return // armTripwire() already said so, loudly, at config scope
    // ADOPT the config-scope baseline rather than taking a fresh one. Taking one
    // here is what made S3 invisible: anything globalSetup did would be folded
    // into a "new normal" before the first test ran.
    this.baseline = readArmedBaseline() ?? this.snapshot()
  }

  onTestEnd(test: TestCase, _result: TestResult): void {
    if (DISABLED || !this.baseline) return
    const after = this.snapshot()
    if (!after) return
    const drift = diffSnapshots(this.baseline, after)
    if (drift.length > 0) {
      this.drifts.push({ culprit: test.titlePath().filter(Boolean).join(' › '), drift })
      // Re-baseline: the point is to name the FIRST test that moved each surface,
      // not to report every subsequent test as a mutator of the same change.
      this.baseline = after
    }
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
    if (DISABLED) return
    if (this.failedToSnapshot) {
      process.stdout.write(
        `\nT-450 TRIPWIRE COULD NOT RUN: ${this.failedToSnapshot}\n` +
          `Failing the run — an unarmed tripwire must not read as a clean one.\n\n`,
      )
      return { status: 'failed' }
    }
    if (!this.baseline) return

    // No final sweep here: `globalTeardown` runs after this and takes the
    // authoritative last fingerprint against the config-scope baseline. Sweeping
    // twice would report the same drift twice.
    if (this.drifts.length === 0) return

    for (const { culprit, drift } of this.drifts) process.stdout.write(formatDrift(drift, culprit))
    process.stdout.write(
      `T-450 real-home tripwire: ${this.drifts.length} mutation event(s) attributed. ` +
        `Run status forced to failed (tests reported: ${result.status}).\n`,
    )
    return { status: 'failed' }
  }
}
