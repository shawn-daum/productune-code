// T-697: `md-recipes.css` `.md-doc.md-light` hex-copies a few tokens.css
// light values on purpose (see ds/lib/doc-surface-mirror.mjs for why) — this
// is the check that catches the two files drifting apart, wired into
// `ds --check` (packages/gui `lint` script) by ds/cli.mjs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MIRRORED_NAMES,
  TOKENS_PATH,
  MD_RECIPES_PATH,
  diffDocSurfaceMirror,
  checkDocSurfaceMirror,
} from '../../ds/lib/doc-surface-mirror.mjs'

describe('ds doc-surface mirror (md-recipes.css .md-doc.md-light vs tokens.css light)', () => {
  it('passes on the current tree', () => {
    const result = checkDocSurfaceMirror()
    expect(result.mismatches).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('mirrors at least one name (non-vacuous mapping)', () => {
    expect(MIRRORED_NAMES.length).toBeGreaterThan(0)
  })

  // Non-vacuous: a fixture that DOES drift must fail the same check the real
  // files pass — otherwise "passes on the current tree" above could pass for
  // the wrong reason (e.g. a checker that never matches anything).
  it('checker fixture: an --accent drift on the md-recipes side is caught', () => {
    const tokensCss = readFileSync(TOKENS_PATH, 'utf8')
    const realMdRecipesCss = readFileSync(MD_RECIPES_PATH, 'utf8')
    // Flip only the .md-doc.md-light --accent hex to something the real
    // tokens.css light value never is; leave --health-success/-error intact.
    const drifted = realMdRecipesCss.replace(
      /(\.md-doc\.md-light\s*\{[^}]*--accent:\s*)#7C3AED/,
      '$1#123456',
    )
    expect(drifted).not.toEqual(realMdRecipesCss) // the replace actually hit

    const mismatches = diffDocSurfaceMirror({ mdRecipesCss: drifted, tokensCss })
    expect(mismatches).toEqual([{ name: 'accent', mdRecipes: '#123456', tokens: '#7C3AED' }])
  })

  it('checker fixture: a matching synthetic pair reports no mismatch', () => {
    const tokensCss = `
:root {
  --brand-accent: #111111;
  --accent: var(--brand-accent);
  --health-success: #222222;
  --health-error: #333333;
}
@media (prefers-color-scheme: light) {
  :root:not(.theme-dark) {
    --brand-accent: #ABCDEF;
    --health-success: #0A7A54;
    --health-error: #C62828;
  }
}
:root.theme-light {
  --brand-accent: #ABCDEF;
  --health-success: #0A7A54;
  --health-error: #C62828;
}
:root.theme-dark {
  --brand-accent: #111111;
  --health-success: #222222;
  --health-error: #333333;
}
`
    const mdRecipesCss = `
.md-doc.md-light {
  --accent: #ABCDEF;
  --health-success: #0A7A54;
  --health-error: #C62828;
}
`
    expect(diffDocSurfaceMirror({ mdRecipesCss, tokensCss })).toEqual([])
  })

  it('checker fixture: a synthetic drift on the tokens.css side is caught', () => {
    const tokensCss = `
:root {
  --brand-accent: #111111;
  --accent: var(--brand-accent);
  --health-success: #222222;
  --health-error: #333333;
}
@media (prefers-color-scheme: light) {
  :root:not(.theme-dark) {
    --brand-accent: #ABCDEF;
    --health-success: #999999;
    --health-error: #C62828;
  }
}
:root.theme-light {
  --brand-accent: #ABCDEF;
  --health-success: #999999;
  --health-error: #C62828;
}
:root.theme-dark {
  --brand-accent: #111111;
  --health-success: #222222;
  --health-error: #333333;
}
`
    const mdRecipesCss = `
.md-doc.md-light {
  --accent: #ABCDEF;
  --health-success: #0A7A54;
  --health-error: #C62828;
}
`
    expect(diffDocSurfaceMirror({ mdRecipesCss, tokensCss })).toEqual([
      { name: 'health-success', mdRecipes: '#0A7A54', tokens: '#999999' },
    ])
  })
})
