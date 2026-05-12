/**
 * deploy-events.ts — Vercel REST deploy event fetch + cross-reference (T-P4-023 sub-c).
 *
 * Fetches Vercel deployments via REST /v6/deployments and enriches them with
 * ticket-id mentions from autosave commit messages (T-P4-021 format cross-ref).
 *
 * Token resolution: reads VERCEL_TOKEN from <projectDir>/productune.env,
 * then falls back to process.env.VERCEL_TOKEN.
 *
 * Cache: in-memory 5min TTL per (project, since, until) tuple.
 *
 * Node.js only — called from Electron main via IPC (`deploy:fetch-events`).
 */

import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeployEvent {
  /** Vercel deployment id (e.g. "dpl_xxx"). */
  deploymentId: string
  /** Deployment URL (e.g. "https://xxx.vercel.app"). */
  url: string
  /** ISO 8601 timestamp when the deployment was created. */
  createdAt: string
  /** ISO 8601 timestamp when ready (null if not yet ready). */
  readyAt: string | null
  /** Vercel state: QUEUED | BUILDING | READY | ERROR | CANCELED */
  state: string
  /** Git ref (branch or sha) used for this deployment. */
  gitRef: string | null
  /** Ticket IDs found to be included in this deployment (cross-reference). */
  includedTickets: string[]
  /** Set of commit SHAs associated with this deployment (cross-reference). */
  mergedShaSet: string[]
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  events: DeployEvent[]
  fetchedAt: number
}

const TTL_MS = 5 * 60 * 1000  // 5 minutes

// Key: `${project}:${sinceIso}:${untilIso}`
const cache = new Map<string, CacheEntry>()

// ── Token resolution ──────────────────────────────────────────────────────────

/**
 * Resolve Vercel token from:
 *   1. <projectDir>/productune.env VERCEL_TOKEN line
 *   2. process.env.VERCEL_TOKEN
 * Returns null if neither is found.
 */
export function resolveVercelToken(projectDir?: string): string | null {
  if (projectDir) {
    const envPath = path.join(projectDir, 'productune.env')
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (trimmed.startsWith('VERCEL_TOKEN=')) {
            const val = trimmed.slice('VERCEL_TOKEN='.length).trim()
            if (val) return val
          }
        }
      }
    } catch {
      // unreadable — fall through
    }
  }
  return process.env.VERCEL_TOKEN ?? null
}

// ── Cross-reference helpers ───────────────────────────────────────────────────

/** Extract ticket IDs (T-NNN-NNN pattern) from a string. */
function extractTicketIds(text: string): string[] {
  const ids: string[] = []
  const re = /T-[A-Z]\d+-\d+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    ids.push(m[0])
  }
  return ids
}

/** Extract a 40-char hex SHA from a string. */
function extractShas(text: string): string[] {
  const shas: string[] = []
  const re = /\b[0-9a-f]{40}\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    shas.push(m[0].toLowerCase())
  }
  return shas
}

// ── Vercel REST fetch ─────────────────────────────────────────────────────────

const VERCEL_API = 'https://api.vercel.com'

interface VercelDeploymentRaw {
  uid: string
  url: string
  createdAt: number
  ready?: number
  readyState: string
  meta?: {
    githubCommitRef?: string
    githubCommitSha?: string
    gitlabCommitRef?: string
    bitbucketCommitRef?: string
    branchAlias?: string
  }
  name: string
  gitSource?: {
    ref?: string
    sha?: string
  }
}

/**
 * Fetch Vercel deployments for `projectName` between `sinceIso` and `untilIso`.
 * Returns [] on token missing / REST failure (graceful).
 */
export async function fetchVercelDeploys(
  projectName: string,
  sinceIso: string,
  untilIso: string,
  projectDir?: string,
): Promise<DeployEvent[]> {
  const cacheKey = `${projectName}:${sinceIso}:${untilIso}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.events
  }

  const token = resolveVercelToken(projectDir)
  if (!token) {
    console.warn('[deploy-events] VERCEL_TOKEN not found — skipping deploy fetch')
    return []
  }

  const since = new Date(sinceIso).getTime()
  const until = new Date(untilIso).getTime()
  if (isNaN(since) || isNaN(until)) {
    console.warn('[deploy-events] Invalid since/until ISO — skipping')
    return []
  }

  try {
    const params = new URLSearchParams({
      app: projectName,
      since: String(since),
      until: String(until),
      limit: '50',
    })
    const res = await fetch(`${VERCEL_API}/v6/deployments?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.warn(`[deploy-events] REST /v6/deployments failed (${res.status})`)
      return []
    }

    const data = await res.json() as { deployments?: VercelDeploymentRaw[] }
    const raws: VercelDeploymentRaw[] = data.deployments ?? []

    const events: DeployEvent[] = raws.map((raw) => {
      // Extract ticket IDs from meta fields (PR title, branch name, commit msg)
      const textForCrossRef = [
        raw.meta?.githubCommitRef ?? '',
        raw.meta?.githubCommitSha ?? '',
        raw.gitSource?.ref ?? '',
        raw.gitSource?.sha ?? '',
        raw.name ?? '',
      ].join(' ')

      const includedTickets = Array.from(new Set(extractTicketIds(textForCrossRef)))
      const mergedShaSet = Array.from(new Set([
        ...(raw.meta?.githubCommitSha ? [raw.meta.githubCommitSha.toLowerCase()] : []),
        ...(raw.gitSource?.sha ? [raw.gitSource.sha.toLowerCase()] : []),
        ...extractShas(textForCrossRef),
      ]))

      return {
        deploymentId: raw.uid,
        url: `https://${raw.url}`,
        createdAt: new Date(raw.createdAt).toISOString(),
        readyAt: raw.ready != null ? new Date(raw.ready).toISOString() : null,
        state: raw.readyState ?? 'QUEUED',
        gitRef: raw.meta?.githubCommitRef ?? raw.gitSource?.ref ?? null,
        includedTickets,
        mergedShaSet,
      }
    })

    cache.set(cacheKey, { events, fetchedAt: Date.now() })
    return events
  } catch (err) {
    console.warn('[deploy-events] Fetch error:', err instanceof Error ? err.message : String(err))
    return []
  }
}

/** Evict all cache entries (useful for testing). */
export function clearDeployEventCache(): void {
  cache.clear()
}
