/**
 * escapeHatch.test.tsx — T-434, Acceptance line 2
 *
 * "The escape control is present on every internal pane that can host a URL."
 *
 * Two halves, because either alone is a claim rather than a proof:
 *
 *  A. ENUMERATION — a total `Record<TabType, …>` classifying all 29 pane kinds
 *     as URL-hosting or not. Being total, it is a COMPILE error (tsc --noEmit
 *     runs in `pnpm build`) to add a pane kind to the union without deciding
 *     which side it falls on. That is what keeps the answer true after today.
 *
 *  B. RENDER — every kind classified `hosts-url` is rendered through
 *     react-dom/server and asserted to emit `data-escape-hatch="system-browser"`.
 *     A pane could be classified correctly and still ship without the control;
 *     this catches that.
 *
 * "Can host a URL" = the pane loads content FROM a URL (a <webview> or an
 * <iframe> pointed at one). A pane that merely renders a clickable <a> is a URL
 * SOURCE, not a host — its links are routed by MdRenderer → main's `url:route`,
 * so a link can never strand a login inside it.
 *
 * renderToStaticMarkup in the node environment: same technique and constraints
 * as MdRenderer.href.test.tsx — effects do not run, and the zustand store is
 * vitest.setup-mocked, so these components must not touch either during render.
 */

import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TabType } from '../../../../store/workspace'

// These two panes read the store DURING render (`useWorkspace(s => s.tabDragActive)`
// and friends), and vitest.setup's blanket zustand mock leaves `create()(…)`
// returning undefined — so the hook itself must be stubbed here. A selector
// returning undefined is exactly the falsy default these components expect.
vi.mock('../../../../store/workspace', () => {
  const store = { getState: () => ({ openTab: vi.fn(), closeTab: vi.fn(), setTabMeta: vi.fn() }) }
  const useWorkspace: any = () => undefined
  useWorkspace.getState = store.getState
  return { useWorkspace, RESTORABLE_TAB_TYPES: new Set() }
})

import BrowserTab from './BrowserTab'
import HtmlViewer from './HtmlViewer'

/** The marker every tier-③ control carries. */
const HATCH = 'data-escape-hatch="system-browser"'

// ── A. Enumeration ────────────────────────────────────────────────────────────

type UrlHosting =
  /** Loads remote/file content FROM a URL — must carry the escape hatch. */
  | 'hosts-url'
  /** Renders local data or app state; no URL is ever loaded into it. */
  | 'no-url'

/**
 * Total over `TabType`. Removing a line, or adding a pane kind to the union
 * without a line here, fails `tsc --noEmit`.
 *
 * Only two kinds host a URL, and that is a property of the codebase, not an
 * opinion: `<webview>` appears exactly once (BrowserTab) and `<iframe>` exactly
 * once (HtmlViewer's local-preview branch). `preview` additionally delegates to
 * BrowserTab when its `url` prop is http(s) — one component, both covered.
 */
const PANE_URL_HOSTING: Record<TabType, UrlHosting> = {
  // ── The two URL hosts ──
  browser: 'hosts-url',   // <webview src=url>
  preview: 'hosts-url',   // http(s) → BrowserTab; local → <iframe srcdoc> of a file:// path

  // ── Markdown / prose viewers: render <a> links, do not load URLs. Clicks go
  //    through MdRenderer → routeThenOpen → main's `url:route`. ──
  markdown: 'no-url',
  'artifact-md': 'no-url',
  'ticket-detail': 'no-url',
  'ticket-review': 'no-url',
  'persona-def': 'no-url',
  'doctrine-file': 'no-url',

  // ── Local data / app state renderers ──
  'version-detail': 'no-url',
  'version-history': 'no-url',
  'history-detail': 'no-url',
  'artifact-mermaid': 'no-url',   // local SVG from mermaid.render, securityLevel strict
  'artifact-json': 'no-url',      // DOM tree, no frame
  image: 'no-url',                // <img src=file://…> — a local asset, nothing navigable
  'code-view': 'no-url',
  'code-search': 'no-url',
  'cost-archive': 'no-url',
  'skill-matrix': 'no-url',
  'project-env': 'no-url',
  'build-output': 'no-url',       // log <pre>; scraped localhost URLs open a `browser` pane

  // ── Settings / deploy surfaces ──
  'general-settings': 'no-url',
  'workflow-settings': 'no-url',  // unreachable by design (T-PATCH-200)
  'mcp-servers': 'no-url',        // unreachable by design (T-PATCH-200)
  hooks: 'no-url',                // unreachable by design (T-PATCH-200)
  deploy: 'no-url',               // shows deployment/PR URLs as openExternal links only

  // ── PlaceholderTab-only kinds: no content, no props ──
  'design-gate': 'no-url',
  'qa-result': 'no-url',
  'env-view': 'no-url',
  terminal: 'no-url',
}

describe('T-434 A — pane enumeration', () => {
  it('exactly the two URL-hosting pane kinds are `browser` and `preview`', () => {
    const hosts = Object.entries(PANE_URL_HOSTING)
      .filter(([, v]) => v === 'hosts-url')
      .map(([k]) => k)
      .sort()
    expect(hosts).toEqual(['browser', 'preview'])
  })

  it('all 29 pane kinds are classified', () => {
    // Guards against someone "fixing" the total record by widening its key type.
    expect(Object.keys(PANE_URL_HOSTING).length).toBe(29)
  })
})

// ── B. Render ─────────────────────────────────────────────────────────────────

describe('T-434 B — every URL-hosting pane renders the escape hatch', () => {
  it('browser pane (webview, remote URL)', () => {
    const html = renderToStaticMarkup(
      createElement(BrowserTab, { tabId: 'browser:t', props: { url: 'https://example.com/a' } }),
    )
    expect(html).toContain(HATCH)
  })

  it('browser pane opened blank (⌘T, about:blank) still has the hatch', () => {
    // The hatch must exist before any navigation — a misroute can arrive later.
    const html = renderToStaticMarkup(
      createElement(BrowserTab, { tabId: 'browser:new', props: {} }),
    )
    expect(html).toContain(HATCH)
  })

  it('preview pane with an http(s) url (delegates to BrowserTab)', () => {
    const html = renderToStaticMarkup(
      createElement(HtmlViewer, { tabId: 'preview:h', props: { url: 'https://example.com/a' } }),
    )
    expect(html).toContain(HATCH)
  })

  it('preview pane with a local .html file (iframe over a file:// path)', () => {
    const html = renderToStaticMarkup(
      createElement(HtmlViewer, {
        tabId: 'preview:f',
        props: { path: '/Users/dev/proj/docs/artifacts/ds-a.html', projectDir: '/Users/dev/proj' },
      }),
    )
    expect(html).toContain(HATCH)
  })
})
