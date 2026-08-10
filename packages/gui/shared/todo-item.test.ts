/**
 * todo-item.test.ts — T-434, QA finding F8
 *
 * F8 was not "a missing field", it was a rule table with three copies. The fix
 * is one declaration plus one table-driven copier; this file pins the property
 * that makes the fix worth anything — that the table covers the type.
 *
 * The guard is primarily a COMPILE-time one (`FieldCoercers` is keyed by
 * `keyof Required<TodoItemRaw>`, so a new field on the interface is an error
 * until it has a coercer). These cases are the runtime half: they fail if the
 * table is complete but the copier does not actually carry a field through,
 * which is precisely the shape that typechecked its way past review twice.
 *
 * `Required<TodoItemRaw>` in the fixture is load-bearing — a field added to the
 * interface makes this file stop compiling until the fixture names it, and then
 * the round trip below decides whether the copier really moves it.
 */

import { describe, it, expect } from 'vitest'
import {
  coerceTodoItemRaw,
  coerceTodoItemsRaw,
  TODO_ITEM_RAW_FIELDS,
  type TodoItemRaw,
} from './todo-item'

/** Every field of the wire shape, with a distinguishable value each. */
const FULL: Required<TodoItemRaw> = {
  id: 'step-1',
  description: 'log in and confirm the build',
  type: 'link',
  href: 'https://console.acme-corp.example/projects/42',
}

describe('the copier covers the type', () => {
  it('every field of TodoItemRaw survives coercion, byte for byte', () => {
    expect(coerceTodoItemRaw(FULL)).toEqual(FULL)
  })

  it('the derived field list is the type — no hand-written second list', () => {
    expect([...TODO_ITEM_RAW_FIELDS].sort()).toEqual(Object.keys(FULL).sort())
  })
})

describe('the copier is also the untrusted-JSON gate', () => {
  it('drops keys that are not fields', () => {
    const out = coerceTodoItemRaw({ ...FULL, injected: 'nope', __proto__: { x: 1 } })
    expect(out).toEqual(FULL)
  })

  it('drops values of the wrong type rather than passing them on', () => {
    const out = coerceTodoItemRaw({
      description: 'ok', id: 42, type: 'not-a-type', href: {},
    })
    expect(out).toEqual({ description: 'ok' })
  })

  it('an item with no usable description is not a todo', () => {
    for (const bad of [null, undefined, 'a string', 7, {}, { description: '' }, { description: 3 }]) {
      expect(coerceTodoItemRaw(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('`authIntent` is NOT a wire field — this shape cannot confer tier ① (F9)', () => {
    // The deliberate part of the F9 decision, asserted rather than commented.
    // Routing tier ① is conferred by the ENVELOPE-level producer the discipline
    // names (`auth_required`, QA live/smoke extras), which reaches the store on
    // its own channel. A per-item `authIntent` in `manual_steps_pending[]` is
    // not in that schema (T-P4-113 §E: id · description · type · href), no
    // producer emits one, and PO envelope text is agent output that has read
    // repos and web pages — so honouring it would hand prompt-injectable text a
    // bypass of the IdP allowlist for one user click.
    //
    // It is absent from the TYPE, so `FIELD_COERCERS`' compile gate stays whole
    // and nothing is dropped at an assembly point that claims to carry it.
    expect(TODO_ITEM_RAW_FIELDS).not.toContain('authIntent')
    for (const smuggled of [true, 'true', 1, {}, [true]]) {
      const out = coerceTodoItemRaw({ description: 'd', href: 'https://x.example/p', authIntent: smuggled })
      expect(out, JSON.stringify(smuggled)).toEqual({ description: 'd', href: 'https://x.example/p' })
      expect(out && 'authIntent' in out, JSON.stringify(smuggled)).toBe(false)
    }
  })

  it('a batch drops only the entries that fail, and keeps order', () => {
    expect(coerceTodoItemsRaw([FULL, null, { nope: 1 }, { description: 'second' }]))
      .toEqual([FULL, { description: 'second' }])
    expect(coerceTodoItemsRaw('not an array')).toEqual([])
  })
})
