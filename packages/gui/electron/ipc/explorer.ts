import { ipcMain, shell, type WebContents } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FsNode {
  name: string
  path: string
  isDir: boolean
}

type ExplorerWatcher = ReturnType<typeof fs.watch>

interface QuickOpenFile {
  path: string
  ext: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPLORER_EXCLUDE = new Set([
  '.git', 'node_modules', '.next', 'dist', 'dist-electron',
  'build', 'out', '.turbo', '.cache', '.DS_Store',
])

const QO_EXCLUDE = new Set([
  '.git', 'node_modules', 'dist', 'dist-electron', '.next', 'build',
  'out', '.turbo', '.cache', '.DS_Store',
])

const QO_EXT_WHITELIST = new Set(['.md', '.json', '.html', '.txt'])

// ── Module state ──────────────────────────────────────────────────────────────

let explorerWatcher: ExplorerWatcher | null = null
let explorerWatchRoot: string | null = null
let explorerDebounceTimer: NodeJS.Timeout | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function startExplorerWatch(root: string, sender: WebContents): void {
  if (explorerWatcher && explorerWatchRoot === root) return
  stopExplorerWatch()
  explorerWatchRoot = root
  try {
    explorerWatcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      // Exclude noise from baseline dirs.
      const parts = filename.split(path.sep)
      if (parts.some((p) => EXPLORER_EXCLUDE.has(p))) return

      const absPath = path.join(root, filename)
      // Derive event type for renderer.
      let type: string = 'change'
      try {
        const exists = fs.existsSync(absPath)
        if (eventType === 'rename') {
          type = exists ? 'add' : 'unlink'
        } else {
          type = 'change'
        }
      } catch {
        type = 'unlink'
      }

      if (explorerDebounceTimer) clearTimeout(explorerDebounceTimer)
      explorerDebounceTimer = setTimeout(() => {
        if (!sender.isDestroyed()) {
          sender.send('explorer:fs-changed', { type, path: absPath })
        }
      }, 500)
    })
  } catch {
    // fs.watch not supported (e.g. some network drives) — silently skip.
  }
}

function stopExplorerWatch(): void {
  if (explorerDebounceTimer) { clearTimeout(explorerDebounceTimer); explorerDebounceTimer = null }
  if (explorerWatcher) { try { explorerWatcher.close() } catch { /* ok */ } explorerWatcher = null }
  explorerWatchRoot = null
}

function listProjectFilesRecursive(dir: string, out: QuickOpenFile[] = []): QuickOpenFile[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (QO_EXCLUDE.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      listProjectFilesRecursive(fullPath, out)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (QO_EXT_WHITELIST.has(ext)) {
        out.push({ path: fullPath, ext })
      }
    }
  }
  return out
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('explorer:listDir', (_event, absPath: string): FsNode[] => {
    try {
      const entries = fs.readdirSync(absPath, { withFileTypes: true })
      return entries
        .filter((e) => !EXPLORER_EXCLUDE.has(e.name))
        .map((e) => ({
          name: e.name,
          path: path.join(absPath, e.name),
          isDir: e.isDirectory(),
        }))
    } catch {
      return []
    }
  })

  ipcMain.handle('explorer:revealInOS', (_event, absPath: string): void => {
    shell.showItemInFolder(absPath)
  })

  ipcMain.handle('explorer:watch', (event, root: string): void => {
    startExplorerWatch(root, event.sender)
  })

  ipcMain.handle('explorer:unwatch', (): void => {
    stopExplorerWatch()
  })

  // ── Quick Open file listing (T-P4-047) ────────────────────────────────────────
  ipcMain.handle('slash:listProjectFiles', (_event, projectDir: string): QuickOpenFile[] => {
    if (!projectDir || !fs.existsSync(projectDir)) return []
    return listProjectFilesRecursive(projectDir)
  })
}
