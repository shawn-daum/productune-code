/**
 * McpServersTab — MCP Servers settings pane (T-P4-048-mh).
 *
 * Loads servers from ~/.claude/settings.json mcpServers + project .mcp.json (merge).
 * Row click → McpServerModal (auth + endpoint edit + save).
 * Empty state shown when no servers configured.
 * [+ 서버 추가] = Phase 5 disabled placeholder (OQ-2 decision).
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'
import McpServerModal from '../../McpServerModal'

type McpStatus = 'ok' | 'err' | 'checking'

export interface McpServerEntry {
  name: string
  config: {
    type?: 'stdio' | 'sse' | 'http'
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
  }
  source: 'productune' | 'local' | 'project'
  status: McpStatus
}

interface Props {
  props?: Record<string, unknown>
}

export default function McpServersTab(_: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedServer, setSelectedServer] = useState<McpServerEntry | null>(null)

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const api = (window as any).api
      const raw: Array<Omit<McpServerEntry, 'status'>> =
        (await api.mcpGetServers?.(project?.projectDir)) ?? []
      setServers(raw.map((s) => ({ ...s, status: 'checking' as McpStatus })))
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }, [project?.projectDir])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleSaved = () => {
    setSelectedServer(null)
    // Re-poll status after save (500ms — main process writes, then re-reads)
    setTimeout(() => loadServers(), 500)
  }

  return (
    <div style={wrap}>
      <h2 style={headingStyle}>{t('settings.mcp.title')}</h2>

      {loading ? (
        <div style={centeredHint}>
          <span style={mutedText}>◌ {t('settings.mcp.statusChecking')}…</span>
        </div>
      ) : servers.length === 0 ? (
        <div style={emptyWrap}>
          <div style={emptyIcon}>⬡</div>
          <div style={emptyTitle}>{t('settings.mcp.emptyTitle')}</div>
          <div style={emptyDesc}>{t('settings.mcp.emptyDesc')}</div>
        </div>
      ) : (
        <div style={listWrap}>
          {servers.map((server) => (
            <button
              key={server.name}
              style={rowBtn}
              onClick={() => setSelectedServer(server)}
            >
              <span style={serverNameStyle}>{server.name}</span>
              <span style={tierPill}>[{server.source}]</span>
              <StatusBadge status={server.status} t={t} />
            </button>
          ))}
        </div>
      )}

      <div style={divider} />

      <div style={footerHint}>ⓘ {t('settings.mcp.footerHint')}</div>

      {/* [+ 서버 추가] — Phase 5 lock (OQ-2) */}
      <div style={addBtnWrap}>
        <button
          style={addBtnDisabled}
          disabled
          title={t('settings.mcp.addBtnTooltip')}
        >
          + {t('settings.mcp.addBtn')}
        </button>
        <span style={phaseLockLabel}>{t('settings.workflowRules.phase5Lock')}</span>
      </div>

      {selectedServer && (
        <McpServerModal
          server={selectedServer}
          projectDir={project?.projectDir}
          onClose={() => setSelectedServer(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  t,
}: {
  status: McpStatus
  t: (k: string) => string
}) {
  if (status === 'ok')
    return (
      <span style={{ ...badgeBase, color: '#4ADE80' }}>
        ● {t('settings.mcp.statusConnected')}
      </span>
    )
  if (status === 'err')
    return (
      <span style={{ ...badgeBase, color: '#EF4444' }}>
        ✗ {t('settings.mcp.statusUnauth')}
      </span>
    )
  return (
    <span style={{ ...badgeBase, color: '#707070' }}>
      ◌ {t('settings.mcp.statusChecking')}
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-base, #0F0F0F)',
  overflowY: 'auto',
  padding: '20px 24px',
  gap: 8,
}

const headingStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: '#E0E0E0',
}

const listWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
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
  fontSize: 13,
  justifyContent: 'space-between',
  padding: '6px 8px',
  textAlign: 'left',
  transition: 'background 0.1s',
  width: '100%',
}

const serverNameStyle: React.CSSProperties = {
  fontWeight: 500,
}

const tierPill: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#404040',
  border: '1px solid #2A2A2A',
  borderRadius: 2,
  padding: '0 3px',
  flexShrink: 0,
  userSelect: 'none',
}

const badgeBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
}

const centeredHint: React.CSSProperties = {
  padding: '24px 0',
}

const mutedText: React.CSSProperties = {
  fontSize: 12,
  color: '#707070',
}

const emptyWrap: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '32px 0',
}

const emptyIcon: React.CSSProperties = {
  color: '#404040',
  fontSize: 24,
}

const emptyTitle: React.CSSProperties = {
  color: '#C0C0C0',
  fontSize: 13,
  fontWeight: 500,
}

const emptyDesc: React.CSSProperties = {
  color: '#707070',
  fontSize: 12,
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

const addBtnWrap: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 8,
  marginTop: 8,
}

const addBtnDisabled: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#404040',
  cursor: 'not-allowed',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '4px 12px',
}

const phaseLockLabel: React.CSSProperties = {
  color: '#505050',
  fontSize: 11,
  fontStyle: 'italic',
}
