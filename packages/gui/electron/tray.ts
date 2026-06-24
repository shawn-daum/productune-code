/**
 * electron/tray.ts — macOS menu-bar Tray surface (T-PATCH-177).
 *
 * Surface decision (designer plan-first): the user's "메뉴막대" = macOS top menu
 * bar = a `Tray`. The Dock tile is already owned by the brand icon (T-PATCH-109)
 * and the Dock badge is text-only, so persona images can only live on a Tray.
 *
 * The renderer's personaPresence store is the SoT for "which persona is working"
 * and "are we waiting for user input"; it pushes a derived snapshot here over the
 * `tray:setState` IPC (see src/store/trayBridge.ts). This module only renders that
 * snapshot — it never re-derives state.
 *
 * Asset model: build-time PNGs under build/tray/ (frame-0 crop of each persona
 * work sprite + a brand-neutral idle icon + a brand+red-dot waiting icon). No
 * runtime compositing (nativeImage has no overlay API) and no animation (macOS
 * HIG discourages it; setImage churn flickers). Persona + waiting icons stay
 * COLOR (not template) so each persona keeps its identity hue and the waiting
 * red dot survives; the brand-neutral idle `{}` is a TEMPLATE image (T-PATCH-257)
 * so macOS auto-tints it to the menu-bar foreground (visible on dark + light).
 *
 * Robustness: a missing asset never throws — resolveTrayIcon guards with
 * fs.existsSync and returns null, and updateTray no-ops on a null image (mirrors
 * the T-PATCH-109 brand-icon pattern).
 */

import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'

// Persona id mirrors src/store/personaPresence.ts PersonaId (kept as a local
// string-union to avoid importing renderer code into the main process).
type PersonaId = 'po' | 'designer' | 'dev' | 'qa'

export interface TrayStatePayload {
  /** working persona, most-recent-first; null when none working. */
  activePersona: PersonaId | null
  /** all idle AND PO turn ended (user input awaited). */
  waiting: boolean
}

const PERSONA_LABELS: Record<PersonaId, string> = {
  po: 'PO',
  designer: 'Designer',
  dev: 'Developer',
  qa: 'QA',
}

// ── Module state ───────────────────────────────────────────────────────────────
let tray: Tray | null = null
// Dedupe: remember the last asset name we set so identical updates are no-ops
// (avoids menu-bar icon churn/flicker on repeated equal pushes).
let lastIconKey: string | null = null

// Lazily-resolved accessors injected by createTray so this module stays
// decoupled from main.ts internals (window ref + quit handler).
let getWindow: (() => BrowserWindow | null) | null = null
let requestQuit: (() => void) | null = null

/**
 * Resolve a tray asset path. __dirname = dist-electron/ at runtime; assets live
 * at packages/gui/build/tray/ (dev = `../build/tray/`). Packaged builds ship the
 * dir to resources/build/tray/ (see electron-builder.yml extraResources), so we
 * also probe process.resourcesPath. Returns null when no candidate exists —
 * callers must treat null as "skip" and never throw.
 */
function resolveTrayIcon(name: string): string | null {
  const candidates = [
    path.join(__dirname, '../build/tray', `${name}.png`),
    // packaged fallback (extraResources → <app>/Contents/Resources/build/tray/)
    path.join(process.resourcesPath ?? '', 'build', 'tray', `${name}.png`),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* fs error on this candidate — try the next */
    }
  }
  return null
}

/** Pick the asset key for a payload (priority: working persona > waiting > idle). */
function iconKeyFor(payload: TrayStatePayload): string {
  if (payload.activePersona) return `${payload.activePersona}-22`
  if (payload.waiting) return 'tray-waiting-22'
  return 'tray-idle-22'
}

function tooltipFor(payload: TrayStatePayload): string {
  if (payload.activePersona) {
    return `productune — ${PERSONA_LABELS[payload.activePersona]} working`
  }
  if (payload.waiting) return 'productune — awaiting your input'
  return 'productune'
}

function buildContextMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Show productune',
      click: () => {
        const win = getWindow?.()
        if (win && !win.isDestroyed()) {
          if (!win.isVisible()) win.show()
          win.focus()
        }
      },
    },
    { type: 'separator' },
    {
      // Reuse the main-process quit handler so the PO-turn guard + two-tap
      // semantics (T-PATCH-086) apply to tray-initiated quits too (data safety —
      // designer recommendation). main wires requestQuit = handleQuitRequest.
      label: 'Quit productune',
      click: () => requestQuit?.(),
    },
  ])
}

/**
 * Create the Tray once. `accessors.getWindow` returns the live main window (or
 * null) and `accessors.requestQuit` runs the guarded quit flow. Idempotent: a
 * second call is a no-op. Boots into the neutral idle icon.
 */
export function createTray(accessors: {
  getWindow: () => BrowserWindow | null
  requestQuit: () => void
}): void {
  if (tray) return
  getWindow = accessors.getWindow
  requestQuit = accessors.requestQuit

  // Seed image: idle (neutral). nativeImage.createFromPath on a missing/bad path
  // returns an empty image; Tray accepts it (shows nothing until first update).
  const idlePath = resolveTrayIcon('tray-idle-22')
  const seed = idlePath ? nativeImage.createFromPath(idlePath) : nativeImage.createEmpty()
  // T-PATCH-257: the idle `{}` mark is brand-neutral (no signal hue to preserve),
  // and its purple→teal gradient was invisible against the dark macOS menu bar.
  // Render it as a TEMPLATE image so macOS auto-tints it to the menu-bar
  // foreground — white on a dark bar, black on a light bar — visible in both
  // appearances (a fixed-white PNG would vanish on a light menu bar). Persona
  // working icons stay colored (set below in updateTray) to keep their identity.
  seed.setTemplateImage(true)

  tray = new Tray(seed)
  lastIconKey = 'tray-idle-22'
  tray.setToolTip('productune')
  tray.setContextMenu(buildContextMenu())
  // Left-click also reveals the window (parity with the menu's Show item).
  tray.on('click', () => {
    const win = getWindow?.()
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })
}

/** Apply a derived persona snapshot. No-op when the tray is absent or the
 *  resolved icon key is unchanged (dedupe) or the asset is missing. */
export function updateTray(payload: TrayStatePayload): void {
  if (!tray) return
  const key = iconKeyFor(payload)
  if (key !== lastIconKey) {
    const iconPath = resolveTrayIcon(key)
    if (iconPath) {
      const img = nativeImage.createFromPath(iconPath)
      if (!img.isEmpty()) {
        // T-PATCH-257: idle `{}` → template (auto white/black per menu-bar
        // appearance). The waiting icon now ships white braces + a colored red
        // dot, and persona icons carry identity hues, so both stay non-template
        // (template would strip the red dot / persona color to a flat mask).
        img.setTemplateImage(key === 'tray-idle-22')
        tray.setImage(img)
        lastIconKey = key
      }
      // missing/empty asset → keep the previous image, never throw.
    }
  }
  // Tooltip is cheap; refresh it even when the icon didn't change so a
  // persona→waiting transition that maps to the same image still updates text.
  tray.setToolTip(tooltipFor(payload))
}

/** Destroy the Tray on quit. Safe to call when absent. */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
  lastIconKey = null
  getWindow = null
  requestQuit = null
}
