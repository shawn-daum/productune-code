import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable.css'
import './styles/tokens.css'
import './styles/index.css'
import './styles/md-recipes.css'
import './i18n'
import { initTheme } from './styles/theme'
import App from './App'

// Apply the light/dark theme class + fan the accent out from --brand-accent
// (see styles/theme.ts) before first paint, so tokens resolve correctly.
initTheme()

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
          background: 'var(--bg-surface-base)', color: 'var(--health-error)', padding: 24,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 12, minHeight: '100vh', whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', overflowY: 'auto',
        }}>
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
            Render Error (T-P4-119 diagnostic)
          </strong>
          {String(error)}
          {info ? `\n\nComponent stack:${info}` : ''}
          <div style={{ marginTop: 16, color: 'var(--text-tertiary)', fontSize: 11 }}>
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
