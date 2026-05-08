# pdt-designer project decisions

> Non-trivial design decisions, one dated line each. PO appends on user approval.

- (2026-05-04) phase4-gui-full-cycle: planner/developer mode 분기 제거 → 단일 GUI 모드. PRD Phase 4 명칭/AC/OQ 갱신. service-flow A1 "Welcome / 모드 선택" → "First-run wizard (Engine / Wiki / API Key)" 재정의.
- (2026-05-04) workspace-shell: chat-in-center → chat-on-right. 4-column grid 48/240/1fr/360. ActivityBar VSCode 패턴 (좌 48px, 아이콘 3종). PO chat 360px 우측 상시 고정. Persona panel 위치 TBD (Slice 5 재방문).
- (2026-05-06) GUI PO 세션 단일화: 멀티 채팅방 X → 프로젝트당 단일 PO 세션. 스토리지 = `<projectDir>/.productune/chat.json` 단일 파일. T-P4-042 deprecated, T-P4-041 이 단일 세션 흡수. CLI/non-GUI 는 multi-session 가능성 보존.
- (2026-05-07) productune GUI design system 정식 spec land (`docs/design/design-system.md`). shadcn-style token (color/spacing/typo/radius/elev/icon/motion). lucide-react@1.14.0 default. brand orange = persona-po alias 의도 정합. dark-only first, light theme = Phase 5.
- (2026-05-07) doctrine prose convention: persona/sections .md = English-only + caveman-lite. persona/stage/Phase/status enum verbatim (T-P4-057 linter 정합).
- (2026-05-07) delegation chunking ceilings: designer 1~2 산출물/1~3 결정/1 sub-area/5-10min; developer 1 ticket; qa 1 ticket. T-P4-065 reject dogfood 후 박음, hard rule 아닌 guideline.
- (2026-05-08) T-P4-065 통합: Phase 5단 (PRD/Design/Build/Deploy/Close) + ticket stage→type rename + ChatPanel selector 제거 + po-state slim + PRD/flow/mockup 정정 — 6 sub-area plan + 통합 ticket. 사용자 가시 = doctrine 어휘 동일 → axis 충돌 해소. ticket type axis (6 enum 유지) 분리. po-state past_tickets[] 통째 제거 + ticket md = SoT. PhaseStrip default 1 dot + hover expand 5 dot. 색 5 hex (deploy #FB923C / close #34D399). schema_version 1→2 통합 jq idempotent.
