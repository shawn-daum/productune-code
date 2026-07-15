---
title: Retro v1.1
type: retro
status: live
version: v1.1
links: ["retro--v1.0", "learning--v1.1-process", "fact--gui-runtime-arch"]
---

# Retro — v1.1 (2026-07-07 ~ 2026-07-15)

## What shipped
- **성격**: v1.0 flip 이후 첫 실사용(dogfooding) 안정화 버전 — 신규 화면보다 실사용 마찰 제거 중심, 티켓 30건 done.
- **GUI 신뢰성**: file:// 링크/아티팩트 자동표시 체인(T-328→345→346), 채팅 내부 링크 전역 소생(ptn: sanitize 결함), 프로젝트 카드 복구(T-347), 프로젝트 탭 재구성+히스토리 탭(T-348/349/351), 첨부 칩(T-350), 큐 전송 버튼 복구(T-343), 한글 IME 잔류 근절(T-344→354, 실 IME 하네스 확립), 상태바 사용량/위임 칩 공존+워커 스프라이트(T-355), ratelimit 구분 표시(T-352).
- **PO 모델 가시성/제어**: FreshComposer 선택(기본 opus)→스프라이트/배지 라벨→버전 표기→상시 버전 표시(관측 persist) (T-334/335/338/342).
- **CLI/설치**: statusline default-on(T-330), init stage 프롬프트 제거(T-331), init 버전 화살표 선택 UI(T-332), 도구 실행 라벨 humanize(T-333).
- **Discipline/하네스**: PO 세션오픈 내레이션 무음화(T-340), stage-guard hook — 매 턴 state 주입+deploy 경고(T-336, hanta 실사고 대응), 기기 override 전용 hook 분리(T-358, truncation 유실 실사고 대응), 시작버전 보존 규칙(T-329).
- **QA 인프라**: CUA VM 격리 확립 — 포커스/IME류 검증 VM 라우팅 + frontmost 게이트(T-357), 실 IME·실스트림 검증 하네스 다수 wiki화.

## What worked
- **실사용 즉시 patch 루프**: 사용자 리포트(스크린샷) → 티켓 → dev → QA(라이브) → 커밋이 당일 다회전 — ship patch loop가 설계 의도대로 작동.
- **QA 라이브 검증의 가치 입증**: 유닛 green을 통과한 실결함 3건(T-345 dead links · T-332 블라인드 메뉴 · T-354 실IME 잔류)을 전부 QA 라이브가 잡음. FAIL→재작업 왕복 2회 모두 정당.
- **워커 memory_notes → inbox 파이프**: 86줄 축적, 이번 curation으로 신규 fact/learning 페이지 5장 + 기존 3장 갱신.

## What to change
- **검증 레벨 원칙 명문화됨** ([[learning--v1.1-process]]) — "클릭 가능/보인다/입력된다" acceptance는 해당 레벨 실구동 필수. QA 디스패치 시 acceptance에 검증 레벨을 명시하는 습관.
- **미러 staleness가 반복 마찰** (2회) — T-353 후보. install.sh 재실행 의존을 줄이는 자동화 필요.
- **하네스-레벨 사고 2건이 discipline로 잡힘** — override truncation(T-358)·stage 신호 침묵(T-336). 하네스 가정은 실측으로 검증하고 wiki에 남기는 패턴 유지.

## Outcome
- **North star (v1.0에서 carry): 비개발 기획자가 GUI-only로 실프로젝트 풀사이클(PRD→Close) 완주 — T-294 관찰 항목.**
- **Observed (부분)**: 이번 버전 기간 중 실프로젝트 2개 dogfooding 발생 — hanta: GUI로 Define→Build→**deploy까지 완주**(단 PO가 ship 전환·Retro를 스킵 → T-336으로 원인 수정, hanta 측 정리 지시 완료) · enneagram-mentor: Define~디자인 3안 리뷰 진행 중. "완주는 되나 라이프사이클 규율이 샌다"가 관찰의 핵심 학습이며 v1.1 patch 다수가 그 관찰에서 나옴.
- **Unobserved**: 수정된 규율(stage-guard 포함) 하에서의 **클린 풀사이클 1회** — hanta 완주는 스킵 버그가 있던 상태의 완주. 다음 버전 기간 중 재관찰 (T-294 잔여 취지).

## Escalation deviations
- 워커 `escalate_to` 반환 0건. 라우팅 미스로 인한 티어 재디스패치 0건 — 단 QA 재작업 왕복 2회(T-332/T-345)는 라우팅이 아니라 검증 레벨 문제 (learning 반영).

## Accepted doctor warnings
- legacy v0.4–v0.6 티켓 구 enum 위반(151건) — v1.0 retro와 동일 수용, 처방은 T-296(repo migrate, backlog).
- retro--v1.0의 `prdt-v1-*.md` 링크 경고 4건 — docs/ 루트 설계 문서 참조로 wiki 페이지 아님, 의식적 수용.

## Backlog disposition (Retro sweep)
- **T-294 → done**: 관찰 자체는 발생(위 Outcome). 클린 재관찰은 다음 버전 자연 항목으로 — 별도 티켓 불요.
- 유지(다음 Define 입력 풀): T-295/296/297(레거시 ops), T-307/315/317/318/323/326(v1.0 이월), T-337/339/341/353/356(이번 dogfooding 파생).
- drop 없음.
