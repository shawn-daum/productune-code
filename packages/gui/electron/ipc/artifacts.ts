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

  // Channel: artifacts:readFile
  // Args:    projectDir: string, absPath: string
  // Returns: string (UTF-8 content)
  // Guard:   resolved path must start with projectDir — reject traversal
  ipcMain.handle(
    'artifacts:readFile',
    (_event, projectDir: string, absPath: string): string => {
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

      return fs.readFileSync(resolved, 'utf-8')
    },
  )
}
