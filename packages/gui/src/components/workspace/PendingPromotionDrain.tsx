import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { PendingPromotion } from '../../lib/types'

interface Props {
  projectDir: string
  claudeSessionId?: string | null
  onDone?: () => void
}

const CAP_PER_TURN = 5

/**
 * Display label for a promotion's classification (v0.5 B1 / T-017).
 * Prefers canonical scope×kind; falls back to a legacy `tier`, then derives
 * scope×kind from the target path so legacy-persisted entries never render blank.
 */
function tierLabel(item: PendingPromotion): string {
  if (item.scope && item.kind) return `${item.scope}/${item.kind}`
  const target = item.final_target ?? item.target ?? ''
  const scope = target.startsWith('~') || target.includes('.productune') ? 'global' : 'project'
  const kind = /(^|\/)bookshelf(\/|$)/.test(target) ? 'bookshelf' : 'habit'
  if (target) return `${scope}/${kind}`
  return item.tier ?? '—'
}

export default function PendingPromotionDrain({ projectDir, claudeSessionId, onDone }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PendingPromotion[]>([])
  const [toasts, setToasts] = useState<{ id: string; msg: string; ok: boolean }[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [bulkInput, setBulkInput] = useState('')

  const api = (window as any).api

  // ── load + stale sweep on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await api.autoDropStale(projectDir)
        const pending: PendingPromotion[] = await api.listPendingPromotions(projectDir)
        if (cancelled) return
        const batch = pending.slice(0, CAP_PER_TURN)
        setItems(batch)
        // Mark surfaced_at for newly surfaced entries
        for (const item of batch) {
          if (!item.surfaced_at) {
            await api.markSurfaced(projectDir, item.id)
          }
        }
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDir])

  const addToast = useCallback((id: string, msg: string, ok: boolean) => {
    const toastId = `${id}-${Date.now()}`
    setToasts((prev) => [...prev, { id: toastId, msg, ok }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId))
    }, 4000)
  }, [])

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      if (next.length === 0) onDone?.()
      return next
    })
  }, [onDone])

  const handleSave = useCallback(async (item: PendingPromotion) => {
    setBusy((b) => ({ ...b, [item.id]: true }))
    try {
      await api.resolvePendingPromotion(projectDir, item.id, 'approved')
      const result = await api.mechanicalWrite(item, claudeSessionId ?? undefined)
      if (result.ok) {
        addToast(item.id, t('workspace.promotion.savedToast'), true)
        removeItem(item.id)
      } else {
        addToast(item.id, t('workspace.promotion.writeError', { error: result.error }), false)
      }
    } catch (e: any) {
      addToast(item.id, t('workspace.promotion.writeError', { error: e?.message ?? String(e) }), false)
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }))
    }
  }, [projectDir, claudeSessionId, addToast, removeItem, t, api])

  const handleSkip = useCallback(async (item: PendingPromotion) => {
    setBusy((b) => ({ ...b, [item.id]: true }))
    try {
      await api.resolvePendingPromotion(projectDir, item.id, 'dropped')
      removeItem(item.id)
    } catch { /* ignore */ } finally {
      setBusy((b) => ({ ...b, [item.id]: false }))
    }
  }, [projectDir, removeItem, api])

  const handleEditOpen = useCallback((item: PendingPromotion) => {
    setEditingId(item.id)
    setEditValue(item.delta)
  }, [])

  const handleEditConfirm = useCallback(async (item: PendingPromotion) => {
    if (!editValue.trim()) return
    setBusy((b) => ({ ...b, [item.id]: true }))
    try {
      await api.resolvePendingPromotion(projectDir, item.id, 'edited', editValue.trim())
      const edited = { ...item, delta: editValue.trim(), final_target: editValue.trim() }
      const result = await api.mechanicalWrite(edited, claudeSessionId ?? undefined)
      if (result.ok) {
        addToast(item.id, t('workspace.promotion.savedToast'), true)
        removeItem(item.id)
      } else {
        addToast(item.id, t('workspace.promotion.writeError', { error: result.error }), false)
      }
    } catch (e: any) {
      addToast(item.id, t('workspace.promotion.writeError', { error: e?.message ?? String(e) }), false)
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }))
      setEditingId(null)
      setEditValue('')
    }
  }, [projectDir, editValue, claudeSessionId, addToast, removeItem, t, api])

  const handleBulkApprove = useCallback(async () => {
    if (!bulkInput.trim()) return
    const nums = bulkInput.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= items.length)
    const targets = nums.map((n) => items[n - 1]).filter(Boolean)
    for (const item of targets) {
      await handleSave(item)
    }
    setBulkInput('')
  }, [bulkInput, items, handleSave])

  if (items.length === 0) return null

  const showNumbers = items.length > 3

  return (
    <div style={container}>
      <div style={headerRow}>
        <span style={headerLabel}>{t('workspace.promotion.drainTitle')}</span>
        <span style={headerCount}>{t('workspace.promotion.drainCount', { count: items.length })}</span>
      </div>

      {items.map((item, idx) => (
        <div key={item.id} style={card}>
          {showNumbers && <span style={indexBadge}>{idx + 1}</span>}
          <div style={cardBody}>
            <div style={cardMeta}>
              <span style={personaTag}>{item.persona}</span>
              <span style={tierTag}>{tierLabel(item)}</span>
              <span style={targetText} title={item.target}>{item.target}</span>
            </div>
            <div style={deltaText} title={item.delta}>
              {item.delta.length > 120 ? item.delta.slice(0, 120) + '…' : item.delta}
            </div>
            {item.rationale && (
              <div style={rationaleText}>{item.rationale}</div>
            )}

            {editingId === item.id ? (
              <div style={editRow}>
                <textarea
                  style={editArea}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div style={editActions}>
                  <button style={btnSave} onClick={() => handleEditConfirm(item)} disabled={busy[item.id]}>
                    {t('workspace.promotion.editConfirm')}
                  </button>
                  <button style={btnSkip} onClick={() => { setEditingId(null); setEditValue('') }}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={actionRow}>
                <button
                  style={btnSave}
                  onClick={() => handleSave(item)}
                  disabled={busy[item.id]}
                >
                  {t('workspace.promotion.save')}
                </button>
                <button
                  style={btnEdit}
                  onClick={() => handleEditOpen(item)}
                  disabled={busy[item.id]}
                >
                  {t('workspace.promotion.edit')}
                </button>
                <button
                  style={btnSkip}
                  onClick={() => handleSkip(item)}
                  disabled={busy[item.id]}
                >
                  {t('workspace.promotion.skip')}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {showNumbers && (
        <div style={bulkRow}>
          <span style={bulkLabel}>{t('workspace.promotion.bulkHint')}</span>
          <input
            style={bulkInput_}
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            placeholder={t('workspace.promotion.bulkPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBulkApprove() }}
          />
          <button style={btnSave} onClick={handleBulkApprove}>
            {t('workspace.promotion.bulkApprove')}
          </button>
        </div>
      )}

      {toasts.map((toast) => (
        <div key={toast.id} style={toastStyle(toast.ok)}>
          <span style={toastMsg}>{toast.msg}</span>
          <button
            style={toastCloseBtn}
            onClick={() => dismissToast(toast.id)}
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  margin: '8px 0',
  background: '#0F0F0F',
  border: '1px solid #2A1808',
  borderRadius: 6,
  overflow: 'hidden',
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  background: '#1A0F06',
  borderBottom: '1px solid #2A1808',
}

const headerLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#8B5CF6',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const headerCount: React.CSSProperties = {
  fontSize: 10,
  color: '#A04020',
  background: '#2A1808',
  padding: '1px 6px',
  borderRadius: 10,
}

const card: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid #1A1A1A',
}

const cardBody: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const cardMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

const indexBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#707070',
  minWidth: 16,
  textAlign: 'center',
  marginTop: 2,
}

const personaTag: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#8B5CF6',
  background: '#120A2A',
  padding: '1px 6px',
  borderRadius: 3,
  fontFamily: 'monospace',
}

const tierTag: React.CSSProperties = {
  fontSize: 10,
  color: '#A0A0A0',
  background: '#1A1A1A',
  padding: '1px 6px',
  borderRadius: 3,
  fontFamily: 'monospace',
}

const targetText: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 260,
}

const deltaText: React.CSSProperties = {
  fontSize: 12,
  color: '#E0E0E0',
  lineHeight: 1.5,
  wordBreak: 'break-word',
}

const rationaleText: React.CSSProperties = {
  fontSize: 11,
  color: '#606060',
  fontStyle: 'italic',
}

const actionRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 4,
}

const editRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 4,
}

const editActions: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const editArea: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 12,
  padding: '6px 8px',
  resize: 'vertical',
  fontFamily: 'monospace',
  outline: 'none',
}

const btnBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '0.02em',
}

const btnSave: React.CSSProperties = {
  ...btnBase,
  background: '#8B5CF6',
  color: '#FFFFFF',
}

const btnEdit: React.CSSProperties = {
  ...btnBase,
  background: '#2A2A2A',
  color: '#C0C0C0',
}

const btnSkip: React.CSSProperties = {
  ...btnBase,
  background: '#1A1A1A',
  color: '#707070',
}

const bulkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: '#141414',
  borderTop: '1px solid #1A1A1A',
}

const bulkLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#606060',
  flexShrink: 0,
}

const bulkInput_: React.CSSProperties = {
  flex: 1,
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 12,
  padding: '3px 8px',
  outline: 'none',
  fontFamily: 'monospace',
  maxWidth: 120,
}

function toastStyle(ok: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px 6px 12px',
    fontSize: 11,
    color: ok ? '#34D399' : '#E04040',
    background: ok ? '#0A2A1A' : '#2A0808',
    borderTop: `1px solid ${ok ? '#1A3A1A' : '#3A1A1A'}`,
  }
}

const toastMsg: React.CSSProperties = {
  flex: 1,
}

const toastCloseBtn: React.CSSProperties = {
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
  opacity: 0.7,
  fontFamily: 'inherit',
}
