/**
 * DoctrineFileTabHost — T-PATCH-022
 *
 * Wraps the T-PATCH-020 DoctrineFileTab and injects the per-save decision flow
 * without touching the editor's internals. Owns:
 *   - the save-choice dialog (AC-1) wired as the editor's `onSave` seam;
 *   - the direct write path (AC-2) via doctrineWriteFile, conflict-aware (AC-5/6);
 *   - the PO-review path (AC-3) via appendPendingPromotion (curated delta, GAP-1);
 *   - the on-disk conflict modal (AC-5/6) reusing ConflictResolveModal;
 *   - the dirty-close guard (AC-4) reusing the GenericDirtyModal visual pattern;
 *   - saved / review-requested / error toasts (AC-7).
 *
 * The editor stays a pure prop-driven component; this host carries all IPC.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertOctagon, X } from 'lucide-react'
import type { Tab } from '../../../../store/workspace'
import { registerTabCloseGuard } from '../../../../store/tabCloseGuard'
import { useWorkspace } from '../../../../store/workspace'
import DoctrineFileTab, { type DoctrineDirtyState, type DoctrineOnSave } from './DoctrineFileTab'
import DoctrineSaveChoiceModal, { type SaveChoice } from '../../DoctrineSaveChoiceModal'
import GenericDirtyModal from '../../GenericDirtyModal'
import ConflictResolveModal, { type ConflictStrategy } from '../../ConflictResolveModal'
import { buildDoctrineReviewDelta } from '../../../../lib/doctrineDelta'

interface Props {
  tab: Tab
}

interface ToastItem {
  id: string
  msg: string
  ok: boolean
}

/** Map the on-disk file shape (T-019 IPC) to the editor's save-result contract. */
type DoctrineWriteResult = {
  ok: boolean
  mtimeMs?: number
  conflict?: boolean
  currentMtimeMs?: number
  error?: string
}

// A save resolved into the editor (handleSave) once the user picks a path:
//   - { ok: true, mtimeMs } → editor marks clean.
//   - { conflict: true }    → handled by THIS host (own modal); editor stays dirty
//                             so we report ok:false WITHOUT conflict to keep it
//                             dirty but suppress the editor's inline conflict line.
//   - { ok: false, error }  → editor shows nothing extra; host toasts.
// We resolve the editor's onSave promise only after the dialog flow completes.

export default function DoctrineFileTabHost({ tab }: Props) {
  const { t } = useTranslation()
  const tabProps = tab.props ?? {}

  const absPath = typeof tabProps.absPath === 'string' ? tabProps.absPath : ''
  const relName = typeof tabProps.relName === 'string' ? tabProps.relName : ''
  const tier = (typeof tabProps.tier === 'number' ? tabProps.tier : 0) as 0 | 1 | 2
  const persona = typeof tabProps.persona === 'string' ? tabProps.persona : ''
  const projectDir = typeof tabProps.projectDir === 'string' ? tabProps.projectDir : undefined

  const closeTabAction = useWorkspace((s) => s.closeTab)

  // Latest dirty report from the editor (AC-4).
  const dirtyRef = useRef<DoctrineDirtyState>({ dirty: false, draft: '' })
  const dirtyFlagRef = useRef(false)

  // Pending save: the resolver for the editor's onSave promise + the draft/mtime
  // captured when the choice dialog opened.
  const pendingRef = useRef<{
    resolve: (r: { ok: boolean; conflict?: boolean; error?: string; mtimeMs?: number }) => void
    content: string
    expectedMtimeMs: number | null
  } | null>(null)

  const [choiceOpen, setChoiceOpen] = useState(false)
  const [choiceBusy, setChoiceBusy] = useState<SaveChoice | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [dirtyModalOpen, setDirtyModalOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Bumped on conflict-resolve "수정 후 다시 시도" to remount the editor so it
  // re-reads the latest on-disk content (AC-5). The stale draft is dropped; the
  // user re-applies edits onto fresh content.
  const [reloadKey, setReloadKey] = useState(0)

  const addToast = useCallback((msg: string, ok: boolean) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, msg, ok }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  // ── onDirtyChange: track dirty + register/unregister the close-guard (AC-4) ──
  const onDirtyChange = useCallback((state: DoctrineDirtyState) => {
    dirtyRef.current = state
    dirtyFlagRef.current = state.dirty
  }, [])

  useEffect(() => {
    const unregister = registerTabCloseGuard(tab.id, () => {
      // Allow close immediately when clean; otherwise veto + show dirty modal.
      if (!dirtyFlagRef.current) return true
      setDirtyModalOpen(true)
      return false
    })
    return () => unregister()
  }, [tab.id])

  // ── Direct write (AC-2) ──────────────────────────────────────────────────────
  const runDirectWrite = useCallback(
    async (content: string, expectedMtimeMs: number | null): Promise<DoctrineWriteResult> => {
      const api = (window as any).api
      return api.doctrineWriteFile(absPath, content, expectedMtimeMs, projectDir) as Promise<DoctrineWriteResult>
    },
    [absPath, projectDir],
  )

  // ── PO-review enqueue (AC-3, GAP-1: curated delta, NOT full file) ────────────
  const runReviewEnqueue = useCallback(
    async (content: string): Promise<{ ok: boolean; error?: string }> => {
      const api = (window as any).api
      if (!projectDir) return { ok: false, error: 'no project' }
      try {
        // Read current on-disk content for the diff summary (best-effort).
        let onDisk = ''
        try {
          const r = await api.doctrineReadFile(absPath, projectDir)
          if (r?.ok) onDisk = r.content ?? ''
        } catch { /* fall back to empty baseline */ }

        const delta = buildDoctrineReviewDelta({
          persona,
          tier,
          relPath: relName || absPath,
          before: onDisk,
          after: content,
        })

        const candidate = {
          persona,
          turn_id: `gui-doctrine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          scope: (tier === 1 ? 'project' : 'global') as 'project' | 'global',
          kind: (absPath.split('/').pop() === 'habit.md' ? 'habit' : 'bookshelf') as 'habit' | 'bookshelf',
          target: absPath,
          delta,
          rationale: 'GUI doctrine edit (T1/T2) requested via review',
        }
        await api.appendPendingPromotion(projectDir, candidate)
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'enqueue failed' }
      }
    },
    [absPath, projectDir, persona, tier, relName],
  )

  // ── Stale-snapshot conflict check shared by both paths (AC-6) ────────────────
  // Returns true when the on-disk mtime drifted from what the editor captured.
  const isStale = useCallback(
    async (expectedMtimeMs: number | null): Promise<boolean> => {
      if (expectedMtimeMs == null) return false
      const api = (window as any).api
      try {
        const r = await api.doctrineReadFile(absPath, projectDir)
        if (!r?.ok) return false
        const current = typeof r.mtimeMs === 'number' ? r.mtimeMs : null
        return current != null && current !== expectedMtimeMs
      } catch {
        return false
      }
    },
    [absPath, projectDir],
  )

  // ── onSave seam injected into the editor (AC-1) ──────────────────────────────
  // Opens the choice dialog and returns a promise the editor awaits. The dialog
  // handlers resolve it. While open, the editor's own Save button shows nothing.
  const onSave = useCallback<DoctrineOnSave>((_p, content, expectedMtimeMs) => {
    return new Promise((resolve) => {
      pendingRef.current = { resolve, content, expectedMtimeMs }
      setChoiceBusy(null)
      setChoiceOpen(true)
    })
  }, [])

  const resolvePending = useCallback(
    (r: { ok: boolean; conflict?: boolean; error?: string; mtimeMs?: number }) => {
      pendingRef.current?.resolve(r)
      pendingRef.current = null
    },
    [],
  )

  // User picked a path in the choice dialog.
  const handleChoose = useCallback(
    async (choice: SaveChoice) => {
      const pending = pendingRef.current
      if (!pending) return
      setChoiceBusy(choice)

      // Conflict pre-check for BOTH paths (AC-6).
      const stale = await isStale(pending.expectedMtimeMs)
      if (stale) {
        setChoiceBusy(null)
        setChoiceOpen(false)
        setConflictOpen(true)
        return
      }

      if (choice === 'direct') {
        const res = await runDirectWrite(pending.content, pending.expectedMtimeMs)
        setChoiceBusy(null)
        setChoiceOpen(false)
        if (res.ok) {
          addToast(t('workspace.doctrine.savedToast'), true)
          resolvePending({ ok: true, mtimeMs: res.mtimeMs })
        } else if (res.conflict) {
          // Race: drifted between our pre-check and the write.
          setConflictOpen(true)
          // leave pending unresolved → conflict modal drives it
        } else {
          addToast(t('workspace.doctrine.writeError', { error: res.error ?? '' }), false)
          resolvePending({ ok: false, error: res.error })
        }
      } else {
        const res = await runReviewEnqueue(pending.content)
        setChoiceBusy(null)
        setChoiceOpen(false)
        if (res.ok) {
          addToast(t('workspace.doctrine.reviewRequestedToast'), true)
          // Editor marks clean: the request is queued; the live file is unchanged
          // so the snapshot mtime is still valid — keep it (no mtimeMs change).
          resolvePending({ ok: true })
        } else {
          addToast(t('workspace.doctrine.writeError', { error: res.error ?? '' }), false)
          resolvePending({ ok: false, error: res.error })
        }
      }
    },
    [isStale, runDirectWrite, runReviewEnqueue, addToast, t, resolvePending],
  )

  // Choice dialog cancelled → abort the save, keep the editor dirty.
  const handleChoiceCancel = useCallback(() => {
    if (choiceBusy) return
    setChoiceOpen(false)
    resolvePending({ ok: false })
  }, [choiceBusy, resolvePending])

  // ── Conflict modal (AC-5) ────────────────────────────────────────────────────
  const handleConflictResolve = useCallback(
    (_strategy: ConflictStrategy) => {
      // "수정 후 다시 시도" (AC-5): reload the latest on-disk content into the
      // editor. We abort this save, clear the dirty flag, and remount the editor
      // (reloadKey bump) so it re-reads via doctrineReadFile and shows the fresh
      // content in Preview — the user re-applies their edits onto it.
      setConflictOpen(false)
      resolvePending({ ok: false, error: 'conflict' })
      dirtyFlagRef.current = false
      setReloadKey((k) => k + 1)
    },
    [resolvePending],
  )

  const handleConflictCancel = useCallback(() => {
    // Abort save, keep editor dirty.
    setConflictOpen(false)
    resolvePending({ ok: false })
  }, [resolvePending])

  // ── Dirty-close modal (AC-4) ─────────────────────────────────────────────────
  const handleDirtyCancel = useCallback(() => {
    setDirtyModalOpen(false)
  }, [])

  const handleDirtyDiscard = useCallback(() => {
    setDirtyModalOpen(false)
    dirtyFlagRef.current = false // allow the re-issued close to pass the guard
    // Re-issue the close now that the guard will allow it.
    const active = useWorkspace.getState()
    // Find the pane holding this tab.
    const findPane = (nodes: any): string | null => {
      const walk = (n: any): string | null => {
        if (n.type === 'leaf') return n.tabs.some((x: any) => x.id === tab.id) ? n.paneId : null
        for (const c of n.children ?? []) {
          const r = walk(c)
          if (r) return r
        }
        return null
      }
      return walk(nodes)
    }
    const paneId = findPane(active.panes)
    if (paneId) closeTabAction(paneId, tab.id)
  }, [closeTabAction, tab.id])

  const handleDirtySave = useCallback(() => {
    // "저장" reopens the save-choice dialog (AC-4 → AC-1) with the live draft.
    setDirtyModalOpen(false)
    const { dirty, draft } = dirtyRef.current
    if (!dirty) return
    pendingRef.current = {
      resolve: (r) => {
        // On a successful save from the dirty modal, the editor's own draft is
        // unaffected here; the editor's handleSave is NOT in play. We instead
        // rely on the next dirty report. To keep things consistent we just clear
        // the dirty flag on success so a follow-up close passes.
        if (r.ok) dirtyFlagRef.current = false
      },
      content: draft,
      // Best-effort: we don't have the editor's snapshot mtime here, so use null
      // to skip the stale pre-check for this re-entry; the IPC's own mtime guard
      // (expectedMtimeMs undefined) still performs the write. The conflict modal
      // path remains available on the editor's own next Save.
      expectedMtimeMs: null,
    }
    setChoiceBusy(null)
    setChoiceOpen(true)
  }, [])

  return (
    <div style={hostWrap}>
      <DoctrineFileTab
        key={reloadKey}
        props={{ ...tabProps, onSave }}
        onDirtyChange={onDirtyChange}
      />

      {choiceOpen && (
        <DoctrineSaveChoiceModal
          busy={choiceBusy}
          onCancel={handleChoiceCancel}
          onChoose={handleChoose}
        />
      )}

      {conflictOpen && (
        <ConflictResolveModal
          conflictPaths={[absPath]}
          onResolve={handleConflictResolve}
          onCancel={handleConflictCancel}
        />
      )}

      {dirtyModalOpen && (
        <GenericDirtyModal
          onCancel={handleDirtyCancel}
          onDiscard={handleDirtyDiscard}
          onSave={handleDirtySave}
        />
      )}

      {/* Toasts (AC-7) — pattern from PendingPromotionDrain */}
      {toasts.length > 0 && (
        <div style={toastStack}>
          {toasts.map((toast) => (
            <div key={toast.id} style={toastStyle(toast.ok)}>
              {toast.ok ? (
                <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
              ) : (
                <AlertOctagon size={13} style={{ flexShrink: 0 }} />
              )}
              <span style={toastMsg}>{toast.msg}</span>
              <button
                style={toastCloseBtn}
                onClick={() => dismissToast(toast.id)}
                aria-label={t('common.cancel')}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const hostWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
}

const toastStack: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  bottom: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 9999,
  maxWidth: 360,
}

function toastStyle(ok: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px 6px 12px',
    fontSize: 11,
    color: ok ? '#34D399' : '#E04040',
    background: ok ? '#0A2A1A' : '#2A0808',
    border: `1px solid ${ok ? '#1A3A1A' : '#3A1A1A'}`,
    borderRadius: 4,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
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
  lineHeight: 1,
  padding: '0 2px',
  opacity: 0.7,
  display: 'inline-flex',
  alignItems: 'center',
}
