import { useEffect, useState, type ReactNode } from 'react'
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

    if (!CLIENT_ID) {
      // No OAuth App configured — skip silently
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
      ;(window as any).electron?.shell?.openExternal(dc.verification_uri)

      setPhase('polling')
      const creds = await api.githubPollDeviceFlow({
        clientId: CLIENT_ID,
        deviceCode: dc.device_code,
        interval: dc.interval,
      })
      await createAndConnect(creds.access_token)
    } catch (e: any) {
      setErrorMsg(e.message ?? 'OAuth 실패')
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
      setErrorMsg(e.message ?? 'repo 생성 실패')
      setPhase('error')
    }
  }

  return (
    <div style={wrap}>
      {phase === 'checking' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text="GitHub 토큰 확인 중…" />}

      {phase === 'device-code' && (
        <div style={card}>
          <div style={title}>GitHub 인증</div>
          <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 16 }}>
            아래 코드를 GitHub에 입력하세요.
          </div>
          <div style={codeBox}>{userCode}</div>
          <a
            href={verifyUrl}
            style={{ fontSize: 12, color: '#60A5FA', marginTop: 8 }}
            onClick={e => { e.preventDefault(); (window as any).electron?.shell?.openExternal(verifyUrl) }}
          >
            {verifyUrl}
          </a>
        </div>
      )}

      {phase === 'polling' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text="GitHub 인증 대기 중…" />}
      {phase === 'creating-repo' && <StatusLine icon={<Loader2 size={14} className="pdt-spin" />} text={`private repo '${slug}' 생성 중…`} />}

      {phase === 'done' && (
        <div style={card}>
          <div style={{ color: '#34D399', fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={title}>연결 완료</div>
          <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginTop: 4 }}>{repoUrl}</div>
          <button style={btnPrimary} onClick={() => onDone(repoUrl)}>워크스페이스 열기</button>
        </div>
      )}

      {phase === 'error' && (
        <div style={card}>
          <div style={{ color: '#EF4444', fontSize: 20, marginBottom: 8 }}>✗</div>
          <div style={title}>연결 실패</div>
          <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 16 }}>{errorMsg}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={() => onDone()}>로컬 전용으로 계속</button>
            <button style={btnPrimary} onClick={() => { setPhase('checking'); run() }}>재시도</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#A0A0A0', fontSize: 13 }}>
      <span style={{ display: 'inline-flex' }}>{icon}</span><span>{text}</span>
    </div>
  )
}

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }
const card: React.CSSProperties = {
  background: '#1A1A1A', border: '1px solid #333', borderRadius: 10,
  padding: '24px', width: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
}
const title: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 4 }
const codeBox: React.CSSProperties = {
  background: '#0F0F0F', border: '1px solid #444', borderRadius: 6,
  padding: '12px 24px', fontFamily: 'monospace', fontSize: 22, letterSpacing: '0.12em', color: '#F0F0F0',
}
const btnPrimary: React.CSSProperties = {
  marginTop: 16, background: '#8B5CF6', color: '#fff', border: 'none',
  borderRadius: 4, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  marginTop: 16, background: '#242424', color: '#F0F0F0', border: '1px solid #333',
  borderRadius: 4, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
}
