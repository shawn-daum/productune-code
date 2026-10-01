// T-721 acceptance line 1: every `.pill-*` rule in render.mjs's TEMPLATE_CSS
// must equal the approved mockup's rule body for the same class, so the
// viewer's status/role pills keep the mockup's tinted backgrounds instead of
// silently drifting back to a flat neutral fill. This test parses both CSS
// sources and diffs them property-by-property (whitespace-insensitive) —
// it does NOT read the whole 3.3MB mockup file into a string compare; it
// greps the handful of `.pill-*{...}` rule bodies it needs out of it.
//
// T-730: the mockup lives under docs/artifacts, one level ABOVE the code
// repo root — only present when this checkout sits inside the meta project
// layout. A detached worktree (parallel-safety, v1.11) has no such sibling,
// so this file used to throw ENOENT at describe-body eval time and take the
// whole suite down. Same condition, same helper, as viewer-html.test.ts /
// viewer-labels.test.ts / viewer-shell.test.ts: skip (with a visible reason)
// instead of crashing when the meta root isn't there; run for real whenever
// it is.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_CSS } from '@productune/viewer/lib/render.mjs'
import { missingMetaRootReason } from '@productune/viewer/generate.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MOCKUP_PATH = path.resolve(__dirname, '../../../../../docs/artifacts/v1.10/define-screen-set.html')
const metaMissingReason = missingMetaRootReason()

// The pill classes the ticket names explicitly.
const PILL_CLASSES = [
  'pill-status-done',
  'pill-status-progress',
  'pill-status-review',
  'pill-status-blocked',
  'pill-status-abandoned',
  'pill-status-todo',
  'pill-role-po',
  'pill-role-designer',
  'pill-role-developer',
  'pill-role-qa',
  'pill-type',
  'pill-neutral',
  'pill-error',
]

/** Pull `.<cls>{...}` or `.<cls> {...}` rule bodies out of a CSS-bearing text blob. */
function extractRuleBodies(cssText) {
  const bodies = new Map()
  const re = /\.([\w-]+)\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(cssText))) {
    bodies.set(m[1], m[2])
  }
  return bodies
}

/** A rule body → { property: normalized-value } map, so declaration-order and
 *  whitespace differences between the mockup's compact CSS and render.mjs's
 *  spaced-out CSS never register as a mismatch. */
function declMap(body) {
  const out = {}
  for (const decl of body.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const prop = trimmed.slice(0, idx).trim()
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/,\s*/g, ', ')
    out[prop] = value
  }
  return out
}

describe('viewer pills — render.mjs TEMPLATE_CSS matches the approved mockup (T-721)', () => {
  const renderRules = extractRuleBodies(TEMPLATE_CSS)
  const mockupRules = metaMissingReason ? new Map() : extractRuleBodies(fs.readFileSync(MOCKUP_PATH, 'utf8'))

  it.skipIf(metaMissingReason).each(PILL_CLASSES)(
    `.%s: render.mjs rule body equals the mockup rule body${metaMissingReason ? ` — SKIPPED: ${metaMissingReason}` : ''}`,
    (cls) => {
      expect(mockupRules.has(cls)).toBe(true) // fixture sanity — mockup must actually define this class
      expect(renderRules.has(cls)).toBe(true) // render.mjs must actually define this class
      expect(declMap(renderRules.get(cls))).toEqual(declMap(mockupRules.get(cls)))
    },
  )
})
