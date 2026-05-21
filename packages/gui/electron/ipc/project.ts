import { app, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { initProject, startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo } from '@productune/core'
import { writeOnboardingPending } from './onboarding'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectResult {
  kind: 'self-current' | 'self-legacy' | 'none'
  config?: any
  hints?: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect whether a directory contains a productune project (current or legacy layout).
 *
 * - 'self-current': .productune/config.json exists and is parseable.
 * - 'self-legacy':  .productune/ exists with po-state.json/briefs/po.lock/turns/ but no config.json.
 * - 'none':         No productune layout detected.
 */
function detectProductuneLayout(dir: string): DetectResult {
  const productuneDir = path.join(dir, '.productune')
  if (!fs.existsSync(productuneDir)) return { kind: 'none' }

  const configPath = path.join(productuneDir, 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { kind: 'self-current', config }
    } catch {
      // Corrupt config — treat as legacy
    }
  }

  // config.json absent — check for legacy traces
  const hints: string[] = []
  if (fs.existsSync(path.join(productuneDir, 'po-state.json'))) hints.push('po-state.json')
  if (fs.existsSync(path.join(productuneDir, 'briefs'))) hints.push('briefs/')
  if (fs.existsSync(path.join(productuneDir, 'po.lock'))) hints.push('po.lock')
  if (fs.existsSync(path.join(productuneDir, 'turns'))) hints.push('turns/')

  if (hints.length > 0) return { kind: 'self-legacy', hints }
  return { kind: 'none' }
}

function scanDescendantsForProductune(baseDir: string): { path: string; config: any }[] {
  const found: { path: string; config: any }[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const childPath = path.join(baseDir, entry.name)
    const detect = detectProductuneLayout(childPath)
    if (detect.kind === 'self-current') {
      found.push({ path: childPath, config: detect.config })
    } else if (detect.kind === 'self-legacy') {
      // Include legacy projects in descendant scan — renderer decides how to handle
      found.push({ path: childPath, config: { slug: entry.name, _legacy: true, hints: detect.hints } })
    }
  }
  return found
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('ping', () => 'pong')

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('init:project', (_event, opts: { slug: string; projectDir: string }) => {
    return initProject(opts)
  })

  ipcMain.handle('project:create', (_event, { slug, initialVersionId }: { slug: string; initialVersionId?: string }) => {
    const baseDir = path.join(os.homedir(), 'productune', 'projects')
    fs.mkdirSync(baseDir, { recursive: true })

    let projectDir = path.join(baseDir, slug)
    let suffix = 2
    while (fs.existsSync(projectDir)) {
      projectDir = path.join(baseDir, `${slug}-${suffix++}`)
    }
    fs.mkdirSync(projectDir, { recursive: true })

    const config = initProject({ slug, projectDir, initialVersionId })
    // Decision B (T-P4-101): write onboarding pending immediately after init success.
    try { writeOnboardingPending(projectDir, 'gui-create') } catch { /* non-fatal */ }
    if (process.platform === 'darwin') app.addRecentDocument(projectDir)
    return { projectDir, config }
  })

  ipcMain.handle('project:installAt', (_event, { projectDir }: { projectDir: string }) => {
    const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
    const config = initProject({ slug, projectDir })
    // Decision B (T-P4-101): write onboarding pending after install success.
    try { writeOnboardingPending(projectDir, 'install-at') } catch { /* non-fatal */ }
    if (process.platform === 'darwin') app.addRecentDocument(projectDir)
    return { projectDir, config }
  })

  // ── Project existence check (T-P4-091) ────────────────────────────────────────
  // Returns true only when the directory AND a .productune/config.json marker both exist.
  // Any exception (empty path, EPERM, etc.) → false (safe fallback).
  ipcMain.handle('project:exists', (_event, { projectDir }: { projectDir: string }): boolean => {
    try {
      if (!projectDir) return false
      return (
        fs.existsSync(projectDir) &&
        fs.existsSync(path.join(projectDir, '.productune', 'config.json'))
      )
    } catch {
      return false
    }
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

  ipcMain.handle('dialog:openFilePicker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const dir = result.filePaths[0]

    const detect = detectProductuneLayout(dir)
    if (detect.kind === 'self-current') {
      if (process.platform === 'darwin') app.addRecentDocument(dir)
      return { kind: 'self', dir, config: detect.config }
    }
    if (detect.kind === 'self-legacy') {
      return { kind: 'self-legacy', dir, hints: detect.hints }
    }

    const descendants = scanDescendantsForProductune(dir)
    if (descendants.length > 0) {
      return { kind: 'descendant', dir, descendants }
    }

    return { kind: 'none', dir }
  })

  // ── Open a known directory path without dialog (T-P4-111 — Open Recent flow) ──
  // Mirrors dialog:openFolder but accepts a pre-known path instead of showing a picker.
  ipcMain.handle('project:openKnownDir', (_event, dir: string) => {
    if (!dir) return null
    try {
      if (!fs.existsSync(dir)) return null
    } catch {
      return null
    }

    const detect = detectProductuneLayout(dir)
    if (detect.kind === 'self-current') {
      if (process.platform === 'darwin') app.addRecentDocument(dir)
      return { kind: 'self', dir, config: detect.config }
    }
    if (detect.kind === 'self-legacy') {
      return { kind: 'self-legacy', dir, hints: detect.hints }
    }

    const descendants = scanDescendantsForProductune(dir)
    if (descendants.length > 0) {
      return { kind: 'descendant', dir, descendants }
    }

    return { kind: 'none', dir }
  })

  ipcMain.handle('project:migrateLegacy', (_event, { projectDir, slug }: { projectDir: string; slug?: string }) => {
    const derivedSlug = (slug ?? path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')) || 'project'
    const config = initProject({ slug: derivedSlug, projectDir })
    if (process.platform === 'darwin') app.addRecentDocument(projectDir)
    return { projectDir, config, migrated: true }
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
}
