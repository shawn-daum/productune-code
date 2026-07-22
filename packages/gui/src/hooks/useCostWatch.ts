/**
 * useCostWatch.ts — shared "arm cost:watch + re-fetch on productune:cost-update"
 * plumbing (T-317 code-review #3).
 *
 * UsageBar's `usePrdtCost` and CostArchivePanel each re-implemented this exact
 * effect (arm `costWatch` for the project, subscribe `onCostUpdate`, re-fetch
 * when the pushed `projectDir` matches, unsubscribe on cleanup). Unified here —
 * same behavior at both call sites (Tidy First, no functional change).
 */

import { useEffect } from 'react'

/**
 * Arms a `cost:watch` for `projectDir` and calls `onUpdate` whenever main
 * pushes a `productune:cost-update` for that same project. No-op when
 * `enabled` is false, `projectDir` is falsy, or the preload bridge lacks the
 * relevant API (graceful degradation — aggregation still works via one-shot
 * fetch, just without live updates).
 */
export function useCostWatch(
  projectDir: string | undefined,
  onUpdate: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const api = (window as any).api
    if (!api || !projectDir) return
    api.costWatch?.(projectDir)
    if (!api.onCostUpdate) return
    const unsub = api.onCostUpdate((payload: { projectDir: string }) => {
      if (payload?.projectDir === projectDir) onUpdate()
    })
    return unsub
  }, [projectDir, enabled, onUpdate])
}
