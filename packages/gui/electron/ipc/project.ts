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
  kind: 'self-current' | 'self-legacy' | 'self-healable' | 'none'
  config?: any
  hints?: string[]
  /** Evidence that triggered self-healable classification. Internal — normalized before leaving main process. */
  healEvidence?: string[]
}

export interface RecentProjectEntry {
  slug: string
  projectDir: string
  openedAt: string  // ISO timestamp
}

// T-PATCH-114: batch IPC result — phase/version from po-state.json, exists from config.json presence
export interface RecentWithMeta {
  slug: string
  projectDir: string
  openedAt: string
  exists: boolean
  phase: number | null
  version: string | null
}

// ── Recents helpers (T-PATCH-050) ─────────────────────────────────────────────

const RECENTS_MAX = 50  // T-PATCH-114: raised from 10
const RECENTS_PATH = path.join(os.homedir(), '.productune', 'recents.json')

function loadRecents(): RecentProjectEntry[] {
  try {
    if (!fs.existsSync(RECENTS_PATH)) return []
    return JSON.parse(fs.readFileSync(RECENTS_PATH, 'utf-8')) as RecentProjectEntry[]
  } catch {
    return []
  }
}

function saveRecents(entries: RecentProjectEntry[]): void {
  try {
    fs.mkdirSync(path.dirname(RECENTS_PATH), { recursive: true })
    fs.writeFileSync(RECENTS_PATH, JSON.stringify(entries, null, 2), 'utf-8')
  } catch { /* non-fatal */ }
}

/** Add or update a recent project entry. Deduplicates by projectDir, moves to top, caps at RECENTS_MAX. */
export function addToRecents(projectDir: string, slug: string): void {
  const existing = loadRecents().filter((e) => e.projectDir !== projectDir)
  const entry: RecentProjectEntry = { slug, projectDir, openedAt: new Date().toISOString() }
  saveRecents([entry, ...existing].slice(0, RECENTS_MAX))
  // Also register with macOS Dock recent menu
  if (process.platform === 'darwin') {
    try { app.addRecentDocument(projectDir) } catch { /* non-fatal */ }
  }
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

  // config.json absent — check for current-layout evidence vs true legacy traces.
  //
  // Current-layout evidence (self-healable): the project was created by the current
  // productune version but config.json was not written (e.g. PO session ran first).
  //   • turns/ directory exists (bootstrapPersonaMemory always creates it), OR
  //   • po-state.json parses OK and schema_version is a number >= 1
  //     (current po-state format; legacy pre-redesign projects lack this field).
  //
  // detect() stays PURE — no writes here. Heal runs in open handlers only.
  const hasTurns = fs.existsSync(path.join(productuneDir, 'turns'))
  const healEvidence: string[] = []
  if (hasTurns) healEvidence.push('turns/')

  if (!hasTurns) {
    // Try po-state.json schema_version probe
    const poStatePath = path.join(productuneDir, 'po-state.json')
    if (fs.existsSync(poStatePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(poStatePath, 'utf-8')) as Record<string, unknown>
        if (typeof parsed.schema_version === 'number' && parsed.schema_version >= 1) {
          healEvidence.push('po-state.json(schema_version>=1)')
        }
      } catch { /* unparseable — not current-layout evidence */ }
    }
  }

  if (healEvidence.length > 0) {
    return { kind: 'self-healable', healEvidence }
  }

  // True legacy traces (old layout — shows migration dialog).
  const hints: string[] = []
  if (fs.existsSync(path.join(productuneDir, 'po-state.json'))) hints.push('po-state.json')
  if (fs.existsSync(path.join(productuneDir, 'briefs'))) hints.push('briefs/')
  if (fs.existsSync(path.join(productuneDir, 'po.lock'))) hints.push('po.lock')

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
    } else if (detect.kind === 'self-healable') {
      // Include healable projects as current-like for display; actual heal happens on open.
      // No writes here — scanDescendantsForProductune is called from pure detect paths.
      found.push({ path: childPath, config: { slug: entry.name, _healable: true, healEvidence: detect.healEvidence } })
    } else if (detect.kind === 'self-legacy') {
      // Include legacy projects in descendant scan — renderer decides how to handle
      found.push({ path: childPath, config: { slug: entry.name, _legacy: true, hints: detect.hints } })
    }
  }
  return found
}

/**
 * Best-effort self-heal for a config-less current-layout project.
 * Calls initProject (stampSchemaV:true) to write config.json + skeleton.
 * Does NOT write onboarding pending — the project already had a PO session running.
 * Returns the healed config on success, null on failure (caller falls back to self-legacy).
 */
function tryHealProject(dir: string): any | null {
  try {
    const slug = path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
    const config = initProject({ slug, projectDir: dir })
    return config
  } catch {
    return null
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('ping', () => 'pong')

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  // T-PATCH-106: open a local file/path in the OS default app — fallback for
  // PO-chat absolute links that can't render in-pane (non-doctrine, off-project).
  // Absolute paths only (expand `~` first); relative/empty are rejected.
  ipcMain.handle('shell:openPath', (_event, p: string) => {
    if (typeof p !== 'string' || p.length === 0) {
      return { ok: false, error: 'empty path' }
    }
    let abs = p
    if (abs === '~') abs = os.homedir()
    else if (abs.startsWith('~/') || abs.startsWith('~' + path.sep)) {
      abs = path.join(os.homedir(), abs.slice(2))
    }
    if (!path.isAbsolute(abs)) return { ok: false, error: 'not an absolute path' }
    return shell.openPath(abs).then((error) => ({ ok: error === '', error: error || undefined }))
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
    addToRecents(projectDir, slug)
    return { projectDir, config }
  })

  ipcMain.handle('project:installAt', (_event, { projectDir }: { projectDir: string }) => {
    const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
    const config = initProject({ slug, projectDir })
    // Decision B (T-P4-101): write onboarding pending after install success.
    try { writeOnboardingPending(projectDir, 'install-at') } catch { /* non-fatal */ }
    addToRecents(projectDir, slug)
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

  // T-PATCH-050: recents list/add IPC — covers all open methods
  ipcMain.handle('recents:list', () => {
    return loadRecents().filter((e) => {
      try { return fs.existsSync(e.projectDir) } catch { return false }
    })
  })

  ipcMain.handle('recents:add', (_event, { projectDir, slug }: { projectDir: string; slug: string }) => {
    addToRecents(projectDir, slug)
    return { ok: true }
  })

  // T-PATCH-114: batch IPC — returns all entries including missing dirs (exists:false).
  // phase/version from po-state.json; slug from config.json (falls back to entry slug).
  // Never throws — missing/corrupt files yield null fields.
  ipcMain.handle('recents:listWithMeta', (): RecentWithMeta[] => {
    return loadRecents().map((e) => {
      let exists = false
      let phase: number | null = null
      let version: string | null = null
      let slug = e.slug
      try {
        const configPath = path.join(e.projectDir, '.productune', 'config.json')
        exists = fs.existsSync(configPath)
        if (exists) {
          try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            slug = typeof cfg.slug === 'string' ? cfg.slug : e.slug
          } catch { /* keep entry slug */ }
          try {
            const poStatePath = path.join(e.projectDir, '.productune', 'po-state.json')
            if (fs.existsSync(poStatePath)) {
              const st = JSON.parse(fs.readFileSync(poStatePath, 'utf-8'))
              phase = typeof st.current_phase === 'number' ? st.current_phase : null
              version = typeof st.current_version === 'string' ? st.current_version : null
            }
          } catch { /* phase/version stay null */ }
        }
      } catch { /* exists stays false */ }
      return { slug, projectDir: e.projectDir, openedAt: e.openedAt, exists, phase, version }
    })
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
      // T-PATCH-050: always add to recents on all open paths
      addToRecents(dir, detect.config?.slug ?? path.basename(dir))
      return { kind: 'self', dir, config: detect.config }
    }
    if (detect.kind === 'self-healable') {
      // Config-less current-layout project — heal then open as self-current.
      // On failure fall back to self-legacy (shows migration dialog, non-fatal).
      const healed = tryHealProject(dir)
      if (healed) {
        addToRecents(dir, healed.slug ?? path.basename(dir))
        return { kind: 'self', dir, config: healed, healed: true }
      }
      return { kind: 'self-legacy', dir, hints: detect.healEvidence ?? [] }
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
      // T-PATCH-050: always add to recents on all open paths
      addToRecents(dir, detect.config?.slug ?? path.basename(dir))
      return { kind: 'self', dir, config: detect.config }
    }
    if (detect.kind === 'self-healable') {
      // Config-less current-layout project — heal then open as self-current.
      // On failure fall back to self-legacy (shows migration dialog, non-fatal).
      const healed = tryHealProject(dir)
      if (healed) {
        addToRecents(dir, healed.slug ?? path.basename(dir))
        return { kind: 'self', dir, config: healed, healed: true }
      }
      return { kind: 'self-legacy', dir, hints: detect.healEvidence ?? [] }
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
    // stampSchemaV:false — real legacy projects must have backfill migrations run;
    // stamping latest here would cause migration runner to skip all pending migrations.
    const config = initProject({ slug: derivedSlug, projectDir, stampSchemaV: false })
    addToRecents(projectDir, derivedSlug)
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
