/**
 * FindBar — T-PATCH-046
 *
 * Inline find bar overlay. Positioned absolute at the top of the LeafPane body
 * (position:relative container), full width, z-index above content.
 *
 * Props:
 *   query / onQueryChange — controlled input
 *   onNext / onPrev — cycle through matches
 *   onClose — dismiss (also wired to Esc keydown)
 *   matchInfo — { current, total } | null; null = no search run yet
 */

import { useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface MatchInfo {
  current: number
  total: number
}

interface Props {
  query: string
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  matchInfo: MatchInfo | null
}

export default function FindBar({ query, onQueryChange, onNext, onPrev, onClose, matchInfo }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
    }
  }

  const noResults = matchInfo !== null && matchInfo.total === 0 && query.length > 0

  return (
    <div style={barStyle}>
      <div style={inputWrap(noResults)}>
        <input
          ref={inputRef}
          style={inputStyle}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('workspace.findBar.placeholder')}
          spellCheck={false}
          aria-label={t('workspace.findBar.placeholder')}
        />
        <span style={matchCountStyle(noResults)}>
          {noResults
            ? t('workspace.findBar.noResults')
            : matchInfo !== null && matchInfo.total > 0
              ? t('workspace.findBar.matchCount', { current: matchInfo.current, total: matchInfo.total })
              : null}
        </span>
      </div>

      <button
        style={iconBtn}
        onClick={onPrev}
        title={t('workspace.findBar.prev')}
        aria-label={t('workspace.findBar.prev')}
        disabled={!matchInfo || matchInfo.total === 0}
      >
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button
        style={iconBtn}
        onClick={onNext}
        title={t('workspace.findBar.next')}
        aria-label={t('workspace.findBar.next')}
        disabled={!matchInfo || matchInfo.total === 0}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button
        style={closeBtn}
        onClick={onClose}
        title={t('workspace.findBar.close')}
        aria-label={t('workspace.findBar.close')}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const barStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 36,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  background: '#1A1A1A',
  borderBottom: '1px solid #2A2A2A',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  flexShrink: 0,
}

function inputWrap(noResults: boolean): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    border: `1px solid ${noResults ? '#7F1D1D' : '#333'}`,
    borderRadius: 4,
    background: noResults ? '#1F0A0A' : '#111',
    padding: '0 6px',
    gap: 4,
    height: 26,
  }
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#E5E5E5',
  fontSize: 12,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  padding: 0,
}

function matchCountStyle(noResults: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    color: noResults ? '#EF4444' : '#707070',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#A0A0A0',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 4,
  padding: 0,
  flexShrink: 0,
}

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#707070',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 4,
  padding: 0,
  flexShrink: 0,
  marginLeft: 2,
}
