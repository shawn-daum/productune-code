import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScannedTicket {
  ticket_id: string
  version: string | null
  slug?: string
  title?: string
  type?: string
  stage?: string
  status?: string
  qa_status?: string
  qa_loops?: number
  assignee?: string
  estimated_complexity?: string
  risk_flags?: string
  requires_user_gate?: boolean
  branch?: string
  worktree_path?: string
  success_metric?: string | null
  validation_method?: string | null
  observed_result?: string | null
  started_at?: string | null
  completed_at?: string | null
  duration_min?: number | null
  request_summary?: string
  path?: string
  /** File mtime (epoch ms) — "last touched" signal for sort (T-PATCH-162). */
  mtime?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip a YAML inline `#` comment from an UNQUOTED scalar value.
 *
 * YAML rule: `#` starts a comment only at line-start or when preceded by
 * whitespace. We cut at the first ` #` (whitespace + hash), NOT a bare `#`,
 * so unquoted leading-hash values (e.g. a hex color `#fff`) are preserved.
 *
 * Guard: if the raw value begins with a quote (`"` or `'`), it is a QUOTED
 * scalar — its `#` may be literal content (e.g. `"a # b"`), so we skip the
 * strip entirely and let the caller's quote-handling branch run unchanged.
 *
 * Blast-radius note (T-PATCH-136): this feeds ALL scalar frontmatter fields.
 * Enum/path/date/identifier fields never legitimately carry ` #`. The only
 * free-text field is `title`; if a title needs a literal ` #` (e.g. `feat #1`)
 * it MUST be quoted — same as standard YAML. Truncation of an unquoted
 * trailing ` #` is intended behaviour, not a regression.
 */
function stripInlineComment(raw: string): string {
  if (raw.startsWith('"') || raw.startsWith("'")) return raw
  const idx = raw.search(/\s#/)
  return idx === -1 ? raw : raw.slice(0, idx)
}

function parseFrontmatter(content: string): Record<string, any> {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, any> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val: any = stripInlineComment(m[2].trim()).trim()
    if (val === '') val = null
    else if (val === 'null') val = null
    else if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (/^-?\d+$/.test(val)) val = Number(val)
    else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    else if (val.startsWith('[') || val.startsWith('{')) { /* leave as string */ }
    out[key] = val
  }
  return out
}

function extractRequestSummary(content: string): string | undefined {
  // Find `## Request` heading and return first non-empty paragraph after it.
  const lines = content.split('\n')
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Request\b/.test(lines[i])) {
      startIdx = i + 1
      break
    }
  }
  if (startIdx < 0) return undefined
  const buf: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^##\s/.test(t)) break
    if (!t) {
      if (buf.length > 0) break
      continue
    }
    buf.push(t)
  }
  const para = buf.join(' ').trim()
  return para.length > 240 ? para.slice(0, 237) + '…' : (para || undefined)
}

// ── Helpers for tickets:read ──────────────────────────────────────────────────

/**
 * Strip YAML frontmatter block (lines between --- delimiters) and return
 * the remaining markdown body.
 */
function stripFrontmatter(content: string): string {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return content
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
    }
  }
  return content
}

/**
 * Extract the content of the first section whose heading ends with `(KR)`.
 * Returns text from immediately after that heading until the next `##`-level
 * heading (or end of file), preserving all content. Returns null if absent.
 */
function extractKrSection(body: string): string | null {
  const lines = body.split('\n')
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+.+\(KR\)\s*$/.test(lines[i])) {
      startIdx = i + 1
      break
    }
  }
  if (startIdx < 0) return null
  const out: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    out.push(lines[i])
  }
  return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') || null
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── tickets:read — single ticket by ticketId ──────────────────────────────
  ipcMain.handle(
    'tickets:read',
    async (
      _event,
      projectDir: string,
      ticketId: string,
      version?: string,
    ): Promise<{ frontmatter: Record<string, unknown>; body: string; krBody: string | null } | null> => {
      const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
      if (!fs.existsSync(ticketsRoot)) return null
      const root = path.resolve(ticketsRoot)

      // Read+parse a candidate file with a path-traversal guard. Returns the
      // parsed payload, or null when the file is missing/unreadable.
      const tryRead = (
        versionDir: string,
      ): { frontmatter: Record<string, unknown>; body: string; krBody: string | null } | null => {
        const filePath = path.join(ticketsRoot, versionDir, `${ticketId}.md`)
        const resolved = path.resolve(filePath)
        if (!resolved.startsWith(root + path.sep)) {
          throw new Error('path traversal rejected')
        }
        if (!fs.existsSync(filePath)) return null
        let content: string
        try { content = fs.readFileSync(filePath, 'utf-8') } catch { return null }
        const frontmatter = parseFrontmatter(content)
        const body = stripFrontmatter(content)
        const krBody = extractKrSection(body)
        return { frontmatter, body, krBody }
      }

      // (version, id) resolution (T-PATCH-111): when version is provided, look
      // up exactly docs/tickets/<version>/<id>.md — never first-match across
      // versions. Missing file → null (do not silently fall through).
      if (version) {
        return tryRead(version)
      }

      // Legacy fallback (version absent): first-match across all version dirs,
      // preserving today's backward-compatible behaviour for version-less reads.
      let versionDirs: string[] = []
      try {
        versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch { return null }
      for (const versionDir of versionDirs) {
        const hit = tryRead(versionDir)
        if (hit) return hit
      }
      return null
    },
  )

  ipcMain.handle('tickets:scan', async (_event, projectDir: string): Promise<ScannedTicket[]> => {
    const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
    if (!fs.existsSync(ticketsRoot)) return []
    const out: ScannedTicket[] = []
    let versionDirs: string[] = []
    try {
      versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch { return [] }

    for (const versionDir of versionDirs) {
      const dirPath = path.join(ticketsRoot, versionDir)
      let files: string[] = []
      try {
        // Case-insensitive: ticket filenames may carry lowercase suffixes
        // (e.g. T-P4-048-em.md). The earlier [A-Z0-9-] class silently dropped
        // any such file → tickets vanished from the GUI.
        files = fs.readdirSync(dirPath).filter((f) => /^T-[A-Za-z0-9-]+\.md$/.test(f))
      } catch { continue }
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        let content: string
        try { content = fs.readFileSync(filePath, 'utf-8') } catch { continue }
        // mtime = "last touched" signal for the non-todo/done sort (T-PATCH-162).
        // statSync after a successful read; tolerate stat failure (undefined → sort fallback).
        let mtime: number | undefined
        try { mtime = fs.statSync(filePath).mtimeMs } catch { mtime = undefined }
        const fm = parseFrontmatter(content)
        const ticket_id = String(fm.ticket_id ?? path.basename(file, '.md'))
        const ticket: ScannedTicket = {
          ticket_id,
          version: (fm.version && String(fm.version).trim()) || null,
          slug: fm.slug,
          title: fm.title,
          type: fm.type,
          stage: fm.stage,
          status: fm.status,
          qa_status: fm.qa_status,
          qa_loops: typeof fm.qa_loops === 'number' ? fm.qa_loops : undefined,
          assignee: fm.assignee,
          estimated_complexity: fm.estimated_complexity,
          risk_flags: fm.risk_flags,
          requires_user_gate: typeof fm.requires_user_gate === 'boolean' ? fm.requires_user_gate : undefined,
          branch: fm.branch ?? undefined,
          worktree_path: fm.worktree_path ?? undefined,
          success_metric: fm.success_metric ?? null,
          validation_method: fm.validation_method ?? null,
          observed_result: fm.observed_result ?? null,
          started_at: fm.started_at ?? null,
          completed_at: fm.completed_at ?? null,
          duration_min: typeof fm.duration_min === 'number' ? fm.duration_min : null,
          request_summary: extractRequestSummary(content),
          path: filePath,
          mtime,
        }
        // Extract title from first H1 if not in frontmatter
        if (!ticket.title) {
          const h1 = content.match(/^#\s+(.+)$/m)
          if (h1) ticket.title = h1[1].replace(/^T-[A-Z]+-\d+:?\s*/, '').trim()
        }
        out.push(ticket)
      }
    }
    return out
  })
}
