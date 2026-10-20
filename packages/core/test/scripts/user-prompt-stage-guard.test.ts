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
const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REGISTER_DIR = path.join(CORE_ROOT, 'discipline', 'register')

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
function runHook(cwd: string, prompt: string, env: NodeJS.ProcessEnv = {}): string {
  const event = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session',
    cwd,
    prompt,
  }
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, ...env } })
}

/** Parse the hook's additionalContext, '' when the hook stayed silent. */
function contextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  const parsed = JSON.parse(stdout)
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  return parsed.hookSpecificOutput.additionalContext as string
}

const BUILD_STATE = { schema_version: 1, stage: 'build', version: 'v1', current_task: null }

// T-687: a register `[prdt register]` binding line used to be pinned
// byte-for-byte here too (same class as T-613/T-639/T-642 — the tail prose
// can be reworded without the rule changing, and a byte pin turns that into
// a false-red tree). Pin the rule instead: (a) tagged `[prdt register]`,
// (b) names the non-default keys verbatim, (c) states which surface it
// governs, (d) when a body already arrived at session start the line ends
// right there (S7-b, T-702, dropped the "Binding only" tail) — when none
// exists, a "No body is in force …" tail still follows — never both.
function assertRegisterBindingLineShape(line: string, opts: { keys: string; governs: string; bodyArrived: boolean }): void {
  expect(line.startsWith('[prdt register] ')).toBe(true)
  expect(line).toContain(opts.keys)
  expect(line).toContain(`governs ${opts.governs}`)
  if (opts.bodyArrived) {
    expect(line.endsWith(`governs ${opts.governs}.`)).toBe(true)
    expect(line).not.toMatch(/no body is in force/i)
  } else {
    expect(line).toMatch(/no body is in force/i)
    expect(line.endsWith(`governs ${opts.governs}.`)).toBe(false)
  }
}

// T-1025: while form=outline is bound the per-turn assembly appends the hot line as
// the line right AFTER the `[prdt register]` line (same assembly point, same order).
// T-1072: the reply hot line closes the register section of every prompt, whatever the register.
const REPLY_HOT_LINE = "[prdt reply] Final user-chat reply only, over one line \u2192 `prdt wordlist check --lang <user_lang> -` on the draft first, each hit (`\u2014` \u00b7 합치기 \u00b7 모름) \u2192 a listed replacement."
const FORM_OUTLINE_HOT_LINE = "[prdt form=outline] Next act a tool call \u2192 ignore this. Next act the final user-chat reply \u2192 each point its own paragraph opened by a `**label:**`, never a `-` item; `\u00b7` sub-lines right under its first line only when needed; never 2+ sentences on an unmarked line, never 2+ unmarked lines in a row; one blank line after each point's block, none inside it."

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

describe('T-1173: the prompt-wording deploy tripwire is retired', () => {
  // A deploy is judged on the command run (prdt-worktree-guard.sh rule 3);
  // the prompt line misfired 11/11 (T-530) and no longer exists.
  for (const prompt of ['main pr', '배포해줘', 'deploy this to production', '라이브러리 업데이트해줘']) {
    test(`build + ${JSON.stringify(prompt)} → no stage guard line`, () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, prompt))
      expect(ctx).toContain('stage=build')
      expect(ctx).not.toContain('[prdt stage guard]')
      expect(ctx).not.toMatch(/ship entry/i)
    })
  }
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

describe('register binding (T-586) — the per-turn channel has ONE assembly point', () => {
  // A sandbox ~/.prdt: the resolver reads `$PRDT_HOME/register`; the hook finds the
  // resolver next to itself (PRDT_HOOK_DIR = the repo hooks dir here, the mirror
  // dir on an installed machine).
  // withBodies=true copies the REAL register bodies (packages/core/discipline/register)
  // in, the way audience-inject-hook.test.ts sources them for the resolver itself —
  // never hand-copy body text here, it drifts the moment a body is renamed.
  function prdtHome(register: string | null, withBodies = false): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t586-home-'))
    fs.mkdirSync(path.join(home, 'discipline', 'register'), { recursive: true })
    if (withBodies) fs.cpSync(REGISTER_DIR, path.join(home, 'discipline', 'register'), { recursive: true })
    if (register !== null) fs.writeFileSync(path.join(home, 'register'), register)
    return home
  }

  test('a machine with no register file gets exactly the state line — no binding, no empty line, no warning', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome(null) }))
    expect(ctx.split('\n')).toEqual([expect.stringMatching(/^\[prdt state\] /), REPLY_HOT_LINE])
    expect(ctx).not.toContain('[prdt register]')
  })

  test('every key at its default (explicitly) → still no binding line', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome('audience=planner\nform=prose\n') }))
    expect(ctx.split('\n')).toEqual([expect.stringMatching(/^\[prdt state\] /), REPLY_HOT_LINE])
    expect(ctx).not.toContain('[prdt register]')
  })

  test('non-default keys with real bodies present → one `[prdt register]` line right after the state line, values verbatim, no tail (S7-b)', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome('form=outline\nstructure=planner-tables\naddress=션님\n', true) }))
    const lines = ctx.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^\[prdt state\] /)
    assertRegisterBindingLineShape(lines[1], { keys: 'form=outline · structure=planner-tables · address="션님"', governs: 'user-chat', bodyArrived: true })
    expect(lines[2]).toBe(FORM_OUTLINE_HOT_LINE)
    expect(lines[3]).toBe(REPLY_HOT_LINE)
    expect(Buffer.byteLength(lines[1], 'utf8')).toBeLessThanOrEqual(180)
  })

  test('non-default keys with NO body files for the resolved values → same line, "No body is in force" tail', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome('form=outline\nstructure=planner-tables\naddress=션님\n') }))
    const lines = ctx.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^\[prdt state\] /)
    assertRegisterBindingLineShape(lines[1], { keys: 'form=outline · structure=planner-tables · address="션님"', governs: 'user-chat', bodyArrived: false })
    expect(lines[2]).toBe(FORM_OUTLINE_HOT_LINE)
    expect(lines[3]).toBe(REPLY_HOT_LINE)
  })

  // Not empty coverage: a fixture with exactly one property surgically removed
  // (the others left intact) makes that property's own check fail — proving
  // the shape assertion actually discriminates, not just passes whatever
  // it's handed.
  test('each property of the register binding-line shape actually fails on a fixture that removes it', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome('form=outline\nstructure=planner-tables\naddress=션님\n', true) }))
    const line = ctx.split('\n')[1]
    const opts = { keys: 'form=outline · structure=planner-tables · address="션님"', governs: 'user-chat', bodyArrived: true } as const
    expect(() => assertRegisterBindingLineShape(line, opts)).not.toThrow()

    const noTag = line.replace('[prdt register] ', '[prdt something] ')
    expect(() => assertRegisterBindingLineShape(noTag, opts)).toThrow()

    const noKeys = line.replace('form=outline · structure=planner-tables · address="션님"', 'form=x')
    expect(() => assertRegisterBindingLineShape(noKeys, opts)).toThrow()

    const noGoverns = line.replace('governs user-chat', 'governs nothing')
    expect(() => assertRegisterBindingLineShape(noGoverns, opts)).toThrow()

    const spuriousTail = `${line} Binding only; extra.`
    expect(() => assertRegisterBindingLineShape(spuriousTail, opts)).toThrow()
  })

  test('an illegal value never reaches the prompt: out-of-domain + off-shape address → defaults → no line', () => {
    const ctx = contextOf(runHook(makeProject(BUILD_STATE), 'hello', { PRDT_HOME: prdtHome('form=fancy\naddress=' + 'x'.repeat(40) + '\n') }))
    expect(ctx).not.toContain('[prdt register]')
    expect(ctx).not.toContain('fancy')
    expect(ctx).not.toContain('xxxx')
  })

  test('a mirror holding this hook but no resolver (half-updated install) degrades to today\'s output', () => {
    // the hook looks for the resolver NEXT TO ITSELF — copy it alone into an empty dir
    const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t586-lone-'))
    fs.copyFileSync(HOOK, path.join(lone, 'prdt-user-prompt.sh'))
    const event = { hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: makeProject(BUILD_STATE), prompt: 'hello' }
    const out = execFileSync('bash', [path.join(lone, 'prdt-user-prompt.sh')], {
      input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, PRDT_HOME: prdtHome('form=outline\naddress=션님\n') },
    })
    const ctx = contextOf(out)
    expect(ctx.split('\n')).toEqual([expect.stringMatching(/^\[prdt state\] /), REPLY_HOT_LINE])
  })

  test('outside a prdt project the hook stays silent even with a full register (today\'s behavior)', () => {
    expect(runHook(makeProject(null), 'hello', { PRDT_HOME: prdtHome('form=outline\naddress=션님\n') })).toBe('')
  })
})
