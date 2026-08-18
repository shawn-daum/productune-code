import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Plan tier (T-423) — the operator's Claude subscription tier, per USER
 * (never per project). Feeds the PO's fable plan gate (T-391): fable model
 * floors only apply when the user is confirmed on a plan that includes fable
 * access.
 *
 * - `max-x20`       — Max x20 plan (fable-eligible).
 * - `team-premium`  — Team Premium plan (fable-eligible).
 * - `other`         — any other/unconfirmed plan (NOT fable-eligible; every
 *                     fable floor resolves to opus at the same effort).
 *
 * Storage: `~/.prdt/plan-tier`, ONE token — same shape and same rationale as
 * `audience-mode` (settings/audience-mode.ts): the consumer is
 * prdt-plan-tier-inject.sh, a bash SessionStart/SubagentStart hook that injects
 * the stored value into the PO's context so the gate resolves WITHOUT
 * re-asking the user every session (T-423: the plan is not programmatically
 * detectable, so the file is the durable record of the user's one-time
 * answer). Deliberately NOT ~/.productune/settings.json and NOT the project's
 * .prdt/config.json: the value must be readable with a bare `cat`, and it
 * belongs to the operator's device, not to any one project.
 *
 * Change path: GUI Settings (this module, via IPC) OR direct file edit — the
 * user owns keeping this current; a plan downgrade/upgrade is never detected
 * automatically, so `prdt-plan-tier-inject.sh`'s payload never claims to have
 * verified the plan, only that the user once reported it.
 */
export type PlanTier = 'max-x20' | 'team-premium' | 'other'

export const DEFAULT_PLAN_TIER: PlanTier = 'other'

const VALID_TIERS: readonly PlanTier[] = ['max-x20', 'team-premium', 'other']

function planTierPath(homeDir: string): string {
  return path.join(homeDir, '.prdt', 'plan-tier')
}

/** `max-x20` and `team-premium` are the only fable-eligible tiers (T-391 gate). */
export function isFableEligible(tier: PlanTier): boolean {
  return tier === 'max-x20' || tier === 'team-premium'
}

/**
 * Read the per-user plan tier. Missing / empty / corrupt file → `other`
 * (the safe default: fable floors resolve to opus until confirmed otherwise).
 * Never throws. `homeDir` is test-only (defaults to os.homedir()).
 */
export function getPlanTier(homeDir: string = os.homedir()): PlanTier {
  try {
    const raw = fs.readFileSync(planTierPath(homeDir), 'utf-8').trim()
    return (VALID_TIERS as readonly string[]).includes(raw) ? (raw as PlanTier) : DEFAULT_PLAN_TIER
  } catch {
    return DEFAULT_PLAN_TIER
  }
}

/**
 * Whether the user has ever recorded a plan tier at all — distinct from
 * `getPlanTier`'s "other" default, which also covers a corrupt/missing file.
 * The PO's plan gate (habit.md) asks once only when this is `false`;
 * `prdt-plan-tier-inject.sh` uses the same file-existence check.
 */
export function hasPlanTierSet(homeDir: string = os.homedir()): boolean {
  try {
    const raw = fs.readFileSync(planTierPath(homeDir), 'utf-8').trim()
    return (VALID_TIERS as readonly string[]).includes(raw)
  } catch {
    return false
  }
}

/**
 * Persist the per-user plan tier as a single token + newline — the exact
 * shape prdt-plan-tier-inject.sh `cat`s. Atomic tmp + rename (same pattern as
 * audience-mode's setAudienceMode). `homeDir` is test-only.
 */
export function setPlanTier(tier: PlanTier, homeDir: string = os.homedir()): void {
  const p = planTierPath(homeDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, tier + '\n', { mode: 0o600 })
  fs.renameSync(tmp, p)
}
