/**
 * shared/todo-item.ts — the ONE declaration of a user-todo wire item (T-434 F8).
 *
 * A todo item crosses the process boundary on `po:todo-items` and, in a
 * different shape, on `po:user-verify`. Before this file, its type was written
 * out three times — `electron/po-runner.ts`, `electron/preload.ts`,
 * `src/store/useUserTodo.ts` — and TWO of those places also copied the object
 * field by field at runtime.
 *
 * That is not a missing field, it is a rule table with three copies, and this
 * ticket's own ADR already wrote down what happens to those: the URL router
 * lives in main precisely because "a rule table copied into the renderer will
 * drift, and a drifted router is the leak the 3-tier design exists to prevent".
 * The same sentence applies here, and the copies HAD drifted — `authIntent`
 * reached the renderer's declaration and neither of the other two, so the
 * generic producer dropped it in main before IPC even happened.
 *
 * Two properties make that unrepeatable, and both are load-bearing:
 *
 *  1. ONE type. main, preload and the renderer all import `TodoItemRaw` from
 *     here. This module has no dependencies — no electron, no zustand — so
 *     either side can take it without taking the other side's world with it.
 *
 *  2. ONE copier. A shared type alone would NOT have caught F8: every added
 *     field is optional, so an object literal that omits it still typechecks.
 *     The copy is therefore driven by `FIELD_COERCERS`, a table keyed by
 *     `keyof Required<TodoItemRaw>` — adding a field to the interface without
 *     adding it there is a COMPILE ERROR, and `coerceTodoItemRaw` walks the
 *     table rather than naming fields, so there is no second list to forget.
 *
 * The coercer doubles as the untrusted-JSON gate: PO envelope text is parsed
 * into these, so every field is checked, and anything not in the table is
 * dropped rather than carried into the store.
 *
 * ── What this shape deliberately does NOT carry (T-434 F9) ──────────────────
 *
 * There is no `authIntent` here, and its absence is a decision rather than an
 * omission. Routing tier ① — "the producer says a login stands in the way, send
 * this to the system browser without consulting the IdP allowlist" — is
 * conferred by exactly ONE producer: the envelope-level `auth_required` of a
 * worker return (contracts, QA live/smoke extras), which reaches the store on
 * the `po:user-verify` channel and is granted at `pushItems`, not read off an
 * item. See `useUserTodo.ts` and `electron/auth-route.ts` (tier ①).
 *
 * Items on THIS shape come from `manual_steps_pending[]` /
 * `pending_user_actions[]` in PO result TEXT. Two facts decide it:
 *
 *  - that array's schema is `id · description · type · href` (T-P4-113 §E) and
 *    nothing in the discipline or the product emits a per-item auth flag, so
 *    honouring one would buy no behaviour that exists today; and
 *  - PO result text is the output of an agent that reads repositories and web
 *    pages, so it is prompt-injection reachable. A field here that skips the
 *    allowlist would let injected text put an arbitrary https URL in front of
 *    the user's real browser for the price of one click.
 *
 * Note the shape of the refusal, because the opposite shape is this ticket's
 * recurring defect (F2, then F8): the field is absent from the TYPE, so no
 * assembly point has to remember to strip it and the `FIELD_COERCERS` compile
 * gate stays whole. A smuggled `authIntent` on the wire is dropped by the same
 * unknown-key rule that drops any other invented key — not by a special case.
 */

export type TodoType = 'check' | 'text-input' | 'link'

/** Raw todo item as it appears in a PO envelope and on the IPC wire. */
export interface TodoItemRaw {
  id?: string
  description: string
  type?: TodoType
  /** file path, tab id, or (T-434) an http(s) URL. */
  href?: string
}

/**
 * One coercer per field of `TodoItemRaw`, keyed so the compiler requires the
 * set to be complete. `undefined` = absent or unusable; the caller omits it.
 */
type FieldCoercers = {
  [K in keyof Required<TodoItemRaw>]: (value: unknown) => TodoItemRaw[K] | undefined
}

const FIELD_COERCERS: FieldCoercers = {
  id: (v) => (typeof v === 'string' && v ? v : undefined),
  description: (v) => (typeof v === 'string' && v ? v : undefined),
  type: (v) => (v === 'check' || v === 'text-input' || v === 'link' ? v : undefined),
  href: (v) => (typeof v === 'string' && v ? v : undefined),
}

/** Every field of `TodoItemRaw`, as values — derived, never hand-listed. */
export const TODO_ITEM_RAW_FIELDS = Object.keys(FIELD_COERCERS) as Array<keyof TodoItemRaw>

/**
 * Coerce one untrusted value into a `TodoItemRaw`, or `null` if it cannot be
 * one. This is the only place a raw todo item is assembled — main's envelope
 * parser and the renderer's store both go through it, so a field cannot be
 * present in one and missing in the other.
 *
 * `description` is the only required field; an item without it is not a todo.
 * `type` is deliberately left unset when absent rather than defaulted here —
 * the default belongs to the store, and having it in one place keeps this
 * function a pure narrowing of its input.
 */
export function coerceTodoItemRaw(input: unknown): TodoItemRaw | null {
  if (input === null || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of TODO_ITEM_RAW_FIELDS) {
    const value = FIELD_COERCERS[key](src[key])
    if (value !== undefined) out[key] = value
  }
  if (typeof out.description !== 'string') return null
  return out as unknown as TodoItemRaw
}

/** Coerce a batch, dropping anything that is not a todo item. */
export function coerceTodoItemsRaw(input: unknown): TodoItemRaw[] {
  if (!Array.isArray(input)) return []
  const out: TodoItemRaw[] = []
  for (const entry of input) {
    const item = coerceTodoItemRaw(entry)
    if (item) out.push(item)
  }
  return out
}
