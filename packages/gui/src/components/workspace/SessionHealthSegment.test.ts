/**
 * SessionHealthSegment.test.ts — T-355 regression.
 *
 * The delegating chip's label previously interpolated detail.persona VERBATIM
 * — the raw dispatch agent id (e.g. "prdt-developer") — directly into the
 * user-facing status bar text ("prdt-developer 위임 중…"). Contracts forbid
 * surfacing an agent id to the user (product role name only, e.g.
 * "Developer"). `personaLabel` maps the raw id through the same
 * personaIdFromAgentType → PERSONA_LABELS lookup ChatPanel's verbForHealth
 * already uses for its own in-chat activity line.
 */

import { describe, it, expect } from 'vitest'
import { personaLabel } from './SessionHealthSegment'

describe('personaLabel (T-355)', () => {
  it('maps a current prdt-* agent id to its product role label', () => {
    expect(personaLabel('prdt-developer')).toBe('Developer')
    expect(personaLabel('prdt-designer')).toBe('Designer')
    expect(personaLabel('prdt-qa')).toBe('QA')
    expect(personaLabel('prdt-po')).toBe('PO')
  })

  it('maps a legacy pdt-* agent id the same way', () => {
    expect(personaLabel('pdt-developer')).toBe('Developer')
  })

  it('falls back to the raw string for an unmapped id (defensive, never crashes)', () => {
    expect(personaLabel('some-unknown-agent')).toBe('some-unknown-agent')
  })

  it('falls back to the ellipsis placeholder when no persona is known yet', () => {
    expect(personaLabel(undefined)).toBe('…')
  })
})
