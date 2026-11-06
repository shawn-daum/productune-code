// prdt-vitest-guard (track merge skips this config: not a package)
// T-1417: refuse a vitest run that is not rooted in a package.
//
// vitest looks for its config UPWARD from the cwd. Started from `code/` or
// `code/packages/`, it used to find none and ran the package tests bare: no
// HOME sandbox (scripts/vitest-home-sandbox.ts), no T-450 tripwire, no
// isolation bootstrap. On 2026-11-04 that happened (`cd ..` from
// packages/viewer, then `npx vitest run test/scripts`) and
// meta-backup-trigger.test.ts deleted the real ~/.prdt/prdt.env.
//
// Every package that has tests has its own vitest.config.ts, found first, so
// this file is reached only by a run with no package config. It stops that run
// before a single test file loads.
throw new Error(
  'vitest was started outside a package (cwd ' + process.cwd() + '). ' +
    'Run it from packages/core or packages/gui (or `pnpm test` here): only the ' +
    'package configs sandbox HOME, and a bare run touches the real ~/.prdt (T-1417).',
)
