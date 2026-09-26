// T-665 slice 2 acceptance line 3: "a generation-time guard like
// ds/generate.mjs's (template CSS has no hex/rgb literal; every var()
// declared in tokens.css) fails generation when broken — with a test showing
// it fires."
//
// `viewer/lib/render.mjs`'s `templateGuardErrors` is the exact function
// `viewer/generate.mjs` calls to decide whether to throw (see its guard
// block, right after `dark`/`light` are resolved). It takes the CSS text as
// an optional argument rather than only ever reading its own closed-over
// TEMPLATE_CSS, precisely so this test can hand it a broken fixture directly
// — proving the SAME logic `generate()` relies on actually fires, without
// mocking the filesystem or mutating module internals to break the real
// template on purpose.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRawThemeMaps, resolveVarChains } from '../../ds/lib/parse-tokens.mjs'
import { templateCssVarNames, templateCssHasHexOrRgbLiteral, templateGuardErrors } from '../../viewer/lib/render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKENS_PATH = path.resolve(__dirname, '../../src/styles/tokens.css')

function realDeclaredNames() {
  const tokensCss = fs.readFileSync(TOKENS_PATH, 'utf8')
  const { darkRaw } = buildRawThemeMaps(tokensCss)
  return resolveVarChains(darkRaw)
}

describe('viewer/lib/render.mjs — generation-time template guards', () => {
  it('the real TEMPLATE_CSS is clean against the real tokens.css (regression)', () => {
    expect(templateGuardErrors(realDeclaredNames())).toEqual([])
  })

  it('checker fixture: a hex literal is caught', () => {
    expect(templateCssHasHexOrRgbLiteral('body { color: #fff; }')).toBe(true)
  })

  it('checker fixture: an rgb()/rgba() literal is caught', () => {
    expect(templateCssHasHexOrRgbLiteral('body { color: rgba(0,0,0,.5); }')).toBe(true)
  })

  it('checker fixture: a var(--…) reference alone is not a literal', () => {
    expect(templateCssHasHexOrRgbLiteral('body { color: var(--text-primary); }')).toBe(false)
  })

  it('checker fixture: a var() name not in the declared set is caught', () => {
    const names = templateCssVarNames('body { color: var(--not-a-real-token); }')
    expect(names.has('not-a-real-token')).toBe(true)
  })

  it('the guard fires: a broken template CSS (hex literal + undeclared var) produces errors', () => {
    const broken = 'body { color: #fff; background: var(--not-a-real-token); }'
    const errors = templateGuardErrors(new Map(), broken)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('hex or rgb'))).toBe(true)
    expect(errors.some((e) => e.includes('not-a-real-token'))).toBe(true)
  })

  it('the guard is silent on clean CSS whose only var() is declared', () => {
    const clean = 'body { color: var(--text-primary); }'
    const declared = new Map([['text-primary', '#000']])
    expect(templateGuardErrors(declared, clean)).toEqual([])
  })
})
