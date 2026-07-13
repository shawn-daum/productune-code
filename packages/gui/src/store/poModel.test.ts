import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolvePoModel, DEFAULT_PO_MODEL, formatModelLabel, poModelLabel } from './poModel'

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

describe('formatModelLabel (T-335)', () => {
  it('formats a two-segment real id as "Family V.v"', () => {
    expect(formatModelLabel('claude-opus-4-8')).toBe('Opus 4.8')
    expect(formatModelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(formatModelLabel('claude-haiku-4-5')).toBe('Haiku 4.5')
  })

  it('formats a single-segment real id as "Family V"', () => {
    expect(formatModelLabel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(formatModelLabel('claude-fable-5')).toBe('Fable 5')
  })

  it('strips a bracketed deployment suffix before formatting', () => {
    expect(formatModelLabel('claude-opus-4-8[1m]')).toBe('Opus 4.8')
  })

  it('renders a bare alias as just the capitalized family — never an invented version', () => {
    expect(formatModelLabel('opus')).toBe('Opus')
    expect(formatModelLabel('sonnet')).toBe('Sonnet')
    expect(formatModelLabel('fable')).toBe('Fable')
  })

  it('parses an unfamiliar-but-well-formed real id the same way (no lookup table, no guessing)', () => {
    // Not in model-prices.json — the parser is generic (family + numeric
    // version segments), not a fixed lookup, so a brand-new id still formats.
    expect(formatModelLabel('claude-quasar-9-2')).toBe('Quasar 9.2')
  })

  it('falls back to the raw value for a shape that does not parse — never blank/broken', () => {
    // Trailing non-numeric segment ("-latest") breaks the version-segment
    // match entirely — rather than guess, render the raw id unchanged.
    expect(formatModelLabel('claude-opus-latest')).toBe('claude-opus-latest')
    expect(formatModelLabel('totally-unknown-shape!!')).toBe('totally-unknown-shape!!')
    expect(formatModelLabel('')).toBe('')
  })
})

describe('poModelLabel (T-335)', () => {
  it('prefers the captured real model id over the alias', () => {
    expect(poModelLabel({ model: 'sonnet', realModelId: 'claude-opus-4-8' })).toBe('Opus 4.8')
  })

  it('falls back to the capitalized alias when no real id has been captured yet', () => {
    expect(poModelLabel({ model: 'sonnet', realModelId: null })).toBe('Sonnet')
  })

  it('falls back to the capitalized GUI default when both model and realModelId are unset', () => {
    expect(poModelLabel({ model: null, realModelId: null })).toBe('Opus')
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
