import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import type { PendingPromotion } from '@productune/core'

export type WikiBackend = 'graphiti' | 'keeper' | 'fs'

function readWikiBackend(): WikiBackend {
  try {
    const envPath = path.join(os.homedir(), '.productune', 'productune.env')
    const raw = fs.readFileSync(envPath, 'utf-8')
    const match = raw.match(/^WIKI_BACKEND=(\S+)/m)
    const val = match?.[1]?.trim()
    if (val === 'graphiti' || val === 'keeper' || val === 'fs') return val
  } catch { /* fallback */ }
  return 'fs'
}

// ── tier: project ─────────────────────────────────────────────────────────────

function writeProject(target: string, delta: string): void {
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  const line = delta.endsWith('\n') ? delta : delta + '\n'
  fs.appendFileSync(target, line, 'utf-8')
}

// ── tier: work-note ───────────────────────────────────────────────────────────

function writeWorkNote(target: string, delta: string): void {
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(target)) {
    // New file — write with a minimal header
    fs.writeFileSync(target, delta + '\n', 'utf-8')
  } else {
    const line = delta.endsWith('\n') ? delta : delta + '\n'
    fs.appendFileSync(target, line, 'utf-8')
  }
}

// ── tier: wiki / fs backend ───────────────────────────────────────────────────

function writeWikiFs(persona: string, episodeName: string, episodeBody: string): void {
  const wikiDir = path.join(os.homedir(), '.productune', 'wiki', persona)
  fs.mkdirSync(wikiDir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = episodeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const filename = `${ts}--${slug}.md`
  const filePath = path.join(wikiDir, filename)

  const content =
    `---\npersona: ${persona}\nepisode_name: ${episodeName}\ncreated_at: ${new Date().toISOString()}\nsuperseded_by: null\nrelated: []\n---\n\n` +
    episodeBody +
    '\n'
  fs.writeFileSync(filePath, content, 'utf-8')

  // Rebuild INDEX.md
  rebuildWikiIndex(wikiDir)
}

function rebuildWikiIndex(wikiDir: string): void {
  const indexPath = path.join(wikiDir, 'INDEX.md')
  const entries: string[] = []
  let files: string[]
  try {
    files = fs.readdirSync(wikiDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md')
  } catch {
    return
  }
  files.sort()
  for (const file of files) {
    const full = path.join(wikiDir, file)
    try {
      const raw = fs.readFileSync(full, 'utf-8')
      const lines = raw.split('\n')
      // Pull created_at from frontmatter
      const dateLine = lines.find((l) => l.startsWith('created_at:'))
      const date = dateLine ? dateLine.replace('created_at:', '').trim().slice(0, 10) : '?'
      const superseded = lines.some((l) => l.startsWith('superseded_by:') && !l.includes('null'))
      const nameLine = lines.find((l) => l.startsWith('episode_name:'))
      const name = nameLine ? nameLine.replace('episode_name:', '').trim() : file
      // First non-frontmatter line as excerpt
      const bodyStart = lines.findIndex((l, i) => i > 0 && l === '---') + 1
      const excerpt = (lines[bodyStart] ?? '').slice(0, 80)
      const status = superseded ? 'superseded' : 'active'
      entries.push(`[${date}] ${name} [${status}] — ${excerpt}`)
    } catch { /* skip */ }
  }
  fs.writeFileSync(indexPath, `# Wiki index\n\n${entries.join('\n')}\n`, 'utf-8')
}

// ── tier: wiki / graphiti backend (fire-and-forget) ──────────────────────────

function writeWikiGraphiti(
  sessionId: string,
  groupId: string,
  episodeName: string,
  episodeBody: string,
  jobId: string,
): void {
  const jobsDir = path.join(os.homedir(), '.productune', 'wiki-jobs')
  fs.mkdirSync(jobsDir, { recursive: true })
  const pendingFile = path.join(jobsDir, `${jobId}.pending`)
  const logFile = path.join(jobsDir, `${jobId}.log`)
  fs.writeFileSync(pendingFile, JSON.stringify({ groupId, episodeName, jobId, started_at: new Date().toISOString() }), 'utf-8')

  const prompt =
    `[PROMOTION-APPROVED] mcp__graphiti__add_memory: group_id="${groupId}" name="${episodeName}" episode_body="${episodeBody.replace(/"/g, '\\"')}". Confirm only.`

  const args = ['--resume', sessionId, '--print', '--output-format', 'json', prompt]
  const child = spawn('claude', args, {
    detached: true,
    stdio: ['ignore', fs.openSync(logFile, 'w'), fs.openSync(logFile, 'a')],
  })
  child.unref()

  // Mark done on child exit — best-effort
  child.on('exit', () => {
    try {
      fs.renameSync(pendingFile, path.join(jobsDir, `${jobId}.done`))
    } catch { /* ok */ }
  })
}

// ── tier: wiki / keeper backend (sync) ────────────────────────────────────────

async function writeWikiKeeper(
  persona: string,
  episodeName: string,
  episodeBody: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const prompt = `WRITE [PROMOTION-APPROVED]\npersona: ${persona}\nepisode_name: ${episodeName}\nepisode_body: ${episodeBody}`
    const child = spawn('claude', ['--agent', 'pdt-wiki-keeper', '--model', 'haiku', '--print', '--output-format', 'json', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`wiki-keeper exited ${code}`))
    })
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MechanicalWriteResult {
  ok: boolean
  error?: string
  jobId?: string  // only for graphiti background jobs
}

/**
 * Execute the mechanical write for an approved/edited promotion.
 * projectDir is needed to resolve project-tier paths.
 */
export async function mechanicalWrite(
  promotion: PendingPromotion,
  opts?: { claudeSessionId?: string },
): Promise<MechanicalWriteResult> {
  const { tier, target, delta } = promotion
  // For edited promotions, use final_target if provided (overrides target)
  const effectiveTarget = promotion.final_target ?? target
  const effectiveDelta = promotion.final_target ?? delta

  try {
    if (tier === 'project') {
      writeProject(effectiveTarget, effectiveDelta)
      return { ok: true }
    }

    if (tier === 'work-note') {
      writeWorkNote(effectiveTarget, effectiveDelta)
      return { ok: true }
    }

    if (tier === 'wiki') {
      const backend = readWikiBackend()
      // Parse episodeName from delta (first line or full delta if single-line)
      const lines = effectiveDelta.split('\n').filter(Boolean)
      const episodeName = lines[0]?.slice(0, 120) ?? effectiveDelta.slice(0, 120)
      const episodeBody = effectiveDelta

      if (backend === 'fs') {
        writeWikiFs(effectiveTarget, episodeName, episodeBody)
        return { ok: true }
      }

      if (backend === 'graphiti') {
        const sessionId = opts?.claudeSessionId ?? ''
        if (!sessionId) {
          // Fallback to fs if no session available
          writeWikiFs(effectiveTarget, episodeName, episodeBody)
          return { ok: true }
        }
        const jobId = `wiki-${promotion.id}-${Date.now()}`
        writeWikiGraphiti(sessionId, effectiveTarget, episodeName, episodeBody, jobId)
        return { ok: true, jobId }
      }

      if (backend === 'keeper') {
        await writeWikiKeeper(effectiveTarget, episodeName, episodeBody)
        return { ok: true }
      }

      return { ok: false, error: `unknown wiki backend: ${backend}` }
    }

    return { ok: false, error: `unknown tier: ${tier}` }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
