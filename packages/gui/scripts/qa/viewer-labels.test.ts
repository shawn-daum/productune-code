// T-706 acceptance line 4: "a test fails if a user-visible string is
// hard-coded in render.mjs outside labels.mjs (not just Hangul — any
// user-visible label), with a fixture proving it fires." Plus fixture
// coverage for the three T-705 §G structures render.mjs added: the artifact
// size column, the closed-PRD title column (with its first-line fallback),
// and the count badges wiki/feature/artifact/PRD-closed were missing.
//
// WHY A REAL PARSER (TypeScript's own, already a devDependency here — tsc
// runs in this package's own `build` script), NOT A HAND-ROLLED REGEX
//
// render.mjs's HTML is built almost entirely from NESTED template literals
// (a `${...}` inside one template routinely contains another backtick
// template — e.g. `TICKET.tableHeaders.map((h) => \`<th>${h}</th>\`)` sitting
// inside the outer `<table>...</table>` template). A naive
// `/`([^`]*)`/` -style scan matches the FIRST backtick it finds as the
// closing one, which is the nested template's own backtick — cutting every
// outer segment at the wrong point and misattributing inner JS/HTML as if it
// were one outer string (measured while prototyping this file). TypeScript's
// scanner walks the real grammar, so a template's static text segments
// (`head` + each `templateSpans[i].literal`) are recovered correctly however
// deeply they nest — doctrine #2, don't hand-roll a lexer this repo already
// ships one of.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { renderPage } from '../../viewer/lib/render.mjs'
import { generate, missingMetaRootReason } from '../../viewer/generate.mjs'
import { WIKI, FEATURE } from '../../viewer/lib/labels.mjs'

// T-718: the real generated page, built HERE in-process rather than read
// back off the gitignored `viewer/viewer.html` (a fresh checkout never has
// it on disk) — see viewer-html.test.ts's header for the full rationale.
// Built once and reused by every test below.
//
// T-718 slice 2: a detached code-only checkout has no meta project beside it
// (see viewer-html.test.ts's header) — `generate()` throws ENOENT there.
// Checked once, up front, so only the one test below that needs `realHtml`
// skips (with a visible reason); every fixture-based case here still runs.
const metaMissingReason = missingMetaRootReason()
let realHtml: string
beforeAll(async () => {
  if (metaMissingReason) return
  ;({ html: realHtml } = await generate())
}, 30000)

const RENDER_MJS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../viewer/lib/render.mjs')

// These two declarations are legitimate opaque-blob exceptions, not gaps in
// the label discipline: `TEMPLATE_CSS` is stylesheet text (CSS keywords, not
// UI copy) and `INTERACTION_SCRIPT` is browser-side JS SOURCE CODE embedded
// as a string (its own user-visible pieces are already interpolated in from
// labels.mjs — `DETAIL_FIELD_LABELS`, `FILE_HREF_NOTE` — the surrounding JS
// syntax is not copy). Excluding them by declaration name, not by content, so
// this checker cannot be fooled by *wrapping* a real hard-coded label in
// either of those two constants.
const OPAQUE_BLOB_DECLARATIONS = new Set(['TEMPLATE_CSS', 'INTERACTION_SCRIPT'])

// A dev-facing diagnostic message (`templateGuardErrors`'s own guard-failure
// text, e.g. "template CSS contains a hex or rgb() literal") is real English
// prose, but it is a generation-time/test-time error string — it is thrown
// or collected, never written into viewer.html for a reader to see. The
// idiom this file's OWN guard functions use for that is `errors.push(...)`;
// excluding a literal by that call shape (not by the two guard functions'
// names) keeps this general enough to cover a future guard written the same
// way, without re-opening the door for a real label to hide behind `.push(`.
function isPushCallArgument(node: ts.Node): boolean {
  const parent = node.parent
  return (
    !!parent &&
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    parent.expression.name.text === 'push'
  )
}

function isInsideOpaqueBlobDeclaration(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && OPAQUE_BLOB_DECLARATIONS.has(n.name.text)) return true
  }
  return false
}

const HANGUL_RUN = /[가-힣]{2,}/
// A hard-coded ENGLISH label is the harder case (T-706 acceptance: "not just
// Hangul"). Markup/CSS skeleton text (`class="pill pill-heading-"`,
// `<td class="`) is exactly what most of render.mjs's own static template
// segments look like, and it routinely contains 2+ space-separated
// letter-runs too (measured while prototyping: a naive "two words" check
// flagged 88 of this file's own legitimate segments). Real prose almost
// always contains an English function word (article/preposition/pronoun) —
// an HTML/CSS identifier never does, because identifiers are hyphenated or
// camelCase tokens, not sentences. Requiring at least one STOPWORD among 3+
// extracted words is what gets this down to zero false positives against
// the real file (verified) while still catching an actual sentence.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'no', 'not', 'for',
  'this', 'that', 'it', 'you', 'your', 'please', 'click', 'here', 'open',
  'close', 'see', 'and', 'or', 'if', 'with', 'file', 'does', 'never',
  'always', 'each', 'every',
])
// `(?<![\w-])…(?![\w-])` — a letter-run not glued to a hyphen or another word
// char on either side, so "close" inside the class name "detail-panel-close"
// is never extracted as the standalone word "close" (measured: without this
// boundary, that exact class name self-triggered the stopword check).
function extractWords(s: string): string[] {
  return s.match(/(?<![\w-])[A-Za-z]{2,}(?![\w-])/g) ?? []
}
function looksLikeEnglishProse(s: string): boolean {
  const words = extractWords(s)
  return words.length >= 3 && words.some((w) => STOPWORDS.has(w.toLowerCase()))
}

/**
 * Every static text segment of `source` (a render.mjs-shaped ES module) that
 * looks like a user-visible label rather than markup/CSS/JS syntax —
 * empty when the label discipline holds. Segments inside an
 * `OPAQUE_BLOB_DECLARATIONS` constant or a `something.push(...)` call are
 * exempt (see the two comments above); every other string literal,
 * no-substitution template literal, and template-expression static span
 * (the parts between a template's `${...}` holes) is checked.
 */
export function findHardcodedUserVisibleStrings(source: string): string[] {
  const sourceFile = ts.createSourceFile('render.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const flagged: string[] = []

  function check(text: string) {
    if (HANGUL_RUN.test(text) || looksLikeEnglishProse(text)) flagged.push(text)
  }

  function visit(node: ts.Node) {
    if (!isInsideOpaqueBlobDeclaration(node)) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isPushCallArgument(node)) {
        check(node.text)
      } else if (ts.isTemplateExpression(node) && !isPushCallArgument(node)) {
        check(node.head.text)
        for (const span of node.templateSpans) check(span.literal.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return flagged
}

describe('viewer/lib/render.mjs — no hard-coded user-visible string outside labels.mjs (T-706)', () => {
  it('the real render.mjs carries none', () => {
    const source = fs.readFileSync(RENDER_MJS_PATH, 'utf8')
    expect(findHardcodedUserVisibleStrings(source)).toEqual([])
  })

  // Non-vacuous controls — each must actually be catchable, or the assertion
  // above could be passing for the wrong reason.
  it('checker fixture: a hard-coded Korean label is caught', () => {
    const broken = "function f() { return `<span>${'아직 없어요'}</span>` }"
    expect(findHardcodedUserVisibleStrings(broken)).toEqual(['아직 없어요'])
  })

  it('checker fixture: a hard-coded English sentence-shaped label is caught (T-706: "not just Hangul")', () => {
    const broken = "function f() { return '<p>' + 'There is no data for this store' + '</p>' }"
    expect(findHardcodedUserVisibleStrings(broken)).toContain('There is no data for this store')
  })

  it('checker fixture: markup/CSS/class-name text (no Hangul, no stopword) is left alone', () => {
    const clean = 'const x = `<div class="detail-panel-close pill-heading-1" data-group-select="backlog">`'
    expect(findHardcodedUserVisibleStrings(clean)).toEqual([])
  })

  it('checker fixture: a dev-facing guard message pushed onto an errors array is exempt (generation-time, never rendered)', () => {
    const clean = "function g(errors) { errors.push('this string is not visible to any viewer reader') }"
    expect(findHardcodedUserVisibleStrings(clean)).toEqual([])
  })
})

// ---------- T-705 §G structures (fixture coverage) ----------

const structureFixtureData = {
  currentVersion: 'v1.10',
  prd: {
    current: { body: '' },
    closed: [
      { rel: 'docs/prd/versions/v1.9.md', name: 'v1.9.md', body: '## v1.9 real heading\n\nprose.' },
      // T-705 §G: no `#`/`##` heading — the real shape of
      // docs/prd/versions/v1.1.md/v1.2.1.md — falls back to the first
      // non-empty line (acceptance line 3).
      { rel: 'docs/prd/versions/v1.1.md', name: 'v1.1.md', body: '\n  stub round first line \n\nmore text' },
    ],
  },
  tickets: { included: [], omitted: [] },
  wiki: [
    { rel: 'docs/wiki/decision--a.md', frontmatter: { title: 'a', type: 'decision', status: 'live' }, body: 'x' },
    { rel: 'docs/wiki/decision--b.md', frontmatter: { title: 'b', type: 'decision', status: 'live' }, body: 'x' },
  ],
  features: [{ rel: 'docs/features/f.md', frontmatter: { feature: 'f', title: 'F', status: 'live', spec_since: 'v1.1' }, body: 'x' }],
  artifacts: {
    entries: [
      {
        fields: { bucket: 'v1.10', path: 'a.md', ticket: 'T-1', kind: 'doc', status: 'todo', lang: 'ko', added_at: '2026-09-26' },
        diskRel: 'docs/artifacts/v1.10/a.md',
        inlined: true,
        bytes: 2048,
        body: 'x',
      },
    ],
  },
}

function renderStructureFixture(): string {
  return renderPage({ data: structureFixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
}

describe('viewer/lib/render.mjs — T-705 §G structures the approved mockup showed', () => {
  it('artifact table has a size column, formatted from bytes', () => {
    const html = renderStructureFixture()
    expect(html).toContain('<th>크기</th>')
    expect(html).toContain('<td class="num-col">2.0 KB</td>')
  })

  // T-709 결정 2: no more closed-round TABLE / separate title extraction —
  // each round is now its own sidebar row (labeled by its version id),
  // newest round first, whose pane renders that round's body DIRECTLY; the
  // round's own first heading (or, for a stub, its first line) shows up
  // through that body's own markdown rendering, never a second, separately
  // extracted title column.
  it('each closed PRD round is its own sidebar group, labeled by version id, newest first', () => {
    const html = renderStructureFixture()
    expect(html).toContain('data-group-select="v1.9"')
    expect(html).toContain('data-group-select="v1.1"')
    expect(html.indexOf('data-group-select="v1.9"')).toBeLessThan(html.indexOf('data-group-select="v1.1"'))
  })

  it("a closed round's own heading renders inline in its own pane, read from its own body", () => {
    const html = renderStructureFixture()
    expect(html).toContain('<h2 class="pill pill-heading-2">v1.9 real heading</h2>')
  })

  it('a closed round with no heading still renders its first non-empty line as prose in its own pane', () => {
    const html = renderStructureFixture()
    expect(html).toContain('<p>stub round first line</p>')
  })

  it('wiki/feature/artifact main panes each carry a count badge (T-705 §G: only ticket/home had one before); PRD closed rounds carry none (T-709 결정 2 — every round is "1 document", a constant count worth no badge)', () => {
    const html = renderStructureFixture()
    // wiki: one group ("decision (decision)") with 2 pages, unit 장
    expect(html).toMatch(/class="count-badge">결정 \(decision\) · <b>2<\/b>장/)
    // feature: 1 page, unit 개
    expect(html).toMatch(/class="count-badge">기능 · <b>1<\/b>개/)
    // artifact: bucket "v1.10", suffix " 버킷", 1 entry, unit 건
    expect(html).toMatch(/class="count-badge">v1\.10 버킷 · <b>1<\/b>건/)
  })

  it.skipIf(metaMissingReason)(
    `holds for the real generated viewer.html, not only the fixture${metaMissingReason ? ` — SKIPPED: ${metaMissingReason}` : ''}`,
    () => {
      expect(realHtml).toContain('<th>크기</th>')
      expect(realHtml).toContain('<th>제목</th>')
      expect(realHtml).toMatch(/class="count-badge">/)
    },
  )
})

// ---------- T-707: WIKI.empty / FEATURE.empty / PRD.empty second lines ----------

const emptyGroupFixtureData = {
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [] }, // closed: [] — PRD's "closed" group always exists (prdStoreInner), so this is reachable
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [], // featureStoreInner always builds its single "all" group regardless of count, so this is reachable
  artifacts: { entries: [] },
}

function renderEmptyGroupFixture(): string {
  return renderPage({ data: emptyGroupFixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
}

describe('viewer/lib/render.mjs — T-707: an empty group shows the Designer\'s two-line empty note', () => {
  it('FEATURE.empty (both lines, verbatim, unescaped as HTML) renders when the store has zero specs', () => {
    const html = renderEmptyGroupFixture()
    expect(html).toContain(`<p class="v-note">${FEATURE.empty}</p>`)
    expect(html).toContain('기능 스펙이 없어요')
    expect(html).toContain('Designer 가 스펙 파일을 만들면 여기 나타나요')
  })

  // T-709 결정 2: PRD.empty (the old "닫힌 버전이 없다" table caption) is
  // gone — zero closed rounds just means the PRD store has one group ("open"
  // only), which groupedStore's own generic single-group rule (T-708 결함 7)
  // already renders as a static "그룹 없음" line, never a table — so there is
  // no PRD-specific empty-state copy left to write or test.
  it('zero closed rounds collapses the PRD store to its single "open" group (T-708 결함 7\'s generic rule — no PRD-specific empty copy)', () => {
    const html = renderEmptyGroupFixture()
    const prdMatch = /<section[^>]*data-store="prd"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(prdMatch).not.toBeNull()
    expect(prdMatch![0]).toContain('그룹 없음')
    expect(prdMatch![0]).not.toContain('data-group-select')
  })

  it('WIKI.empty itself carries the Designer\'s exact two-line value (verbatim, T-707 §outcome)', () => {
    expect(WIKI.empty).toBe(
      '이 묶음에는 위키 문서가 없어요.<br><span style="font-size:11px;">이 분류로 문서가 하나라도 쓰이면 여기 나타나요.</span>',
    )
  })

  // T-713: closes the reachability gap the comment above used to document —
  // wikiStoreInner (T-706) built its sidebar groups only from frontmatter
  // `type` values actually present in `pages`, so an entirely-empty wiki
  // store produced ZERO groups rather than one empty group, and WIKI.empty
  // was never reached. Fixed: one synthetic all-store group renders when
  // `wiki: []`.
  it('an entirely empty wiki store still renders one group carrying WIKI.empty', () => {
    const html = renderEmptyGroupFixture()
    const storeMatch = /<section[^>]*data-store="wiki"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(storeMatch).not.toBeNull()
    expect(storeMatch![0]).toContain(`<p class="v-note">${WIKI.empty}</p>`)
    expect(storeMatch![0]).toContain('이 묶음에는 위키 문서가 없어요')
  })

  // T-713: same reachability gap, same fix, for the artifact store — a
  // missing manifest.json (collect.mjs's own zero-entries case) or a
  // version with no artifacts yet leaves `artifacts.entries` empty, which
  // used to build zero manifest-bucket groups.
  it('an entirely empty artifact store still renders one group carrying ARTIFACT.empty', () => {
    const html = renderEmptyGroupFixture()
    const storeMatch = /<section[^>]*data-store="artifact"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(storeMatch).not.toBeNull()
    expect(storeMatch![0]).toContain('아직 산출물이 없어요')
  })
})
