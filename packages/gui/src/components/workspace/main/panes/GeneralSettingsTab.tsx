import GeneralSettings from '../../GeneralSettings'

interface Props {
  props?: Record<string, unknown>
}

export default function GeneralSettingsTab(_: Props) {
  return (
    <div style={wrap}>
      <GeneralSettings />
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-base, #0F0F0F)',
  overflowY: 'auto',
}
