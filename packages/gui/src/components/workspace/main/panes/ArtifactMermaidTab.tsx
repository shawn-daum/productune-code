/**
 * ArtifactMermaidTab — T-014
 *
 * Read-only mermaid diagram viewer for .mmd / .mermaid artifact files.
 * Reuses MermaidBlock (zoom/pan/source-toggle/copy).
 * No edit affordance — read-only invariant.
 */

import { useEffect, useState, useCallback } from 'react'
import { AlertOctagon, Loader2, Lock, ChevronRight } from 'lucide-react'
import MermaidBlock from '../../../MermaidBlock'

interface Props {
  props?: Record<string, unknown>
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

export default function ArtifactMermaidTab({ props: tabProps }: Props) {
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relPath = typeof tabProps?.relPath === 'string' ? tabProps.relPath : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const [content, setContent] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')

  const load = useCallback(() => {
    if (!absPath || !projectDir) {
      setLoadState('error')
      return
    }
    setLoadState('loading')
    const api = (window as any).api
    api
      .artifactsReadFile(projectDir, absPath)
      .then((text: string) => {
        setContent(text)
        setLoadState('done')
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [absPath, projectDir])

  useEffect(() => {
    load()
  }, [load])

  const crumbParts = relPath ? relPath.split('/') : []

  return (
    <div style={wrap}>
      {/* Header bar: breadcrumb + read-only badge */}
      <div style={headerBar}>
        <div style={breadcrumbRow}>
          {crumbParts.map((part, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {idx > 0 && <ChevronRight size={10} style={{ color: '#3A3A3A', flexShrink: 0 }} />}
              <span style={idx === crumbParts.length - 1 ? crumbLast : crumbSeg}>
                {part}
              </span>
            </span>
          ))}
          {crumbParts.length === 0 && (
            <span style={crumbSeg}>{absPath || 'diagram'}</span>
          )}
        </div>
        <div style={roBadge}>
          <Lock size={11} style={{ flexShrink: 0 }} />
          <span>읽기 전용</span>
        </div>
      </div>

      {/* Body */}
      <div style={body}>
        {loadState === 'loading' && (
          <div style={centerState}>
            <Loader2 size={20} style={{ color: '#505050' }} className="pdt-spin" />
          </div>
        )}

        {loadState === 'error' && (
          <div style={errorBanner}>
            <AlertOctagon size={14} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={errorText}>
                파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
              </div>
              <button style={retryBtn} onClick={load}>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {loadState === 'done' && content !== null && (
          <div style={viewerWrap}>
            <MermaidBlock code={content} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
}

const headerBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 16px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
  minHeight: 32,
}

const breadcrumbRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flex: 1,
  overflow: 'hidden',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 11,
  color: '#A0A0A0',
  minWidth: 0,
}

const crumbSeg: React.CSSProperties = {
  color: '#707070',
  whiteSpace: 'nowrap',
}

const crumbLast: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const roBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
}

const centerState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 48,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #EF4444',
  borderRadius: 4,
  padding: '10px 12px',
  margin: 24,
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8CC',
  lineHeight: 1.5,
}

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const viewerWrap: React.CSSProperties = {
  padding: '16px',
}
