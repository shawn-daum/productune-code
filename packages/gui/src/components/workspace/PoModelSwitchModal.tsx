/**
 * PoModelSwitchModal — PO-only model switcher (T-334).
 *
 * Opened from the PO sprite's model label (PersonaPresenceBar). Lets the user
 * pick a new PO model; confirming persists `gui_model` to `.prdt/config.json`
 * and restarts the PO session (a model change can't apply to a live session —
 * the restart is mandatory and clearly noticed). Restart mechanics mirror
 * RestartSessionModal (T-P4-059): po:restartSession + renderer session reset +
 * restart-completed toast.
 *
 * Worker models are display-only — this modal is never opened for them.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../store/workspace'
import { useSessionHealth } from '../../store/sessionHealth'
import { usePoChat } from '../../store/poChat'
import { usePoModel, resolvePoModel, formatModelLabel, PO_MODEL_OPTIONS, type PoModel } from '../../store/poModel'

interface Props {
  projectDir: string
  onClose: () => void
}

export default function PoModelSwitchModal({ projectDir, onClose }: Props) {
  const { t } = useTranslation()
  const current = resolvePoModel(usePoModel((s) => s.model))
  const setModel = usePoModel((s) => s.setModel)
  const setClaudeSessionId = useWorkspace((s) => s.setClaudeSessionId)
  const clearHealth = useSessionHealth((s) => s.clearHealth)
  const setRestartCompleted = usePoChat((s) => s.setRestartCompleted)

  const [selected, setSelected] = useState<PoModel>(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const changed = selected !== current

  const handleConfirm = async () => {
    if (busy || !changed) return
    setBusy(true)
    setError(false)
    const api = (window as any).api
    try {
      // 1) Persist the new model BEFORE restarting — the fresh spawn reads
      //    gui_model from disk (po-runner getPoSessionOverride) at turn start.
      const res: { ok: boolean } = await api.setPoSessionOverride(projectDir, { model: selected })
      if (!res?.ok) throw new Error('persist failed')
      // 2) Restart the PO session so the new model takes effect.
      await api.poRestartSession?.(projectDir)
      setModel(selected)
      setClaudeSessionId(null)
      clearHealth()
      setRestartCompleted(true)
      onClose()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="pmsm-title">
      <div style={modal}>
        <h2 style={title} id="pmsm-title">{t('workspace.poModel.switchTitle')}</h2>

        <div style={optionList} role="radiogroup" aria-label={t('workspace.poModel.switchTitle')}>
          {PO_MODEL_OPTIONS.map((m) => {
            const active = selected === m
            return (
              <button
                key={m}
                role="radio"
                aria-checked={active}
                style={{ ...optionRow, ...(active ? optionRowActive : null) }}
                onClick={() => setSelected(m)}
                disabled={busy}
              >
                <span style={{ ...radioDot, ...(active ? radioDotActive : null) }} aria-hidden="true" />
                {/* T-335: alias-only option list (no session per candidate model
                    exists yet) — capitalized family, never an invented version. */}
                <span style={optionLabel}>{formatModelLabel(m)}</span>
                {m === current && <span style={currentBadge}>{t('workspace.poModel.currentBadge')}</span>}
              </button>
            )
          })}
        </div>

        {/* Mandatory restart notice (requirement #3). */}
        <p style={notice}>{t('workspace.poModel.switchNotice')}</p>

        {error && <p style={errorText}>{t('workspace.poModel.switchError')}</p>}

        <div style={actions}>
          <button style={btnGhost} onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            style={{ ...btnPrimary, opacity: !changed || busy ? 0.5 : 1, cursor: !changed || busy ? 'not-allowed' : 'pointer' }}
            onClick={handleConfirm}
            disabled={!changed || busy}
          >
            {busy ? t('common.loading') : t('workspace.poModel.switchConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles (mirrors RestartSessionModal tokens) ────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
}

const modal: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  padding: '24px 28px',
  width: 380,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const optionList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const optionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 12px',
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  width: '100%',
}

const optionRowActive: React.CSSProperties = {
  borderColor: '#8B5CF6',
  background: '#1E1830',
}

const radioDot: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: '2px solid #505050',
  flexShrink: 0,
  boxSizing: 'border-box',
}

const radioDotActive: React.CSSProperties = {
  borderColor: '#8B5CF6',
  background: '#8B5CF6',
  boxShadow: 'inset 0 0 0 2px #1E1830',
}

const optionLabel: React.CSSProperties = {
  fontSize: 13,
  color: '#E8E8EA',
  fontWeight: 500,
  flex: 1,
}

const currentBadge: React.CSSProperties = {
  fontSize: 10,
  color: '#9a9a9a',
  border: '1px solid #333',
  borderRadius: 3,
  padding: '1px 6px',
}

const notice: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#C0C0C0',
  lineHeight: 1.55,
}

const errorText: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#F87171',
}

const actions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 4,
  justifyContent: 'flex-end',
}

const btnPrimary: React.CSSProperties = {
  height: 30,
  padding: '0 16px',
  background: '#8B5CF6',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
}

const btnGhost: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  background: 'transparent',
  color: '#707070',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
