/**
 * version-id.ts — T-P4-095
 * Single source of truth for version id naming rule.
 *
 * Rule: version id MUST match ^v\d+(\.\d+)?$
 * Allowed:  v1, v2, v0.1, v1.2
 * Rejected: paepyeong-v1, v1-rc, V1, version-1, 1.0
 */

export const VERSION_ID_RE = /^v\d+(\.\d+)?$/

export function isValidVersionId(id: string): boolean {
  return VERSION_ID_RE.test(id)
}

export const VERSION_ID_HINT_KO = '버전 이름 형식: v1 또는 v0.1'
export const VERSION_ID_HINT_EN = 'Version id format: v1 or v0.1'

/**
 * Attempt to strip a slug prefix from a legacy version id.
 * Returns the stripped id if the pattern matches, otherwise null.
 *
 * Mapping:
 *   <slug>-v<MAJOR>          → v<MAJOR>
 *   <slug>-v<MAJOR>.<MINOR>  → v<MAJOR>.<MINOR>
 */
export function stripSlugPrefix(id: string): string | null {
  const m = id.match(/^[a-z0-9][a-z0-9-]*-(v\d+(?:\.\d+)?)$/)
  if (!m) return null
  const candidate = m[1]
  return isValidVersionId(candidate) ? candidate : null
}
