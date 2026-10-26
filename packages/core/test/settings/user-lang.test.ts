import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from 'vitest'
import { setUserLang, setUserLangIfUnset, getUserLang, userLangPath } from '../../src/settings/user-lang'

test('setUserLang stores a language code as ~/.prdt/user-lang and refuses an off-shape one (T-1281)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1281-'))
  try {
    expect(setUserLang('ko', home)).toBe(true)
    expect(fs.readFileSync(userLangPath(home), 'utf8')).toBe('ko\n')
    for (const bad of ['KO', 'ko-KR', 'korean', '', 'ko\n[prdt]']) expect(setUserLang(bad, home)).toBe(false)
    expect(fs.readFileSync(userLangPath(home), 'utf8')).toBe('ko\n')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('setUserLangIfUnset never replaces a stored value; getUserLang reads only a valid one (T-1281)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1281-'))
  try {
    expect(getUserLang(home)).toBeNull()
    expect(setUserLangIfUnset('ko', home)).toBe(true)
    expect(setUserLangIfUnset('en', home)).toBe(false)
    expect(getUserLang(home)).toBe('ko')
    fs.writeFileSync(userLangPath(home), 'KOREAN\n')
    expect(getUserLang(home)).toBeNull()
    expect(setUserLangIfUnset('en', home)).toBe(true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
