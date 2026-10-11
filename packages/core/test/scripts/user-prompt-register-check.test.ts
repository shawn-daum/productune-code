/**
 * prdt-user-prompt.sh — the form=outline COMPLIANCE detector (T-651).
 *
 * WHY (docs/tickets/v1.10/T-651.md): the register's `[prdt register]` binding
 * line was checked for DELIVERY only — nobody checked whether the PO's own
 * last reply OBEYED it. The user had to notice paragraph prose in person
 * before anyone said anything. This hook is the one per-turn assembly point
 * (T-586/T-627), already inside a python process, so the detector rides here:
 * no new hook registration, no new process.
 *
 * MECHANISM under test:
 *   - fires ONLY when this turn's resolver `--binding` line carries the exact
 *     `form=outline` pair (never a register-file read — the resolver stays
 *     the sole authority on legal values, contracts §Fixed paths);
 *   - reads `transcript_path` from the END in 256 KB steps (cap 1 MB) for the
 *     last MAIN-SESSION (`isSidechain` false) assistant TEXT block — never a
 *     sidechain/subagent transcript, a tool-call description, a dispatch
 *     body, a file, or a ticket;
 *   - a fixed judgment formula (T-651 §판정식) with no model call and no
 *     human judgment in the loop — same reply, same verdict, always;
 *   - silent (0 B) on a compliant reply, a one-line reply, form≠outline, a
 *     missing/unreadable transcript, or any parse failure.
 *
 * The notice's WORDING is the designer's to word (REGISTER_CHECK_NOTICE,
 * landed 4839bbd) — this file pins it by PROPERTY (fixed prefix, the computed
 * count, the line numbers, never the reply's own text), not by asserting the
 * whole sentence verbatim (T-642/T-687: a full-string pin breaks on every
 * innocuous rewording and teaches nobody to re-check the actual contract).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-user-prompt.sh')
const NOTICE_TAG = '[prdt register check]'

/**
 * Every `makeSandbox()` root, so `afterEach` below can remove it. Without
 * this, each test run leaked one `prdt-t651-*` dir per test (mkdtempSync with
 * no matching rmSync) into the REAL os.tmpdir() — never the sandbox's own
 * PRDT_HOME, but still a real leak on the host machine across repeated runs.
 */
const sandboxRoots: string[] = []

/** Throwaway project + its own sandbox PRDT_HOME (never the real ~/.prdt). */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t651-'))
  sandboxRoots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(proj, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.10', current_task: null }),
  )
  const prdtHome = path.join(root, 'prdthome')
  fs.mkdirSync(prdtHome, { recursive: true })
  return { root, proj, prdtHome }
}

afterEach(() => {
  while (sandboxRoots.length > 0) {
    const root = sandboxRoots.pop() as string
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * A copy of the REAL hook beside a STUB `prdt-audience-inject.sh` — the hook
 * resolves its resolver from its own BASH_SOURCE dir, so this exercises the
 * actual subprocess.run call site with no edit to the hook and no injected
 * test-only branch (same technique as user-prompt-register-guard.test.ts).
 */
function stubResolverHook(root: string, name: string, bindingTail: string): string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  fs.writeFileSync(
    path.join(dir, 'prdt-audience-inject.sh'),
    `#!/usr/bin/env bash\necho "[prdt register] ${bindingTail}"\n`,
  )
  return hook
}

const FORM_OUTLINE_BINDING = 'audience=developer · form=outline · structure=planner-tables'
const FORM_PROSE_BINDING = 'audience=developer · form=prose · structure=planner-tables'

/** One main-session (isSidechain=false) assistant record holding a TEXT block. */
function mainText(text: string) {
  return JSON.stringify({
    type: 'assistant', isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })
}

/** A sidechain assistant record — must never be read as the PO's own reply. */
function sidechainText(text: string) {
  return JSON.stringify({
    type: 'assistant', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })
}

/** A main-session assistant record that only calls a tool — no text block. */
function mainToolOnly() {
  return JSON.stringify({
    type: 'assistant', isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
  })
}

function writeTranscript(dir: string, lines: string[]): string {
  const p = path.join(dir, 'transcript.jsonl')
  fs.writeFileSync(p, lines.join('\n') + '\n')
  return p
}

function event(cwd: string, sid: string, transcriptPath: string | null, prompt = 'next') {
  const ev: Record<string, unknown> = { hook_event_name: 'UserPromptSubmit', session_id: sid, cwd, prompt }
  if (transcriptPath) ev.transcript_path = transcriptPath
  return JSON.stringify(ev)
}

/** Run the hook to completion; returns its additionalContext. */
function run(hook: string, cwd: string, sid: string, transcriptPath: string | null, env: NodeJS.ProcessEnv = {}): string {
  const out = execFileSync('bash', [hook], {
    input: event(cwd, sid, transcriptPath), encoding: 'utf8', env: { ...process.env, ...env },
  })
  const parsed = JSON.parse(out)
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  return parsed.hookSpecificOutput.additionalContext as string
}

let seq = 0
function nextSid(): string { seq += 1; return `sess-t651-${seq}` }

describe('the notice fires only when form=outline is bound this turn', () => {
  test('form=outline + a violating reply → the notice appears', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r1', FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [mainText('첫 문장.\n둘째 문장.')])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain(NOTICE_TAG)
  })

  test('form≠outline (form=prose) → no notice however prose-shaped the reply is', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r2', FORM_PROSE_BINDING)
    const tp = writeTranscript(sb.proj, [mainText('첫 문장입니다.\n둘째 문장입니다.\n셋째 문장입니다.')])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('[prdt register]') // the binding line itself still rides
    expect(ctx).not.toContain(NOTICE_TAG)
  })

  test('no register file / all-default (resolver prints nothing) → no notice, no binding line', () => {
    const sb = makeSandbox()
    const dir = path.join(sb.root, 'r3')
    fs.mkdirSync(dir, { recursive: true })
    const hook = path.join(dir, 'prdt-user-prompt.sh')
    fs.copyFileSync(HOOK, hook)
    fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'), '#!/usr/bin/env bash\nexit 0\n')
    const tp = writeTranscript(sb.proj, [mainText('첫 문장.\n둘째 문장.')])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).not.toContain(NOTICE_TAG)
    expect(ctx).not.toMatch(/^\[prdt register\] /m)
  })
})

describe('transcript sourcing — main session only, never sidechain, never no-text', () => {
  test('a trailing SIDECHAIN text block is ignored; the last MAIN-session text is used', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r4', FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [
      mainText('첫 문장.\n둘째 문장.'),          // violates — should be the one read
      sidechainText('요약.'),                    // last in the file, but a subagent's own turn
    ])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain(NOTICE_TAG)
  })

  test('a trailing tool-only main-session record has no text — falls back to the earlier text block', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r5', FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [
      mainText('첫 문장.\n둘째 문장.'),
      mainToolOnly(),
    ])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain(NOTICE_TAG)
  })

  test('missing transcript_path → silent (no notice, no crash)', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r6', FORM_OUTLINE_BINDING)
    const ctx = run(hook, sb.proj, nextSid(), null, { PRDT_HOME: sb.prdtHome })
    expect(ctx).not.toContain(NOTICE_TAG)
    expect(ctx).toContain('[prdt register]')
  })

  test('unreadable transcript_path (does not exist on disk) → silent', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r7', FORM_OUTLINE_BINDING)
    const ctx = run(hook, sb.proj, nextSid(), path.join(sb.proj, 'does-not-exist.jsonl'), { PRDT_HOME: sb.prdtHome })
    expect(ctx).not.toContain(NOTICE_TAG)
  })

  test('a transcript with no qualifying record at all within budget → silent', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r8', FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [sidechainText('첫 문장.\n둘째 문장.'), mainToolOnly()])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).not.toContain(NOTICE_TAG)
  })
})

/**
 * Sample-line fixture — pins the §판정식 classification directly (T-651
 * acceptance: "a fixture of classified sample lines pins the rule"). Each case
 * is one PO reply run through the REAL hook end to end; `violations` is the
 * expected 1-indexed violating line list, or `null` for "no notice at all".
 */
const FIXTURES: Array<{ name: string, reply: string, violations: number[] | null }> = [
  {
    name: 'a lone conclusion line + bullets — the allowed one-sentence opener',
    reply: '요약입니다.\n\n- 항목1\n- 항목2',
    violations: null,
  },
  {
    name: 'two sentences packed onto ONE line (ⓐ) beside a table — violates alone',
    reply: '이건 하나입니다. 그리고 둘입니다.\n\n| a | b |\n|---|---|',
    violations: [1],
  },
  {
    name: 'two consecutive unmarked lines (ⓑ) — only the SECOND is flagged',
    reply: '제목입니다.\n\n첫 문장.\n둘째 문장.\n- 정리1\n- 정리2',
    violations: [4],
  },
  {
    name: 'Korean false-positive guard: "둘 다 처리했어요." is one sentence, not flagged',
    reply: '둘 다 처리했어요.\n- 상세1\n- 상세2',
    violations: null,
  },
  {
    name: 'digit-before-dot guard: inline "1." / "2." are not sentence ends',
    reply: '옵션은 1. 저장 2. 취소 중 하나를 고르세요.\n- 비고',
    violations: null,
  },
  {
    name: 'a single non-blank line, however many sentences — never judged at all',
    reply: '하나. 둘. 셋. 넷.',
    violations: null,
  },
  {
    name: 'a bold sub-heading line does not count as a candidate and does not chain',
    reply: '**소제목**\n첫 문장.\n둘째 문장.',
    violations: [3],
  },
  {
    name: 'indented wrapped continuation (2+ spaces) is excluded, breaks the chain',
    reply: '첫 문장.\n  이어지는 들여쓴 줄.\n- 정리',
    violations: null,
  },
  {
    name: 'content inside a code fence is never judged, even if prose-shaped',
    reply: '```\n첫 문장. 둘째 문장. 셋째 문장.\n```\n- 정리',
    violations: null,
  },
  {
    name: 'three separate paragraph runs — three distinct violation lines',
    reply: '하나.\n둘.\n\n셋.\n넷.\n\n다섯.\n여섯.',
    violations: [2, 5, 8],
  },
  {
    name: 'self-labelled A/B/C sequence, no blank line between items — not flagged (T-768)',
    reply: '정리입니다.\n\nA 항목1\nB 항목2\nC 항목3',
    violations: null,
  },
  {
    name: 'self-labelled a/b/c sequence — not flagged (T-768)',
    reply: '정리입니다.\n\na 세부1\nb 세부2\nc 세부3',
    violations: null,
  },
  {
    name: 'self-labelled i/ii/iii roman-numeral sequence — not flagged (T-768)',
    reply: '정리입니다.\n\ni 단계1\nii 단계2\niii 단계3',
    violations: null,
  },
  {
    name: 'self-labelled items beside a genuine 2-sentence unmarked line — that line still flags (T-768)',
    reply: 'A 항목1\nB 항목2\n이건 하나입니다. 그리고 둘입니다.',
    violations: [3],
  },
  {
    name: 'self-labelled items beside two consecutive unmarked lines — the second still flags (T-768)',
    reply: 'A 항목1\nB 항목2\n첫 문장.\n둘째 문장.',
    violations: [4],
  },  {
    name: 'an English sentence opening with the article "A" is not a self-label — the run still flags (T-789)',
    reply: '정리입니다.\n\nA dispatch was denied.\nA worker retried it.',
    violations: [4],
  },
  {
    name: 'lowercase article "a" / pronoun "I" openers are not self-labels either (T-789)',
    reply: '정리입니다.\n\nI checked the gate.\na second run passed.',
    violations: [4],
  },
  {
    name: 'real options "A 그대로 두기" / "A. …" / "A) …" stay self-labelled (T-789)',
    reply: '정리입니다.\n\nA 그대로 두기\nB. 고치기\nC) Fix it now',
    violations: null,
  },
  {
    name: 'a **label:** paragraph holding 2 sentences is a marked line — not flagged (T-1070)',
    reply: '**초안:** 수정안이 준비됐어요. 10행을 바꿔요.\n\n**다음:** 반영할지 확인 부탁드려요. 답 주시면 바로 진행해요.',
    violations: null,
  },
  {
    name: 'an unmarked line after a label paragraph still flags on 2 sentences (T-1070)',
    reply: '**초안:** 준비됐어요.\n\n이건 하나입니다. 그리고 둘입니다.',
    violations: [3],
  },
]

describe('§판정식 fixture — pinned sample-line classification', () => {
  test.each(FIXTURES)('$name', ({ reply, violations }) => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, `fx-${Math.random().toString(36).slice(2)}`, FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [mainText(reply)])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    if (violations === null) {
      expect(ctx).not.toContain(NOTICE_TAG)
      return
    }
    expect(ctx).toContain(NOTICE_TAG)
    // Property-pinned, not a whole-sentence match (T-642/T-687): the fixed
    // tag, the computed count, and the exact comma-joined line numbers — the
    // designer's own wording around them is free to change.
    const line = ctx.split('\n').find((l) => l.includes(NOTICE_TAG))
    expect(line, 'notice line present').toBeTruthy()
    expect(line).toContain(`${violations.length} paragraph line(s)`)
    expect(line).toContain(`(lines ${violations.join(', ')})`)
    // never quotes the reply's own text
    for (const raw of reply.split('\n')) {
      const trimmed = raw.trim()
      if (trimmed.length > 3) expect(line).not.toContain(trimmed)
    }
  })
})

describe('never quotes the reply, whatever it says', () => {
  test('a violating reply with a distinctive marker phrase never lands in the notice', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'r9', FORM_OUTLINE_BINDING)
    const marker = 'UNMISTAKABLE_SENTINEL_9f3'
    const tp = writeTranscript(sb.proj, [mainText(`${marker} 첫 문장.\n${marker} 둘째 문장.`)])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain(NOTICE_TAG)
    expect(ctx).not.toContain(marker)
  })
})

describe('performance — a realistic worst-case transcript', () => {
  test('a ~17 MB transcript still resolves the last main-session text block quickly', () => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, 'perf', FORM_OUTLINE_BINDING)
    const filler = mainToolOnly()
    const fillerLine = filler + '\n'
    const targetBytes = 17 * 1024 * 1024
    const repeats = Math.ceil(targetBytes / Buffer.byteLength(fillerLine, 'utf8'))
    const tp = path.join(sb.proj, 'transcript.jsonl')
    const fd = fs.openSync(tp, 'w')
    const chunk = fillerLine.repeat(2000)
    let written = 0
    while (written < repeats) {
      const n = Math.min(2000, repeats - written)
      fs.writeSync(fd, n === 2000 ? chunk : fillerLine.repeat(n))
      written += n
    }
    fs.writeSync(fd, mainText('첫 문장.\n둘째 문장.') + '\n')
    fs.closeSync(fd)
    const sizeMB = fs.statSync(tp).size / (1024 * 1024)

    const t0 = Date.now()
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    const elapsedMs = Date.now() - t0

    expect(ctx).toContain(NOTICE_TAG)
    // eslint-disable-next-line no-console
    console.log(`[T-651 perf] transcript ${sizeMB.toFixed(1)} MB, hook wall time ${elapsedMs} ms`)
    // Generous ceiling — this asserts "did not regress into a full-file scan
    // in the worst case", not a tight budget; the tail-read cap is 1 MB
    // regardless of file size, so wall time should not scale with file size.
    expect(elapsedMs).toBeLessThan(15000)
  }, 20000)
})

/**
 * T-869 — top-level point blocks glued together with no blank line between them.
 * NARO_REPLY mirrors the shape of the naro-proto PO reply in the ticket's
 * evidence (five `- ` blocks, each with `·` lines, no blank line between).
 */
const NARO_REPLY = [
  '정리입니다.',
  '',
  '- 에피소드 탭 캘린더',
  '   · 날짜별로 묶어 보여 줘요',
  '- 「기타」 음식 사진',
  '   · 분류가 비어 있어요',
  '- 지금 시작한 작업',
  '   · 캘린더 연결',
  '- 답이 필요한 것 1',
  '   · 기본 탭을 고르세요',
  '- 답이 필요한 것 2',
  '   · 사진 보존 기간',
].join('\n')

const REAL_NARO_REPLY = `- 에피소드 탭 캘린더
  - 없어진 게 아니라 아직 만들지 않았어요
  - 지금 앱에는 캘린더가 들어갈 빈 자리만 있어요
  - 캘린더 작업(T-327)은 VoiceOver 문구 하나가 확정되면 바로 시작해요. 아래 질문 5번이에요
- "기타"에 섞인 음식 사진 (T-337)
  - 꽃 때와 같은 방식으로 조사를 시작했어요
     · iPhone 11 사진에서 "기타" 사진을 무작위로 뽑아 음식이 몇 장인지 세요
     · 왜 놓쳤는지 확인해요
     · 9칸 확인 같은 방법으로 되찾을 수 있는지 비교해요
  - 표본 시트가 나오면 션님이 맞음/아님을 표시해 주시면 돼요
  - 기기 데이터는 읽기만 하고, 지우는 작업은 금지해 뒀어요
- 지금 시작한 작업
  - T-128: 장면 판정 기준 정하기 (Designer). 션님의 iPhone 판정 세션 전에 필요해요
  - T-330: 가끔 실패하는 테스트 고치기 (Developer)
  - T-308: 서버 전송 안내 문구는 T-128이 끝나면 이어서 시작해요
     · 두 작업이 같은 디자인 문서를 고쳐서 순서대로 해요
- 답이 필요한 것 1 — 얼굴 2개짜리 앨범끼리 묻는 질문 57개를 어디에 둘까요? (T-318)
  - 장면을 넘어 자동으로 합치는 건 얼굴이 많은 앨범끼리만 해요`

const BLANK_FIXTURES: Array<{ name: string, reply: string, lines: number[] | null }> = [
  { name: 'verbatim naro reply (2026-10-06) — nested `  - ` children, 3 glued blocks', reply: REAL_NARO_REPLY, lines: [5, 12, 17] },
  { name: 'nested `  - ` children glued to the next point — flagged', reply: '- 하나\n  - 세부\n- 둘', lines: [3] },
  { name: 'naro-proto reply — five glued blocks, four flagged', reply: NARO_REPLY, lines: [5, 7, 9, 11] },
  {
    name: 'compliant — blank line after each block, `·` lines kept inside',
    reply: '- 하나\n   · 세부\n\n- 둘\n   · 세부\n\n- 셋',
    lines: null,
  },
  { name: 'plain one-line bullets stacked — an ordinary list, not flagged', reply: '- 하나\n- 둘\n- 셋', lines: null },
  { name: 'two label paragraphs glued with no blank line, no sub-lines — flagged (T-1070)', reply: '**초안:** 준비됐어요.\n**다음:** 확인 부탁드려요.', lines: [2] },
  {
    name: 'label paragraphs with `·` sub-lines and a blank line after each block — not flagged (T-1070)',
    reply: '**초안:** 준비됐어요\n   · 10행을 바꿔요\n\n**다음:** 확인 부탁드려요',
    lines: null,
  },
  { name: 'a label paragraph glued under a `-` block — flagged (T-1070)', reply: '- 하나\n**다음:** 확인 부탁드려요', lines: [2] },
  { name: 'a bare A/B/C self-label list stacked — an ordinary list, not flagged (T-768, T-1070)', reply: '정리입니다.\n\nA 그대로 두기\nB 고치기\nC 미루기', lines: null },
  { name: 'a self-label block with sub-lines glued to the next — flagged (T-1070)', reply: 'A 그대로 두기\n   · 비용 없음\nB 고치기', lines: [3] },
  { name: 'a `-` list right under a bold sub-heading — `-` behavior unchanged, not flagged', reply: '**소제목**\n- 하나\n   · 세부\n\n- 둘', lines: null },
  {
    name: 'table and code block between points — not flagged',
    reply: '- 하나\n   · 세부\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n- 코드\n   · 안\n- 코드2\n```\n- 둘\n   · 세부',
    lines: null,
  },
]

describe('T-869 blank line between top-level point blocks', () => {
  test.each(BLANK_FIXTURES)('$name', ({ reply, lines }) => {
    const sb = makeSandbox()
    const hook = stubResolverHook(sb.root, `bl-${Math.random().toString(36).slice(2)}`, FORM_OUTLINE_BINDING)
    const tp = writeTranscript(sb.proj, [mainText(reply)])
    const ctx = run(hook, sb.proj, nextSid(), tp, { PRDT_HOME: sb.prdtHome })
    const noticeLines = ctx.split('\n').filter((l) => l.includes(NOTICE_TAG))
    if (lines === null) {
      expect(noticeLines).toEqual([])
      return
    }
    expect(noticeLines).toHaveLength(1)
    expect(noticeLines[0]).toContain(`${lines.length} point block(s)`)
    expect(noticeLines[0]).toContain(`(lines ${lines.join(', ')})`)
    for (const raw of reply.split('\n')) {
      const trimmed = raw.trim()
      if (trimmed.length > 3) expect(noticeLines[0]).not.toContain(trimmed)
    }
  })
})
