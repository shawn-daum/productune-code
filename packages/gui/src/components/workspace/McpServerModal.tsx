/**
 * McpServerModal — MCP server settings modal (T-P4-048-mh).
 *
 * Auth + endpoint edit. Saves to ~/.claude/settings.json via Electron main
 * using atomic rename-swap write (OQ-1 (a) decision).
 *
 * T-P4-067 modal pattern:
 *   - Esc key = cancel (dirty guard: confirm before close).
 *   - Backdrop click = cancel.
 *   - [취소] left (ghost) / [저장 (primary)] right — §1.5.3 fix T-P4-069.
 *   - Restart notice always visible.
 *
 * v0.5 B1 (T-017): server add + rename unlocked.
 *   - `isNew` → name field is a required, editable text input (create flow).
 *   - existing server → name field is editable; on save, a changed name is
 *     applied via `mcpRename` before the config write.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { McpServerEntry } from './main/panes/McpServersTab'

interface EnvRow {
  key: string
  value: string
  masked: boolean
}

interface Props {
  server: McpServerEntry
  projectDir?: string
  /** Create flow — name is required and the entry does not yet exist. */
  isNew?: boolean
  onClose: () => void
  onSaved: () => void
}

export default function McpServerModal({ server, projectDir, isNew = false, onClose, onSaved }: Props) {
  const { t } = useTranslation()

  const [name, setName] = useState(server.name)
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'http'>(
    server.config.type ?? 'stdio',
  )
  const [command, setCommand] = useState(server.config.command ?? '')
  const [url, setUrl] = useState(server.config.url ?? '')
  const [envRows, setEnvRows] = useState<EnvRow[]>(() =>
    Object.entries(server.config.env ?? {}).map(([key, value]) => ({
      key,
      value,
      masked: true,
    })),
  )
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'err'>('idle')
  const [testMs, setTestMs] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Use a ref so the keydown handler always sees the latest dirty value
  // without needing to re-register on every dirty change.
  const dirtyRef = useRef(false)
  const markDirty = () => {
    dirtyRef.current = true
  }

  // Esc → close (with dirty guard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dirtyRef.current && !window.confirm(t('settings.mcp.modal.confirmClose'))) return
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (dirtyRef.current && !window.confirm(t('settings.mcp.modal.confirmClose'))) return
    onClose()
  }

  const buildConfig = () => {
    const env: Record<string, string> = {}
    for (const row of envRows) {
      const k = row.key.trim()
      if (k) env[k] = row.value
    }
    const cfg: McpServerEntry['config'] = { type: transport }
    if (transport === 'stdio') {
      if (command.trim()) cfg.command = command.trim()
    } else {
      if (url.trim()) cfg.url = url.trim()
    }
    if (Object.keys(env).length > 0) cfg.env = env
    return cfg
  }

  const handleTest = async () => {
    if (testState === 'testing') return
    setTestState('testing')
    setTestMs(null)
    try {
      const api = (window as any).api
      const result = await api.mcpTestConnection?.(server.name, buildConfig())
      if (result?.ok) {
        setTestState('ok')
        setTestMs(typeof result.ms === 'number' ? result.ms : null)
      } else {
        setTestState('err')
      }
    } catch {
      setTestState('err')
    }
  }

  const handleSave = async () => {
    if (saving) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      showToast(t('settings.mcp.modal.nameRequired'), 'error')
      return
    }
    setSaving(true)
    try {
      const api = (window as any).api
      // Rename first for an existing server whose name changed, so the
      // config write below targets the new key (and we don't orphan the old).
      if (!isNew && trimmedName !== server.name) {
        const renamed = await api.mcpRename?.(server.name, trimmedName, projectDir)
        if (!renamed?.ok) {
          showToast(renamed?.error ?? t('settings.mcp.renameFailed'), 'error')
          setSaving(false)
          return
        }
      }
      const result = await api.mcpSave?.(trimmedName, buildConfig(), projectDir)
      if (result?.ok) {
        showToast(t('settings.mcp.toastSaved'), 'success')
        setTimeout(() => showToast(t('settings.mcp.toastRestartNeeded'), 'info'), 600)
        dirtyRef.current = false
        onSaved()
      } else {
        showToast(result?.error ?? t('settings.mcp.saveFailed'), 'error')
      }
    } catch (e: any) {
      showToast(e?.message ?? t('settings.mcp.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const addEnvRow = () => {
    setEnvRows((prev) => [...prev, { key: '', value: '', masked: false }])
    markDirty()
  }

  const removeEnvRow = (idx: number) => {
    setEnvRows((prev) => prev.filter((_, i) => i !== idx))
    markDirty()
  }

  const updateEnvKey = (idx: number, key: string) => {
    setEnvRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key } : r)))
    markDirty()
  }

  const updateEnvValue = (idx: number, value: string) => {
    // Once user edits, unmask
    setEnvRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, value, masked: false } : r)),
    )
    markDirty()
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <div style={modal}>
        <h2 style={titleStyle}>
          {isNew
            ? t('settings.mcp.modal.titleNew')
            : `${server.name} ${t('settings.mcp.modal.titleSuffix')}`}
        </h2>

        {/* Name — editable (create + rename, v0.5 B1) */}
        <div style={fieldGroup}>
          <label style={labelStyle}>{t('settings.mcp.modal.nameLabel')}</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              markDirty()
            }}
            placeholder={t('settings.mcp.modal.namePlaceholder')}
            autoFocus={isNew}
            spellCheck={false}
          />
        </div>

        {/* Transport */}
        <div style={fieldGroup}>
          <label style={labelStyle}>{t('settings.mcp.modal.transportLabel')}</label>
          <select
            style={selectStyle}
            value={transport}
            onChange={(e) => {
              setTransport(e.target.value as 'stdio' | 'sse' | 'http')
              markDirty()
            }}
          >
            <option value="stdio">stdio</option>
            <option value="sse">SSE</option>
            <option value="http">HTTP</option>
          </select>
        </div>

        {/* Command / URL */}
        {transport === 'stdio' ? (
          <div style={fieldGroup}>
            <label style={labelStyle}>{t('settings.mcp.modal.commandLabel')}</label>
            <input
              style={inputStyle}
              value={command}
              onChange={(e) => {
                setCommand(e.target.value)
                markDirty()
              }}
              placeholder="npx @example/mcp-server"
            />
          </div>
        ) : (
          <div style={fieldGroup}>
            <label style={labelStyle}>{t('settings.mcp.modal.urlLabel')}</label>
            <input
              style={inputStyle}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                markDirty()
              }}
              placeholder="https://..."
            />
          </div>
        )}

        {/* Credentials (env key-value) */}
        <div style={fieldGroup}>
          <label style={labelStyle}>{t('settings.mcp.modal.envLabel')}</label>
          <div style={envBox}>
            {envRows.map((row, idx) => (
              <div key={idx} style={envRowWrap}>
                <input
                  style={{ ...inputStyle, flex: '0 0 130px', fontFamily: 'monospace' }}
                  value={row.key}
                  onChange={(e) => updateEnvKey(idx, e.target.value)}
                  placeholder="KEY"
                />
                <input
                  style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  type={row.masked ? 'password' : 'text'}
                  value={row.value}
                  onChange={(e) => updateEnvValue(idx, e.target.value)}
                  placeholder="value"
                />
                <button
                  style={envRemoveBtn}
                  onClick={() => removeEnvRow(idx)}
                  title={t('settings.mcp.modal.removeEnv')}
                >
                  ✕
                </button>
              </div>
            ))}
            <button style={addEnvRowBtn} onClick={addEnvRow}>
              + {t('settings.mcp.modal.addEnvRow')}
            </button>
          </div>
        </div>

        {/* Connection test */}
        <div style={testRow}>
          <button
            style={testBtn}
            onClick={handleTest}
            disabled={testState === 'testing'}
          >
            {testState === 'testing' ? '⟳ ' : ''}
            {t('settings.mcp.modal.testBtn')}
          </button>
          {testState === 'ok' && (
            <span style={testOkText}>
              ✓ {t('settings.mcp.statusConnected')}
              {testMs !== null && testMs > 0 ? ` (${testMs}ms)` : ''}
            </span>
          )}
          {testState === 'err' && (
            <span style={testErrText}>✗ {t('settings.mcp.testFailed')}</span>
          )}
        </div>

        {/* Restart notice — always visible */}
        <div style={restartNotice}>ⓘ {t('settings.mcp.modal.restartNotice')}</div>

        {/* Footer: [취소] [저장] — §1.5.3: cancel left, primary right */}
        <div style={footerActions}>
          <button style={btnSecondary} onClick={onClose}>
            {t('settings.mcp.modal.cancelBtn')}
          </button>
          <button
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('common.loading') : t('settings.mcp.modal.saveBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Toast helper (fire-and-forget DOM injection) ──────────────────────────────

function showToast(message: string, type: 'success' | 'error' | 'info') {
  const bg =
    type === 'success' ? '#166534' : type === 'error' ? '#7F1D1D' : '#1A2A3A'
  const fg =
    type === 'success' ? '#BBF7D0' : type === 'error' ? '#FECACA' : '#BAE6FD'
  const border =
    type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#0ea5e9'

  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:20000',
    `background:${bg}`,
    `color:${fg}`,
    `border:1px solid ${border}`,
    'border-radius:6px',
    'padding:8px 14px',
    'font-size:12px',
    'font-family:inherit',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(el)
  setTimeout(() => {
    if (document.body.contains(el)) document.body.removeChild(el)
  }, 3000)
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  alignItems: 'center',
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  inset: 0,
  justifyContent: 'center',
  position: 'fixed',
  zIndex: 10000,
}

const modal: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '90vh',
  maxWidth: '92vw',
  overflowY: 'auto',
  padding: '24px 28px',
  width: 480,
}

const titleStyle: React.CSSProperties = {
  color: '#F0F0F0',
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
}

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  color: '#909090',
  fontSize: 11,
  fontWeight: 500,
}

const baseInput: React.CSSProperties = {
  background: '#0F0F0F',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
  padding: '5px 8px',
}

const inputStyle: React.CSSProperties = { ...baseInput }

const inputReadOnly: React.CSSProperties = {
  ...baseInput,
  color: '#707070',
  cursor: 'default',
}

const selectStyle: React.CSSProperties = {
  ...baseInput,
  cursor: 'pointer',
}

const envBox: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 8,
}

const envRowWrap: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 6,
}

const envRemoveBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#505050',
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '0 4px',
}

const addEnvRowBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#606060',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '2px 0',
  textAlign: 'left',
}

const testRow: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 10,
}

const testBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  color: '#C0C0C0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '4px 12px',
}

const testOkText: React.CSSProperties = {
  color: '#4ADE80',
  fontSize: 12,
}

const testErrText: React.CSSProperties = {
  color: '#EF4444',
  fontSize: 12,
}

const restartNotice: React.CSSProperties = {
  color: '#606060',
  fontSize: 11,
  lineHeight: 1.4,
}

const footerActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 4,
}

const btnPrimary: React.CSSProperties = {
  background: '#1D4ED8',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  height: 30,
  padding: '0 16px',
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  color: '#C0C0C0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  height: 30,
  padding: '0 14px',
}
