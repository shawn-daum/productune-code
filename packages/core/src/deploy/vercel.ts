const VERCEL_API = 'https://api.vercel.com'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeploymentState = 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED'

export interface CreateDeploymentOptions {
  target?: 'production' | 'staging' | 'preview'
  teamId?: string
}

export interface DeploymentResult {
  deploymentId: string
  deploymentUrl: string
  state: DeploymentState
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function vercelFetch(
  path: string,
  token: string,
  opts: RequestInit = {},
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt)
    try {
      const res = await fetch(`${VERCEL_API}${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(opts.headers ?? {}),
        },
      })
      if (res.status === 401) {
        throw Object.assign(new Error('VERCEL_AUTH_FAILED'), { code: 'auth' as const })
      }
      return res
    } catch (err) {
      if ((err as any).code === 'auth') throw err
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error('Network request failed after retries')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trigger a Vercel deployment for a project + git ref.
 * Returns deploymentId, deploymentUrl, and initial state.
 * Throws with .code === 'auth' on 401 (token expired).
 */
export async function createDeployment(
  project: string,
  gitRef: string,
  options: CreateDeploymentOptions,
  token: string,
): Promise<DeploymentResult> {
  const teamQuery = options.teamId ? `?teamId=${encodeURIComponent(options.teamId)}` : ''
  const body: Record<string, unknown> = {
    name: project,
    gitSource: {
      type: 'github',
      ref: gitRef,
    },
    target: options.target ?? 'production',
  }

  const res = await vercelFetch(`/v13/deployments${teamQuery}`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Vercel createDeployment failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { id: string; url: string; readyState: string }
  return {
    deploymentId: data.id,
    deploymentUrl: `https://${data.url}`,
    state: (data.readyState as DeploymentState) ?? 'QUEUED',
  }
}

/**
 * Poll deployment state. Returns current DeploymentState.
 * Throws with .code === 'auth' on 401.
 */
export async function getDeploymentState(
  deploymentId: string,
  token: string,
  teamId?: string,
): Promise<DeploymentState> {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const res = await vercelFetch(`/v13/deployments/${encodeURIComponent(deploymentId)}${teamQuery}`, token)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Vercel getDeploymentState failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { readyState: string }
  return (data.readyState as DeploymentState) ?? 'QUEUED'
}

/**
 * Cancel a deployment.
 * Phase 5 placeholder — throws not-implemented until wired.
 */
export async function cancelDeployment(
  _deploymentId: string,
  _token: string,
): Promise<void> {
  throw Object.assign(new Error('cancelDeployment is not implemented (Phase 5)'), {
    code: 'not-implemented' as const,
  })
}
