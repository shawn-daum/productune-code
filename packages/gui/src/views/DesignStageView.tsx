import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [artifacts, setArtifacts] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingFile, setLoadingFile] = useState(false)

  // Load artifact list on mount
  useEffect(() => {
    // T-PATCH-213: browser-dev-mode → api undefined; guard the deref ( .catch
    // below only traps promise rejection, not the synchronous throw ).
    const api = (window as any).api
    if (!api?.designListArtifacts) { setLoadingList(false); return }
    setLoadingList(true)
    api.designListArtifacts(projectRoot)
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
    const api = (window as any).api
    if (!api?.designReadArtifact) { setLoadingFile(false); return }
    api.designReadArtifact(projectRoot, selectedPath)
      .then((text: string) => setContent(text))
      .catch(() => setContent(t('workspace.designStage.readError')))
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
          <span style={sidebarTitle}>{t('workspace.designStage.sidebarTitle')}</span>
        </div>

        <div style={fileTree}>
          {loadingList && (
            <div style={treeHint}>{t('common.loading')}</div>
          )}

          {!loadingList && artifacts.length === 0 && (
            <div style={treeHint}>{t('workspace.designStage.empty')}</div>
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
            <button style={closeBtn} onClick={onClose}>{t('workspace.designStage.back')}</button>
          )}
        </div>

        <div style={markdownArea}>
          {loadingFile && (
            <div style={hintText}>{t('common.loading')}</div>
          )}

          {!loadingFile && !selectedPath && (
            <div style={hintText}>
              {artifacts.length === 0
                ? t('workspace.designStage.empty')
                : t('workspace.designStage.selectHint')}
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
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  overflow: 'hidden',
}

const sidebar: React.CSSProperties = {
  width: 240,
  minWidth: 240,
  background: 'var(--bg-surface-base)',
  borderRight: '1px solid var(--border-section)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const sidebarHeader: React.CSSProperties = {
  padding: '16px 14px 12px',
  borderBottom: '1px solid var(--border-section)',
  flexShrink: 0,
}

const sidebarTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-quaternary)',
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
  color: 'var(--text-disabled)',
  padding: '12px 14px',
  lineHeight: 1.5,
}

const dirLabel: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
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
    background: active ? 'var(--bg-surface-onlayer)' : 'transparent',
    border: 'none',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
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
  background: 'var(--bg-base)',
}

const topBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  borderBottom: '1px solid var(--border-section)',
  background: 'var(--bg-surface-base)',
  flexShrink: 0,
  minHeight: 44,
}

const topBarPath: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-disabled)',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const closeBtn: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)',
  color: 'var(--text-tertiary)',
  border: '1px solid var(--border-inline)',
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
  color: 'var(--text-disabled)',
  fontSize: 13,
  marginTop: 40,
  textAlign: 'center',
}

const markdownBody: React.CSSProperties = {
  maxWidth: 860,
  margin: '0 auto',
  lineHeight: 1.7,
  fontSize: 14,
  color: 'var(--text-secondary)',
}

const inlineCode: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)',
  border: '1px solid var(--border-inline)',
  borderRadius: 3,
  padding: '1px 5px',
  fontSize: '0.88em',
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
}

const preBlock: React.CSSProperties = {
  background: 'var(--bg-surface-base)',
  border: '1px solid var(--border-section)',
  borderRadius: 6,
  padding: '14px 16px',
  overflowX: 'auto',
  fontSize: 12,
  lineHeight: 1.6,
  margin: '12px 0',
}
