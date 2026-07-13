import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolvePoModel, DEFAULT_PO_MODEL } from './poModel'

// The global vitest.setup.ts stubs zustand's create(); personaPresence needs the
// real store to exercise setWorkerMeta's merge, so undo the stub for this file.
vi.unmock('zustand')

describe('resolvePoModel (T-334)', () => {
  it('returns the configured model when set', () => {
    expect(resolvePoModel('sonnet')).toBe('sonnet')
    expect(resolvePoModel('fable')).toBe('fable')
    expect(resolvePoModel('opus')).toBe('opus')
  })

  it('falls back to the GUI default (opus) when unset', () => {
    expect(resolvePoModel(null)).toBe(DEFAULT_PO_MODEL)
    expect(DEFAULT_PO_MODEL).toBe('opus')
  })
})

describe('setWorkerMeta model stickiness (T-334)', () => {
  let store: typeof import('./personaPresence')

  beforeEach(async () => {
    vi.resetModules()
    store = await import('./personaPresence')
    store.usePersonaPresence.getState().resetAll()
  })

  it('stores the worker model and keeps it sticky across usage-only refreshes', () => {
    const { setWorkerMeta } = store.usePersonaPresence.getState()
    setWorkerMeta('dev', { model: 'sonnet', startedAt: 1000 })
    expect(store.usePersonaPresence.getState().workerMeta.dev.model).toBe('sonnet')

    // A later usage refresh (no model field) must NOT wipe the model.
    setWorkerMeta('dev', { usage: { total_tokens: 1234 } })
    expect(store.usePersonaPresence.getState().workerMeta.dev.model).toBe('sonnet')
    expect(store.usePersonaPresence.getState().workerMeta.dev.usage?.total_tokens).toBe(1234)
  })

  it('never records a model for PO (hard-excluded)', () => {
    store.usePersonaPresence.getState().setWorkerMeta('po', { model: 'opus' })
    expect(store.usePersonaPresence.getState().workerMeta.po.model).toBeUndefined()
  })
})
