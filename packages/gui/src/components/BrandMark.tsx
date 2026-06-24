interface Props {
  size?: number
  style?: React.CSSProperties
}

/**
 * Brand glyph `{ }` — violet open-brace (--brand-purple #8B5CF6) + mint
 * close-brace (--brand-mint #2DD4BF). The two-tone IS the brand identity
 * (matches logo.png). T-PATCH-243: restored after T-PATCH-241 erroneously
 * flattened the close-brace to violet as "off-palette" — mint is now a
 * registered DS token (design-system.md §2.4), on-palette by definition.
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
      <span style={{ color: '#2DD4BF' }}>{`}`}</span>
    </span>
  )
}
