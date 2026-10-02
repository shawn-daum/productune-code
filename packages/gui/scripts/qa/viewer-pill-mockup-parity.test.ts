// T-721 acceptance line 1: every `.pill-*` class in render.mjs's TEMPLATE_CSS
// must resolve to the approved mockup's declarations for the same class, so the
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
// T-900: the reference is the v1.12 screen set (viewer-polish sheet), the one
// that approved T-797's light 80%-mix text and T-887's dark tints. Its pills are
// scoped per theme (`.frame:not(.theme-dark)` / `.frame.theme-dark`), render.mjs's
// per `:root` theme, so both sides are reduced to the EFFECTIVE declarations per
// theme (base, then the theme's own overrides) and compared for light and dark.
// Meta root: META_ROOT (tracks/T-NNN worktrees resolve to their parent).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_CSS } from '@productune/viewer/lib/render.mjs'
import { META_ROOT, META_SKIP_REASON } from './meta-root'

const MOCKUP_PATH = META_ROOT ? path.join(META_ROOT, 'docs/artifacts/v1.12/define-screen-set.html') : ''
const metaMissingReason = META_SKIP_REASON

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

type Theme = 'base' | 'light' | 'dark'
type Rule = { cls: string; theme: Theme; body: string }

// A selector is a plain `[scope][theme-qualifier] .pill-x`; anything else (screen-
// scoped :is(...) rules, nested descendants) is not a pill definition and is ignored.
const RENDER_SEL = /^(?::root(:not\(\[data-theme="dark"\]\)|\[data-theme="dark"\]))?\s*\.(pill-[\w-]+)$/
const MOCKUP_SEL = /^\.frame(:not\(\.theme-dark\)|\.theme-dark)?\s+\.(pill-[\w-]+)$|^\.(pill-[\w-]+)$/

function themeOf(q: string | undefined): Theme {
  if (!q) return 'base'
  return q.startsWith(':not') ? 'light' : 'dark'
}

/** Every `.pill-*` rule in `cssText`, in source order, one entry per selector of a list. */
function extractRules(cssText: string, selRe: RegExp): Rule[] {
  const rules: Rule[] = []
  const re = /([^{}]+)\{([^}]*)\}/g
  let m
  while ((m = re.exec(cssText.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    for (const sel of m[1].split(',')) {
      const sm = selRe.exec(sel.trim())
      if (!sm) continue
      const cls = sm[2] ?? sm[3]
      rules.push({ cls, theme: themeOf(sm[1]), body: m[2] })
    }
  }
  return rules
}

/** A rule body → { property: normalized-value } map, so declaration-order and
 *  whitespace differences between the mockup's compact CSS and render.mjs's
 *  spaced-out CSS never register as a mismatch. */
function declMap(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of body.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const prop = trimmed.slice(0, idx).trim()
    out[prop] = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/,\s*/g, ', ')
  }
  return out
}

/** What the class actually paints in one theme: base rules, then that theme's
 *  own rules (higher specificity, so they win whatever the source order). */
function effective(rules: Rule[], cls: string, theme: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const layer of ['base', theme] as Theme[])
    for (const r of rules) if (r.cls === cls && r.theme === layer) Object.assign(out, declMap(r.body))
  return out
}

function mockupStyleText(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
}

describe('viewer pills — render.mjs TEMPLATE_CSS matches the approved v1.12 screen set (T-721, T-900)', () => {
  const renderRules = extractRules(TEMPLATE_CSS, RENDER_SEL)
  const mockupRules = metaMissingReason ? [] : extractRules(mockupStyleText(fs.readFileSync(MOCKUP_PATH, 'utf8')), MOCKUP_SEL)

  it.skipIf(metaMissingReason).each(PILL_CLASSES)(
    `.%s: render.mjs resolves to the mockup's declarations in light and dark${metaMissingReason ? ` — SKIPPED: ${metaMissingReason}` : ''}`,
    (cls) => {
      expect(mockupRules.some((r) => r.cls === cls)).toBe(true) // fixture sanity — mockup must actually define this class
      expect(renderRules.some((r) => r.cls === cls)).toBe(true) // render.mjs must actually define this class
      for (const theme of ['light', 'dark'] as const) {
        expect(effective(renderRules, cls, theme), `${cls} ${theme}`).toEqual(effective(mockupRules, cls, theme))
      }
    },
  )
})
