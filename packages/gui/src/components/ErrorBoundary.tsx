import { Component, ReactNode } from 'react'
import i18next from '../i18n'

interface Props {
  fallback?: (error: Error) => ReactNode
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      if (this.props.fallback) return this.props.fallback(error)
      return (
        <div style={errWrap}>
          <div style={errTitle}>{i18next.t('app.errorBoundary.title')}</div>
          <pre style={errMsg}>{error.message}</pre>
        </div>
      )
    }
    return this.props.children
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
