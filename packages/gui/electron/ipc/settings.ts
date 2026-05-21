import { app, ipcMain } from 'electron'
import {
  getUiLanguage,
  setUiLanguage,
  settingsFileExists,
  loadRules,
  saveRules,
  getVercelToken,
  setVercelToken,
} from '@productune/core'
import type { UiLanguage, GitRules } from '@productune/core'

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('settings:getUiLanguage', (): UiLanguage => {
    return getUiLanguage()
  })

  ipcMain.handle('settings:setUiLanguage', (_event, lng: UiLanguage): { ok: boolean; error?: string } => {
    try {
      setUiLanguage(lng)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('settings:hasLanguagePref', (): boolean => {
    return settingsFileExists()
  })

  ipcMain.handle('settings:getOsLocale', (): string => {
    return app.getLocale()
  })

  // ── Vercel token IPC (OQ-T022-1 (b) — "외부 연결" sub-tab) ───────────────────
  ipcMain.handle('settings:getVercelToken', (): string | null => {
    return getVercelToken()
  })

  ipcMain.handle('settings:setVercelToken', (_event, token: string | null): { ok: boolean; error?: string } => {
    try {
      setVercelToken(token)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  // ── Git workflow rules IPC ─────────────────────────────────────────────────────
  ipcMain.handle('settings:loadRules', (_event, projectDir: string): GitRules => {
    return loadRules(projectDir)
  })

  ipcMain.handle('settings:saveRules', (_event, projectDir: string, rules: GitRules): { ok: boolean; error?: string } => {
    try {
      saveRules(projectDir, rules)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })
}
