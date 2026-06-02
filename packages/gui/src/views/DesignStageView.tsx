import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import MermaidBlock from '../components/MermaidBlock'
import ErrorBoundary from '../components/ErrorBoundary'

interface Props {
  projectRoot: string
  onClose?: () => void
}

// Group flat relative paths by top-level directory
function groupByDir(paths: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const p of paths) {
    const parts = p.split('/')
    const dir = parts.length > 1 ? parts[0] : '.'
    const existing = map.get(dir) ?? []
    existing.push(p)
    map.set(dir, existing)
  }
  return map
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

export default function DesignStageView({ projectRoot, onClose }: Props) {
  const [artifacts, setArtifacts] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingFile, setLoadingFile] = useState(false)

  // Load artifact list on mount
  useEffect(() => {
    setLoadingList(true)
    ;(window as any).api.designListArtifacts(projectRoot)
      .then((list: string[]) => {
        setArtifacts(list)
        if (list.length > 0) setSelectedPath(list[0])
      })
      .catch(() => {
        setArtifacts([])
      })
      .finally(() => setLoadingList(false))
  }, [projectRoot])

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedPath) {
      setContent('')
      return
    }
    setLoadingFile(true)
    ;(window as any).api.designReadArtifact(projectRoot, selectedPath)
      .then((text: string) => setContent(text))
      .catch(() => setContent('_파일을 읽을 수 없습니다._'))
      .finally(() => setLoadingFile(false))
  }, [projectRoot, selectedPath])

  const grouped = groupByDir(artifacts)

  // Markdown code component override
  const components: Components = {
    code({ className, children, ...rest }) {
      const lang = /language-(\w+)/.exec(className ?? '')?.[1]
      if (lang === 'mermaid') {
        return (
          <ErrorBoundary>
            <MermaidBlock code={String(children).trim()} />
          </ErrorBoundary>
        )
      }
      // inline or non-mermaid fenced code
      return (
        <code style={inlineCode} className={className} {...rest}>
          {children}
        </code>
      )
    },
    pre({ children }) {
      return <pre style={preBlock}>{children}</pre>
    },
  }

  return (
    <div style={rootWrap}>
      {/* Sidebar */}
      <aside style={sidebar}>
        <div style={sidebarHeader}>
          <span style={sidebarTitle}>Design Artifacts</span>
        </div>

        <div style={fileTree}>
          {loadingList && (
            <div style={treeHint}>로딩 중...</div>
          )}

          {!loadingList && artifacts.length === 0 && (
            <div style={treeHint}>docs/artifacts/ 에 디자인 산출물이 없습니다.</div>
          )}

          {!loadingList && artifacts.length > 0 && Array.from(grouped.entries()).map(([dir, files]) => (
            <div key={dir}>
              {dir !== '.' && (
                <div style={dirLabel}>{dir}/</div>
              )}
              {files.map(relPath => (
                <button
                  key={relPath}
                  style={fileItem(relPath === selectedPath)}
                  onClick={() => setSelectedPath(relPath)}
                >
                  {basename(relPath)}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main style={mainArea}>
        {/* Top bar */}
        <div style={topBar}>
          <span style={topBarPath}>{selectedPath ?? ''}</span>
          {onClose && (
            <button style={closeBtn} onClick={onClose}>← 뒤로</button>
          )}
        </div>

        <div style={markdownArea}>
          {loadingFile && (
            <div style={hintText}>로딩 중...</div>
          )}

          {!loadingFile && !selectedPath && (
            <div style={hintText}>
              {artifacts.length === 0
                ? 'docs/artifacts/ 에 디자인 산출물이 없습니다.'
                : '왼쪽에서 파일을 선택하세요.'}
            </div>
          )}

          {!loadingFile && selectedPath && content && (
            <div style={markdownBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const rootWrap: React.CSSProperties = {
  display: 'flex',
  width: '100vw',
  height: '100vh',
  background: '#0A0A0A',
  color: '#F0F0F0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  overflow: 'hidden',
}

const sidebar: React.CSSProperties = {
  width: 240,
  minWidth: 240,
  background: '#111',
  borderRight: '1px solid #222',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const sidebarHeader: React.CSSProperties = {
  padding: '16px 14px 12px',
  borderBottom: '1px solid #1E1E1E',
  flexShrink: 0,
}

const sidebarTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#808080',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const fileTree: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 0',
}

const treeHint: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  padding: '12px 14px',
  lineHeight: 1.5,
}

const dirLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  padding: '8px 14px 4px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontFamily: 'monospace',
}

function fileItem(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: active ? '#1E1E1E' : 'transparent',
    border: 'none',
    borderLeft: active ? '2px solid #8B5CF6' : '2px solid transparent',
    color: active ? '#F0F0F0' : '#A0A0A0',
    fontSize: 12,
    padding: '5px 12px 5px 12px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

const mainArea: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0A0A0A',
}

const topBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  borderBottom: '1px solid #1E1E1E',
  background: '#111',
  flexShrink: 0,
  minHeight: 44,
}

const topBarPath: React.CSSProperties = {
  fontSize: 12,
  color: '#505050',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const closeBtn: React.CSSProperties = {
  background: '#1A1A1A',
  color: '#A0A0A0',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '4px 12px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
}

const markdownArea: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 32px',
}

const hintText: React.CSSProperties = {
  color: '#505050',
  fontSize: 13,
  marginTop: 40,
  textAlign: 'center',
}

const markdownBody: React.CSSProperties = {
  maxWidth: 860,
  margin: '0 auto',
  lineHeight: 1.7,
  fontSize: 14,
  color: '#D0D0D0',
}

const inlineCode: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  padding: '1px 5px',
  fontSize: '0.88em',
  fontFamily: 'monospace',
  color: '#E0E0E0',
}

const preBlock: React.CSSProperties = {
  background: '#111',
  border: '1px solid #222',
  borderRadius: 6,
  padding: '14px 16px',
  overflowX: 'auto',
  fontSize: 12,
  lineHeight: 1.6,
  margin: '12px 0',
}
