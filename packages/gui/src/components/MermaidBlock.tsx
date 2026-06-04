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
          <div style={{ marginTop: 8, fontSize: 11, color: '#A0A0A0' }}>{t('workspace.mermaid.sourceLabel')}</div>
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
        <div style={{ background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 6, padding: '12px 16px', margin: '8px 0' }}>
          <div style={{ fontSize: 12, color: '#F87171', fontWeight: 600, marginBottom: 4 }}>{t('workspace.mermaid.componentError')}</div>
          <pre style={{ fontSize: 11, color: '#F87171', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{err.message}</pre>
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
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  overflow: 'hidden',
  margin: '12px 0',
  background: '#111',
  position: 'relative',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  background: '#1A1A1A',
  borderBottom: '1px solid #2A2A2A',
}

const diagramLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const toolBtn: React.CSSProperties = {
  background: '#242424',
  color: '#A0A0A0',
  border: '1px solid #333',
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
  background: '#0F0F0F',
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
  color: '#A0A0A0',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  background: '#0A0A0A',
  overflowX: 'auto',
}

const errorWrap: React.CSSProperties = {
  padding: '12px 16px',
  background: '#110808',
}

const errorTitle: React.CSSProperties = {
  fontSize: 12,
  color: '#F87171',
  fontWeight: 600,
  marginBottom: 6,
}

const errorMsg: React.CSSProperties = {
  fontSize: 11,
  color: '#F87171',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: 'monospace',
  marginBottom: 8,
}

const loadingPlaceholder: React.CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  color: '#505050',
  fontSize: 12,
  fontFamily: 'monospace',
}
