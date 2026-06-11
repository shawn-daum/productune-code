import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArtifactManifestMeta {
  ticket: string | null
  kind: string          // prd-view | mockup | wireframe | design-system | spec | doc
  status: string        // pending | approved | archived
  lang?: string
  source?: string
  source_hash?: string
}

export interface ArtifactEntry {
  relPath: string       // relative to projectDir, e.g. "docs/artifacts/v1/flow.md"
  absPath: string
  ext: string           // ".md" | ".mmd" | ".mermaid" | ".html" (lower-cased)
  scopeGroup: 'artifacts'
  /** docs/artifacts/<v>/manifest.json entry, when registered (artifact-manifest-schema.md) */
  meta?: ArtifactManifestMeta
}

/**
 * Per-version artifact split (T-PATCH-107).
 * `flat`     — version-root artifacts (archive/ excluded, manifest.json excluded).
 * `archived` — manifest status==='archived' ∪ archive/ physical scan (basename dedupe).
 */
export interface VersionArtifacts {
  version: string
  flat: ArtifactEntry[]
  archived: ArtifactEntry[]
}

export interface ArtifactTree {
  current: VersionArtifacts
  past: VersionArtifacts[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.md', '.mmd', '.mermaid', '.html', '.json'])

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Load docs/artifacts/<v>/manifest.json entries keyed by in-version path. */
function loadManifest(dir: string): Map<string, ArtifactManifestMeta> {
  const map = new Map<string, ArtifactManifestMeta>()
  const manifestPath = path.join(dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return map
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    for (const e of parsed?.entries ?? []) {
      if (typeof e?.path !== 'string') continue
      map.set(e.path, {
        ticket: e.ticket ?? null,
        kind: e.kind ?? 'doc',
        status: e.status ?? 'pending',
        lang: e.lang,
        source: e.source,
        source_hash: e.source_hash,
      })
    }
  } catch {
    // malformed manifest → treat as absent; lint surfaces it
  }
  return map
}

function scanDir(
  dir: string,
  projectDir: string,
  scopeGroup: 'artifacts',
  out: ArtifactEntry[],
): void {
  if (!fs.existsSync(dir)) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  const manifest = loadManifest(dir)
  const files = entries
    .filter((e) => e.isFile())
    // manifest.json is the registry itself, not an artifact
    .filter((e) => e.name !== 'manifest.json')
    .map((e) => ({ name: e.name, ext: path.extname(e.name).toLowerCase() }))
    .filter((f) => ALLOWED_EXTS.has(f.ext))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const f of files) {
    const absPath = path.join(dir, f.name)
    const relPath = path.relative(projectDir, absPath)
    out.push({ relPath, absPath, ext: f.ext, scopeGroup, meta: manifest.get(f.name) })
  }
}

/**
 * Build the archived list for a single version directory (T-PATCH-107).
 *
 * SoT = manifest. Per artifact-manifest-schema.md (GUI reads the manifest, not
 * globs/magic filenames), the primary source is manifest entries with
 * `status === 'archived'` whose file actually exists on disk. Archived entries'
 * `path` is `archive/<name>` (schema §27). The physical `versionDir/archive/`
 * scan is a graceful fallback for entries not registered in (or with a
 * missing/malformed) manifest — unioned and deduped by basename.
 */
function scanArchive(versionDir: string, projectDir: string): ArtifactEntry[] {
  const out: ArtifactEntry[] = []
  const seen = new Set<string>() // basename dedupe (manifest wins)
  const manifest = loadManifest(versionDir)

  // (1) Primary — manifest entries with status 'archived', path "archive/<name>".
  for (const [key, meta] of manifest) {
    if (meta.status !== 'archived') continue
    const name = path.basename(key)
    const ext = path.extname(name).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) continue
    const absPath = path.join(versionDir, key)
    if (!fs.existsSync(absPath)) continue // archived-but-deleted → skip
    out.push({
      relPath: path.relative(projectDir, absPath),
      absPath,
      ext,
      scopeGroup: 'artifacts',
      meta,
    })
    seen.add(name)
  }

  // (2) Fallback — physical archive/ files not already covered by the manifest.
  const archiveDir = path.join(versionDir, 'archive')
  if (fs.existsSync(archiveDir)) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(archiveDir, { withFileTypes: true })
    } catch {
      entries = []
    }
    for (const e of entries) {
      if (!e.isFile()) continue
      if (e.name === 'manifest.json') continue
      const ext = path.extname(e.name).toLowerCase()
      if (!ALLOWED_EXTS.has(ext)) continue
      if (seen.has(e.name)) continue
      const absPath = path.join(archiveDir, e.name)
      out.push({
        relPath: path.relative(projectDir, absPath),
        absPath,
        ext,
        scopeGroup: 'artifacts',
        // manifest may key archived entries as "archive/<name>"
        meta: manifest.get(`archive/${e.name}`),
      })
      seen.add(e.name)
    }
  }

  out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

/** Resolve flat + archived artifacts for one version id. */
function buildVersionArtifacts(
  artifactsBase: string,
  projectDir: string,
  version: string,
): VersionArtifacts {
  const versionDir = path.join(artifactsBase, version)
  const flat: ArtifactEntry[] = []
  scanDir(versionDir, projectDir, 'artifacts', flat) // root only; archive/ is a dir → filtered by isFile()
  const archived = scanArchive(versionDir, projectDir)
  return { version, flat, archived }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // Channel: artifacts:listScoped
  // Args:    projectDir: string, currentVersion: string | null
  // Returns: ArtifactEntry[]
  ipcMain.handle(
    'artifacts:listScoped',
    (_event, projectDir: string, currentVersion: string | null): ArtifactEntry[] => {
      if (!projectDir) return []

      const result: ArtifactEntry[] = []

      // docs/artifacts/<currentVersion>/ — or all subdirs if null
      const artifactsBase = path.join(projectDir, 'docs', 'artifacts')
      if (currentVersion) {
        const versionDir = path.join(artifactsBase, currentVersion)
        scanDir(versionDir, projectDir, 'artifacts', result)
      } else {
        // Walk all direct subdirectories of docs/artifacts/
        if (fs.existsSync(artifactsBase)) {
          let subdirs: fs.Dirent[]
          try {
            subdirs = fs.readdirSync(artifactsBase, { withFileTypes: true })
          } catch {
            subdirs = []
          }
          const sorted = subdirs
            .filter((e) => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name))
          for (const sub of sorted) {
            scanDir(path.join(artifactsBase, sub.name), projectDir, 'artifacts', result)
          }
        }
      }

      return result
    },
  )

  // Channel: artifacts:listTree (T-PATCH-107)
  // Args:    projectDir: string, currentVersion: string | null, versionIds: string[]
  // Returns: ArtifactTree — { current, past[] }, each version split flat / archived.
  // Note:    main process has no po-state; the renderer extracts version ids and
  //          passes them in. `versionIds` are the FULL set (current may be present);
  //          `past` excludes currentVersion. A version with no dir → flat:[], archived:[].
  ipcMain.handle(
    'artifacts:listTree',
    (
      _event,
      projectDir: string,
      currentVersion: string | null,
      versionIds: string[],
    ): ArtifactTree => {
      const artifactsBase = path.join(projectDir, 'docs', 'artifacts')

      const empty = (v: string): VersionArtifacts => ({ version: v, flat: [], archived: [] })

      if (!projectDir) {
        return { current: empty(currentVersion ?? ''), past: [] }
      }

      const current = currentVersion
        ? buildVersionArtifacts(artifactsBase, projectDir, currentVersion)
        : empty('')

      const past: VersionArtifacts[] = (versionIds ?? [])
        .filter((v) => typeof v === 'string' && v && v !== currentVersion)
        .map((v) => buildVersionArtifacts(artifactsBase, projectDir, v))

      return { current, past }
    },
  )

  // Channel: artifacts:readFile
  // Args:    projectDir: string, absPath: string
  // Returns: string (UTF-8 content), or null when the file does not exist
  // Guard:   resolved path must start with projectDir — reject traversal
  ipcMain.handle(
    'artifacts:readFile',
    (_event, projectDir: string, absPath: string): string | null => {
      if (!absPath) throw new Error('absPath is required')
      if (!projectDir) throw new Error('projectDir is required')

      const resolved = path.resolve(absPath)

      // Path-traversal guard: reject any path that escapes projectDir
      if (!resolved.startsWith(projectDir + path.sep)) {
        throw new Error('path traversal rejected')
      }

      const ext = path.extname(resolved).toLowerCase()

      if (!ALLOWED_EXTS.has(ext)) {
        throw new Error(`extension not allowed: ${ext}`)
      }

      // Missing file → return null instead of throwing ENOENT, so callers
      // (e.g. PrdSection probe) treat absence as "not found" without spamming
      // the main-process log. Containment/extension guards still apply above.
      if (!fs.existsSync(resolved)) return null

      return fs.readFileSync(resolved, 'utf-8')
    },
  )
}
