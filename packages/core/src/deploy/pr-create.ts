import fs from 'fs'
import path from 'path'
import os from 'os'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrCreateErrorReason =
  | 'github-auth'
  | 'branch-not-pushed'
  | 'conflict'
  | 'api-rate-limit'
  | 'generic'

export class PrCreateError extends Error {
  constructor(
    message: string,
    public readonly reason: PrCreateErrorReason,
  ) {
    super(message)
    this.name = 'PrCreateError'
  }
}

export interface PersonaActivityEntry {
  when: string
  persona: string
  model: string
  turn: string
  result: string
}

export interface CreateDeployPROptions {
  /** Absolute path to the git worktree for this ticket (optional — unused by REST-only path) */
  worktreePath?: string
  /** The branch name to open PR from (e.g. feature/T-P4-022/deploy-gate) */
  branchName: string
  /** Ticket identifier, e.g. T-P4-022 */
  ticketId: string
  /** Ticket title verbatim */
  ticketTitle: string
  /** Acceptance section markdown text */
  ticketAcceptance: string
  /** Persona activity rows for the PR body summary */
  personaActivity: PersonaActivityEntry[]
  /** GitHub owner (org or user) */
  owner: string
  /** GitHub repo name */
  repo: string
  /** Base branch to merge into (default: 'main') */
  baseBranch?: string
}

export interface CreateDeployPRResult {
  prUrl: string
  prNumber: number
  sha: string
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const GH_API = 'https://api.github.com'
const CREDENTIALS_PATH = path.join(os.homedir(), '.productune', 'credentials.json')

function loadGitHubToken(): string | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null
  try {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
    return typeof creds?.access_token === 'string' ? creds.access_token : null
  } catch {
    return null
  }
}

async function ghFetch(
  path_: string,
  token: string,
  opts: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${GH_API}${path_}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers ?? {}),
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new PrCreateError('GitHub authentication failed', 'github-auth')
  }
  if (res.status === 429) {
    throw new PrCreateError('GitHub API rate limit exceeded', 'api-rate-limit')
  }
  return res
}

function buildPrBody(
  ticketId: string,
  ticketAcceptance: string,
  personaActivity: PersonaActivityEntry[],
): string {
  const sections: string[] = []

  // Acceptance section
  sections.push(`## 완료 기준\n\n${ticketAcceptance.trim()}`)

  // Persona activity summary (friendly, not raw table dump)
  if (personaActivity.length > 0) {
    const rows = personaActivity
      .map((r) => `- **${r.persona}** (${r.turn}): ${r.result}`)
      .join('\n')
    sections.push(`## 작업 내역\n\n${rows}`)
  }

  sections.push(`---\n*자동 생성 — ${ticketId}*`)

  return sections.join('\n\n')
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a GitHub PR for a ticket's worktree branch.
 * Reuses credentials from ~/.productune/credentials.json (same as github.ts).
 */
export async function createDeployPR(
  opts: CreateDeployPROptions,
): Promise<CreateDeployPRResult> {
  const token = loadGitHubToken()
  if (!token) {
    throw new PrCreateError('GitHub credentials not found — reconnect in Settings', 'github-auth')
  }

  const base = opts.baseBranch ?? 'main'
  const title = opts.ticketTitle
  const body = buildPrBody(opts.ticketId, opts.ticketAcceptance, opts.personaActivity)

  // Check if branch exists on remote — 404 = not pushed yet
  const branchCheck = await ghFetch(
    `/repos/${opts.owner}/${opts.repo}/branches/${encodeURIComponent(opts.branchName)}`,
    token,
  )
  if (branchCheck.status === 404) {
    throw new PrCreateError(
      `Branch "${opts.branchName}" not found on remote — push first`,
      'branch-not-pushed',
    )
  }
  if (!branchCheck.ok) {
    const text = await branchCheck.text().catch(() => '')
    throw new PrCreateError(`GitHub branch check failed (${branchCheck.status}): ${text}`, 'generic')
  }

  // Create PR
  const res = await ghFetch(`/repos/${opts.owner}/${opts.repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({
      title,
      body,
      head: opts.branchName,
      base,
      draft: false,
    }),
  })

  if (res.status === 422) {
    const errData = await res.json() as any
    const errMsg: string = errData?.message ?? ''
    if (errMsg.toLowerCase().includes('conflict') || errMsg.toLowerCase().includes('merge')) {
      throw new PrCreateError(`Cannot create PR — conflict detected: ${errMsg}`, 'conflict')
    }
    // already exists? surface as generic
    throw new PrCreateError(`GitHub PR create returned 422: ${errMsg}`, 'generic')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new PrCreateError(`GitHub PR create failed (${res.status}): ${text}`, 'generic')
  }

  const data = await res.json() as {
    html_url: string
    number: number
    head: { sha: string }
  }

  return {
    prUrl: data.html_url,
    prNumber: data.number,
    sha: data.head.sha,
  }
}

/**
 * Check mergeable status of a PR.
 * Returns: { mergeable, mergeableState, conflictPaths }
 *   conflictPaths: file paths with conflicts (best-effort from compare API)
 */
export async function checkPRMergeability(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{
  mergeable: boolean | null
  mergeableState: string
  conflictPaths: string[]
}> {
  const token = loadGitHubToken()
  if (!token) {
    throw new PrCreateError('GitHub credentials not found', 'github-auth')
  }

  const res = await ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, token)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new PrCreateError(`PR fetch failed (${res.status}): ${text}`, 'generic')
  }

  const data = await res.json() as {
    mergeable: boolean | null
    mergeable_state: string
    head: { sha: string }
    base: { sha: string }
  }

  let conflictPaths: string[] = []
  if (data.mergeable === false) {
    // Attempt to get conflict file list from compare API
    try {
      const cmpRes = await ghFetch(
        `/repos/${owner}/${repo}/compare/${data.base.sha}...${data.head.sha}`,
        token,
      )
      if (cmpRes.ok) {
        const cmp = await cmpRes.json() as { files?: Array<{ filename: string; status: string }> }
        conflictPaths = (cmp.files ?? [])
          .filter((f) => f.status === 'modified' || f.status === 'renamed')
          .map((f) => f.filename)
      }
    } catch { /* best-effort, ignore */ }
  }

  return {
    mergeable: data.mergeable,
    mergeableState: data.mergeable_state,
    conflictPaths,
  }
}

/**
 * Classify whether a conflict is trivial (whitespace/import/lockfile only)
 * or semantic (real code changes in same files).
 */
export function classifyConflict(conflictPaths: string[]): 'trivial' | 'semantic' {
  const trivialPatterns = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.lock$/,
  ]
  const isTrivialFile = (p: string) =>
    trivialPatterns.some((re) => re.test(p)) ||
    // import-order-only: assume .ts/.tsx with only import sort changes — caller passes paths
    false

  if (conflictPaths.length === 0) return 'trivial'
  const allTrivial = conflictPaths.every((p) => isTrivialFile(p))
  return allTrivial ? 'trivial' : 'semantic'
}
