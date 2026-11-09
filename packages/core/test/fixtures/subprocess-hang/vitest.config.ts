// T-1478 fixture: the REAL core config (shim · budgets · tally reporter ·
// verdicts), pointed at the one hang fixture only. Driven by
// test/subprocess-default-timeout.test.ts, never by the package run (whose
// include is `test/**/*.test.ts`).
import base from '../../../vitest.config'

export default {
  ...base,
  test: { ...base.test, include: ['test/fixtures/subprocess-hang/*.fixture.ts'] },
}
