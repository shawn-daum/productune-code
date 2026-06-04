import { app, BrowserWindow, shell, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'path'

// ── IPC module imports ────────────────────────────────────────────────────────
import { register as registerOnboarding } from './ipc/onboarding'
import { register as registerProject }    from './ipc/project'
import { register as registerTickets }    from './ipc/tickets'
import { register as registerState }      from './ipc/state'
import { register as registerPo }         from './ipc/po'
import { register as registerMcp }        from './ipc/mcp'
import { register as registerHooks }      from './ipc/hooks'
import { register as registerSkills }     from './ipc/skills'
import { register as registerDeploy }     from './ipc/deploy'
import { register as registerSettings }   from './ipc/settings'
import { register as registerDesign }     from './ipc/design'
import { register as registerExplorer }   from './ipc/explorer'
import { register as registerSearch }     from './ipc/search'
import { register as registerWorktree }   from './ipc/worktree'
import { register as registerArtifacts }  from './ipc/artifacts'
import { startUsageWatch, stopUsageWatch, readInitialPayload } from './ipc/usageWatch'

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
registerState()
registerPo()
registerMcp()
registerHooks()
registerSkills()
registerDeploy()
registerSettings()
registerDesign()
registerExplorer()
registerSearch()
registerWorktree()
registerArtifacts()

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // T-P4-114 §D: enable <webview> tag for BrowserTab
      webviewTag: true,
    },
  })

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
        { role: 'quit' as const },
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
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },
    { role: 'editMenu' },
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

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu())
  startUsageWatch()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopUsageWatch()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
