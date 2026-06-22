---
ticket_id: T-PATCH-226
version: v0.5
slug: brand-asset-generation-delegation
title: Phase2 로고/og 생성 — Codex 위임 / 외부모델 프롬프트 / Claude-직접 분기 (designer 자아 완화)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: true
area_tag: brand-assets
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
qa_status: pass
qa_loops: 1
completed_at: 2026-06-22T00:00:00Z
---

# T-PATCH-226: 로고/og 생성 위임 분기

## Request

shawn(2026-06-19): Phase2 로고/og:image 단계에서 designer가 "자아가 너무 세다"(직접
생성을 우선). 실제로 Claude(Claude Code)는 **이미지 생성 모델이 없음** → 직접 만든 SVG는
구림. 원하는 동작:

1. **Codex agent가 설치돼 있으면** → 로고/og 생성을 Codex에 위임.
2. **없으면** → 유저에게 프롬프트를 주고 ChatGPT(https://chatgpt.com/) 또는
   Gemini(https://gemini.google.com/app)에 입력하라고 안내.
3. **유저가 거부하면** → Claude가 직접 생성(구리지만).
4. 또는 위 2·3을 **선택지로** 제시.
   안내 문구 예: "Claude는 이미지 생성 모델이 없어요. ChatGPT/Gemini에 넣을 프롬프트를
   드릴까요? 아니면 (퀄리티는 떨어지지만) 저희가 직접 만들까요?"

## 현황

`designer/bookshelf/phase2-3-ticket-sequence.md` `S2b — brand assets`(T-PATCH-206)는
designer가 로고/favicon/og를 **직접 PRODUCE**(DS에서 파생). "능력 밖(raster/3D/photographic)"일
때만 `external_tool_recommendation`(habit §5)로 외부 프롬프트 emit. → **벡터 로고/og는 직접
생성이 기본**이라 designer 자아가 셈. 또 2026-06-15 backlog 결정("DS 확정 후 로고·에셋 =
핸드오프-먼저 + MCP-후속; codex/CLI 위임안은 이미지 생성 불가로 폐기")과 부분 충돌 —
당시 codex는 이미지 생성 불가로 봤으나, shawn은 "Codex agent 설치 시 위임"을 다시 요청 →
**현 시점 Codex 이미지 생성 가능성 재확인 필요(OQ)**.

## 설계 방향

S2b의 자산 생성 정책을 **위임-우선 분기**로 전환:

1. **Codex 가용 탐지** → 가능 시 로고/og 생성을 Codex에 위임. Codex agent는 이미지 생성
   스킬 보유(한도 소진만 아니면 실제 raster/이미지 산출 가능 — shawn 확인 2026-06-19).
   위임 실패(한도 소진/에러) 시 2번(외부모델 핸드오프)로 폴백.
2. **Codex 없음** → 유저에게 ChatGPT/Gemini용 **프롬프트 + expected_output_path** 제공
   (기존 external_tool_recommendation 메커니즘 재사용, 링크 명시).
3. **유저 거부** → Claude 직접 생성(SVG, "퀄리티 제한" 고지).
4. 2·3을 **2-옵션 OQ**로 제시(안내 문구 포함). 기본은 프롬프트-핸드오프(1순위), 직접생성은 fallback.

"Claude는 이미지 생성 모델 없음" 고지를 분기 진입 시 1회 노출. designer가 자동으로 직접
생성에 돌입하지 않게(자아 완화) — 위임/핸드오프가 default, 직접생성은 명시적 선택/거부 후.

## Acceptance

- **AC-1**: S2b 진입 시 designer가 곧바로 로고를 직접 그리지 않고, 위임/핸드오프/직접 분기를
  거친다(자아 완화).
- **AC-2**: Codex agent 가용 시 로고/og 생성이 Codex에 위임된다(이미지 생성 스킬 사용).
  위임 실패(한도 소진/에러) 시 외부모델 핸드오프(AC-3)로 폴백한다.
- **AC-3**: Codex 없음 + 유저 수락 → ChatGPT/Gemini 프롬프트 + output path가 제시되고, P3
  close-gate의 해당 자산은 산출물 landing까지 `blocked`.
- **AC-4**: 유저 거부 → Claude 직접 생성으로 폴백하며 "이미지 모델 없음 / 퀄리티 제한" 고지.
- **AC-5**: 2026-06-15 backlog 결정("codex 위임안 폐기 — 이미지 생성 불가")을 본 티켓이
  **갱신**함(Codex 이미지 생성 가능 확인, 2026-06-19). backlog 항목에 그 정정을 명기한다.

## Out of scope

- 실제 이미지 생성 모델 통합(Figma MCP / Vercel AI Gateway 이미지 — backlog v0.6+ 후속).
- brand-guide 입력 재사용 경로(S2b 기존, 변경 없음).

## 메모

2026-06-15 backlog는 "codex/CLI 위임안 폐기(이미지 생성 불가)"였으나, Codex agent의 이미지
생성 스킬 확인(shawn, 2026-06-19)으로 위임 경로 부활. 단 한도 소진 시 핸드오프 폴백 필수.

## QA 노트

doctrine grill: S2b 위임 분기 정합 · external_tool_recommendation 재사용 정확 · close-gate
asset-blocked 연동 · backlog 결정 충돌 해소 확인. 참고: `qa/bookshelf/design-review.md`.

## 구현 요약 (2026-06-22)

`designer/bookshelf/phase2-3-ticket-sequence.md` `S2b — brand assets` 위임-우선 분기 전환:
- 진입 시 "Claude has no image-generation model" 1회 고지 + "production은 delegation-first,
  Claude-direct는 explicit fallback" 명기 — designer 자동 직접생성 차단 (AC-1).
- ① Codex 가용 시 로고/og 위임(이미지 생성 스킬, 한도소진/실패 시 ②로 폴백 — Claude-direct로
  바로 안 감) (AC-2).
- ② Codex 없음 → ChatGPT(chatgpt.com)/Gemini(gemini.google.com/app) 프롬프트 +
  `expected_output_path`를 `external_tool_recommendation`(habit §5)로 emit, close-gate item은
  asset landing까지 `blocked` (AC-3).
- ③ 유저 거부 → Claude 직접 SVG + "이미지 모델 없음/퀄리티 제한" 고지 (AC-4).
- ②③를 2-옵션 OQ로(default=핸드오프, fallback=직접). 능력 밖(3D/photographic/complex
  illustration)은 항상 ② 우선.
- brand-guide input은 위임 분기 없이 REUSE 유지(변경 없음, out-of-scope 준수).
- `phase3-close-gate.md` producer 노트: external_tool_recommendation → "delegation /
  external_tool_recommendation 핸드오프(Codex or ChatGPT/Gemini) blocked" 로 확장 (AC-3 연동).
- backlog 2026-06-15 "codex 위임안 폐기(이미지 생성 불가)" 항목에 T-PATCH-226 정정 1줄 추가
  (Codex 이미지생성 가능 확인 → 위임 부활, 폐기 무효) (AC-5).

## Sign-off
AC-1~5 충족. grill self-check pass (위임 분기·OQ·close-gate blocked 연동·backlog 충돌 해소).
