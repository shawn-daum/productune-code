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
 */

export type TodoType = 'check' | 'text-input' | 'link'

/** Raw todo item as it appears in a PO envelope and on the IPC wire. */
export interface TodoItemRaw {
  id?: string
  description: string
  type?: TodoType
  /** file path, tab id, or (T-434) an http(s) URL. */
  href?: string
  /**
   * T-434 routing tier ①: the producer telling us a login stands in the way of
   * this href. Carried on the ITEM because a todo outlives the event that
   * created it — the link is clicked minutes later, when nothing else still
   * holds the producer's verdict, and re-deciding from tiers ②/③ at that point
   * is a downgrade of an answer we already had.
   *
   * `undefined` means the producer said nothing, which is not the same as
   * `false` ("no login here") — never coerce one into the other.
   */
  authIntent?: boolean
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
  authIntent: (v) => (typeof v === 'boolean' ? v : undefined),
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
