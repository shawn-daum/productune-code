import { ipcMain } from 'electron'
import { createWorktree, stashAndCreate, commitAndCreate } from '@productune/core'
import type { CreateWorktreeArgs } from '@productune/core'

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── Worktree IPC (T-P4-092) ──────────────────────────────────────────────────
  // Three invoke handlers: create / stashAndCreate / commitAndCreate.
  // After worktree:create succeeds or fails, main emits worktree:createResult
  // to the renderer so WorkspaceShell can show traces / BaseDirtyModal.

  ipcMain.handle(
    'worktree:create',
    async (event, args: CreateWorktreeArgs) => {
      const result = await createWorktree(args)
      event.sender.send('worktree:createResult', {
        result,
        ticketId: args.ticketId,
        slug: args.slug,
        type: args.type,
        projectDir: args.projectDir,
      })
      return result
    },
  )

  ipcMain.handle(
    'worktree:stashAndCreate',
    async (event, args: CreateWorktreeArgs) => {
      const result = await stashAndCreate(args)
      if (result.ok) {
        event.sender.send('worktree:createResult', {
          result,
          ticketId: args.ticketId,
          slug: args.slug,
          type: args.type,
          projectDir: args.projectDir,
        })
      }
      return result
    },
  )

  ipcMain.handle(
    'worktree:commitAndCreate',
    async (event, args: CreateWorktreeArgs & { message?: string }) => {
      const result = await commitAndCreate(args)
      if (result.ok) {
        event.sender.send('worktree:createResult', {
          result,
          ticketId: args.ticketId,
          slug: args.slug,
          type: args.type,
          projectDir: args.projectDir,
        })
      }
      return result
    },
  )
}
