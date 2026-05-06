# pdt-designer project decisions

> Non-trivial design decisions, one dated line each. PO appends on user approval.

- (2026-05-04) phase4-gui-full-cycle: planner/developer mode 분기 제거 → 단일 GUI 모드. PRD Phase 4 명칭/AC/OQ 갱신. service-flow A1 "Welcome / 모드 선택" → "First-run wizard (Engine / Wiki / API Key)" 재정의.
- (2026-05-04) workspace-shell: chat-in-center → chat-on-right. 4-column grid 48/240/1fr/360. ActivityBar VSCode 패턴 (좌 48px, 아이콘 3종). PO chat 360px 우측 상시 고정. Persona panel 위치 TBD (Slice 5 재방문).
- (2026-05-06) GUI PO 세션 단일화: 멀티 채팅방 X → 프로젝트당 단일 PO 세션. 스토리지 = `<projectDir>/.productune/chat.json` 단일 파일. T-P4-042 deprecated, T-P4-041 이 단일 세션 흡수. CLI/non-GUI 는 multi-session 가능성 보존.
