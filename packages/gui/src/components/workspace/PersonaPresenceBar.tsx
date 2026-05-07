import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePersonaPresence,
  PERSONA_ORDER,
  PERSONA_LABELS,
  PERSONA_COLORS,
  type PersonaId,
  type PersonaEntry,
} from '../../store/personaPresence'

// ── Keyframe injection (once per document) ───────────────────────────────────

const BLINK_STYLE_ID = 'persona-blink-keyframes'

function ensureBlinkKeyframe() {
  if (document.getElementById(BLINK_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = BLINK_STYLE_ID
  style.textContent = `
    @keyframes persona-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.2; }
    }
  `
  document.head.appendChild(style)
}

// ── Chip component ───────────────────────────────────────────────────────────

interface ChipProps {
  entry: PersonaEntry
  onDismiss: (persona: PersonaId) => void
}

function PersonaChip({ entry, onDismiss }: ChipProps) {
  const { t } = useTranslation()
  const { persona, state, artifact } = entry
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

  // Dot style
  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor:
      state === 'idle'   ? '#4a4a4a'   // --txt3
      : state === 'done' ? '#22C55E'   // --success
      : color,                          // working = persona color
    animation: state === 'working' ? 'persona-blink 0.8s ease infinite' : 'none',
  }

  // Label style
  const labelColor =
    state === 'idle'   ? '#707070'  // --txt2
    : state === 'done' ? color
    : color

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    lineHeight: '14px',
    color: labelColor,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  const chipStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
    cursor: state === 'done' ? 'default' : 'default',
    outline: 'none',
  }

  // Tooltip content
  const tooltipText =
    artifact
      ? artifact.length > 60
        ? artifact.slice(0, 57) + '…'
        : artifact
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
        if (state === 'done') setTooltipVisible(true)
      }}
      onMouseLeave={() => {
        hoverRef.current = false
        setTooltipVisible(false)
      }}
    >
      <span style={dotStyle} aria-hidden="true" className="persona-dot" />
      <span style={labelStyle}>
        {label}
        {state === 'done' ? ' ✓' : ''}
      </span>

      {/* Done artifact tooltip */}
      {state === 'done' && tooltipVisible && (
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

// ── Bar component ─────────────────────────────────────────────────────────────

export default function PersonaPresenceBar() {
  const { entries, dismissDone } = usePersonaPresence()

  useEffect(() => {
    ensureBlinkKeyframe()
  }, [])

  return (
    <div style={barStyle} className="rp-persona-bar" aria-label="Persona presence">
      {PERSONA_ORDER.map((id) => (
        <PersonaChip key={id} entry={entries[id]} onDismiss={dismissDone} />
      ))}
    </div>
  )
}

const barStyle: React.CSSProperties = {
  height: 24,
  flexShrink: 0,
  padding: '0 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: '#161616',
  borderBottom: '1px solid var(--border, #2A2A2A)',
}
