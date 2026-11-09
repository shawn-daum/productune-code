// T-1478 fixture (named hang.vitest.ts, NOT vitest.config.*: `prdt track merge`
// treats any dir holding a vitest.config.* as a package to run): the REAL core config (shim · budgets · tally reporter ·
// verdicts), pointed at the one hang fixture only. Driven by
// test/subprocess-default-timeout.test.ts, never by the package run (whose
// include is `test/**/*.test.ts`).
import base from '../../../vitest.config'

export default {
  ...base,
  test: { ...base.test, include: ['test/fixtures/subprocess-hang/*.fixture.ts'] },
}
