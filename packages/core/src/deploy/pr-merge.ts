import fs from 'fs'
import path from 'path'
import os from 'os'
import { createDeployment } from './vercel'
import type { CreateDeploymentOptions, DeploymentResult } from './vercel'
import { getVercelToken } from '../settings/ui-settings'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrMergeErrorReason =
  | 'not-mergeable'
  | 'merge-conflict'
  | 'github-fail'
  | 'vercel-trigger-fail'
  | 'generic'

export class PrMergeError extends Error {
  constructor(
    message: string,
    public readonly reason: PrMergeErrorReason,
  ) {
    super(message)
    this.name = 'PrMergeError'
  }
}

export interface SquashMergePROptions {
  owner: string
  repo: string
  prNumber: number
  commitTitle: string
  commitBody?: string
}

export interface SquashMergePRResult {
  mergedSha: string
}

export interface TriggerVercelDeployOptions {
  projectDir: string
  project: string
  /** The git ref to deploy (defaults to 'main') */
  gitRef?: string
  deployOptions?: CreateDeploymentOptions
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

/**
 * Resolve Vercel API token.
 * Priority order (OQ-T022-1 (b)):
 *   1. ~/.productune/settings.json integrations.vercel.token (GUI-managed)
 *   2. <projectDir>/productune.env  VERCEL_TOKEN= line  (legacy / CI paths)
 *   3. ~/.productune/productune.env VERCEL_TOKEN= line  (home fallback)
 */
function resolveVercelTokenForDeploy(projectDir: string): string | null {
  // 1. settings.json (OQ-T022-1 (b) — "외부 연결" sub-tab)
  const settingsToken = getVercelToken()
  if (settingsToken) return settingsToken

  // 2 & 3. Legacy productune.env fallback
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
          if (val) return val
        }
      }
    } catch { /* unreadable */ }
  }
  return null
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
    throw new PrMergeError('GitHub authentication failed', 'github-fail')
  }
  return res
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Squash-merge a PR using GitHub REST API.
 * `commitTitle` becomes the single squash commit subject line.
 * Returns the merge SHA.
 */
export async function squashMergePR(
  opts: SquashMergePROptions,
): Promise<SquashMergePRResult> {
  const token = loadGitHubToken()
  if (!token) {
    throw new PrMergeError('GitHub credentials not found', 'github-fail')
  }

  // First verify the PR is mergeable
  const prRes = await ghFetch(`/repos/${opts.owner}/${opts.repo}/pulls/${opts.prNumber}`, token)
  if (!prRes.ok) {
    const text = await prRes.text().catch(() => '')
    throw new PrMergeError(`PR fetch failed (${prRes.status}): ${text}`, 'github-fail')
  }
  const prData = await prRes.json() as {
    mergeable: boolean | null
    mergeable_state: string
    state: string
  }

  if (prData.state === 'closed') {
    throw new PrMergeError('PR is already closed', 'not-mergeable')
  }
  if (prData.mergeable === false) {
    throw new PrMergeError('PR has conflicts and cannot be merged', 'merge-conflict')
  }
  // mergeable === null means GitHub is still computing — treat as not ready
  if (prData.mergeable === null && prData.mergeable_state === 'unknown') {
    throw new PrMergeError('PR mergeability is still being computed — retry shortly', 'not-mergeable')
  }

  // Squash merge
  const mergeRes = await ghFetch(
    `/repos/${opts.owner}/${opts.repo}/pulls/${opts.prNumber}/merge`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: 'squash',
        commit_title: opts.commitTitle,
        commit_message: opts.commitBody ?? '',
      }),
    },
  )

  if (mergeRes.status === 405) {
    throw new PrMergeError('Squash merge is not allowed for this repository', 'not-mergeable')
  }
  if (mergeRes.status === 409) {
    throw new PrMergeError('Merge conflict — the PR cannot be merged as-is', 'merge-conflict')
  }
  if (!mergeRes.ok) {
    const text = await mergeRes.text().catch(() => '')
    throw new PrMergeError(`Merge failed (${mergeRes.status}): ${text}`, 'github-fail')
  }

  const mergeData = await mergeRes.json() as { sha: string; merged: boolean }
  if (!mergeData.merged) {
    throw new PrMergeError('Merge reported not merged — unexpected state', 'github-fail')
  }

  return { mergedSha: mergeData.sha }
}

/**
 * Trigger a Vercel production deployment after merge.
 * gitRef defaults to 'main' (the base branch post-merge).
 */
export async function triggerVercelDeployAfterMerge(
  opts: TriggerVercelDeployOptions,
): Promise<DeploymentResult> {
  const vercelToken = resolveVercelTokenForDeploy(opts.projectDir)
  if (!vercelToken) {
    throw new PrMergeError('VERCEL_TOKEN not found — check Settings', 'vercel-trigger-fail')
  }

  try {
    const result = await createDeployment(
      opts.project,
      opts.gitRef ?? 'main',
      { target: 'production', ...opts.deployOptions },
      vercelToken,
    )
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new PrMergeError(`Vercel deploy trigger failed: ${msg}`, 'vercel-trigger-fail')
  }
}
