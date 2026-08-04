/**
 * isolation-realm-bootstrap.cjs — T-450. The rules, carried into a NEW REALM.
 *
 * A module patch is per-realm, not per-process. That single fact is what QA R3
 * used to get a GREEN Playwright run while the real userData grew
 * `SingletonLock`, `SingletonSocket` and `SingletonCookie`: a `worker_threads`
 * worker has its own module cache, so the launcher and child-process patches
 * installed by `playwright.config.ts` were simply absent inside it. A spawned
 * node grandchild has the same property, for the same reason.
 *
 * This file is what gets handed to those realms:
 *
 *   • `worker_threads`  →  `new Worker(f, { execArgv: ['--require', <this>] })`
 *   • spawned `node`    →  `NODE_OPTIONS=--require "<this>"`, which Node then
 *                          propagates to grandchildren on its own (measured)
 *   • `fork()`          →  `execArgv: ['--require', <this>]`
 *
 * It must stay loadable by a BARE `node --require`: no TypeScript, no bundler,
 * no Playwright. That is the whole reason the rules live in
 * `isolation-rules.cjs` rather than in the `.ts` file that re-exports them.
 *
 * A failure to install is reported LOUDLY on stderr rather than swallowed. A
 * silent install failure would recreate exactly the condition this ticket
 * exists to remove: enforcement that is absent while the run looks fine.
 */

'use strict'

try {
  require('./isolation-rules.cjs').installIsolationEnforcer()
} catch (err) {
  process.stderr.write(
    `\nT-450 ISOLATION BOOTSTRAP FAILED in pid ${process.pid}\n` +
      `This realm is running WITHOUT the isolation rules. Treat any green result\n` +
      `from it as unproven.\n${err && err.stack ? err.stack : String(err)}\n\n`,
  )
}
