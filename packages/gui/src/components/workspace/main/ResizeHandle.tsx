import { useEffect, useRef } from 'react'
import { useWorkspace } from '../../../store/workspace'

interface Props {
  axis: 'h' | 'v'         // h = horizontal split (vertical handle); v = vertical split (horizontal handle)
  path: number[]           // path from root to the box this handle resizes
  startRatio: number
  containerRef: React.RefObject<HTMLDivElement>
}

export default function ResizeHandle({ axis, path, startRatio, containerRef }: Props) {
  const setPaneRatio = useWorkspace((s) => s.setPaneRatio)
  const dragState = useRef<{ start: number; startRatio: number; size: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return
      e.preventDefault()
      const { start, startRatio, size } = dragState.current
      const delta = (axis === 'h' ? e.clientX : e.clientY) - start
      if (size <= 0) return
      const ratio = startRatio + delta / size
      setPaneRatio(path, ratio)
    }
    const onUp = () => {
      dragState.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [axis, path, setPaneRatio])

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = axis === 'h' ? rect.width : rect.height
    dragState.current = {
      start: axis === 'h' ? e.clientX : e.clientY,
      startRatio,
      size,
    }
    document.body.style.cursor = axis === 'h' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  return <div style={style(axis)} onMouseDown={onMouseDown} role="separator" aria-orientation={axis === 'h' ? 'vertical' : 'horizontal'} />
}

function style(axis: 'h' | 'v'): React.CSSProperties {
  if (axis === 'h') {
    return {
      width: 4,
      flexShrink: 0,
      cursor: 'col-resize',
      background: 'transparent',
      transition: 'background 0.08s',
      zIndex: 3,
    }
  }
  return {
    height: 4,
    flexShrink: 0,
    cursor: 'row-resize',
    background: 'transparent',
    transition: 'background 0.08s',
    zIndex: 3,
  }
}
