import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Audience mode (T-326) — the register/vocabulary level of the PO's
 * CONVERSATIONAL output, per USER (the operator reading the PO), never per
 * project.
 *
 * - `planner`   — plain vocabulary, minimal jargon, progressive disclosure
 *                 (conclusion first; depth on request). Product default.
 * - `developer` — current register, technical vocabulary as-is.
 *
 * Storage: `~/.prdt/audience-mode`, ONE token. Deliberately NOT
 * ~/.productune/settings.json and NOT the project's .prdt/config.json:
 * the consumer is prdt-audience-inject.sh — a bash SessionStart hook that
 * injects the planner register into the PO context (the same harness path as
 * the ~/.prdt/overrides/<persona>.md injection) — so the value must be
 * readable with a bare `cat`, and the register is a property of the operator,
 * not of any project.
 *
 * The two T-326 paths, kept separate: fixed GUI strings (onboarding copy,
 * Settings labels) are i18n (packages/gui/src/locales); the PO's
 * model-generated prose cannot be i18n'd — that is what this setting + the
 * injection hook cover.
 */
export type AudienceMode = 'planner' | 'developer'

export const DEFAULT_AUDIENCE_MODE: AudienceMode = 'planner'

function audienceModePath(homeDir: string): string {
  return path.join(homeDir, '.prdt', 'audience-mode')
}

/**
 * Read the per-user audience mode. Missing / empty / corrupt file → planner
 * (default). Never throws. `homeDir` is test-only (defaults to os.homedir()).
 */
export function getAudienceMode(homeDir: string = os.homedir()): AudienceMode {
  try {
    const raw = fs.readFileSync(audienceModePath(homeDir), 'utf-8').trim()
    return raw === 'developer' ? 'developer' : DEFAULT_AUDIENCE_MODE
  } catch {
    return DEFAULT_AUDIENCE_MODE
  }
}

/**
 * Persist the per-user audience mode as a single token + newline — the exact
 * shape prdt-audience-inject.sh `cat`s. Atomic tmp + rename (same pattern as
 * ui-settings saveSettings). `homeDir` is test-only.
 */
export function setAudienceMode(mode: AudienceMode, homeDir: string = os.homedir()): void {
  const p = audienceModePath(homeDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, mode + '\n', { mode: 0o600 })
  fs.renameSync(tmp, p)
}
