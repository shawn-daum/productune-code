import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Generic markdown tab — toolbar (crumb + edit/preview toggle stub) + viewer.
 * T-P4-046 lands the shell; content arrives via props as { path, body }.
 *
 * T-PATCH-009 #11: when given a `~/.productune/...` path (Tier-2 long-term
 * memory, e.g. PersonaDefTab habit.md rows) and no inline `body`, fetch the
 * file via the memory:readFile IPC so the viewer actually shows the file.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function MarkdownTab({ props }: Props) {
  const { t } = useTranslation()
  const path = (props?.path as string) ?? null
  const inlineBody = (props?.body as string) ?? null

  const [fetched, setFetched] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch Tier-2 memory file content when given a ~/.productune path + no body.
  useEffect(() => {
    setFetched(null)
    setError(null)
    if (inlineBody !== null || !path || !path.startsWith('~/.productune/')) return
    const api = (window as any).api
    if (!api?.readMemoryFile) return
    let cancelled = false
    setLoading(true)
    api.readMemoryFile(path)
      .then((res: { ok: boolean; content?: string; exists?: boolean; error?: string }) => {
        if (cancelled) return
        if (res?.ok) setFetched(res.exists === false ? '' : (res.content ?? ''))
        else setError(res?.error ?? 'read failed')
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? 'read failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, inlineBody])

  const body = inlineBody ?? fetched
  const isEmptyMemory = fetched === '' && !error

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={crumb}>{path ?? t('workspace.tab.markdown.crumbUntitled')}</span>
        <div style={toolbarRight}>
          <button style={toggleBtn(true)} type="button">{t('workspace.tab.markdown.preview')}</button>
          <button style={toggleBtn(false)} type="button">{t('workspace.tab.markdown.edit')}</button>
        </div>
      </div>
      <div style={view}>
        {loading ? (
          <p style={hint}>{t('common.loading')}</p>
        ) : error ? (
          <pre style={{ ...pre, color: '#E04040' }}>{error}</pre>
        ) : body ? (
          <pre style={pre}>{body}</pre>
        ) : isEmptyMemory ? (
          <p style={hint}>{t('workspace.tab.markdown.emptyFile')}</p>
        ) : (
          <p style={hint}>{t('workspace.tab.markdown.placeholder')}</p>
        )}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 14px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
}

const crumb: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const toolbarRight: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexShrink: 0,
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? '#1A1A1A' : 'transparent',
    color: active ? '#E0E0E0' : '#707070',
    border: '1px solid #2A2A2A',
    borderRadius: 3,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

const view: React.CSSProperties = {
  flex: 1,
  padding: '16px 20px',
  overflow: 'auto',
  background: '#0F0F0F',
}

const pre: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#E0E0E0',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
}

const hint: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#3A3A3A',
  fontStyle: 'italic',
}
