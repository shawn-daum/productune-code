---
ticket_id: T-P4-126
title: "Doctrine MD optimization — caveman + English + 100-line cap + sub-file split"
type: doctrine
status: planned
assignee: pdt-designer
estimated_complexity: L4
model: opus
effort: high
created_at: 2026-05-18
---

# Plan — T-P4-126 Doctrine MD optimization

> Reorganization + compression only. Doctrine semantics unchanged.
> Edits = separate turn (T-P4-120 / T-P4-121 precedent).

## §1 Current line distribution + split candidates

`wc -l ~/.productune/po-instructions.md ~/.productune/sections/*.md`:

| File | Lines | Over cap? | Natural split candidates |
|:--|:--:|:--:|:--|
| `delegation.md` | **261** | yes | bash template (L23–97) · UKS field (L103–123) · dev-QA loop (L125–157) · promotion lifecycle (L208–225) · chunking detail (L227–261) |
| `lifecycle-mechanics.md` | **195** | yes | wiki-write invocation template (L37–66) · retrospective.md template (L136–172) · phase-transition jq oneliner (L7–11) |
| `alternative-reporting.md` | **156** | yes | option-block format spec (L17–66) · UKS line schema (L122–145) |
| `po-loop.md` | **148** | yes | pending-promotions drain prompt (L14–32) · disposition prefix list (Step 1 #2 sub) |
| `memory.md` | **143** | yes | promotion surface prompt (L9–21) · wiki-backend branches (L31–57) · po-state schema (L97–130) |
| `tickets.md` | **127** | yes | frontmatter schema verbatim · ticket id rules |
| `po-instructions.md` | **125** | yes | CAN-mechanical wiki-write sub-section (L20–43) · Files on-demand list (L77) |
| `prd-and-output.md` | 117 | borderline | clarity loop weights table |
| `lifecycle.md` | 111 | borderline | revival bash snippet |
| `routing.md` | 105 | borderline | full routing table |
| `escalation.md` | 97 | OK | — |
| `calibration.md` | 80 | OK | — |
| `evolution.md` | 50 | OK | — |

7 files over cap (100), 3 borderline, 3 OK.

### 1.1 Token cost projection

Step 1.1 의 PO 가 매 turn-start 마다 cost 부담:
- 현재: po-instructions.md (125) + po-memory.md (~60–80) = ~200 lines mandatory.
- + on-demand sections: 평균 turn 마다 1–3 sections = +150–500 lines.
- 총 ~350–700 lines per turn-start load.

목표 후: po-instructions.md ~80 + 각 main sections file <100 → ~250–400 lines
per turn-start. **~30–40% token reduction** for Step 1 cycle.

## §2 Sub-file naming convention + discovery rule

### 2.1 Naming

| Pattern | Purpose | Example |
|:--|:--|:--|
| `sections/_formats/<topic>.md` | verbatim template / schema / format spec | `_formats/delegation-template.md`, `_formats/wiki-write-template.md`, `_formats/ticket-frontmatter.md` |
| `sections/_details/<topic>.md` | rare-call detail / edge case / historical context | `_details/dev-qa-auto-loop.md`, `_details/chunking-rules.md`, `_details/po-state-schema.md` |

Both directories prefix `_` → human readability cue ("special, not for direct
recurrent load"). No conflict with T-P4-122 hidden-dir-skip (that's
`~/.claude/skills/`, not productune).

### 2.2 Discovery rule (PO doctrine)

Add 1 line to `po-instructions.md` `## Files` section:

> "**Sub-files (`sections/_formats/`, `sections/_details/`)** — main file 의
> `→ see _formats/<X>.md` 또는 `→ see _details/<X>.md` cross-ref 발견 시 PO
> on-demand 1회 read. session 내 cache. Step 1.1 의 main load 에는 미포함."

### 2.3 Cross-ref syntax (main file → sub-file)

Inline reference 패턴:

```markdown
Invocation template → see [`_formats/wiki-write-template.md`](_formats/wiki-write-template.md).
```

또는 표 안:

```markdown
| Detail | → `_details/dev-qa-auto-loop.md` |
```

Markdown link 형식 (clickable in editor) 으로 통일.

## §3 File-by-file diff plan

각 over-cap file 의 split target.

### 3.1 `po-instructions.md` (125 → target 80)

**Split out:**
- `_details/can-mechanical-writes.md` ← L13–43 (현 2 CAN sections — ticket md +
  wiki episode T-P4-121). Main 에는 1줄 cross-ref 만 남김:
  ```
  ## CAN (mechanical only) — see `sections/_details/can-mechanical-writes.md`
  - Ticket md frontmatter + Persona Activity rows.
  - Wiki episode via `claude --print` subprocess (T-P4-121).
  ```

**Compress in main:**
- `## Files` (L73–77) — 긴 inline list → 표 형식 또는 한 줄 sentence per file:
  ```
  ## Files
  Always: po-instructions.md (this), po-memory.md, .productune/po-state.json.
  On demand: sections/{po-loop, lifecycle, routing, delegation, tickets, lifecycle-mechanics, prd-and-output, escalation, calibration, memory, evolution, git-workflow, alternative-reporting}.md.
  Sub-files: see §2.2 (Discovery rule).
  ```

Target: **~75–80 lines**.

### 3.2 `delegation.md` (261 → target 80)

**Split out:**
- `_formats/delegation-template.md` ← L19–97 (bash minimal template, ~80 lines). Main 에는 cross-ref + 핵심 변수만:
  ```
  ### Minimal template
  Bash heredoc with $PERSONA, $MODEL, $EFFORT, $CTX. Hook auto-captures session_id.
  → see `_formats/delegation-template.md`.
  ```
- `_details/uks-field.md` ← L103–123 (T-P4-120 user_knowledge_state field).
- `_details/dev-qa-auto-loop.md` ← L125–157 (T-P4-112 auto-loop protocol).
- `_details/promotion-lifecycle.md` ← L208–225 (T-P4-121 promotion lifecycle).
- `_details/chunking-rules.md` ← L227–261 (full chunking with bad/good cases).

**Keep in main:**
- ## Invoke (non-interactive) intro (L3–5).
- ## Artifact self-verify gate (L7–17).
- ## PRD delegation summary (L159–187) — compress to 8 lines + cross-ref to
  prd-and-output.md (already exists).
- ## Plan mode summary (L189–206) — keep, compress.
- ## Chunking 1-line summary + cross-ref to `_details/chunking-rules.md`.

Target: **~75–80 lines**.

### 3.3 `lifecycle-mechanics.md` (195 → target 80)

**Split out:**
- `_formats/wiki-write-template.md` ← L37–66 (bash invocation template,
  T-P4-121).
- `_formats/retrospective-md.md` ← L136–172 (retrospective.md template).
- `_details/po-mechanical-wiki-write.md` ← L13–96 (전체 T-P4-121 sub-section
  detail). Main 에는 1줄:
  ```
  ## PO mechanical wiki write (T-P4-121)
  PO is sole executor via `claude --print` subprocess. Subagent path retired.
  → see `_details/po-mechanical-wiki-write.md` + `_formats/wiki-write-template.md`.
  ```
- `_details/phase5-retrospective.md` ← L174–195 (read sources + sequence
  table).

**Keep in main:**
- ## Phase transition mechanical write (L5–11) — short jq oneliner, useful
  inline.
- ## Auto QA smoke gate (L98–108).
- ## Mechanical close rules (L110–120).
- ## Outcome measurement (L122–130).
- ## Lazy measurement (L132–134).

Target: **~75–80 lines**.

### 3.4 `alternative-reporting.md` (156 → target 80)

**Split out:**
- `_formats/alternative-block.md` ← L17–60 (Option block + Pros/Cons format
  + good/bad recommendation examples).
- `_details/uks-line-schema.md` ← L122–145 (User knowledge state line format
  + update triggers).

**Keep in main:**
- Intro + applies-to (L1–14).
- Mandatory format 1-line summary + cross-ref to `_formats/alternative-block.md`.
- Vague-descriptor blacklist (L68–90) — central rule, keep inline.
- User-side reject signal (L93–101).
- Escape / caveman-only (L103–107).
- Persona-side enforcement table (L148–155).

Target: **~75–80 lines**.

### 3.5 `po-loop.md` (148 → target 80)

**Split out:**
- `_formats/promotion-drain-prompt.md` ← L14–32 (pending_promotions drain
  prompt example + user response handling).
- `_details/po-loop-extras.md` ← edge cases (rarely-fired prefixes,
  disposition cues, knowledge-state correction triggers).

**Keep in main:**
- Naming note (L3–8).
- ## Step 1 summary (compressed).
- ## Step 2 summary with sub-Step 2A/2B/2C/2D references.
- ## Step 3 summary.

Target: **~75–80 lines**.

### 3.6 `memory.md` (143 → target 80)

**Split out:**
- `_formats/promotion-surface-prompt.md` ← L9–21 (surface prompt example).
- `_formats/po-state-schema.md` ← L97–130 (full canonical schema — biggest
  block).
- `_details/wiki-backend-branches.md` ← L31–57 (graphiti/keeper/fs branches
  + background job tracking + pre-persona wiki search).

**Keep in main:**
- ## Promotion gate intro (L5–22).
- ## Mechanical writes 1-line per tier + cross-refs (L23–35 compressed).
- ## Persistence + Why gated (L59–66).
- ## PO memory schema (L67–95 compressed — Product taste examples may move to
  `_formats/product-taste-examples.md`).
- ## Per-project state pointer + cross-ref (1 line).
- ## Persona product-memory table (L132–143).

Target: **~75–80 lines**.

### 3.7 `tickets.md` (127 → target 80)

**Split out:**
- `_formats/ticket-frontmatter.md` ← full frontmatter schema.
- `_formats/ticket-id-rules.md` ← T-NNN id allocation rules.

Target: **~75–80 lines**.

### 3.8 Borderline files (light compress only)

- `prd-and-output.md` (117) → 95–100.
- `lifecycle.md` (111) → 95–100.
- `routing.md` (105) → 95–100.

Light compression: caveman + drop redundant prose. No sub-file split unless
clear extraction target.

## §4 Caveman compression target

Doctrine prose convention (already inferred from
`feedback_caveman_lite.md`) — applied uniformly:

| Rule | Before | After |
|:--|:--|:--|
| Drop articles | "the PO writes a state file" | "PO writes state file" |
| Drop linking verbs | "X is mandatory" | "X mandatory" |
| Arrow over prose | "leads to" / "causes" / "results in" | "→" |
| Compact lists | sentences | bullets where ≥2 items |
| Drop redundant qualifiers | "exactly one" → "1"; "in order to" → "to" | |
| Tables for repeated patterns | inline bullet groups | table |
| Code blocks for verbatim | inline backticks for multi-token | `\`\`\`` block (already practiced) |

### 4.1 Preserve verbatim

- User-quoted phrases (e.g., `## Product taste` examples) — verbatim Korean
  OK (intentional doctrine choice).
- Code blocks (bash, json, ts) — no compression, syntax-critical.
- Refusal templates — verbatim English, PO renders in user's lang.

### 4.2 Estimate

Existing prose ~30–40% filler. Caveman pass alone gives ~20–30% line
reduction without sub-file split. Combined with sub-file split → ~50–60%
main-file reduction.

## §5 Korean residue cleanup (English-only)

`grep -c '[가-힣]'` results:

| File | hits | classification |
|:--|:--:|:--|
| `po-memory.md` | 17 | (out of scope — user-facing) |
| `alternative-reporting.md` | 9 | verbatim user phrases (preserve) + some prose (translate) |
| `lifecycle-mechanics.md` | 5 | "GUI [승인 →] 클릭은..." prose (translate to English) |
| `po-loop.md` | 3 | prose (translate) |
| `memory.md` | 2 | likely prose (translate) |
| `delegation.md` | 2 | likely prose (translate) |
| `prd-and-output.md` | 2 | prose (translate) |
| `lifecycle.md` | 1 | prose (translate) |
| `po-instructions.md` | 1 | check + translate |

Total **~25 lines** Korean prose to translate. Verbatim user-phrase examples
(in `## Product taste` doctrine + `alternative-reporting.md` examples) stay
Korean by design — same line not counted twice.

### 5.1 Translation rule

- Each Korean prose line → identify intent → write English caveman
  equivalent.
- "verbatim quote" / "user phrase example" → keep as-is (intentional).
- Comments inside code blocks → translate to English (consistency with rest).

## §6 Repo mirror sync sequence

Live (`~/.productune/`) ↔ repo (`packages/core/po/`) — both must reflect
T-P4-126 final structure.

Steps (implementation turn):

1. Edit live main files first (po-instructions.md + 12 sections/*.md
   compressions + split-outs).
2. Create `sections/_formats/` + `sections/_details/` sub-files in live.
3. Verify `wc -l` < 100 for every main file.
4. `cp -r ~/.productune/po-instructions.md` + `sections/` → `packages/core/po/`.
5. `diff -r ~/.productune/po-instructions.md packages/core/po/po-instructions.md` empty.
6. `diff -r ~/.productune/sections packages/core/po/sections` empty.
7. Update repo's `install.sh` seed list if it scans `sections/` (sub-files
   should be picked up automatically by directory walk — verify).

### 6.1 install.sh seed verification

Existing install.sh seeds `po-instructions.md` + `sections/*.md` to
`~/.productune/`. Sub-dirs `_formats/` + `_details/` 자동 picked up by `cp -r`
or rsync 패턴. **Verify** in impl turn — no doctrine impact, just operational
check.

## §7 Open Questions

(1) **Backward-compat for existing PO sessions** — 진행 중 turn 이 old
delegation.md L19–97 inline reference 를 기억하면? Impl turn 후 첫 PO turn
부터 새 cross-ref 따라가야. session resume 영향 없음 (PO 가 매 turn-start 마다
재load).
- (a) Hard cutover — impl turn 즉시 모든 main file 갱신, 진행 중 task 는 다음
  PO turn 부터 새 layout 인식. **Designer 추천** — `[Architecture trade-offs · very strong]` 양립 불가능 (compatibility shim 부담 > 직접 cutover).
- (b) Deprecation transition — 2주 dual-layout 유지.

(2) **Sub-file 도 mirror sync 대상**? `packages/core/po/sections/_formats/` +
`_details/` 도 동시 sync 필요.
- (a) **yes** — main file 의 cross-ref 가 broken 되지 않으려면 sub-file 도
  mirror 에 있어야 함. **Designer 추천**.
- (b) sub-file 은 live only — repo 는 main 만. main file 의 cross-ref 는
  user 의 `~/.productune/` 에서만 유효.

(3) **Sub-file 도 install.sh seed?** install.sh 가 sub-file 까지 user
`~/.productune/sections/` 로 cp 해야.
- (a) **yes (recursive cp)** — `cp -r packages/core/po/sections/ ~/.productune/sections/`. **Designer 추천**.
- (b) main file 만 seed — sub-file 은 user 가 별도 fetch (불편, 권장 X).

(4) **Korean verbatim user-phrase 예시** — `## Product taste` doctrine 안의
mixed-lang 예시 (예: `· "오 이제 잘 되네"`) 보존?
- (a) **보존** — doctrine 의도. verbatim 의 핵심. **Designer 추천**.
- (b) translate — English 통일 우선.

(5) **alternative-reporting.md 의 한국어 prose** — T-P4-120 에서 의도적으로
mixed (caveman lite 한국어) 작성된 일부 prose 가 있음. English caveman 으로
일괄 변환?
- (a) **English 통일** — doctrine 은 inter-persona English convention. **Designer 추천**.
- (b) 일부 preserve — user 가 직접 작성한 directive 인용 prose 는 verbatim.

(6) **100-line cap 위반 후 enforce 방법** — 향후 doctrine 변경 시 100 lines
초과 막을 메커니즘?
- (a) hook script — `pre-commit` 으로 `wc -l ~/.productune/po-instructions.md && wc -l sections/*.md` 검사 후 100 초과 시 block. 별 ticket 으로 promote.
- (b) doctrine prose 만 명시 — designer 가 self-enforce.
- **Designer 추천** — (b) 본 ticket scope 내 / (a) 별 ticket 후보.

## §Out of scope

- Doctrine semantic 변경 — 본 ticket = pure reorganization + compression.
  rule 자체는 그대로.
- `po-memory.md` 의 Korean prose — user-facing, designer touch 금지.
- `~/.productune/` 외 다른 파일 (e.g., scripts/, packages/core/agents/) —
  agent variants 의 mcpServers / tools / 한국어 prose 등은 별 ticket.
- 100-line cap enforce hook — Open Question (6) (a) 별 ticket 후보.
- pdt-po.md 또는 agent file 자체 압축 — 별 ticket (designer agent 의
  pdt-designer.md, pdt-developer.md, pdt-qa.md 등도 비슷한 압축 가능).
- `po-loop.md` 의 Step1 step2 #14a/b/c 같은 inline reference 변경 — semantic
  유지하려면 인용 line ID 보존 필요.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `wc -l` < 100 for every main file + `grep -c '[가-힣]'` 0 (except po-memory.md + verbatim user-phrase examples) + `diff -r ~/.productune ↔ packages/core/po` empty + 다음 PO turn 의 Step 1 load 가 main file 만으로 정상 동작 |
| **사용자 dogfood** | 다음 PO turn 에서 (1) Step 1.1 (main load) 가 정상 / (2) sub-file 참조 시점에 PO 가 `_formats/<X>.md` 또는 `_details/<X>.md` 1회 read 하는지 trace log 확인 / (3) 신규 ticket emit 등 정상 작동 (T-P4-120 / T-P4-121 / T-P4-125 doctrine 동작 그대로). |
| **regression check** | (a) install.sh sub-file seed (Open Question 3) — `cp -r` 로 자동 picked up 확인. (b) repo mirror diff empty 유지 (Open Question 2). (c) T-P4-120 alternative-reporting + T-P4-121 wiki write 두 doctrine 가 sub-file 분리 후에도 동작. |
