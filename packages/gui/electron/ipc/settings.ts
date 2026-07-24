import { app, ipcMain, Notification, BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { setWebviewAcceptLanguage } from '../locale-session'
import {
  getPoSessionConfig,
  setPoSessionOverride,
  type PoSessionConfig,
} from '../po-session-config'
import {
  getUiLanguage,
  setUiLanguage,
  getAudienceMode,
  setAudienceMode,
  settingsFileExists,
  loadRules,
  saveRules,
  getVercelToken,
  setVercelToken,
  getNotificationSettings,
  setNotificationSettings,
  getCloseToTray,
  setCloseToTray,
  getLaunchAtLogin,
  setLaunchAtLogin,
  getZoomFactor,
  setZoomFactor,
  getStatusBarVisible,
  setStatusBarVisible,
} from '@productune/core'
import type { UiLanguage, AudienceMode, GitRules, NotificationSettings } from '@productune/core'
// T-420: read-only reference to the hook roster SoT (T-414) to name the
// audience-inject hook basename, NOT to fs-read the file at runtime — same
// static ES module import as onboarding.ts's HOOK_MANIFEST (see that file's
// comment): Vite/esbuild inlines this JSON into dist-electron/main.js at BUILD
// time, so the packaged app (no Resources/core since T-311) never needs the
// file on disk. Do not edit hook-manifest.json from here — it derives.
import hookManifestJson from '../../../core/scripts/hook-manifest.json'

// ── T-PATCH-091 R3: apply zoom factor to every open window ───────────────────
// Module-private. Called by the setZoomFactor handler after persisting the value
// so the change is immediately visible in all open BrowserWindow instances.
function applyZoomToAllWindows(factor: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.setZoomFactor(factor)
    }
  }
}

// ── T-PATCH-090: login-item sync helper ───────────────────────────────────────
// Non-MAS Electron only. MAS requires SMAppService (macOS 13+) — out of scope.
function syncLoginItem(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch { /* silently skip on platforms that don't support it */ }
}
import { fireNotification } from '../notifications'

// ── Persona-spec edit (v0.5 B1 / T-017) ──────────────────────────────────────
// Persona agent specs live at ~/.claude/agents/<id>.md. Only the known
// productune personas are addressable — guards against arbitrary path writes.
//
// T-285 (adapter A2): `prdt-*` ids registered alongside legacy `pdt-*` —
// coexistence, not a replacement, so a prdt project's Persona Tier Editor can
// address its own agent spec files too.
const PERSONA_SPEC_IDS = new Set([
  'pdt-po', 'pdt-designer', 'pdt-developer', 'pdt-qa',
  'prdt-po', 'prdt-designer', 'prdt-developer', 'prdt-qa',
])

function personaSpecPath(personaId: string): string | null {
  if (!PERSONA_SPEC_IDS.has(personaId)) return null
  return path.join(os.homedir(), '.claude', 'agents', `${personaId}.md`)
}

// ── Audience hook registration check (T-420) ─────────────────────────────────
// v1.5 review #8: on a version-skewed machine (GUI newer than the ~/.prdt
// mirror — e.g. install.sh hasn't been re-run since T-326/T-413 added the
// audience hook), Settings' audience toggle still writes ~/.prdt/audience-mode
// and shows "applies next session" — but prdt-audience-inject.sh never runs,
// so the setting is silently inert. Detection: is the audience-inject hook's
// basename (from the SAME hook-manifest.json SoT onboarding.ts derives from)
// actually present as a registered command in ~/.claude/settings.json? This is
// intentionally narrower than onboarding.ts's checkPrdtHooksStatus (which
// requires ALL 6 prdt hooks) — a missing UNRELATED hook (e.g. overrides-inject)
// must not make this section lie about the audience hook specifically.
interface HookManifestShape {
  basenames: readonly string[]
}
const HOOK_MANIFEST = hookManifestJson as unknown as HookManifestShape
const AUDIENCE_HOOK_BASENAME =
  HOOK_MANIFEST.basenames.find((b) => b.includes('audience')) ?? 'prdt-audience-inject.sh'

/** Read-only, never writes. `homeDir` is test-only (defaults to os.homedir()). */
export function checkAudienceHookRegistered(homeDir: string = os.homedir()): boolean {
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  if (!fs.existsSync(settingsPath)) return false
  let settings: any
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return false
  }
  for (const entries of Object.values((settings?.hooks ?? {}) as Record<string, any>)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        if (typeof hook?.command === 'string' && hook.command.includes(AUDIENCE_HOOK_BASENAME)) return true
      }
    }
  }
  return false
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('settings:getUiLanguage', (): UiLanguage => {
    return getUiLanguage()
  })

  ipcMain.handle('settings:setUiLanguage', (_event, lng: UiLanguage): { ok: boolean; error?: string } => {
    try {
      setUiLanguage(lng)
      // T-PATCH-187: keep the in-app browser/Preview webview's Accept-Language in
      // sync so embedded sites follow a live language switch (no restart needed).
      setWebviewAcceptLanguage(lng)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('settings:hasLanguagePref', (): boolean => {
    return settingsFileExists()
  })

  // ── Audience mode IPC (T-326) ────────────────────────────────────────────────
  // Per-USER register of the PO's conversational output — persisted as one
  // token at ~/.prdt/audience-mode (core settings/audience-mode.ts), where the
  // prdt-audience-inject.sh SessionStart hook reads it. This is the PROSE
  // injection path; fixed UI strings stay on the i18n path (src/locales).
  ipcMain.handle('settings:getAudienceMode', (): AudienceMode => {
    return getAudienceMode()
  })

  ipcMain.handle('settings:setAudienceMode', (_event, mode: AudienceMode): { ok: boolean; error?: string } => {
    try {
      if (mode !== 'planner' && mode !== 'developer') {
        return { ok: false, error: `unknown audience mode: ${String(mode)}` }
      }
      setAudienceMode(mode)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  // T-420: lets the Settings audience section warn when the toggle it just
  // saved won't take effect until `prdt update` re-runs install.sh on this
  // machine (version-skew — see checkAudienceHookRegistered's comment above).
  ipcMain.handle('settings:checkAudienceHookRegistered', (): boolean => {
    return checkAudienceHookRegistered()
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

  // ── Notification settings IPC (T-PATCH-083) ───────────────────────────────────
  ipcMain.handle('settings:getNotifications', (): NotificationSettings => {
    return getNotificationSettings()
  })

  ipcMain.handle(
    'settings:setNotifications',
    (_event, n: NotificationSettings): { ok: boolean; error?: string } => {
      try {
        setNotificationSettings(n)
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown error' }
      }
    },
  )

  // ── Close-to-tray + launch-at-login IPC (T-PATCH-090) ───────────────────────
  ipcMain.handle('settings:getCloseToTray', (): boolean => {
    return getCloseToTray()
  })

  ipcMain.handle('settings:setCloseToTray', (_event, enabled: boolean): { ok: boolean; error?: string } => {
    try {
      setCloseToTray(enabled)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('settings:getLaunchAtLogin', (): boolean => {
    return getLaunchAtLogin()
  })

  ipcMain.handle('settings:setLaunchAtLogin', (_event, enabled: boolean): { ok: boolean; error?: string } => {
    try {
      setLaunchAtLogin(enabled)
      syncLoginItem(enabled)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  // ── Zoom factor IPC (T-PATCH-091 R3) ─────────────────────────────────────────
  ipcMain.handle('settings:getZoomFactor', (): number => {
    return getZoomFactor()
  })

  ipcMain.handle('settings:setZoomFactor', (_event, factor: number): { ok: boolean; error?: string } => {
    try {
      setZoomFactor(factor)
      // Apply to all open windows immediately so the change is visible without reload.
      applyZoomToAllWindows(factor)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  // ── Status bar visibility IPC (T-PATCH-091 R4) ───────────────────────────────
  ipcMain.handle('settings:getStatusBarVisible', (): boolean => {
    return getStatusBarVisible()
  })

  ipcMain.handle('settings:setStatusBarVisible', (_event, visible: boolean): { ok: boolean; error?: string } => {
    try {
      setStatusBarVisible(visible)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  // ── Test notification IPC (T-PATCH-089) ───────────────────────────────────────
  // Fires a real notification bypassing the focus gate — explicit user intent.
  // Returns { shown, reason? }; reason only present when shown===false.
  // Never throws — catch ensures graceful degradation in all renderer paths.
  ipcMain.handle(
    'notifications:fireTest',
    (): { shown: boolean; reason?: 'unsupported' | 'toggle' } => {
      try {
        const shown = fireNotification(
          {
            kind: 'po-turn-done',
            title: 'productune',
            body: 'Test notification — notifications are working.',
            route: { surface: 'chat' },
          },
          { bypassFocusGate: true },
        )
        if (!shown) {
          const reason: 'unsupported' | 'toggle' = !Notification.isSupported()
            ? 'unsupported'
            : 'toggle'
          return { shown: false, reason }
        }
        return { shown: true }
      } catch {
        return { shown: false }
      }
    },
  )

  // ── Platform (T-PATCH-089) ────────────────────────────────────────────────────
  // Exposes process.platform to the renderer so the macOS-only deep link is
  // gated correctly without process access in the sandboxed renderer context.
  ipcMain.handle('settings:getPlatform', (): string => {
    return process.platform
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

  // ── PO session model/effort override IPC (T-310) ─────────────────────────────
  // prdt projects only (posession config's own detectProjectKind gate) — a legacy
  // `.productune` project always resolves { supported:false } and a set() call
  // there is refused (no write to the legacy path).
  ipcMain.handle('posession:getConfig', (_event, projectDir: string): PoSessionConfig => {
    return getPoSessionConfig(projectDir)
  })

  ipcMain.handle(
    'posession:setOverride',
    (
      _event,
      projectDir: string,
      next: { model?: string | null; effort?: string | null },
    ): { ok: boolean; error?: string } => {
      return setPoSessionOverride(projectDir, next ?? {})
    },
  )

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

  // ── Long-term memory read (v0.5 T-PATCH-009 #11) ─────────────────────────────
  // Reads a Tier-2 long-term memory file (~/.productune/<persona>/habit.md) for the
  // PersonaDefTab viewer. Expands `~`, then guards the resolved path stays inside
  // ~/.productune and is a .md file — rejects traversal / arbitrary reads.
  ipcMain.handle(
    'memory:readFile',
    (_event, rawPath: string): { ok: boolean; content?: string; exists?: boolean; error?: string } => {
      if (!rawPath) return { ok: false, error: 'path is required' }
      const productuneRoot = path.join(os.homedir(), '.productune')
      const expanded = rawPath.startsWith('~/')
        ? path.join(os.homedir(), rawPath.slice(2))
        : rawPath
      const resolved = path.resolve(expanded)
      if (resolved !== productuneRoot && !resolved.startsWith(productuneRoot + path.sep)) {
        return { ok: false, error: 'path outside ~/.productune rejected' }
      }
      if (path.extname(resolved).toLowerCase() !== '.md') {
        return { ok: false, error: 'only .md files allowed' }
      }
      try {
        if (!fs.existsSync(resolved)) return { ok: true, content: '', exists: false }
        return { ok: true, content: fs.readFileSync(resolved, 'utf-8'), exists: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    },
  )
}
