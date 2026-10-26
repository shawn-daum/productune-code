import fs from 'fs'
import os from 'os'
import path from 'path'

// T-1295 control body, NOT a git-pinned pre-fix copy: settings/user-lang.ts (T-1281)
// was born on atomicWriteFileSync, so no pre-T-656 version exists. This is the plain
// `writeFileSync(path + '.tmp')` + `renameSync` shape the other pre-t656-* fixtures
// pin — it lets the table prove its planted symlink really does clobber a victim.
export const USER_LANG_RE = /^[a-z]{2,3}$/

export function userLangPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.prdt', 'user-lang')
}

export function setUserLang(code: string, homeDir: string = os.homedir()): boolean {
  if (!USER_LANG_RE.test(code)) return false
  fs.mkdirSync(path.dirname(userLangPath(homeDir)), { recursive: true })
  const tmp = userLangPath(homeDir) + '.tmp'
  fs.writeFileSync(tmp, code + '\n')
  fs.renameSync(tmp, userLangPath(homeDir))
  return true
}
