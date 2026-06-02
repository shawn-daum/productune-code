/**
 * McpServersTab — MCP Servers settings pane (T-P4-048-mh).
 *
 * Loads servers from ~/.claude/settings.json mcpServers + project .mcp.json (merge).
 * Row click → McpServerModal (auth + endpoint edit + save).
 * Empty state shown when no servers configured.
 * [+ 서버 추가] opens McpServerModal in create mode (v0.5 B1 / T-017).
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'
import McpServerModal from '../../McpServerModal'

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
  // status 필드 제거 — Phase 5 에서 testConnection 구현 시 재추가
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
  const [creating, setCreating] = useState(false)

  // Blank entry seed for the create flow. New servers land in the local tier
  // (~/.claude.json) when a project is open, else the productune tier — matching
  // the mcp:save write path.
  const newServerSeed: McpServerEntry = {
    name: '',
    config: { type: 'stdio' },
    source: project?.projectDir ? 'local' : 'productune',
  }

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const api = (window as any).api
      const raw: Array<McpServerEntry> =
        (await api.mcpGetServers?.(project?.projectDir)) ?? []
      setServers(raw)
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
    setCreating(false)
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
            </button>
          ))}
        </div>
      )}

      <div style={divider} />

      <div style={footerHint}>ⓘ {t('settings.mcp.footerHint')}</div>

      {/* [+ 서버 추가] — opens the modal in create mode (v0.5 B1) */}
      <div style={addBtnWrap}>
        <button
          style={addBtn}
          onClick={() => setCreating(true)}
        >
          + {t('settings.mcp.addBtn')}
        </button>
      </div>

      {selectedServer && (
        <McpServerModal
          server={selectedServer}
          projectDir={project?.projectDir}
          onClose={() => setSelectedServer(null)}
          onSaved={handleSaved}
        />
      )}

      {creating && (
        <McpServerModal
          server={newServerSeed}
          projectDir={project?.projectDir}
          isNew
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
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

const addBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  color: '#C0C0C0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '4px 12px',
}
