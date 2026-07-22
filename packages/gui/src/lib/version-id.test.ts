/**
 * version-id.test.ts — T-390 (tooling audit FIX).
 *
 * VERSION_ID_RE is the SoT for version id naming (see version-id.ts header
 * comment). T-390 introduces patch version ids (v<MAJOR>.<MINOR>.<PATCH>)
 * into the lifecycle proper — this regex must accept them, not just the
 * legacy v<MAJOR> / v<MAJOR>.<MINOR> forms.
 */

import { describe, it, expect } from 'vitest'
import { isValidVersionId } from './version-id'

describe('isValidVersionId', () => {
  it('accepts major-only ids', () => {
    expect(isValidVersionId('v1')).toBe(true)
    expect(isValidVersionId('v0')).toBe(true)
  })

  it('accepts major.minor ids', () => {
    expect(isValidVersionId('v1.2')).toBe(true)
    expect(isValidVersionId('v0.1')).toBe(true)
  })

  it('accepts major.minor.patch ids (T-390)', () => {
    expect(isValidVersionId('v1.3.1')).toBe(true)
    expect(isValidVersionId('v0.1.0')).toBe(true)
  })

  it('rejects ids deeper than major.minor.patch', () => {
    expect(isValidVersionId('v1.2.3.4')).toBe(false)
  })

  it('rejects malformed ids', () => {
    expect(isValidVersionId('paepyeong-v1')).toBe(false)
    expect(isValidVersionId('v1-rc')).toBe(false)
    expect(isValidVersionId('V1')).toBe(false)
    expect(isValidVersionId('version-1')).toBe(false)
    expect(isValidVersionId('1.0')).toBe(false)
    expect(isValidVersionId('')).toBe(false)
  })
})
