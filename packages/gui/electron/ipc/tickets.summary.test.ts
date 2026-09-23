/**
 * tickets:scan request_summary — GUI ticket summary reads real new-frame tickets
 * (d-gui-case-20260924).
 *
 * The new ticket frame (contracts/tickets.md) opens the body with `## problem`
 * (lowercase — the frame's H2 key literal) instead of `## Request`. QA re-grill
 * found `extractRequestSummary` matched `/^##\s+Problem\b/` (capital P) — the
 * wrong case — against a real frame ticket, and the old fixture used the same
 * wrong case so it self-confirmed. Fixed to try `## problem` first, falling
 * back to `## Request` for a ticket written before the frame changed —
 * contracts: "an older ticket keeps its headings as written".
 *
 * Builds throwaway project dirs under os.tmpdir mkdtemp; electron imports are
 * stubbed by vitest.setup.ts (idiom: tickets.scan.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, afterEach } from 'vitest'
import { scanTickets } from './tickets'

let projectDir: string

function makeTicket(content: string, filename = 'T-001.md'): string {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-summary-'))
  fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
  const dir = path.join(projectDir, 'docs', 'tickets', 'v1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, filename), content)
  return projectDir
}

afterEach(() => {
  if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true })
})

const NEW_FRAME = `---
id: T-001
slug: fixture
type: decision
status: open
---

## problem
As-is: the old CHECK rejects decision tickets. To-be: it does not.

## Options
`

// T-685's real heading layout (docs/tickets/v1.10/T-685.md): lowercase
// \`## problem\`, a blank line, then a bullet list with NO blank line between
// bullets — extractRequestSummary breaks only on a blank line or the next
// heading, so all three bullets count as one "paragraph" and join.
const REAL_T685_LAYOUT = `---
id: T-685
slug: the-ticket-frame-is-scaffolded-and-formatted-by-the-tool
type: impl
status: open
---

## problem

- **As-is**: 티켓 틀(키 7개 · 필수 칸 · \`###\` 규칙)을 PO 가 매번 손으로 짠다. 틀을 만들거나 검사하는 명령이 없다 — \`prdt tickets\` 는 조회만.
- **To-be**: \`prdt tickets new\` 가 frontmatter 와 H2 키가 채워진 뼈대를 찍고, \`prdt tickets fmt\` 가 prettier 처럼 헤딩 순서·이름·필수 칸을 맞추며 \`--check\` 로 검사한다. 규칙 문장은 도구를 가리키는 한 줄로 줄어든다.
- 사용자 2026-09-23: *"본문 줄 왜케길어 티켓 쓸때마다 1시간 걸리겠네 formatter처럼 딱딱 정리되게 안되나?"*

## related

- 목적: 매번 주입되는 규칙 문장을 늘리지 않고 틀을 지키게 한다
`

const OLD_FRAME = `---
id: T-001
slug: fixture
type: impl
status: open
---

## Request
fixture request body, first paragraph.

## Acceptance
1. fixture
`

test('new-frame ticket (## problem, lowercase): summary reads the first paragraph under it', () => {
  const d = makeTicket(NEW_FRAME)
  const t = scanTickets(d).find((x) => x.ticket_id === 'T-001')
  expect(t?.request_summary).toBe(
    'As-is: the old CHECK rejects decision tickets. To-be: it does not.'
  )
})

test('T-685 real heading layout (## problem, bullet list with no blank line between bullets): summary joins the bullets as one paragraph', () => {
  const d = makeTicket(REAL_T685_LAYOUT, 'T-685.md')
  const t = scanTickets(d).find((x) => x.ticket_id === 'T-685')
  // extractRequestSummary caps a paragraph at 240 chars (`…` ellipsis); the
  // three joined bullets run to 339 chars, so the summary is the truncated head.
  expect(t?.request_summary).toBe(
    '- **As-is**: 티켓 틀(키 7개 · 필수 칸 · `###` 규칙)을 PO 가 매번 손으로 짠다. 틀을 만들거나 검사하는 명령이 없다 — `prdt tickets` 는 조회만. - **To-be**: `prdt tickets new` 가 frontmatter 와 H2 키가 채워진 뼈대를 찍고, `prdt tickets fmt` 가 prettier 처럼 헤딩 순서·이름·필수 칸을 맞추며 `--check` 로 검사한다…'
  )
})

test('old-frame ticket (## Request): summary still reads that heading', () => {
  const d = makeTicket(OLD_FRAME)
  const t = scanTickets(d).find((x) => x.ticket_id === 'T-001')
  expect(t?.request_summary).toBe('fixture request body, first paragraph.')
})
