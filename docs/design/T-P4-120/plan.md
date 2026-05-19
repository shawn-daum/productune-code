---
ticket: T-P4-120
slug: alternative-reporting-protocol
version: v0.4-meta-dogfood
type: doctrine-plan
status: planned
author: pdt-designer
date: 2026-05-15
---

# T-P4-120 — Plan: Alternative-reporting protocol (knowledge-state anchored)

> **Source of truth** for the doctrine feature. PO mechanically promotes per §3 in a follow-up turn.

## §1 Background — user directive 보존

**verbatim (2026-05-15):**
> "이런식으로 문제를 해결하는 대안을 유저한테 보고할 때 유저의 지식상태를 기반으로 대안의 장단점을 명시적으로 유저가 받아야돼.(지식 상태 또한 po의 메모리에 update되어야함) ... 이 과정도 productune의 feature에 넣자."

**Trigger turn:** T-P4-119 race-fix dispatch 직후. PO 가 A (main onMsgId 지연) / B (renderer
listener uplift) / C (FreshComposer 직접 구독) 3 alternative 를 vague descriptor (`cleanest`,
`simpler`, `more elegant`) 위주로 제시. user 가 자기 knowledge state 를 caveman-lite 로
enumerate (Electron IPC solid, React lifecycle solid, Zustand fluent, race-condition concept
fluent, architecture-tradeoff strong) → PO 재설명 → user 가 이 패턴의 **doctrine 화** 를 명시 요구.

**현재 상태 (baseline already in place):** `~/.productune/po-memory.md` 의
`## User knowledge state (engineering)` 섹션이 2026-05-15 baseline 6 줄로 이미 stub 추가됨
(read 결과 확인). 본 plan 은 그 stub 을 **doctrine-mandatory** 로 승격 + 사용 규약 명세.

---

## §2 Doctrine 변경 요약 (전체 5 항목)

| § | 변경 대상 | 변경 종류 | 한 줄 |
|:--|:--|:--|:--|
| 3.a | `~/.productune/po-memory.md` (template + live) | section schema normative 화 | User knowledge state 가 PO Step 1 mandatory load |
| 3.b | `~/.productune/sections/alternative-reporting.md` | **신규 파일** | N≥2 alternative 보고의 mandatory format + blacklist |
| 3.c | `~/.productune/po-instructions.md` | 3 곳 변경 | Files / Hard rules / Step 1 §6 reference |
| 3.d | `~/.productune/sections/po-loop.md` | Step 1.1 / Step 1 #6 / Step 3 #14c 변경 | load 의무 + 위임 + capture rule |
| 3.e | `[ctx]` delegation JSON shape + persona enforcement | 필드 추가 | Designer/Developer/QA plan 내 alternative 표도 동일 protocol |

본 ticket scope 는 spec authoring. 실 편집은 PO 후속 turn (mechanical promotion).

---

## §3 Section-by-section diff spec

### 3.a `~/.productune/po-memory.md` — `## User knowledge state (engineering)` normative

#### 3.a.1 Section header 규약

```markdown
## User knowledge state (engineering)
<!-- PO infers from session traces. Pros/cons reporting MUST be grounded against this.
     Update when user corrects PO (pushback) or shows higher/lower fluency (correction or fluency-demonstration).
     Mandatory section — PO Step 1.1 reads it every turn-start. See sections/alternative-reporting.md. -->
```

주석 한 줄로 doctrine link 명시. 섹션이 빈 경우라도 헤더 + 주석은 install 시 seed.

#### 3.a.2 Line schema (canonical)

```
- (YYYY-MM-DD [baseline|inferred|user-asserted]) <axis>: <level descriptor> — <one-line nuance> [· superseded YYYY-MM-DD]
```

| Field | 의미 | 예 |
|:--|:--|:--|
| `YYYY-MM-DD` | append 날짜 (UTC) | `2026-05-15` |
| `baseline / inferred / user-asserted` | 신뢰 origin. `baseline` = install 시 / first capture. `inferred` = PO 가 session trace 로 유추. `user-asserted` = user 가 직접 caveman-lite 로 enumerate | `baseline` |
| `<axis>` | knowledge axis 라벨 (§3.a.3 taxonomy) | `Electron IPC` |
| `<level descriptor>` | fluency 라벨 (§3.a.4 enum) | `solid` |
| `<one-line nuance>` | 무엇을 알고 무엇이 gap 인지 1줄 | `knows ipcMain.handle / ipcRenderer.on; NOT explicit on no-buffer-drop` |
| `[· superseded YYYY-MM-DD]` | optional. 다음 entry 로 대체된 시점 | `· superseded 2026-06-01` |

**Append-only.** 기존 entry 직접 수정 금지. 변경 발생 시 새 line append + 옛 line 끝에
`· superseded <date>` 표시.

#### 3.a.3 Baseline 6 axis taxonomy (2026-05-15 stub 그대로 normative)

| Axis 라벨 | Scope |
|:--|:--|
| `Electron IPC` | `ipcMain` / `ipcRenderer` / `webContents.send` / preload bridge / no-buffer drop 등 |
| `React lifecycle` | mount/unmount, `useEffect` deps, `useRef` vs `useState`, StrictMode double-mount, cleanup |
| `Zustand store` | `create`, selector, `setState/getState`, `subscribe`, store-as-event-bus pattern |
| `Race conditions / event ordering` | listener-before-send, async timing diagrams, sync vs async dispatch |
| `Architecture trade-offs` | designer-chunking, worktree isolation, persona delegation routing, doctrine vs code |
| `Unclear / probable gaps` | "PO 가 확실치 않은 영역" 의 explicit log — 이 줄은 anti-axis (negative space) |

#### 3.a.4 Level descriptor enum

`fluent` / `solid` / `comfortable` / `concept-level fluent` / `partial` / `gap` / `unclear`

`fluent` > `solid` > `comfortable` > `concept-level fluent` > `partial` > `gap`/`unclear`.

#### 3.a.5 Extensibility — 새 axis 추가

새 axis 가 등장하면 (예: `Tailwind utility` / `Vercel Workflow DevKit` / `K-pop fan UX vocabulary`)
PO 가 새 axis 라벨로 1줄 append. taxonomy 표는 cap 없음. naming convention: 짧은 명사구,
domain-prefix (예: `gui/Tailwind utility`) 권장 — 필수 아님.

#### 3.a.6 Update triggers

| 시점 | 액션 |
|:--|:--|
| user 가 **caveman-lite 자기 knowledge enumerate** | `user-asserted` origin 으로 axis별 1줄 append. |
| user pushback (e.g. "더 단순한 설명 원해" + 그 직후 user 가 primitive level 보임) | `inferred` origin, level 하향 1 notch. |
| user 가 PO 보다 깊은 어휘로 정정 ("아니 그건 X 가 아니라 Y semantics") | `inferred` origin, level 상향 1 notch + supersede 옛 entry. |
| Step 3 step 14b 의 positive signal 과 동시에 발생하는 fluency 시그널 | `Product taste` 와 별개로 본 섹션도 append. |

PO 는 절대 user 가 enumerate 안 한 영역에 대해 추측으로 fluent 상향 부여 금지 — `inferred` 는
실제 trace evidence 동반 시만.

#### 3.a.7 Pruning

`## User knowledge state` > 30 entries → 같은 axis 의 oldest non-superseded 만 살리고 나머지
`[ARCHIVED <date>]` prefix 처리. 옛 axis (1년+ 미참조) 도 archive. doctrine 은 archive 행위
시점만 명시; 자동화는 future-work.

---

### 3.b `~/.productune/sections/alternative-reporting.md` (신규 파일)

#### 3.b.1 파일 전문 (verbatim — PO 가 후속 turn 에 그대로 write)

```markdown
# Alternative-reporting protocol

When PO surfaces N ≥ 2 alternative solutions/options to the user, the reporting MUST follow this
format. Anchored to `~/.productune/po-memory.md ## User knowledge state (engineering)`.

This protocol is layered on top of `po-loop.md` Step 1 #6 (when to surface alternatives at all).
Step 1 #6 decides *whether* to show alternatives; this file dictates *how* once decided.

Applies to:
- PO → user direct reporting (chat surface).
- Designer / Developer / QA persona authoring a plan / response document that contains an
  alternative table or A/B/C-style options. They read user_knowledge_state snapshot from `[ctx]`
  (delegation.md) and follow the same protocol.

## Mandatory format

Each option block — 3 fields, in this order:

```
### Option <label> — <one-line headline>

**Pros**
- [<axis-anchor>] <pro 1>
- [<axis-anchor>] <pro 2>
- ...

**Cons**
- [<axis-anchor>] <con 1>
- [<axis-anchor>] <con 2>
- ...
```

Then a single recommendation line (only when PO/Designer has a preference):

```
**Recommended: <label>** — <reason, ending with an anchor citation>.
```

### `<axis-anchor>` syntax

Citation MUST reference an axis from `## User knowledge state (engineering)`. Two forms permitted:

1. `[<axis label>]` — short form. Example: `[Electron IPC]`, `[React lifecycle]`.
2. `[<axis label> · <level>]` — explicit level. Example: `[Electron IPC · solid (no-buffer-drop is gap)]`.

If a pro/con references a gap rather than a strength, prefer form 2 with parenthetical to make
the gap visible.

If the relevant axis doesn't exist yet in `## User knowledge state`, PO/Designer either:
- (preferred) appends a new axis line first (per `po-memory.md` schema), then cites it, OR
- uses `[gap — new axis: <label>]` placeholder and surfaces "knowledge axis not yet logged" in
  the same turn so user can confirm.

### Recommendation line

If PO/Designer recommends an option, the recommendation line MUST end with an anchor citation
that justifies why this user (with this knowledge state) benefits from this option.

Example (good):
> **Recommended: B** — listener-before-send is structurally guaranteed; the `[Race conditions ·
> concept-level fluent]` reader will recognize the pattern, and `[Electron IPC · solid]` covers
> the no-buffer-drop semantics once called out.

Example (bad — vague + no anchor):
> **Recommended: B** — cleanest approach. (REJECTED: vague descriptor, no anchor citation.)

## Vague-descriptor blacklist

The following descriptors are BANNED as **standalone** characterizations (without anchor +
mechanism):

- `cleanest` / `cleaner`
- `simpler` / `simplest`
- `easier`
- `more elegant` / `elegant`
- `nicer`
- `better` (without explicit axis)
- `more idiomatic` (without anchor)
- `more maintainable` (without anchor)

Permitted-when-anchored exception: any banned word is OK if followed by an explicit
mechanism + axis anchor.

- BANNED:  "Option B is simpler."
- ALLOWED: "Option B is simpler than C for `[React lifecycle]` because no per-component cleanup
  cascade — single module-level offFns."

Detection rule (PO self-check before surfacing): scan the surfaced text for any blacklist word
in standalone position (no anchor within the same sentence). If found → self-reject, rewrite
with anchor + mechanism, then surface.

## User-side reject signal

If user replies with "vague" / "근거" / "왜" / "explain" / any equivalent pushback after a
surfaced alternative block, PO treats it as a protocol-violation signal:

1. Re-surface the same options with anchors filled in.
2. Append a `## Recent corrections / to-avoid` line in `~/.productune/po-memory.md` only if
   pushback recurs ≥2× across turns.
3. Optionally upgrade affected axis levels (per `po-memory.md` §3.a.6).

## Escape — when user wants caveman-only

User explicit intent ("just decide" / "make the call" / `/short` / equivalents) → PO may emit
only the recommendation line with its anchor citation, omitting the per-option blocks. Vague
descriptors still BANNED — anchor citation is non-negotiable even in caveman mode.

## Loading

PO loads this file on demand at any turn where N ≥ 2 alternatives would be surfaced. Cache
mentally per session like other `sections/*.md` files.

## Anti-doctrine

This file does NOT replace `po-loop.md` Step 1 #6 ("alternatives only when 2 defensible paths").
Step 1 #6 decides whether to show alternatives at all. This file dictates the format once
decided. If only 1 path → no alternative block; just direct recommendation (which still
benefits from anchor citation but not under this protocol's strict format).
```

#### 3.b.2 위치

`~/.productune/sections/alternative-reporting.md` + repo mirror
`packages/core/po/sections/alternative-reporting.md`. install.sh seed 대상에 추가.

---

### 3.c `~/.productune/po-instructions.md` diff (3 곳)

#### 3.c.1 `## Files` 단락 — on-demand 리스트에 추가

**Before** (line 52, current verbatim):

```
**On demand** (`~/.productune/sections/`): `po-loop.md` ... · `delegation.md` ... · `tickets.md` ... · `lifecycle-mechanics.md` ... · `prd-and-output.md` ... · `escalation.md` ... · `calibration.md` ... · `memory.md` ... · `evolution.md` ... · `git-workflow.md` ....
```

**After** — append at end of the on-demand list (before the closing period):

```
... · `git-workflow.md` (R2 worktree) · `alternative-reporting.md` (N≥2 alternative reporting format + vague-descriptor blacklist; anchored to `po-memory.md` User knowledge state — see `sections/alternative-reporting.md`).
```

#### 3.c.2 `## Hard rules` 단락 — 새 bullet 1줄 추가

**Position:** 현재 `## Hard rules` 의 마지막 bullet (Wiki writes need `[PROMOTION-APPROVED]`...) 바로 다음.

**Insert (after that line):**

```
- **Alternative-reporting protocol** — N≥2 alternative 를 user 에게 surface 할 때마다 `sections/alternative-reporting.md` 의 mandatory format 적용. anchor citation 없는 vague descriptor (cleanest/simpler/easier/more-elegant/cleaner/nicer/better-without-axis) BANNED. User knowledge state (`po-memory.md` `## User knowledge state (engineering)`) 가 anchor source — Step 1.1 load 의무 (per `po-loop.md`).
```

#### 3.c.3 `## PO loop` 단락 — Step 1 줄 갱신

**Before** (line 56):

```
- **Step 1 (Instruction).** Read po-memory (1×/task) + state slice ...
```

**After:**

```
- **Step 1 (Instruction).** Read po-memory (1×/task — **include `## User knowledge state (engineering)`**; mandatory anchor source per `alternative-reporting.md`) + state slice ...
```

(Step 1 detail 변경은 §3.d 의 `sections/po-loop.md` 에서 본격.)

---

### 3.d `~/.productune/sections/po-loop.md` diff (3 곳)

#### 3.d.1 Step 1.1 (Memory) — load 대상에 명시

**Before** (line 12):

```
1. **Memory** — read `~/.productune/po-memory.md` (incl. `## Model/Effort Calibration`) + `./.productune/po-state.json`.
```

**After:**

```
1. **Memory** — read `~/.productune/po-memory.md` (incl. `## Model/Effort Calibration` **and `## User knowledge state (engineering)`** — the latter is the mandatory anchor source for `sections/alternative-reporting.md`; loading it every turn-start is non-negotiable) + `./.productune/po-state.json`.
```

#### 3.d.2 Step 1 #6 (Alternatives) — protocol 파일 위임

**Before** (line 44):

```
6. **Alternatives** only when 2 defensible paths (1 line, not thesis).
```

**After:**

```
6. **Alternatives** only when 2 defensible paths exist. *Whether* to show ≥2 = this rule (1 line, not thesis). *How* to format the alternative block once decided = `sections/alternative-reporting.md` (mandatory Pros/Cons per option + anchor citation to `## User knowledge state (engineering)` + vague-descriptor blacklist). Both layered.
```

#### 3.d.3 Step 3 — 새 step 14c (Knowledge state capture)

**Position:** 현재 14a (probe vague feedback) + 14b (positive signals) 다음에 14c 추가.

**Insert (after step 14b, before step 15):**

```
14c. **User knowledge state correction capture** — semantic intent classes (any user lang):
    (i) user enumerates own fluency level explicitly ("I know Electron IPC", "Zustand 익숙해", caveman-lite self-assessment in any axis) → append `user-asserted` line to `~/.productune/po-memory.md ## User knowledge state (engineering)` per schema (`memory.md` §3.a).
    (ii) user corrects PO with deeper terminology than PO used ("아니 그건 X 가 아니라 Y semantics") → append `inferred` line raising the relevant axis level + supersede the prior entry.
    (iii) user requests primitive re-explanation after PO assumed fluency ("뭐가 race condition 인지부터 설명해줘") → append `inferred` line lowering the axis level.
    Append-only; never delete prior entries. Affects future Step 1.1 reads → future alternative-reporting anchor pool.
```

(Step 17 "Learn repeating preferences" 와 분리. 17 은 workflow/disposition preference. 14c 는 engineering knowledge — anchor-citation 용.)

---

### 3.e `[ctx]` delegation JSON shape + persona enforcement

#### 3.e.1 `[ctx]` 신규 필드 `user_knowledge_state`

**Position:** `sections/delegation.md` 의 `[ctx]` JSON 예시에 추가.

**Schema (1 줄 요약 snapshot):**

```json
"user_knowledge_state": {
  "memory_ref": "~/.productune/po-memory.md#user-knowledge-state-engineering",
  "axes_relevant": ["Electron IPC", "React lifecycle", "Race conditions"],
  "as_of": "2026-05-15"
}
```

- `memory_ref` — fixed string (markdown anchor). Persona 가 needed 시 read.
- `axes_relevant` — PO 가 task scope 에 가장 관련 있는 top-3 axis 라벨 (예측 가능한 alternative
  citation 대상). 없으면 빈 array. 6 이상 금지 (chunking).
- `as_of` — PO snapshot 시점.

#### 3.e.2 Persona-side enforcement

| Persona | 의무 |
|:--|:--|
| **pdt-designer** | plan 내 Architecture decision 표 / A/B/C alternative 블록 작성 시 `sections/alternative-reporting.md` 의 mandatory format 적용. anchor citation 누락 시 self-reject + 재작성. 본 T-P4-120 plan 자체가 모범 사례. (T-P4-119 plan §2 Architecture decision 표는 retrospectively 보면 vague descriptor "cleanest/simpler" 사용 — protocol 시행 후 다음 plan 부터 정합.) |
| **pdt-developer** | plan-mode 산출물 / dev 응답 내 alternative 블록 작성 시 동일. impl 본체에는 protocol 적용 안 됨 (code 는 alternative 형태가 아니므로). |
| **pdt-qa** | test plan 내 multiple-strategy 선택지 / verdict 의 retry-path 추천 시 동일. |
| **pdt-po** | user surface 모든 alternative reporting. 본 protocol 이 가장 직접 적용. |

#### 3.e.3 추가 변경 spec — `sections/delegation.md`

**Position:** `[ctx] <one-line JSON>` 설명 단락 다음.

**Insert:**

```
**`user_knowledge_state` field (T-P4-120):** PO writes a 3-field snapshot of relevant axes from
`~/.productune/po-memory.md ## User knowledge state (engineering)`. Personas reading `[ctx]`:
- If your output contains a plan / response section with N≥2 alternatives, follow
  `sections/alternative-reporting.md` mandatory format (Pros/Cons per option, anchor citation,
  vague-descriptor blacklist).
- `axes_relevant` is PO's guess at which axes the task touches. You may cite other axes from
  `memory_ref` if needed (read it on demand).
- If you can't ground a pro/con in an existing axis, surface the gap in your output's
  `open_questions` so PO can decide to add a new axis line.
```

---

## §4 Migration sequence (PO 후속 turn 에서 수행)

1. **Read repo mirror current** — `packages/core/po/po-instructions.md` + `sections/*.md` cat.
2. **§3.b 신규 파일** — `packages/core/po/sections/alternative-reporting.md` write (verbatim
   from §3.b.1 above).
3. **§3.c diff** — `po-instructions.md` 3 곳 edit (Files / Hard rules / Step 1 references).
4. **§3.d diff** — `sections/po-loop.md` 3 곳 edit.
5. **§3.e diff** — `sections/delegation.md` 추가.
6. **`po-memory.md` template** (있다면 `packages/core/po/po-memory.md.template`) — `## User
   knowledge state (engineering)` 헤더 + §3.a.1 주석 seed. live `~/.productune/po-memory.md`
   는 이미 stub 존재 — 헤더 주석만 §3.a.1 verbatim 으로 normalize.
7. **install.sh / postinstall hook** — `sections/alternative-reporting.md` seed to
   `~/.productune/sections/` (기존 sections seed 와 동일 패턴).
8. **Mirror sync** — `~/.productune/**` ↔ `packages/core/po/**` 1:1 동기 확인 (`diff -r`).
9. **PO smoke** — 의도적 alternative reporting 시나리오 1회 trigger → form 자기 검수 → user
   verify 요청.

각 단계 독립 commit 가능. 단계 3–5 가 가장 high-touch — git diff 검토 권장.

---

## §5 Validation scenarios

### V1 — N≥2 alternative reporting form 검증

후속 turn 에서 PO 가 (예: dev 산출물 review 후 retry vs proceed 선택지) ≥2 option 을 surface.
Expected:
- 각 option 에 `**Pros**` + `**Cons**` 블록 존재.
- 모든 pro/con 라인이 `[<axis>]` 또는 `[<axis> · <level>]` prefix.
- 추천 라인이 있다면 끝에 anchor citation.
- 본문 내 standalone `cleanest` / `simpler` / `easier` 등 부재.

### V2 — Vague descriptor self-reject

PO 가 draft 단계에서 `Option A is cleaner` 같은 문장 생성. self-check 가 blacklist 매칭 →
재작성. Surface 된 최종 텍스트엔 anchored 형식만.

### V3 — User pushback handling

User 가 surface 후 "근거 뭐야" / "왜" / "vague" 등 발화. PO 가 protocol-violation 시그널로
인식 → 같은 option 들에 anchor 채워 re-surface. 동일 pushback 2회 누적 시
`## Recent corrections / to-avoid` 에 1줄 append.

### V4 — Knowledge state mid-session capture

User 가 turn 중 "사실 Zustand 의 subscribe selector 동작 잘 몰라" 발화. PO 가 `inferred` /
level-down 으로 `Zustand store` axis 새 line append + 옛 line `· superseded <date>`.

### V5 — Designer plan 내 alternative 표 정합

Designer 가 새 plan emit 시 (`[ctx]` 의 `user_knowledge_state` 받고) Architecture decision 표
같은 alternative 블록을 동일 protocol 따라 작성. dev/qa 도 동일.

### V6 — Escape mode

User 가 `/short` 또는 "그냥 결정해" 발화. PO 가 per-option block 생략 + 추천 라인 + anchor
citation 만 surface. blacklist 여전히 적용.

---

## §6 Out of scope

- **GUI rendering of User knowledge state** — 사이드패널 / Team tab 등 시각화. doctrine markdown SoT 만.
- **Persona-side knowledge state** — Designer / Developer / QA 가 각자 별도 user knowledge file. PO 단일 SoT.
- **Automatic NLP-based knowledge inference** — 자동 분석 / scoring. PO 의미 판단 + 1줄 append만.
- **Cross-user / 팀 단위 knowledge state** — single-user `~/.productune/po-memory.md` scope.
- **본 turn 에서 실 파일 편집** — spec authoring only. PO 후속 turn mechanical promotion.
- **PRD / GUI 변경 0** — doctrine 변경만.
- **knowledge state archival 자동화** — §3.a.7 pruning 은 doctrine spec; 자동화는 future ticket.

---

## §7 Open questions

| # | 질문 | 현재 결정 |
|:--|:--|:--|
| OQ1 | `/short` / "그냥 결정해" prefix 의 정식 enum 화? | escalation.md 의 user prefix family 와 정합되게 후속 ticket 에서 enum. 본 ticket scope 아님. |
| OQ2 | 6 axis 가 dogfood 단계 reflect — Phase 5 retro 에서 axis taxonomy 갱신 필요? | YES. Phase 5 5a (Designer measurement) 에 axis 사용 빈도 stat 1줄 포함 권장 — separate ticket. |
| OQ3 | persona 가 `axes_relevant` 빈 array 받으면? | full memory_ref 안 읽고 default fallback: anchor citation 생략하지 말고 "[axis tbd — user knowledge state empty for this domain]" placeholder + open_questions 에 axis 추가 제안. |
| OQ4 | `user_knowledge_state.as_of` snapshot 신선도? | PO 가 매 delegation 마다 fresh — `[ctx]` 동기 생성. 별도 cache 없음. |
| OQ5 | i18n — Korean / 다국어 user 가 자기 fluency 를 비영어 어휘로 발화 | axis label 은 영어 normative (doctrine 일관성). user 발화 인용은 verbatim ("Zustand 익숙해" 그대로 axis nuance 필드 OK). |

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | doctrine doc consistency — plan §3 의 모든 diff spec 이 본 ticket §Acceptance AC1–AC10 cover. 실 파일 편집은 PO 후속 turn 자체 verify (smoke V1–V6). |
| **사용자 dogfood** | (1) PO 후속 turn 에 doctrine promotion 후 alternative reporting 발생 시 form 사용자 직접 verify. (2) PO 가 새 knowledge correction 자동 capture 했는지 `~/.productune/po-memory.md` tail 로 확인. (3) Designer / Developer plan 내 alternative 블록도 protocol 준수하는지 다음 dispatch 결과로 확인. |
| **regression check** | 기존 `po-loop.md` Step 1 #6 (alternatives surface 결정) 와 신규 protocol (format) 충돌 0 — 두 rule layered. `escalation.md` 3-option menu 의 retry/skill/proceed 표시도 N≥2 alternative 표시인지 점검: YES → 향후 escalation.md 도 alternative-reporting protocol 영향 받음 — plan §Open Questions 에 명시했고 즉시 일관 적용 권장하나 본 ticket scope 는 protocol authoring 까지. |

---

## §UX Self-Check (§1.5 design-system)

| Principle | 상태 |
|:--|:--|
| **Few Things** | 1 신규 section file + 3 기존 file anchor citation 패턴 추가. mental model 추가 0 (anchor citation = 기존 markdown 인용). ✓ |
| **Familiar** | "당신 수준에 맞춰 설명" 은 보편적 학습 경험. anchor 인용은 reference-desk 패턴 직관. ✓ |
| **Predictability** | 모든 N≥2 alternative reporting 동일 format. user 한 번 익히면 PO/Designer/Developer/QA 어디서나 일관. ✓ |
| **Feedback** | vague-descriptor 위반 시 (a) user 명시적 reject 또는 (b) PO self-reject 둘 다 negative loop. anchor 누락 자체가 즉시 가시. ✓ |
| **Escape** | `/short` / "그냥 결정해" 의도 → per-option block 생략 가능. anchor citation 만은 non-negotiable. ✓ |
