import fs from 'fs'
import os from 'os'
import path from 'path'
import { atomicWriteFileSync } from '../fs/atomic-write'

/**
 * The user's chat language (T-1116 / T-1281) — `~/.prdt/user-lang`, the same file
 * `prdt settings set user.lang` writes and the PO hooks read. A code is 2-3
 * lowercase letters (ko, en, ja); anything else is refused, never stored.
 */
export const USER_LANG_RE = /^[a-z]{2,3}$/

export function userLangPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.prdt', 'user-lang')
}

/** Returns false (nothing written) for an off-shape code. */
export function setUserLang(code: string, homeDir: string = os.homedir()): boolean {
  if (!USER_LANG_RE.test(code)) return false
  fs.mkdirSync(path.dirname(userLangPath(homeDir)), { recursive: true })
  atomicWriteFileSync(userLangPath(homeDir), code + '\n')
  return true
}
