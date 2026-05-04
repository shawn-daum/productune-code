import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { initProject, startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo } from '@productune/core'

const execFileAsync = promisify(execFile)

function createWindow(): void {
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
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('ping', () => 'pong')

ipcMain.handle('init:project', (_event, opts: { slug: string; mode: 'planner' | 'developer'; projectDir: string }) => {
  return initProject(opts)
})

ipcMain.handle('project:create', (_event, { slug, mode }: { slug: string; mode: 'planner' | 'developer' }) => {
  const baseDir = path.join(os.homedir(), 'productune', 'projects')
  fs.mkdirSync(baseDir, { recursive: true })

  let projectDir = path.join(baseDir, slug)
  let suffix = 2
  while (fs.existsSync(projectDir)) {
    projectDir = path.join(baseDir, `${slug}-${suffix++}`)
  }
  fs.mkdirSync(projectDir, { recursive: true })

  const config = initProject({ slug, mode, projectDir })
  return { projectDir, config }
})

ipcMain.handle('projects:list', () => {
  const baseDir = path.join(os.homedir(), 'productune', 'projects')
  if (!fs.existsSync(baseDir)) return []
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
  const projects: Array<{ slug: string; mode: string; created_at: string; path: string }> = []
  for (const entry of entries) {
    const configPath = path.join(baseDir, entry.name, '.productune', 'config.json')
    if (!fs.existsSync(configPath)) continue
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      projects.push({ ...cfg, path: path.join(baseDir, entry.name) })
    } catch {}
  }
  return projects
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
})

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]
  const configPath = path.join(dir, '.productune', 'config.json')
  const hasProductune = fs.existsSync(configPath)
  let config = null
  if (hasProductune) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch {}
  }
  return { dir, hasProductune, config }
})

ipcMain.handle('github:checkToken', () => {
  return loadCredentials()
})

ipcMain.handle('github:startDeviceFlow', async (_event, clientId: string) => {
  return startDeviceFlow(clientId)
})

ipcMain.handle('github:pollDeviceFlow', async (_event, { clientId, deviceCode, interval }: { clientId: string; deviceCode: string; interval: number }) => {
  return pollDeviceFlow(clientId, deviceCode, interval)
})

ipcMain.handle('github:createRepo', async (_event, { token, slug }: { token: string; slug: string }) => {
  return createPrivateRepo(token, slug)
})

ipcMain.handle('github:setupRemote', async (_event, { projectDir, cloneUrl }: { projectDir: string; cloneUrl: string }) => {
  try {
    await execFileAsync('git', ['init'], { cwd: projectDir })
    await execFileAsync('git', ['remote', 'add', 'origin', cloneUrl], { cwd: projectDir })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
