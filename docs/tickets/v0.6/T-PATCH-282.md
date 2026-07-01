---
ticket_id: T-PATCH-282
version: v0.6
slug: user-facing-terse-haeyoche
title: user-facing 말투 = terse 해요체 (pdt + pdtl 공통) — caveman-lite 드리프트 교정
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: doctrine
risk_flags: [doctrine]
created_at: 2026-07-01T00:32:46Z
---

# T-PATCH-282: user-facing 말투 = terse 해요체

shawn 피드백. PO(및 워커) user-facing 출력이 너무 공손·장문으로 드리프트. 원래 caveman-lite(토큰 절약, 짧게) 의도인데 안 지켜짐.

## 결정 (확정)
- **full(pdt) + lite(pdtl) 둘 다 user-facing = terse 해요체.** (아까 나온 "lite=공손 / full=반말" 안은 **폐기** — 통일.)
- 성격: **blunt + 짧게.** 답/결정부터. filler·pleasantry·hedging·존댓말 패딩 컷. 단 문장 문법은 유지(해요체) — 반말도 개조식도 아님.
- 반말/개조식은 제품 아님 — 개조식은 harness(base Claude Code)가 저자에게 말할 때만(제품 doctrine 밖, 저자 개인 메모리 영역).

## 원인 (2)
1. caveman-lite 규칙은 이미 있음(common `## caveman` / `§4 lite`: "cut filler/pleasantries/hedging, keep short") — 근데 미준수 드리프트.
2. **T-PATCH-277이 넣은 "idiomatic native prose / no fragment spam"**이 공손·장문 쪽으로 과교정했을 가능성 → terse와의 균형을 verbose로 기울임.

## Acceptance
- **AC-1**: full(pdt) doctrine의 user-facing 말투 규칙이 "terse 해요체 + blunt(존댓말 패딩·filler·hedging 컷) + 답부터"로 명시. common `caveman lite` / PO Identity `User-facing voice`(T-277)와 정합 — T-277 "idiomatic prose"가 verbose를 정당화하지 않도록 조정(idiomatic ≠ 장황·과공손).
- **AC-2**: lite(pdtl) doctrine에도 동일 규칙 반영. **⚠️ pdtl doctrine 소스 위치를 먼저 확인** — 이 repo 체크아웃엔 `packages/core/agents/pdtl-*.md`/lite doctrine dir 부재(별도 lite 패키지 or 설치 생성물 추정). 실행 세션이 SoT 위치 특정 후 편집.
- **AC-3**: English-only(doctrine body) 유지 — 규칙 문장은 영어, "terse 해요체"는 대상 언어 지정어로. cap 유지(common ≤50 / persona ≤100).
- **AC-4**: mirror byte-identical(Tier0 변경 시) + QA grill(doctrine 편집 = 예외없이).

## Plan
designer: T-277 편집분(common `§4 lite` + PO Identity `User-facing voice`) 재검 → terse 해요체·blunt 명시, idiomatic 규칙과 균형 재조정. pdtl SoT 위치 특정 후 동일 반영. qa: grill(leak/cap/English-only/정합/드리프트 실제 교정 여부). PO: mirror + impact sweep.

## Outcome
**COMPLETE — doctrine edited, grilled CLEAN, mirrored byte-identical (full+lite).**

결정 적용: user-facing 말투 = **terse 해요체 — blunt, answer-first**. full(pdt) + lite(pdtl) 통일 (killed "lite=공손/full=반말" split은 어디에도 안 남음). 반말은 전 파일 부정형("not 반말")으로만. 개조식은 제품 아님 → tier-2 개인 오버레이로 분리.

편집 (designer, in-place, cap 준수):
- **full tier0**: common `§4 lite`(32/50줄) + PO Identity `User-facing voice`(50/100줄) — register = terse 해요체 명시 + "idiomatic ≠ verbose/over-polite" anti-padding 가드 추가로 T-277 과교정 loophole 봉합.
- **lite**: `../productune-lite` common `§caveman`(34줄) + po `§caveman`(55줄) — 동일 규칙 미러.
- **tier2 (PO-only, machine-local)**: `~/.productune/po/habit.md` — shawn 머신에서 PO user-facing = **개조식(bullet/outline)**, tier-0 terse-해요체 prose를 override. 제품 미포함(git-untracked). 개조식=포맷일 뿐 plumbing-leak 면허 아님.

QA grill (qa-static, doctrine): designer 3개 SoT 타깃 **CLEAN** (leak/cap/consistency full↔lite/T-277 reconcile 정합/반말 exclusion/tier2 scope/protected vocab/drift-teeth 8개 전부 pass). 유일 이슈 = PO 소유 mirror stale → 아래 해소.

PO mirror + impact sweep (AC-4):
- full: `packages/core/doctrine/{common,persona/po}/habit.md` → `~/.productune/doctrine/...` byte-identical ✅
- lite: `../productune-lite/doctrine/{common,po}/habit.md` → `~/.productune-lite/doctrine/...` byte-identical ✅ (lite 훅도 설치 mirror에서 read — stale였음, 동기화)
- sweep: 옛 문구 잔재 0, killed split 0, 새 문구 8곳 전부 live.

AC-1~4 전부 충족. 다음 PO 세션부터 tier-2 개조식 오버레이 발효.

## Persona Activity
PO orchestrated (routing fork resolved w/ user: terse 해요체→tier0, 개조식→tier2 PO-only). designer(authored 3 targets: full common+po, lite common+po, tier2 개조식 override) · qa(doctrine grill, CLEAN). PO: byte-identical mirror (full+lite installed) + impact sweep.

Infra note: agent-teams async subagent spawn에서 SessionStart doctrine 훅 미발화 → workers doctrine-injection fail-safe로 멎음. orchestrator가 훅 직접 실행해 doctrine 블록을 dispatch 파일로 주입 우회. base-CC 메타-dev 디스패치 경로 갭(GUI po-runner 경로는 별개). 후속 티켓 후보.
