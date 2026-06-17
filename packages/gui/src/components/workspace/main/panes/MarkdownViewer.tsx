/**
 * MarkdownViewer — T-PATCH-028
 *
 * Shared markdown surface primitive, generalized from DoctrineFileTab
 * (T-PATCH-020). Three near-identical markdown tabs (ArtifactMdTab,
 * MarkdownTab, DoctrineFileTab) had drifted; this primitive carries the one
 * canonical implementation. Preview ALWAYS renders via MdRenderer (the
 * T-PATCH-027 invariant) — there is no raw <pre> fallback for the markdown body.
 *
 * Source-agnostic by design:
 *   - `load` is an injected fetch (memory / artifacts / doctrine IPC, or an
 *     inline string). The primitive imports NO specific IPC channel.
 *   - `editable` is a plain boolean. When false → Preview-only + Lock badge,
 *     no Edit / Save / Cancel, no textarea, no line-cap badge. When true →
 *     the full Preview ⇄ Edit flow (textarea, line-cap badge, Save/Cancel,
 *     inline saved / conflict / error states).
 *   - `zoom` is opt-in. When enabled the ZoomControls group renders in the
 *     header-right and scales the Preview font size (reflow via font-size, NOT
 *     transform: scale — matching ArtifactMdTab's BASE_FONT_PX approach).
 *
 * The save/conflict seam (onSave / DoctrineSaveResult / DoctrineDirtyState /
 * onDirtyChange) is preserved unchanged in shape so DoctrineFileTabHost keeps
 * working without edits. The Doctrine* type names are kept this round.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, Loader2, Lock, ChevronRight, Eye, Pencil, Save, X, Moon, Sun } from 'lucide-react'
import MdRenderer from '../../chat/MdRenderer'
import ZoomControls, { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from './ZoomControls'
import { parseFrontmatter } from './frontmatter'
import MetadataPanel from './MetadataPanel'

// ── Sticky scroll (T-PATCH-095) ────────────────────────────────────────────────
// VS Code-style ancestor-heading accumulation. The pinned band reflects the
// deepest heading whose section the viewport top currently sits in, plus its
// shallower ancestors (H1>H2>H3) stacked cascading. Capped so deep docs don't
// eat the viewport; clicking an entry jumps to that heading below the band.

// Max pinned rows. When the ancestor chain is deeper, the shallowest ancestors
// are dropped (the nearest ancestors — most useful context — are kept). 4 so the
// full H1>H2>H3>H4 chain (H4 added in T-PATCH-182) can show (T-PATCH-184).
const MAX_STICKY_DEPTH = 4
// Per-row height of one sticky heading entry (px). Drives the jump offset so a
// clicked / scrolled-to heading lands just under the band, not behind it. Rows
// use min-height (not fixed height) so the per-level scaled type (13px L1) isn't
// clipped while the band stays compact (T-PATCH-184).
const STICKY_ROW_H = 22

interface StickyHeading {
  /** document order index — stable jump key */
  idx: number
  level: number // 1 | 2 | 3 | 4
  text: string
  /** element offsetTop within the scroll container */
  top: number
}

// ── Seam types (preserved from DoctrineFileTab; re-exported for the host) ───────

/** Save seam result shape (mirrors doctrineWriteFile's resolved value). */
export interface DoctrineSaveResult {
  ok: boolean
  conflict?: boolean
  error?: string
  mtimeMs?: number
}

export type DoctrineOnSave = (
  absPath: string,
  content: string,
  expectedMtimeMs: number | null,
) => Promise<DoctrineSaveResult>

/**
 * Live dirty-state report for the host (T-PATCH-022 AC-4). Emitted whenever the
 * editor's dirty status or draft text changes so the host can register a
 * close-guard and re-drive the save flow from the dirty-confirm modal's "저장".
 */
export interface DoctrineDirtyState {
  dirty: boolean
  draft: string
}

// ── Loader contract (injected — the primitive owns no IPC channel) ──────────────

export interface MarkdownLoadResult {
  ok: boolean
  content?: string
  mtimeMs?: number | null
  error?: string
}

export type MarkdownLoad = () => Promise<MarkdownLoadResult>

interface MarkdownViewerProps {
  /** Injected content fetch. Replaces any inlined IPC read. */
  load: MarkdownLoad
  /** Path passed to onSave; also the breadcrumb fallback. */
  absPath?: string
  /** Slash-delimited breadcrumb label; falls back to absPath. */
  relName?: string
  /**
   * Editable flag (plain boolean — tier mapping stays in callers). false →
   * Preview-only + Lock badge, no edit affordances. true → full Preview ⇄ Edit.
   */
  editable: boolean
  /** Save seam. Required when editable; ignored when read-only. */
  onSave?: DoctrineOnSave
  /** Live dirty report for a host close-guard. Additive — no-op when absent. */
  onDirtyChange?: (state: DoctrineDirtyState) => void
  /** Opt-in zoom. When true, ZoomControls render and scale Preview font size. */
  zoomEnabled?: boolean
  /** Advisory line cap for the editable header badge. */
  lineCap?: number
  /** Breadcrumb fallback label when neither relName nor absPath is present. */
  emptyCrumb?: string
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// Advisory line-cap default for persona habit.md / bookshelf files. The 50-line
// common-habit cap is out of scope (carried as-is from DoctrineFileTab).
const DEFAULT_LINE_CAP = 100

// ── Document-surface theme (T-PATCH-183) ────────────────────────────────────────
// EARLY-LIGHT: only the md DOCUMENT surface (.md-doc viewerWrap) flips light/dark;
// toolbar / shell / chat / Mermaid·Image tabs stay dark (full-app light = Phase 5).
// One global persisted key → all md tabs share the theme. Default dark (incl.
// first run / parse-fail / missing), following App.tsx try/catch localStorage
// convention so a blocked localStorage degrades silently to dark.
type MdTheme = 'dark' | 'light'
const MD_THEME_KEY = 'productune.mdViewer.theme'

function readMdTheme(): MdTheme {
  try {
    return localStorage.getItem(MD_THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function writeMdTheme(theme: MdTheme): void {
  try {
    localStorage.setItem(MD_THEME_KEY, theme)
  } catch {
    /* localStorage unavailable — silent fallback, state stays in-memory */
  }
}

export default function MarkdownViewer({
  load,
  absPath = '',
  relName = '',
  editable,
  onSave,
  onDirtyChange,
  zoomEnabled = false,
  lineCap = DEFAULT_LINE_CAP,
  emptyCrumb = 'doctrine',
}: MarkdownViewerProps) {
  const { t } = useTranslation()

  // Loaded on-disk content (source of truth for Preview + textarea seed).
  const [content, setContent] = useState<string>('')
  const [loadState, setLoadState] = useState<LoadState>('idle')

  // Conflict-detection snapshot: the mtime at the moment we last read/wrote.
  const snapshotMtimeRef = useRef<number | null>(null)

  // Editable-mode UI state (PersonaDefTab pattern).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)

  // Zoom state (only meaningful when zoomEnabled).
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT), [])

  // Document-surface theme (T-PATCH-183). Lazy-init from localStorage (default
  // dark). Toggling flips state + persists immediately so all md tabs share it.
  const [theme, setTheme] = useState<MdTheme>(() => readMdTheme())
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: MdTheme = prev === 'dark' ? 'light' : 'dark'
      writeMdTheme(next)
      return next
    })
  }, [])
  const isLight = theme === 'light'

  const runLoad = useCallback(() => {
    setLoadState('loading')
    load()
      .then((res) => {
        if (res?.ok) {
          setContent(res.content ?? '')
          snapshotMtimeRef.current = res.mtimeMs ?? null
          setLoadState('done')
        } else {
          setLoadState('error')
        }
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [load])

  useEffect(() => {
    runLoad()
  }, [runLoad])

  const enterEdit = useCallback(() => {
    setDraft(content)
    setEditing(true)
    setError(null)
    setConflict(false)
    setSaved(false)
  }, [content])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraft('')
    setError(null)
    setConflict(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!onSave) return
    setSaving(true)
    setError(null)
    setConflict(false)
    setSaved(false)
    try {
      const res = await onSave(absPath, draft, snapshotMtimeRef.current)
      if (res?.ok) {
        setContent(draft)
        if (typeof res.mtimeMs === 'number') snapshotMtimeRef.current = res.mtimeMs
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else if (res?.conflict) {
        setConflict(true)
      } else {
        setError(res?.error ?? 'write failed')
      }
    } catch (e: any) {
      setError(e?.message ?? 'write failed')
    } finally {
      setSaving(false)
    }
  }, [onSave, absPath, draft])

  // T-PATCH-022 AC-4: report dirty state + current draft so the host can guard
  // tab close and re-drive the save-choice dialog from "저장". Additive — a no-op
  // when no host injects onDirtyChange (default render path).
  const dirty = editing && draft !== content
  useEffect(() => {
    onDirtyChange?.({ dirty, draft: dirty ? draft : content })
  }, [onDirtyChange, dirty, draft, content])

  // ── Sticky scroll (T-PATCH-095) ─────────────────────────────────────────────
  // Scroll container = the body div. Headings are read from the rendered DOM
  // (.md-h1/.md-h2/.md-h3 emitted by MdRenderer) — no MdRenderer change needed.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // All headings in document order, with offsetTop relative to the scroll content.
  const headingsRef = useRef<StickyHeading[]>([])
  // The ancestor chain currently pinned (deepest section the viewport top is in).
  const [stickyChain, setStickyChain] = useState<StickyHeading[]>([])

  const collectHeadings = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) { headingsRef.current = []; return }
    const els = sc.querySelectorAll<HTMLElement>('.md-h1, .md-h2, .md-h3, .md-h4')
    const list: StickyHeading[] = []
    els.forEach((el, i) => {
      const level = el.classList.contains('md-h1') ? 1 : el.classList.contains('md-h2') ? 2 : el.classList.contains('md-h3') ? 3 : 4
      list.push({ idx: i, level, text: (el.textContent ?? '').trim(), top: el.offsetTop })
    })
    headingsRef.current = list
  }, [])

  const recomputeSticky = useCallback(() => {
    const sc = scrollRef.current
    const list = headingsRef.current
    if (!sc || list.length === 0) { setStickyChain((c) => (c.length ? [] : c)); return }
    // Probe line sits just below where the sticky band would end, so the heading
    // a section belongs to flips to "pinned" exactly as it scrolls under the band.
    const probe = sc.scrollTop + Math.min(list.length, MAX_STICKY_DEPTH) * STICKY_ROW_H + 1
    // Last heading whose top is at/above the probe = current section heading.
    let currentIdx = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.top <= probe) currentIdx = i
      else break
    }
    if (currentIdx < 0) { setStickyChain((c) => (c.length ? [] : c)); return }
    // Walk back from the current heading collecting strictly-shallower ancestors.
    const chain: StickyHeading[] = [list[currentIdx]!]
    let needLevel = list[currentIdx]!.level - 1
    for (let i = currentIdx - 1; i >= 0 && needLevel >= 1; i--) {
      if (list[i]!.level <= needLevel) {
        chain.unshift(list[i]!)
        needLevel = list[i]!.level - 1
      }
    }
    // Cap depth — keep the nearest ancestors (drop shallowest / front of chain).
    const capped = chain.length > MAX_STICKY_DEPTH ? chain.slice(chain.length - MAX_STICKY_DEPTH) : chain
    setStickyChain((prev) => {
      if (prev.length === capped.length && prev.every((p, i) => p.idx === capped[i]!.idx)) return prev
      return capped
    })
  }, [])

  // Re-collect headings whenever the rendered content / zoom changes, then probe.
  useEffect(() => {
    if (loadState !== 'done' || editing) { setStickyChain([]); return }
    // Defer to next frame so MdRenderer's DOM (and zoom font reflow) has committed.
    const raf = requestAnimationFrame(() => { collectHeadings(); recomputeSticky() })
    return () => cancelAnimationFrame(raf)
  }, [loadState, editing, content, zoom, collectHeadings, recomputeSticky])

  // rAF-throttled scroll listener on the body scroll container.
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc || loadState !== 'done' || editing) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { recomputeSticky(); ticking = false })
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => sc.removeEventListener('scroll', onScroll)
  }, [loadState, editing, recomputeSticky])

  const jumpToHeading = useCallback((h: StickyHeading) => {
    const sc = scrollRef.current
    if (!sc) return
    // Re-read live offsetTop (zoom / reflow may have moved it since collection).
    const els = sc.querySelectorAll<HTMLElement>('.md-h1, .md-h2, .md-h3, .md-h4')
    const el = els[h.idx]
    const top = el ? el.offsetTop : h.top
    // Offset by the band height of the ancestors that stay pinned above this one
    // so the target lands just under the band, not hidden behind it.
    const aboveCount = Math.max(0, stickyChain.findIndex((s) => s.idx === h.idx))
    const bandH = (aboveCount + 1) * STICKY_ROW_H
    sc.scrollTo({ top: Math.max(0, top - bandH), behavior: 'smooth' })
  }, [stickyChain])

  // ── Breadcrumb segments (split relName, fall back to absPath) ───────────────
  const crumbSource = relName || absPath
  const crumbParts = crumbSource ? crumbSource.split('/') : []

  // Advisory line count for the editable header badge.
  const liveText = editing ? draft : content
  const lineCount = liveText === '' ? 0 : liveText.split('\n').length
  const overCap = lineCount > lineCap

  // Frontmatter split is PREVIEW-ONLY (T-PATCH-179). The textarea seed, dirty
  // compare, and onSave all keep `content` (raw, frontmatter intact) — only the
  // rendered preview gets the stripped body + metadata panel. Parser never
  // throws and falls back to { data:{}, body: raw } on any miss, so a doc with
  // no frontmatter renders identically to before.
  const { data: fmData, body: previewBody } = useMemo(
    () => parseFrontmatter(content),
    [content],
  )

  return (
    <div style={wrap}>
      {/* Header bar */}
      <div style={headerBar}>
        <div style={breadcrumbRow}>
          {crumbParts.map((part, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {idx > 0 && <ChevronRight size={10} style={{ color: '#3A3A3A', flexShrink: 0 }} />}
              <span style={idx === crumbParts.length - 1 ? crumbLast : crumbSeg}>{part}</span>
            </span>
          ))}
          {crumbParts.length === 0 && <span style={crumbSeg}>{emptyCrumb}</span>}
        </div>

        <div style={headerRight}>
          {zoomEnabled && (
            <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={zoomReset} />
          )}
          {/* Document light/dark toggle (T-PATCH-183). Sibling of ZoomControls —
              ZoomControls itself is untouched. Icon shows the CURRENT theme
              (Moon=dark, Sun=light); tooltip/aria describe the action. The button
              chrome stays dark always (toolbar is never light). */}
          <button
            style={themeToggleBtn}
            onClick={toggleTheme}
            aria-pressed={isLight}
            aria-label={t(isLight ? 'workspace.mdViewer.theme.toDark' : 'workspace.mdViewer.theme.toLight')}
            title={t(isLight ? 'workspace.mdViewer.theme.toDark' : 'workspace.mdViewer.theme.toLight')}
          >
            {isLight ? <Sun size={12} strokeWidth={1.5} /> : <Moon size={12} strokeWidth={1.5} />}
          </button>
          {editable ? (
            <>
              {/* Advisory line-cap badge — never disables Save. */}
              <span
                style={overCap ? lineCapBadgeOver : lineCapBadge}
                title={t('workspace.doctrineFile.lineCapTooltip', { count: lineCount, cap: lineCap })}
              >
                {lineCount}/{lineCap}
              </span>
              {!editing ? (
                <button style={actionBtn} onClick={enterEdit} disabled={loadState !== 'done'}>
                  <Pencil size={11} color="#909090" />
                  <span>{t('workspace.doctrineFile.edit')}</span>
                </button>
              ) : (
                <div style={btnGroup}>
                  <button style={actionBtn} onClick={handleSave} disabled={saving}>
                    <Save size={11} color="#34D399" />
                    <span>{saving ? t('common.loading') : t('workspace.doctrineFile.save')}</span>
                  </button>
                  <button style={actionBtn} onClick={cancelEdit} disabled={saving}>
                    <X size={11} color="#909090" />
                    <span>{t('common.cancel')}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={roBadge}>
              <Lock size={11} style={{ flexShrink: 0 }} />
              <span>{t('workspace.common.readOnly')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={body} ref={scrollRef}>
        {/* Sticky-scroll heading band (T-PATCH-095). Pins ancestor headings
            (H1>H2>H3) cascading at the top; click jumps below the band. */}
        {loadState === 'done' && !editing && stickyChain.length > 0 && (
          // Sticky band is a SIBLING of .md-doc (not a descendant), so its light
          // variant can't ride the CSS var flip — it's applied inline off `isLight`
          // (ticket-permitted). Paper-translucent band so it doesn't float dark
          // over a light doc; per-level row text + chevron use the §2.10 tokens.
          <div style={isLight ? { ...stickyBand, ...stickyBandLight } : stickyBand}>
            {stickyChain.map((h, i) => {
              const lvl = (isLight ? stickyLevelStyleLight[h.level] : stickyLevelStyle[h.level])
                ?? (isLight ? stickyLevelStyleLight[4]! : stickyLevelStyle[4]!)
              return (
                <button
                  key={h.idx}
                  style={{ ...stickyRow, ...lvl, paddingLeft: 16 + i * 14 }}
                  onClick={() => jumpToHeading(h)}
                  title={h.text}
                >
                  <ChevronRight size={10} style={{ color: isLight ? '#CFCCC6' : '#3A3A3A', flexShrink: 0 }} />
                  <span style={stickyRowText}>{h.text}</span>
                </button>
              )
            })}
          </div>
        )}
        {loadState === 'loading' && (
          <div style={centerState}>
            <Loader2 size={20} style={{ color: '#505050' }} className="pdt-spin" />
          </div>
        )}

        {loadState === 'error' && (
          <div style={errorBanner}>
            <AlertOctagon size={14} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={errorText}>{t('workspace.common.fileLoadError')}</div>
              <button style={retryBtn} onClick={runLoad}>
                {t('common.retry')}
              </button>
            </div>
          </div>
        )}

        {loadState === 'done' && (
          <>
            {editing ? (
              <div style={editWrap}>
                <textarea
                  style={textarea}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {conflict && (
                  <div style={conflictText}>
                    <AlertOctagon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{t('workspace.doctrineFile.conflict')}</span>
                  </div>
                )}
                {error && <div style={errorInline}>{error}</div>}
              </div>
            ) : (
              <>
                {/* Read-only state hint for editable files (Preview mode) */}
                {editable && (
                  <div style={modeHint}>
                    <Eye size={11} color="#505050" />
                    <span>{t('workspace.doctrineFile.preview')}</span>
                    {saved && <span style={savedText}>{t('workspace.doctrineFile.saved')}</span>}
                  </div>
                )}
                <div
                  className={isLight ? 'md-doc md-light' : 'md-doc'}
                  style={zoomEnabled ? { ...viewerWrap, zoom: zoom } : viewerWrap}
                >
                  {/* T-PATCH-198: inner reading column — 780px cap, centered */}
                  <div style={viewerColumn}>
                    <MetadataPanel data={fmData} />
                    <MdRenderer text={previewBody} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles (lifted from DoctrineFileTab / ArtifactMdTab) ────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
}

const headerBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 16px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
  minHeight: 32,
}

const breadcrumbRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flex: 1,
  overflow: 'hidden',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 11,
  color: '#A0A0A0',
  minWidth: 0,
}

const crumbSeg: React.CSSProperties = {
  color: '#707070',
  whiteSpace: 'nowrap',
}

const crumbLast: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const headerRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

// Document theme toggle (T-PATCH-183). Reuses ZoomControls' zoomBtn tone so it
// sits in the toolbar as a peer — single bordered square. ALWAYS dark: the
// toolbar never flips light, only the document surface does.
const themeToggleBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1A1A1A',
  color: '#A0A0A0',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 6px',
  cursor: 'pointer',
  lineHeight: 1,
  flexShrink: 0,
}

const roBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const lineCapBadge: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const lineCapBadgeOver: React.CSSProperties = {
  ...lineCapBadge,
  color: '#E0A030',
  borderColor: '#3A2E12',
}

const btnGroup: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const actionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#A0A0A0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 10,
  padding: '2px 8px',
}

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
}

const centerState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 48,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #EF4444',
  borderRadius: 4,
  padding: '10px 12px',
  margin: 24,
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8CC',
  lineHeight: 1.5,
}

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// T-PATCH-198: viewerWrap fills the full pane width so the paper background
// (`.md-doc.md-light { background }`) covers the entire scroll area — no dark
// gutter on wide panes. maxWidth removed; minHeight:100% ensures even short
// documents paint the paper down to the bottom of the scroll container.
// Horizontal padding moved to viewerColumn (the inner reading column).
const viewerWrap: React.CSSProperties = {
  paddingTop: 24,
  paddingBottom: 24,
  minHeight: '100%',
  lineHeight: 1.65,
  fontSize: 13,
}

// T-PATCH-198: inner reading column — capped at 780px and centered within the
// full-width paper surface. Carries the horizontal padding that was formerly on
// viewerWrap. zoom is applied on viewerWrap (the paper), so this column centers
// correctly under any zoom level.
const viewerColumn: React.CSSProperties = {
  maxWidth: 780,
  margin: '0 auto',
  paddingLeft: 28,
  paddingRight: 28,
}

// ── Sticky-scroll band (T-PATCH-095) ────────────────────────────────────────────
const stickyBand: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(15,15,15,0.96)',
  backdropFilter: 'blur(2px)',
  borderBottom: '1px solid #1A1A1A',
}

// Light variant of the sticky band (T-PATCH-183). Paper-translucent so it reads
// as light document chrome, not a dark bar over a light doc. Hex = §2.10 light
// palette (--surface-body paper / --border-default), resolved literally because
// the band is outside .md-doc so it can't read the CSS var flip.
const stickyBandLight: React.CSSProperties = {
  background: 'rgba(250,250,249,0.96)',
  borderBottom: '1px solid #E2E0DC',
}

const stickyRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  // min-height (not fixed height) keeps rows compact yet uncropped for the larger
  // 13px level-1 type; tight vertical padding holds the band slim (T-PATCH-184).
  minHeight: STICKY_ROW_H,
  width: '100%',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  paddingRight: 16,
  paddingTop: 2,
  paddingBottom: 2,
}

// Per-level scaled-down typography for the sticky breadcrumb rows (T-PATCH-184,
// option 2). Hierarchy lives in size/weight/color but COMPRESSED vs the original
// body heading sizes (18/15/14/13). Values are the canonical design-system token
// hex from md-recipes :root — text-base/sm/xs + text-emphasis/primary/secondary/
// muted — NOT new hex. Inline React styles can't read CSS vars, so the resolved
// token hex are used directly.
const stickyLevelStyle: Record<number, React.CSSProperties> = {
  1: { fontSize: 13, fontWeight: 600, color: '#F0F0F0' }, // --text-base / --text-emphasis
  2: { fontSize: 12, fontWeight: 600, color: '#E8E8EA' }, // --text-sm   / --text-primary
  3: { fontSize: 12, fontWeight: 500, color: '#C8C8CC' }, // --text-sm   / --text-secondary
  4: { fontSize: 11, fontWeight: 400, color: '#A0A0A0' }, // --text-xs   / --text-muted
}

// Light counterpart — same size/weight, §2.10 light text tokens for the band
// text. Used inline because the band sits outside .md-doc (no var flip reach).
const stickyLevelStyleLight: Record<number, React.CSSProperties> = {
  1: { fontSize: 13, fontWeight: 600, color: '#101012' }, // --text-emphasis
  2: { fontSize: 12, fontWeight: 600, color: '#1F1F22' }, // --text-primary
  3: { fontSize: 12, fontWeight: 500, color: '#3F3F46' }, // --text-secondary
  4: { fontSize: 11, fontWeight: 400, color: '#57575E' }, // --text-muted
}

const stickyRowText: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const editWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  height: '100%',
  boxSizing: 'border-box',
}

const textarea: React.CSSProperties = {
  background: '#0A0A0A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.5,
  flex: 1,
  minHeight: 320,
  outline: 'none',
  padding: '10px 12px',
  resize: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const modeHint: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px 0',
  fontSize: 10,
  color: '#606060',
}

const savedText: React.CSSProperties = {
  color: '#34D399',
  marginLeft: 4,
}

const conflictText: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 11,
  color: '#E0A030',
  lineHeight: 1.5,
}

const errorInline: React.CSSProperties = {
  fontSize: 11,
  color: '#E04040',
}
