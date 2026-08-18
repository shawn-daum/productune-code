import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

// Register your own GitHub OAuth App and set the client_id here (or via env)
const CLIENT_ID = (import.meta as any).env?.VITE_GITHUB_CLIENT_ID ?? ''

type Phase = 'checking' | 'device-code' | 'polling' | 'creating-repo' | 'done' | 'error' | 'skipped'

interface Props {
  slug: string
  projectDir: string
  onDone: (repoUrl?: string) => void
}

export default function GitHubOAuthFlow({ slug, projectDir, onDone }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('checking')
  const [userCode, setUserCode] = useState('')
  const [verifyUrl, setVerifyUrl] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    run()
  }, [])

  async function run() {
    const api = (window as any).api

    if (!CLIENT_ID || !api?.githubCheckToken) {
      // No OAuth App configured / no IPC bridge (browser-dev-mode) — skip silently. T-PATCH-213
      onDone()
      return
    }

    // 1. Check existing token
    setPhase('checking')
    const existing = await api.githubCheckToken()
    if (existing?.access_token) {
      await createAndConnect(existing.access_token)
      return
    }

    // 2. Start device flow
    try {
      const dc = await api.githubStartDeviceFlow(CLIENT_ID)
      setUserCode(dc.user_code)
      setVerifyUrl(dc.verification_uri)
      setPhase('device-code')
      // T-434: this was `window.electron?.shell?.openExternal` — a bridge that
      // does not exist (preload exposes `window.api` only, contextBridge is
      // called exactly once). The optional chaining made it a silent no-op, so
      // GitHub's device-flow verification page never opened and the participant
      // was left holding a code with nowhere to type it. Same R-34 class of
      // failure: an auth flow that could not reach the system browser.
      ;(window as any).api?.openExternal?.(dc.verification_uri)

      setPhase('polling')
      const creds = await api.githubPollDeviceFlow({
        clientId: CLIENT_ID,
        deviceCode: dc.device_code,
        interval: dc.interval,
      })
      await createAndConnect(creds.access_token)
    } catch (e: any) {
      setErrorMsg(e.message ?? t('app.github.oauthFailed'))
      setPhase('error')
    }
  }

  async function createAndConnect(token: string) {
    const api = (window as any).api
    try {
      setPhase('creating-repo')
      const repo = await api.githubCreateRepo({ token, slug })
      await api.githubSetupRemote({ projectDir, cloneUrl: repo.clone_url })
      setRepoUrl(repo.clone_url)
      setPhase('done')
    } catch (e: any) {
      setErrorMsg(e.message ?? t('app.github.repoCreateFailed'))
      setPhase('error')
    }
  }

  return (
    <div style={wrap}>
      {phase === 'checking' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text={t('app.github.checkingToken')} />}

      {phase === 'device-code' && (
        <div style={card}>
          <div style={title}>{t('app.github.authTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            {t('app.github.enterCode')}
          </div>
          <div style={codeBox}>{userCode}</div>
          <a
            href={verifyUrl}
            style={{ fontSize: 12, color: 'var(--text-info)', marginTop: 8 }}
            data-escape-hatch="system-browser"
            onClick={e => { e.preventDefault(); (window as any).api?.openExternal?.(verifyUrl) }}
          >
            {verifyUrl}
          </a>
        </div>
      )}

      {phase === 'polling' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text={t('app.github.waitingAuth')} />}
      {phase === 'creating-repo' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text={t('app.github.creatingRepo', { slug })} />}

      {phase === 'done' && (
        <div style={card}>
          <div style={{ color: 'var(--health-success)', fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={title}>{t('app.github.connected')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-disabled)', fontFamily: 'monospace', marginTop: 4 }}>{repoUrl}</div>
          <button style={btnPrimary} onClick={() => onDone(repoUrl)}>{t('app.github.openWorkspace')}</button>
        </div>
      )}

      {phase === 'error' && (
        <div style={card}>
          <div style={{ color: 'var(--health-error)', fontSize: 20, marginBottom: 8 }}>✗</div>
          <div style={title}>{t('app.github.connectFailed')}</div>
          <div style={{ fontSize: 12, color: 'var(--health-error)', marginBottom: 16 }}>{errorMsg}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={() => onDone()}>{t('app.github.continueLocal')}</button>
            <button style={btnPrimary} onClick={() => { setPhase('checking'); run() }}>{t('common.retry')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)', fontSize: 13 }}>
      <span style={{ display: 'inline-flex' }}>{icon}</span><span>{text}</span>
    </div>
  )
}

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }
const card: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)', border: '1px solid var(--border-inline)', borderRadius: 10,
  padding: '24px', width: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
}
const title: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 4 }
const codeBox: React.CSSProperties = {
  background: 'var(--bg-surface-base)', border: '1px solid var(--border-hover)', borderRadius: 6,
  padding: '12px 24px', fontFamily: 'monospace', fontSize: 22, letterSpacing: '0.12em', color: 'var(--text-primary)',
}
const btnPrimary: React.CSSProperties = {
  marginTop: 16, background: 'var(--accent)', color: 'var(--text-static-white)', border: 'none',
  borderRadius: 4, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  marginTop: 16, background: 'var(--bg-surface-onlayer)', color: 'var(--text-primary)', border: '1px solid var(--border-inline)',
  borderRadius: 4, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
}
