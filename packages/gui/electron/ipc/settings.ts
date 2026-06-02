import { app, ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
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

// ── Persona-spec edit (v0.5 B1 / T-017) ──────────────────────────────────────
// Persona agent specs live at ~/.claude/agents/<id>.md. Only the 4 known
// productune personas are addressable — guards against arbitrary path writes.
const PERSONA_SPEC_IDS = new Set(['pdt-po', 'pdt-designer', 'pdt-developer', 'pdt-qa'])

function personaSpecPath(personaId: string): string | null {
  if (!PERSONA_SPEC_IDS.has(personaId)) return null
  return path.join(os.homedir(), '.claude', 'agents', `${personaId}.md`)
}

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

  // ── Persona-spec read/write (v0.5 B1 / T-017) ────────────────────────────────
  ipcMain.handle(
    'persona:readSpec',
    (_event, personaId: string): { ok: boolean; content?: string; exists?: boolean; error?: string } => {
      const specPath = personaSpecPath(personaId)
      if (!specPath) return { ok: false, error: 'unknown persona' }
      try {
        if (!fs.existsSync(specPath)) return { ok: true, content: '', exists: false }
        return { ok: true, content: fs.readFileSync(specPath, 'utf-8'), exists: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    },
  )

  ipcMain.handle(
    'persona:writeSpec',
    (_event, personaId: string, content: string): { ok: boolean; error?: string } => {
      const specPath = personaSpecPath(personaId)
      if (!specPath) return { ok: false, error: 'unknown persona' }
      try {
        fs.mkdirSync(path.dirname(specPath), { recursive: true })
        const tmp = specPath + '.tmp'
        fs.writeFileSync(tmp, content, 'utf-8')
        fs.renameSync(tmp, specPath)
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'write failed' }
      }
    },
  )
}
