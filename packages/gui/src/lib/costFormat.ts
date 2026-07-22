/**
 * costFormat.ts — shared cost-value formatting (T-317 code-review #3).
 *
 * `fmtCost` was byte-identical in both UsageBar.tsx (prdt cost display) and
 * CostArchivePanel.tsx (cost archive table) — unified here, no behavior change.
 */

/** 4-decimal USD string with `$` prefix. Guards non-finite input (defensive). */
export function fmtCost(n: number): string {
  const safe = Number.isFinite(n) ? n : 0
  return `$${safe.toFixed(4)}`
}
