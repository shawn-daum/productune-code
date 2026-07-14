/**
 * po-runner.health.test.ts — T-355 regression.
 *
 * Two 'delegating' events are sent to the renderer for a single dispatch:
 * handleToolUseHealth's generic detail-less ping (fires first, before the
 * subagent_type is known) immediately followed by the persona-carrying
 * re-emit at the tool_use's subagent_type check (po-runner.ts ~1696). Before
 * this fix, emitHealth unconditionally overwrote `ctx.lastDelegatedPersona`
 * to null whenever detail was absent — so a LATER, unrelated detail-less ping
 * (e.g. a second tool_use for the SAME still-running dispatch, or a lifecycle
 * envelope that doesn't carry subagent_type) would pass the persona-aware
 * dedupe check again (null === null) and re-emit a persona-less event,
 * clobbering the renderer's already-known worker name. `emitHealth` must keep
 * the last REAL persona sticky across detail-less pings.
 */

import { describe, it, expect } from 'vitest'
import { emitHealth, makeHealthCtx } from './po-runner'
import type { PoHealthEvent } from './po-runner'

function makeCb() {
  const events: PoHealthEvent[] = []
  return {
    events,
    cb: { onHealth: (event: PoHealthEvent) => events.push(event) } as any,
  }
}

describe('emitHealth — delegating persona stickiness (T-355)', () => {
  it('a detail-less ping followed by the persona-carrying one emits the real persona', () => {
    const ctx = makeHealthCtx('m1')
    const { events, cb } = makeCb()

    emitHealth('delegating', undefined, ctx, cb)
    emitHealth('delegating', { persona: 'prdt-developer', task: 'fix bug' }, ctx, cb)

    expect(events).toHaveLength(2)
    expect(events[1].detail?.persona).toBe('prdt-developer')
    expect(ctx.lastDelegatedPersona).toBe('prdt-developer')
  })

  it('a LATER detail-less ping (same still-running dispatch) does not blank the known persona', () => {
    const ctx = makeHealthCtx('m1')
    const { cb } = makeCb()

    emitHealth('delegating', undefined, ctx, cb)
    emitHealth('delegating', { persona: 'prdt-developer' }, ctx, cb)
    // A second tool_use for the same worker (or any lifecycle envelope) that
    // doesn't carry subagent_type must not erase the tracked persona.
    emitHealth('delegating', undefined, ctx, cb)

    expect(ctx.lastDelegatedPersona).toBe('prdt-developer')
  })

  it('a genuinely distinct persona (parallel/sequential dispatch) still replaces the tracked one', () => {
    const ctx = makeHealthCtx('m1')
    const { events, cb } = makeCb()

    emitHealth('delegating', { persona: 'prdt-designer' }, ctx, cb)
    emitHealth('delegating', { persona: 'prdt-developer' }, ctx, cb)

    expect(events).toHaveLength(2)
    expect(events[0].detail?.persona).toBe('prdt-designer')
    expect(events[1].detail?.persona).toBe('prdt-developer')
    expect(ctx.lastDelegatedPersona).toBe('prdt-developer')
  })

  it('a repeat of the SAME persona is still deduped (no re-emit)', () => {
    const ctx = makeHealthCtx('m1')
    const { events, cb } = makeCb()

    emitHealth('delegating', { persona: 'prdt-developer' }, ctx, cb)
    emitHealth('delegating', { persona: 'prdt-developer' }, ctx, cb)

    expect(events).toHaveLength(1)
  })

  it('leaving delegating clears the tracked persona (non-delegating state)', () => {
    const ctx = makeHealthCtx('m1')
    const { cb } = makeCb()

    emitHealth('delegating', { persona: 'prdt-developer' }, ctx, cb)
    emitHealth('healthy', undefined, ctx, cb)

    expect(ctx.lastDelegatedPersona).toBeNull()
  })
})
