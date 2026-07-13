/**
 * prdt-user-prompt.sh (v1 hook #4, UserPromptSubmit stage guard) — T-336.
 *
 * Repro (hanta, 2026-07-13): one PO session lived 10 days; the habit's
 * turn-open po-state read happened once at session start and never again, and
 * `prdt doctor` was never run — so when the user said "main pr / 배포 완료" the
 * PO did full ship work with stage still "build": no readiness pass, no stage
 * write, Retro only after the user asked. The habit's only signal points
 * (turn open + doctor) are probabilistic and decayed to zero in a long session.
 *
 * This hook makes the signal deterministic: every user prompt in a prdt
 * project re-injects one live po-state line, and a deploy-shaped prompt while
 * stage is define/build gets an explicit ship-entry warning. Advisory only
 * (additionalContext) — soft stages stay soft, the PO still judges.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-user-prompt.sh')

/** Make a throwaway project dir; state=null → no .prdt/po-state.json (non-prdt dir). */
function makeProject(state: object | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t336-'))
  if (state !== null) {
    fs.mkdirSync(path.join(dir, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.prdt', 'po-state.json'), JSON.stringify(state))
  }
  return dir
}

/** Run the hook with a UserPromptSubmit event; returns raw stdout. */
function runHook(cwd: string, prompt: string): string {
  const event = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session',
    cwd,
    prompt,
  }
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8' })
}

/** Parse the hook's additionalContext, '' when the hook stayed silent. */
function contextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  const parsed = JSON.parse(stdout)
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  return parsed.hookSpecificOutput.additionalContext as string
}

const BUILD_STATE = { schema_version: 1, stage: 'build', version: 'v1', current_task: null }

describe('state line (turn-open refresher)', () => {
  test('every prompt in a prdt project gets one live state line', () => {
    const dir = makeProject(BUILD_STATE)
    const ctx = contextOf(runHook(dir, '스켈레톤 로딩 UI 최신화해줘'))
    expect(ctx).toContain('stage=build')
    expect(ctx).toContain('version=v1')
    expect(ctx).toContain('current_task=none')
    // neutral prompt → no ship-entry warning
    expect(ctx).not.toMatch(/ship entry/i)
  })

  test('current_task is summarized as ticket(assignee)', () => {
    const dir = makeProject({
      ...BUILD_STATE,
      current_task: { ticket_id: 'T-12', slug: 'x', assignee: 'developer' },
    })
    expect(contextOf(runHook(dir, 'hello'))).toContain('current_task=T-12(developer)')
  })

  test('walks up from a nested cwd to the project root', () => {
    const dir = makeProject(BUILD_STATE)
    const nested = path.join(dir, 'packages', 'web')
    fs.mkdirSync(nested, { recursive: true })
    expect(contextOf(runHook(nested, 'hi'))).toContain('stage=build')
  })
})

describe('deploy tripwire (the hanta failure moment)', () => {
  // the literal prompts from the hanta transcript that sailed past stage=build,
  // plus phrase-level Korean deploy intents (QA round: bare tokens → phrases)
  for (const prompt of [
    'main pr', '머지완료', '배포 완료', 'deploy this to production',
    '배포해줘', '머지 해줘', '프로덕션 배포 나가자', '라이브 반영해줘',
  ]) {
    test(`build + ${JSON.stringify(prompt)} → ship-entry warning`, () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, prompt))
      expect(ctx).toMatch(/ship entry/i)
      expect(ctx).toContain('readiness')
    })
  }

  // QA-caught false positives: bare Korean substrings (라이브·머지·프로덕션·배포는)
  // inside ordinary build-stage requests must stay silent — 라이브러리 in
  // particular is so common in build that bare matching would decay the signal.
  for (const prompt of [
    '라이브러리 업데이트해줘',
    '머지소트 알고리즘 짜줘',
    '프로덕션 코드 스타일 리팩터링(배포는 안 함)',
    '컴포넌트 라이브러리로 옮겨줘',
  ]) {
    test(`build + ${JSON.stringify(prompt)} → state line only (no false warning)`, () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, prompt))
      expect(ctx).toContain('stage=build')
      expect(ctx).not.toMatch(/ship entry/i)
    })
  }

  test('stage=ship + deploy prompt → state line only (patch-loop redeploys are normal)', () => {
    const dir = makeProject({ ...BUILD_STATE, stage: 'ship' })
    const ctx = contextOf(runHook(dir, '배포해줘'))
    expect(ctx).toContain('stage=ship')
    expect(ctx).not.toMatch(/ship entry/i)
  })

  test('stage=define + deploy prompt → warns too', () => {
    const dir = makeProject({ ...BUILD_STATE, stage: 'define' })
    expect(contextOf(runHook(dir, 'release it'))).toMatch(/ship entry/i)
  })
})

describe('silent no-ops (never break a plain session)', () => {
  test('non-prdt cwd → no output, exit 0', () => {
    const dir = makeProject(null)
    expect(runHook(dir, '배포해줘').trim()).toBe('')
  })

  test('malformed stdin → no output, exit 0', () => {
    const out = execFileSync('bash', [HOOK], { input: 'not json{{', encoding: 'utf8' })
    expect(out.trim()).toBe('')
  })

  test('corrupt po-state.json → no output, exit 0 (never a hook error popup)', () => {
    const dir = makeProject(null)
    fs.mkdirSync(path.join(dir, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.prdt', 'po-state.json'), '{broken')
    expect(runHook(dir, '배포').trim()).toBe('')
  })
})
