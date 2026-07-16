/**
 * MetaMigrateSection — T-366 existing-project meta-split migration entry.
 *
 * Mounted in GeneralSettings next to MetaBackupSection (the reachable settings
 * surface). Self-hides unless the project is actually migratable: plan status
 * `eligible` (mixed repo) or `staged-changes` (migratable once the user lands
 * their staged work) — already-split and no-git projects render nothing.
 *
 * Two-step confirm (meta-migrate.ts auto/confirm boundary): the run button
 * appears only AFTER the plan preview (untrack count, "코드 repo 커밋 1건",
 * no-rewrite note) — that in-app confirmation is the explicit user instruction
 * the contract requires for a commit that will reach origin on the next push.
 * No git logic here: meta:migratePlan / meta:migrateRun IPC only, the same
 * core module `prdt meta split` uses (parity by construction).
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface MigratePlan {
  status: 'eligible' | 'no-git' | 'already-split' | 'staged-changes'
  trackedMetaFiles: string[]
  resuming: boolean
}

interface MigrateResult {
  ok: boolean
  refusal?: string
  verified: boolean
  codeTrackedMetaCount: number
  metaTrackedCount: number
  error?: string
}

export default function MetaMigrateSection({ projectDir }: { projectDir: string }) {
  const { t } = useTranslation()

  const [plan, setPlan] = useState<MigratePlan | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<MigrateResult | null>(null)

  const refresh = useCallback(() => {
    const api = (window as any).api
    if (!api?.metaMigratePlan) return
    api.metaMigratePlan(projectDir)
      .then((p: MigratePlan) => setPlan(p))
      .catch(() => { /* keep hidden */ })
  }, [projectDir])

  useEffect(() => {
    setPlan(null)
    setConfirming(false)
    setResult(null)
    refresh()
  }, [refresh])

  const handleRun = useCallback(async () => {
    setRunning(true)
    try {
      const res: MigrateResult = await (window as any).api.metaMigrateRun(projectDir)
      setResult(res)
    } catch (e: any) {
      setResult({
        ok: false, verified: false, codeTrackedMetaCount: -1, metaTrackedCount: -1,
        error: e?.message ?? 'IPC error',
      })
    } finally {
      setRunning(false)
      setConfirming(false)
      refresh()
    }
  }, [projectDir, refresh])

  // Success just landed → show the one-time done banner even though the fresh
  // plan now says already-split.
  if (result?.ok) {
    return (
      <div style={sectionWrap}>
        <div style={sectionTitle}>{t('settings.metaMigrate.label')}</div>
        <div style={successBanner}>
          {t('settings.metaMigrate.done', {
            metaCount: result.metaTrackedCount,
          })}
        </div>
      </div>
    )
  }

  // Hidden for non-migratable projects (already split, no git, still loading).
  if (!plan || (plan.status !== 'eligible' && plan.status !== 'staged-changes')) return null

  return (
    <div style={sectionWrap}>
      <div style={sectionTitle}>{t('settings.metaMigrate.label')}</div>
      <div style={description}>{t('settings.metaMigrate.description')}</div>

      {plan.status === 'staged-changes' ? (
        <div style={warnBanner}>{t('settings.metaMigrate.stagedBlocked')}</div>
      ) : !confirming ? (
        <button style={primaryBtn} type="button" onClick={() => { setResult(null); setConfirming(true) }}>
          {plan.resuming
            ? t('settings.metaMigrate.resumeButton')
            : t('settings.metaMigrate.startButton')}
        </button>
      ) : (
        <div style={confirmBox}>
          <div style={confirmLine}>
            {t('settings.metaMigrate.planUntrack', { count: plan.trackedMetaFiles.length })}
          </div>
          <div style={confirmLine}>{t('settings.metaMigrate.planCommit')}</div>
          <div style={confirmLine}>{t('settings.metaMigrate.planNoRewrite')}</div>
          {/* §1.5.3 — [Cancel] left / [Confirm] right */}
          <div style={confirmActions}>
            <button
              style={cancelBtn}
              type="button"
              disabled={running}
              onClick={() => setConfirming(false)}
            >
              {t('settings.metaMigrate.cancelButton')}
            </button>
            <button
              style={{ ...primaryBtn, opacity: running ? 0.4 : 1 }}
              type="button"
              disabled={running}
              onClick={handleRun}
            >
              {running
                ? t('settings.metaMigrate.running')
                : t('settings.metaMigrate.confirmButton')}
            </button>
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div style={errorBanner}>
          {result.error || result.refusal || t('settings.metaMigrate.failed')}
        </div>
      )}
    </div>
  )
}

// ── Styles — mirrors MetaBackupSection / GeneralSettings section look ─────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.6,
}

const primaryBtn: React.CSSProperties = {
  fontSize: 11,
  color: '#8B5CF6',
  background: 'transparent',
  border: '1px solid #8B5CF6',
  borderRadius: 4,
  padding: '3px 10px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const cancelBtn: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '3px 10px',
  cursor: 'pointer',
}

const confirmBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  padding: '8px 10px',
  background: '#161616',
}

const confirmLine: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  lineHeight: 1.6,
}

const confirmActions: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 4,
}

const successBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#34D399',
  background: '#0D2A1E',
  border: '1px solid #164F35',
  borderRadius: 4,
  padding: '6px 10px',
}

const warnBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#FCD34D',
  background: '#2A2210',
  border: '1px solid #4A3A1A',
  borderRadius: 4,
  padding: '6px 10px',
}

const errorBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#EF4444', // §2.8 --health-error

  background: '#2A1010',
  border: '1px solid #4A1A1A',
  borderRadius: 4,
  padding: '6px 10px',
}
