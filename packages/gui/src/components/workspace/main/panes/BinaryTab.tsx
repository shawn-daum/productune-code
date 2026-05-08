import { useTranslation } from 'react-i18next'

interface Props {
  props?: Record<string, unknown>
}

export default function BinaryTab({ props }: Props) {
  const { t } = useTranslation()
  const absPath = props?.path as string | undefined
  const fileName = absPath?.split('/').pop() ?? absPath ?? ''

  return (
    <div style={wrap}>
      <div style={icon}>&#x1F4C4;</div>
      <div style={name}>{fileName}</div>
      <div style={hint}>{t('workspace.explorer.binaryNoPreview')}</div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 24,
  color: '#505050',
}

const icon: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 8,
}

const name: React.CSSProperties = {
  fontSize: 14,
  color: '#707070',
  fontFamily: 'monospace',
}

const hint: React.CSSProperties = {
  fontSize: 12,
  color: '#404040',
  textAlign: 'center',
  maxWidth: 320,
}
