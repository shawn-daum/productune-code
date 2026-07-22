/**
 * version-id.ts — T-P4-095
 * Single source of truth for version id naming rule.
 *
 * Rule: version id MUST match ^v\d+(\.\d+){0,2}$
 * Allowed:  v1, v2, v0.1, v1.2, v1.3.1 (T-390: patch versions)
 * Rejected: paepyeong-v1, v1-rc, V1, version-1, 1.0, v1.2.3.4
 */

export const VERSION_ID_RE = /^v\d+(\.\d+){0,2}$/

export function isValidVersionId(id: string): boolean {
  return VERSION_ID_RE.test(id)
}

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
