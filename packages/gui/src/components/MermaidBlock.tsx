import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import ErrorBoundary from './ErrorBoundary'

// Mermaid is initialized once per session
let mermaidReady = false

async function ensureMermaid() {
  if (mermaidReady) return
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
  })
  mermaidReady = true
}

interface Props {
  code: string
  /** Optional ref forwarded to the TransformWrapper so parent can call
   *  zoomIn / zoomOut / resetTransform from outside (e.g. header buttons). */
  transformRef?: React.Ref<ReactZoomPanPinchRef>
}

function MermaidBlockInner({ code, transformRef }: Props) {
  const { t } = useTranslation()
  const uid = useId().replace(/:/g, '')
  const containerId = `mermaid-${uid}`
  const containerRef = useRef<HTMLDivElement>(null)

  const [svg, setSvg] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        await ensureMermaid()
        const mermaid = (await import('mermaid')).default
        const { svg: rendered } = await mermaid.render(containerId, code)
        if (!cancelled) {
          setSvg(rendered)
          setRenderError(null)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setRenderError(msg)
          setSvg(null)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [code, containerId])

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={blockWrap}>
      {/* Toolbar */}
      <div style={toolbar}>
        <span style={diagramLabel}>diagram</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={toolBtn} onClick={() => setShowSource(s => !s)}>
            {showSource ? 'diagram' : 'source'}
          </button>
          <button style={toolBtn} onClick={handleCopy}>
            {copied ? 'copied' : 'copy source'}
          </button>
        </div>
      </div>

      {/* Hidden container mermaid uses as scratch space */}
      <div ref={containerRef} id={containerId} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }} />

      {/* Render error fallback */}
      {renderError && (
        <div style={errorWrap}>
          <div style={errorTitle}>{t('workspace.mermaid.renderError')}</div>
          <pre style={errorMsg}>{renderError}</pre>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('workspace.mermaid.sourceLabel')}</div>
          <pre style={sourceCode}>{code}</pre>
        </div>
      )}

      {/* Source view */}
      {!renderError && showSource && (
        <pre style={sourceCode}>{code}</pre>
      )}

      {/* SVG diagram with zoom/pan */}
      {!renderError && !showSource && svg && (
        <TransformWrapper
          ref={transformRef}
          minScale={0.3}
          maxScale={6}
          wheel={{ step: 0.1 }}
          doubleClick={{ disabled: false }}
        >
          <TransformComponent
            wrapperStyle={transformWrapperStyle}
            contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div
              style={svgContainer}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </TransformComponent>
        </TransformWrapper>
      )}

      {/* Loading placeholder */}
      {!renderError && !svg && (
        <div style={loadingPlaceholder}>{t('workspace.mermaid.rendering')}</div>
      )}
    </div>
  )
}

export default function MermaidBlock(props: Props) {
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      fallback={(err) => (
        <div style={{ background: 'var(--health-error-subtle)', border: '1px solid var(--health-error)', borderRadius: 6, padding: '12px 16px', margin: '8px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--health-error)', fontWeight: 600, marginBottom: 4 }}>{t('workspace.mermaid.componentError')}</div>
          <pre style={{ fontSize: 11, color: 'var(--health-error)', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{err.message}</pre>
        </div>
      )}
    >
      {/* transformRef must be passed explicitly — spread loses the ref type */}
      <MermaidBlockInner code={props.code} transformRef={props.transformRef} />
    </ErrorBoundary>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const blockWrap: React.CSSProperties = {
  border: '1px solid var(--border-inline)',
  borderRadius: 8,
  overflow: 'hidden',
  margin: '12px 0',
  background: 'var(--bg-surface-base)',
  position: 'relative',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  background: 'var(--bg-surface-onlayer)',
  borderBottom: '1px solid var(--border-inline)',
}

const diagramLabel: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const toolBtn: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)',
  color: 'var(--text-tertiary)',
  border: '1px solid var(--border-inline)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'monospace',
}

const transformWrapperStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 200,
  maxHeight: 480,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-surface-base)',
  cursor: 'grab',
}

const svgContainer: React.CSSProperties = {
  padding: 16,
  maxWidth: '100%',
}

const sourceCode: React.CSSProperties = {
  margin: 0,
  padding: '12px 16px',
  fontSize: 12,
  color: 'var(--text-tertiary)',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  background: 'var(--bg-base)',
  overflowX: 'auto',
}

const errorWrap: React.CSSProperties = {
  padding: '12px 16px',
  background: 'var(--health-error-subtle)',
}

const errorTitle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--health-error)',
  fontWeight: 600,
  marginBottom: 6,
}

const errorMsg: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--health-error)',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: 'monospace',
  marginBottom: 8,
}

const loadingPlaceholder: React.CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  color: 'var(--text-disabled)',
  fontSize: 12,
  fontFamily: 'monospace',
}
