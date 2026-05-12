import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const SLUG_MAX = 25

export interface BranchNameArgs {
  ticketId: string
  slug: string
  type: 'feature' | 'fix'
  prefixes: { feature: string; fix: string }
}

function truncateSlug(slug: string): string {
  if (slug.length <= SLUG_MAX) return slug
  const cut = slug.slice(0, SLUG_MAX)
  const lastDash = cut.lastIndexOf('-')
  return lastDash > 0 ? cut.slice(0, lastDash) : cut
}

export function buildBranchName(args: BranchNameArgs): string {
  const prefix = args.type === 'fix' ? args.prefixes.fix : args.prefixes.feature
  const slug = truncateSlug(args.slug)
  return `${prefix}${args.ticketId}/${slug}`
}

export async function resolveBranchConflict(
  projectDir: string,
  baseName: string,
): Promise<string> {
  const exists = async (name: string): Promise<boolean> => {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', name], { cwd: projectDir })
      return true
    } catch {
      return false
    }
  }

  if (!(await exists(baseName))) return baseName

  for (let i = 2; i <= 20; i++) {
    const candidate = `${baseName}-${i}`
    if (!(await exists(candidate))) return candidate
  }

  return `${baseName}-${Date.now()}`
}
