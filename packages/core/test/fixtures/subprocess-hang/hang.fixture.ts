// T-1478 fixture: a hook that never exits, launched the way 207 calls in this
// package launch one — `spawnSync` with a JSON event on stdin and NO `timeout:`.
// Its test must fail at its own budget; the test after it must still run.
import { spawnSync } from 'node:child_process'
import { test, expect } from 'vitest'

const BUDGET_MS = Number(process.env.T1478_TEST_BUDGET_MS)

test('a hook that never exits', () => {
  const r = spawnSync('bash', ['-c', 'cat >/dev/null; exec python3 -c "import time; time.sleep(600)"'], {
    input: '{"hook_event_name":"Stop"}',
    encoding: 'utf8',
  })
  expect(r.status).toBe(0)
}, BUDGET_MS)

test('the test after it still runs', () => {
  expect(1 + 1).toBe(2)
})
