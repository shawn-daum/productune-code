/**
 * todoAuthIntent.test.ts — T-434, QA findings F2 · F7 · F8
 *
 * Routing tier ① (`authIntent`) has now been dropped THREE times in this
 * ticket, always the same way: a field falls off at an assembly point that
 * copies its inputs by hand, while every type involved still says the field
 * exists. F2 was the store's whitelist. F8 was a second whitelist one layer up
 * in main. F7 is why neither was caught — the test started from a fixture
 * COPIED from the object literal it was supposed to be checking, so reverting
 * the literal left the suite green.
 *
 * So this file starts where the data really starts: the PO's own envelope text.
 * From there it runs the product's real code the whole way to the click —
 *
 *   envelope text
 *     → parseQaEnvelope / parseTodoItems   (electron/po-runner.ts)
 *     → dispatchQaEnvelope                 — auth_required becomes tier ①
 *     → emitToWebContents(wc).onX          — the wire payload, main's own
 *     → [ IPC ]                            — `wc` below forwards to the
 *                                            listener preload would have called
 *     → poEvents' registered handler       (src/store/poEvents.ts, REAL)
 *     → useUserTodo.pushItems              (REAL zustand store)
 *     → …minutes pass; nothing but the stored todo still holds the payload…
 *     → openTodoHref                       (the click)
 *     → routeThenOpen                      — the observation point: which tier
 *                                            did the click actually spend?
 *
 * Every hop on that list is live code. Reverting any ONE of them fails a test
 * here — which is the property F7 asked for and the previous version lacked.
 *
 * The two producers are covered separately because they are separate code
 * paths that both had to be fixed: `po:user-verify` (F2) and the generic
 * `po:todo-items` (F8).
 *
 * Stubbed, and why:
 *   - `routeThenOpen` — the observation point. Stubbing it is the measurement.
 *   - `electron/notifications` — `emitToWebContents.onQaLoopUpdate` fires an OS
 *     notification on a `pass` envelope; the electron stub has no Notification.
 *   - the sibling stores poEvents also binds — irrelevant to this chain, and
 *     `workspace` drags in a persist/sessionStorage path.
 * `useUserTodo` is deliberately NOT stubbed: it is a hop under test.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// The stores on this chain must be the real ones. vitest.setup.ts mocks
// `zustand` wholesale (`create: vi.fn(() => vi.fn())`) so component modules can
// be imported in a node env — under that mock `useUserTodo.getState` does not
// even exist, and the round trip would be untestable.
vi.unmock('zustand')

vi.mock('../../../store/workspace', () => ({
  useWorkspace: Object.assign(() => undefined, {
    getState: () => ({ openTab: vi.fn(), inFlightKind: 'po' }),
    setState: vi.fn(),
  }),
  RESTORABLE_TAB_TYPES: new Set(),
}))

vi.mock('../../../../electron/notifications', () => ({
  fireNotification: vi.fn(() => false),
}))

// The observation point: what tier reached the router?
const routeThenOpen = vi.fn(async () => 'system-browser' as const)
vi.mock('../../../lib/routeUrl', () => ({
  routeThenOpen: (...args: unknown[]) => (routeThenOpen as any)(...args),
}))

import { useUserTodo, type UserTodo } from '../../../store/useUserTodo'
import { openTodoHref } from './TodoListPanel'

// ── The IPC seam ─────────────────────────────────────────────────────────────
//
// poEvents registers ONCE, at module evaluation, against `window.api`. So the
// bridge has to exist before it is imported — hence the dynamic import below.
// Each bridge records the handler poEvents installs; `wc.send` then delivers to
// it, which is exactly what preload's `ipcRenderer.on(channel, e, p) => cb(p)`
// forwarding does. Nothing between main's `send` and the renderer's handler is
// re-implemented here, and nothing is copied from either side.

const handlers: Record<string, (payload: any) => void> = {}
const bridge = (channel: string) => (cb: (payload: any) => void) => {
  handlers[channel] = cb
  return () => { delete handlers[channel] }
}

;(globalThis as any).window = {
  api: {
    // poEvents' own guard: no poOnToken → it assumes browser dev mode and binds
    // nothing at all. Every other bridge is optional-chained.
    poOnToken: bridge('po:onToken'),
    poOnTodoItems: bridge('po:todo-items'),
    onUserVerify: bridge('po:user-verify'),
    onBrowserOpen: bridge('po:browser-open'),
    onQaLoopUpdate: bridge('po:qa-loop-update'),
  },
}

/** A WebContents as far as the emit layer is concerned. */
const wc = {
  send: (channel: string, ...args: any[]) => { handlers[channel]?.(args[0]) },
} as any

type PoRunner = typeof import('../../../../electron/po-runner')
let poRunner: PoRunner
let emit: ReturnType<PoRunner['emitToWebContents']>

beforeAll(async () => {
  poRunner = await import('../../../../electron/po-runner')
  // Registers the real handlers against the bridge above (module side effect).
  await import('../../../store/poEvents')
  emit = poRunner.emitToWebContents(wc)
})

const VERIFY_URL = 'https://console.acme-corp.example/projects/42'

/**
 * A prdt-qa return envelope as the worker actually emits it: QA passed, there
 * is a URL for the user to look at, and `auth_required` says a login stands in
 * the way of looking at it. That last field is the ONLY place tier ① comes
 * from — everything downstream is carrying it, not deciding it.
 */
function qaEnvelopeText(opts: { authRequired: boolean }): string {
  return '```json\n' + JSON.stringify({
    persona: 'prdt-qa',
    task: 'T-434',
    summary: '델타 QA',
    confidence: 'high',
    ticket_id: 'T-434',
    qa_status: 'pass',
    verify_url: VERIFY_URL,
    verify_description: 'check the deployed page',
    ...(opts.authRequired
      ? { auth_required: { service: 'GitHub', instruction: '로그인 후 계속', type: 'login' } }
      : {}),
  }) + '\n```'
}

/** A PO envelope on the OTHER producer — the generic `po:todo-items` channel. */
function todoEnvelopeText(...items: Record<string, unknown>[]): string {
  return '```json\n' + JSON.stringify({ manual_steps_pending: items }) + '\n```'
}

function storedTodo(id: string): UserTodo {
  const todo = useUserTodo.getState().todos.find((t) => t.id === id)
  if (!todo) throw new Error(`no todo ${id} in store — an earlier hop dropped it`)
  return todo
}

/**
 * t0 — what the pane opened by the arriving event was routed with. This leg
 * was never the broken one (the payload is still in hand here), and it is
 * cleared afterwards so the click below is observed on its own.
 */
function paneRoutingAtArrival(): { url: unknown; authIntent: unknown } {
  expect(routeThenOpen, 'no pane was routed on arrival').toHaveBeenCalledTimes(1)
  const [url, authIntent] = routeThenOpen.mock.calls[0] as unknown as [unknown, unknown]
  routeThenOpen.mockClear()
  return { url, authIntent }
}

/** t1 — the click, minutes later. Returns the args the router was spent with. */
function clickAndObserve(todo: UserTodo): { url: unknown; authIntent: unknown } {
  openTodoHref(todo, vi.fn())
  expect(routeThenOpen, 'the click never reached the router').toHaveBeenCalledTimes(1)
  const [url, authIntent] = routeThenOpen.mock.calls[0] as unknown as [unknown, unknown]
  return { url, authIntent }
}

beforeEach(() => {
  useUserTodo.getState().resetAll()
  routeThenOpen.mockClear()
})

// ── Producer 1: po:user-verify (F2 · F7) ─────────────────────────────────────

describe('a user-verify todo carries tier ① from the envelope to the click', () => {
  it('auth_required → click spends tier ①, across every hop', () => {
    const env = poRunner.parseQaEnvelope(qaEnvelopeText({ authRequired: true }))
    expect(env, 'envelope did not parse — the test never started').not.toBeNull()

    // t0 — main fans the envelope out and the wire payload crosses to poEvents,
    // which routes a pane for it immediately, while the payload is still live.
    poRunner.dispatchQaEnvelope(env!, emit)
    expect(paneRoutingAtArrival()).toEqual({ url: VERIFY_URL, authIntent: true })

    // t1 — that pane is long gone. Only the stored todo is left.
    const { url, authIntent } = clickAndObserve(storedTodo('verify-T-434'))
    expect(url).toBe(VERIFY_URL)
    // The finding, three times over: this arrived as `undefined`, so the click
    // re-decided from tier ② on a URL no allowlist matches — leaving tier ③,
    // the escape hatch, as the only way to a browser that can serve a passkey.
    expect(authIntent).toBe(true)
  })

  it('no auth_required → an explicit false, because THIS producer always speaks', () => {
    // Measured, and worth naming: `dispatchQaEnvelope` derives tier ① as
    // `!!auth_required`, so a QA envelope without the key does not stay silent
    // — it asserts `false`. The store then carries that faithfully.
    //
    // The F2 round wrote "undefined rather than false when the producer said
    // nothing" and pinned it with a hand-written `undefined` fixture. On this
    // producer that shape never occurs; the fixture proved a property of
    // itself. (Routing is identical for false and undefined — auth-route.ts
    // tests `=== true` — so nothing user-facing turns on it. The distinction
    // that IS real belongs to the other producer, asserted below.)
    const env = poRunner.parseQaEnvelope(qaEnvelopeText({ authRequired: false }))
    poRunner.dispatchQaEnvelope(env!, emit)
    expect(paneRoutingAtArrival()).toEqual({ url: VERIFY_URL, authIntent: false })

    const todo = storedTodo('verify-T-434')
    expect(todo.authIntent).toBe(false)
    expect(clickAndObserve(todo).authIntent).toBe(false)
  })
})

// ── Producer 2: po:todo-items (F8) ───────────────────────────────────────────

describe('the generic todo-items producer carries tier ① too', () => {
  it('an item flagged in the PO envelope survives main, IPC, the store, the click', () => {
    // F8: main had its OWN TodoItemRaw and its own hand-built `.map()`, so this
    // path dropped `authIntent` BEFORE the IPC send — upstream of everything F2
    // fixed, and untouched by the guard comment F2 left on the store.
    const items = poRunner.parseTodoItems(todoEnvelopeText({
      id: 'step-1',
      description: 'log in to the deploy dashboard and confirm the build',
      type: 'link',
      href: VERIFY_URL,
      authIntent: true,
    }))
    expect(items, 'the parser returned nothing — the test never started').toHaveLength(1)

    emit.onTodoItems(items)

    const { url, authIntent } = clickAndObserve(storedTodo('step-1'))
    expect(url).toBe(VERIFY_URL)
    expect(authIntent).toBe(true)
  })

  it('a silent item stays undefined — not coerced to false — and junk is dropped', () => {
    // This is the producer where "said nothing" is a real, reachable state:
    // an envelope item simply has no `authIntent` key. It must not become
    // `false`, which would make silence indistinguishable from an assertion.
    const items = poRunner.parseTodoItems(todoEnvelopeText(
      { id: 'silent', description: 'read the ticket', type: 'link', href: VERIFY_URL },
      {
        id: 'junk', description: 'junk item', type: 'link', href: VERIFY_URL,
        authIntent: 'yes-please',      // not a boolean — must not become truthy
        injected: { toString: 'nope' }, // not a field — must not reach the store
      },
    ))
    expect(items, 'the parser returned nothing — the test never started').toHaveLength(2)
    emit.onTodoItems(items)

    const silent = storedTodo('silent')
    expect(silent.authIntent).toBeUndefined()
    expect(clickAndObserve(silent).authIntent).toBeUndefined()

    const junk = storedTodo('junk')
    expect(junk.authIntent).toBeUndefined()
    expect((junk as unknown as Record<string, unknown>).injected).toBeUndefined()
  })
})

// ── The branch that must not have moved ──────────────────────────────────────

describe('non-URL hrefs are untouched by any of this', () => {
  it('a file path still opens a markdown tab and never reaches the router', () => {
    const openTab = vi.fn()
    openTodoHref(
      {
        id: 'x', description: 'read the ticket', type: 'link',
        href: 'docs/tickets/v1.6/T-434.md', status: 'open',
      },
      openTab,
    )
    expect(routeThenOpen).not.toHaveBeenCalled()
    expect(openTab).toHaveBeenCalledWith('docs/tickets/v1.6/T-434.md', 'markdown', {}, 'read the ticket')
  })
})
