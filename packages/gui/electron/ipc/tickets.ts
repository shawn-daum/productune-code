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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, any> {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, any> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val: any = m[2].trim()
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
    ): Promise<{ frontmatter: Record<string, unknown>; body: string; krBody: string | null } | null> => {
      const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
      if (!fs.existsSync(ticketsRoot)) return null
      let versionDirs: string[] = []
      try {
        versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch { return null }
      // Search all version dirs for <ticketId>.md
      for (const versionDir of versionDirs) {
        const filePath = path.join(ticketsRoot, versionDir, `${ticketId}.md`)
        const resolved = path.resolve(filePath)
        const root = path.resolve(ticketsRoot)
        if (!resolved.startsWith(root + path.sep)) {
          throw new Error('path traversal rejected')
        }
        if (!fs.existsSync(filePath)) continue
        let content: string
        try { content = fs.readFileSync(filePath, 'utf-8') } catch { continue }
        const frontmatter = parseFrontmatter(content)
        const body = stripFrontmatter(content)
        const krBody = extractKrSection(body)
        return { frontmatter, body, krBody }
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
        files = fs.readdirSync(dirPath).filter((f) => /^T-[A-Z0-9-]+\.md$/.test(f))
      } catch { continue }
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        let content: string
        try { content = fs.readFileSync(filePath, 'utf-8') } catch { continue }
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
