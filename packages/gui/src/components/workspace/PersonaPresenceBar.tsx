import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  usePersonaPresence,
  selectActiveWorker,
  PERSONA_ORDER,
  PERSONA_LABELS,
  PERSONA_COLORS,
  STREAM_TAIL_MAX,
  type PersonaId,
  type PersonaEntry,
  type StreamLine,
  type WorkerResult,
} from '../../store/personaPresence'
import { useWorkspace } from '../../store/workspace'
import { usePoModel, poModelLabel, formatModelLabel } from '../../store/poModel'
import PoModelSwitchModal from './PoModelSwitchModal'

// ── Sprite assets (Vite content-hash bundle, same pattern as FreshComposer) ───
// Sprite sheet = 2172×724 = four 543×724 frames laid out horizontally.
// Approach A: 1 PNG per persona + CSS background-position steps(4) — no JS frame
// loop, no per-frame state, GPU-compositable.
import poSprite from '../../assets/personas/po-work-sprite.png'
import designerSprite from '../../assets/personas/designer-work-sprite.png'
import devSprite from '../../assets/personas/dev-work-sprite.png'
import qaSprite from '../../assets/personas/qa-work-sprite.png'

const PERSONA_SPRITE: Record<PersonaId, string> = {
  po: poSprite,
  designer: designerSprite,
  dev: devSprite,
  qa: qaSprite,
}

// ── Keyframe injection (once per document) ───────────────────────────────────

const SPRITE_STYLE_ID = 'persona-sprite-keyframes'

function ensureSpriteKeyframe() {
  if (document.getElementById(SPRITE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SPRITE_STYLE_ID
  // steps(4, jump-none) + background-position 0%→100% with background-size
  // 400% 100%: lands on exactly 0% / 33.33% / 66.67% / 100% (true frame
  // boundaries of the 4-up sheet) so the four frames swap in place a→b→c→d.
  // Plain steps(4) (=jump-end) would land on 0/25/50/75% and slide sideways.
  style.textContent = `
    @keyframes persona-sprite {
      0%   { background-position: 0% 0; }
      100% { background-position: 100% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .persona-sprite-anim { animation: none !important; background-position: 0% 0 !important; }
    }
  `
  document.head.appendChild(style)
}

// ── PO presence derive (T-P4-093) ────────────────────────────────────────────
// Drives PO chip state from workspace.streaming — one-way derive.
//   streaming true  → setPersonaState('po', 'working')  (blink with PO color)
//   streaming false → setPersonaState('po', 'idle')     (immediate; no done flash)
//
// Source of truth: useWorkspace.streaming is set true on PO turn start and
// false on completion/reset — same signal WorkspaceShell already subscribes to.
//
// §B done policy: PO transitions directly to idle (done state not used).
//   PO artifact = ChatPanel bubble itself; chip done flash would be redundant.
//
// §C popup policy: PO chip must NOT open BackgroundTaskPopup.
//   Current chip hover shows done-tooltip only; PO never reaches done state,
//   so popup is naturally skipped. When T-P4-080 chip-popup integration lands,
//   add `if (persona === 'po') return` early guard to openChipPopup().
//
// Sub-agent derive (designer/dev/qa) is a separate path; DERIVE_PERSONAS
// array is unchanged and this hook does not affect it.

function usePOPresenceDerive() {
  const streaming = useWorkspace((s) => s.streaming)

  useEffect(() => {
    const { entries, setPersonaState } = usePersonaPresence.getState()
    if (streaming) {
      if (entries.po.state !== 'working') setPersonaState('po', 'working')
    } else {
      if (entries.po.state === 'working') setPersonaState('po', 'idle')
    }
  }, [streaming])
}

// ── Chip component ───────────────────────────────────────────────────────────

interface ChipProps {
  entry: PersonaEntry
  onDismiss: (persona: PersonaId) => void
  /** T-334: model shown beneath the sprite. undefined → no label (worker w/o
   *  a captured model). Always present for PO (resolved to the GUI default). */
  modelLabel?: string
  /** T-334: PO-only — clicking the model label opens the switcher. Absent for
   *  workers (their model label is display-only). */
  onModelClick?: () => void
}

function PersonaChip({ entry, onDismiss, modelLabel, onModelClick }: ChipProps) {
  const { t } = useTranslation()
  const { persona, state, artifact, task } = entry
  const color = PERSONA_COLORS[persona]
  const label = PERSONA_LABELS[persona]

  const [tooltipVisible, setTooltipVisible] = useState(false)
  const hoverRef = useRef(false)
  const chipRef = useRef<HTMLDivElement>(null)

  // Dismiss done on click outside after hovering the chip
  const handleDocClick = useCallback(
    (e: MouseEvent) => {
      if (!hoverRef.current) return
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) {
        setTooltipVisible(false)
        onDismiss(persona)
      }
    },
    [persona, onDismiss],
  )

  useEffect(() => {
    if (state !== 'done') return
    document.addEventListener('click', handleDocClick, true)
    return () => document.removeEventListener('click', handleDocClick, true)
  }, [state, handleDocClick])

  // Character sprite cell — 64px tall, 0.75 portrait ratio → 48px wide.
  // working: 4-frame sprite animation. idle: frame-01 stop, grayscale + dim.
  // done: frame-01 stop, full color.
  // background-size/position logic unchanged — only the cell w/h grow so the
  // sprite scales up proportionally.
  const isWorking = state === 'working'
  const characterStyle: React.CSSProperties = {
    width: 48,
    height: 64,
    flexShrink: 0,
    backgroundImage: `url(${PERSONA_SPRITE[persona]})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '400% 100%',
    backgroundPosition: '0% 0',
    animation: isWorking ? 'persona-sprite 0.6s steps(4, jump-none) infinite' : 'none',
    filter: state === 'idle' ? 'grayscale(1)' : 'none',
    opacity: state === 'idle' ? 0.4 : 1,
  }

  // Label style — T-PATCH-214 #2: persona brand color as the label BACKGROUND
  // (closes the same-meaning/different-token gap: Team panel uses persona color,
  // the chat-header presence row was monochrome at idle). Text = --surface-body
  // #0F0F0F (near-black) on every persona bg clears WCAG AA at this 10px size:
  // PO 4.53:1 (AA), designer 8.47:1, dev 8.95:1, qa 9.97:1 (all AAA). See DS §2.9.
  // White text would fail on the bright orange/sky/emerald hues (2.0–2.3:1).
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    lineHeight: '14px',
    color: '#0F0F0F',
    background: color,
    borderRadius: 3,
    padding: '0 5px',
    fontWeight: 600,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  const chipStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    position: 'relative',
    cursor: 'default',
    outline: 'none',
  }

  // Tooltip content (T-PATCH-148, Q2):
  //   working → entry.task (작업 요약)
  //   done    → entry.artifact (승계된 task = 완료 작업 요약)
  //   idle    → tooltip 안 띄움(아래 hover 가드)
  // 60자 초과 시 …로 절단(기존 규칙 유지).
  const truncate = (s: string) => (s.length > 60 ? s.slice(0, 57) + '…' : s)
  const tooltipText =
    state === 'working'
      ? (task ? truncate(task) : t('workspace.presence.workingNoTask'))
      : artifact
        ? truncate(artifact)
        : t('workspace.presence.doneNoArtifact')

  return (
    <div
      ref={chipRef}
      style={chipStyle}
      role="status"
      aria-label={t('workspace.presence.chipAriaLabel', { persona: label, state })}
      tabIndex={0}
      onMouseEnter={() => {
        hoverRef.current = true
        // T-PATCH-148 (Q2): show on done(artifact) AND working(task). idle = no tooltip.
        if (state === 'done' || (state === 'working' && !!task)) setTooltipVisible(true)
      }}
      onMouseLeave={() => {
        hoverRef.current = false
        setTooltipVisible(false)
      }}
    >
      <div
        style={characterStyle}
        aria-hidden="true"
        className={isWorking ? 'persona-character persona-sprite-anim' : 'persona-character'}
      />
      <span style={labelStyle}>
        {label}
        {state === 'done' ? ' ✓' : ''}
      </span>

      {/* T-334: model sub-label beneath the sprite. PO = clickable switcher
          (requirement #2/#3); workers = display-only (silent when unknown). */}
      {modelLabel && (
        onModelClick ? (
          <button
            type="button"
            style={modelBtnStyle}
            onClick={(e) => { e.stopPropagation(); onModelClick() }}
            title={t('workspace.poModel.spriteHint')}
            aria-label={t('workspace.poModel.spriteAria', { model: modelLabel })}
          >
            {modelLabel}
          </button>
        ) : (
          <span style={modelTextStyle}>{modelLabel}</span>
        )
      )}

      {/* Tooltip — done(artifact) or working(task). T-PATCH-148 (Q2). */}
      {(state === 'done' || (state === 'working' && !!task)) && tooltipVisible && (
        <div style={tooltipStyle} role="tooltip">
          {tooltipText}
        </div>
      )}
    </div>
  )
}

// T-334: model sub-label beneath the sprite label. Compact mono, muted.
const modelTextStyle: React.CSSProperties = {
  fontSize: 9,
  lineHeight: '12px',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  color: 'var(--txt-faint, #6a6a6a)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  maxWidth: 64,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
// PO's model label — clickable (opens the switcher). Underlined affordance so it
// reads as interactive vs. the display-only worker labels.
const modelBtnStyle: React.CSSProperties = {
  ...modelTextStyle,
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--txt-muted, #9a9a9a)',
  textDecoration: 'underline',
  textDecorationColor: '#404040',
  textUnderlineOffset: 2,
}

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 4px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1e1e1e',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  fontSize: 10,
  color: 'var(--txt, #F0F0F0)',
  padding: '3px 7px',
  boxShadow: '0 4px 12px rgba(0,0,0,.5)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 200,
  zIndex: 100,
  pointerEvents: 'none',
}

// ── Cost/duration meta formatting (T-PATCH-281 AC-7) ──────────────────────────
// Compact, silent-on-missing. tokens: "12.3k tok" (or raw when <1000). duration:
// "3.2s" / "1m 04s". Missing usage → the field is dropped entirely (no 0/garbage).

function formatTokens(total?: number): string | null {
  if (typeof total !== 'number' || total <= 0) return null
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tok`
  return `${total} tok`
}

function formatDuration(startedAt?: number, completedAt?: number, durationMs?: number): string | null {
  let ms: number | null = null
  if (typeof durationMs === 'number' && durationMs > 0) ms = durationMs
  else if (typeof startedAt === 'number' && typeof completedAt === 'number' && completedAt > startedAt) {
    ms = completedAt - startedAt
  }
  if (ms == null || ms <= 0) return null
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

// ── Worker live-stream slot (T-PATCH-270 #9 · redesigned T-PATCH-281) ──────────
// Fixed-height, internally-scrolling (auto-follow) read-only panel showing the
// active worker's output — prose primary (sans/muted), tool subordinate (mono/
// faint). Header shows the persona (label+color+live dot when running) and a
// right-aligned cost/duration meta (AC-7 — the freed space from the removed
// READ-ONLY badge, AC-4). Click the body → expanded overlay (AC-2). When the
// worker finishes, the frozen `result` keeps the panel readable until next turn
// (AC-6). PO is HARD-EXCLUDED upstream (selectActiveWorker / worker-stream never
// carries PO).

interface StreamLineViewProps {
  line: StreamLine
}
function StreamLineView({ line }: StreamLineViewProps) {
  return (
    <div style={line.kind === 'prose' ? streamProseLineStyle : streamToolLineStyle}>
      {line.text}
    </div>
  )
}

interface MetaBadgesProps {
  tokens: string | null
  duration: string | null
}
function MetaBadges({ tokens, duration }: MetaBadgesProps) {
  if (!tokens && !duration) return null
  return (
    <span style={metaWrapStyle}>
      {duration && <span style={metaBadgeStyle}>{duration}</span>}
      {tokens && <span style={metaBadgeStyle}>{tokens}</span>}
    </span>
  )
}

interface StreamSlotProps {
  persona: PersonaId
  lines: StreamLine[]
  live: boolean            // worker currently working (live dot + blink) vs. frozen result
  tokens: string | null
  duration: string | null
  layout: 'inline' | 'stacked'
  onExpand: () => void
}

function WorkerStreamSlot({ persona, lines, live, tokens, duration, layout, onExpand }: StreamSlotProps) {
  const { t } = useTranslation()
  const color = PERSONA_COLORS[persona]
  const label = PERSONA_LABELS[persona]
  const bodyRef = useRef<HTMLDivElement>(null)

  // AC-1 auto-follow: keep the newest line at the bottom in view as lines land.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  const slotStyle: React.CSSProperties = {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface-base, #1a1a1a)',
    border: '1px solid var(--border, #2A2A2A)',
    borderRadius: 8,
    overflow: 'hidden',
    // AC-1: FIXED height in both layouts so the slot never grows/squishes the
    // chip row — the body scrolls internally instead.
    ...(layout === 'inline'
      ? { flex: 1, alignSelf: 'stretch' }
      : { width: '100%', height: 76 }),
  }

  return (
    <div
      style={slotStyle}
      role="log"
      aria-live="polite"
      aria-label={t('workspace.presence.streamAriaLabel', { persona: label })}
    >
      <div style={streamHdrStyle}>
        <span
          style={{ ...streamDotStyle, background: color, ...(live ? {} : { animation: 'none' }) }}
          aria-hidden="true"
        />
        <span style={{ ...streamWhoStyle, color }}>
          {label}{live ? ' · live' : ''}
        </span>
        {/* AC-4: READ-ONLY badge removed; AC-7: cost/duration in the freed space. */}
        <MetaBadges tokens={tokens} duration={duration} />
      </div>
      {/* AC-2: click body → expand overlay. Non-interactive text (text-select only)
          conveys read-only (AC-4) — the expand click is on the container, cursor
          stays default so it doesn't read as an editable field. */}
      <div
        ref={bodyRef}
        style={streamBodyStyle}
        className="pdt-thin-scroll"
        onClick={onExpand}
        title={t('workspace.presence.expandHint')}
      >
        {/* Inner wrapper w/ margin-top:auto bottom-anchors the newest line without
            justify-content:flex-end — the flex-end + overflow-y:auto combo has a
            Chromium quirk where overflow escapes above the scroll origin and
            wheel-up can't reach it. margin-top:auto pins the stack to the bottom
            when short and collapses to 0 (normal top-scrollable overflow) when the
            content exceeds the fixed slot height. flexShrink:0 keeps the wrapper
            (and its lines) at natural height so lines never squish/overlap. */}
        <div style={streamBodyInnerStyle}>
          {lines.map((ln, i) => (
            <StreamLineView key={i} line={ln} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Expanded overlay (T-PATCH-281 AC-2) ───────────────────────────────────────
// Portal + backdrop modal showing the full retained buffer, large. Esc / backdrop
// / × close. Live: re-renders as new lines arrive (parent passes fresh `lines`).

interface ExpandOverlayProps {
  persona: PersonaId
  lines: StreamLine[]
  live: boolean
  tokens: string | null
  duration: string | null
  onClose: () => void
}
function ExpandOverlay({ persona, lines, live, tokens, duration, onClose }: ExpandOverlayProps) {
  const { t } = useTranslation()
  const color = PERSONA_COLORS[persona]
  const label = PERSONA_LABELS[persona]
  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc close + focus the panel for a11y (AC-8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey, true)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Auto-follow while expanded (live updates, AC-2).
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return createPortal(
    <div
      style={overlayBackdropStyle}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        style={overlayPanelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('workspace.presence.streamAriaLabel', { persona: label })}
        tabIndex={-1}
      >
        <div style={overlayHdrStyle}>
          <span
            style={{ ...streamDotStyle, background: color, ...(live ? {} : { animation: 'none' }) }}
            aria-hidden="true"
          />
          <span style={{ ...streamWhoStyle, color, fontSize: 13 }}>
            {label}{live ? ' · live' : ''}
          </span>
          <MetaBadges tokens={tokens} duration={duration} />
          <button
            style={overlayCloseStyle}
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            ×
          </button>
        </div>
        <div ref={bodyRef} style={overlayBodyStyle} className="pdt-thin-scroll" role="log" aria-live="polite">
          {lines.length === 0 ? (
            <div style={streamToolLineStyle}>{t('workspace.presence.workingNoTask')}</div>
          ) : (
            lines.map((ln, i) => <StreamLineView key={i} line={ln} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const streamHdrStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '3px 9px',
  borderBottom: '1px solid var(--border, #2A2A2A)',
  background: 'var(--surface-panel, #161616)',
  flexShrink: 0,
}
const streamDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
  animation: 'persona-stream-blink 0.8s ease-in-out infinite alternate',
}
const streamWhoStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}
// AC-7: cost/duration meta badges (replaces the removed READ-ONLY badge, AC-4).
const metaWrapStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}
const metaBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 9,
  letterSpacing: '0.04em',
  color: 'var(--txt-faint, #6a6a6a)',
  whiteSpace: 'nowrap',
}
const streamBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '5px 9px',
  fontSize: 11.5,
  lineHeight: 1.55,
  display: 'flex',
  flexDirection: 'column',
  // NO justify-content:flex-end — that + overflow-y:auto triggers the Chromium
  // flex bug where overflow escapes above the scroll origin (wheel-up dead). The
  // inner wrapper's margin-top:auto does the bottom-anchoring instead.
  cursor: 'pointer',       // click → expand (AC-2)
}
// Bottom-anchor wrapper: margin-top:auto pushes the line stack to the bottom when
// it's shorter than the slot, and collapses to 0 (leaving normal top-anchored,
// fully-scrollable overflow) once the lines exceed the fixed slot height.
// flexShrink:0 stops the flex parent from compressing the wrapper — the squish
// that made lines overlap when the buffer overflowed.
const streamBodyInnerStyle: React.CSSProperties = {
  marginTop: 'auto',
  flexShrink: 0,
}
// AC-5: PROSE lines — sans, muted, primary (readable natural language).
// flexShrink:0 + explicit line-height/min-height guarantee each line keeps its
// natural height (no squish/overlap) whether rendered in the slot's block wrapper
// or the overlay's flex column.
const streamProseLineStyle: React.CSSProperties = {
  color: 'var(--txt-muted, #9a9a9a)',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  flexShrink: 0,
  lineHeight: 1.55,
  minHeight: '1.55em',
}
// AC-5: TOOL lines — mono, faint, subordinate (compact trace).
const streamToolLineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 10.5,
  color: 'var(--txt-faint, #6a6a6a)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
  lineHeight: 1.55,
  minHeight: '1.55em',
}

// Expand overlay styles (AC-2).
const overlayBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}
const overlayPanelStyle: React.CSSProperties = {
  width: 'min(720px, 92vw)',
  height: 'min(560px, 80vh)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-base, #1a1a1a)',
  border: '1px solid var(--border, #2A2A2A)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '0 12px 48px rgba(0,0,0,.6)',
  outline: 'none',
}
const overlayHdrStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid var(--border, #2A2A2A)',
  background: 'var(--surface-panel, #161616)',
  flexShrink: 0,
}
const overlayCloseStyle: React.CSSProperties = {
  marginLeft: 8,
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--txt-muted, #9a9a9a)',
  background: 'transparent',
  border: '1px solid var(--border, #2A2A2A)',
  borderRadius: 5,
  cursor: 'pointer',
  flexShrink: 0,
}
const overlayBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '10px 14px',
  fontSize: 13,
  lineHeight: 1.6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

// ── Bar component ─────────────────────────────────────────────────────────────

// Breakpoint (px): bar container width at/above which the stream slot sits
// inline to the right of the chips; below it, the row stacks vertically with the
// slot full-width beneath. Chosen so the four chips (~52px each + gaps) plus a
// usable inline slot fit comfortably before stacking.
const STREAM_INLINE_BP = 380

function PersonaPresenceBar() {
  const { entries, dismissDone, streamTail, workerResult, workerMeta } = usePersonaPresence()
  const barRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<'inline' | 'stacked'>('inline')
  const [expanded, setExpanded] = useState(false)

  // T-334: current PO model (shared store) + the PO-only switcher modal.
  const projectDir = useWorkspace((s) => s.project?.projectDir ?? null)
  const poModelRaw = usePoModel((s) => s.model)
  const poModelSupported = usePoModel((s) => s.supported)
  const poRealModelId = usePoModel((s) => s.realModelId)
  const loadPoModel = usePoModel((s) => s.load)
  // T-335: human-readable label — prefers the live-captured real model id
  // ("Opus 4.8"), falls back to the capitalized alias ("Opus") pre-first-token.
  const poModel = poModelLabel({ model: poModelRaw, realModelId: poRealModelId })
  const [switcherOpen, setSwitcherOpen] = useState(false)

  useEffect(() => {
    ensureSpriteKeyframe()
    ensureStreamKeyframe()
  }, [])

  // Load the PO model when the project resolves (and refresh if it changes).
  useEffect(() => {
    if (projectDir) loadPoModel(projectDir)
  }, [projectDir, loadPoModel])

  // PO chip working blink — T-P4-093 (workspace.streaming → personaPresence.po)
  usePOPresenceDerive()

  // T-PATCH-270 (#9): pick layout from the bar's own width (ResizeObserver).
  useEffect(() => {
    const el = barRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((roEntries) => {
      const w = roEntries[0]?.contentRect.width ?? el.clientWidth
      setLayout(w >= STREAM_INLINE_BP ? 'inline' : 'stacked')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Slot source resolution (T-PATCH-281) ────────────────────────────────────
  // LIVE takes precedence: the latest-active worker (PO HARD-EXCLUDED) with live
  // tail lines. Otherwise fall back to a FROZEN result held past the sprite's
  // auto-idle (AC-6) — the most-recently-completed worker that still has a result.
  const liveWorker = selectActiveWorker(entries)
  const liveLines = liveWorker ? streamTail[liveWorker] : []
  const hasLive = !!liveWorker && liveLines.length > 0

  // Frozen fallback: pick the persona whose held result completed most recently.
  let resultWorker: PersonaId | null = null
  if (!hasLive) {
    let bestAt = -1
    for (const p of PERSONA_ORDER) {
      if (p === 'po') continue
      const r = workerResult[p]
      if (r && (r.completedAt ?? 0) > bestAt) { bestAt = r.completedAt ?? 0; resultWorker = p }
    }
  }

  const slotWorker = hasLive ? liveWorker : resultWorker
  const isLiveSlot = hasLive
  const frozen: WorkerResult | null = !hasLive && resultWorker ? workerResult[resultWorker] : null
  // Full retained buffer (for expand); collapsed slot slices the short tail.
  const fullLines: StreamLine[] = isLiveSlot ? liveLines : (frozen?.lines ?? [])
  const tailLines = fullLines.slice(-STREAM_TAIL_MAX)

  // Cost/duration: live meta while running, frozen snapshot after.
  const meta = slotWorker ? (isLiveSlot ? workerMeta[slotWorker] : {
    usage: frozen?.usage, startedAt: frozen?.startedAt, completedAt: frozen?.completedAt,
  }) : {}
  const tokens = formatTokens(meta.usage?.total_tokens)
  const duration = formatDuration(meta.startedAt, meta.completedAt, meta.usage?.duration_ms)

  const showStream = !!slotWorker && fullLines.length > 0

  // Close the expand overlay if the slot disappears (next-turn clear).
  useEffect(() => {
    if (!showStream && expanded) setExpanded(false)
  }, [showStream, expanded])

  const inline = layout === 'inline'

  return (
    <div
      ref={barRef}
      style={inline || !showStream ? barStyle : barStackedStyle}
      className="rp-persona-bar"
      aria-label="Persona presence"
    >
      {/* Chip row. AC-3 anchor: in inline layout the slot is rendered immediately
          AFTER the active worker's chip, so it reads as belonging to that persona
          (not floating between two chips). In stacked layout the slot drops below
          the whole row (header label+color carries the ownership, AC-3 fallback). */}
      <div style={showStream && inline ? chipRowInlineStyle : chipRowStyle}>
        {PERSONA_ORDER.map((id) => {
          const carriesSlot = showStream && inline && slotWorker === id
          return (
            <span key={id} style={carriesSlot ? chipCellGrowStyle : chipCellStyle}>
              <PersonaChip
                entry={entries[id]}
                onDismiss={dismissDone}
                // T-334: PO shows the resolved session model (clickable switcher)
                // — prdt projects only, where the override is supported. Workers
                // show their captured running model (display-only, silent when
                // unknown).
                modelLabel={
                  id === 'po'
                    ? (poModelSupported ? poModel : undefined)
                    // T-335: workerMeta[id].model is the raw captured id (e.g.
                    // "claude-opus-4-8") — humanize it the same way as the PO
                    // label. Still silent (undefined) when not yet captured.
                    : (workerMeta[id].model ? formatModelLabel(workerMeta[id].model) : undefined)
                }
                onModelClick={id === 'po' && poModelSupported ? () => setSwitcherOpen(true) : undefined}
              />
              {carriesSlot && slotWorker && (
                <div style={anchoredSlotStyle}>
                  <WorkerStreamSlot
                    persona={slotWorker}
                    lines={tailLines}
                    live={isLiveSlot}
                    tokens={tokens}
                    duration={duration}
                    layout="inline"
                    onExpand={() => setExpanded(true)}
                  />
                </div>
              )}
            </span>
          )
        })}
      </div>

      {/* Stacked fallback: full-width slot below the chip row. */}
      {showStream && !inline && slotWorker && (
        <WorkerStreamSlot
          persona={slotWorker}
          lines={tailLines}
          live={isLiveSlot}
          tokens={tokens}
          duration={duration}
          layout="stacked"
          onExpand={() => setExpanded(true)}
        />
      )}

      {expanded && slotWorker && (
        <ExpandOverlay
          persona={slotWorker}
          lines={fullLines}
          live={isLiveSlot}
          tokens={tokens}
          duration={duration}
          onClose={() => setExpanded(false)}
        />
      )}

      {/* T-334: PO model switcher (restarts the session on confirm). */}
      {switcherOpen && projectDir && (
        <PoModelSwitchModal projectDir={projectDir} onClose={() => setSwitcherOpen(false)} />
      )}
    </div>
  )
}

export default PersonaPresenceBar

const STREAM_STYLE_ID = 'persona-stream-keyframes'

function ensureStreamKeyframe() {
  if (document.getElementById(STREAM_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STREAM_STYLE_ID
  style.textContent = `
    @keyframes persona-stream-blink {
      from { opacity: 0.35; }
      to   { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      [style*="persona-stream-blink"] { animation: none !important; opacity: 1 !important; }
    }
  `
  document.head.appendChild(style)
}

// Bar height = char 64 + chip gap 2 + label line 14 + ~6px top/bottom padding
// = ≈92px, sized so the vertical char/label stack never clips. When the stream
// slot sits inline (wide), the bar keeps this fixed height and the slot stretches
// to it. When stacked (narrow), the bar grows vertically (barStackedStyle).
//
// alignItems: 'stretch' (not 'center') is load-bearing — the chip row below is
// the ONLY direct child of this fixed-height container, and the WorkerStreamSlot
// chain relies on `flex: 1` / `alignSelf: 'stretch'` all the way down to size
// itself. That chain only becomes a real height constraint when every ancestor
// in it has a DEFINITE height. With 'center', the row sizes to its own content
// instead of stretching to fill the 92px box, so the definite-height chain never
// starts — the stream slot's body then grows to fit however many lines it holds
// instead of clipping + internally scrolling, and the box visibly overflows the
// bar above/below (repro'd: slot grew to ~138px instead of clipping at ~92px).
// 'stretch' gives the chip row (and everything under it) a real height to size
// against, which is what makes overflow: hidden / overflow-y: auto actually work.
const barStyle: React.CSSProperties = {
  // T-334: +14px over the original 92 for the model sub-label line (fontSize 9
  // /lineHeight 12 + 2 gap) beneath each sprite label — keeps the vertical
  // char/label/model stack from clipping. The inline stream slot stretches to
  // this height via the alignSelf:stretch chain (a bit taller, no layout break).
  height: 106,
  flexShrink: 0,
  padding: '6px 12px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: 14,
  background: '#161616',
  borderBottom: '1px solid var(--border, #2A2A2A)',
}

// Stacked (narrow): row expands vertically, slot full-width below the chip row.
const barStackedStyle: React.CSSProperties = {
  ...barStyle,
  height: 'auto',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 8,
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
}

// Inline layout: the chip row takes the full bar width so the anchored slot (which
// lives inside a chip cell) can stretch to the right of its persona's chip.
const chipRowInlineStyle: React.CSSProperties = {
  ...chipRowStyle,
  flex: 1,
  minWidth: 0,
}

// A chip cell — the chip plus (for the active worker) its anchored slot to the
// right. Plain cells are content-width; the cell carrying the slot grows to fill
// the remaining bar width so the panel is usably wide (chipCellGrowStyle).
const chipCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
}
const chipCellGrowStyle: React.CSSProperties = {
  ...chipCellStyle,
  flex: 1,
  alignSelf: 'stretch',
}

// The anchored inline slot wrapper — stretches to consume the bar's free width so
// the panel is usably wide while staying to the right of its persona's chip (AC-3).
const anchoredSlotStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  alignSelf: 'stretch',
  display: 'flex',
}
