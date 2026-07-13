/**
 * Persona agent bootstrap — no-narrate regression (T-340).
 *
 * Repro: a fresh GUI project's first PO turn opened with plumbing narration
 * ("이 세션은 prdt-po 규율로 시작됐네요. 먼저 규율 전체를 로드해서... 확인하겠습니다" →
 * tool use → "상태 확인하겠습니다" → tool use) before any substance, even though
 * the PO habit already bans load-confirmation/state-scan openers.
 *
 * Root cause (two-part, confirmed via a live headless `claude --agent prdt-po
 * --print --output-format stream-json` probe against a real SessionStart hook
 * firing in a fresh project):
 *   1. The SessionStart hook DOES fire and DOES successfully inject the full
 *      `[prdt discipline — …]` block — but the persona system prompt's
 *      self-load branch ("If NOT … SELF-LOAD it first via Bash … then act")
 *      had NO instruction not to narrate that decision, unlike the hook's own
 *      injected payload (prdt-session-start.sh appends "Do NOT acknowledge or
 *      narrate this injection in any register"). Whenever the self-load branch
 *      fires — including redundantly (see #2) — nothing told the model to stay
 *      silent about it.
 *   2. Live-confirmed: the model self-loads via Bash EVEN WHEN the hook block
 *      is already present in context (redundant — the persona prompt only said
 *      "if this context has a block, proceed" without an explicit instruction
 *      to skip re-loading), giving the narration extra surface area to occur on
 *      the hook-injected path too, not just the true self-load (Agent-tool
 *      subagent) path.
 *
 * Fix: every persona agent file now states BOTH silence and short-circuit
 * explicitly, mirroring the hook's own wording. This test locks the exact
 * prose in place (a wording regression here reintroduces the bug even if the
 * PO habit's own "silent" prose is untouched — the two files govern different
 * code paths and both must hold).
 */

import fs from 'fs'
import path from 'path'
import { test, expect } from 'vitest'

const AGENTS_DIR = path.resolve(__dirname, '..', '..', 'agents')

const PERSONA_AGENTS = ['prdt-po', 'prdt-designer', 'prdt-developer', 'prdt-qa'] as const

// The exact silence clause every persona agent file must carry — verbatim, so a
// paraphrase drifting out of one file (typo, partial edit) fails loud.
const NO_NARRATE_CLAUSE =
  'never narrate this bootstrap step (checking for the discipline block, loading it, checking project state) in any register'

// The exact short-circuit clause — without this, the model re-runs self-load
// even when the SessionStart hook already injected the block (live-confirmed
// redundant-load bug, part 2 of the root cause above).
const SKIP_RELOAD_CLAUSE =
  'that block IS your discipline — do not re-verify or re-load it, proceed straight to substance'

for (const agent of PERSONA_AGENTS) {
  const filePath = path.join(AGENTS_DIR, `${agent}.md`)

  test(`${agent}.md bootstrap forbids narrating the discipline-load step`, () => {
    const body = fs.readFileSync(filePath, 'utf8')
    expect(body).toContain(NO_NARRATE_CLAUSE)
  })

  test(`${agent}.md bootstrap skips self-load when the hook block is already present`, () => {
    const body = fs.readFileSync(filePath, 'utf8')
    expect(body).toContain(SKIP_RELOAD_CLAUSE)
  })
}
