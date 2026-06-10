import fs from 'fs'
import path from 'path'
import os from 'os'

export type UiLanguage = 'en' | 'ko'

export interface IntegrationsSettings {
  vercel?: {
    /** Vercel API token (OQ-T022-1 (b): stored in settings.json, NOT in env). */
    token?: string
    /** Last validated timestamp (ISO 8601). */
    validatedAt?: string
  }
}

// ── T-PATCH-083: notification toggle settings ─────────────────────────────────

/**
 * Per-user notification toggle settings, persisted under ui.notifications in
 * ~/.productune/settings.json. All fields default true — a missing key is
 * treated the same as true (never crash on old settings files, AC-3).
 */
export interface NotificationSettings {
  /** Master switch — when false, no notification type fires regardless of per-type values. */
  enabled: boolean
  /** Per-type switches. Each defaults true; a type fires only when enabled AND its key is true. */
  types: {
    'dispatch-done': boolean
    'escalation-raised': boolean
    'phase-gate-entry': boolean
    'po-turn-done': boolean
  }
}

export interface UiSettings {
  version: 1
  ui: {
    language: UiLanguage
    notifications: NotificationSettings
  }
  integrations?: IntegrationsSettings
}

const SETTINGS_PATH = path.join(os.homedir(), '.productune', 'settings.json')

const DEFAULT_SETTINGS: UiSettings = {
  version: 1,
  ui: {
    language: 'en',
    notifications: {
      enabled: true,
      types: {
        'dispatch-done': true,
        'escalation-raised': true,
        'phase-gate-entry': true,
        'po-turn-done': true,
      },
    },
  },
}

/**
 * AC-3: missing or non-false value → true; exactly `false` → false.
 * Ensures old settings.json files without the key behave as "all-on".
 */
function boolDefault(v: unknown): boolean {
  return v !== false
}

/** AC-3: deep-merge raw persisted notifications object; any missing key defaults true. */
function mergeNotifications(raw: any): NotificationSettings {
  const t = raw?.types
  return {
    enabled: boolDefault(raw?.enabled),
    types: {
      'dispatch-done': boolDefault(t?.['dispatch-done']),
      'escalation-raised': boolDefault(t?.['escalation-raised']),
      'phase-gate-entry': boolDefault(t?.['phase-gate-entry']),
      'po-turn-done': boolDefault(t?.['po-turn-done']),
    },
  }
}

export function loadSettings(): UiSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    // Read-merge: preserve defaults for missing/unknown fields; integrations preserved
    // to prevent data loss when any helper round-trips through load→save (AC-3).
    return {
      version: 1,
      ui: {
        language: parsed?.ui?.language === 'ko' ? 'ko' : 'en',
        notifications: mergeNotifications(parsed?.ui?.notifications),
      },
      ...(parsed?.integrations !== undefined ? { integrations: parsed.integrations } : {}),
    }
  } catch {
    return {
      version: 1,
      ui: {
        language: 'en',
        notifications: {
          enabled: true,
          types: {
            'dispatch-done': true,
            'escalation-raised': true,
            'phase-gate-entry': true,
            'po-turn-done': true,
          },
        },
      },
    }
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

// ── T-PATCH-083: notification settings helpers ────────────────────────────────

/**
 * Returns the full notification toggle settings from ~/.productune/settings.json.
 * Defaults all-on when the key is absent (AC-3 — backcompat with old settings files).
 */
export function getNotificationSettings(): NotificationSettings {
  return loadSettings().ui.notifications
}

/**
 * Persists the full notification toggle settings to ~/.productune/settings.json.
 * Uses the same atomic-tmp-rename pattern as `setUiLanguage`.
 */
export function setNotificationSettings(n: NotificationSettings): void {
  const current = loadSettings()
  current.ui.notifications = n
  saveSettings(current)
}

// ── Vercel integration token (OQ-T022-1 (b) — "외부 연결" sub-tab) ───────────

/**
 * Returns the Vercel API token stored in settings.json integrations.vercel.token.
 * Returns null if not set.
 */
export function getVercelToken(): string | null {
  const s = loadSettings()
  return s.integrations?.vercel?.token ?? null
}

/**
 * Stores the Vercel API token in settings.json integrations.vercel.token.
 * Pass null to clear the token.
 */
export function setVercelToken(token: string | null): void {
  const s = loadSettings()
  if (!s.integrations) s.integrations = {}
  if (!s.integrations.vercel) s.integrations.vercel = {}
  if (token) {
    s.integrations.vercel.token = token
    s.integrations.vercel.validatedAt = undefined
  } else {
    delete s.integrations.vercel.token
    delete s.integrations.vercel.validatedAt
  }
  saveSettings(s)
}

/**
 * Mark the Vercel token as validated at the current timestamp.
 */
export function markVercelTokenValidated(): void {
  const s = loadSettings()
  if (!s.integrations) s.integrations = {}
  if (!s.integrations.vercel) s.integrations.vercel = {}
  s.integrations.vercel.validatedAt = new Date().toISOString()
  saveSettings(s)
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

