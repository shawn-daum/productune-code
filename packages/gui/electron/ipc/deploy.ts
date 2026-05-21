import { ipcMain } from 'electron'
import {
  createDeployPR,
  squashMergePR,
  triggerVercelDeployAfterMerge,
  checkPRMergeability,
  classifyConflict,
  assertNotPoTurn,
  getVercelToken,
} from '@productune/core'

// ── Types ─────────────────────────────────────────────────────────────────────

type DeployProgressStep =
  | 'pr-creating'
  | 'pr-created'
  | 'merging'
  | 'merged'
  | 'deploy-triggering'
  | 'deploy-triggered'
  | 'failed'

// ── Module state ──────────────────────────────────────────────────────────────

/** In-flight PR context for resolve-conflict continuation. */
let _pendingPrCtx: {
  owner: string
  repo: string
  prNumber: number
  projectDir: string
  vercelProject?: string
} | null = null

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── Deploy state poll (T-P4-022 3rd PR) ──────────────────────────────────────
  ipcMain.handle(
    'deploy:state',
    async (
      _event,
      args: { projectDir: string; deploymentId: string },
    ): Promise<{ ok: boolean; state?: string; error?: string }> => {
      try {
        const { getDeploymentState } = await import('@productune/core')
        const token = getVercelToken()
        if (!token) return { ok: false, error: 'VERCEL_TOKEN not configured' }
        const state = await getDeploymentState(args.deploymentId, token)
        return { ok: true, state }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // ── Deploy execute (T-P4-022 3rd PR) ─────────────────────────────────────────
  ipcMain.handle(
    'deploy:execute',
    async (
      event,
      args: {
        projectDir: string
        owner: string
        repo: string
        branchName: string
        ticketId: string
        ticketTitle: string
        ticketAcceptance?: string
        vercelProject?: string
      },
    ): Promise<{ ok: boolean; prUrl?: string; deployUrl?: string; error?: string; errorReason?: string }> => {
      try {
        assertNotPoTurn('deploy:execute')
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'PO turn active', errorReason: 'po-turn-active' }
      }

      const emit = (step: DeployProgressStep, detail?: Record<string, unknown>) => {
        event.sender.send('deploy:progress', { step, ...detail })
      }

      try {
        // Step 1: create PR
        emit('pr-creating')
        const prResult = await createDeployPR({
          branchName: args.branchName,
          owner: args.owner,
          repo: args.repo,
          baseBranch: 'main',
          ticketId: args.ticketId,
          ticketTitle: args.ticketTitle,
          ticketAcceptance: args.ticketAcceptance ?? '',
          personaActivity: [],
        })
        emit('pr-created', { prUrl: prResult.prUrl, prNumber: prResult.prNumber })

        // Step 2: poll mergeability (up to 3 attempts, 2s apart)
        let mergeCheck = await checkPRMergeability(args.owner, args.repo, prResult.prNumber)
        for (let attempt = 0; attempt < 2 && mergeCheck.mergeable === null; attempt++) {
          await new Promise(r => setTimeout(r, 2000))
          mergeCheck = await checkPRMergeability(args.owner, args.repo, prResult.prNumber)
        }

        if (mergeCheck.mergeable === false) {
          const conflictType = classifyConflict(mergeCheck.conflictPaths ?? [])
          _pendingPrCtx = { owner: args.owner, repo: args.repo, prNumber: prResult.prNumber, projectDir: args.projectDir, vercelProject: args.vercelProject }
          event.sender.send('deploy:conflict', {
            owner: args.owner,
            repo: args.repo,
            prNumber: prResult.prNumber,
            conflictPaths: mergeCheck.conflictPaths ?? [],
            conflictType,
          })
          return { ok: false, prUrl: prResult.prUrl, error: 'conflict', errorReason: 'conflict' }
        }

        // Step 3: squash merge
        emit('merging')
        const mergeResult = await squashMergePR({
          owner: args.owner,
          repo: args.repo,
          prNumber: prResult.prNumber,
          commitTitle: `${args.ticketId}: ${args.ticketTitle}`,
        })
        emit('merged', { sha: mergeResult.mergedSha })

        // Step 4: trigger Vercel deploy
        emit('deploy-triggering')
        const deployResult = await triggerVercelDeployAfterMerge({
          projectDir: args.projectDir,
          project: args.vercelProject ?? '',
          gitRef: mergeResult.mergedSha,
        })
        emit('deploy-triggered', { deployUrl: deployResult.deploymentUrl })

        return { ok: true, prUrl: prResult.prUrl, deployUrl: deployResult.deploymentUrl }
      } catch (err: any) {
        const reason = err?.reason ?? 'generic'
        emit('failed', { error: err?.message ?? String(err), errorReason: reason })
        return { ok: false, error: err?.message ?? String(err), errorReason: reason }
      }
    },
  )

  ipcMain.handle(
    'deploy:resolve-conflict',
    async (
      _event,
      args: { strategy: 'theirs' | 'ours' | 'manual' },
    ): Promise<{ ok: boolean; error?: string }> => {
      const ctx = _pendingPrCtx
      _pendingPrCtx = null
      if (!ctx) return { ok: false, error: 'No pending conflict context' }
      if (args.strategy === 'manual') {
        // User will resolve manually — just acknowledge
        return { ok: true }
      }
      // 'theirs' / 'ours' — Phase 5 auto-resolution; for now return ok so UI can reset
      return { ok: true }
    },
  )

  // ── Deploy event cross-ref (T-P4-023 sub-c) ───────────────────────────────────
  // Uses dynamic import to avoid top-level import conflicts with parallel PRs.
  ipcMain.handle(
    'deploy:fetch-events',
    async (
      _event,
      args: { projectDir: string; projectName: string; sinceIso: string; untilIso: string },
    ): Promise<{ ok: boolean; events: unknown[]; error?: string }> => {
      try {
        const { fetchVercelDeploys } = await import('@productune/core')
        const events = await fetchVercelDeploys(
          args.projectName,
          args.sinceIso,
          args.untilIso,
          args.projectDir,
        )
        return { ok: true, events }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, events: [], error: message }
      }
    },
  )
}
