---
title: "Retro v1.0 — prdt 코어"
type: retro
status: live
version: v1.0
links: [prdt-v1-design.md, prdt-v1-disposition.md, prdt-v1-gui-coupling.md, prdt-v1-flip.md]
---
# Retro — v1.0 (prdt 코어)

## What shipped
- **설계·감사** (§12.1–2): 설계 SoT(`prdt-v1-design.md`) · 처분표(hook 18 + PO bookshelf 전건 결정) · GUI 결합 감사(A1~A8 어댑터 목록 + 열린 항목 3건 전부 확정).
- **코어** (§12.3): doctrine/contracts/habit 4종 + playbook 17종 + style-library 이식 · `prdt` CLI(init/doctor/wiki/tickets/history/menus/migrate) · hook 3종 + statusline(순수 표시) · install/uninstall.
- **검증** (§12.4): ① VM smoke 수행 — F2(self-load)·F3(inbox)·F4(assignee) 등 발견분 전건 교정. ② full 시나리오는 migrate 실측으로 축소 수행(paepyeong T-109 deps 매핑 버그 발견·수정 등). ③ 실프로젝트 병행 운영 **미수행 → T-294 이월**.
- **전환** (§12.5–6): `prdt migrate`(full/lite 옵트인) · flip 실행(이 기기) + 자동 핸드오프(런치 스텁, cua VM 검증) + `--rollback` · MIGRATION.md(동료 매뉴얼).

## What worked
- 재구성+자산 이식 전략: 기존 full/lite 무수정 원칙 덕에 flip 전까지 리스크 0, 롤백 한 수.
- dogfood 교정 프로토콜이 실제로 돌았다 — VM smoke·실사용에서 잡힌 일탈이 당일 discipline 교정 커밋으로 수렴 (override last-wins, 질문 타임아웃 잠정 진행 금지, turn-open 침묵, statusline version 세그먼트 등).
- 파생물 CLI 생성(메뉴판·index) — SYNCED PAIR류 desync가 v1.0 기간 0건.

## What to change
- v1.0은 ticket 없이 커밋 단위로만 진행(코어 자체가 ticket 제도를 만드는 중이었음) — v1.1부터는 자기 제도 적용(이번에 T-283~T-293 발행).
- Agent-tool 서브에이전트 discipline 주입이 두 번의 hook 이중 등록(F2, SubagentStart/Stop)을 요구 — 주입 경로가 invocation 방식에 민감. GUI 어댑터(A2/A6)에서 재검증 필요.
- 검증 계층을 순서대로 다 밟지 못하고 flip을 앞당김(2026-07-03 사용자 결정, 구조 신뢰 근거) — ③이 남은 만큼 v1.1 기간 중 실프로젝트 병행(T-294)으로 상환.

## Outcome
- **North star: "full + lite를 prdt 단일 시스템이 실사용에서 대체한다."**
- Observed: 이 기기 flip 완료(구 hook 18→prdt 3 + statusline 교체, cua VM에서 GUI 앱 번들 기기 경로까지 검증) · VM smoke pass · migrate 실측 pass. 이 저장소 자체가 prdt로 운영 개시(이 Retro가 첫 boundary ritual).
- **Unobserved: 실프로젝트 1개 풀 라이프사이클 병행 운영(§12.4-③)** — flip 선행 결정으로 미수행. T-294(backlog)로 이월, v1.1 기간 중 관찰.

## Accepted doctor warnings
- 151건 전부 legacy v0.4–v0.6 티켓의 구 enum(7값 status·doctrine type) — 이 프로젝트 본체 migrate(T-296)가 처방이며, 닫힌 legacy 티켓이라 v1.1까지 의식적 수용.

## Escalation deviations
- 해당 없음 — v1.0은 dispatch 운영 전 단계(코어 구축)라 escalate_to 관찰 표본 없음.

## Next
- v1.1 open — scope: **productune(GUI) ↔ prdt 정합성** = 어댑터 A1~A8 (T-283~T-293, feature: gui-adapter). main 병합은 v1.1 완료 전까지 보류.
- v1.1 Out(변동 없음, 설계 §13): vector search 백엔드 · cross-project wiki · codex 엔진 · 팀/멀티유저 · GUI prdt 네이티브 재작업 · skill 재편.
