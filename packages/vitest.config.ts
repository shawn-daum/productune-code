// prdt-vitest-guard (track merge skips this config: not a package)
// T-1417: the same refusal as ../vitest.config.ts, here because vitest 5
// (what `npx vitest` fetches when this directory has no local install) looks
// for a config in the cwd only, not upward. Importing it runs its throw.
import '../vitest.config'
