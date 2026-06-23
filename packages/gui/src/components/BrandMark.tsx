interface Props {
  size?: number
  style?: React.CSSProperties
}

/**
 * Brand glyph `{ }` — brand-purple (--accent #8B5CF6) braces.
 * Matches the brand violet in src/assets/logo.png.
 * Safe for inline flex rows; vertical alignment handled by lineHeight 1.
 */
export default function BrandMark({ size = 16, style: styleProp }: Props) {
  const style: React.CSSProperties = {
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
    fontSize: size,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.05em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.22em',
    userSelect: 'none',
    flexShrink: 0,
  }

  return (
    <span style={{ ...style, ...styleProp }}>
      <span style={{ color: '#8B5CF6' }}>{`{`}</span>
      <span style={{ color: '#8B5CF6' }}>{`}`}</span>
    </span>
  )
}
