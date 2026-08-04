/**
 * real-home-tripwire-teardown.ts — T-450. THE VERDICT, for the Playwright runner.
 *
 * WHY THE VERDICT IS HERE AND NOT IN THE REPORTER
 *
 * T-450 / S4. R1 put the whole guarantee in a reporter, and `--reporter=line`
 * REPLACES the config's reporter array — so one everyday flag removed the floor
 * with no warning whatsoever. A mechanism that can be switched off more quietly
 * than the documented `PRODUCTUNE_TRIPWIRE=off` switch is not a floor.
 *
 * `globalTeardown` is a config field. Playwright has no CLI flag that overrides
 * it, and MEASURED on this repo's Playwright: a throw from globalTeardown exits
 * 1 even when `--reporter=line` is passed and every test passed. That is exactly
 * the shape of this bug — green tests, mutated machine — so it is the right
 * mechanism rather than a workaround.
 *
 * The matching baseline is armed at `playwright.config.ts` MODULE SCOPE, which is
 * earlier than `globalSetup`. That ordering is what closes S3: a globalSetup that
 * deleted the real home was invisible to the reporter's `onBegin`, and the run
 * reported "real home unchanged" while the home was gone.
 *
 * This file deliberately contains no logic of its own. Both runners share one
 * implementation in `real-home-tripwire.ts`; a second copy of the comparison is
 * how the layers drift apart.
 */

import { assertTripwireClean } from './real-home-tripwire'

export default function globalTeardown(): void {
  assertTripwireClean('playwright globalTeardown')
}
