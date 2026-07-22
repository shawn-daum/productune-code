/**
 * po-state-fields.ts — shared legacy/prdt field coalescing for raw (untyped)
 * po-state.json reads across the electron main process (T-317 code-review #2).
 *
 * po-state.json has two on-disk shapes:
 *   - legacy: `current_version` (string, occasionally an object carrying an
 *     `id` string on some older writers) + `current_phase` (number 1..5).
 *   - prdt (v1): flat `version` (string) + `stage` (string) — a legacy
 *     po-state never carries `stage`, so its presence discriminates the two.
 *
 * Three call sites each re-implemented this coalescing ad hoc (ipc/state.ts
 * computeSignal, ipc/project.ts buildRecentsWithMeta, subagent-cost.ts
 * readStateContext). Unified here so there is one fallback contract instead of
 * three near-identical ones — same behavior at each site (Tidy First).
 */

/**
 * Resolve a raw po-state's version id, legacy-first:
 *   1. `current_version` — a string, or an object carrying a string `id`
 *      (an older/alternate on-disk shape one call site defended against).
 *   2. prdt fallback: flat `version` when `stage` is also present — `stage`
 *      confirms this is a prdt state rather than a legacy one that simply
 *      never set `current_version`.
 *   3. null.
 */
export function resolveVersion(st: any): string | null {
  const cv = st?.current_version
  if (cv && typeof cv === 'object') {
    return typeof cv.id === 'string' ? cv.id : null
  }
  if (typeof cv === 'string' && cv) return cv
  if (typeof st?.stage === 'string' && typeof st?.version === 'string' && st.version) {
    return st.version
  }
  return null
}

/** Resolve a raw po-state's prdt flat `stage` string, or null when absent/not
 *  a string (legacy po-state, or missing). Does not fall back to
 *  `current_phase` — callers that need the two coalesced into one axis (e.g.
 *  a change-detection signal) do `state?.current_phase ?? resolveStage(state)`
 *  themselves, since `phase` (number) and `stage` (string) stay separate
 *  fields everywhere else in the GUI (T-306). */
export function resolveStage(st: any): string | null {
  return typeof st?.stage === 'string' ? st.stage : null
}
