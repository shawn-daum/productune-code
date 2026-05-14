import { useState } from 'react'

interface Props {
  active?: boolean
  ariaLabel: string
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
}

export default function ColumnResizeHandle({ active = false, ariaLabel, onMouseDown }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={(event) => event.preventDefault()}
      style={{
        ...wrap,
        background: active
          ? 'rgba(255,255,255,0.12)'
          : hovered
            ? 'rgba(255,255,255,0.06)'
            : 'transparent',
      }}
    />
  )
}

const wrap: React.CSSProperties = {
  width: 4,
  height: '100%',
  cursor: 'col-resize',
  transition: 'background 0.08s ease',
  zIndex: 4,
}
