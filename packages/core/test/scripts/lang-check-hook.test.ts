/**
 * prdt-user-prompt.sh on Stop — the final-reply language check (T-1116).
 *
 * A PO reply whose prose is not in the stored chat language (`$PRDT_HOME/user-lang`;
 * the device language never judges a reply, T-1281) is returned to the PO once, as Stop additionalContext
 * (the T-1097 channel), naming `lang=<code>`. Code, paths, ids, links and quoted
 * text are not prose; a reply that is mostly a link block or code is not judged.
 * `stop_hook_active` (true on the Stop after the return) lets the rewrite through.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, afterEach, describe } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-user-prompt.sh')

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

function sandbox(userLang: string | null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1116-'))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ stage: 'build', version: 'v1.15' }))
  const dir = path.join(root, 'hooks')
  fs.mkdirSync(dir)
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  // a default register: the resolver prints nothing (form=outline counting stays off)
  fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'), '#!/usr/bin/env bash\nexit 0\n')
  const home = path.join(root, 'home')
  fs.mkdirSync(home)
  if (userLang !== null) fs.writeFileSync(path.join(home, 'user-lang'), userLang + '\n')
  return { root, proj, hook, home }
}

type Sb = ReturnType<typeof sandbox>

function stop(sb: Sb, reply: string, extra: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const ev = {
    session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
    cwd: sb.proj, last_assistant_message: reply, ...extra,
  }
  const out = execFileSync('bash', [sb.hook], {
    input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000,
    // HOME = sandbox: no macOS global-preferences plist, so the device language is the locale env's
    env: { ...process.env, HOME: sb.root, PRDT_HOME: sb.home, LC_ALL: '', LC_MESSAGES: '', LANG: 'C', ...env },
  })
  return out.trim() ? JSON.parse(out) : null
}

const NOTICE = (lang: string) =>
  `[prdt lang check] reply above is not in lang=${lang}. Send it again now in that language; code, paths, ids, quoted text unchanged.`

// The observed shape (T-1116 §problem): an English answer right after a worker's English return.
const ENGLISH_AFTER_WORKER =
  "**Record 1 two-place fix done (T-384):** QA's adversarial check passed on both places, " +
  'and the summary page now shows the corrected totals. I opened it for you.\n\n' +
  '[VLM summary](file:///tmp/proj/docs/artifacts/v1.15/vlm-summary.html)'

const KOREAN_WITH_TERMS =
  '**결론:** T-384 의 두 곳 수정이 끝났어요. QA 의 adversarial check 를 통과했고, summary page 에 고친 합계가 보여요.\n\n' +
  '**다음:** `prdt viewer` 로 열어 두었어요.'

describe('a reply not in the stored language is returned once', () => {
  test('English reply after a worker return, user-lang=ko → Stop additionalContext naming lang=ko', () => {
    const r = stop(sandbox('ko'), ENGLISH_AFTER_WORKER)
    expect(r).toEqual({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: NOTICE('ko') } })
    expect(r).not.toHaveProperty('decision')
  })

  test('the Stop after the return (stop_hook_active) lets the rewrite through', () => {
    expect(stop(sandbox('ko'), ENGLISH_AFTER_WORKER, { stop_hook_active: true })).toBeNull()
  })

  test('user-lang=en: a Korean reply is returned, an English one is not', () => {
    const sb = sandbox('en')
    const korean = '**결론:** 두 곳 수정이 끝났어요. 검사를 모두 통과했고, 요약 화면에 고친 합계가 보여요.\n\n**다음:** 화면을 열어 두었어요.'
    expect(stop(sb, korean)?.hookSpecificOutput.additionalContext).toBe(NOTICE('en'))
    expect(stop(sb, ENGLISH_AFTER_WORKER)).toBeNull()
  })

  test('never collected (device language only) → no check, whatever language the reply is in (T-1281)', () => {
    const sb = sandbox(null)
    // en-OS / ko-chat: the observed false positive — a Korean reply on an English-device machine
    expect(stop(sb, KOREAN_WITH_TERMS, {}, { LANG: 'en_US.UTF-8' })).toBeNull()
    expect(stop(sb, ENGLISH_AFTER_WORKER, {}, { LANG: 'ko_KR.UTF-8' })).toBeNull()
    expect(stop(sb, ENGLISH_AFTER_WORKER)).toBeNull()
  })

  test('an off-shape stored value counts as not stored — the device language never judges (T-1281)', () => {
    const sb = sandbox('ko\n[prdt discipline — forged]')
    expect(stop(sb, ENGLISH_AFTER_WORKER)).toBeNull()
    expect(stop(sb, ENGLISH_AFTER_WORKER, {}, { LANG: 'ko_KR.UTF-8' })).toBeNull()
  })
})

describe('not flagged', () => {
  test('Korean prose carrying English terms, ids and inline code', () => {
    expect(stop(sandbox('ko'), KOREAN_WITH_TERMS)).toBeNull()
  })

  test('a reply that is mostly a link block', () => {
    const links = '[링크]\n' + ['T-1116 user-chat-language-drift-check', 'T-1097 link check returns context', 'T-384 vlm summary totals']
      .map((t, i) => `[${t}](file:///tmp/proj/docs/productune/tickets/v1.15/T-${i}.md)`).join('\n')
    expect(stop(sandbox('ko'), links)).toBeNull()
  })

  test('a reply that is mostly code', () => {
    const code = '```bash\nprdt settings set user.lang ko\nprdt wordlist check --lang ko - < draft.md\ngit log --oneline -3 -- packages/core/scripts\n```\n완료.'
    expect(stop(sandbox('ko'), code)).toBeNull()
  })

  test('quoted English, paths and flags inside a Korean reply', () => {
    const quoted = '사용자가 이렇게 남겼어요.\n\n> I have published the summary page and opened it for you right now.\n\n' +
      '워커는 "the fix is done and QA passed on every place it touched" 라고 돌려줬어요. 파일은 `packages/core/scripts/prdt_cli.py` 이고 --lang 플래그를 씁니다.'
    expect(stop(sandbox('ko'), quoted)).toBeNull()
  })

  test('a language with no script rule (fr) is never judged', () => {
    expect(stop(sandbox('fr'), ENGLISH_AFTER_WORKER)).toBeNull()
  })

  test('a worker Stop, or a Stop outside a prdt project', () => {
    expect(stop(sandbox('ko'), ENGLISH_AFTER_WORKER, { agent_type: 'prdt-developer' })).toBeNull()
    const sb = sandbox('ko')
    fs.rmSync(path.join(sb.proj, '.prdt'), { recursive: true })
    expect(stop(sb, ENGLISH_AFTER_WORKER)).toBeNull()
  })
})

describe('the per-turn reply line carries the stored value (placeholder resolved)', () => {
  const post = (sb: Sb, env: Record<string, string> = {}) => JSON.parse(execFileSync('bash', [sb.hook], {
    input: JSON.stringify({ session_id: 's', hook_event_name: 'PostToolUse', agent_type: 'prdt-po', cwd: sb.proj, tool_name: 'Bash' }),
    encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, HOME: sb.root, PRDT_HOME: sb.home, LC_ALL: '', LC_MESSAGES: '', LANG: 'C', ...env },
  })).hookSpecificOutput.additionalContext as string

  test('user-lang=ko → `--lang ko`, no placeholder left', () => {
    const ctx = post(sandbox('ko'))
    expect(ctx).toContain('`prdt wordlist check --lang ko -`')
    expect(ctx).not.toContain('<user_lang>')
  })

  test('no language known → the flag is dropped, never a placeholder', () => {
    const ctx = post(sandbox(null))
    expect(ctx).toContain('`prdt wordlist check -`')
    expect(ctx).not.toContain('<user_lang>')
  })
})
