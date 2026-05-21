import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  /**
   * Walk docs/artifacts/ (2 levels deep — version-bucket structure) and return relative .md paths.
   * Level 1: global docs + version buckets (v0.4/, etc.)
   * Level 2: ticket dirs within version buckets
   * projectRoot is validated to be an absolute path to an existing directory.
   */
  ipcMain.handle('design:listArtifacts', (_event, projectRoot: string): string[] => {
    const designDir = path.resolve(projectRoot, 'docs', 'artifacts')
    if (!fs.existsSync(designDir)) return []

    const results: string[] = []

    const walk = (dir: string, depth: number) => {
      let entries: fs.Dirent[]
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory() && depth < 2) {
          walk(fullPath, depth + 1)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(path.relative(projectRoot, fullPath))
        }
      }
    }

    walk(designDir, 0)
    return results.sort()
  })

  /**
   * Read a design artifact file.
   * relPath must resolve to inside docs/artifacts/ — path traversal is rejected.
   */
  ipcMain.handle('design:readArtifact', (_event, projectRoot: string, relPath: string): string => {
    const designDir = path.resolve(projectRoot, 'docs', 'artifacts')
    const resolved = path.resolve(projectRoot, relPath)

    // Path traversal guard: resolved path must start with designDir + separator
    if (!resolved.startsWith(designDir + path.sep) && resolved !== designDir) {
      throw new Error('Path traversal rejected')
    }

    if (!resolved.endsWith('.md')) {
      throw new Error('Only .md files are readable via this handler')
    }

    return fs.readFileSync(resolved, 'utf-8')
  })
}
