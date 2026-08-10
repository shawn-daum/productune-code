/**
 * todoAuthIntent.test.ts — T-434, QA finding F2
 *
 * "`authIntent` is not preserved on user-verify todos. Clicking such a todo's
 * link later loses tier ① and falls back to the allowlist or the escape hatch."
 *
 * The bug lives in the GAP between two moments, so a test of either moment
 * alone would have passed while the product was broken:
 *
 *   t0  po:user-verify arrives carrying `authIntent` — the pane is opened with
 *       it in hand, and a todo is created.
 *   t1  minutes later the user clicks that todo. Nothing on screen still holds
 *       the payload; the only carrier left is the stored todo itself.
 *
 * So this walks the whole round trip on real code — the REAL zustand store
 * (`vi.unmock`, since vitest.setup blanket-mocks zustand for the component
 * tests) and the REAL click path — and asserts the tier the producer gave us
 * survives to `routeThenOpen`. `routeUrl` is the one seam that is stubbed,
 * because it is the observation point: what tier did the click actually spend?
 *
 * Why `openTodoHref` and not a render: this package has no jsdom and no
 * @testing-library, so an onClick is unreachable from a test (escapeHatch.test.tsx
 * documents the same constraint). The handler is therefore a plain exported
 * function of the todo, and TodoListPanel's onClick is a one-line delegation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The store under test must be the real one. vitest.setup.ts mocks `zustand`
// wholesale (`create: vi.fn(() => vi.fn())`) so component modules can be
// imported in a node env — under that mock `useUserTodo.getState` does not even
// exist, and the round trip would be untestable.
vi.unmock('zustand')

// TodoListPanel imports the workspace store at module scope. We never render,
// so a stub is enough — and it keeps this file off workspace.ts's persist path.
vi.mock('../../../store/workspace', () => ({
  useWorkspace: Object.assign(() => undefined, { getState: () => ({}) }),
  RESTORABLE_TAB_TYPES: new Set(),
}))

// The observation point: what tier reached the router?
const routeThenOpen = vi.fn(async () => 'system-browser' as const)
vi.mock('../../../lib/routeUrl', () => ({
  routeThenOpen: (...args: unknown[]) => (routeThenOpen as any)(...args),
}))

import { useUserTodo, type TodoItemRaw } from '../../../store/useUserTodo'
import { openTodoHref } from './TodoListPanel'

const VERIFY_URL = 'https://console.acme-corp.example/projects/42'

/** What poEvents' `po:user-verify` handler pushes (store/poEvents.ts). */
function userVerifyTodo(authIntent: boolean | undefined): TodoItemRaw {
  return {
    id: 'verify-T-434',
    description: 'check the deployed page',
    type: 'link',
    href: VERIFY_URL,
    authIntent,
  }
}

beforeEach(() => {
  useUserTodo.getState().resetAll()
  routeThenOpen.mockClear()
})

describe('F2 — a user-verify todo carries tier ① across the wait', () => {
  it('the store keeps `authIntent` — it is a field whitelist, not a spread', () => {
    useUserTodo.getState().pushItems([userVerifyTodo(true)])
    const todo = useUserTodo.getState().todos[0]
    expect(todo.href).toBe(VERIFY_URL)
    expect(todo.authIntent).toBe(true)
  })

  it('clicking the stored todo spends tier ①, not the allowlist', () => {
    // t0 — the event arrives and the todo is created.
    useUserTodo.getState().pushItems([userVerifyTodo(true)])
    // t1 — the user clicks. Only the stored todo is left.
    const openTab = vi.fn()
    openTodoHref(useUserTodo.getState().todos[0], openTab)

    expect(routeThenOpen).toHaveBeenCalledTimes(1)
    const [url, authIntent] = routeThenOpen.mock.calls[0] as unknown as [string, unknown]
    expect(url).toBe(VERIFY_URL)
    // The whole finding: this was `undefined`, so the click re-decided from
    // tier ② on a URL no allowlist matches — leaving tier ③ as the only way out.
    expect(authIntent).toBe(true)
  })

  it('an unflagged todo still arrives as undefined — not coerced to false', () => {
    // `false` and `undefined` route the same today, but they do not MEAN the
    // same: undefined is "the producer said nothing". Coercing would make a
    // silent producer indistinguishable from one that asserted "no login".
    useUserTodo.getState().pushItems([userVerifyTodo(undefined)])
    const todo = useUserTodo.getState().todos[0]
    expect(todo.authIntent).toBeUndefined()

    openTodoHref(todo, vi.fn())
    expect((routeThenOpen.mock.calls[0] as unknown as unknown[])[1]).toBeUndefined()
  })

  it('a non-URL href still opens a markdown tab and never touches the router', () => {
    // The file-path branch is the pre-T-434 behavior and must stay untouched.
    const openTab = vi.fn()
    openTodoHref(
      { id: 'x', description: 'read the ticket', type: 'link', href: 'docs/tickets/v1.6/T-434.md', status: 'open' },
      openTab,
    )
    expect(routeThenOpen).not.toHaveBeenCalled()
    expect(openTab).toHaveBeenCalledWith('docs/tickets/v1.6/T-434.md', 'markdown', {}, 'read the ticket')
  })
})
