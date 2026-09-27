// T-689 acceptance line 3, property 1 of 3: "opens from `file://` with zero
// network requests."
//
// MEASURED (2026-09-26, d-T689-l3-20260926b): a real browser CANNOT be spawned
// from this vitest process to assert this property at runtime. `chromium.launch()`
// (`@playwright/test`) spawns its child with `detached: true`, which
// `tests/isolation-rules.cjs` rule 6 refuses outright — by design, no exemption,
// not even for a static-HTML-only launch. Routing around rule 6 with a manual
// `child_process.spawn(..., { detached: false })` does not help either: any
// Chromium-family launch with `--user-data-dir` (required for real isolation —
// Chromium's own default profile dir ignores a sandboxed `HOME` and would write
// the developer's REAL `~/Library/Application Support/...`) is "app-shaped" per
// rule 2's signal 1, which routes it through the WINDOW RULE — refused on this
// host regardless of `--headless`, because the guard cannot distinguish a
// headless launch from one that would open a real window, and is deliberately
// strict about it (`docs/wiki/fact--qa-cua-vm.md`). That gate opens only with
// `PRODUCTUNE_ALLOW_WINDOWS=1`, which this machine reserves for the VM.
//
// So the two properties that need a live renderer (no console error,
// `document.fonts.check`) moved to `tests/ds-html.window.spec.ts`, a Playwright
// spec tagged `@window` — the SAME established pattern every other
// window-needing assertion in this suite already uses (grep-inverted out of a
// host `pnpm smoke` run, executed for real in the VM where
// `PRODUCTUNE_ALLOW_WINDOWS=1`). This file keeps the one property that a live
// renderer was never actually required for: "zero network requests" is a
// static fact about what URLs the HTML/CSS/JS ever reference, checkable without
// executing anything.
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DS_HTML = path.resolve(__dirname, '../../ds/design-system.html')

/**
 * Every reference in `html` that would resolve to a NETWORK fetch: an absolute
 * `http(s)://` URL, or a protocol-relative `//host/...` URL (which the `file://`
 * origin resolves against a real scheme, not the local disk). A same-document
 * `data:` URI, a relative path, or a `file://` link is not a network reference —
 * exactly the zero-external-reference contract `ds/generate.mjs` is meant to hold
 * (fonts inlined as `data:font/woff2;base64,...`, see `ds/design-system.html`).
 */
export function findNetworkReferences(html: string): string[] {
  const found: string[] = []
  const schemeRe = /\bhttps?:\/\/[^\s"'()<>]+/gi
  const protocolRelativeRe = /(^|[\s"'(=])\/\/[a-z0-9](?:[a-z0-9.-]*\.[a-z]{2,}|[a-z0-9-]*:\d+)[^\s"')<>]*/gi
  for (const m of html.matchAll(schemeRe)) found.push(m[0])
  for (const m of html.matchAll(protocolRelativeRe)) found.push(m[0].replace(/^[\s"'(=]/, ''))
  return found
}

describe('ds/design-system.html — zero network requests (static)', () => {
  it('exists', () => {
    expect(existsSync(DS_HTML), `${DS_HTML} does not exist — run \`pnpm --filter @productune/gui ds\` first`).toBe(
      true,
    )
  })

  it('references no network URL', () => {
    const html = readFileSync(DS_HTML, 'utf8')
    expect(findNetworkReferences(html)).toEqual([])
  })

  // Non-vacuous: a fixture that DOES carry a network reference must fail the
  // same check the real file passes — otherwise "references no network URL"
  // above could pass for the wrong reason (e.g. a checker that never matches
  // anything).
  it('checker fixture: an external <script src> is caught', () => {
    const broken = '<!doctype html><html><head></head><body><script src="https://cdn.example.com/a.js"></script></body></html>'
    expect(findNetworkReferences(broken)).toEqual(['https://cdn.example.com/a.js'])
  })

  it('checker fixture: a protocol-relative stylesheet is caught', () => {
    const broken = '<!doctype html><html><head><link rel="stylesheet" href="//fonts.example.com/a.css"></head></html>'
    expect(findNetworkReferences(broken).length).toBeGreaterThan(0)
  })

  it('checker fixture: a same-document data: URI is not a network reference', () => {
    const clean =
      '<!doctype html><html><head><style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style></head></html>'
    expect(findNetworkReferences(clean)).toEqual([])
  })
})
