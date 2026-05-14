/**
 * HooksTab — Hooks settings pane (T-P4-048-mh).
 *
 * Read-only display of ~/.claude/settings.json hooks block (OQ-3 decision).
 * Renders flattened hook rows: eventType chip + matcher + commandBasename.
 * Row click → accordion detail: full command path (copyable) + guidance text.
 * Toggle = Phase 5 lock (OQ-3 — Claude Code disabled-field support unverified).
 *
 * Data: Electron main `hooks:list` IPC reads + flattens settings.json hooks block.
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface HookRow {
  eventType: string
  matcher: string | null
  commandBasename: string
  commandFull: string
}

interface Props {
  props?: Record<string, unknown>
}

export default function HooksTab(_: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<HookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const api = (window as any).api
        const result: HookRow[] = (await api.hooksList?.()) ?? []
        setRows(result)
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleRow = (idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx))
    setCopiedIdx(null)
  }

  const handleCopy = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((prev) => (prev === idx ? null : prev)), 1200)
    } catch {
      /* ignore — clipboard may be unavailable in some contexts */
    }
  }

  return (
    <div style={wrap}>
      <h2 style={headingStyle}>{t('settings.hooks.title')}</h2>

      {loading ? (
        <div style={mutedHint}>…</div>
      ) : rows.length === 0 ? (
        <div style={mutedHint}>{t('settings.hooks.emptyHint')}</div>
      ) : (
        <div style={listWrap}>
          {rows.map((row, idx) => (
            <div key={idx}>
              {/* Row header — click to expand/collapse */}
              <button
                style={{
                  ...rowBtn,
                  background: expandedIdx === idx ? '#1A1A1A' : 'transparent',
                }}
                onClick={() => toggleRow(idx)}
              >
                <span style={chipStyle}>{row.eventType}</span>
                <span style={matcherStyle}>
                  {row.matcher ?? t('settings.hooks.noMatcher')}
                </span>
                <span style={cmdBaenameStyle}>
                  {row.commandBasename.length > 32
                    ? row.commandBasename.slice(0, 29) + '…'
                    : row.commandBasename}
                </span>
                <span style={chevronStyle}>
                  {expandedIdx === idx ? '▾' : '▸'}
                </span>
              </button>

              {/* Accordion detail — read-only (OQ-3) */}
              {expandedIdx === idx && (
                <div style={accordionDetail}>
                  <div style={cmdFullRow}>
                    <code style={cmdFullText}>{row.commandFull || '—'}</code>
                    <button
                      style={copyBtn}
                      onClick={() => handleCopy(idx, row.commandFull)}
                    >
                      {copiedIdx === idx ? '✓' : t('settings.hooks.copyBtn')}
                    </button>
                  </div>
                  <p style={guideText}>{t('settings.hooks.editHint')}</p>
                  <p style={guideText}>{t('settings.hooks.addHint')}</p>
                  <button
                    style={docsLinkBtn}
                    onClick={() =>
                      (window as any).api?.openExternal?.(
                        'https://docs.anthropic.com/claude/docs/claude-code-hooks',
                      )
                    }
                  >
                    {t('settings.hooks.docsLink')} ↗
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={divider} />
      <div style={footerHint}>ⓘ {t('settings.hooks.footerHint')}</div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  background: 'var(--bg-base, #0F0F0F)',
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  gap: 8,
  overflowY: 'auto',
  padding: '20px 24px',
}

const headingStyle: React.CSSProperties = {
  color: '#E0E0E0',
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 12px',
}

const listWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
}

const rowBtn: React.CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: '#C0C0C0',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'inherit',
  fontSize: 12,
  gap: 12,
  padding: '6px 8px',
  textAlign: 'left',
  transition: 'background 0.1s',
  width: '100%',
}

const chipStyle: React.CSSProperties = {
  background: '#1F2937',
  border: '1px solid #374151',
  borderRadius: 3,
  color: '#9CA3AF',
  fontSize: 11,
  fontWeight: 500,
  minWidth: 100,
  padding: '1px 6px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const matcherStyle: React.CSSProperties = {
  color: '#C0C0C0',
  fontFamily: 'monospace',
  fontSize: 12,
  minWidth: 100,
}

const cmdBaenameStyle: React.CSSProperties = {
  color: '#707070',
  flex: 1,
  fontSize: 11,
}

const chevronStyle: React.CSSProperties = {
  color: '#505050',
  fontSize: 10,
}

const accordionDetail: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  margin: '2px 0 4px 8px',
  padding: 12,
}

const cmdFullRow: React.CSSProperties = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: 8,
  justifyContent: 'space-between',
}

const cmdFullText: React.CSSProperties = {
  color: '#A0A0A0',
  flex: 1,
  fontFamily: 'monospace',
  fontSize: 11,
  wordBreak: 'break-all',
}

const copyBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  borderRadius: 3,
  color: '#707070',
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
  fontSize: 10,
  padding: '1px 6px',
}

const guideText: React.CSSProperties = {
  color: '#606060',
  fontSize: 11,
  lineHeight: 1.5,
  margin: 0,
}

const docsLinkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#4A90E2',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: 0,
  textAlign: 'left',
}

const mutedHint: React.CSSProperties = {
  color: '#707070',
  fontSize: 12,
  padding: '12px 0',
}

const divider: React.CSSProperties = {
  background: '#2A2A2A',
  height: 1,
  margin: '8px 0',
}

const footerHint: React.CSSProperties = {
  color: '#707070',
  fontSize: 11,
  lineHeight: 1.5,
}
