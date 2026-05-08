interface Props {
  props?: Record<string, unknown>
}

export default function ImageTab({ props }: Props) {
  const absPath = props?.path as string | undefined

  if (!absPath) {
    return <div style={wrap}><span style={muted}>No path provided.</span></div>
  }

  // Use file:// protocol to load local images.
  const src = `file://${absPath}`

  return (
    <div style={wrap}>
      <img
        src={src}
        alt={absPath.split('/').pop() ?? absPath}
        style={imgStyle}
      />
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  overflow: 'auto',
  background: '#0e0e0e',
}

const imgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: 4,
}

const muted: React.CSSProperties = {
  fontSize: 13,
  color: '#505050',
}
