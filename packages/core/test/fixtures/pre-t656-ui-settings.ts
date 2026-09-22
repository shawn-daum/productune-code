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
    /** T-PATCH-090 R1: hide window on close instead of quitting (mac only). Default false. */
    closeToTray: boolean
    /** T-PATCH-090 R2: launch productune when the user logs in. Default false. */
    launchAtLogin: boolean
    /** T-PATCH-091 R3: webContents zoom factor [0.8, 1.5]. Default 1.0. */
    zoomFactor: number
    /** T-PATCH-091 R4: show/hide StatusBar (28 px bottom strip). Default true. */
    statusBarVisible: boolean
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
    closeToTray: false,
    launchAtLogin: false,
    zoomFactor: 1.0,
    statusBarVisible: true,
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

    // T-PATCH-091 R3: clamp zoomFactor to [0.8, 1.5]; corrupt/missing → 1.0.
    const rawZoom = parsed?.ui?.zoomFactor
    const zoomFactor =
      typeof rawZoom === 'number' && rawZoom >= 0.8 && rawZoom <= 1.5 ? rawZoom : 1.0

    return {
      version: 1,
      ui: {
        language: parsed?.ui?.language === 'ko' ? 'ko' : 'en',
        notifications: mergeNotifications(parsed?.ui?.notifications),
        // T-PATCH-090: === true (NOT boolDefault) — default OFF; missing key → false.
        closeToTray:   parsed?.ui?.closeToTray   === true,
        launchAtLogin: parsed?.ui?.launchAtLogin === true,
        // T-PATCH-091 R3: clamped above; corrupt value resets to 1.0.
        zoomFactor,
        // T-PATCH-091 R4: boolDefault — missing key → true; explicit false → false.
        statusBarVisible: boolDefault(parsed?.ui?.statusBarVisible),
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
        closeToTray: false,
        launchAtLogin: false,
        zoomFactor: 1.0,
        statusBarVisible: true,
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

// ── T-PATCH-090: close-to-tray + launch-at-login helpers ─────────────────────

/**
 * Returns the closeToTray preference. Default false (must be explicitly opted in).
 */
export function getCloseToTray(): boolean {
  return loadSettings().ui.closeToTray
}

/**
 * Persists the closeToTray preference.
 * Uses the same atomic-tmp-rename pattern as `setUiLanguage`.
 */
export function setCloseToTray(enabled: boolean): void {
  const current = loadSettings()
  current.ui.closeToTray = enabled
  saveSettings(current)
}

/**
 * Returns the launchAtLogin preference. Default false.
 */
export function getLaunchAtLogin(): boolean {
  return loadSettings().ui.launchAtLogin
}

/**
 * Persists the launchAtLogin preference.
 * Uses the same atomic-tmp-rename pattern as `setUiLanguage`.
 */
export function setLaunchAtLogin(enabled: boolean): void {
  const current = loadSettings()
  current.ui.launchAtLogin = enabled
  saveSettings(current)
}

// ── T-PATCH-091 R3: zoom factor helpers ───────────────────────────────────────

/**
 * Returns the persisted webContents zoom factor.
 * Range: [0.8, 1.5]. Default 1.0 (no zoom).
 */
export function getZoomFactor(): number {
  return loadSettings().ui.zoomFactor
}

/**
 * Persists the webContents zoom factor.
 * Clamps to [0.8, 1.5] before writing to guard against callers passing
 * out-of-range values. Uses the same atomic-tmp-rename pattern.
 */
export function setZoomFactor(factor: number): void {
  const clamped = Math.min(1.5, Math.max(0.8, factor))
  const current = loadSettings()
  current.ui.zoomFactor = clamped
  saveSettings(current)
}

// ── T-PATCH-091 R4: status bar visibility helpers ─────────────────────────────

/**
 * Returns whether the StatusBar is visible. Default true.
 */
export function getStatusBarVisible(): boolean {
  return loadSettings().ui.statusBarVisible
}

/**
 * Persists the StatusBar visibility preference.
 */
export function setStatusBarVisible(visible: boolean): void {
  const current = loadSettings()
  current.ui.statusBarVisible = visible
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

