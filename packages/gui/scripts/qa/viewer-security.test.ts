// T-711 — "no line of repo markdown or manifest data can make the generated
// viewer run script, make a network request, lose its interactivity, or
// point outside the repo." Pins the code reviewer's C1/C3 and the security
// pass's F1-F6 findings (docs/tickets/v1.10/T-711.md §problem), each as a
// hostile fixture BUILT AS AN IN-TEST STRING (never written into repo docs —
// contracts §Secrets/permission-layer note in this ticket's dispatch): a raw
// <script>/onerror, javascript:/data:/vbscript: links (incl. an autolink), a
// remote image, a `<!--<script` frontmatter value, and a manifest path
// escaping docs/artifacts via `../`.
//
// The real-corpus @window spec (tests/viewer-html.window.spec.ts) cannot
// catch any of these — today's docs/ has zero occurrences of this syntax
// (T-711 §problem: "오늘 docs/ 에는 해당 문법이 0건이라 잠복 결함이다") — so
// every case here is a fixture fed straight into `renderPage`/`collectArtifacts`,
// not a real ticket/wiki file.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderPage, resolveDocLink, safeEncodeURI, encodeFsPathHref, detailDataScript, isHrefContained } from '../../viewer/lib/render.mjs'
import { collectArtifacts, isContainedArtifactPath, collectTickets, collectWiki } from '../../viewer/lib/collect.mjs'
// REPO_ROOT/OUTPUT_PATH: generate.mjs's OWN, independent path arithmetic
// (never render.mjs's internal DEFAULT_VIEWER_ABS_PATH) — the property test
// below (T-711 slice 4) re-derives "does this href stay inside the repo?"
// from these via `new URL()` directly, so it is not just re-asserting
// whatever `isHrefContained` itself already believes.
import { REPO_ROOT, OUTPUT_PATH } from '../../viewer/generate.mjs'

const REPO_ROOT_PATHNAME = pathToFileURL(REPO_ROOT).pathname.replace(/\/$/, '') + '/'

/**
 * The property T-711 slice 4 exists to guarantee, checked independently of
 * `isHrefContained`'s own implementation: `href` resolved via the browser's
 * OWN `new URL()` algorithm against the REAL `viewer.html` (`OUTPUT_PATH`,
 * from `generate.mjs`) lands inside the REAL repo root (`REPO_ROOT`).
 */
function realBrowserPathnameInsideRepoRoot(href: string): boolean {
  const resolved = new URL(href, pathToFileURL(OUTPUT_PATH))
  if (resolved.protocol !== 'file:') return false
  return resolved.pathname === REPO_ROOT_PATHNAME.slice(0, -1) || resolved.pathname.startsWith(REPO_ROOT_PATHNAME)
}

/**
 * The GROUND TRUTH for "should `resolveDocLink(href, sourceDirRel, …)`
 * refuse this?" — resolves the AUTHOR's ORIGINAL `href` from a virtual
 * `file://` URL standing in for the source document's own real repo
 * location (`REPO_ROOT/sourceDirRel/doc.md`), via `new URL()` alone, and
 * asks whether the result still lands inside `REPO_ROOT`. Never touches
 * `render.mjs` — a second, wholly independent resolution of the exact same
 * question `isHrefContained` answers, so the property test below is not
 * just re-asserting what the implementation already believes about itself.
 */
function hrefEscapesRepoFromItsDoc(href: string, sourceDirRel: string): boolean {
  const virtualDocUrl = pathToFileURL(path.join(REPO_ROOT, sourceDirRel, 'doc.md'))
  let target: URL
  try {
    target = new URL(href, virtualDocUrl)
  } catch {
    return true
  }
  if (target.protocol !== 'file:') return true
  const inside = target.pathname === REPO_ROOT_PATHNAME.slice(0, -1) || target.pathname.startsWith(REPO_ROOT_PATHNAME)
  return !inside
}

// ---------- shared fixture plumbing ----------

/** Same minimal shape as scripts/qa/viewer-html.test.ts's own `fixtureData` — one ticket, everything else empty. */
function fixtureFor(body: string, frontmatterOverrides: Record<string, unknown> = {}) {
  return {
    poState: { stage: 'build', version: 'v1.10', current_task: null },
    currentVersion: 'v1.10',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [
        {
          bucket: 'v1.10',
          rel: 'docs/tickets/v1.10/T-999.md',
          frontmatter: { id: 'T-999', slug: 'fixture', ...frontmatterOverrides },
          body,
        },
      ],
      omitted: [],
    },
    wiki: [],
    features: [],
    artifacts: { entries: [] },
  }
}

/** Parses the embedded `#detail-data` JSON blob back out of a rendered page — the same way the real browser-side script does (`JSON.parse(...textContent)`), proving the `<` escaping round-trips correctly. */
function extractDetailData(html: string): any {
  const m = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  expect(m, 'no #detail-data script found in rendered page').not.toBeNull()
  return JSON.parse(m![1])
}

function renderTicketBody(body: string, frontmatterOverrides: Record<string, unknown> = {}) {
  const data = fixtureFor(body, frontmatterOverrides)
  const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  const detail = extractDetailData(html)
  return { html, bodyHtml: detail.ticket['T-999'].body as string }
}

// ---------- link scheme allowlist (F1/F4) ----------

describe('render.mjs — link scheme allowlist: only http:, https:, mailto:, #anchor survive as links', () => {
  const disallowedLinks = [
    ['[x](javascript:alert(1))', 'javascript:'],
    ['[x](JaVaScRiPt:alert(1))', 'mixed-case JaVaScRiPt:'],
    ['[x](data:text/html,<script>alert(1)</script>)', 'data:'],
    ['[x](vbscript:msgbox(1))', 'vbscript:'],
    ['[x](/etc/passwd)', 'a site-absolute path'],
    ['[x](//evil.example.com/a)', 'a protocol-relative //host'],
    ['[x](file:///etc/passwd)', 'file://'],
    ['[x](../../../../../../etc/passwd)', 'a relative path escaping the repo root'],
  ] as const

  for (const [md, label] of disallowedLinks) {
    it(`${label} renders as plain text, never a live anchor`, () => {
      const { bodyHtml } = renderTicketBody(md)
      expect(bodyHtml).not.toContain('<a ')
      expect(bodyHtml).toContain('x')
    })
  }

  it('an autolink <javascript:…> renders as plain text, never a live anchor (F1)', () => {
    const { bodyHtml } = renderTicketBody('before <javascript:alert(1)> after')
    expect(bodyHtml).not.toContain('<a ')
    expect(bodyHtml).toContain('before')
    expect(bodyHtml).toContain('after')
  })

  it('an http(s) link still renders as a real, target=_blank anchor', () => {
    const { bodyHtml } = renderTicketBody('[ok](https://example.com/doc)')
    expect(bodyHtml).toContain('<a href="https://example.com/doc" target="_blank" rel="noopener">ok</a>')
  })

  it('a mailto: link still renders as a real anchor', () => {
    const { bodyHtml } = renderTicketBody('[mail](mailto:a@b.com)')
    expect(bodyHtml).toContain('href="mailto:a@b.com"')
  })

  it('a #anchor link still renders as a real anchor, without target=_blank', () => {
    const { bodyHtml } = renderTicketBody('[jump](#section)')
    expect(bodyHtml).toBe('<p><a href="#section">jump</a></p>\n')
  })

  it('a repo-relative link still resolves like before (regression, not narrowed by the allowlist)', () => {
    const { bodyHtml } = renderTicketBody('[sibling](./sibling.md)')
    expect(bodyHtml).toContain('<a href="../../../../docs/tickets/v1.10/sibling.md" target="_blank" rel="noopener">sibling</a>')
  })
})

// ---------- images never load remotely; a hostile alt cannot break its attribute (F1/F2/C1) ----------

describe('render.mjs — images never produce a live <img> to an external URL', () => {
  it('a remote image renders as alt text, never a live <img src> (F2/C1)', () => {
    const { bodyHtml } = renderTicketBody('![pic](https://evil.example.com/a.png)')
    expect(bodyHtml).not.toContain('<img')
    expect(bodyHtml).toContain('pic')
  })

  it('a relative image escaping the repo root renders as alt text, never a broken <img>', () => {
    const { bodyHtml } = renderTicketBody('![pic](../../../../../../outside.png)')
    expect(bodyHtml).not.toContain('<img')
    expect(bodyHtml).toContain('pic')
  })

  it('a relative in-repo image resolves like a rewritten doc link, same rule as resolveDocLink', () => {
    const { bodyHtml } = renderTicketBody('![pic](./img.png)')
    const rewritten = resolveDocLink('./img.png', 'docs/tickets/v1.10', '../../../..')
    expect(bodyHtml).toBe(`<p><img src="${rewritten}" alt="pic"></p>\n`)
  })

  // "img onerror" hostile fixture, markdown-image shape: a hostile alt/title
  // cannot break out of its own attribute to plant a live event handler on
  // the <img> tag (marked's own default image renderer does NOT escape alt —
  // MEASURED against this repo's installed marked, 16.4.2 — this hardened
  // renderer must).
  it('a hostile alt cannot break out of the attribute to inject a live onerror handler', () => {
    const { bodyHtml } = renderTicketBody('![x" onerror="alert(1)](./img.png)')
    const tag = /<img[^>]*>/.exec(bodyHtml)
    expect(tag).not.toBeNull()
    // The literal text "onerror=" is still THERE — as inert, quoted text
    // inside `alt="…"` — but the tag must carry exactly the two attributes
    // this renderer ever emits (src, alt), never a THIRD, standalone
    // `onerror=` attribute of its own (which an unescaped quote would have
    // let the hostile alt open).
    const attrNames = [...tag![0].matchAll(/([a-zA-Z-]+)="[^"]*"/g)].map((m) => m[1])
    expect(attrNames).toEqual(['src', 'alt'])
    expect(tag![0]).toContain('&quot;')
  })

  // "img onerror" hostile fixture, raw-HTML shape — pins existing behavior
  // (hardenedRenderer.html already escapes every raw HTML token) as a
  // checked-in regression, per this ticket's own list of hostile fixtures.
  it('a raw <img onerror=…> HTML tag in a body renders escaped, never live', () => {
    const { bodyHtml } = renderTicketBody('<img src=x onerror=alert(1)>')
    expect(bodyHtml).not.toContain('<img')
    expect(bodyHtml).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

// ---------- %-encoding is never double-encoded (C3) ----------

describe('safeEncodeURI / resolveDocLink — an already %-encoded path is kept intact (C3)', () => {
  it('safeEncodeURI leaves a valid %XX escape untouched', () => {
    expect(safeEncodeURI('a%20b')).toBe('a%20b')
    expect(safeEncodeURI('caf%C3%A9.md')).toBe('caf%C3%A9.md')
  })

  it('safeEncodeURI still escapes a literal, non-escape "%"', () => {
    expect(safeEncodeURI('100% done')).toBe('100%25%20done')
  })

  it('safeEncodeURI still escapes other unsafe characters normally', () => {
    expect(safeEncodeURI('a b')).toBe('a%20b')
  })

  it('a rewritten relative href with an already-encoded space stays %20, never %2520', () => {
    const rewritten = resolveDocLink('my%20doc.md', 'docs/wiki', '../..')
    expect(rewritten).not.toContain('%25')
    expect(rewritten).toContain('%20')
  })

  it('renderPage end-to-end: a link to an already-encoded path is not double-encoded', () => {
    const { bodyHtml } = renderTicketBody('[doc](my%20doc.md)')
    expect(bodyHtml).not.toContain('%2520')
    expect(bodyHtml).not.toContain('%25')
    expect(bodyHtml).toContain('my%20doc.md')
  })
})

// ---------- the embedded JSON blob escapes every "<" (F3) ----------

describe('detailDataScript — every "<" is escaped as \\u003c, not only "</script" (F3)', () => {
  it('a "<!--<script" value leaves no raw "<" anywhere in the embedded JSON', () => {
    const html = detailDataScript({ title: '<!--<script>evil</script>-->', other: '</SCRIPT>' })
    const inner = html.slice(html.indexOf('>') + 1, html.lastIndexOf('<script'))
    expect(inner.includes('<')).toBe(false)
  })

  it('round-trips back to the exact original value once parsed (invisible to a real consumer)', () => {
    const original = '<!--<script>alert(1)</script>-->'
    const html = detailDataScript({ note: original })
    const parsed = extractDetailData(html)
    expect(parsed.note).toBe(original)
  })

  // F3 regression, full pipeline: a ticket frontmatter value carrying the
  // exact hostile shape from the ticket must not swallow the REAL
  // interaction <script> that follows it — the concrete symptom the security
  // pass observed ("interactive script disappears entirely").
  it('a "<!--<script>" frontmatter value leaves the page interactive — the real INTERACTION_SCRIPT still follows as its own <script> tag', () => {
    const { html } = renderTicketBody('body text', { slug: '<!--<script>evil' })
    const scriptOpenTags = html.match(/<script\b[^>]*>/gi) ?? []
    expect(scriptOpenTags.length).toBe(2) // #detail-data + the interaction script
    expect(html).toContain('document.addEventListener')
    // The hostile value itself is present, but only inside the escaped JSON
    // blob (no raw "<!--" anywhere in the document).
    expect(html).not.toContain('<!--<script')
  })
})

// ---------- encoded/mixed dot-segment traversal (T-711 slice 2 B1) ----------
// QA re-pass of ed31cb7 (hostile fixture repo under os.tmpdir, headless
// Chromium) found that `./%2e%2e/…/OUTSIDE-IMG.png` and `[P2](./%2e%2e/…)`
// both escaped the repo: path.posix.normalize sees `%2e%2e` as an opaque
// name and never collapses it, but the URL Standard's "double-dot URL path
// segment" rule (which a real browser's own href-resolution follows) treats
// `%2e%2e` / `.%2e` / `%2e.` (any case) as a real ".." — so the browser
// climbed past the root anyway. Fixed by judging containment on the
// decoded path in `resolveDocLink`.
describe('render.mjs — resolveDocLink refuses a percent-encoded/mixed dot-segment escape (T-711 slice 2 B1)', () => {
  it('a fully percent-encoded ../ escape in an image renders alt text, never a live <img> (QA repro)', () => {
    const { bodyHtml } = renderTicketBody('![P1](./%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/OUTSIDE-IMG.png)')
    expect(bodyHtml).not.toContain('<img')
    expect(bodyHtml).toContain('P1')
  })

  it('the same escape in a LINK renders as plain text, never a live anchor (QA repro)', () => {
    const { bodyHtml } = renderTicketBody('[P2](./%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/OUTSIDE-PAGE.html)')
    expect(bodyHtml).not.toContain('<a ')
    expect(bodyHtml).toContain('P2')
  })

  it('an uppercase percent-encoded escape (%2E%2E) is refused the same way', () => {
    const { bodyHtml } = renderTicketBody('![P1](./%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/OUTSIDE-IMG.png)')
    expect(bodyHtml).not.toContain('<img')
  })

  it('a mixed literal-dot + encoded-dot escape (.%2e) is refused the same way', () => {
    const { bodyHtml } = renderTicketBody('![P1](./.%2e/.%2e/.%2e/.%2e/.%2e/OUTSIDE-IMG.png)')
    expect(bodyHtml).not.toContain('<img')
  })

  it('a mixed encoded-dot + literal-dot escape (%2e.) is refused the same way', () => {
    const { bodyHtml } = renderTicketBody('![P1](./%2e./%2e./%2e./%2e./%2e./OUTSIDE-IMG.png)')
    expect(bodyHtml).not.toContain('<img')
  })

  it('resolveDocLink itself returns null for the decoded escape directly (unit-level, not just through renderTicketBody)', () => {
    expect(resolveDocLink('./%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/OUTSIDE.png', 'docs/tickets/v1.10', '../../../..')).toBeNull()
  })

  // T-711 slice 4 correction: slice 2's decode-based check refused this one
  // by ACCIDENT — decodePathSegments treated the whole opaque, slash-free
  // string as ONE segment and ran decodeURIComponent on it, which happened
  // to unescape %2f into a REAL '/' too (JS's decodeURIComponent does not
  // distinguish "reserved" bytes), so the resulting string then read as a
  // genuine multi-level "../../…" to path.posix.normalize even though
  // nothing in the ORIGINAL href was a real path separator. A REAL BROWSER
  // never does this: `new URL()` keeps `%2f`/`%2F` percent-encoded and inert
  // in a path segment (MEASURED: `new URL('a%2fb', base).pathname` stays
  // `a%2fb`, one segment — RFC 3986/WHATWG deliberately keep it opaque, the
  // documented defense against exactly this class of path-separator
  // confusion). So this href resolves to one harmless, oddly-named FILE
  // inside `docs/tickets/v1.10/` — same directory as the doc, never
  // escaping it — and `isHrefContained` (T-711 slice 4, judged the same way
  // a browser does) correctly allows it, same as any other in-repo path
  // with real %-encoded characters in its name.
  it('`..%2f` is one opaque in-repo filename to a real browser (%2f is never a path separator) — resolves, does not escape', () => {
    const { bodyHtml } = renderTicketBody('![P1](..%2f..%2f..%2f..%2f..%2f..%2fOUTSIDE-IMG.png)')
    expect(bodyHtml).toContain('<img')
    expect(bodyHtml).toContain('docs/tickets/v1.10/..%2f..%2f..%2f..%2f..%2f..%2fOUTSIDE-IMG.png')
  })

  it('an already-%-encoded in-repo path with no dot segment at all still keeps its own encoding — no %25 regression from this fix', () => {
    const rewritten = resolveDocLink('my%20doc.md', 'docs/wiki', '../..')
    expect(rewritten).not.toContain('%25')
    expect(rewritten).toContain('%20')
  })

  it('a real relative link with a literal single dot segment (./sibling.md) still resolves exactly as before', () => {
    const { bodyHtml } = renderTicketBody('[sibling](./sibling.md)')
    expect(bodyHtml).toContain('<a href="../../../../docs/tickets/v1.10/sibling.md" target="_blank" rel="noopener">sibling</a>')
  })
})

// ---------- a trailing `..?x`/`..#x` segment escapes past repo root (T-711 slice 4 B4) ----------
// QA re-pass (4th round, ed31cb7 lineage → T-722 결정 a): `path.posix.normalize`
// does not know `?`/`#` start a query/fragment, so a trailing segment like
// `..?a` reads as ONE opaque, un-collapsible filename to it — but a REAL
// BROWSER splits at the first unescaped `?`/`#` BEFORE collapsing dot
// segments, so it sees one more real ".." than this generator's own
// construction logic ever accounted for, climbing one directory above the
// repo root (`file:///<parent-of-repo>/?a`). Closed by judging containment
// on the FINAL candidate href via `new URL()` (`isHrefContained`) instead of
// re-deriving the browser's own splitting/collapsing rules by hand.
describe('render.mjs — resolveDocLink refuses a trailing `..?x`/`..#x` escape (T-711 slice 4 B4)', () => {
  const cases = [
    ['[q](../../../..?a)', 'link'],
    ['[q](../../../..#a)', 'link'],
    ['![q](../../../%2e%2e?b)', 'image'],
    ['![q](../../../%2e%2e#b)', 'image'],
    ['[q](../../../.%2E?w)', 'link'],
    ['![q](../../../%2E.?w)', 'image'],
  ] as const

  for (const [md, kind] of cases) {
    it(`${JSON.stringify(md)} renders as plain text/alt, never a live ${kind === 'image' ? '<img>' : 'anchor'}`, () => {
      const { bodyHtml } = renderTicketBody(md)
      if (kind === 'image') {
        expect(bodyHtml).not.toContain('<img')
      } else {
        expect(bodyHtml).not.toContain('<a ')
      }
      expect(bodyHtml).toContain('q')
    })
  }

  it('resolveDocLink itself returns null for the exact QA repro forms (unit-level)', () => {
    expect(resolveDocLink('../../../..?a', 'docs/tickets/v1.10', '../../../..')).toBeNull()
    expect(resolveDocLink('../../../%2e%2e?b', 'docs/tickets/v1.10', '../../../..')).toBeNull()
  })

  // The PRD's own image path — QA's exact repro shape, a DIFFERENT
  // sourceDirRel ('docs/prd', 2 segments, not 'docs/tickets/v1.10', 3).
  it('a PRD image with a mixed dot + query suffix (QA repro shape) is refused too, regardless of sourceDirRel depth', () => {
    expect(resolveDocLink('../%2e%2e/.%2E?w', 'docs/prd', '../../../..')).toBeNull()
  })

  it('the same literal-dot depth WITHOUT a query/hash suffix still resolves normally (only the suffix shape is the bug — no over-eager rejection)', () => {
    // Exactly 3 "../" cancels docs/tickets/v1.10 entirely, landing (still
    // inside the repo) at its root — same depth as the B4 cases above, minus
    // the `?`/`#` suffix that hides the extra level.
    expect(resolveDocLink('../../../OUTSIDE.png', 'docs/tickets/v1.10', '../../../..')).not.toBeNull()
  })
})

// ---------- property test: every emitted href, judged the browser's own way (T-711 slice 4) ----------
// Not a reimplementation of the containment rule — `realBrowserPathnameInsideRepoRoot`
// (this file's own helper, above) calls `new URL()` directly against the
// REAL `viewer.html`/repo root (`generate.mjs`'s `OUTPUT_PATH`/`REPO_ROOT`,
// computed independently of anything `render.mjs` believes about itself).
// For every generated dot-segment/encoding × `?`/`#`/none suffix combination,
// at a boundary depth (3 = lands exactly at repo root, still contained; 4 =
// one level past it, must escape), `resolveDocLink`'s decision is checked
// against what a real browser would actually do with the SAME string —
// never against this generator's own opinion of what its normalize step
// meant.
describe('render.mjs — property: every resolveDocLink decision matches the browser\'s own new URL() resolution (T-711 slice 4)', () => {
  const SOURCE_DIR_REL = 'docs/tickets/v1.10' // 3 segments
  const REPO_ROOT_HREF = '../../../..'
  const DOT_ENCODINGS = ['..', '%2e%2e', '%2E%2E', '.%2e', '%2e.', '.%2E', '%2E.']
  const SUFFIXES = ['', '?tail', '#tail', '?q#f']
  const DEPTHS = [3, 4] as const // 3 = exactly at repo root (contained); 4 = one past it (escaped)

  for (const depth of DEPTHS) {
    for (const dot of DOT_ENCODINGS) {
      for (const suffix of SUFFIXES) {
        const href = `${Array(depth).fill(dot).join('/')}${suffix}`
        it(`depth=${depth} dot=${JSON.stringify(dot)} suffix=${JSON.stringify(suffix)} — href ${JSON.stringify(href)}`, () => {
          const rewritten = resolveDocLink(href, SOURCE_DIR_REL, REPO_ROOT_HREF)
          // Ground truth, computed twice, both times via `new URL()` alone —
          // never a reimplementation of it: (1) does the AUTHOR's original
          // href, resolved from the document's own real repo location,
          // escape the repo? That decides whether `resolveDocLink` should
          // have refused it at all. (2) if it DID emit something, does THAT
          // exact string, resolved from the real viewer.html, still land
          // inside the repo? (defense in depth on the emitted value itself).
          const shouldEscape = hrefEscapesRepoFromItsDoc(href, SOURCE_DIR_REL)
          if (shouldEscape) {
            expect(rewritten).toBeNull()
          } else {
            expect(rewritten).not.toBeNull()
            expect(realBrowserPathnameInsideRepoRoot(rewritten as string)).toBe(true)
          }
        })
      }
    }
  }
})

// ---------- isHrefContained itself, and the ticket/artifact fileHref channels it also gates (T-711 slice 4) ----------
describe('render.mjs — isHrefContained is the one check every emitted href is judged by', () => {
  it('true for a plain in-repo relative href, false once it climbs one level past repoRootHref', () => {
    expect(isHrefContained('../../../../docs/tickets/v1.10/T-1.md', { repoRootHref: '../../../..' })).toBe(true)
    expect(isHrefContained('../../../../../docs/tickets/v1.10/T-1.md', { repoRootHref: '../../../..' })).toBe(false)
  })

  it('rootSubpath narrows the allowed root (docs/ for a fileHref) without widening past repoRootHref', () => {
    expect(isHrefContained('../../../../docs/tickets/v1.10/T-1.md', { repoRootHref: '../../../..', rootSubpath: 'docs' })).toBe(true)
    // Still inside the repo root, but NOT inside docs/ — refused when a
    // fileHref channel asks for the narrower root.
    expect(isHrefContained('../../../../package.json', { repoRootHref: '../../../..', rootSubpath: 'docs' })).toBe(false)
  })

  it('the B4 QA-repro shape (trailing `..?x`) is refused by this same function directly', () => {
    expect(isHrefContained('../../../../..?a', { repoRootHref: '../../../..' })).toBe(false)
  })

  it('a real file:// URL is what it actually resolves against — verified against generate.mjs\'s own REPO_ROOT/OUTPUT_PATH', () => {
    const href = '../../../../docs/tickets/v1.10/T-1.md'
    expect(isHrefContained(href, { repoRootHref: '../../../..' })).toBe(true)
    expect(realBrowserPathnameInsideRepoRoot(href)).toBe(true)
  })
})

describe('render.mjs — ticket/artifact fileHref is gated by the same containment check (T-711 slice 4)', () => {
  it('an omitted-bucket ticket fileHref that (hypothetically) escaped docs/ would be dropped, not emitted', () => {
    const data = fixtureFor('')
    ;(data.tickets as any).omitted = [
      {
        bucket: 'v1.9',
        count: 1,
        bytes: 10,
        // encodeFsPathHref never lets `rel` escape in practice (it is always
        // a real readdir'd repo path) — this fixture exists only to prove
        // the GATE itself would catch it if it somehow did, per acceptance
        // line 1 ("ticket fileHref" is one of the four judged hrefs).
        tickets: [{ rel: '../outside-repo.md', frontmatter: { id: 'T-1', slug: 'x', type: 'impl', status: 'done', assignee: 'developer' } }],
      },
    ]
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const detail = extractDetailData(html)
    expect(detail.ticket['T-1'].fileHref).toBeUndefined()
  })

  it('a normal omitted-bucket ticket fileHref (a real repo path) still comes through unchanged', () => {
    const data = fixtureFor('')
    ;(data.tickets as any).omitted = [
      {
        bucket: 'v1.9',
        count: 1,
        bytes: 10,
        tickets: [{ rel: 'docs/tickets/v1.9/T-1.md', frontmatter: { id: 'T-1', slug: 'x', type: 'impl', status: 'done', assignee: 'developer' } }],
      },
    ]
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const detail = extractDetailData(html)
    expect(detail.ticket['T-1'].fileHref).toBe('../../../../docs/tickets/v1.9/T-1.md')
  })
})

// ---------- symlink escape under docs/artifacts (T-711 slice 2 B2) ----------
// QA re-pass: isContainedArtifactPath compared path.resolve STRINGS only, so
// a symlink (file or directory) physically living under docs/artifacts but
// pointing outside it still read as "contained" by string comparison alone
// — collect.mjs then inlined the outside file's real body. Fixed by
// resolving both sides with fs.realpathSync before the containment compare.
describe('collect.mjs — isContainedArtifactPath refuses a symlink under docs/artifacts pointing outside it (T-711 slice 2 B2)', () => {
  function buildSymlinkFixtureRepo() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-symlink-fixture-'))
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-symlink-outside-'))
    fs.mkdirSync(path.join(repoRoot, 'docs/artifacts/v1.10'), { recursive: true })
    fs.writeFileSync(path.join(outsideDir, 'OUTSIDE-FILE.md'), '# TOP SECRET outside file — must never be read into the viewer')
    fs.mkdirSync(path.join(outsideDir, 'outside-sub'), { recursive: true })
    fs.writeFileSync(path.join(outsideDir, 'outside-sub', 'nested.md'), '# TOP SECRET nested outside file')
    // A symlinked FILE, physically under docs/artifacts, pointing to a file outside the repo entirely.
    fs.symlinkSync(path.join(outsideDir, 'OUTSIDE-FILE.md'), path.join(repoRoot, 'docs/artifacts/v1.10/evil-file.md'))
    // A symlinked DIRECTORY, physically under docs/artifacts, pointing to a directory outside the repo.
    fs.symlinkSync(path.join(outsideDir, 'outside-sub'), path.join(repoRoot, 'docs/artifacts/v1.10/evil-dir'))
    // A legitimate symlink that stays INSIDE docs/artifacts (a second bucket's real file) — must still be followed.
    fs.mkdirSync(path.join(repoRoot, 'docs/artifacts/v1.9'), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/v1.9/real.md'), '# a real in-repo artifact')
    fs.symlinkSync(path.join(repoRoot, 'docs/artifacts/v1.9/real.md'), path.join(repoRoot, 'docs/artifacts/v1.10/inside-link.md'))
    return { repoRoot, outsideDir }
  }

  it('a symlinked FILE under docs/artifacts pointing outside the repo is refused', () => {
    const { repoRoot, outsideDir } = buildSymlinkFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, 'v1.10', 'evil-file.md')).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('a symlinked DIRECTORY under docs/artifacts pointing outside the repo is refused for a file inside it', () => {
    const { repoRoot, outsideDir } = buildSymlinkFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, 'v1.10', 'evil-dir/nested.md')).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('a symlink that stays INSIDE docs/artifacts may still be followed', () => {
    const { repoRoot, outsideDir } = buildSymlinkFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, 'v1.10', 'inside-link.md')).toBe(true)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('collectArtifacts end-to-end: a manifest row through an outside-pointing symlink is dropped, never inlined; an inside-pointing one still is', () => {
    const { repoRoot, outsideDir } = buildSymlinkFixtureRepo()
    try {
      const manifest = {
        entries: [
          { bucket: 'v1.10', path: 'evil-file.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
          { bucket: 'v1.10', path: 'evil-dir/nested.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
          { bucket: 'v1.10', path: 'inside-link.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
        ],
      }
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/manifest.json'), JSON.stringify(manifest))
      const { entries } = collectArtifacts(repoRoot)
      expect(entries.length).toBe(1)
      expect(entries[0].fields.path).toBe('inside-link.md')
      expect(entries.some((e: any) => String(e.body ?? '').includes('TOP SECRET'))).toBe(false)
      expect(entries[0].body).toContain('a real in-repo artifact')
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })
})

// ---------- manifest path containment (F5) ----------

describe('collect.mjs — collectArtifacts refuses a manifest bucket/path resolving outside docs/artifacts (F5)', () => {
  function buildFixtureRepo() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-collect-fixture-'))
    fs.mkdirSync(path.join(repoRoot, 'docs/artifacts/v1.10'), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, 'secret.txt'), 'TOP SECRET — must never be read into the viewer')
    fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/v1.10/ok.md'), '# a legitimate artifact')
    return repoRoot
  }

  it('isContainedArtifactPath: true for a path inside docs/artifacts, false for one escaping it', () => {
    const repoRoot = buildFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, 'v1.10', 'ok.md')).toBe(true)
      expect(isContainedArtifactPath(repoRoot, 'v1.10', '../../../secret.txt')).toBe(false)
      expect(isContainedArtifactPath(repoRoot, '../../', 'secret.txt')).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('a manifest row whose path walks out via ../ is dropped entirely — never inlined, never a fileHref', () => {
    const repoRoot = buildFixtureRepo()
    try {
      const manifest = {
        entries: [
          { bucket: 'v1.10', path: 'ok.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
          { bucket: 'v1.10', path: '../../../secret.txt', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
        ],
      }
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/manifest.json'), JSON.stringify(manifest))
      const { entries } = collectArtifacts(repoRoot)
      expect(entries.length).toBe(1)
      expect(entries[0].fields.path).toBe('ok.md')
      expect(entries.some((e: any) => String(e.body ?? '').includes('TOP SECRET'))).toBe(false)
      expect(entries.some((e: any) => e.diskRel.includes('secret.txt'))).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('a manifest row whose BUCKET walks out via ../ is also dropped', () => {
    const repoRoot = buildFixtureRepo()
    try {
      const manifest = { entries: [{ bucket: '../../', path: 'secret.txt', kind: 'doc', status: 'approved' }] }
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/manifest.json'), JSON.stringify(manifest))
      const { entries } = collectArtifacts(repoRoot)
      expect(entries.length).toBe(0)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

// ---------- %-encoded/mixed dot-segment manifest escape (T-711 slice 3 B3) ----------
// QA re-pass of 936baeb (fixture under os.tmpdir, headless Chrome): a
// manifest row {bucket:'v1', path:'%2E%2E/%2e./.%2e/%2e%2e/OUTSIDE.md'} names
// no file on disk, so realpathSync threw ENOENT inside isContainedArtifactPath
// and it fell back to a string-only check that never understood %-encoding —
// true. artifactDetailEntries then kept the %2e%2e segments verbatim in the
// emitted fileHref, and a real browser decoded them as a real ".." on
// navigation, climbing one directory above the fixture's docs/artifacts root.

describe('collect.mjs — isContainedArtifactPath refuses a %-encoded/mixed dot-segment escape even when nothing exists on disk yet (T-711 slice 3 B3)', () => {
  function buildFixtureRepo() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-b3-fixture-'))
    fs.mkdirSync(path.join(repoRoot, 'docs/artifacts/v1'), { recursive: true })
    return repoRoot
  }

  it('a %-encoded/mixed dot-segment PATH is refused (QA repro form, exact fixture row)', () => {
    const repoRoot = buildFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, 'v1', '%2E%2E/%2e./.%2e/%2e%2e/OUTSIDE.md')).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('a %-encoded/mixed dot-segment BUCKET is refused the same way', () => {
    const repoRoot = buildFixtureRepo()
    try {
      expect(isContainedArtifactPath(repoRoot, '%2E%2E/%2e./.%2e/%2e%2e', 'OUTSIDE.md')).toBe(false)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('still true for a legitimate in-repo path with no dot segment at all — no regression', () => {
    const repoRoot = buildFixtureRepo()
    try {
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/v1/ok.md'), '# ok')
      expect(isContainedArtifactPath(repoRoot, 'v1', 'ok.md')).toBe(true)
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('collectArtifacts end-to-end: a manifest row with the %-encoded escape is dropped entirely — never inlined, never a fileHref', () => {
    const repoRoot = buildFixtureRepo()
    try {
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/v1/ok.md'), '# ok')
      const manifest = {
        entries: [
          { bucket: 'v1', path: 'ok.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
          { bucket: 'v1', path: '%2E%2E/%2e./.%2e/%2e%2e/OUTSIDE.md', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
        ],
      }
      fs.writeFileSync(path.join(repoRoot, 'docs/artifacts/manifest.json'), JSON.stringify(manifest))
      const { entries } = collectArtifacts(repoRoot)
      expect(entries.length).toBe(1)
      expect(entries[0].fields.path).toBe('ok.md')
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

// ---------- fileHref: fresh per-segment encoding, never safeEncodeURI pass-through (T-711 slice 3) ----------
// fileHref is built from a REAL FILESYSTEM PATH (a ticket/artifact rel path),
// never authored markdown — so a literal "%" byte already in a real
// filename (a file actually named `a%20b.html`) must itself be escaped to
// `%25` like any other special character. safeEncodeURI's pass-through
// (correct for resolveDocLink, where an AUTHOR may have written an
// intentional %-escape into a markdown link) was wrong here: it left `%20`
// untouched, so a browser decoded it back to a space on navigation and
// opened `a b.html` — a file that does not exist.

describe('render.mjs — fileHref encodes each filesystem path segment fresh (T-711 slice 3, "a%20b.html" regression)', () => {
  it('encodeFsPathHref escapes a literal "%" so one browser-side decode round-trips back to the real filename', () => {
    const href = encodeFsPathHref('a%20b.html')
    expect(href).toBe('a%2520b.html')
    expect(decodeURIComponent(href)).toBe('a%20b.html')
  })

  it('encodeFsPathHref preserves "/" as a segment separator, never escaping it to %2F', () => {
    expect(encodeFsPathHref('sub/dir/a b.html')).toBe('sub/dir/a%20b.html')
  })

  it('artifactDetailEntries (via renderPage): a real file named a%20b.html gets a fileHref that opens itself, not "a b.html"', () => {
    const data = fixtureFor('')
    data.artifacts = {
      entries: [
        {
          fields: { bucket: 'v1.10', path: 'a%20b.html', kind: 'doc', status: 'approved', ticket: 'T-1', lang: 'ko', added_at: '2026-09-27' },
          diskRel: 'docs/artifacts/v1.10/a%20b.html',
          inlined: false,
        },
      ],
    }
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const detail = extractDetailData(html)
    const entry = detail.artifact['v1.10/a%20b.html']
    expect(decodeURIComponent(entry.fileHref)).toMatch(/\/a%20b\.html$/)
  })

  it('ticketDetailEntries (via renderPage): an omitted-bucket ticket row whose real path segment contains a literal "%" opens itself', () => {
    const data = fixtureFor('')
    ;(data.tickets as any).omitted = [
      {
        bucket: 'v1.9',
        count: 1,
        bytes: 10,
        tickets: [{ rel: 'docs/tickets/v1.9/T-1%2.md', frontmatter: { id: 'T-1', slug: 'x', type: 'impl', status: 'done', assignee: 'developer' } }],
      },
    ]
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const detail = extractDetailData(html)
    expect(decodeURIComponent(detail.ticket['T-1'].fileHref)).toMatch(/T-1%2\.md$/)
  })
})

// ---------- T-713: empty stores + numeric version equivalence ----------

describe('collect.mjs — T-713 fixtures', () => {
  function buildRepo() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-t713-fixture-'))
  }

  it('collectArtifacts: a missing manifest.json is zero entries, not a throw', () => {
    const repoRoot = buildRepo()
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs/artifacts'), { recursive: true })
      // No manifest.json written at all.
      expect(() => collectArtifacts(repoRoot)).not.toThrow()
      expect(collectArtifacts(repoRoot)).toEqual({ entries: [] })
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('collectWiki: docs/wiki with only index.md (or nothing) collects zero pages, never a throw', () => {
    const repoRoot = buildRepo()
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs/wiki'), { recursive: true })
      fs.writeFileSync(path.join(repoRoot, 'docs/wiki/index.md'), '# index')
      expect(collectWiki(repoRoot)).toEqual([])
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  // T-713: contracts §Fixed-paths "`v1` ≡ `v1.0.0`" — a ticket bucket
  // directory spelled `v1.10.0` on disk is the SAME version as po-state's own
  // `v1.10` string, and must land in `included` (full body), never in
  // `omitted` (frontmatter-only) as if it were some other, non-current round.
  it('collectTickets: a `v1.10.0` bucket directory matches po-state version `v1.10` (numeric equality, not string equality)', () => {
    const repoRoot = buildRepo()
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs/tickets/v1.10.0'), { recursive: true })
      fs.writeFileSync(
        path.join(repoRoot, 'docs/tickets/v1.10.0/T-1.md'),
        '---\nid: T-1\nslug: fixture\ntype: impl\nstatus: open\nassignee: developer\n---\n\n## problem\n',
      )
      const { included, omitted } = collectTickets(repoRoot, 'v1.10')
      expect(omitted).toEqual([])
      expect(included.length).toBe(1)
      expect(included[0].bucket).toBe('v1.10.0')
      expect(included[0].frontmatter.id).toBe('T-1')
      expect(included[0].body).toBeDefined() // full body — never frontmatter-only, which `ticketLite` never attaches
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  // Non-vacuous control: a bucket that really is a DIFFERENT version (not
  // just a different spelling of the same one) must still land in `omitted`
  // — or the numeric-equality fix above could be passing only because
  // everything is now (wrongly) treated as current.
  it('checker fixture: a genuinely different version bucket (v1.11) still lands in `omitted`, not `included`', () => {
    const repoRoot = buildRepo()
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs/tickets/v1.11'), { recursive: true })
      fs.writeFileSync(
        path.join(repoRoot, 'docs/tickets/v1.11/T-2.md'),
        '---\nid: T-2\nslug: fixture-2\ntype: impl\nstatus: open\nassignee: developer\n---\n\n## problem\n',
      )
      const { included, omitted } = collectTickets(repoRoot, 'v1.10')
      expect(included).toEqual([])
      expect(omitted.length).toBe(1)
      expect(omitted[0].bucket).toBe('v1.11')
      expect(omitted[0].tickets[0].frontmatter.id).toBe('T-2')
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

// ---------- strict CSP meta (F6) ----------

describe('renderPage — carries a strict CSP meta with no remote loads and a script hash (F6)', () => {
  it('emits a Content-Security-Policy meta with default-src none and a sha256 script-src', () => {
    const { html } = renderTicketBody('plain body')
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)
    expect(m).not.toBeNull()
    const content = m![1]
    expect(content).toContain("default-src 'none'")
    expect(content).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/)
    // No remote scheme anywhere in the policy — only 'none'/'self'/'unsafe-inline'/data:/sha256 tokens.
    expect(content).not.toMatch(/https?:/)
  })

  it('the CSP meta appears before the <style> and <script> blocks it governs', () => {
    const { html } = renderTicketBody('plain body')
    const metaIdx = html.indexOf('Content-Security-Policy')
    const styleIdx = html.indexOf('<style>')
    const scriptIdx = html.indexOf('<script')
    expect(metaIdx).toBeGreaterThan(-1)
    expect(metaIdx).toBeLessThan(styleIdx)
    expect(metaIdx).toBeLessThan(scriptIdx)
  })
})
