/**
 * meta.ts — meta repo read/config IPC (T-367, PRD §v1.2 CLI·GUI parity).
 *
 * Thin pass-throughs to @productune/core's meta-git module — the SAME API the
 * `prdt meta` CLI reaches through the dist/bin/meta-cli bridge, so both
 * surfaces render one timeline by construction. No git logic lives here.
 *
 * Channels:
 *   meta:log(projectDir, limit?)          → HistoryEntry[]  ([] when no meta repo)
 *   meta:listRemotes(projectDir)          → { exists, remotes }
 *   meta:addRemote(projectDir, name, url) → { ok, error? }   (NEVER pushes)
 *
 * Note: meta COMMITS are deliberately not wired here — the beat lives in the
 * prdt-post-dispatch hook, which fires for GUI-spawned persona sessions too
 * (they run through the same `claude` CLI). A second GUI-side trigger would
 * break the "one signal, both surfaces" parity contract.
 */

import { ipcMain } from 'electron'
import {
  scanMetaHistory,
  metaRepoExists,
  listMetaRemotes,
  addMetaRemote,
} from '@productune/core'
import type { HistoryEntry, MetaRemote, MetaRemoteResult } from '@productune/core'

export function register(): void {
  ipcMain.handle(
    'meta:log',
    async (_event, projectDir: string, limit?: number): Promise<HistoryEntry[]> =>
      scanMetaHistory(projectDir, { limit }),
  )

  ipcMain.handle(
    'meta:listRemotes',
    async (_event, projectDir: string): Promise<{ exists: boolean; remotes: MetaRemote[] }> => ({
      exists: metaRepoExists(projectDir),
      remotes: await listMetaRemotes(projectDir),
    }),
  )

  ipcMain.handle(
    'meta:addRemote',
    async (_event, projectDir: string, name: string, url: string): Promise<MetaRemoteResult> =>
      addMetaRemote(projectDir, name, url),
  )
}
