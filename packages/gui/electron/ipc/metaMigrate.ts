/**
 * metaMigrate.ts — T-366 existing-project meta-split migration IPC.
 *
 * Separate file from ipc/meta.ts on purpose: T-367 (history/settings surfaces)
 * is editing that file in the same working tree — the migration entry point
 * stays minimal and self-contained (같은 이유로 main.ts에는 register 2줄만).
 *
 * Channels (thin pass-throughs to @productune/core meta-migrate — the SAME
 * module `prdt meta split` reaches via the meta-cli bridge, parity by
 * construction):
 *   meta:migratePlan(projectDir) → MetaMigrationPlan   (read-only preview)
 *   meta:migrateRun(projectDir)  → MetaMigrationResult
 *
 * Auto/confirm boundary (meta-migrate.ts module header): migrateRun is only
 * invoked AFTER the renderer's explicit confirm step — the plan (file count,
 * "코드 repo에 커밋 1건") is shown first. rm --cached only; never pushes,
 * never rewrites history.
 */

import { ipcMain } from 'electron'
import { planMetaMigration, runMetaMigration } from '@productune/core'
import type { MetaMigrationPlan, MetaMigrationResult } from '@productune/core'

export function register(): void {
  ipcMain.handle(
    'meta:migratePlan',
    async (_event, projectDir: string): Promise<MetaMigrationPlan> =>
      planMetaMigration(projectDir),
  )

  ipcMain.handle(
    'meta:migrateRun',
    async (_event, projectDir: string): Promise<MetaMigrationResult> =>
      runMetaMigration(projectDir),
  )
}
