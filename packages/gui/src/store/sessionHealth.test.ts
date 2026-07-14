/**
 * sessionHealth.test.ts — T-355 regression.
 *
 * po-runner.ts's emitHealth (T-PATCH-148) sends TWO 'delegating' events for a
 * single dispatch: a generic detail-less ping (handleToolUseHealth, fired
 * before the persona is known) immediately followed by the real one carrying
 * detail.persona. Both land at the SAME priority (HEALTH_PRIORITY.delegating).
 * The store's plain "only advance to a higher priority" cascade rejected the
 * second (no state change → not an "advance"), so the status bar got stuck
 * showing the placeholder ("… 위임 중") instead of the worker's name — bug #1/#2
 * root cause (T-355). setHealth must let a same-priority 'delegating' event
 * through when it carries a persona the store doesn't already have.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The global vitest.setup.ts stubs zustand's create(); this store needs the
// real implementation to exercise the priority-cascade branching.
vi.unmock('zustand')

import { useSessionHealth } from './sessionHealth'

describe('sessionHealth.setHealth — delegating persona-aware update (T-355)', () => {
  beforeEach(() => {
    useSessionHealth.getState().clearHealth()
  })

  it('a detail-less delegating ping followed by the real-persona one keeps the persona (not dropped)', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: undefined, at: 't1' })
    expect(useSessionHealth.getState().detail.persona).toBeUndefined()

    useSessionHealth.getState().setHealth({
      state: 'delegating',
      detail: { persona: 'prdt-developer', task: 'fix bug' },
      at: 't2',
    })
    expect(useSessionHealth.getState().detail.persona).toBe('prdt-developer')
    expect(useSessionHealth.getState().detail.task).toBe('fix bug')
  })

  it('a SECOND distinct persona (parallel/sequential dispatch) overwrites the shown persona', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-designer' }, at: 't1' })
    expect(useSessionHealth.getState().detail.persona).toBe('prdt-designer')

    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't2' })
    expect(useSessionHealth.getState().detail.persona).toBe('prdt-developer')
  })

  it('a later detail-less ping does NOT blank out an already-shown persona', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't1' })
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: undefined, at: 't2' })
    expect(useSessionHealth.getState().detail.persona).toBe('prdt-developer')
  })

  it('a truly redundant repeat (same persona) is still a no-op (dedupe preserved)', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't1' })
    const before = useSessionHealth.getState().lastUpdatedAt
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't2' })
    expect(useSessionHealth.getState().lastUpdatedAt).toBe(before)
  })

  it('a higher-priority state still wins over delegating regardless of persona', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't1' })
    useSessionHealth.getState().setHealth({ state: 'rate-limited', detail: {}, at: 't2' })
    expect(useSessionHealth.getState().state).toBe('rate-limited')
  })

  it('healthy always recovers regardless of the delegating persona history', () => {
    useSessionHealth.getState().setHealth({ state: 'delegating', detail: { persona: 'prdt-developer' }, at: 't1' })
    useSessionHealth.getState().setHealth({ state: 'healthy', detail: undefined, at: 't2' })
    expect(useSessionHealth.getState().state).toBe('healthy')
  })
})
