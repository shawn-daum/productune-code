import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readGitRules } from './rules'

const execFileAsync = promisify(execFile)

export type AutosaveChangeReason =
  | 'status-change'
  | 'qa-status-change'
  | 'qa-loops-change'
  | 'manual'

export type AutosaveSkipReason =
  | 'diff-empty'
  | 'base-worktree'
  | 'snapshot-init'
  | 'worktree-missing'
  | 'manager-error'

export interface AutosaveCommitResult {
  committed: true
  sha: string
  changeReason: AutosaveChangeReason
  before: string
  after: string
  summary: string
  committedAt: string
}

export interface AutosaveSkipResult {
  committed: false
  skipReason: AutosaveSkipReason
  detail?: string
}

export type AutosaveResult = AutosaveCommitResult | AutosaveSkipResult

interface TicketSnapshot {
  status: string | null
  qa_status: string | null
  qa_loops: number | null
  lastCheckedAt: string
}

interface SnapshotFile {
  projectDir: string
  tickets: Record<string, TicketSnapshot>
}

function projectHash(projectDir: string): string {
  return crypto.createHash('sha1').update(projectDir).digest('hex')
}

function snapshotPath(projectDir: string): string {
  const dir = path.join(os.homedir(), '.productune', 'state', 'autosave-snapshots')
  return path.join(dir, `${projectHash(projectDir)}.json`)
}

function loadSnapshot(projectDir: string): SnapshotFile {
  const fp = snapshotPath(projectDir)
  try {
    const raw = fs.readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw) as SnapshotFile
    if (parsed && typeof parsed === 'object' && parsed.tickets) return parsed
  } catch {
    // missing or corrupt — return empty
  }
  return { projectDir, tickets: {} }
}

function saveSnapshot(projectDir: string, data: SnapshotFile): void {
  const fp = snapshotPath(projectDir)
  const dir = path.dirname(fp)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = fp + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, fp)
}

function parseFrontmatter(content: string): Record<string, any> {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, any> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    let val: any = m[2].trim()
    if (val === '' || val === 'null') val = null
    else if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (/^-?\d+$/.test(val)) val = Number(val)
    else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    out[m[1]] = val
  }
  return out
}

function extractPersonaActivitySummary(content: string): string | null {
  const lines = content.split('\n')
  let inTable = false
  let lastResult: string | null = null
  for (const line of lines) {
    if (/^\|\s*When\s*\|/.test(line)) { inTable = true; continue }
    if (!inTable) continue
    if (/^\|[-\s|]+\|/.test(line)) continue
    if (!line.startsWith('|')) { inTable = false; continue }
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cols.length >= 5) lastResult = cols[4] ?? null
  }
  return lastResult
}

function buildSummary(content: string, fm: Record<string, any>): string {
  const fromActivity = extractPersonaActivitySummary(content)
  if (fromActivity && fromActivity.trim()) return truncate(fromActivity, 80)
  const title = String(fm.ticket_id ?? '').trim()
  if (title) return truncate(title, 80)
  return 'autosave trigger'
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

function worktreePathFromFrontmatter(projectDir: string, fm: Record<string, any>): string | null {
  const wtp = fm.worktree_path
  if (!wtp || typeof wtp !== 'string') return null
  if (wtp.trim() === '' || wtp.trim() === 'null') return null
  const resolved = path.isAbsolute(wtp) ? wtp : path.join(projectDir, wtp)
  if (!fs.existsSync(resolved)) return null
  if (resolved === projectDir) return null
  return resolved
}

function findTicketPath(projectDir: string, ticketId: string): string | null {
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  if (!fs.existsSync(ticketsRoot)) return null
  let versionDirs: string[]
  try {
    versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return null
  }
  for (const vd of versionDirs) {
    const candidate = path.join(ticketsRoot, vd, `${ticketId}.md`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export interface DetectChangeResult {
  changed: boolean
  changeReason?: AutosaveChangeReason
  before?: string
  after?: string
  snapshot: SnapshotFile
  current: TicketSnapshot
  isInit: boolean
}

export function detectChange(projectDir: string, ticketId: string, content: string): DetectChangeResult {
  const fm = parseFrontmatter(content)
  const current: TicketSnapshot = {
    status: fm.status ?? null,
    qa_status: fm.qa_status ?? null,
    qa_loops: typeof fm.qa_loops === 'number' ? fm.qa_loops : null,
    lastCheckedAt: new Date().toISOString(),
  }

  const snapshot = loadSnapshot(projectDir)
  const prev = snapshot.tickets[ticketId]

  if (!prev) {
    return { changed: false, snapshot, current, isInit: true }
  }

  if (String(prev.status ?? '') !== String(current.status ?? '')) {
    return {
      changed: true,
      changeReason: 'status-change',
      before: String(prev.status ?? ''),
      after: String(current.status ?? ''),
      snapshot,
      current,
      isInit: false,
    }
  }
  if (String(prev.qa_status ?? '') !== String(current.qa_status ?? '')) {
    return {
      changed: true,
      changeReason: 'qa-status-change',
      before: String(prev.qa_status ?? ''),
      after: String(current.qa_status ?? ''),
      snapshot,
      current,
      isInit: false,
    }
  }
  if (String(prev.qa_loops ?? '') !== String(current.qa_loops ?? '')) {
    return {
      changed: true,
      changeReason: 'qa-loops-change',
      before: String(prev.qa_loops ?? ''),
      after: String(current.qa_loops ?? ''),
      snapshot,
      current,
      isInit: false,
    }
  }

  return { changed: false, snapshot, current, isInit: false }
}

async function hasDiff(worktreePath: string, ticketFilePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain', ticketFilePath],
      { cwd: worktreePath },
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function gitCommit(
  worktreePath: string,
  ticketFilePath: string,
  message: string,
): Promise<string> {
  await execFileAsync('git', ['add', ticketFilePath], { cwd: worktreePath })
  await execFileAsync('git', ['commit', '-m', message, '--allow-empty-message'], { cwd: worktreePath })
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
  return stdout.trim()
}

export async function triggerAutosave(
  projectDir: string,
  ticketId: string,
  changeReason: AutosaveChangeReason,
  before: string,
  after: string,
): Promise<AutosaveResult> {
  const ticketFilePath = findTicketPath(projectDir, ticketId)
  if (!ticketFilePath) {
    return { committed: false, skipReason: 'manager-error', detail: 'ticket file not found' }
  }

  let content: string
  try {
    content = fs.readFileSync(ticketFilePath, 'utf-8')
  } catch {
    return { committed: false, skipReason: 'manager-error', detail: 'cannot read ticket file' }
  }

  const fm = parseFrontmatter(content)
  const worktreePath = worktreePathFromFrontmatter(projectDir, fm)

  if (!worktreePath) {
    return { committed: false, skipReason: 'base-worktree' }
  }

  const diffExists = await hasDiff(worktreePath, ticketFilePath)
  if (!diffExists) {
    return { committed: false, skipReason: 'diff-empty' }
  }

  const summary = buildSummary(content, fm)
  const message = `${ticketId} [${changeReason}: ${before}→${after}] ${summary}`

  const attempt = async (): Promise<string> => {
    return gitCommit(worktreePath, ticketFilePath, message)
  }

  let sha: string
  try {
    sha = await attempt()
  } catch {
    try {
      sha = await attempt()
    } catch (e: any) {
      return { committed: false, skipReason: 'manager-error', detail: e?.message ?? 'git commit failed' }
    }
  }

  const rules = readGitRules(projectDir)
  void rules

  return {
    committed: true,
    sha,
    changeReason,
    before,
    after,
    summary,
    committedAt: new Date().toISOString(),
  }
}

export function getSnapshot(projectDir: string, ticketId: string): TicketSnapshot | null {
  const snap = loadSnapshot(projectDir)
  return snap.tickets[ticketId] ?? null
}

export function setSnapshot(projectDir: string, ticketId: string, snap: TicketSnapshot): void {
  const data = loadSnapshot(projectDir)
  data.tickets[ticketId] = snap
  saveSnapshot(projectDir, data)
}

export function processTicketFileChange(
  projectDir: string,
  ticketFilePath: string,
): { ticketId: string; result: DetectChangeResult } | null {
  let content: string
  try {
    content = fs.readFileSync(ticketFilePath, 'utf-8')
  } catch {
    return null
  }

  const fm = parseFrontmatter(content)
  const ticketId = String(fm.ticket_id ?? path.basename(ticketFilePath, '.md'))

  const result = detectChange(projectDir, ticketId, content)

  const snap = loadSnapshot(projectDir)
  snap.tickets[ticketId] = result.current
  saveSnapshot(projectDir, snap)

  return { ticketId, result }
}
