import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  appendPendingPromotion,
  listPendingPromotions,
  resolvePendingPromotion,
  autoDropStale,
  markSurfaced,
  listAllPromotions,
} from '@productune/core'
import type { PendingPromotion } from '@productune/core'
import { mechanicalWrite } from '../mechanical-write'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovePhaseArgs {
  projectDir: string
  fromPhase: number       // gate.from_phase (1..5)
  toPhase: number         // gate.to_phase (2..5)
  summary?: string        // gate.summary
  userApprovedAt: string  // ISO timestamp (client-generated)
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // T-PATCH-167: distinguish parse-failure from missing/new.
  //  - file missing (ENOENT)  → null  (genuine empty/new → renderer keeps "대기 중" placeholder)
  //  - read/parse failure      → { ok:false, error:'parse' } (renderer shows explicit error)
  //  - success                 → parsed po-state object
  ipcMain.handle('state:readPoState', async (_event, projectDir: string) => {
    const statePath = path.join(projectDir, '.productune', 'po-state.json')
    let raw: string
    try {
      raw = fs.readFileSync(statePath, 'utf-8')
    } catch (e: any) {
      // ENOENT (or any read error) ⇒ treat as "no po-state yet" → null.
      if (e?.code === 'ENOENT') return null
      return { ok: false, error: 'parse' as const, detail: e?.message ?? 'read error' }
    }
    try {
      return JSON.parse(raw)
    } catch (e: any) {
      // File exists but is corrupt/unparseable — surface as explicit error,
      // NOT null (which would masquerade as a fresh project).
      return { ok: false, error: 'parse' as const, detail: e?.message ?? 'JSON parse error' }
    }
  })

  // ── Phase approve IPC (T-P4-115) ──────────────────────────────────────────────
  // Direct mechanical write to po-state.json on user [승인 →] click.
  // Updates current_phase, appends phase_history entry, clears pending_gate.
  ipcMain.handle('phase:approve', (_event, args: ApprovePhaseArgs): { ok: boolean; error?: string } => {
    const statePath = path.join(args.projectDir, '.productune', 'po-state.json')
    try {
      const raw = fs.readFileSync(statePath, 'utf-8')
      const state = JSON.parse(raw)

      state.current_phase = args.toPhase

      if (!Array.isArray(state.phase_history)) state.phase_history = []
      state.phase_history.push({
        phase: args.toPhase,
        started_at: args.userApprovedAt,
        summary: args.summary ?? '',
        user_approved_at: args.userApprovedAt,
      })

      state.pending_gate = null

      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('state:appendPendingPromotion', (
    _event,
    projectDir: string,
    candidate: Omit<PendingPromotion, 'id' | 'status'>,
  ): PendingPromotion => {
    return appendPendingPromotion(projectDir, candidate)
  })

  ipcMain.handle('state:listPendingPromotions', (
    _event,
    projectDir: string,
  ): PendingPromotion[] => {
    return listPendingPromotions(projectDir)
  })

  ipcMain.handle('state:resolvePendingPromotion', (
    _event,
    projectDir: string,
    id: string,
    status: 'approved' | 'dropped' | 'edited',
    finalTarget?: string,
  ): PendingPromotion | null => {
    return resolvePendingPromotion(projectDir, id, status, finalTarget)
  })

  ipcMain.handle('state:autoDropStale', (
    _event,
    projectDir: string,
  ): number => {
    return autoDropStale(projectDir)
  })

  ipcMain.handle('state:markSurfaced', (
    _event,
    projectDir: string,
    id: string,
  ): void => {
    markSurfaced(projectDir, id)
  })

  ipcMain.handle('state:listAllPromotions', (
    _event,
    projectDir: string,
  ): PendingPromotion[] => {
    return listAllPromotions(projectDir)
  })

  ipcMain.handle(
    'state:mechanicalWrite',
    async (
      _event,
      promotion: PendingPromotion,
      claudeSessionId?: string,
    ) => {
      return mechanicalWrite(promotion, { claudeSessionId })
    },
  )

  // ── Deploy modal trigger (T-P4-022 — PO fires state:openDeployModal) ──────────
  // PO (or any main-process code) calls this IPC to open the DeployConfirmModal
  // in the renderer. Renderer listens via preload `onDeployModal`.
  ipcMain.handle(
    'state:openDeployModal',
    (
      event,
      payload: {
        tickets: Array<{ id: string; title: string }>
        gitRef: string
        project: string
        projectDir?: string
        owner?: string
        repo?: string
        branchName?: string
        ticketId?: string
        ticketTitle?: string
        ticketAcceptance?: string
        vercelProject?: string
      },
    ): void => {
      event.sender.send('deploy:openModal', payload)
    },
  )
}
