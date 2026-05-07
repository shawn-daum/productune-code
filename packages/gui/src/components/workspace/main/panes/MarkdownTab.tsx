import { useTranslation } from 'react-i18next'

/**
 * Generic markdown tab — toolbar (crumb + edit/preview toggle stub) + viewer
 * stub. T-P4-046 lands the shell; PRD/notes/etc. content wires in via props
 * in later tickets (T-P4-047/048/050+) by passing { path, body } props.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function MarkdownTab({ props }: Props) {
  const { t } = useTranslation()
  const path = (props?.path as string) ?? null
  const body = (props?.body as string) ?? null

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
        {body ? (
          <pre style={pre}>{body}</pre>
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
