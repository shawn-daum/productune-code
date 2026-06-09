import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable.css'
import './styles/index.css'
import './styles/md-recipes.css'
import './i18n'
import App from './App'

// ── Diagnostic error boundary (T-P4-119 white-screen debug) ──────────────────
// Catches render-phase throws that would otherwise unmount the tree silently.
// Displays the error on-screen (dark panel) so the bug is visible without
// requiring DevTools to be open.  Remove or demote to noop in production once
// root cause is confirmed.

interface EBState { error: Error | null; info: string | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<EBState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? null })
    console.error('[ErrorBoundary] Render error caught:', error, info.componentStack)
  }

  render() {
    const { error, info } = this.state
    if (error) {
      return (
        <div style={{
          background: '#0F0F0F', color: '#F87171', padding: 24,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 12, minHeight: '100vh', whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', overflowY: 'auto',
        }}>
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
            Render Error (T-P4-119 diagnostic)
          </strong>
          {String(error)}
          {info ? `\n\nComponent stack:${info}` : ''}
          <div style={{ marginTop: 16, color: '#A0A0A0', fontSize: 11 }}>
            Open DevTools (Cmd+Opt+I → Console) for the full stack trace.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
