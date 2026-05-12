import os from 'os'
import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TicketRef {
  ticket_id: string
  title?: string
  version?: string | null
}

export interface DeployReadinessResult {
  ready: boolean
  candidates: TicketRef[]
  reason?: string
}

// ── In-memory snooze store ────────────────────────────────────────────────────

interface SnoozeEntry {
  dismissedAt: number
  ticketIds: string[]
}

const snoozeMap = new Map<string, SnoozeEntry>()
const SNOOZE_MS = 30 * 60 * 1000

/** Mark dismiss — blocks re-trigger for 30 min on the same ticket set. */
export function dismissDeployTrigger(projectDir: string, ticketIds: string[]): void {
  const key = snoozeKey(projectDir, ticketIds)
  snoozeMap.set(key, { dismissedAt: Date.now(), ticketIds })
}

function snoozeKey(projectDir: string, ticketIds: string[]): string {
  return `${projectDir}::${[...ticketIds].sort().join(',')}`
}

function isSnoozed(projectDir: string, ticketIds: string[]): boolean {
  const key = snoozeKey(projectDir, ticketIds)
  const entry = snoozeMap.get(key)
  if (!entry) return false
  if (Date.now() - entry.dismissedAt > SNOOZE_MS) {
    snoozeMap.delete(key)
    return false
  }
  return true
}

// ── Frontmatter parser (minimal) ──────────────────────────────────────────────

function parseFrontmatterLight(content: string): Record<string, string> {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function extractH1Title(content: string): string | undefined {
  const m = content.match(/^#\s+(.+)$/m)
  return m ? m[1].replace(/^T-[A-Z]+-\d+:?\s*/, '').trim() : undefined
}

// ── Ticket scan ───────────────────────────────────────────────────────────────

interface ScannedTicketLight {
  ticket_id: string
  version?: string | null
  status?: string
  qa_status?: string
  title?: string
}

function scanTicketsLight(projectDir: string): ScannedTicketLight[] {
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  if (!fs.existsSync(ticketsRoot)) return []
  const out: ScannedTicketLight[] = []
  let versionDirs: string[] = []
  try {
    versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch { return [] }

  for (const vdir of versionDirs) {
    const dirPath = path.join(ticketsRoot, vdir)
    let files: string[] = []
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'))
    } catch { continue }

    for (const file of files) {
      const filePath = path.join(dirPath, file)
      let content: string
      try { content = fs.readFileSync(filePath, 'utf-8') } catch { continue }
      const fm = parseFrontmatterLight(content)
      out.push({
        ticket_id: fm.ticket_id ?? path.basename(file, '.md'),
        version: fm.version?.trim() || null,
        status: fm.status,
        qa_status: fm.qa_status,
        title: fm.title || extractH1Title(content),
      })
    }
  }
  return out
}

// ── VERCEL_TOKEN lookup ───────────────────────────────────────────────────────

function hasVercelToken(projectDir: string): boolean {
  const candidates = [
    path.join(projectDir, 'productune.env'),
    path.join(os.homedir(), '.productune', 'productune.env'),
  ]
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('VERCEL_TOKEN=')) {
          const val = trimmed.slice('VERCEL_TOKEN='.length).trim()
          if (val) return true
        }
      }
    } catch { /* unreadable */ }
  }
  return false
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Evaluate whether a deploy should be triggered.
 *
 * Ready when ALL of:
 *   - ≥1 ticket with status=done + qa_status=passed
 *   - VERCEL_TOKEN present (projectDir/productune.env or ~/.productune/productune.env)
 *   - no active snooze for the candidate set
 *
 * Dep-chain check: MVP — simple done check only (design plan §2.1 dep row is
 * "users alerted via chat, auto check is Phase 5").
 */
export function checkDeployReadiness(projectDir: string): DeployReadinessResult {
  if (!hasVercelToken(projectDir)) {
    return { ready: false, candidates: [], reason: 'no-vercel-token' }
  }

  const tickets = scanTicketsLight(projectDir)
  const candidates: TicketRef[] = tickets
    .filter((t) => t.status === 'done' && (t.qa_status === 'passed' || t.qa_status === 'pass'))
    .map((t) => ({ ticket_id: t.ticket_id, title: t.title, version: t.version }))

  if (candidates.length === 0) {
    return { ready: false, candidates: [], reason: 'no-ready-tickets' }
  }

  const ids = candidates.map((c) => c.ticket_id)
  if (isSnoozed(projectDir, ids)) {
    return { ready: false, candidates, reason: 'snoozed' }
  }

  return { ready: true, candidates }
}
