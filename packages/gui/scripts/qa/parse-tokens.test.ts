// T-712 acceptance line 1: "findLegacyAliasNames returns every alias in
// tokens.css's alias block, including the first (`surface-base` today); a
// test pins the first name."
//
// Bug (ship-entry code review, gui, 2026-09-27, v1.9..dev, C2): the marker
// text 'LEGACY ALIASES' lives INSIDE the `/* … */` comment that introduces
// the alias block, so slicing the raw source from the marker (rather than
// from the comment's own opening `/*`) starts mid-comment — no opening `/*`
// remains for `stripComments` to match, so the comment's closing `*/` (and
// the prose before it) survived and fused onto the first declaration line,
// making that whole statement fail `parseDeclarations`'s `^--` match. Net
// effect: `--surface-base` (the first alias) silently dropped from the set,
// and therefore from `ds/design-system.html`'s "Legacy aliases" list.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { findLegacyAliasNames, buildRawThemeMaps } from '@productune/viewer/lib/parse-tokens.mjs'
import { TOKENS_PATH } from '../../ds/generate.mjs'

// A minimal fixture shaped exactly like tokens.css's own alias block: the
// marker sits inside a multi-line comment, followed by declarations, closed
// by the enclosing rule's `}`.
const FIXTURE = `
:root {
  --brand-accent: #7C3AED;
  /* ══ LEGACY ALIASES — old consumer var names → Anchor roles ══════════════
   * some prose that keeps going
   * across more than one line. */
  --surface-base:     var(--bg-base);
  --surface-body:     var(--bg-surface-base);
  --text-muted:       var(--text-tertiary);
}
`

describe('findLegacyAliasNames (T-712)', () => {
  it('does not drop the first alias declared right after the marker comment', () => {
    const names = findLegacyAliasNames(FIXTURE)
    expect([...names]).toEqual(['surface-base', 'surface-body', 'text-muted'])
  })

  it('returns an empty Set when the marker is absent (graceful degrade, unchanged)', () => {
    expect(findLegacyAliasNames(':root { --a: 1px; }')).toEqual(new Set())
  })

  it('against the real tokens.css: the alias set includes surface-base, and it is the first name', () => {
    const tokensCss = fs.readFileSync(TOKENS_PATH, 'utf8')
    const { legacyAliasNames } = buildRawThemeMaps(tokensCss)
    expect(legacyAliasNames.has('surface-base')).toBe(true)
    expect([...legacyAliasNames][0]).toBe('surface-base')
  })
})
