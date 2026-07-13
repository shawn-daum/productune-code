/**
 * subagent-cost — unit cases for extractSubagentCapture / extractPoModel (T-335).
 *
 * extractPoModel backs the PO's own model-id capture (PersonaPresenceBar sprite
 * label, ChatPanel send-button badge — see store/poModel.ts's poModelLabel).
 * It must never leak a sidechain/subagent's model onto the PO label (isNested
 * gate) and must be a safe no-op on lines that carry no model at all (most
 * stream-json lines don't).
 */

import { describe, it, expect } from 'vitest'
import { extractPoModel, extractSubagentCapture } from './subagent-cost'

describe('extractPoModel (T-335)', () => {
  it('reads message.model off a top-level assistant envelope', () => {
    const obj = { type: 'assistant', message: { model: 'claude-opus-4-8', content: [] } }
    expect(extractPoModel(obj, false)).toBe('claude-opus-4-8')
  })

  it('falls back to top-level model when message.model is absent', () => {
    const obj = { type: 'result', model: 'claude-sonnet-5' }
    expect(extractPoModel(obj, false)).toBe('claude-sonnet-5')
  })

  it('returns null when nested (sidechain/subagent) — never leaks a worker model onto the PO label', () => {
    const obj = { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { model: 'claude-sonnet-5' } }
    expect(extractPoModel(obj, true)).toBeNull()
  })

  it('returns null when the line carries no model field (most lines)', () => {
    expect(extractPoModel({ type: 'assistant', message: { content: [] } }, false)).toBeNull()
  })
})

describe('extractSubagentCapture model probe (regression guard, T-334)', () => {
  it('still resolves modelUsage / message.model / top-level model for subagent lines', () => {
    expect(extractSubagentCapture({ modelUsage: { 'claude-opus-4-8': {} } }).model).toBe('claude-opus-4-8')
    expect(extractSubagentCapture({ message: { model: 'claude-sonnet-5' } }).model).toBe('claude-sonnet-5')
    expect(extractSubagentCapture({ model: 'claude-fable-5' }).model).toBe('claude-fable-5')
  })
})
