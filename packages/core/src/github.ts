import fs from 'fs'
import path from 'path'
import os from 'os'

const CREDENTIALS_PATH = path.join(os.homedir(), '.productune', 'credentials.json')
const GH_API = 'https://api.github.com'

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface GitHubCredentials {
  access_token: string
  scope: string
  token_type: string
}

export async function startDeviceFlow(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
  })
  if (!res.ok) throw new Error(`device/code failed: ${res.status}`)
  return res.json() as Promise<DeviceCodeResponse>
}

export async function pollDeviceFlow(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  timeoutSec = 300,
): Promise<GitHubCredentials> {
  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000)
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const data = await res.json() as any
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') { intervalSec += 5; continue }
    if (data.error) throw new Error(data.error_description ?? data.error)
    if (data.access_token) {
      saveCredentials(data as GitHubCredentials)
      return data as GitHubCredentials
    }
  }
  throw new Error('OAuth timed out')
}

export function loadCredentials(): GitHubCredentials | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null
  try { return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8')) } catch { return null }
}

function saveCredentials(creds: GitHubCredentials): void {
  const dir = path.dirname(CREDENTIALS_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 })
}

export async function createPrivateRepo(token: string, name: string): Promise<{ clone_url: string; ssh_url: string }> {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ name, private: true, auto_init: true }),
  })
  if (!res.ok) {
    const err = await res.json() as any
    throw new Error(err.message ?? `createRepo failed: ${res.status}`)
  }
  return res.json() as Promise<{ clone_url: string; ssh_url: string }>
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
