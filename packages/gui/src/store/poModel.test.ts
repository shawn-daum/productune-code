import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolvePoModel,
  DEFAULT_PO_MODEL,
  formatModelLabel,
  formatModelLabelWide,
  poModelLabel,
  poModelOptionLabel,
  usePoModel,
} from './poModel'

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

  // T-338: real CLI ids carry a trailing YYYYMMDD date stamp (probe-confirmed:
  // `--model haiku` streams `claude-haiku-4-5-20251001`). The date is a build
  // stamp, not a version — it must never reach the label.
  it('strips a trailing date-stamp segment from a real id (T-338)', () => {
    expect(formatModelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(formatModelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
    expect(formatModelLabel('claude-sonnet-5[1m]')).toBe('Sonnet 5')
  })

  it('parses a legacy version-first id (claude-3-5-sonnet-YYYYMMDD) (T-338)', () => {
    expect(formatModelLabel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
    expect(formatModelLabel('claude-3-7-sonnet-20250219')).toBe('Sonnet 3.7')
  })

  it('renders only the family when the sole numeric segment is a date stamp', () => {
    // No honest version to show — family only, never an invented number.
    expect(formatModelLabel('claude-opus-20260101')).toBe('Opus')
  })
})

describe('formatModelLabelWide (T-338)', () => {
  it('prepends "Claude" to a parsed real id', () => {
    expect(formatModelLabelWide('claude-sonnet-5')).toBe('Claude Sonnet 5')
    expect(formatModelLabelWide('claude-opus-4-8')).toBe('Claude Opus 4.8')
    expect(formatModelLabelWide('claude-haiku-4-5-20251001')).toBe('Claude Haiku 4.5')
  })

  it('prepends "Claude" to a bare alias — graceful, no invented version', () => {
    expect(formatModelLabelWide('opus')).toBe('Claude Opus')
    expect(formatModelLabelWide('sonnet')).toBe('Claude Sonnet')
  })

  it('does NOT prefix an unparseable raw value (never "Claude <garbage>")', () => {
    expect(formatModelLabelWide('totally-unknown-shape!!')).toBe('totally-unknown-shape!!')
    expect(formatModelLabelWide('')).toBe('')
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

describe('observed alias→id map + poModelOptionLabel (T-338)', () => {
  beforeEach(() => {
    usePoModel.setState({ realModelId: null, observedByAlias: {}, model: null })
  })

  it('setRealModelId records the id under its family alias when the family is a known option', () => {
    usePoModel.getState().setRealModelId('claude-opus-4-8')
    expect(usePoModel.getState().observedByAlias.opus).toBe('claude-opus-4-8')
    expect(usePoModel.getState().realModelId).toBe('claude-opus-4-8')
  })

  it('setRealModelId(null) clears the live id but KEEPS the observed map (restart-safe)', () => {
    usePoModel.getState().setRealModelId('claude-opus-4-8')
    usePoModel.getState().setRealModelId(null)
    expect(usePoModel.getState().realModelId).toBeNull()
    expect(usePoModel.getState().observedByAlias.opus).toBe('claude-opus-4-8')
  })

  it('recordObservedId records worker-observed ids too, but never an unknown family', () => {
    usePoModel.getState().recordObservedId('claude-sonnet-5')
    usePoModel.getState().recordObservedId('claude-haiku-4-5-20251001') // haiku ∉ options
    usePoModel.getState().recordObservedId('garbage!!')
    expect(usePoModel.getState().observedByAlias.sonnet).toBe('claude-sonnet-5')
    expect(Object.keys(usePoModel.getState().observedByAlias)).toEqual(['sonnet'])
  })

  it('poModelOptionLabel resolves an observed alias to a versioned wide name, else graceful', () => {
    usePoModel.getState().recordObservedId('claude-opus-4-8')
    const observed = usePoModel.getState().observedByAlias
    expect(poModelOptionLabel('opus', observed)).toBe('Claude Opus 4.8')
    expect(poModelOptionLabel('sonnet', observed)).toBe('Claude Sonnet') // unresolved → no invented version
  })
})

describe('load() realModelId retention (T-338 remount bug)', () => {
  beforeEach(() => {
    usePoModel.setState({ realModelId: null, observedByAlias: {}, model: null })
  })

  it('keeps the captured realModelId across a re-load of the SAME project (component remount)', async () => {
    await usePoModel.getState().load('/proj/a')
    usePoModel.getState().setRealModelId('claude-opus-4-8')
    await usePoModel.getState().load('/proj/a')   // ChatPanel remount → same dir
    expect(usePoModel.getState().realModelId).toBe('claude-opus-4-8')
  })

  it('clears the captured realModelId when the project actually changes', async () => {
    await usePoModel.getState().load('/proj/a')
    usePoModel.getState().setRealModelId('claude-opus-4-8')
    await usePoModel.getState().load('/proj/b')
    expect(usePoModel.getState().realModelId).toBeNull()
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
