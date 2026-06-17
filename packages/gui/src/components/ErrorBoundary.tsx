import { Component, Fragment, ReactNode } from 'react'
import i18next from '../i18n'

interface Props {
  /**
   * Custom fallback. Receives the caught error and a `reset()` callback that
   * clears the boundary's error state AND remounts the subtree (via an
   * internal key bump) so the same children get a fresh mount — see
   * `getDerivedStateFromError` note below on why both are required.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode
  children: ReactNode
}

interface State {
  error: Error | null
  /**
   * Bumped by reset() to force-remount children. WHY both error-clear AND a
   * key bump: clearing `error` alone re-renders the SAME element instances; if
   * the throw was during render of a child whose props are unchanged, React
   * reuses the instance and it throws again immediately. Bumping the key gives
   * the subtree a brand-new mount, which is what "재시도/새로고침" must mean
   * for a recoverable (transient) cause. (T-PATCH-205 구현주의 1.)
   */
  remountKey: number
}

/**
 * Render-phase error boundary.
 *
 * SCOPE (T-PATCH-205 AC-6): React error boundaries catch ONLY render-phase
 * throws (render, lifecycle, constructors of descendants). They do NOT catch:
 *   - errors in event handlers (onClick 등) — those bubble to window.onerror
 *   - async errors (setTimeout, promises, fetch callbacks)
 *   - <webview>/browser-tab native crashes — those run in a separate process
 *     and surface via BrowserTab's own failure overlay, not here.
 * So wrapping a pane's TabContent in this boundary isolates render-phase
 * blow-ups of that one tab; it is NOT a catch-all for that tab.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, remountKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  reset = () => {
    this.setState((s) => ({ error: null, remountKey: s.remountKey + 1 }))
  }

  render() {
    const { error, remountKey } = this.state
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset)
      return (
        <div style={errWrap}>
          <div style={errTitle}>{i18next.t('app.errorBoundary.title')}</div>
          <pre style={errMsg}>{error.message}</pre>
        </div>
      )
    }
    // Keyed Fragment: a reset() key bump remounts the entire children subtree.
    return <Fragment key={remountKey}>{this.props.children}</Fragment>
  }
}

const errWrap: React.CSSProperties = {
  background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 6,
  padding: '12px 16px', margin: '8px 0',
}
const errTitle: React.CSSProperties = {
  fontSize: 12, color: '#F87171', fontWeight: 600, marginBottom: 6,
}
const errMsg: React.CSSProperties = {
  fontSize: 11, color: '#F87171', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  fontFamily: 'monospace',
}
