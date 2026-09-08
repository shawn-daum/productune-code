import os from 'os'
import { readRegister, writeRegisterKey, REGISTER_DEFAULTS } from './register'
import type { RegisterAudience } from './register'

/**
 * Audience mode (T-326) — COMPATIBILITY WRAPPER since T-586.
 *
 * The audience level is now the `audience` key of the register object
 * (settings/register.ts, `~/.prdt/register`); this module keeps the T-326 API
 * (`getAudienceMode` / `setAudienceMode` / `AudienceMode`) so the GUI's
 * onboarding step and Settings toggle keep compiling and behaving, while the
 * storage is the register file. `~/.prdt/audience-mode` is neither read nor
 * written here — after T-586 there is exactly one register mechanism, and this
 * file is a name for one of its keys, not a second store. New code imports
 * `readRegister` / `writeRegisterKey` directly.
 */
export type AudienceMode = RegisterAudience

export const DEFAULT_AUDIENCE_MODE: AudienceMode = REGISTER_DEFAULTS.audience

/** `readRegister(homeDir).audience` — missing / illegal → planner. Never throws. */
export function getAudienceMode(homeDir: string = os.homedir()): AudienceMode {
  return readRegister(homeDir).audience
}

/** `writeRegisterKey('audience', mode, homeDir)` — the register file, atomically. */
export function setAudienceMode(mode: AudienceMode, homeDir: string = os.homedir()): void {
  writeRegisterKey('audience', mode, homeDir)
}
