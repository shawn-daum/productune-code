/**
 * ArtifactJsonTab — read-only JSON viewer for artifact files (2026-06-10).
 *
 * docs/artifacts/ 에는 .json 산출물 (excalidraw wireframe 등) 도 들어온다.
 * Loads via the project-scoped `artifactsReadFile(projectDir, absPath)` IPC,
 * parses, and renders a collapsible tree (objects/arrays toggle; everything
 * open by default). Invalid JSON falls back to the raw text with an error banner.
 * Header mirrors the other artifact panes: mono breadcrumb + read-only badge.
 *
 * T-PATCH-094: in-tree Find. The pane (LeafPane) routes the shared FindBar's
 * findQuery / findNavRef / onFindResult here (same contract HtmlViewer uses for
 * the 'preview' tab). Find searches BOTH keys and values, auto-expands collapsed
 * ancestors of matches, highlights via the CSS Custom Highlight API, and scrolls
 * the active match into view. The tree is plain DOM (not an iframe), so highlight
 * is applied directly with per-pane-unique highlight names to avoid split-pane
 * collisions.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Lock, ChevronRight, ChevronDown, AlertOctagon, Loader2 } from 'lucide-react'

interface Props {
  props?: Record<string, unknown>
  // T-PATCH-094: find bridge — populated by LeafPane only when this tab is active.
  findQuery?: string
  findNavRef?: MutableRefObject<((forward: boolean) => void) | null>
  onFindResult?: (info: { total: number; current: number }) => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ok'; value: unknown }
  | { phase: 'invalid'; raw: string; error: string }
  | { phase: 'error'; error: string }

// A flattened, searchable view of one matchable text span in the rendered tree.
// `path` is the chain of object keys / array indices from the root, used both as
// the open-override key and to compute the ancestor set to auto-expand.
interface MatchTarget {
  // node path from root, e.g. ['surfaces', 'gui', '0'] — '' separated key
  pathKey: string
  // ancestor pathKeys that must be open for this span to be in the DOM
  ancestors: string[]
  // lower-cased haystack (the visible text of the key or value span)
  haystack: string
  // which kind of span — keys and values get distinct refs in render
  kind: 'key' | 'value'
}

const HL = 'pdt-json-find'
const HL_ACTIVE = 'pdt-json-find-active'

// ── Sticky scroll (T-PATCH-095) ────────────────────────────────────────────────
// VS Code-style ancestor key-path accumulation. As you scroll into a deep node,
// its ancestor keys (root ▸ surfaces ▸ gui …) pin cascading at the top; click an
// entry to jump to that node below the band. Capped so deep trees don't eat the
// viewport — nearest ancestors are kept, shallowest dropped.
const MAX_STICKY_DEPTH = 4
const STICKY_ROW_H = 20

interface StickyKey {
  /** ' '-joined path key — matches JsonNode pathKey + data-pathkey attr */
  pathKey: string
  /** display label for this segment (key name, or 'root' for depth 0) */
  label: string
  depth: number
}

export default function ArtifactJsonTab({ props: tabProps, findQuery, findNavRef, onFindResult }: Props) {
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relPath = typeof tabProps?.relPath === 'string' ? tabProps.relPath : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    if (!absPath || !projectDir) { setState({ phase: 'error', error: 'no source' }); return }
    let cancelled = false
    const api = (window as any).api
    api.artifactsReadFile(projectDir, absPath)
      .then((text: string) => {
        if (cancelled) return
        try {
          setState({ phase: 'ok', value: JSON.parse(text) })
        } catch (e: any) {
          setState({ phase: 'invalid', raw: text, error: e?.message ?? 'parse error' })
        }
      })
      .catch((e: any) => { if (!cancelled) setState({ phase: 'error', error: e?.message ?? 'read failed' }) })
    return () => { cancelled = true }
  }, [absPath, projectDir])

  // ── Find state ───────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // Per-pathKey forced-open override applied while searching (auto-expand). When
  // a key is present and true the node is open regardless of the user's toggle;
  // cleared when the query empties so the user's manual collapse state returns.
  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({})
  // CSS Custom Highlight ranges for the current query + active index.
  const matchRangesRef = useRef<Range[]>([])
  const activeIdxRef = useRef<number>(-1)

  // Inject ::highlight CSS once (key+value spans live in this pane's DOM).
  useEffect(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-pdt-json-find', '1')
    styleEl.textContent =
      `::highlight(${HL}){background-color:#FFE066;color:#1A1A1A;}` +
      `::highlight(${HL_ACTIVE}){background-color:#FF9900;color:#1A1A1A;}`
    document.head.appendChild(styleEl)
    return () => {
      styleEl.remove()
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        ;(CSS as any).highlights.delete(HL)
        ;(CSS as any).highlights.delete(HL_ACTIVE)
      }
    }
  }, [])

  // Flatten the parsed tree into matchable targets. Recomputed only when the
  // parsed value changes (rerender-derived-state-no-effect: derive in render).
  const targets = useMemo<MatchTarget[]>(() => {
    if (state.phase !== 'ok') return []
    const out: MatchTarget[] = []
    const walk = (value: unknown, path: string[], label?: string) => {
      const pathKey = path.join(' ')
      const ancestors: string[] = []
      for (let i = 0; i < path.length; i++) ancestors.push(path.slice(0, i).join(' '))
      if (label !== undefined) {
        out.push({ pathKey, ancestors, haystack: label.toLowerCase(), kind: 'key' })
      }
      const isObj = value !== null && typeof value === 'object'
      if (!isObj) {
        out.push({ pathKey, ancestors, haystack: leafText(value).toLowerCase(), kind: 'value' })
        return
      }
      const entries: Array<[string, unknown]> = Array.isArray(value)
        ? (value as unknown[]).map((v, i) => [String(i), v])
        : Object.entries(value as Record<string, unknown>)
      for (const [k, v] of entries) walk(v, [...path, k], k)
    }
    walk(state.phase === 'ok' ? state.value : undefined, [], undefined)
    return out
  }, [state])

  const query = (findQuery ?? '').trim().toLowerCase()

  // Which pathKeys contain a match — drives auto-expand of ancestors.
  const matchedPathKeys = useMemo<string[]>(() => {
    if (!query) return []
    const set = new Set<string>()
    for (const t of targets) {
      if (t.haystack.includes(query)) {
        set.add(t.pathKey)
        for (const a of t.ancestors) if (a) set.add(a)
      }
    }
    return Array.from(set)
  }, [targets, query])

  // Apply / clear the auto-expand override as the query changes.
  useEffect(() => {
    if (!query) {
      setExpandOverride((prev) => (Object.keys(prev).length ? {} : prev))
      return
    }
    setExpandOverride(() => {
      const next: Record<string, boolean> = {}
      for (const k of matchedPathKeys) next[k] = true
      return next
    })
  }, [query, matchedPathKeys])

  // Build highlight ranges AFTER auto-expand commits to the DOM. Runs on every
  // query change while there is a query; clears highlights when the query empties.
  useEffect(() => {
    const clear = () => {
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        ;(CSS as any).highlights.delete(HL)
        ;(CSS as any).highlights.delete(HL_ACTIVE)
      }
      matchRangesRef.current = []
      activeIdxRef.current = -1
    }

    if (!query) {
      clear()
      onFindResult?.({ total: 0, current: 0 })
      return
    }
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
      onFindResult?.({ total: 0, current: 0 })
      return
    }
    const root = bodyRef.current
    if (!root) { onFindResult?.({ total: 0, current: 0 }); return }

    clear()
    const ranges: Range[] = []
    // Skip the sticky-scroll band (T-PATCH-095): its breadcrumb text is a
    // duplicate of in-tree keys and must NOT produce phantom find matches.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        (n.parentElement?.closest('[data-pdt-sticky]'))
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    })
    let node: Node | null
    while ((node = walker.nextNode()) !== null) {
      const textNode = node as Text
      const val = textNode.nodeValue ?? ''
      const lower = val.toLowerCase()
      let idx = 0
      let found: number
      while ((found = lower.indexOf(query, idx)) !== -1) {
        const range = document.createRange()
        range.setStart(textNode, found)
        range.setEnd(textNode, found + query.length)
        ranges.push(range)
        idx = found + query.length
      }
    }
    matchRangesRef.current = ranges

    const hl = (CSS as any).highlights
    if (ranges.length === 0) {
      onFindResult?.({ total: 0, current: 0 })
      return
    }
    hl.set(HL, new (window as any).Highlight(...ranges))
    activeIdxRef.current = 0
    hl.set(HL_ACTIVE, new (window as any).Highlight(ranges[0]))
    scrollRangeIntoView(ranges[0])
    onFindResult?.({ total: ranges.length, current: 1 })
  // matchedPathKeys is in deps so highlight rebuilds after auto-expand re-renders
  // the (previously collapsed) matching nodes into the DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchedPathKeys, state])

  // Navigation (prev/next) — assigned to the LeafPane-owned findNavRef.
  useEffect(() => {
    if (!findNavRef) return
    findNavRef.current = (forward: boolean) => {
      const ranges = matchRangesRef.current
      if (ranges.length === 0) return
      activeIdxRef.current = forward
        ? (activeIdxRef.current + 1) % ranges.length
        : (activeIdxRef.current - 1 + ranges.length) % ranges.length
      const active = ranges[activeIdxRef.current]
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        ;(CSS as any).highlights.set(HL_ACTIVE, new (window as any).Highlight(active))
      }
      scrollRangeIntoView(active)
      onFindResult?.({ total: ranges.length, current: activeIdxRef.current + 1 })
    }
    return () => { if (findNavRef) findNavRef.current = null }
  }, [findNavRef, onFindResult])

  // ── Sticky scroll (T-PATCH-095) ─────────────────────────────────────────────
  // Reuses bodyRef as the scroll container (shared with find — read-only here).
  // The deepest object/array header row scrolled under the band defines the
  // pinned ancestor path. Header rows carry data-pathkey + data-label + data-depth.
  const [stickyPath, setStickyPath] = useState<StickyKey[]>([])

  const recomputeSticky = useCallback(() => {
    const sc = bodyRef.current
    if (!sc) { setStickyPath((p) => (p.length ? [] : p)); return }
    const rows = sc.querySelectorAll<HTMLElement>('[data-pathkey]')
    if (rows.length === 0) { setStickyPath((p) => (p.length ? [] : p)); return }
    // Container-relative geometry (rect delta) — correct regardless of offsetParent.
    // The probe line sits just under where a FULL band would end (fixed at the
    // depth cap, NOT the current chain length) so detection never feeds back on its
    // own output — a node's header flips to pinned as it scrolls beneath the band.
    const scTop = sc.getBoundingClientRect().top
    const probe = MAX_STICKY_DEPTH * STICKY_ROW_H + 1
    // Deepest header row whose top (relative to the container) is at/above the
    // probe = the node the viewport top currently sits inside. Higher-in-tree
    // ancestors have already scrolled past, so they also pass — we keep the
    // deepest, then reconstruct the FULL chain from its path below.
    let curPathKey = ''
    let hasCurrent = false
    let curDepth = -1
    rows.forEach((row) => {
      const top = row.getBoundingClientRect().top - scTop
      const depth = Number(row.dataset.depth ?? '0')
      if (top <= probe && depth > curDepth) {
        curDepth = depth
        curPathKey = row.dataset.pathkey ?? ''
        hasCurrent = true
      }
    })
    if (!hasCurrent) { setStickyPath((p) => (p.length ? [] : p)); return }
    // Build the FULL ancestor chain (root → … → current) from the path segments.
    // Each segment becomes one stacked sticky row, indented by its depth.
    const segs = curPathKey.split(' ').filter((s) => s !== '')
    const chain: StickyKey[] = [{ pathKey: '', label: 'root', depth: 0 }]
    for (let i = 0; i < segs.length; i++) {
      chain.push({ pathKey: segs.slice(0, i + 1).join(' '), label: segs[i]!, depth: i + 1 })
    }
    // Cap — keep the nearest ancestors (drop shallowest / front of chain).
    const capped = chain.length > MAX_STICKY_DEPTH ? chain.slice(chain.length - MAX_STICKY_DEPTH) : chain
    setStickyPath((prev) => {
      if (prev.length === capped.length && prev.every((p, i) => p.pathKey === capped[i]!.pathKey)) return prev
      return capped
    })
  }, [])

  // rAF-throttled scroll listener + recompute when the visible node set changes
  // (collapse/expand, auto-expand from find, or parse result).
  useEffect(() => {
    const sc = bodyRef.current
    if (!sc || state.phase !== 'ok') { setStickyPath([]); return }
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { recomputeSticky(); ticking = false })
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    const raf = requestAnimationFrame(recomputeSticky)
    return () => { sc.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [state, expandOverride, recomputeSticky])

  const jumpToKey = useCallback((k: StickyKey, indexInBand: number) => {
    const sc = bodyRef.current
    if (!sc) return
    const sel = `[data-pathkey="${cssEscape(k.pathKey)}"]`
    const el = sc.querySelector<HTMLElement>(sel)
    if (!el) return
    // Offset by the band rows that stay pinned ABOVE this one so the target lands
    // just under the band, not hidden behind it (mirrors MarkdownViewer.jumpTo).
    const bandH = (indexInBand + 1) * STICKY_ROW_H
    const top = sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - bandH
    sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  return (
    <div style={wrap}>
      <div style={header}>
        <span style={crumb}>{relPath || absPath || 'artifact'}</span>
        <span style={lockBadge}>
          <Lock size={10} />
          read-only
        </span>
      </div>
      <div style={body} ref={bodyRef}>
        {/* Sticky-scroll key-path band (T-PATCH-095). Direct child of the scroll
            container (mirrors MarkdownViewer) so the FULL ancestor chain pins as
            STACKED rows cascading by depth; click a row to jump below the band. */}
        {state.phase === 'ok' && stickyPath.length > 0 && (
          <div style={stickyBand} data-pdt-sticky="1">
            {stickyPath.map((k, i) => (
              <button
                key={k.pathKey || 'root'}
                style={{ ...stickyRow, paddingLeft: 14 + i * 16 }}
                onClick={() => jumpToKey(k, i)}
                title={k.label}
              >
                {i > 0 && <span style={stickySep}>▸</span>}
                <span style={stickyRowText}>{k.label}</span>
              </button>
            ))}
          </div>
        )}
        {state.phase === 'loading' && (
          <div style={center}><Loader2 size={18} style={{ color: '#505050' }} className="pdt-spin" /></div>
        )}
        {state.phase === 'error' && (
          <div style={errorBanner}>
            <AlertOctagon size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <span>{state.error}</span>
          </div>
        )}
        {state.phase === 'invalid' && (
          <>
            <div style={errorBanner}>
              <AlertOctagon size={13} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
              <span>invalid JSON — raw text below ({state.error})</span>
            </div>
            <pre style={rawPre}>{state.raw}</pre>
          </>
        )}
        {state.phase === 'ok' && (
          <div style={treeWrap}>
            <JsonNode value={state.value} depth={0} path={[]} expandOverride={expandOverride} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────

function leafText(value: unknown): string {
  if (typeof value === 'string') return value
  return String(value)
}

// Escape a path key for use inside an attribute selector. Falls back to a manual
// quote-escape when CSS.escape is unavailable (jsdom / older runtimes).
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof (CSS as any).escape === 'function') {
    return (CSS as any).escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

function scrollRangeIntoView(range: Range) {
  const sc = range.startContainer
  const el = sc.nodeType === 1 ? (sc as Element) : sc.parentElement
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function JsonNode({
  value,
  depth,
  label,
  path,
  expandOverride,
}: {
  value: unknown
  depth: number
  label?: string
  path: string[]
  expandOverride: Record<string, boolean>
}) {
  const isObj = value !== null && typeof value === 'object'
  const [userOpen, setUserOpen] = useState(true)
  const pathKey = path.join(' ')
  // Auto-expand wins while a search forces this node open; otherwise honor the
  // user's manual toggle (which is restored once the override clears).
  const forced = expandOverride[pathKey] === true
  const open = forced || userOpen

  const labelEl = label !== undefined ? <span style={keyStyle(depth)}>{label}: </span> : null

  if (!isObj) {
    return (
      <div style={row(depth)}>
        <span style={chevronSpacer} />
        {labelEl}
        <ValueLeaf value={value} />
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const entries: Array<[string, unknown]> = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)
  const bracket = isArr ? ['[', ']'] : ['{', '}']
  const count = entries.length

  return (
    <div>
      <div
        style={{ ...row(depth), cursor: 'pointer' }}
        onClick={() => setUserOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setUserOpen((o) => !o) }}
        // Sticky-scroll anchor (T-PATCH-095): pathKey + label + depth let the
        // band resolve the deepest visible node and build its ancestor crumb.
        data-pathkey={pathKey}
        data-label={label ?? 'root'}
        data-depth={depth}
      >
        <span style={chevron}>
          {count > 0 ? (open ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : <span style={{ width: 11 }} />}
        </span>
        {labelEl}
        <span style={punct}>{bracket[0]}</span>
        {!open && (
          <span style={collapsedHint}>{count === 0 ? '' : ` ${count} ${isArr ? 'items' : 'keys'} `}</span>
        )}
        {!open && <span style={punct}>{bracket[1]}</span>}
      </div>
      {open && entries.map(([k, v]) => (
        <JsonNode key={k} value={v} depth={depth + 1} label={k} path={[...path, k]} expandOverride={expandOverride} />
      ))}
      {open && (
        <div style={row(depth)}>
          <span style={chevronSpacer} />
          <span style={punct}>{bracket[1]}</span>
        </div>
      )}
    </div>
  )
}

function ValueLeaf({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span style={strVal}>"{value}"</span>
  if (typeof value === 'number') return <span style={numVal}>{String(value)}</span>
  if (typeof value === 'boolean' || value === null) return <span style={kwVal}>{String(value)}</span>
  return <span style={punct}>{String(value)}</span>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: '#0E0E0E',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderBottom: '1px solid #1A1A1A',
  flexShrink: 0,
}

const crumb: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: '#808080',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const lockBadge: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#606060',
  flexShrink: 0,
}

// NO top padding on the scroll container. A sticky `top:0` child pins relative to
// the scrollport's PADDING-box top edge, so any padding-top opens a strip between
// the scrollport top and the band where scrolled rows bleed through ABOVE the band
// (T-PATCH-095 QA-r2). Vertical spacing is moved onto the inner content instead.
const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
}

const center: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  margin: '4px 14px 10px',
  padding: '8px 10px',
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  fontSize: 11,
  color: '#A0A0A0',
}

const rawPre: React.CSSProperties = {
  margin: '0 14px',
  padding: 10,
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  fontFamily: MONO,
  fontSize: 11,
  lineHeight: 1.5,
  color: '#A0A0A0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const treeWrap: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11.5,
  lineHeight: 1.65,
  // Vertical breathing room lives here (NOT on the scroll container) so the
  // sticky band can pin flush at the scrollport top with no bleed strip above it.
  padding: '10px 0',
}

// ── Sticky-scroll band (T-PATCH-095) ────────────────────────────────────────────
// SOLID background (NOT translucent) so scrolled JSON rows never bleed through the
// pinned breadcrumb. Matches the JSON viewer body bg (#0E0E0E) exactly, and sits
// above scrolled rows via a high z-index. Mirrors MarkdownViewer's opaque band.
const stickyBand: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  background: '#0E0E0E',
  borderBottom: '1px solid #222',
  boxShadow: '0 2px 4px rgba(0,0,0,0.45)',
}

const stickyRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: STICKY_ROW_H,
  width: '100%',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#9CA3AF',
  fontFamily: MONO,
  fontSize: 11,
  textAlign: 'left',
  paddingRight: 14,
  paddingTop: 0,
  paddingBottom: 0,
}

const stickySep: React.CSSProperties = { color: '#3F3F3F', flexShrink: 0 }

const stickyRowText: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// Long values wrap — keys/chevrons must pin to the FIRST line (top-aligned),
// never float to the vertical middle of a wrapped value block.
const row = (depth: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  paddingLeft: 14 + depth * 16,
  paddingRight: 14,
})

const chevron: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 14,
  flexShrink: 0,
  color: '#505050',
  paddingTop: 4, // optical first-line alignment (line-height 1.65 × 11.5px)
}

const chevronSpacer: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  flexShrink: 0,
}

// Key color cycles by depth — hierarchy cue. Hues avoid the value colors
// (string green / number amber / keyword violet).
const KEY_COLORS = ['#9CA3AF', '#7EA8CF', '#CF9E9E', '#8FBFB4']
const keyStyle = (depth: number): React.CSSProperties => ({
  color: KEY_COLORS[depth % KEY_COLORS.length],
  flexShrink: 0,
  whiteSpace: 'nowrap',
})
const punct: React.CSSProperties = { color: '#505050' }
const collapsedHint: React.CSSProperties = { color: '#3F3F3F', fontStyle: 'italic' }
const strVal: React.CSSProperties = { color: '#7FB07F', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
const numVal: React.CSSProperties = { color: '#C9A26D' }
const kwVal: React.CSSProperties = { color: '#8B7EC8' }
