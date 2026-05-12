import fs from 'fs'
import path from 'path'
import os from 'os'

export type UiLanguage = 'en' | 'ko'

export interface UiSettings {
  version: 1
  ui: {
    language: UiLanguage
  }
}

const SETTINGS_PATH = path.join(os.homedir(), '.productune', 'settings.json')

const DEFAULT_SETTINGS: UiSettings = {
  version: 1,
  ui: { language: 'en' },
}

export function loadSettings(): UiSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    // Read-merge: preserve defaults for missing fields
    return {
      version: 1,
      ui: {
        language: parsed?.ui?.language === 'ko' ? 'ko' : 'en',
      },
    }
  } catch {
    return { ...DEFAULT_SETTINGS, ui: { ...DEFAULT_SETTINGS.ui } }
  }
}

export function saveSettings(settings: UiSettings): void {
  const dir = path.dirname(SETTINGS_PATH)
  fs.mkdirSync(dir, { recursive: true })

  const tmp = SETTINGS_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, SETTINGS_PATH)
}

export function getUiLanguage(): UiLanguage {
  return loadSettings().ui.language
}

export function setUiLanguage(lng: UiLanguage): void {
  const current = loadSettings()
  current.ui.language = lng
  saveSettings(current)
}

export function settingsFileExists(): boolean {
  try {
    const s = loadSettings()
    // settings.json exists and has a language key
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return typeof parsed?.ui?.language === 'string'
  } catch {
    return false
  }
}

// ── User mode (T-P4-023 compat — added to bridge parallel PR state) ───────────

export type UserMode = 'developer' | 'planner'

const USER_MODE_PATH = path.join(os.homedir(), '.productune', 'user-mode.json')

export function getUserMode(): UserMode | null {
  try {
    const raw = fs.readFileSync(USER_MODE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed?.mode === 'developer' || parsed?.mode === 'planner') {
      return parsed.mode as UserMode
    }
    return null
  } catch {
    return null
  }
}

export function setUserMode(mode: UserMode | null): void {
  const dir = path.dirname(USER_MODE_PATH)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = USER_MODE_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ mode }), { mode: 0o600 })
  fs.renameSync(tmp, USER_MODE_PATH)
}
