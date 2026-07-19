import { app, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { initProject, startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo, findAncestorProductuneRoot } from '@productune/core'
import { writeOnboardingPending } from './onboarding'
import { STATE_DIR_NAME, configPath, poStatePath, codeRoot } from '../project-paths'

const execFileAsync = promisify(execFile)

// ── T-319/T-321: prdt CLI delegation (single init/migrate SoT) ─────────────────
//
// Every GUI project *creation* route and the legacy *migration* route delegate to
// the one prdt CLI SoT installed at `~/.prdt/bin/prdt` (install.sh) — never to the
// legacy `.productune`-writing initProject (doctrine #2: reuse the one init SoT).
// A missing/failing prdt CLI throws a clear Error the IPC caller surfaces; there is
// NO silent fallback to `.productune` — no GUI path creates a new legacy project.
const PRDT_BIN = path.join(os.homedir(), '.prdt', 'bin', 'prdt')

/** Run `prdt <args>` (cwd = projectDir). Throws a clear Error when the CLI is
 *  absent or exits non-zero. Returns stdout. */
function runPrdtCli(args: string[], cwd: string): string {
  if (!fs.existsSync(PRDT_BIN)) {
    throw new Error(
      `prdt CLI not found at ${PRDT_BIN} — run the prdt installer (scripts/install.sh) before creating or migrating a project.`,
    )
  }
  try {
    return execFileSync(PRDT_BIN, args, { cwd, encoding: 'utf-8' })
  } catch (e: any) {
    const detail = String(e?.stderr || e?.stdout || e?.message || e).trim()
    throw new Error(`prdt ${args[0]} failed: ${detail}`)
  }
}

/** Config-shaped result the renderers read (mirrors the pre-T-319 initProject
 *  return: `slug` / `created_at` / `version`), read back from the freshly written
 *  `.prdt/` state so it reflects on-disk truth. Exported for unit testing the
 *  create/migrate return-shape contract against a fixture dir (T-319). */
export function readPrdtConfig(
  projectDir: string,
  fallbackSlug: string,
  fallbackVersion = 'v1',
): { slug: string; created_at: string; version: string } {
  let slug = fallbackSlug
  let created_at = new Date().toISOString()
  let version = fallbackVersion
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(projectDir), 'utf-8'))
    if (typeof cfg.slug === 'string') slug = cfg.slug
    if (typeof cfg.created_at === 'string') created_at = cfg.created_at
  } catch { /* keep fallbacks */ }
  try {
    const st = JSON.parse(fs.readFileSync(poStatePath(projectDir), 'utf-8'))
    if (typeof st.version === 'string') version = st.version
  } catch { /* keep fallback */ }
  return { slug, created_at, version }
}

/** T-319 (decision A): create a `.prdt` project via `prdt init --json` (cwd=dir). */
function createPrdtProject(
  projectDir: string,
  slug: string,
  initialVersionId?: string,
): { slug: string; created_at: string; version: string } {
  const args = ['init', '--json', '--slug', slug]
  if (initialVersionId) args.push('--version', initialVersionId)
  runPrdtCli(args, projectDir)
  return readPrdtConfig(projectDir, slug, initialVersionId ?? 'v1')
}

/** T-321: convert a legacy `.productune` project to `.prdt` via `prdt migrate`
 *  (the single migration SoT — renames `.productune/`→`.productune.migrated/` and
 *  writes `.prdt/`). Delegates by absolute path; no in-process re-implementation. */
function migratePrdtProject(projectDir: string): { slug: string; created_at: string; version: string } {
  runPrdtCli(['migrate', projectDir], projectDir)
  const fallbackSlug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
  return readPrdtConfig(projectDir, fallbackSlug)
}

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
  /** T-306: prdt flat lifecycle stage (define/build/ship/retro) — null for legacy
   *  projects (which carry the numeric `phase` instead; the two never co-occur). */
  stage: string | null
}

// ── Recents helpers (T-PATCH-050) ─────────────────────────────────────────────

const RECENTS_MAX = 50  // T-PATCH-114: raised from 10
const RECENTS_PATH = path.join(os.homedir(), '.productune', 'recents.json')

/** `homeDir` is test-only (defaults to `os.homedir()`) — mirrors the onboarding.ts DI idiom. */
function recentsPathFor(homeDir: string): string {
  return path.join(homeDir, '.productune', 'recents.json')
}

function loadRecents(homeDir: string = os.homedir()): RecentProjectEntry[] {
  const recentsPath = recentsPathFor(homeDir)
  try {
    if (!fs.existsSync(recentsPath)) return []
    return JSON.parse(fs.readFileSync(recentsPath, 'utf-8')) as RecentProjectEntry[]
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

/**
 * T-PATCH-134: remove a single recents entry by projectDir (non-destructive).
 * Disk is never touched. Missing entry → no-op. Returns the refreshed list.
 */
function removeFromRecents(projectDir: string): RecentProjectEntry[] {
  const next = loadRecents().filter((e) => e.projectDir !== projectDir)
  saveRecents(next)
  return next
}

// ── Destructive delete boundary (T-PATCH-134 §6) ───────────────────────────────

/**
 * Guard a projectDir before any disk delete is allowed.
 * Permits delete only when the path is absolute, contains a `.productune/` dir,
 * and is not an obviously dangerous root (home dir, fs root, productune projects base).
 * `exists:false` (path already gone) is reported separately so the caller can
 * still purge the recents entry without erroring (race-safe).
 */
function classifyDeleteTarget(projectDir: string): { ok: boolean; alreadyGone?: boolean; error?: string } {
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    return { ok: false, error: 'empty path' }
  }
  if (!path.isAbsolute(projectDir)) {
    return { ok: false, error: 'not an absolute path' }
  }

  // Normalize + reject dangerous roots regardless of on-disk presence.
  const strip = (p: string) => path.normalize(p).replace(/[/\\]+$/, '')
  const normalized = strip(projectDir)
  const home = strip(os.homedir())
  const fsRoot = path.parse(normalized).root.replace(/[/\\]+$/, '')
  const projectsBase = strip(path.join(os.homedir(), 'productune', 'projects'))
  if (normalized.length === 0 || normalized === home || normalized === fsRoot || normalized === projectsBase) {
    return { ok: false, error: 'refusing to delete a protected root path' }
  }

  // Race-safe: if the dir is already gone, allow recents-only cleanup.
  try {
    if (!fs.existsSync(normalized)) return { ok: true, alreadyGone: true }
  } catch {
    return { ok: true, alreadyGone: true }
  }

  // Containment marker: must look like a productune/prdt project (state dir present).
  if (
    !fs.existsSync(path.join(normalized, STATE_DIR_NAME.prdt)) &&
    !fs.existsSync(path.join(normalized, STATE_DIR_NAME.productune))
  ) {
    return { ok: false, error: 'not a productune project (no .prdt/ or .productune/)' }
  }

  return { ok: true }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect whether a directory contains a productune/prdt project.
 *
 * A `.prdt/` directory (v1 / prdt layout) is checked FIRST and always resolves to
 * 'self-current' — prdt state is current-layout by definition, has no legacy/heal
 * path, and the briefs/·po.lock markers do NOT apply to it. Otherwise the legacy
 * `.productune/` layout is classified exactly as before:
 *
 * - 'self-current': .prdt/config.json OR .productune/config.json exists & parses.
 *                   (prdt without a parseable config still resolves self-current,
 *                    basename slug — heal is skipped since initProject writes a
 *                    legacy .productune/ dir, wrong for a prdt project.)
 * - 'self-legacy':  .productune/ exists with po-state.json/briefs/po.lock/turns/ but no config.json.
 * - 'none':         No productune/prdt layout detected.
 */
export function detectProductuneLayout(dir: string): DetectResult {
  // prdt (v1) layout — `.prdt/` present. Current-layout only; no heal, no legacy hints.
  const prdtDir = path.join(dir, STATE_DIR_NAME.prdt)
  if (fs.existsSync(prdtDir)) {
    const prdtConfigPath = path.join(prdtDir, 'config.json')
    if (fs.existsSync(prdtConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(prdtConfigPath, 'utf-8'))
        return { kind: 'self-current', config }
      } catch {
        // Corrupt config — fall through to a basename-slug self-current.
      }
    }
    return { kind: 'self-current', config: { slug: path.basename(dir) } }
  }

  const productuneDir = path.join(dir, STATE_DIR_NAME.productune)
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

/**
 * T-PATCH-135: build an `ancestor` open-result if a productune root exists in a
 * PARENT dir of `dir` (start dir excluded — self-* detection already ran). Uses
 * the shared core SoT walk-up (bounded: fs root / home / depth-16 / fs error).
 * Reads the ancestor's config.json best-effort for the renderer (slug display).
 * Returns null when no ancestor root is found.
 */
function buildAncestorResult(
  dir: string,
): { kind: 'ancestor'; dir: string; ancestorRoot: string; distance: number; config: any } | null {
  let res
  try {
    res = findAncestorProductuneRoot(dir)
  } catch {
    return null
  }
  if (!res.found || !res.rootDir) return null

  let config: any = { slug: path.basename(res.rootDir) }
  try {
    const cfgPath = configPath(res.rootDir)
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      config = { ...parsed, slug: parsed?.slug ?? path.basename(res.rootDir) }
    }
  } catch { /* unparseable/missing — keep basename slug */ }

  return {
    kind: 'ancestor',
    dir,
    ancestorRoot: res.rootDir,
    distance: res.distance ?? 0,
    config,
  }
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

/**
 * T-321: pure list+meta builder backing the `recents:listWithMeta` IPC handler.
 * Extracted (Tidy First — no behavior change) so the exists/version/stage
 * resolution can be unit-tested against a fixture `homeDir` instead of the
 * real `~/.productune/recents.json` (`homeDir` mirrors the onboarding.ts DI
 * idiom, defaults to `os.homedir()`).
 */
export function buildRecentsWithMeta(homeDir: string = os.homedir()): RecentWithMeta[] {
  return loadRecents(homeDir).map((e) => {
    let exists = false
    let phase: number | null = null
    let version: string | null = null
    let stage: string | null = null
    let slug = e.slug
    try {
      const cfgPath = configPath(e.projectDir)
      exists = fs.existsSync(cfgPath)
      if (exists) {
        try {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
          slug = typeof cfg.slug === 'string' ? cfg.slug : e.slug
        } catch { /* keep entry slug */ }
        try {
          const statePath = poStatePath(e.projectDir)
          if (fs.existsSync(statePath)) {
            const st = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
            phase = typeof st.current_phase === 'number' ? st.current_phase : null
            // T-306: prdt carries flat `version`/`stage` instead of
            // current_version/current_phase — coalesce so prdt cards show
            // their meta row. Legacy po-state never has the flat fields.
            version = typeof st.current_version === 'string' ? st.current_version
              : typeof st.version === 'string' && typeof st.stage === 'string' ? st.version
              : null
            stage = typeof st.stage === 'string' ? st.stage : null
          }
        } catch { /* phase/version/stage stay null */ }
      }
    } catch { /* exists stays false */ }
    return { slug, projectDir: e.projectDir, openedAt: e.openedAt, exists, phase, version, stage }
  })
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
    // T-319: creates a `.prdt` project via the prdt CLI SoT (never legacy .productune).
    return createPrdtProject(opts.projectDir, opts.slug)
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

    // T-319: new projects are born `.prdt` via the prdt CLI SoT (never .productune).
    const config = createPrdtProject(projectDir, slug, initialVersionId)
    // Decision B (T-P4-101): write onboarding pending immediately after init success.
    try { writeOnboardingPending(projectDir, 'gui-create') } catch { /* non-fatal */ }
    addToRecents(projectDir, slug)
    return { projectDir, config }
  })

  ipcMain.handle('project:installAt', (_event, { projectDir }: { projectDir: string }) => {
    const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
    // T-319: install-here also creates a `.prdt` project (never legacy .productune).
    const config = createPrdtProject(projectDir, slug)
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
        fs.existsSync(configPath(projectDir))
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
      const entryDir = path.join(baseDir, entry.name)
      const cfgPath = configPath(entryDir)
      if (!fs.existsSync(cfgPath)) continue
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
        projects.push({ ...cfg, path: entryDir })
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

  // T-PATCH-134 (a): remove a recents entry only — non-destructive, no disk touch.
  // Missing entry is a no-op success. Returns the refreshed list.
  ipcMain.handle('recents:remove', (_event, { projectDir }: { projectDir: string }): { ok: true; entries: RecentProjectEntry[] } => {
    const entries = removeFromRecents(projectDir)
    return { ok: true, entries }
  })

  // T-PATCH-134 (b): delete the project directory from disk, then purge its recents entry.
  // Boundary-guarded (absolute + `.productune/` present + non-protected root). Tries the
  // OS trash first (shell.trashItem) for reversibility, falls back to a hard recursive
  // rm only when trash is unavailable (reported via `trashed:false`). A dir that is
  // already gone resolves to recents-only cleanup ({ alreadyGone:true }).
  ipcMain.handle(
    'project:delete',
    async (_event, { projectDir }: { projectDir: string }): Promise<{
      ok: boolean
      trashed?: boolean
      alreadyGone?: boolean
      error?: string
    }> => {
      const guard = classifyDeleteTarget(projectDir)
      if (!guard.ok) return { ok: false, error: guard.error }

      const normalized = path.normalize(projectDir).replace(/[/\\]+$/, '')

      // Race-safe: nothing on disk → just clean recents.
      if (guard.alreadyGone) {
        removeFromRecents(projectDir)
        removeFromRecents(normalized)
        return { ok: true, trashed: false, alreadyGone: true }
      }

      let trashed = false
      try {
        await shell.trashItem(normalized)
        trashed = true
      } catch {
        // Trash unavailable (network volume / permissions) → hard delete fallback.
        try {
          fs.rmSync(normalized, { recursive: true, force: true })
          trashed = false
        } catch (e: any) {
          return { ok: false, error: e?.message ?? 'delete failed' }
        }
      }

      // (b) includes (a): purge recents under both the raw and normalized keys.
      removeFromRecents(projectDir)
      removeFromRecents(normalized)
      return { ok: true, trashed }
    },
  )

  // T-PATCH-114: batch IPC — returns all entries including missing dirs (exists:false).
  // phase/version from po-state.json; slug from config.json (falls back to entry slug).
  // Never throws — missing/corrupt files yield null fields.
  ipcMain.handle('recents:listWithMeta', (): RecentWithMeta[] => buildRecentsWithMeta())

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
      // T-PATCH-125: mirror basename fallback onto the returned config so the
      // renderer always receives a truthy slug (empty titlebar + Cmd+R → HomeView fix).
      const cfg = { ...detect.config, slug: detect.config?.slug ?? path.basename(dir) }
      addToRecents(dir, cfg.slug)
      return { kind: 'self', dir, config: cfg }
    }
    if (detect.kind === 'self-healable') {
      // Config-less current-layout project — heal then open as self-current.
      // On failure fall back to self-legacy (shows migration dialog, non-fatal).
      const healed = tryHealProject(dir)
      if (healed) {
        const cfg = { ...healed, slug: healed.slug ?? path.basename(dir) }
        addToRecents(dir, cfg.slug)
        return { kind: 'self', dir, config: cfg, healed: true }
      }
      return { kind: 'self-legacy', dir, hints: detect.healEvidence ?? [] }
    }
    if (detect.kind === 'self-legacy') {
      return { kind: 'self-legacy', dir, hints: detect.hints }
    }

    // T-PATCH-135: not self-* → check PARENT dirs (nearest productune root).
    // Ancestor takes priority OVER the descendant scan (a closer parent is more
    // likely the user's intended project than a child further down).
    const ancestor = buildAncestorResult(dir)
    if (ancestor) return ancestor

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
      // T-PATCH-125: mirror basename fallback onto the returned config so the
      // renderer always receives a truthy slug (empty titlebar + Cmd+R → HomeView fix).
      const cfg = { ...detect.config, slug: detect.config?.slug ?? path.basename(dir) }
      addToRecents(dir, cfg.slug)
      return { kind: 'self', dir, config: cfg }
    }
    if (detect.kind === 'self-healable') {
      // Config-less current-layout project — heal then open as self-current.
      // On failure fall back to self-legacy (shows migration dialog, non-fatal).
      const healed = tryHealProject(dir)
      if (healed) {
        const cfg = { ...healed, slug: healed.slug ?? path.basename(dir) }
        addToRecents(dir, cfg.slug)
        return { kind: 'self', dir, config: cfg, healed: true }
      }
      return { kind: 'self-legacy', dir, hints: detect.healEvidence ?? [] }
    }
    if (detect.kind === 'self-legacy') {
      return { kind: 'self-legacy', dir, hints: detect.hints }
    }

    // T-PATCH-135: ancestor walk-up (priority over descendant scan) — parity
    // with dialog:openFolder so CLI/GUI/Open-Recent all resolve the same root.
    const ancestor = buildAncestorResult(dir)
    if (ancestor) return ancestor

    const descendants = scanDescendantsForProductune(dir)
    if (descendants.length > 0) {
      return { kind: 'descendant', dir, descendants }
    }

    return { kind: 'none', dir }
  })

  ipcMain.handle('project:migrateLegacy', (_event, { projectDir }: { projectDir: string; slug?: string }) => {
    // T-321: convert legacy `.productune` → `.prdt` via the prdt migrate SoT (which
    // renames the old marker to `.productune.migrated/`). Throws a clear Error on
    // failure — no silent fallback, no in-process re-implementation. After success
    // detectProjectKind resolves `prdt`, so the very next PO turn spawns prdt-po.
    const config = migratePrdtProject(projectDir)
    addToRecents(projectDir, config.slug)
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
    // T-377 (PRD §v1.3 설계 결정 4): the GitHub remote is the CODE repo's — anchor
    // `git init` + `remote add origin` at codeRoot (`<projectDir>/<code.dir>`),
    // never the meta projectRoot. Legacy layout: codeRoot == projectDir (unchanged).
    const cwd = codeRoot(projectDir)
    try {
      await execFileAsync('git', ['init'], { cwd })
      await execFileAsync('git', ['remote', 'add', 'origin', cloneUrl], { cwd })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
}
