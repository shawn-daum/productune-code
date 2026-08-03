import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import GitHubOAuthFlow from './GitHubOAuthFlow'
import VersionInitStep from './onboarding/VersionInitStep'
import { isValidVersionId } from '../lib/version-id'

interface Props {
  onCreated: (projectDir: string, slug: string) => void
  onCancel: () => void
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,}$/

/**
 * QA error-surface regression (T-431 follow-up): a main-process throw (e.g.
 * ensurePrdtCliAvailable's ko-language actionable messages) reaches the
 * renderer wrapped by Electron's ipcRenderer.invoke as
 * `Error invoking remote method '<channel>': Error: <message>` — the user must
 * see only the actionable `<message>`, not the IPC plumbing around it. The
 * message itself stays ko for now (locale split is T-437's scope).
 */
export function stripIpcErrorWrapper(raw: string): string {
  const m = raw.match(/^Error invoking remote method '[^']*':\s*(?:[A-Za-z][\w.]*:\s*)?([\s\S]*)$/)
  return (m ? m[1] : raw).trim()
}

export default function NewProjectModal({ onCreated, onCancel }: Props) {
  const { t } = useTranslation()
  // step 1 = slug, 1.5 = version id, 2 = github oauth
  const [step, setStep] = useState<1 | 1.5 | 2>(1)
  const [slug, setSlug] = useState('')
  const [versionId, setVersionId] = useState('v0.1')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdDir, setCreatedDir] = useState('')

  function validateSlug(v: string) {
    if (!SLUG_RE.test(v)) return t('app.newProject.slugRuleError')
    return ''
  }

  function handleSlugNext() {
    const err = validateSlug(slug)
    if (err) { setError(err); return }
    setError('')
    setStep(1.5)
  }

  /**
   * T-439 (QA HIGH): `project:create` failing used to be completely silent.
   * `setError` was called here at step 1.5, but the ONLY `{error && ...}` render
   * site lived inside the `step === 1` block — so nothing was ever painted and
   * the participant's report was literally "Next did nothing". The message now
   * goes to VersionInitStep, which is the step that owns this Next.
   */
  async function handleCreate() {
    if (creating) return
    if (!isValidVersionId(versionId)) {
      setError(t('app.newProject.createFailed'))
      return
    }
    setError('')
    setCreating(true)
    try {
      const result = await (window as any).api.createProject({ slug, initialVersionId: versionId })
      setCreatedDir(result.projectDir)
      setStep(2)
    } catch (e: any) {
      const raw = e?.message
      setError(typeof raw === 'string' ? stripIpcErrorWrapper(raw) : t('app.newProject.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <FolderOpen size={16} style={{ color: 'var(--accent)' }} strokeWidth={2} />
          <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 15 }}>{t('app.newProject.title')}</span>
        </div>

        {step === 1 && (
          <div style={body}>
            <label style={label}>{t('app.newProject.nameLabel')}</label>
            <input
              style={{ ...input, borderColor: error ? 'var(--health-error)' : 'var(--text-ghost)' }}
              placeholder="my-saas"
              value={slug}
              autoFocus
              onChange={e => { setSlug(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSlugNext()}
            />
            {error && <div style={errStyle}>{error}</div>}
            <div style={hint}>{t('app.newProject.slugHint')}</div>
          </div>
        )}

        {step === 1.5 && (
          <VersionInitStep
            value={versionId}
            onChange={setVersionId}
            onNext={handleCreate}
            onPrev={() => { setStep(1); setCreating(false); setError('') }}
            stepLabel={t('app.newProject.firstVersionLabel')}
            error={error}
            busy={creating}
            busyLabel={t('app.newProject.creating')}
          />
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
            <button style={btnSecondary} onClick={onCancel}>{t('common.cancel')}</button>
            <button style={{ ...btnPrimary }} onClick={handleSlugNext}>
              {t('common.next')}
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
  background: 'var(--bg-surface-onlayer)', borderRadius: 12, border: '1px solid var(--border-inline)',
  width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
}
const header: React.CSSProperties = {
  padding: '16px 20px', borderBottom: '1px solid var(--border-section)', display: 'flex', alignItems: 'center',
}
const body: React.CSSProperties = { padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }
const footer: React.CSSProperties = {
  padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8,
}
const label: React.CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 2 }
const input: React.CSSProperties = {
  background: 'var(--bg-surface-base)', border: '1px solid var(--border-inline)', borderRadius: 4,
  color: 'var(--text-primary)', fontSize: 14, padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
}
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--text-disabled)' }
const errStyle: React.CSSProperties = { fontSize: 12, color: 'var(--health-error)' }
const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)', color: 'var(--text-static-white)', border: 'none', borderRadius: 4,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)', color: 'var(--text-primary)', border: '1px solid var(--border-inline)', borderRadius: 4,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
