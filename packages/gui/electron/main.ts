import { app, BrowserWindow, dialog, shell, Menu, nativeImage, ipcMain, type MenuItemConstructorOptions } from 'electron'
import path from 'path'
import fs from 'fs'

// T-PATCH-177: macOS menu-bar Tray (persona working icon + waiting red-dot badge).
import { createTray, updateTray, destroyTray, type TrayStatePayload } from './tray'

// ── IPC module imports ────────────────────────────────────────────────────────
import { register as registerOnboarding } from './ipc/onboarding'
import { register as registerProject }    from './ipc/project'
import { register as registerTickets }    from './ipc/tickets'
import { register as registerState, stopPoStateWatch } from './ipc/state'
import { register as registerPo }         from './ipc/po'
import { register as registerMcp }        from './ipc/mcp'
import { register as registerHooks }      from './ipc/hooks'
import { register as registerSkills }     from './ipc/skills'
import { register as registerDeploy }     from './ipc/deploy'
import { register as registerSurface }    from './ipc/surface'
import { register as registerSettings }   from './ipc/settings'
import { register as registerDesign }     from './ipc/design'
import { register as registerExplorer }   from './ipc/explorer'
import { register as registerSearch }     from './ipc/search'
import { register as registerWorktree }   from './ipc/worktree'
import { register as registerArtifacts }  from './ipc/artifacts'
import { register as registerDoctrine }   from './ipc/doctrine'
import { register as registerHtml }       from './ipc/html'
import { register as registerBrowserFind } from './ipc/browserFind'
import { register as registerProjectEnv }  from './ipc/projectEnv'
import { register as registerAttachments } from './ipc/attachments'
import { installWebviewAcceptLanguage } from './locale-session'
import { startUsageWatch, stopUsageWatch, readInitialPayload } from './ipc/usageWatch'
import { register as registerTicketsWatch, stopTicketsWatch } from './ipc/ticketsWatch'
import { register as registerCostArchive, stopCostWatch } from './ipc/costArchive'
import { abortActiveTurn, isPoRunning } from './po-runner'
import { killAllSurfaceRuns } from './surface-runner'
import { getCloseToTray, getLaunchAtLogin, setLaunchAtLogin, getZoomFactor } from '@productune/core'

// T-PATCH-143: dev 모드 앱 메뉴/About/알림 소스 라벨을 "Electron"→"productune"로 통일 (app.name 첫 사용 전 호출, electron-builder.yml productName과 동일 값)
app.setName('productune')

// ── Open Recent — deferred open-file queue (T-P4-111) ─────────────────────────
// macOS may fire `open-file` before app.whenReady / before a window exists.
// Store the path and flush it once the first window finishes loading.
let deferredOpenPath: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (process.platform === 'darwin') {
    app.addRecentDocument(filePath)
  }
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-recent-project', filePath)
  } else {
    deferredOpenPath = filePath
  }
})

// ── IPC registration ──────────────────────────────────────────────────────────
registerOnboarding()
registerProject()
registerTickets()
registerTicketsWatch()
registerState()
registerPo()
registerMcp()
registerHooks()
registerSkills()
registerDeploy()
registerSurface()
registerSettings()
registerDesign()
registerExplorer()
registerSearch()
registerWorktree()
registerArtifacts()
registerDoctrine()
registerHtml()
registerBrowserFind()
registerProjectEnv()
registerAttachments()
registerCostArchive()

// T-PATCH-191: in-app browser — window.open / target=_blank on a <webview>
// (e.g. Naver's home tiles) otherwise spawn a detached popup we don't manage, so
// clicks appear to do nothing. Deny the popup and route the URL to the renderer,
// which opens it as a new in-app browser tab (preserves the current page; safe
// for OAuth popups). Same-tab <a> navigations (e.g. Google) are unaffected.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) mainWindow?.webContents.send('browser:open-url', { url })
    return { action: 'deny' }
  })
})

// ── Brand icon resolution (T-PATCH-109) ───────────────────────────────────────
// dev/non-packaged Dock + window icon. __dirname = dist-electron/; the buildResources
// dir lives at packages/gui/build/, i.e. `../build/` from here. Prefer the 1024² PNG
// master (build/icon.png), fall back to the existing build/icon.icns. fs.existsSync
// guards mean a missing asset never throws — BrowserWindow just uses the default
// Electron icon. Packaged .app/.dmg icon is still owned by electron-builder's
// mac.icon (build/icon.icns); this runtime option is the dev/Dock supplement only.
function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon.icns'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch { /* fs error — skip this candidate, fall through to default icon */ }
  }
  return undefined
}

// ── Window ────────────────────────────────────────────────────────────────────

// T-PATCH-086: module-level window ref, accessed by handleQuitRequest.
// Assigned on every createWindow() call so multi-window scenarios always track
// the most recent window (quit guard targets the last-focused window).
let mainWindow: BrowserWindow | null = null

// ── Quit guard state (T-PATCH-086) ────────────────────────────────────────────
// Two-tap pattern: first ⌘Q arms a 1.5 s window; second ⌘Q within it quits.
// quitTimer ref is cleared before each assignment → no timer leak path.
let quitPending = false
let quitTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Menu click handler that replaces the default `role: 'quit'` entry.
 * Intercepts the quit keystroke before the OS processes it so:
 *   - Single press → arms a 1.5 s guard window + shows QuitGuardToast in renderer.
 *   - Second press within window → confirms quit immediately.
 *   - If a PO turn is active (T-PATCH-081 activeChild) → shows native abort dialog.
 */
async function handleQuitRequest(): Promise<void> {
  // ── PO turn guard ─────────────────────────────────────────────────────────
  if (isPoRunning()) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Abort & Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'PO turn in progress',
      detail: 'Quitting now will abort the running dispatch. Continue?',
    })
    if (response === 0) {
      abortActiveTurn()
      app.quit()
    }
    return
  }

  // ── Two-tap hold-to-quit ──────────────────────────────────────────────────
  if (quitPending) {
    if (quitTimer) clearTimeout(quitTimer)
    quitPending = false
    app.quit()
    return
  }

  quitPending = true
  mainWindow?.webContents.send('quit:pending', { timeoutMs: 1500 })
  quitTimer = setTimeout(() => {
    quitPending = false
    quitTimer = null
    mainWindow?.webContents.send('quit:cancelled')
  }, 1500)
}

function createWindow(): BrowserWindow {
  // T-PATCH-109: resolve brand icon if present; omit the key entirely when absent
  // so Electron keeps its default icon (never throws on a missing asset).
  const appIcon = resolveAppIcon()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    ...(appIcon ? { icon: appIcon } : {}),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // T-P4-114 §D: enable <webview> tag for BrowserTab
      webviewTag: true,
    },
  })

  // T-PATCH-186: open maximized (fill the current display's work area). This is
  // the normal maximize — NOT macOS native fullscreen (no separate Space) — so
  // the 1280×800 above is just the fallback/restore size for un-maximize.
  win.maximize()

  // T-PATCH-091 R3: restore persisted zoom factor.
  // NOTE: View-menu role:zoomIn/zoomOut/resetZoom also call setZoomFactor internally
  // but do NOT persist to settings.json — this is accepted for v0.5 (T-PATCH-091 OOS).
  const zf = getZoomFactor()
  if (zf !== 1.0) win.webContents.setZoomFactor(zf)

  // Flush deferred open-file path (T-P4-111 §E queue pattern).
  // Also re-send the current usage payload so UsageBar is populated on first
  // load even though startUsageWatch()'s initial broadcast ran before any
  // window existed (T-025 fix-round-1).
  win.webContents.once('did-finish-load', () => {
    if (deferredOpenPath) {
      win.webContents.send('open-recent-project', deferredOpenPath)
      deferredOpenPath = null
    }
    const usagePayload = readInitialPayload()
    if (usagePayload) {
      win.webContents.send('productune:usage-update', usagePayload)
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // T-PATCH-086: update module-level ref so handleQuitRequest can send IPC.
  mainWindow = win

  // T-PATCH-090 R1: close-to-tray (macOS only).
  // When pref is on, intercept window close → hide instead of destroy.
  // win.hide() does NOT trigger window-all-closed, so stopUsageWatch is NOT called
  // and the PO loop stays alive. The pref is read from disk at close-time so a
  // mid-session toggle takes effect on the next close without a restart.
  // app.quit() bypasses event.preventDefault() (Electron behavior) so ⌘Q always
  // quits regardless of the pref.
  win.on('close', (event) => {
    if (process.platform === 'darwin' && getCloseToTray()) {
      event.preventDefault()
      win.hide()
      // window-all-closed does NOT fire; stopUsageWatch NOT called; PO loop stays alive.
    }
  })

  return win
}

function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        // T-PATCH-086: custom handler replaces role:'quit' so ⌘Q is intercepted
        // before the OS processes it (two-tap guard + PO-turn abort dialog).
        // Dock right-click → Quit bypasses this handler → quits directly (accepted,
        // matches Chrome behaviour; window-all-closed still fires stopUsageWatch).
        {
          label: 'Quit productune',
          accelerator: 'CmdOrCtrl+Q',
          click: handleQuitRequest,
        },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project…',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToFocused('menu:new-project'),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            const win = createWindow()
            win.webContents.once('did-finish-load', () => {
              win.webContents.send('reset-to-home')
            })
          },
        },
        { type: 'separator' },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu:open-project'),
        },
        {
          label: 'Open Recent',
          role: 'recentDocuments' as const,
          submenu: [
            {
              label: 'Clear Menu',
              role: 'clearRecentDocuments' as const,
            },
          ],
        },
        { type: 'separator' },
        // T-PATCH-086: custom handler (non-macOS) — same two-tap guard via menu.
        ...(isMac ? [] : [{
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: handleQuitRequest,
        }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
        { type: 'separator' as const },
        // T-PATCH-046: open inline find bar in the active pane
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToFocused('menu:find'),
        },
        // T-PATCH-066: Tab navigation — hidden accelerators; visible:false items still fire
        // window-wide (incl. when keyboard focus is inside the sandboxed OOPIF iframe).
        // This is the PROVEN mechanism (same as cmd+F above). before-input-event was removed.
        { label: 'New Tab',     accelerator: 'CmdOrCtrl+T',  visible: false, click: () => sendToFocused('menu:new-tab')    },
        { label: 'Close Tab',   accelerator: 'CmdOrCtrl+W',  visible: false, click: () => sendToFocused('menu:close-tab')  },
        { label: 'Split Right', accelerator: 'CmdOrCtrl+\\', visible: false, click: () => sendToFocused('menu:split-right') },
        { label: 'Quick Open',  accelerator: 'CmdOrCtrl+P',  visible: false, click: () => sendToFocused('menu:quick-open') },
        // T-PATCH-196: in-app browser shortcuts — hidden accelerators (visible:false fires
        // window-wide even when focus is inside the sandboxed webview OOPIF).
        { label: 'Reopen Tab',    accelerator: 'CmdOrCtrl+Shift+T', visible: false, click: () => sendToFocused('menu:reopen-tab')   },
        { label: 'Focus URL Bar', accelerator: 'CmdOrCtrl+L',       visible: false, click: () => sendToFocused('menu:focus-url')    },
        { label: 'Nav Back',      accelerator: 'CmdOrCtrl+[',       visible: false, click: () => sendToFocused('menu:nav-back')     },
        { label: 'Nav Forward',   accelerator: 'CmdOrCtrl+]',       visible: false, click: () => sendToFocused('menu:nav-forward')  },
        { label: 'Cycle Tab Next', accelerator: 'Ctrl+Tab',         visible: false, click: () => sendToFocusedData('menu:cycle-tab', { dir: 1 })  },
        { label: 'Cycle Tab Prev', accelerator: 'Ctrl+Shift+Tab',   visible: false, click: () => sendToFocusedData('menu:cycle-tab', { dir: -1 }) },
        // cmd+1..9 — single channel menu:goto-tab, index in payload
        ...Array.from({ length: 9 }, (_, i): MenuItemConstructorOptions => ({
          label: `Go to Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          visible: false,
          click: () => sendToFocusedData('menu:goto-tab', { index: i + 1 }),
        })),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'productune docs',
          click: () => shell.openExternal('https://github.com/shawn-kim-axz/productune'),
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

function sendToFocused(channel: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.webContents.send(channel)
}

function sendToFocusedData(channel: string, data: unknown): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.webContents.send(channel, data)
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu())

  // T-PATCH-109 §4.b QA-fix: macOS ignores BrowserWindow.icon for the Dock —
  // the Dock tile must be set explicitly via app.dock.setIcon. resolveAppIcon()
  // reuses the existsSync guard so a missing asset never throws; createFromPath
  // returns an empty image on a bad path, so we skip empty results too. Packaged
  // .app/.dmg Dock icon is still owned by electron-builder's mac.icon — this is the
  // dev/non-packaged Dock supplement (win/linux keep using BrowserWindow.icon).
  if (process.platform === 'darwin') {
    const iconPath = resolveAppIcon()
    if (iconPath) {
      const dockImage = nativeImage.createFromPath(iconPath)
      if (!dockImage.isEmpty()) app.dock?.setIcon(dockImage)
    }
  }

  // T-PATCH-187: make the in-app browser/Preview webview request the UI language
  // so embedded sites (e.g. Kakao OAuth) render in ko, not default en-US.
  installWebviewAcceptLanguage()

  startUsageWatch()
  createWindow()

  // T-PATCH-177: create the menu-bar Tray. getWindow returns the live main
  // window (mainWindow is reassigned on every createWindow); requestQuit reuses
  // handleQuitRequest so tray Quit keeps the PO-turn guard + two-tap semantics.
  createTray({
    getWindow: () => mainWindow,
    requestQuit: () => { void handleQuitRequest() },
  })

  // T-PATCH-177: renderer (personaPresence SoT) pushes a derived snapshot here.
  // fire-and-forget (send, not invoke). Defensive shape check so a malformed
  // payload never throws in main.
  ipcMain.on('tray:setState', (_e, payload: TrayStatePayload) => {
    if (payload && typeof payload === 'object') updateTray(payload)
  })

  // T-PATCH-090 R1: re-show a window that was hidden by close-to-tray.
  // If no windows exist, create a new one (normal cold-launch path).
  app.on('activate', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) {
      createWindow()
    } else {
      const [win] = wins
      if (!win.isVisible()) win.show()  // re-show hidden window (close-to-tray)
    }
  })

  // T-PATCH-090 R2: OS login-item reconciliation.
  // Runs after registerSettings() (IPC registered above). OS value is authoritative —
  // the user may have toggled in System Settings directly between launches.
  // getLoginItemSettings may throw on non-supported platforms — caught silently.
  try {
    const osLogin = app.getLoginItemSettings().openAtLogin
    if (osLogin !== getLaunchAtLogin()) setLaunchAtLogin(osLogin)
  } catch { /* non-mac or unsupported — silently skip */ }
})

// T-PATCH-090 R1: this event fires only on genuine window destruction (win.destroy /
// app.quit). When close-to-tray is on (mac), win.hide() is used — NOT destroy — so
// this handler does NOT fire on tray-hide. It fires only when the user truly quits
// (⌘Q two-tap, Dock→Quit, etc.), which bypasses event.preventDefault() in the close
// handler. stopUsageWatch is therefore called only on a real quit — never on hide.
app.on('window-all-closed', () => {
  stopUsageWatch()
  stopCostWatch()
  stopTicketsWatch()
  stopPoStateWatch()
  // T-PATCH-177: tear down the Tray on real quit (not on close-to-tray hide,
  // which never fires window-all-closed).
  destroyTray()
  // T-PATCH-159 D5: SIGTERM any in-flight surface build/smoke runs on quit.
  killAllSurfaceRuns()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
