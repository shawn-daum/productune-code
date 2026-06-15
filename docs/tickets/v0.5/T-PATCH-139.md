---
ticket_id: T-PATCH-139
version: v0.5
phase: 3
type: doctrine
status: done
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: po-state-lifecycle
estimated_complexity: L4
risk_flags:
  - data-migration
  - po-state-schema-version-distinct-from-config-schema-v
  - v2-jq-unfiled-lives-only-in-T-P4-065-md
  - post-delegate-write-re-adds-persona_session_meta-which-v2-jq-deletes
  - in-place-jq-merge-only-never-full-rewrite-oh-my-eyes-slug-lesson
  - testing-md-line69-documents-pre-migration-v1-shape-as-correct
qa: true
qa_status: pass
slug: managed-po-state-v2-settle
depends_on: []
lane: normal
round: dogfood-paepyeong-oh-my-eyes
created_at: 2026-06-15
---

# T-PATCH-139 — managed-PO po-state 가 v2 로 정착하지 않는 근본 fix (init 이 매번 v1 shape 재생산)

## Request

PO 도그푸딩(paepyeong / oh-my-eyes)에서 fresh `productune init` 의 po-state 가 **pre-migration v1 shape** 으로 태어나는 게 재확인됨. 3개 증상, 뿌리 하나:

1. `schema_version: 1` (current 는 2).
2. `past_tickets` 배열이 다시 채워짐 — ticket `.md` 가 SoT 인데 po-state 가 ticket 이력을 중복 보관.
3. `current_task.note` (4KB freeform scratchpad)가 발명됨 — sanction 안 된 필드.
4. managed ticket 의 `status` 슬롯에 비-canonical 값 `planning` 이 박힘. canonical 7 = `todo | in-progress | review | user-verify | done | blocked | abandoned`.

**뿌리:** v2 migration(T-P4-065)은 **DATA-ONLY** 였다 — 기존 po-state 파일을 고치고(1→2, `past_tickets` drop, `stage`→`type`) GUI reader 를 고쳤지만, **generator(=doctrine 로부터 po-state 를 저작하는 PO)는 갱신 안 함**. doctrine 에는 `schema_version`/`past_tickets` 언급이 ZERO → PO 가 매 신규 프로젝트마다 v1 shape 를 재생산. `init-project.mjs` 는 po-state 를 **의도적으로 scaffold 안 함**(lifecycle-owned) → 빈틈이 doctrine 쪽에 그대로 남음.

## 코드 사실 (착수 전 재검증 — 라인은 스냅샷)

**A. init 은 po-state 를 쓰지 않는다 (불변, 유지).**
- `packages/core/scripts/lib/init-project.mjs:218` `NOT written (lifecycle-owned): .productune/po-state.json.`
- 동 `:608` `NOT written: .productune/po-state.json (lifecycle-owned — AC-5).`
- init 이 stamp 하는 `schema_v`(`:638-645`, `FALLBACK_LATEST_SCHEMA_V = 4`)는 **config.json 의 migration-framework schema_v** 다 — po-state 의 `schema_version` 과 **별개 카운터**. 혼동 금지.

**B. doctrine 에 v2 po-state 불변식이 없다 (뿌리).**
- doctrine 전체 grep: `past_tickets` = **0 hit**. `schema_version`(po-state 용) = **0 hit**. 유일한 schema 버전 언급은 config/manifest 의 `schema_v`(`po/habit.md:4`, `lifecycle/index.md:36` `._phase_schema_v=3`, `designer/bookshelf/artifact-manifest-schema.md:19`) — po-state shape 와 무관.
- po-state 필드 roster 의 현재 home: `persona/po/bookshelf/lifecycle/index.md:17` (`version / phase / current_task / persona_sessions / recent_turns`), current_task 저작점 `persona/po/bookshelf/delegation.md:25-29` (`slug + request_summary + artifacts`, `persona_sessions`), 턴-open 멱등 sweep `lifecycle/state-hygiene.md:5` (jq 1-pass). calibration: `current_task.calibration_outcome`(calibration.md:6-7).
- → **이 3개 파일이 v2 불변식의 정확한 home.** schema_version/slim shape 를 어디에도 안 적어서 PO 가 v1 을 재현.

**C. `planning` vocab leak — 실제 위치는 doctrine 이 아니라 `docs/testing.md`.**
- doctrine SoT 전체 grep: `planning` 이 **status 값으로 쓰인 곳 0**. hit 은 전부 domain-noun (`designer/habit.md:3` "Own planning / UX"), style-library 디자인 서술(revolut.md / hp.md) — status leak 아님. **brief 의 "doctrine 에서 planning 이 status 로 샌다" 는 doctrine SoT 에는 해당 없음** (scope 축소).
- 실제 leak: `docs/testing.md:76` 주석 `# 2.2 — pdt-po (PO): 요청 분해 (PO 가 자체적으로 planning — 구 my-planner 역할)`. PO 가 이 단어를 status 슬롯으로 끌어들이는 어휘 출처.
- **추가 발견(같은 파일, 더 심각):** `docs/testing.md:69` 가 init 검증 기대값으로 `.productune/po-state.json 이 schema_version: 1, 빈 current_task: null 로 생성` 을 **명시** — pre-migration v1 shape 를 "정답"으로 문서화. 이 줄이 v1 재현을 능동적으로 정당화함. prong 1 에서 같이 고친다.

**D. enum single-source 는 이미 존재 (T-PATCH-138). 새 사본 금지.**
- `packages/core/config/ticket-status-enum.json` = SoT (`status`/`qa_status`), install 이 `~/.productune/config/` 로 mirror.
- `pre-frontmatter-lint.sh:47-70` 이 이미 그 mirror 를 읽고 하드코딩 fallback(`:50-51`) 유지. validate 로직 `:79-110`(quote-aware, inline-`#` strip). **단 이 훅 대상은 `docs/tickets/*/T-*.md` frontmatter 뿐 — po-state.json `current_task.status` 는 커버 안 됨.**

**E. po-state current_task.status 를 검증하는 훅 없음.**
- `post-delegate-state-write.sh` 가 po-state 를 PostToolUse 로 jq write: `current_task` 구조 생성(`:147-162`), `current_task.persona_sessions[$persona]`, **`current_task.persona_session_meta[$persona]`(`:159`)**, `current_task.artifacts`(`:162`). `status` 는 검증/정규화 안 함.
- **tension:** v2 jq 는 `del(.current_task.persona_session_meta)` 하는데 이 훅은 매번 재생성 → `persona_session_meta` 가 v2 canonical current_task 필드인지 불명확(brief 의 canonical 목록엔 없음). developer 가 구현 시 reconcile 필요(아래 unresolved).

**F. v2 migration jq 는 numbered migration 으로 미존재.**
- `packages/core/migrations/` = `0001`~`0004` 만. po-state v1→v2 jq 는 **ticket `docs/tickets/v0.4/T-P4-065.md:256-294` 에만** 존재(파일로 안 박힘). 멱등 gate `if (.schema_version // 1) >= 2 then . else … .schema_version=2 end`, in-place `> tmp && mv`, validation `:295`.
- 기존 framework(`session-start-doctrine.sh build_migration_block`)는 **config.json schema_v** 기준으로만 pending migration 감지 → po-state `schema_version` 은 거기 안 걸림. → 별도 멱등 pass 필요.
- **prior-history 교훈(doctrine-editing.md):** migration 0004 가 config.json full-rewrite 로 oh-my-eyes slug 를 날린 적 있음 → config.json 건드리는 건 반드시 jq-merge in-place + load-bearing 필드 생존 검증. 본 티켓 jq 는 po-state.json 대상이고 additive/slim(full-rewrite 아님)이나 동일 원칙 강제.

## 근본 원인 (한 줄)

v2 가 **data-layer(파일+reader)에만** 정착하고 **generation-layer(doctrine→PO 저작 + 신규 po-state write-guard)** 에는 정착 안 함 → 매 init 마다 v1 재현 + 비-canonical status 무방비.

## 설계 결정

- **결정 A — 3-prong, layer 별 분담.** prong1=doctrine(designer)로 generation-layer 에 v2 불변식 인코딩 + leak scrub. prong2=hook(developer)로 신규/stale po-state 자동 upgrade + shape guard. prong3=enum guard(developer)로 `current_task.status` 를 기존 config single-source 로 검증. 셋 다 머지돼야 정착.
- **결정 B — init 은 계속 po-state 를 안 쓴다.** schema_version stamp 를 init 에 넣지 **않음**(lifecycle-owned 설계 보존). 대신 session-start hook 이 PO 가 처음 po-state 를 저작한 시점 이후 어느 턴에서든 v1→v2 upgrade + shape 검증. → init.ts / init-project.mjs = po-state 관점 n/a.
- **결정 C — 새 enum 사본 0.** prong3 는 `ticket-status-enum.json`(SoT) / `~/.productune/config/` mirror 를 재사용. 하드코딩 enum 추가 금지(T-PATCH-138 결정 B 계승).
- **결정 D — migration 은 새 numbered 파일 신설 안 함.** T-P4-065 의 멱등 jq 를 prong2 hook 에 embed(또는 공유 lib 로 추출). config-schema_v framework 와 분리. in-place jq-merge only.

## Acceptance

- [AC-1] **doctrine 가 v2 불변식을 인코딩.** `lifecycle/index.md`(shape roster) + `delegation.md`(current_task open) + `state-hygiene.md`(턴-open sweep)에 act-time voice 로: 현재 `schema_version` 값(=2) 명시 · slim shape · `past_tickets` 절대 write 금지(ticket md 가 SoT) · current_task pointer-only 필드 집합 = `slug, request_summary, artifacts, type, status, persona_sessions, calibration_outcome` (freeform `note` 금지 — 러닝 노트는 ticket body `## Persona Activity` 또는 brief 로). SoT(`packages/core/doctrine`) + mirror(`~/.productune/doctrine`) byte-identical.
- [AC-2] **leak scrub.** `docs/testing.md:76` 의 `planning` 어휘 제거/교정(PO 역할 서술이 status 어휘로 오인되지 않게) + `docs/testing.md:69` 의 init 기대값을 v2 slim shape(`schema_version: 2`, `current_task: null`, `past_tickets` 없음)로 정정. doctrine SoT grep 결과 `planning`-as-status 0 임을 ticket 에 기록(scope 축소 근거).
- [AC-3] **자동 upgrade hook.** session-start 시 v1-shape po-state(또는 `schema_version < 2`)를 T-P4-065 멱등 jq 로 v2 로 in-place upgrade. 이미 v2 면 no-op. 멱등(2회 실행 = 1회 결과). fresh-but-stale init 커버.
- [AC-4] **shape guard.** `schema_version < current`, `past_tickets` 배열 존재, unknown current_task 필드(`note` 등) 중 하나라도 있으면 flag(corrective surfacing). false-positive 0(정상 v2 는 통과).
- [AC-5] **load-bearing 생존.** upgrade/guard jq 가 full-rewrite 아닌 in-place merge. upgrade 후 `slug / request_summary / artifacts / persona_sessions / version / phase` 생존을 검증(oh-my-eyes slug 교훈). 검증 실패 시 abort + .bak 보존.
- [AC-6] **current_task.status enum guard.** po-state `current_task.status` 가 비-canonical(`planning` 등)이면 차단/교정. PreToolUse 가 정적으로 못 막는 computed jq write 는 PostToolUse 가 사후 surfacing. **`ticket-status-enum.json` 재사용, 새 enum 사본 0.**
- [AC-7] **install 동기화.** prong2/3 가 신규 훅을 추가하면 `install.sh` 의 hook merge(`merge_claude_settings_hooks`, `is_pdt` basename)에 등록. 재실행 idempotent.
- [AC-8] **regression.** fresh `productune init` → (hook 1턴 후) po-state 가 v2 slim shape. managed ticket status 가 canonical 7 중 하나. `docs/testing.md` 검증 절차가 v2 기대값으로 통과.
- [AC-9] **doctrine authoring rules 준수.** P0 act-time voice, 5 leak category strip, cap(bookshelf 100), mode(habit=curated rewrite no tag / bookshelf=append + `(2026-06-15) [T-PATCH-139]` tag), body English only.
- [AC-10] **IMPACT CHECKLIST 전 surface sweep**(아래 Plan §4) applied/n-a 표기 + 각 n-a 사유.

## Plan

착수 전 소스 재독(라인 드리프트). 3 prong 독립 저작 가능, 셋 다 머지돼야 정착. **prong 별 assignee 명시 — PO 가 라우팅.**

### §1 — DOCTRINE (assignee: pdt-designer · prose)
SSoT-first: 아래 home READ 후 저작.
1. `persona/po/bookshelf/lifecycle/index.md` (po-state shape roster, `:17`) — **append + source tag** — `schema_version: 2` + slim shape + `past_tickets` write 금지 명시.
2. `persona/po/bookshelf/delegation.md` (current_task open, `:25-29`) — **append + source tag** — current_task pointer-only 필드 집합(위 7개), freeform `note` 금지(러닝 노트 → ticket `## Persona Activity`/brief).
3. `persona/po/bookshelf/lifecycle/state-hygiene.md` (턴-open 멱등 sweep, `:5`) — **append + source tag** — 불변식 pass: `schema_version` 미달 시 stamp=2, `past_tickets` 부활 금지, unknown current_task 필드 drop. (hook 의 act-time 거울.)
4. `docs/po/habit.md` 등 habit 면이 shape 를 서술하면 **curated rewrite (no tag)** 로 v2 정합. (확인 후 필요 시.)
5. `docs/testing.md` scrub (`:69` v2 기대값 정정 + `:76` planning 어휘 교정) — Tier1 docs, prose.
- mode/cap/voice: bookshelf cap 100, append+tag; habit curated no-tag; P0 act-time, English body, 5 leak strip.

### §2 — HOOK (assignee: pdt-developer · code)
1. session-start po-state upgrade+guard 훅 신설(또는 `session-start-doctrine.sh` 확장) — T-P4-065 멱등 jq embed(`if .schema_version<2 …`), in-place `> tmp && mv` + .bak, load-bearing 생존 검증(AC-5).
2. shape guard: `schema_version<current` | `past_tickets` 존재 | unknown current_task 필드 → corrective surfacing(AC-4).
3. `install.sh` hook 등록 + idempotent merge 확인(AC-7). config-schema_v migration framework 와 **분리**(별 카운터).

### §3 — ENUM GUARD (assignee: pdt-developer · code)
1. po-state `current_task.status` enum 검증 — `ticket-status-enum.json` / mirror 재사용(새 사본 0, AC-6).
2. computed jq write 는 PreToolUse 정적 차단 한계 → `post-delegate-state-write.sh`(po-state 를 이미 만지는 PostToolUse) 경로에 사후 검증/교정 추가가 유력. PreToolUse 가 확실 패턴만 보수 차단.
3. **reconcile(unresolved):** `post-delegate-state-write.sh:159` 가 쓰는 `current_task.persona_session_meta` 가 v2 canonical 필드인지 — v2 jq 는 이를 `del` 함. shape guard 의 "unknown 필드" 판정과 충돌하지 않도록 v2 current_task 필드 집합을 단일 정의로 확정(doctrine §1 과 동기화).

### §4 — IMPACT CHECKLIST sweep (doctrine-editing.md)
- **Tier0 SoT `packages/core/doctrine` + mirror `~/.productune/doctrine` byte-identical** — APPLIED (§1.1-1.3, PO 가 양쪽 write).
- **Tier1 `docs/<persona>`** — APPLIED (`docs/testing.md` scrub §1.5). 그 외 persona docs: leak 없음 → n/a.
- **Tier2 `~/.productune/<persona>`** — n/a (po-state shape 는 prefs/taste 가 아님).
- **agent pointers** — n/a (cap 30, po-state shape 미언급 확인).
- **init.ts / init-project.mjs (schema_version stamp 필요?)** — n/a-with-rationale (결정 B: init 은 po-state 미저작 유지; stamp 도입 시 lifecycle-owned 설계 위반).
- **install.sh** — APPLIED (신규 훅 등록 §2.3). config mirror 는 기존 enum 재사용이라 추가 cp 불필요(prong3 새 config 없음).
- **packages/core/migrations** — n/a-with-rationale (결정 D: 새 numbered migration 신설 안 함; T-P4-065 jq 를 §2 hook 에 embed). config.json 미접촉 → 0004 full-rewrite 회귀 위험 없음.
- **onboarding.ts** — n/a (po-state 미write 확인, `:217`).
- **project.ts `detectProductuneLayout`** — VERIFY (`:164` 가 `schema_version >= 1` 로 current-layout 판정 → v2 도 통과해 tolerant 하나, v2 기대 정합 재확인. 변경 불요 예상).
- **bootstrapPersonaMemory** — n/a (po-state 미write 확인).

## Out of scope

- 기존 디스크에 이미 박힌 비-canonical ticket `status` 일괄 backfill — T-PATCH-138 후속 영역(별).
- config.json schema_v migration framework 재설계 — 본 티켓은 po-state `schema_version`(별 카운터)만.
- GUI po-state reader 추가 변경 — T-P4-065 에서 이미 v2 대응(detectProductuneLayout VERIFY 만).
- 본격 JSON-schema validator 도입 — 셸/jq 최소 보강 원칙 유지.
- T-PATCH-138 의 ticket-md write-guard 범위(이미 done) — 본 티켓은 po-state.json 면.

## Outcome

<null — Phase 5 에서 assignee 가 채움>

## Persona Activity

<PO-managed>
