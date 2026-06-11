/**
 * QuickOpenPalette — ⌘P Quick Open overlay (T-P4-047 / T-015 A6).
 *
 * Presentational component: receives `items` and `onPick`/`onClose` from
 * parent (WorkspaceShell). No store import — keeps this unit-testable.
 *
 * Sources: files / tickets / tabs / skills / mcp / artifacts / personas
 * Fuzzy scoring: exact-prefix +200 / substring +120 / subsequence +60 / sublabel +20
 * Layout: grouped sections (tickets → tabs → skills → mcp → artifacts → personas)
 * UI: 560×60vh dialog at top:18vh, design-system R4 tokens only.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, FileText, TicketCheck, User, Sparkles, LayoutPanelLeft, Server, Package } from 'lucide-react'

// ── Public types ──────────────────────────────────────────────────────────────

export type QuickOpenCategory = 'tickets' | 'tabs' | 'skills' | 'mcp' | 'artifacts' | 'personas'

export interface QuickOpenItemMeta {
  statusPill?: string
  typeBadge?: string
  connectionDot?: 'on' | 'off'
  personaDot?: 'po' | 'designer' | 'dev' | 'qa'
}

export interface QuickOpenItem {
  id: string
  source: 'file' | 'ticket' | 'persona' | 'skill' | 'tab' | 'mcp' | 'artifact'
  category?: QuickOpenCategory
  label: string
  sublabel?: string
  meta?: QuickOpenItemMeta
  priority: number
  open: () => void
}

interface Props {
  items: QuickOpenItem[]
  onClose: () => void
  onPick: (item: QuickOpenItem) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_ORDER: QuickOpenCategory[] = [
  'tickets', 'tabs', 'skills', 'mcp', 'artifacts', 'personas',
]

const SECTION_LABELS: Record<QuickOpenCategory, string> = {
  tickets: 'tickets',
  tabs: 'tabs',
  skills: 'skills',
  mcp: 'MCP',
  artifacts: 'artifacts',
  personas: 'personas',
}

const PREFIX_MAP: Record<string, QuickOpenCategory> = {
  't:': 'tickets',
  'tab:': 'tabs',
  's:': 'skills',
  'mcp:': 'mcp',
  'a:': 'artifacts',
  'p:': 'personas',
}

const LEGEND_CHIPS: Array<{ prefix: string; labelKey: string | null; literal?: string }> = [
  { prefix: 't:', labelKey: 'workspace.quickOpen.section.ticket' },
  { prefix: 'tab:', labelKey: 'workspace.quickOpen.section.tab' },
  { prefix: 's:', labelKey: 'workspace.quickOpen.section.skill' },
  { prefix: 'mcp:', labelKey: null, literal: 'MCP' },
  { prefix: 'a:', labelKey: 'workspace.quickOpen.section.artifact' },
  { prefix: 'p:', labelKey: 'workspace.quickOpen.section.persona' },
]

const RECENT_KEY = 'productune:quickopen:recent'
const MAX_RECENT = 5

// ── Recent history helpers ─────────────────────────────────────────────────────

function loadRecentIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecentId(id: string): void {
  try {
    const current = loadRecentIds().filter((x) => x !== id)
    const next = [id, ...current].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
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

// ── Category prefix parsing ───────────────────────────────────────────────────

function parseCategoryPrefix(query: string): {
  filteredCategory: QuickOpenCategory | null
  strippedQuery: string
} {
  for (const [prefix, cat] of Object.entries(PREFIX_MAP)) {
    if (query.startsWith(prefix)) {
      return { filteredCategory: cat, strippedQuery: query.slice(prefix.length) }
    }
  }
  return { filteredCategory: null, strippedQuery: query }
}

// ── Grouping ──────────────────────────────────────────────────────────────────

type GroupedResults = Partial<Record<QuickOpenCategory, QuickOpenItem[]>>

function groupResults(items: QuickOpenItem[], query: string): GroupedResults {
  const scored = filterAndSort(query, items)
  const groups: GroupedResults = {}
  for (const item of scored) {
    if (!item.category) continue
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category]!.push(item)
  }
  return groups
}

// ── Flatten rows for keyboard navigation ─────────────────────────────────────

function flattenRows(groups: GroupedResults): QuickOpenItem[] {
  const rows: QuickOpenItem[] = []
  for (const cat of SECTION_ORDER) {
    const section = groups[cat]
    if (section && section.length > 0) rows.push(...section)
  }
  return rows
}

// ── Icon helper ───────────────────────────────────────────────────────────────

function ItemIcon({ source, active }: { source: QuickOpenItem['source']; active: boolean }) {
  const color = active ? '#E8E8EA' : '#A0A0A0'
  const size = 16
  switch (source) {
    case 'file':     return <FileText         size={size} color={color} />
    case 'ticket':   return <TicketCheck      size={size} color={color} />
    case 'persona':  return <User             size={size} color={color} />
    case 'skill':    return <Sparkles         size={size} color={color} />
    case 'tab':      return <LayoutPanelLeft  size={size} color={color} />
    case 'mcp':      return <Server           size={size} color={color} />
    case 'artifact': return <Package          size={size} color={color} />
    default:         return <FileText         size={size} color={color} />
  }
}

// ── Status pill color map ─────────────────────────────────────────────────────

const STATUS_PILL_STYLE: Record<string, React.CSSProperties> = {
  todo:       { background: 'rgba(80,80,80,0.18)',   color: '#A0A0A0' },
  'in-progress': { background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' },
  review:     { background: 'rgba(224,176,64,0.14)', color: '#E0B040' },
  done:       { background: 'rgba(52,211,153,0.14)',  color: '#34D399' },
  blocked:    { background: 'rgba(224,64,64,0.14)',  color: '#E04040' },
  abandoned:  { background: 'rgba(58,58,58,0.18)',   color: '#505050' },
}

const PERSONA_DOT_COLOR: Record<string, string> = {
  po:       '#8B5CF6',
  designer: '#FB923C',
  dev:      '#38BDF8',
  qa:       '#34D399',
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ResultRowProps {
  item: QuickOpenItem
  isActive: boolean
  flatIdx: number
  onMouseEnter: () => void
  onClick: () => void
}

function ResultRow({ item, isActive, flatIdx, onMouseEnter, onClick }: ResultRowProps) {
  return (
    <div
      data-idx={flatIdx}
      role="option"
      aria-selected={isActive}
      style={rowStyle(isActive)}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <ItemIcon source={item.source} active={isActive} />
      <span style={rowMainStyle}>
        <span style={labelStyle(isActive)}>{item.label}</span>
        {item.sublabel && <span style={sublabelStyle}>{item.sublabel}</span>}
      </span>
      {item.meta && (
        <span style={rowRightStyle}>
          {item.meta.statusPill && (() => {
            const pill = STATUS_PILL_STYLE[item.meta.statusPill!] ?? STATUS_PILL_STYLE.todo
            return (
              <span style={{ ...pillBase, ...pill }}>
                {item.meta.statusPill}
              </span>
            )
          })()}
          {item.meta.typeBadge && (
            <span style={typeBadgeStyle}>{item.meta.typeBadge}</span>
          )}
          {item.meta.connectionDot && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: item.meta.connectionDot === 'on' ? '#34D399' : '#505050',
            }} title={item.meta.connectionDot === 'on' ? 'connected' : 'disconnected'} />
          )}
          {item.meta.personaDot && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: PERSONA_DOT_COLOR[item.meta.personaDot] ?? '#707070',
            }} />
          )}
          {isActive && (
            <span style={enterHintStyle}>↵</span>
          )}
        </span>
      )}
      {!item.meta && isActive && (
        <span style={{ ...rowRightStyle }}>
          <span style={enterHintStyle}>↵</span>
        </span>
      )}
    </div>
  )
}

interface SectionGroupProps {
  category: QuickOpenCategory
  rows: QuickOpenItem[]
  flatOffset: number
  activeIdx: number
  onMouseEnterRow: (idx: number) => void
  onClickRow: (item: QuickOpenItem) => void
}

function SectionGroup({ category, rows, flatOffset, activeIdx, onMouseEnterRow, onClickRow }: SectionGroupProps) {
  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>{SECTION_LABELS[category]}</span>
        <span style={sectionCountStyle}>{rows.length}</span>
        <span style={sectionPrefixStyle}>
          {Object.entries(PREFIX_MAP).find(([, v]) => v === category)?.[0] ?? ''}
        </span>
      </div>
      {rows.map((item, i) => {
        const flatIdx = flatOffset + i
        return (
          <ResultRow
            key={item.id}
            item={item}
            isActive={flatIdx === activeIdx}
            flatIdx={flatIdx}
            onMouseEnter={() => onMouseEnterRow(flatIdx)}
            onClick={() => onClickRow(item)}
          />
        )
      })}
    </div>
  )
}

interface RestingStateProps {
  recentItems: QuickOpenItem[]
  activeIdx: number
  onMouseEnterRow: (idx: number) => void
  onClickRow: (item: QuickOpenItem) => void
}

function RestingState({ recentItems, activeIdx, onMouseEnterRow, onClickRow }: RestingStateProps) {
  const { t } = useTranslation()

  return (
    <div style={{ padding: '8px 0 4px' }}>
      {recentItems.length > 0 && (
        <div>
          {recentItems.map((item, i) => {
            const active = i === activeIdx
            return (
              <div
                key={item.id}
                data-idx={i}
                role="option"
                aria-selected={active}
                style={{ ...restingRowStyle, ...restingRowActiveStyle(active) }}
                onMouseEnter={() => onMouseEnterRow(i)}
                onClick={() => onClickRow(item)}
              >
                <ItemIcon source={item.source} active={active} />
                <span style={{ flex: 1, fontSize: 12, color: active ? '#F0F0F0' : '#C8C8CC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {active && <span style={enterHintStyle}>↵</span>}
              </div>
            )
          })}
        </div>
      )}
      <div style={legendStyle}>
        {LEGEND_CHIPS.map((chip) => (
          <span key={chip.prefix} style={legendChipStyle}>
            <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#707070' }}>{chip.prefix}</code>
            <span style={{ fontSize: 11, color: '#A0A0A0' }}>{chip.labelKey ? t(chip.labelKey) : chip.literal}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function NoMatchState() {
  const { t } = useTranslation()
  return (
    <div style={noMatchContainerStyle}>
      <Search size={28} color="#707070" strokeWidth={1.5} />
      <div style={{ fontSize: 14, color: '#C8C8CC', fontWeight: 500 }}>{t('workspace.quickOpen.empty')}</div>
      <div style={{ fontSize: 12, color: '#A0A0A0', lineHeight: 1.4, textAlign: 'center' }}>
        {t('workspace.quickOpen.searchedScope')}<br />{t('workspace.quickOpen.searchedAll')}
      </div>
      <div style={{ fontSize: 11, color: '#707070', marginTop: 4 }}>
        <kbd style={kbdStyle}>Esc</kbd> {t('workspace.quickOpen.hint.close')}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickOpenPalette({ items, onClose, onPick }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)

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

  // Reset activeIdx when query changes.
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

  // Compute groups / flat rows
  const { filteredCategory, strippedQuery } = parseCategoryPrefix(query)
  const scopedItems = filteredCategory
    ? items.filter((i) => i.category === filteredCategory)
    : items
  const groups = query ? groupResults(scopedItems, strippedQuery) : {}

  // Resting (empty-query) state shows the recent list. Build it from the same
  // source RestingState renders so flatRows[activeIdx] and the rendered row
  // always point at the same item — enabling arrow-nav + Enter at rest.
  const recentItems = useMemo(() => {
    if (query) return []
    return loadRecentIds()
      .map((rid) => items.find((it) => it.id === rid))
      .filter((it): it is QuickOpenItem => it != null)
      .slice(0, MAX_RECENT)
  }, [query, items])

  const flatRows = query ? flattenRows(groups) : recentItems
  const hasAny = flatRows.length > 0

  const handlePick = useCallback(
    (item: QuickOpenItem) => {
      saveRecentId(item.id)
      onPick(item)
    },
    [onPick],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i + 1) % flatRows.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i - 1 + flatRows.length) % flatRows.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatRows[activeIdx]
        if (item) handlePick(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [flatRows, activeIdx, handlePick, onClose],
  )

  // Overlay click → close; dialog internal click → keep open.
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  // Build offset map for section rendering
  const sectionOffsets: Partial<Record<QuickOpenCategory, number>> = {}
  let offset = 0
  for (const cat of SECTION_ORDER) {
    sectionOffsets[cat] = offset
    offset += groups[cat]?.length ?? 0
  }

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
          {query && (
            <button
              style={clearBtnStyle}
              onClick={() => setQuery('')}
              aria-label={t('workspace.quickOpen.clearAria')}
            >
              ✕
            </button>
          )}
        </div>

        <div style={dividerStyle} />

        {/* Results list */}
        <div ref={listRef} style={listStyle} role="listbox">
          {!query ? (
            <RestingState
              recentItems={recentItems}
              activeIdx={activeIdx}
              onMouseEnterRow={(idx) => setActiveIdx(idx)}
              onClickRow={handlePick}
            />
          ) : !hasAny ? (
            <NoMatchState />
          ) : (
            SECTION_ORDER.map((cat) => {
              const rows = groups[cat]
              if (!rows || rows.length === 0) return null
              return (
                <SectionGroup
                  key={cat}
                  category={cat}
                  rows={rows}
                  flatOffset={sectionOffsets[cat] ?? 0}
                  activeIdx={activeIdx}
                  onMouseEnterRow={(idx) => setActiveIdx(idx)}
                  onClickRow={handlePick}
                />
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={footLegStyle}>
            <kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd>
            <span style={{ marginLeft: 4 }}>{t('workspace.quickOpen.hint.nav')}</span>
          </span>
          <span style={footLegStyle}>
            <kbd style={kbdStyle}>↵</kbd>
            <span style={{ marginLeft: 4 }}>{t('workspace.quickOpen.hint.open')}</span>
          </span>
          <span style={footLegStyle}>
            <kbd style={{ ...kbdStyle, fontSize: 9 }}>t: tab: s: mcp: a: p:</kbd>
            <span style={{ marginLeft: 4 }}>{t('workspace.quickOpen.hint.scope')}</span>
          </span>
          <span style={{ flex: 1 }} />
          <span style={footLegStyle}>
            <kbd style={kbdStyle}>Esc</kbd>
            <span style={{ marginLeft: 4 }}>{t('workspace.quickOpen.hint.close')}</span>
          </span>
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
  borderRadius: 8,           // --radius-xl
  background: '#1C1C20',    // --surface-modal
  border: '1px solid #2A2A2A',
  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'quickOpenIn 80ms ease-out',
}

const inputRowStyle: React.CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 16px',
  flexShrink: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 15,
  color: '#E8E8EA',
  fontFamily: 'inherit',
}

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#A0A0A0',
  fontSize: 12,
  padding: '2px 4px',
  lineHeight: 1,
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#1F1F1F',
  flexShrink: 0,
}

const listStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

// Section header
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px 4px',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#A0A0A0',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontWeight: 600,
}

const sectionCountStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, monospace',
}

const sectionPrefixStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  color: '#707070',
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    background: active ? '#1A1A1A' : 'transparent',
    borderLeft: active ? '2px solid #8B5CF6' : '2px solid transparent',
    outline: active ? '2px solid rgba(139,92,246,0.25)' : 'none',
    outlineOffset: -2,
    borderRadius: active ? 2 : 0,
    boxSizing: 'border-box',
  }
}

const rowMainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

function labelStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    color: active ? '#F0F0F0' : '#E8E8EA',
    fontWeight: active ? 500 : 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

const sublabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#707070',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 160,
}

const rowRightStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 20,
  padding: '1px 8px',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontFamily: 'ui-monospace, monospace',
}

const typeBadgeStyle: React.CSSProperties = {
  ...pillBase,
  background: '#1A1A1A',
  color: '#C8C8CC',
  border: '1px solid #1F1F1F',
}

const enterHintStyle: React.CSSProperties = {
  color: '#8B5CF6',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
}

// Resting state
const restingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 16px',
  color: '#C8C8CC',
  fontSize: 12,
  cursor: 'pointer',
  boxSizing: 'border-box',
}

function restingRowActiveStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? '#1A1A1A' : 'transparent',
    borderLeft: active ? '2px solid #8B5CF6' : '2px solid transparent',
    outline: active ? '2px solid rgba(139,92,246,0.25)' : 'none',
    outlineOffset: -2,
    borderRadius: active ? 2 : 0,
  }
}

const legendStyle: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid #1A1A1A',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '8px 16px 4px',
}

const legendChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: '#A0A0A0',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  padding: '1px 8px',
}

// No-match state
const noMatchContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 6,
  padding: '24px 16px',
}

// Footer
const footerStyle: React.CSSProperties = {
  height: 36,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px',
  flexShrink: 0,
  borderTop: '1px solid #1F1F1F',
  background: '#1C1C20',
  fontSize: 11,
  color: '#A0A0A0',
}

const footLegStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  color: '#A0A0A0',
  border: '1px solid #2A2A2A',
  borderRadius: 2,
  padding: '1px 4px',
  lineHeight: 1.5,
  background: '#141414',
}
