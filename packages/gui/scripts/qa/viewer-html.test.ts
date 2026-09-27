// T-665 slice 2 acceptance line 1: "a static test (host, pnpm test) asserts
// the generated page has no load-time external resource (script/link/img/
// iframe src/href, CSS @import/url(http)) — prose URLs in ticket/wiki text
// are allowed and must not trip it."
//
// WHY THIS IS NOT `ds-html.test.ts`'s CHECK, RE-USED
//
// `scripts/qa/ds-html.test.ts`'s `findNetworkReferences` flags every bare
// `http(s)://`/`//host` substring in the WHOLE document. That is exactly
// right for `ds/design-system.html`, which embeds no foreign prose this
// generator does not author. `viewer/viewer.html` is the opposite case: it
// inlines hundreds of real ticket/wiki/artifact documents verbatim (as
// escaped markdown → HTML, `viewer/lib/render.mjs`), and several of them
// legitimately quote an external URL in prose (measured 2026-09-26: e.g. a
// GitHub link, a Vercel API URL, an Atlassian wiki link — none of them a
// LOAD-TIME reference). The bare-substring check would false-positive on
// every one of those. This check instead looks only at the small, closed set
// of HTML/CSS constructs the browser actually fetches at load time:
// `<script src>`, `<link href>`, `<img src>`, `<iframe src>`, CSS `@import`,
// and CSS `url(http...)`. A prose URL sitting in body text, inside an `<a
// href>` (never auto-fetched), or inside a `<code>`/`<pre>` span is not any
// of those and is correctly left alone.
import { describe, it, expect, beforeAll } from 'vitest'
import { generate } from '../../viewer/generate.mjs'
import { renderPage } from '../../viewer/lib/render.mjs'

// T-718: the real generated page is now built HERE, in-process (`generate()`
// — the same function `pnpm --filter @productune/gui viewer` itself calls),
// never read back off disk. `viewer/viewer.html` is gitignored (a build
// artifact) — a fresh checkout (a `git worktree add --detach`, in
// particular) never has it on disk until something runs `pnpm viewer`
// first, which this test suite must not require as a precondition. Built
// ONCE in `beforeAll` and reused by every test in this file (doctrine:
// expensive shared setup is built once per file, never per test case).
let realHtml: string

beforeAll(async () => {
  ;({ html: realHtml } = await generate())
}, 30000)

/**
 * Every load-time external-resource reference in `html`: a `src`/`href`
 * attribute on `<script>`/`<link>`/`<img>`/`<iframe>` whose value is not a
 * same-document `#anchor` or a `data:` URI, plus any CSS `@import` and any
 * `url(http...)` function call. Deliberately narrow — see file header.
 */
export function findLoadTimeExternalResources(html: string): string[] {
  const found: string[] = []
  const attrTags = [
    { tag: 'script', attr: 'src' },
    { tag: 'link', attr: 'href' },
    { tag: 'img', attr: 'src' },
    { tag: 'iframe', attr: 'src' },
  ]
  for (const { tag, attr } of attrTags) {
    const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'gi')
    for (const m of html.matchAll(re)) {
      const value = m[1]
      if (value === '' || value.startsWith('#') || value.startsWith('data:')) continue
      found.push(`<${tag} ${attr}="${value}">`)
    }
  }
  const importRe = /@import\s+(?:url\()?["']?([^"');]+)["']?\)?/gi
  for (const m of html.matchAll(importRe)) found.push(`@import ${m[1]}`)
  const cssUrlHttpRe = /url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/gi
  for (const m of html.matchAll(cssUrlHttpRe)) found.push(`url(${m[1]})`)
  return found
}

describe('viewer/viewer.html — no load-time external resource (static)', () => {
  it('references no load-time external resource', () => {
    expect(findLoadTimeExternalResources(realHtml)).toEqual([])
  })

  // Non-vacuous: a prose URL — exactly the shape real ticket/wiki bodies
  // carry (T-665 outcome §미해결 names 3 such cases) — must NOT trip the
  // check, or "prose URLs are allowed" would be untested.
  it('checker fixture: a prose URL in body text is not flagged', () => {
    const clean =
      '<article><div class="v-body"><p>See https://github.com/example/repo for details.</p></div></article>'
    expect(findLoadTimeExternalResources(clean)).toEqual([])
  })

  it('checker fixture: a prose URL inside <a href> is not flagged (never auto-fetched)', () => {
    const clean = '<p>read <a href="https://example.com/doc">the doc</a></p>'
    expect(findLoadTimeExternalResources(clean)).toEqual([])
  })

  it('checker fixture: a same-document #anchor href/src is not flagged', () => {
    const clean = '<link rel="stylesheet" href="#not-a-real-case"><a href="#tickets">tickets</a>'
    expect(findLoadTimeExternalResources(clean)).toEqual([])
  })

  it('checker fixture: an external <script src> is caught', () => {
    const broken = '<script src="https://cdn.example.com/a.js"></script>'
    expect(findLoadTimeExternalResources(broken)).toEqual(['<script src="https://cdn.example.com/a.js">'])
  })

  it('checker fixture: an external <link href> is caught', () => {
    const broken = '<link rel="stylesheet" href="https://fonts.example.com/a.css">'
    expect(findLoadTimeExternalResources(broken)).toEqual(['<link href="https://fonts.example.com/a.css">'])
  })

  it('checker fixture: an external <img src> is caught', () => {
    const broken = '<img src="https://example.com/pixel.png">'
    expect(findLoadTimeExternalResources(broken)).toEqual(['<img src="https://example.com/pixel.png">'])
  })

  it('checker fixture: an external <iframe src> is caught', () => {
    const broken = '<iframe src="https://example.com/embed"></iframe>'
    expect(findLoadTimeExternalResources(broken)).toEqual(['<iframe src="https://example.com/embed">'])
  })

  it('checker fixture: a CSS @import is caught', () => {
    // `@import url("...")` form also contains a `url(http...)` call, so both
    // checks legitimately fire on it — asserted with `toContain`, not an
    // exact array, so this test does not depend on which check ran first.
    const broken = '<style>@import url("https://fonts.example.com/a.css");</style>'
    const found = findLoadTimeExternalResources(broken)
    expect(found).toContain('@import https://fonts.example.com/a.css')
  })

  it('checker fixture: a bare CSS @import (no url() wrapper) is caught', () => {
    const broken = '<style>@import "https://fonts.example.com/b.css";</style>'
    expect(findLoadTimeExternalResources(broken)).toEqual(['@import https://fonts.example.com/b.css'])
  })

  it('checker fixture: a CSS url(http...) is caught', () => {
    const broken = "<style>@font-face{src:url('https://example.com/font.woff2')}</style>"
    expect(findLoadTimeExternalResources(broken)).toEqual(['url(https://example.com/font.woff2)'])
  })

  it('checker fixture: a same-document data: URI is not a load-time external reference', () => {
    const clean = "<style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style>"
    expect(findLoadTimeExternalResources(clean)).toEqual([])
  })
})

// T-665 slice 2 acceptance line 4: "a raw <script> in a fixture ticket body
// renders escaped — test." `viewer/lib/render.mjs`'s hardened marked
// renderer (see its own header comment) is what does the escaping;
// `renderPage` is the one function that runs a ticket body through it and
// produces the final page string, so this exercises the real pipeline
// end-to-end rather than only the renderer in isolation.
describe('viewer/lib/render.mjs — raw <script> in a ticket body renders escaped', () => {
  const fixtureData = {
    poState: { stage: 'build', version: 'v1.10', current_task: null },
    currentVersion: 'v1.10',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [
        {
          bucket: 'v1.10',
          rel: 'docs/tickets/v1.10/T-999.md',
          frontmatter: { id: 'T-999', slug: 'fixture' },
          body: 'before <script>alert(1)</script> after',
        },
      ],
      omitted: [],
    },
    wiki: [],
    features: [],
    artifacts: { entries: [] },
  }

  it('produces no live <script> tag in the rendered page', () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).not.toMatch(/<script(?![^>]*type=["']application\/json["'])[^>]*>alert/i)
    expect(html.toLowerCase()).not.toContain('<script>alert')
  })

  it('renders the tag text escaped, still visible as prose', () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
