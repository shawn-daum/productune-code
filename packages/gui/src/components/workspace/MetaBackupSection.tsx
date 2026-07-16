/**
 * MetaBackupSection — opt-in meta (work history) backup remote (T-367).
 *
 * Mounted in GeneralSettings (the REACHABLE settings surface — the former
 * WorkflowRulesPanel mount is dead UI since T-PATCH-200; QA FAIL 2). Registers
 * a remote on the meta repo via core addMetaRemote through meta:addRemote —
 * registration only, NEVER pushes (PRD §v1.2 Non-goals: no auto-push/sync).
 *
 * Self-hides for projects without the meta split (same pattern as
 * PoSessionSection): meta:listRemotes → exists=false → render nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface MetaRemoteRow {
  name: string
  url: string
}

export default function MetaBackupSection({ projectDir }: { projectDir: string }) {
  const { t } = useTranslation()

  const [exists, setExists] = useState(false)
  const [remotes, setRemotes] = useState<MetaRemoteRow[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    const api = (window as any).api
    if (!api?.metaListRemotes) return
    api.metaListRemotes(projectDir)
      .then((res: { exists: boolean; remotes: MetaRemoteRow[] }) => {
        setExists(res.exists)
        setRemotes(res.remotes ?? [])
      })
      .catch(() => { /* keep hidden */ })
  }, [projectDir])

  useEffect(() => { refresh() }, [refresh])

  const handleAdd = useCallback(async () => {
    const nm = name.trim()
    const u = url.trim()
    if (!nm || !u) return
    setStatus('idle')
    setError('')
    try {
      const res: { ok: boolean; error?: string } = await (window as any).api.metaAddRemote(projectDir, nm, u)
      if (!res.ok) throw new Error(res.error ?? 'unknown error')
      setStatus('success')
      setName('')
      setUrl('')
      refresh()
    } catch (e: any) {
      setError(e?.message ?? '')
      setStatus('error')
    }
  }, [projectDir, name, url, refresh])

  // No meta split → whole section absent (nothing to configure).
  if (!exists) return null

  return (
    <div style={sectionWrap}>
      <div style={sectionTitle}>{t('settings.metaBackup.label')}</div>
      <div style={description}>{t('settings.metaBackup.description')}</div>

      {remotes.length > 0 && (
        <div style={remoteList}>
          <div style={listLabel}>{t('settings.metaBackup.currentLabel')}</div>
          {remotes.map((r) => (
            <div key={r.name} style={remoteRow}>
              <span style={nameChip}>{r.name}</span>
              <span style={urlText} title={r.url}>{r.url}</span>
            </div>
          ))}
        </div>
      )}

      <div style={inputRow}>
        <input
          style={{ ...textInput, width: 120, flexShrink: 0 }}
          value={name}
          placeholder={t('settings.metaBackup.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
        <input
          style={{ ...textInput, flex: 1 }}
          value={url}
          placeholder={t('settings.metaBackup.urlPlaceholder')}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
        />
        <button
          style={{ ...addBtn, opacity: !name.trim() || !url.trim() ? 0.4 : 1 }}
          onClick={handleAdd}
          disabled={!name.trim() || !url.trim()}
          type="button"
        >
          {t('settings.metaBackup.addButton')}
        </button>
      </div>

      {status === 'success' && (
        <div style={successBanner}>{t('settings.metaBackup.addSuccess')}</div>
      )}
      {status === 'error' && (
        <div style={errorBanner}>{error || t('settings.metaBackup.addError')}</div>
      )}
    </div>
  )
}

// ── Styles — mirrors GeneralSettings section look ─────────────────────────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.6,
}

const remoteList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const listLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  lineHeight: 1.4,
}

const remoteRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

const nameChip: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  background: '#1F3A5F',
  color: '#7BB3E0',
  borderRadius: 4,
  padding: '2px 6px',
  flexShrink: 0,
}

const urlText: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#A0A0A0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const inputRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const textInput: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '4px 8px',
  outline: 'none',
}

const addBtn: React.CSSProperties = {
  fontSize: 11,
  color: '#8B5CF6',
  background: 'transparent',
  border: '1px solid #8B5CF6',
  borderRadius: 4,
  padding: '3px 10px',
  cursor: 'pointer',
  flexShrink: 0,
}

const successBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#34D399',
  background: '#0D2A1E',
  border: '1px solid #164F35',
  borderRadius: 4,
  padding: '6px 10px',
}

const errorBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#F87171',
  background: '#2A1010',
  border: '1px solid #4A1A1A',
  borderRadius: 4,
  padding: '6px 10px',
}
