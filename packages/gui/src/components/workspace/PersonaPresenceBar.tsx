import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePersonaPresence,
  selectActiveWorker,
  PERSONA_ORDER,
  PERSONA_LABELS,
  PERSONA_COLORS,
  type PersonaId,
  type PersonaEntry,
} from '../../store/personaPresence'
import { useWorkspace } from '../../store/workspace'

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
}

function PersonaChip({ entry, onDismiss }: ChipProps) {
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

      {/* Tooltip — done(artifact) or working(task). T-PATCH-148 (Q2). */}
      {(state === 'done' || (state === 'working' && !!task)) && tooltipVisible && (
        <div style={tooltipStyle} role="tooltip">
          {tooltipText}
        </div>
      )}
    </div>
  )
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

// ── Worker live-stream slot (T-PATCH-270 #9) ──────────────────────────────────
// Read-only mono tail of the active worker's output. Renders only when a worker
// (designer/dev/qa — PO HARD-EXCLUDED via selectActiveWorker, which the store
// feeds; PO presence is driven separately by usePOPresenceDerive) is working
// AND has tail lines. Per-line ellipsis, no horizontal scroll. The two layouts
// (inline-right fixed-height / stacked full-width) are chosen by the parent via
// the `layout` prop (ResizeObserver on the bar container).

interface StreamSlotProps {
  persona: PersonaId
  lines: string[]
  layout: 'inline' | 'stacked'
}

function WorkerStreamSlot({ persona, lines, layout }: StreamSlotProps) {
  const { t } = useTranslation()
  const color = PERSONA_COLORS[persona]
  const label = PERSONA_LABELS[persona]

  const slotStyle: React.CSSProperties = {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface-base, #1a1a1a)',
    border: '1px solid var(--border, #2A2A2A)',
    borderRadius: 8,
    overflow: 'hidden',
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
        <span style={{ ...streamLiveStyle, background: color }} aria-hidden="true" />
        <span style={{ ...streamWhoStyle, color }}>{label} · live</span>
        <span style={streamRoStyle}>{t('workspace.presence.readOnly')}</span>
      </div>
      <div style={streamBodyStyle} className="pdt-thin-scroll">
        {lines.map((ln, i) => (
          <div key={i} style={streamLineStyle}>
            {ln}
          </div>
        ))}
      </div>
    </div>
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
const streamLiveStyle: React.CSSProperties = {
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
const streamRoStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 9,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--txt-faint, #6a6a6a)',
  border: '1px solid var(--border, #2A2A2A)',
  borderRadius: 3,
  padding: '0 4px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}
const streamBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '5px 9px',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 11.5,
  lineHeight: 1.55,
  color: 'var(--txt-muted, #9a9a9a)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
}
const streamLineStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

// ── Bar component ─────────────────────────────────────────────────────────────

// Breakpoint (px): bar container width at/above which the stream slot sits
// inline to the right of the chips; below it, the row stacks vertically with the
// slot full-width beneath. Chosen so the four chips (~52px each + gaps) plus a
// usable inline slot fit comfortably before stacking.
const STREAM_INLINE_BP = 380

function PersonaPresenceBar() {
  const { entries, dismissDone, streamTail } = usePersonaPresence()
  const barRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<'inline' | 'stacked'>('inline')

  useEffect(() => {
    ensureSpriteKeyframe()
    ensureStreamKeyframe()
  }, [])

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

  // T-PATCH-270 (#9): latest-active-1 worker (PO HARD-EXCLUDED via
  // selectActiveWorker). Render the slot only when that worker is working AND
  // has tail lines. PO working concurrently never suppresses a live worker slot.
  const activeWorker = selectActiveWorker(entries)
  const activeLines = activeWorker ? streamTail[activeWorker] : []
  const showStream = !!activeWorker && activeLines.length > 0

  return (
    <div
      ref={barRef}
      style={layout === 'inline' || !showStream ? barStyle : barStackedStyle}
      className="rp-persona-bar"
      aria-label="Persona presence"
    >
      {/* Chip row — its own flex row so the slot can sit beside (inline) or below (stacked). */}
      <div style={showStream && layout === 'inline' ? chipRowInlineStyle : chipRowStyle}>
        {PERSONA_ORDER.map((id) => (
          <PersonaChip key={id} entry={entries[id]} onDismiss={dismissDone} />
        ))}
      </div>
      {showStream && activeWorker && (
        <WorkerStreamSlot persona={activeWorker} lines={activeLines} layout={layout} />
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
const barStyle: React.CSSProperties = {
  height: 92,
  flexShrink: 0,
  padding: '6px 12px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
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

// Inline layout: the chip row sits left, fixed-width, beside the stretching slot.
const chipRowInlineStyle: React.CSSProperties = {
  ...chipRowStyle,
  flexShrink: 0,
}
