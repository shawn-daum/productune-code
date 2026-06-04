import { useRef } from 'react'
import type { Pane } from '../../../store/workspace'
import { paneTreeUtil } from '../../../store/workspace'
import LeafPane from './LeafPane'
import ResizeHandle from './ResizeHandle'

interface Props {
  pane: Pane
  path: number[]   // path from root: walk indices 0|1 down children to reach this node
}

/**
 * Recursive pane tree renderer. Leaves render LeafPane; boxes flex 2 children
 * along the axis (`hbox` = row, `vbox` = column) with a 4px ResizeHandle
 * between, sizing children by `ratio` (0..1).
 */
export default function PaneNode({ pane, path }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (pane.type === 'leaf') {
    return <LeafPane leaf={pane} />
  }

  const isHbox = pane.type === 'hbox'
  const ratio = clamp(pane.ratio, 0.05, 0.95)
  const firstFlex = ratio
  const secondFlex = 1 - ratio
  const childStyle = (flex: number): React.CSSProperties => ({
    flex: `${flex} 1 0`,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  })

  // T-023 #4d: key each child slot by the *identity* of its first leaf rather
  // than by positional index. When a leaf is split it becomes the first child
  // of a new box, so its first-leaf id is unchanged — React then reconciles the
  // existing LeafPane subtree (and its <webview>) in place instead of tearing
  // it down and remounting it, which had caused the full HTML/iframe reload lag.
  const key0 = paneTreeUtil.firstLeaf(pane.children[0]).paneId
  const key1 = paneTreeUtil.firstLeaf(pane.children[1]).paneId

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: isHbox ? 'row' : 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div key={key0} style={childStyle(firstFlex)}>
        <PaneNode pane={pane.children[0]} path={[...path, 0]} />
      </div>
      <ResizeHandle
        axis={isHbox ? 'h' : 'v'}
        path={path}
        startRatio={ratio}
        containerRef={containerRef}
      />
      <div key={key1} style={childStyle(secondFlex)}>
        <PaneNode pane={pane.children[1]} path={[...path, 1]} />
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
