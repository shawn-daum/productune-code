/**
 * QuickOpenPalette — ⌘P Quick Open overlay (T-P4-047).
 *
 * Presentational component: receives `items` and `onPick`/`onClose` from
 * parent (WorkspaceShell). No store import — keeps this unit-testable.
 *
 * Sources: files / tickets / personas / skills
 * Fuzzy scoring: exact-prefix +200 / substring +120 / subsequence +60 / sublabel +20
 * UI: 560×60vh dialog at top:18vh, design-system R4 tokens only.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, FileText, TicketCheck, User, Sparkles } from 'lucide-react'

// ── Public types ──────────────────────────────────────────────────────────────

export interface QuickOpenItem {
  id: string
  source: 'file' | 'ticket' | 'persona' | 'skill'
  label: string
  sublabel?: string
  priority: number
  open: () => void
}

interface Props {
  items: QuickOpenItem[]
  onClose: () => void
  onPick: (item: QuickOpenItem) => void
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function subsequenceScore(query: string, label: string): number | null {
  let qi = 0
  let consecutive = 0
  let maxConsecutive = 0
  let lastLabelIdx = -1

  for (let li = 0; li < label.length && qi < query.length; li++) {
    if (label[li] === query[qi]) {
      if (lastLabelIdx === li - 1) {
        consecutive++
        maxConsecutive = Math.max(maxConsecutive, consecutive)
      } else {
        consecutive = 1
      }
      lastLabelIdx = li
      qi++
    }
  }

  if (qi < query.length) return null
  return maxConsecutive / query.length
}

function scoreItem(query: string, item: QuickOpenItem): number {
  if (!query) return item.priority

  const q = query.toLowerCase()
  const label = item.label.toLowerCase()
  const sub = (item.sublabel ?? '').toLowerCase()

  if (label.startsWith(q)) return item.priority + 200
  if (label.includes(q)) return item.priority + 120

  const seqScore = subsequenceScore(q, label)
  if (seqScore != null) return item.priority + 60 + seqScore * 40

  if (sub.includes(q)) return item.priority + 20

  return -Infinity
}

function filterAndSort(query: string, items: QuickOpenItem[]): QuickOpenItem[] {
  return items
    .map((it) => ({ it, s: scoreItem(query, it) }))
    .filter(({ s }) => s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .slice(0, 100)
    .map(({ it }) => it)
}

// ── Icon helper ───────────────────────────────────────────────────────────────

function ItemIcon({ source, active }: { source: QuickOpenItem['source']; active: boolean }) {
  const color = active ? '#E8E8EA' : '#C8C8CC'
  const size = 16
  switch (source) {
    case 'file':    return <FileText   size={size} color={color} />
    case 'ticket':  return <TicketCheck size={size} color={color} />
    case 'persona': return <User        size={size} color={color} />
    case 'skill':   return <Sparkles    size={size} color={color} />
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickOpenPalette({ items, onClose, onPick }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)

  const results = filterAndSort(query, items)

  // Focus input + save opener on mount.
  useEffect(() => {
    openerRef.current = document.activeElement
    inputRef.current?.focus()
  }, [])

  // Restore focus on unmount.
  useEffect(() => {
    return () => {
      const opener = openerRef.current as HTMLElement | null
      opener?.focus?.()
    }
  }, [])

  // Reset activeIdx when results change.
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // Scroll active row into view.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const row = list.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handlePick = useCallback(
    (item: QuickOpenItem) => {
      onPick(item)
    },
    [onPick],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (results.length === 0 ? 0 : (i + 1) % results.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = results[activeIdx]
        if (item) handlePick(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results, activeIdx, handlePick, onClose],
  )

  // Overlay click → close; dialog internal click → keep open.
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Open"
      onClick={handleOverlayClick}
    >
      <div style={dialogStyle} onKeyDown={handleKeyDown}>
        {/* Input row */}
        <div style={inputRowStyle}>
          <Search size={16} color="#707070" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            style={inputStyle}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workspace.quickOpen.placeholder')}
            aria-label={t('workspace.quickOpen.placeholder')}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>

        <div style={dividerStyle} />

        {/* Results list */}
        <div ref={listRef} style={listStyle} role="listbox">
          {results.length === 0 ? (
            <div style={emptyStyle}>{t('workspace.quickOpen.empty')}</div>
          ) : (
            results.map((item, idx) => {
              const isActive = idx === activeIdx
              return (
                <div
                  key={item.id}
                  data-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  style={rowStyle(isActive)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => handlePick(item)}
                >
                  <ItemIcon source={item.source} active={isActive} />
                  <span style={labelStyle(isActive)}>{item.label}</span>
                  {item.sublabel && (
                    <span style={sublabelStyle}>{item.sublabel}</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={footerStyle}>
          <span>{t('workspace.quickOpen.hint.nav')}</span>
          <span style={{ marginLeft: 12 }}>{t('workspace.quickOpen.hint.open')}</span>
          <span style={{ marginLeft: 12 }}>{t('workspace.quickOpen.hint.close')}</span>
        </div>
      </div>
    </div>
  )
}

// ── Styles (design-system R4 tokens as inline constants) ─────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
}

const dialogStyle: React.CSSProperties = {
  position: 'absolute',
  top: '18vh',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 560,
  maxWidth: '90vw',
  maxHeight: '60vh',
  borderRadius: 12,
  background: '#1C1C20',           // --surface-modal
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'quickOpenIn 80ms ease-out',
}

const inputRowStyle: React.CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px',
  flexShrink: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: '#E8E8EA',                // --text-primary
  fontFamily: 'inherit',
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#1F1F1F',           // --border-default
  flexShrink: 0,
}

const listStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

const emptyStyle: React.CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  fontSize: 13,
  color: '#707070',                // --text-faint
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    height: 40,
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
    background: active ? '#1A1A1A' : 'transparent',  // --surface-subpanel
    borderLeft: active ? '2px solid #FF6B2B' : '2px solid transparent',  // --accent
    boxSizing: 'border-box',
  }
}

function labelStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    fontSize: 13,
    color: active ? '#E8E8EA' : '#E8E8EA',  // --text-primary
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

const sublabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',                // --text-muted
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 180,
}

const footerStyle: React.CSSProperties = {
  height: 36,
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  flexShrink: 0,
  borderTop: '1px solid #1F1F1F',  // --border-default
  background: '#1C1C20',            // --surface-modal
  fontSize: 12,
  color: '#A0A0A0',                 // --text-muted
}
