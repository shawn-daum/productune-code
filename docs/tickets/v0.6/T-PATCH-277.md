---
ticket_id: T-PATCH-277
version: v0.6
slug: po-user-facing-voice-doctrine
title: PO user-facing voice — 내부 plumbing 누출 차단 + 번역체/internal-id 제거 (doctrine)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L2
risk_flags: [doctrine]
created_at: 2026-06-30T05:04:52Z
---

# T-PATCH-277: PO user-facing voice — plumbing 누출 차단

shawn 피드백(enneagram-teacher 신규 프로젝트에서 productune 돌릴 때 PO 첫 출력 critique). PO가 사용자한테 내부 메커니즘/내부 용어/내부 id를 그대로 쏟아냄. 사용자는 제품 파트너를 기대했는데 process narrator를 받음.

## 증상 (4)
1. **turn-open 내부 절차 중계** — "doctrine 로드 확인됨. 턴 오픈 — 프로젝트 동적 상태부터 읽겠습니다.", "읽기 완료. 상태 파악:" 같은 자기 startup 보고가 사용자 첫 줄.
2. **read-back 번역체** — "내 이해 (읽기 확인)" 라벨 블록. 영어 doctrine을 직역한 시스템 템플릿 톤.
3. **내부 용어 덤프** — "git 브랜치 v0.1 오픈 + po-state 버전 등록 + phase 1 기록", "pdt-designer가 clarity-loop로 PRD.md 작성" 등 plumbing을 제품 설명인 양 노출.
4. **internal agent id 노출** — `pdt-designer` 등. 사용자에겐 제품 역할명(PO/Designer/Developer/QA)으로 불러야.

## 의도한 규칙 (harness가 이미 draft로 직접 편집 — designer가 P0/English-only로 재저작·검증)
- PO `habit.md` Identity에 **User-facing voice** 규율: (a) idiomatic native prose, 직역·시스템 라벨 금지 (b) 팀원은 user_lang 역할명, `pdt-*` 금지 (c) 내부 plumbing(doctrine load/turn-open/po-state/`phase N`/clarity-loop/envelope/branch·ticket id) 누출 금지 — 사용자가 묻거나 결정해야 할 때만 노출.
- PO `habit.md` §1 Turn open 맨 위 **Silent prep** — turn-open 일체(doctrine load/state read/sweep/promotion drain)는 내부, 첫 사용자 라인은 substance.
- PO `habit.md` §2 read-back — 라벨 템플릿 대신 사람이 되묻는 자연스러운 한 줄.
- PO `habit.md` §2 phase 경계 안내 — 기계 단계 말고 평이한 제품 용어 + 역할명.
- `common/habit.md` §4 lite — 역할명·평이한 언어·plumbing 누출 금지 cross-cutting 추가(worker user_lang prose에도 적용).

## Acceptance
- **AC-1**: 위 5개 편집점이 doctrine SoT에 반영. act-time voice(P0) 준수 — 5 leak 카테고리 없음.
- **AC-2**: cap 유지 — common habit ≤50 / persona habit ≤100. (현재 common 27 / po 43 — 여유)
- **AC-3**: **English-only 판정** — doctrine body는 영어 only. draft에 한글 예시("PRD 같이 정리할게요", "내 이해/읽기 확인", banned preamble 문자열)가 있음. grill이 결정: banned-string은 실제 모델 출력 문자열이라 match anchor로 literal(한글) 보존이 정당한지 vs 전부 영어 서술로 치환. 결론을 ticket에 기록.
- **AC-4**: mirror byte-identical — `packages/core/doctrine/` → `~/.productune/doctrine/`.
- **AC-5**: Impact sweep — Tier1 `docs/po/` `docs/<persona>/` stale copy 없음 확인, agent pointer `pdt-po.md`/`pdt-designer.md` 영향 n/a 확인.

## Plan
designer: harness draft(packages/core/doctrine/persona/po/habit.md + common/habit.md)를 P0 act-time voice + English-only 규칙으로 검수·확정. AC-3 English-only 판정 내리고 기록. qa: grill(default, 예외없이) — leak 카테고리 / cap / English-only / act-time voice 검증. PO: mirror + impact sweep.

## Outcome
designer (T-PATCH-277): verified + cleaned the harness draft per P0 act-time voice + English-only.

**Edits confirmed in SoT:**
- `persona/po/habit.md` Identity — new **User-facing voice** bullet (a Idiomatic / b Display names / c No internal mechanics). Act-time instruction altitude, no leak category. Addresses symptoms 2 (translation-ese labels), 3 (plumbing dump), 4 (`pdt-*` exposure).
- `persona/po/habit.md` §1 Turn open — **Silent prep** bullet at top: turn-open/state-read/sweep/promotion-drain are internal, first user line is substance. Addresses symptom 1 (turn-open narration).
- `persona/po/habit.md` §2 read-back — reworded to a natural one-line person-checking-understanding question, NOT a labeled template block.
- `persona/po/habit.md` §2 phase boundary — plain product terms + display role names, no `phase N`/branch/`clarity-loop` jargon.
- `common/habit.md` §4 lite — extended: idiomatic native prose, product-role display names, no plumbing leak (cross-cutting to worker user_lang prose).

**AC-3 English-only decision:** doctrine body is English-only, but two classes of Korean appear in these edits — handled differently:
- **Banned-string anchors KEPT literal (Korean):** the exact strings the model must NOT emit — §1 banned preamble (`"doctrine 로드 확인됨"`, `"턴 오픈"`, `"상태부터 읽겠습니다"`) and Identity(a) banned system-label headers (`"내 이해" / "상태 파악:"`). Rationale: the literal Korean string IS the load-bearing suppression target (the actor matches against the exact emitted form); converting to English would defeat the anchor. English-only governs the *instruction prose*, not quoted negative-example literals.
- **Illustrative good-example Korean CONVERTED to English:** removed `"PRD 같이 정리할게요"` (+ its paired bad example) and the Korean read-back example `"애니어그램으로 개인 성장 코칭하는 거…"`. Rationale: these demonstrate desired idiomatic OUTPUT; `user_lang` is resolved at runtime, so a hardcoded Korean "good example" falsely implies Korean is the doctrine language. Replaced with English descriptions of the desired shape ("name what you'll produce together — 'let's draft the PRD'"; "reflect their goal back as a question").

**AC-1**: 5 edit points reflected, act-time voice, no leak category. PASS.
**AC-2**: caps held — common **27**/50, po **43**/100. PASS. (designer's reported 32/50·50/100 were miscounts; QA + PO re-verified 27/43 — further under cap.)
**AC-3**: decided + recorded above. PASS.

**QA grill (qa-277) — verdict CLEAN, ship.** D1 act-time voice PASS · D2 English-only PASS (4 Hangul occurrences all genuine negative-example literals/anchors; no good-example Korean survived) · D3 caps PASS (verified 27/43) · D4 fixes all 4 symptoms PASS (no gap/loophole) · D5 internal consistency PASS (po:26 user-facing announce vs po:27 read-truth-from-po-state = no conflict). No blockers.

**AC-4 mirror**: DONE — `packages/core/doctrine/{common,persona/po}/habit.md` → `~/.productune/doctrine/` byte-identical (`cmp` clean both).
**AC-5 impact sweep**: DONE — no stale copy of the changed rule in Tier1 `docs/<persona>/`; agent pointers `packages/core/agents/*.md` no mention (n/a); init.ts/install.sh unaffected (content edit, no layout/schema change).

**Promotion landed (user-approved):** the AC-3 anchor-vs-illustrative decision was generalized into a reusable authoring rule. designer extended the **language** bullet in `docs/po/bookshelf/doctrine-editing.md` (Tier1 — no mirror) with an EXCEPTION clause: negative-example/match-target LITERALS stay verbatim (the literal IS the anchor); instruction prose + good-example text stay English. Source tag `(2026-06-30) [T-PATCH-277]`. Follow-on QA grill (qa-277): **CLEAN** — D1 act-time voice PASS · D2 self-consistency PASS (exhaustive partition, low smuggling risk) · D3 cap PASS (verified **30**/100) · D4 faithful to precedent PASS (1:1 maps onto what 277 did).

**Carry-forward (out of scope, future cleanup pass):**
1. Pre-existing `배경` (common/habit.md §2, [T-PATCH-210]) — illustrative Korean field-name, not an anchor → English-only nit (user: backlog decision pending).
2. doctrine-editing.md has stray trailing-backtick after source-tag comments (lines ~19/30/34, pre-existing) — cosmetic.
3. **mode** rule (doctrine-editing.md L14) says bookshelf change = "append + source tag" but this was a correct *extend-in-place* + tag — rule wording doesn't literally cover extend; cosmetic tightening.
4. EXCEPTION clause could add "keep the literal MINIMAL (matched substring only)" to prevent over-inclusion under the anchor banner — minor future tightening.

## Persona Activity
(PO-managed)
