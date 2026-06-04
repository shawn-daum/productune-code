import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchRequest {
  projectDir: string
  /** Root the search runs under. Defaults to projectDir when omitted. Must be
   *  inside projectDir (path-traversal guard). */
  scopeDir?: string | null
  query: string
  options: SearchOptions
}

/** A single match within a line. Columns are 0-based char offsets into `line`. */
export interface SearchMatchRange {
  start: number
  end: number
}

export interface SearchMatch {
  line: number            // 1-based line number
  text: string            // the full matching line text (trimmed-right, capped)
  ranges: SearchMatchRange[]
}

export interface SearchFileGroup {
  absPath: string
  relPath: string         // relative to projectDir
  name: string            // basename
  dir: string             // relative dir (relPath minus basename)
  matches: SearchMatch[]
}

export interface SearchResult {
  groups: SearchFileGroup[]
  totalMatches: number
  fileCount: number
  /** True when a perf cap was hit and results were truncated. */
  truncated: boolean
  /** Set when the query/regex was invalid; groups will be empty. */
  error?: string
}

export interface ReadFileLinesResult {
  ok: boolean
  lines?: string[]        // file split by \n (no trailing newline element synthesised)
  error?: string
  truncated?: boolean     // file exceeded the line cap and was clipped
}

// ── Constants (fixed ignore rules — AC-4 / no glob fields in v0.5) ─────────────

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'build', 'dist', 'dist-electron',
  'out', '.next', '.turbo', '.cache',
])

// Binary / non-text extensions skipped outright (binary-file search out of scope).
const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.bmp',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.webm',
  '.node', '.wasm', '.dylib', '.so', '.dll', '.exe', '.bin',
  '.lock',
])

// Perf caps — keep the main process responsive on multi-hundred-file repos (AC-4).
const MAX_FILES_SCANNED = 5000   // hard ceiling on files visited
const MAX_FILE_BYTES = 2_000_000 // 2 MB — skip very large files
const MAX_MATCHES = 2000         // stop collecting once this many matches found
const MAX_MATCHES_PER_FILE = 200 // cap a single noisy file
const MAX_LINE_LEN = 400         // truncate very long lines in the payload
const READ_FILE_MAX_LINES = 20000 // cap for the open-at-line file reader

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build the matcher regex from query + options. Throws on invalid regex. */
function buildMatcher(query: string, options: SearchOptions): RegExp {
  let source: string
  if (options.regex) {
    source = query
  } else {
    source = escapeRegExp(query)
  }
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`
  }
  const flags = 'g' + (options.caseSensitive ? '' : 'i')
  return new RegExp(source, flags)
}

/** Cheap binary sniff: a NUL byte in the first chunk ⇒ treat as binary. */
function looksBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 8000)
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

interface WalkState {
  filesScanned: number
  truncated: boolean
}

function walk(dir: string, out: string[], state: WalkState): void {
  if (state.truncated) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (state.truncated) return
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), out, state)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SKIP_EXTS.has(ext)) continue
      out.push(path.join(dir, entry.name))
      state.filesScanned++
      if (state.filesScanned >= MAX_FILES_SCANNED) {
        state.truncated = true
        return
      }
    }
  }
}

function scanFile(
  absPath: string,
  matcher: RegExp,
  budget: { remaining: number },
): SearchMatch[] {
  let content: string
  try {
    const stat = fs.statSync(absPath)
    if (stat.size > MAX_FILE_BYTES) return []
    const buf = fs.readFileSync(absPath)
    if (looksBinary(buf)) return []
    content = buf.toString('utf-8')
  } catch {
    return []
  }

  const matches: SearchMatch[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (budget.remaining <= 0 || matches.length >= MAX_MATCHES_PER_FILE) break
    const raw = lines[i]
    // Reset lastIndex for the global regex on each line.
    matcher.lastIndex = 0
    let m: RegExpExecArray | null
    const ranges: SearchMatchRange[] = []
    while ((m = matcher.exec(raw)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length })
      // Guard against zero-width matches looping forever.
      if (m.index === matcher.lastIndex) matcher.lastIndex++
      if (ranges.length >= 50) break
    }
    if (ranges.length > 0) {
      const text = raw.length > MAX_LINE_LEN ? raw.slice(0, MAX_LINE_LEN) + '…' : raw
      matches.push({ line: i + 1, text, ranges })
      budget.remaining--
    }
  }
  return matches
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── search:content — full-text grep across project files ───────────────────
  ipcMain.handle('search:content', async (_event, req: SearchRequest): Promise<SearchResult> => {
    const empty: SearchResult = { groups: [], totalMatches: 0, fileCount: 0, truncated: false }
    if (!req?.projectDir || !req.query || !req.query.trim()) return empty
    if (!fs.existsSync(req.projectDir)) return empty

    const projectDir = path.resolve(req.projectDir)

    // Resolve + guard the scope dir (defaults to whole project — AC-5).
    let scopeDir = projectDir
    if (req.scopeDir) {
      const resolved = path.resolve(req.scopeDir)
      if (resolved === projectDir || resolved.startsWith(projectDir + path.sep)) {
        scopeDir = resolved
      }
    }

    let matcher: RegExp
    try {
      matcher = buildMatcher(req.query, req.options)
    } catch (e: any) {
      return { ...empty, error: e?.message ?? 'invalid pattern' }
    }

    // Phase 1: collect candidate files (respects ignore dirs + file cap).
    const files: string[] = []
    const walkState: WalkState = { filesScanned: 0, truncated: false }
    walk(scopeDir, files, walkState)

    // Phase 2: scan files, accumulating a global match budget.
    const groups: SearchFileGroup[] = []
    const budget = { remaining: MAX_MATCHES }
    let truncated = walkState.truncated
    let totalMatches = 0

    for (const absPath of files) {
      if (budget.remaining <= 0) { truncated = true; break }
      const matches = scanFile(absPath, matcher, budget)
      if (matches.length === 0) continue
      const relPath = path.relative(projectDir, absPath)
      const name = path.basename(absPath)
      const dir = path.dirname(relPath)
      groups.push({
        absPath,
        relPath,
        name,
        dir: dir === '.' ? '' : dir,
        matches,
      })
      totalMatches += matches.length
    }

    return {
      groups,
      totalMatches,
      fileCount: groups.length,
      truncated,
    }
  })

  // ── search:readFileLines — read a text file for open-at-line (AC-3) ────────
  // Returns the file split into lines so the result tab can render + highlight
  // the match line. Guarded by the project-dir traversal check + size cap.
  ipcMain.handle(
    'search:readFileLines',
    async (_event, projectDir: string, absPath: string): Promise<ReadFileLinesResult> => {
      if (!projectDir || !absPath) return { ok: false, error: 'missing args' }
      const root = path.resolve(projectDir)
      const resolved = path.resolve(absPath)
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return { ok: false, error: 'path traversal rejected' }
      }
      try {
        const stat = fs.statSync(resolved)
        if (stat.size > MAX_FILE_BYTES) return { ok: false, error: 'file too large' }
        const buf = fs.readFileSync(resolved)
        if (looksBinary(buf)) return { ok: false, error: 'binary file' }
        let lines = buf.toString('utf-8').split('\n')
        let truncated = false
        if (lines.length > READ_FILE_MAX_LINES) {
          lines = lines.slice(0, READ_FILE_MAX_LINES)
          truncated = true
        }
        return { ok: true, lines, truncated }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    },
  )
}
