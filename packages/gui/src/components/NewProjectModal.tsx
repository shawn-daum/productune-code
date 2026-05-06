import { useState } from 'react'
import GitHubOAuthFlow from './GitHubOAuthFlow'

interface Props {
  onCreated: (projectDir: string, slug: string) => void
  onCancel: () => void
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,}$/

export default function NewProjectModal({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdDir, setCreatedDir] = useState('')

  function validateSlug(v: string) {
    if (!SLUG_RE.test(v)) return '영소문자·숫자·하이픈만, 2자 이상'
    return ''
  }

  async function handleCreate() {
    const err = validateSlug(slug)
    if (err) { setError(err); return }
    setError('')
    setCreating(true)
    try {
      const result = await (window as any).api.createProject({ slug })
      setCreatedDir(result.projectDir)
      setStep(2)
    } catch (e: any) {
      setError(e?.message ?? '생성 실패')
      setCreating(false)
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <span style={{ color: '#FF6B2B', fontWeight: 700 }}>⚡</span>
          <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 15 }}>새 프로젝트 만들기</span>
        </div>

        {step === 1 && (
          <div style={body}>
            <label style={label}>프로젝트 이름 (slug)</label>
            <input
              style={{ ...input, borderColor: error ? '#EF4444' : '#333' }}
              placeholder="my-saas"
              value={slug}
              autoFocus
              onChange={e => { setSlug(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            {error && <div style={errStyle}>{error}</div>}
            <div style={hint}>영소문자, 숫자, 하이픈만 사용 가능합니다.</div>
          </div>
        )}

        {step === 2 && (
          <GitHubOAuthFlow
            slug={slug}
            projectDir={createdDir}
            onDone={() => onCreated(createdDir, slug)}
          />
        )}

        {step === 1 && (
          <div style={footer}>
            <button style={btnSecondary} onClick={onCancel}>취소</button>
            <button style={{ ...btnPrimary, opacity: creating ? 0.6 : 1 }} onClick={handleCreate} disabled={creating}>
              {creating ? '생성 중…' : '만들기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- styles ---
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const modal: React.CSSProperties = {
  background: '#1A1A1A', borderRadius: 12, border: '1px solid #333',
  width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
}
const header: React.CSSProperties = {
  padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center',
}
const body: React.CSSProperties = { padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }
const footer: React.CSSProperties = {
  padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8,
}
const label: React.CSSProperties = { fontSize: 12, color: '#A0A0A0', marginBottom: 2 }
const input: React.CSSProperties = {
  background: '#0F0F0F', border: '1px solid #333', borderRadius: 4,
  color: '#F0F0F0', fontSize: 14, padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
}
const hint: React.CSSProperties = { fontSize: 11, color: '#505050' }
const errStyle: React.CSSProperties = { fontSize: 12, color: '#EF4444' }
const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 4,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
