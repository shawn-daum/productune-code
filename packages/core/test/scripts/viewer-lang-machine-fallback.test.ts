/**
 * T-1306 — the viewer text language: project `.prdt/config.json` user_lang, then the machine
 * `<PRDT_HOME>/user-lang`, then ko. PRDT_HOME always points at a scratch dir, never the real ~/.prdt.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, beforeEach, afterEach } from 'vitest'

const viewerLib = path.resolve(__dirname, '../../../viewer/lib')
let home: string
let saved: string | undefined

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-viewer-lang-'))
  saved = process.env.PRDT_HOME
  process.env.PRDT_HOME = home
})
afterEach(() => {
  if (saved === undefined) delete process.env.PRDT_HOME
  else process.env.PRDT_HOME = saved
  fs.rmSync(home, { recursive: true, force: true })
})

async function resolved(cfg: unknown): Promise<string> {
  const { userLangOf } = await import(path.join(viewerLib, 'collect.mjs'))
  const labels = await import(path.join(viewerLib, 'labels.mjs'))
  labels.setViewerLang(userLangOf(cfg))
  return labels.lang
}

test('project user_lang wins over the machine value', async () => {
  fs.writeFileSync(path.join(home, 'user-lang'), 'en\n')
  expect(await resolved({ user_lang: 'ko' })).toBe('ko')
})

test('project unset + machine en -> en', async () => {
  fs.writeFileSync(path.join(home, 'user-lang'), 'en\n')
  expect(await resolved(null)).toBe('en')
  expect(await resolved({})).toBe('en')
})

test('both unset -> ko', async () => {
  expect(await resolved(null)).toBe('ko')
})

test('an off-shape machine value is ignored -> ko', async () => {
  fs.writeFileSync(path.join(home, 'user-lang'), 'English!\n')
  expect(await resolved(null)).toBe('ko')
})
