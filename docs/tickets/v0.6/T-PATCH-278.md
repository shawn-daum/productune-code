---
ticket_id: T-PATCH-278
version: v0.6
slug: doctrine-prose-cleanup
title: doctrine prose cleanup — English-only nit + stray backtick + mode/EXCEPTION 문구 정밀화 (T-277 carry-forward)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L1
risk_flags: [doctrine]
created_at: 2026-06-30T05:55:29Z
---

# T-PATCH-278: doctrine prose cleanup (T-PATCH-277 carry-forward)

QA grill(qa-277)가 T-277 작업 중 발견한 4건의 doctrine 문서 정합성 nit. 제품 동작 영향 0, doctrine prose만. shawn 요청 — ticket 발행 + 즉시 수정.

## 대상 4건
1. **`배경` English-only nit** — `packages/core/doctrine/common/habit.md` L14 (Tier0, [T-PATCH-210] 항목): `(ticket Request / 배경, ...)`의 `배경`은 anchor 아닌 illustrative 한글 → English-only 위반. ⚠️ 단 doctrine-editing.md language 규칙의 *"never retro-translate existing entries"*와 충돌 소지 → designer 판단: gloss 제거("/ 배경" 삭제) vs 유지. 결론 기록.
2. **stray trailing backtick** — `docs/po/bookshelf/doctrine-editing.md` (Tier1): 소스태그 주석 `-->` 뒤 떠다니는 백틱 (L30, L34 확인 — 전체 스캔). 오타 제거.
3. **mode 규칙 문구** — doctrine-editing.md L14: "bookshelf = append + source" → in-place extend도 정당한 변경이므로 "append **or extend-in-place** + source" 류로 한 단어 보강.
4. **EXCEPTION 절 tightening** — doctrine-editing.md L15 (T-277이 넣은 절): match-target literal 보존 시 "literal은 매칭되는 최소 substring만" 단서 추가 — anchor 명목의 과다 포함 방지.

## Acceptance
- **AC-1**: 4건 적용(또는 #1은 designer 판단으로 의도적 보류 시 사유 기록). act-time voice 유지, leak 없음.
- **AC-2**: cap 유지 — common ≤50, doctrine-editing(bookshelf) ≤100.
- **AC-3**: #1 처리 시 mirror byte-identical (`packages/core/doctrine/common/habit.md` → `~/.productune/doctrine/`); #2~4는 Tier1 docs/ → mirror n/a.
- **AC-4**: QA grill clean (doctrine 편집 → 예외없이).

## Plan
designer: 4건 검수·적용, #1 retro-translate 충돌 판단 + 기록. mode(#3)·EXCEPTION(#4)는 본인 작성 규칙이라 자기 판단으로 정밀화. qa: grill(leak/cap/일관성/#1 판단 타당성). PO: #1 적용 시 mirror + close.

## Outcome
designer (T-PATCH-278): 4 items applied.

**#1 `배경` gloss (Tier0 `common/habit.md` L14) — APPLIED (dropped).** Decision: removed the `/ 배경` gloss so the phrase reads `(ticket Request, ...)`. Rationale on the retro-translate tension: the "never retro-translate existing entries" rule guards against *converting English prose into user_lang* on old entries (avoids churn + drift). This is the opposite operation — DELETING a stray illustrative Korean gloss, not translating anything. "ticket Request" already names the section in English with no meaning lost; the gloss was redundant illustrative Korean, exactly the English-only target. Deletion ≠ retro-translation, so no rule conflict. Tier0 → PO mirrors.

**#2 stray trailing backtick (Tier1 `doctrine-editing.md`) — APPLIED.** Scanned whole file for `-->\``; found + removed TWO (L30 oh-my-eyes slug note, L34 T-PATCH-141 note). Post-scan confirms zero remaining. Pure typo, no semantic change.

**#3 mode rule (`doctrine-editing.md` L14) — APPLIED.** "bookshelf = append + `(YYYY-MM-DD) [T-NNN]` source" → "bookshelf = append or extend-in-place + `(YYYY-MM-DD) [T-NNN]` source". Covers the legit extend-in-place case (used in T-277).

**#4 EXCEPTION tightening (`doctrine-editing.md` L15) — APPLIED.** Added minimal-literal guard: "Keep the literal to the matched substring ONLY — never wrap surrounding non-English prose under the anchor banner." + "(minimal substring)" on the rule clause. Prevents over-inclusion under the anchor banner.

**AC-1**: 4 applied, act-time voice held, no leak. PASS.
**AC-2**: caps — common **27**/50, doctrine-editing **30**/100. PASS. (designer reported 32/34 — miscount; QA + PO verified 27/30.)
**AC-3**: DONE — #1 Tier0 `common/habit.md` mirrored → `~/.productune/doctrine/` byte-identical (`cmp` clean). #2–4 Tier1 → n/a.
**AC-4**: QA grill (qa-277) — **CLEAN, ship.** #1 PASS (deletion≠retro-translate test sound) · #2 PASS (grep `-->` backtick = 0 both files) · #3 PASS (extend-in-place covered) · #4 PASS (minimal-substring guard closes over-inclusion loophole, orthogonal to verbatim clause). Verified counts 27/30.

**PO note (recurring):** designer over-reported line counts a 3rd time (~+4–5 lines/ticket). Harmless (real always further under cap) but a reliability quirk in the designer's counting method — flagging for awareness, not blocking.

## Persona Activity
PO orchestrated. designer-277 (author, both 277 + 278) · qa-277 (grill ×3, all CLEAN). All doctrine edits ran the full delegate→grill→mirror flow per `docs/po/bookshelf/doctrine-editing.md`.

## Persona Activity
(PO-managed)
