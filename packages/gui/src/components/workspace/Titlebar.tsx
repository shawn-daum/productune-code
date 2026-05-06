interface Props {
  title: string
}

export default function Titlebar({ title }: Props) {
  return (
    <div style={bar}>
      <div style={spacer} />
      <div style={titleBox}>
        <span style={accent}>⚡</span>
        <span>{title}</span>
      </div>
      <div style={spacer} />
    </div>
  )
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  height: 38,
  background: '#0A0A0A',
  borderBottom: '1px solid #1F1F1F',
  WebkitAppRegion: 'drag',
  userSelect: 'none',
} as React.CSSProperties

// Reserve macOS traffic light region (~78px) on the left so the centered title
// is not visually offset by the buttons.
const spacer: React.CSSProperties = {
  flex: 1,
  minWidth: 78,
}

const titleBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#A0A0A0',
  fontWeight: 600,
  letterSpacing: '0.02em',
}

const accent: React.CSSProperties = {
  color: '#FF6B2B',
  fontSize: 11,
}
