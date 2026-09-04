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

describe('prompt provenance guard (T-523 — task-notification / PO-echo misfires)', () => {
  // Real shape of a Claude Code async-dispatch completion notification —
  // captured VERBATIM off a live task-notification received during this
  // ticket's own investigation (2026-08-31). Under agent-teams, a background
  // dispatch's completion is delivered to the PO's NEXT TURN as this hook's
  // `prompt` itself — the PO never typed a word of it, but the old guard
  // bare-searched the whole string, so any deploy-shaped word inside the
  // worker's own <summary>/<result> (quoting task titles, code, or prose)
  // fired the "ship entry" warning. This is the mechanism named in T-523 for
  // the 2 Ship-entry misfires (PO observation 2026-08-26, "both on turns
  // processing a designer return").
  function notificationPrompt(inner: string): string {
    return `[SYSTEM NOTIFICATION - NOT USER INPUT]
This is an automated background-task event, NOT a message from the user.
Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.
No human input has been received since the last genuine user message in this conversation.

<task-notification>
<task-id>a4c9fdeb795aefa8f</task-id>
<tool-use-id>toolu_01PRu1B8NC5oT2XwXcXzMVth</tool-use-id>
<status>completed</status>
${inner}
<usage><subagent_tokens>48416</subagent_tokens></usage>
</task-notification>`
  }

  const NOTIFICATION_FIXTURES: Array<[string, string]> = [
    // v1.7 recorded misfire shape #1 — worker summary reports FINISHED deploy
    // work (a completed task, not a request).
    ['worker summary reports finished deploy work',
      notificationPrompt('<summary>Agent "T-321 배포 스크립트 수정" finished — merge and deploy steps documented, not executed</summary>')],
    // v1.7 recorded misfire shape #2 — result text quotes the PO's OWN
    // earlier dispatch instruction verbatim (restating what was asked, not
    // asking it now).
    ["result quotes the PO's own earlier dispatch instruction",
      notificationPrompt('<result>Dispatch instruction received: "메인 PR 배포 부탁" — completed the readiness doc, did NOT deploy (out of scope for this worker).</result>')],
    // v1.7 recorded misfire shape #3 — an English deploy token inside a code
    // diff/log line quoted back in the result.
    ['result quotes a log line containing an English deploy token',
      notificationPrompt('<result>Changed release notes: `deploy this to production` was removed from the sample script per T-437.</result>')],
    // Ship-entry misfire #1 (2026-08-26, "processing a designer return") —
    // designer persona's own return envelope, summary field.
    ['designer return — summary names a ship-stage deliverable',
      notificationPrompt('<summary>prdt-designer: PRD §v1.8 출시 기준 섹션 초안 완료, 사용자 확인 대기</summary>')],
    // Ship-entry misfire #2 (same session, second designer return).
    ['designer return — result restates "출시" from the PRD section it drafted',
      notificationPrompt('<result>§v1.8 출시 기준 섹션을 초안했습니다. 배포는 ship 단계 몫으로 남겨뒀습니다.</result>')],
  ]

  for (const [label, prompt] of NOTIFICATION_FIXTURES) {
    test(`build + task-notification (${label}) → stays silent (no ship-entry warning)`, () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, prompt))
      expect(ctx).toContain('stage=build')
      expect(ctx).not.toMatch(/ship entry/i)
    })
  }

  // The OTHER named cause: "PO 자신의 이전 발화에 섞인 무관한 낱말" — a
  // compaction-continuation prompt recaps the PO's OWN earlier turns in
  // prose, which can mention deploy words in passing (describing past/future
  // work, not requesting it now). Distinct fixed, harness-authored preamble
  // from the task-notification shape above, so it needs its own marker.
  test('build + compaction-continuation recap mentioning past deploy discussion → stays silent', () => {
    const dir = makeProject(BUILD_STATE)
    const prompt = `This session is being continued from a previous conversation that ran out of context. The conversation is summarized below:
Summary:
The user and PO discussed that 배포 완료 is scheduled for the ship stage after readiness passes; no action was requested this turn.`
    const ctx = contextOf(runHook(dir, prompt))
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toMatch(/ship entry/i)
  })

  // The guard's PURPOSE must survive all of the above: a real user prompt
  // sharing vocabulary with the fixtures — but carrying none of their
  // harness-authored markers — still fires. Proven, not asserted.
  test('build + real user prompt sharing fixture vocabulary but no harness marker → still fires', () => {
    const dir = makeProject(BUILD_STATE)
    const ctx = contextOf(runHook(dir, '메인 PR 배포 부탁'))
    expect(ctx).toMatch(/ship entry/i)
  })
})

describe('T-562: the provenance guard is anchored, not a whole-string search', () => {
  // The guard T-523 added searched the WHOLE prompt for the harness markers, so
  // any prompt that CONTAINED one was classified as "not the PO's own words".
  // The live shapes it was built from all START with their marker — but a
  // person pasting a worker return and typing underneath it produces the same
  // bytes in the middle of a prompt they really did type, and the stage-entry
  // warning silently disappeared from it. T-523's own note said this must not
  // become a no-op; unanchored, it became one on the paste path.
  //
  // The current fixtures above cannot see that: every one of them puts the
  // marker at offset 0, so they stay green under both implementations. These
  // two do not — they FAIL against the substring guard.

  const TAG_BLOCK = `<task-notification>
<task-id>a4c9fdeb795aefa8f</task-id>
<tool-use-id>toolu_01PRu1B8NC5oT2XwXcXzMVth</tool-use-id>
<status>completed</status>
<summary>prdt-developer: T-560 훅 수정 완료 — 테스트 green</summary>
<usage><subagent_tokens>48416</subagent_tokens></usage>
</task-notification>`

  const FULL_NOTIFICATION = `[SYSTEM NOTIFICATION - NOT USER INPUT]
This is an automated background-task event, NOT a message from the user.
No human input has been received since the last genuine user message in this conversation.

${TAG_BLOCK}`

  test('pasted worker return + the user\'s own typed deploy request → the guard fires', () => {
    const dir = makeProject(BUILD_STATE)
    const prompt = `방금 워커가 이렇게 돌려줬는데:

${FULL_NOTIFICATION}

이거 main 에 배포해줘.`
    const ctx = contextOf(runHook(dir, prompt))
    expect(ctx).toContain('stage=build')
    expect(ctx).toMatch(/ship entry/i)
  })

  test('a bare <task-notification> block quoted mid-prompt does not by itself mark it non-fresh', () => {
    const dir = makeProject(BUILD_STATE)
    const prompt = `아래 블록 참고해서 판단해줘.

${TAG_BLOCK}

문제 없으면 배포 진행해줘.`
    expect(contextOf(runHook(dir, prompt))).toMatch(/ship entry/i)
  })

  test('a compaction recap quoted mid-prompt does not silence a real request either', () => {
    const dir = makeProject(BUILD_STATE)
    const prompt = `이전 세션 요약을 붙여넣는다:

This session is being continued from a previous conversation that ran out of context.

그래서 지금 배포해줘.`
    expect(contextOf(runHook(dir, prompt))).toMatch(/ship entry/i)
  })

  // The live shape is unchanged: it arrives with the marker FIRST, and stays
  // silent. (The five T-523 fixtures above are the full set; this pins that the
  // anchoring did not move the boundary for the shape it was built for.)
  // T-570 moved the deploy word INSIDE the block in these two. It used to sit
  // after `</task-notification>`, which no live capture ever produces — the
  // harness's own block is the last thing in the prompt — and under the tail
  // rule that trailing tag is exactly the shape that now means "a person pasted
  // this and kept typing". A fixture has to be the shape it claims to be.
  const NOTIFICATION_WITH_DEPLOY_WORD = FULL_NOTIFICATION.replace(
    '<summary>prdt-developer: T-560 훅 수정 완료 — 테스트 green</summary>',
    '<result>배포 완료</result>',
  )

  test('the live notification shape (marker first) is still classified non-fresh', () => {
    const dir = makeProject(BUILD_STATE)
    const ctx = contextOf(runHook(dir, NOTIFICATION_WITH_DEPLOY_WORD))
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toMatch(/ship entry/i)
  })

  test('leading whitespace before the marker still counts as the start', () => {
    const dir = makeProject(BUILD_STATE)
    const ctx = contextOf(runHook(dir, `\n\n  ${NOTIFICATION_WITH_DEPLOY_WORD}`))
    expect(ctx).not.toMatch(/ship entry/i)
  })

  // ── T-570: the rule is the END of the prompt, not the position of the marker ─
  //
  // T-562 anchored the marker to offset 0 and left one shape undecided: a prompt
  // that BEGINS with the preamble and carries a typed request underneath it.
  // Anchoring alone cannot split that from a live capture — both start at
  // offset 0 and both carry the tag. The PO ruled on the tail (T-570): a live
  // capture ENDS at the end of its notification block, and the only way user
  // text lands after that block is a person pasting and continuing to type.
  //
  // So: begins-with AND ends-with → non-fresh. Begins-with alone → fresh.
  describe('freshness is decided by where the prompt ENDS (T-570)', () => {
    test('preamble first, user-typed deploy request AFTER the block → fires', () => {
      const dir = makeProject(BUILD_STATE)
      const prompt = `${FULL_NOTIFICATION}

이거 확인했고, 이제 main 에 배포해줘.`
      const ctx = contextOf(runHook(dir, prompt))
      expect(ctx).toContain('stage=build')
      expect(ctx).toMatch(/ship entry/i)
    })

    test('preamble first, prompt ENDS at the block → stays silent (the live capture)', () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, NOTIFICATION_WITH_DEPLOY_WORD))
      expect(ctx).not.toMatch(/ship entry/i)
    })

    test('trailing whitespace and blank lines after the block are not "실질 텍스트"', () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, `${NOTIFICATION_WITH_DEPLOY_WORD}\n\n   \n\t\n`))
      expect(ctx).not.toMatch(/ship entry/i)
    })

    test('two blocks delivered together, ending at the second → still silent', () => {
      // Several background dispatches can complete into one turn. The tail rule
      // reads the LAST block's end, not the first.
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(runHook(dir, `${NOTIFICATION_WITH_DEPLOY_WORD}\n\n${TAG_BLOCK}`))
      expect(ctx).not.toMatch(/ship entry/i)
    })

    test('two blocks delivered together with a typed request under them → fires', () => {
      const dir = makeProject(BUILD_STATE)
      const ctx = contextOf(
        runHook(dir, `${FULL_NOTIFICATION}\n\n${TAG_BLOCK}\n\n둘 다 확인했어. 배포 진행해줘.`),
      )
      expect(ctx).toMatch(/ship entry/i)
    })
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
