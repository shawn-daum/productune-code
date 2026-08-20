/**
 * real-home-tripwire.ts — T-450. Typed surface over the tripwire.
 *
 * The implementation moved to `real-home-tripwire.cjs`. This file is a thin typed
 * re-export; there is deliberately no second copy of the logic.
 *
 * WHY THE MOVE (T-450 R2)
 *
 * Same reason `isolation-rules.cjs` is CJS, arrived at the same way — by
 * measurement rather than by preference.
 *
 * The floor has to be ARMED at config module scope, in every runner, because that
 * is the only point earlier than a `globalSetup` mutation (S3: a globalSetup that
 * deleted the real home was invisible to the reporter's `onBegin`, and the run
 * reported "real home unchanged"). But `vitest.config.ts` is bundled by esbuild
 * before it is evaluated, and a `require()` inside a bundled dependency becomes a
 * dynamic require that throws:
 *
 *     Error: Dynamic require of "fs" is not supported
 *
 * So a `.ts` module that reaches the rules through `require('./isolation-rules.cjs')`
 * is unreachable from exactly the place the baseline has to be taken. The vitest
 * configs load `real-home-tripwire.cjs` directly through `createRequire`, with no
 * bundler and no transform in the way; Playwright's config, the reporter, the
 * globalTeardown and the guard spec use this typed view.
 *
 * The full rationale for WHICH surfaces are watched, why that set is sufficient,
 * and the two premises QA refuted by measurement lives in the `.cjs` header. It is
 * not duplicated here.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

export interface SurfaceDigest {
  /** Number of filesystem entries seen. */
  count: number
  /** sha1 over every entry's detail line, sorted. */
  hash: string
}

export interface HomeSnapshot {
  takenAt: number
  realHome: string
  perSurface: Record<string, SurfaceDigest>
  /**
   * One line per entry, kept so a drift can be reported as a real diff. The
   * fields after the path are the surface's RECORDING MODE: `size\tmtime` by
   * default, `size` alone for a size-only surface, the literal `name-only` inside
   * a name-only subtree, `exists=false` for an absent surface.
   */
  detail: string[]
  /** Set when the entry budget ran out, i.e. the fingerprint is INCOMPLETE. */
  truncated?: string
}

export interface SurfaceDrift {
  surface: string
  added: string[]
  removed: string[]
}

export interface ArmResult {
  armed: boolean
  reason: string
  runId?: string
}

export interface VerifyResult {
  ok: boolean
  /** Empty when ok. */
  report: string
  drift: SurfaceDrift[]
}

export interface VerifyOptions {
  /**
   * Delete the baseline and persist the final fingerprint for the next run's
   * warning. TRUE for a once-per-run verdict (Playwright's `globalTeardown`).
   *
   * FALSE for vitest, whose verdict is a per-test-FILE `afterAll` — it runs once
   * per file, in parallel workers, so a consuming check would delete the baseline
   * after the first file and every later file would then report "never armed".
   */
  consume?: boolean
}

interface TripwireImpl {
  tripwireNameOnlySubtrees(): string[]
  tripwireSizeOnlyPaths(): string[]
  tripwireExcludedSubtrees(): string[]
  tripwireSurfaces(): string[]
  snapshotRealHome(): HomeSnapshot
  diffSnapshots(before: HomeSnapshot, after: HomeSnapshot): SurfaceDrift[]
  formatDrift(drift: SurfaceDrift[], culprit?: string): string
  tripwireDisabled(): boolean
  readArmedBaseline(): HomeSnapshot | null
  armTripwire(label: string): ArmResult
  verifyTripwire(options?: VerifyOptions): VerifyResult
  assertTripwireClean(where: string, options?: VerifyOptions): void
}

const impl = require('./real-home-tripwire.cjs') as TripwireImpl

/**
 * Subtrees fingerprinted in NAME-ONLY mode (T-450 R3 / F3, QA R3 / B2): removals
 * and renames are drift, size/mtime and additions are not — the shape of their
 * legitimate writers, `packages/core/src/git-workflow/autosave.ts` and prdt's
 * `hooks/prdt-auto-open.sh`. A full exclusion here was QA R2's laundering channel.
 */
export const tripwireNameOnlySubtrees = (): string[] => impl.tripwireNameOnlySubtrees()

/**
 * File surfaces fingerprinted in SIZE-ONLY mode (QA R3 / B1): creation, deletion
 * and any byte-length change are drift, an equal-length in-place rewrite is not —
 * the shape of a sanctioned `launchApp()` flushing NSUserDefaults.
 */
export const tripwireSizeOnlyPaths = (): string[] => impl.tripwireSizeOnlyPaths()

/**
 * Subtrees DROPPED from the walk entirely (T-491): no line for the root or
 * anything under it. Currently only `~/.prdt/run/` — the call-governor hook's
 * own counter directory, tooling-owned per contracts §Return envelope
 * (2026-08-20) and rewritten on every tool call of the governed session
 * running the suite itself. Name-only mode does not suffice here because it
 * still treats a removal as drift, and this writer's whole repertoire is
 * create-then-remove.
 */
export const tripwireExcludedSubtrees = (): string[] => impl.tripwireExcludedSubtrees()
export const tripwireSurfaces = (): string[] => impl.tripwireSurfaces()
export const snapshotRealHome = (): HomeSnapshot => impl.snapshotRealHome()
export const diffSnapshots = (before: HomeSnapshot, after: HomeSnapshot): SurfaceDrift[] =>
  impl.diffSnapshots(before, after)
export const formatDrift = (drift: SurfaceDrift[], culprit?: string): string =>
  impl.formatDrift(drift, culprit)
export const tripwireDisabled = (): boolean => impl.tripwireDisabled()
export const readArmedBaseline = (): HomeSnapshot | null => impl.readArmedBaseline()
export const armTripwire = (label: string): ArmResult => impl.armTripwire(label)
export const verifyTripwire = (options?: VerifyOptions): VerifyResult => impl.verifyTripwire(options)
export const assertTripwireClean = (where: string, options?: VerifyOptions): void =>
  impl.assertTripwireClean(where, options)
