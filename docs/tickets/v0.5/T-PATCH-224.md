---
ticket_id: T-PATCH-224
version: v0.5
slug: ui-driving-state-strict-schema
title: UI-구동 state 필드(po-state version/phase · ticket frontmatter) strict 스키마 강제
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: state-integrity
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-224: UI-구동 state 필드 strict 스키마 강제

## Request

shawn 보고(2026-06-19): po-state에 버전 키를 잘못 써서(`version` ↔ `current_version`)
statusline이 productune 구간 전체를 스킵하고 branch만 남긴 적 있음. 티켓 `status`도
유사 드리프트가 반복("예전부터 계속"). **공통 클래스**: CLI/GUI가 직접 읽어 화면을
구동하는 state 필드의 키 이름·enum이 쓰기 시점에 강제되지 않아, 오타/오enum이 조용히
새고 → UI가 말없이 깨짐.

원칙(shawn): **UI/CLI를 직접 구동하는 state 필드는 쓰기 경계에서 strict 검증, 위반이면
차단(block).** 사람용 free-text(notes·request_summary·AC 본문·scratch)는 느슨 유지.

## 현황 — 왜 새는가 (조사 결과)

- **po-state shape-guard**(`post-po-state-shape-guard.sh`)는 `schema_version` + `current_task`의
  canonical-14 필드 + `current_task.status` enum만 검사. **top-level 키 이름은 안 봄** →
  `version`/`version_now` 등 오기 미탐지. 또 PostToolUse라 **non-blocking**(surface만).
- **티켓 .md frontmatter는 검증 훅이 전무** — PO가 손으로 `status`/`qa_status`/`type`/`version`을
  쓰며 enum/regex 위반해도 무방비.
- **canonical 키 이름이 내부에서 엇갈림(루트 원인)**: `session-start-po-state-migrate.sh:145`의
  load-bearing 검증은 `d.get('version')`(top-level `version`)을 보는데, `statusline-productune.sh`
  + shape-guard + doctrine(`ticket-schema.md` "po-state.current_version")은 `current_version`을
  읽음 → **SoT 자체가 version vs current_version로 불일치**. shawn 버그의 뿌리.

## 설계 방향

### A. canonical SoT 1곳 고정
- po-state top-level load-bearing 키를 명문화: `current_version`(shape: `{id|label, current_phase, ...}` 또는 legacy flat은 migration 대상) · `current_phase` · `slug` · `request_summary`.
- migrate 훅의 `version` 참조(line 145)를 `current_version`으로 정정 + 기존 데이터에 top-level `version`만 있으면 1회 backfill(`version`→`current_version`, 알려진 값 정리라 룰베이스 OK).

### B. po-state version/phase = canonical setter + raw-write 차단
- `current_version`/`current_phase`는 버전/페이즈 전환 때만 바뀜(턴마다 X). GUI `phase:approve`
  IPC가 이미 phase를 canonical하게 set하는 선례 → CLI측에도 동형 setter(또는 단일 write 헬퍼).
- doctrine: "version/phase는 setter로만; raw jq로 top-level `current_version`/`current_phase`
  직접 set 금지" 명시(`lifecycle/state-hygiene.md` + delegation.md jq 규칙 옆).
- 매 턴 scratch(`current_task.*` jq 머지)는 현행 유지 — 이미 14-필드+enum 가드.

### C. po-state top-level unknown-key 검사 (이름 불문)
- shape-guard에 top-level canonical 화이트리스트 추가: 화이트리스트 밖 키(`version`·`version_now`·
  `ver` 등 무엇이든) → 플래그. alias 룰베이스가 아니라 **화이트리스트라 새 오타도 다 잡힘**.
  (current_task 14-필드 화이트리스트와 동형.)

### D. ticket frontmatter PreToolUse 가드 (block)
- 신규 훅: 티켓 `docs/tickets/**/*.md` 쓰기 시 frontmatter 파싱 →
  - `status` ∈ `todo|in-progress|review|user-verify|done|blocked|abandoned`
  - `qa_status` ∈ `pending|pass|fail|skipped` (있을 때만; requires_qa:false면 생략 허용)
  - `type` ∈ `design|impl|refactor|test|qa|deploy|close|docs|doctrine`
  - `version` 매치 `^v\d+(\.\d+)?(-[\w-]+)?$` (예외: `legacy: true` + `legacy/...`)
  위반 시 **exit 2로 write 차단** + 위반 필드/허용값 메시지. SoT = `ticket-schema.md`.
- soft 필드(title/slug/request·AC 본문 등)는 미검증.

## Acceptance

- **AC-1**: migrate·statusline·shape-guard·doctrine가 모두 `current_version` 단일 키를 읽고,
  migrate의 `version` 참조가 정정된다(내부 SoT 불일치 해소).
- **AC-2**: 기존 po-state에 top-level `version`만 있으면 다음 세션 시작 migrate가 `current_version`으로
  1회 backfill하고 `version`을 제거한다.
- **AC-3**: po-state top-level에 canonical 밖 키(`version_now` 등)가 있으면 shape-guard가 플래그한다(이름 불문).
- **AC-4**: po-state `current_version`/`current_phase`를 raw jq로 직접 set하려는 경로가 차단되고,
  setter 경유만 허용된다. 매 턴 `current_task.*` scratch jq는 영향 없음.
- **AC-5**: 티켓 frontmatter의 `status`/`qa_status`/`type`/`version` enum·regex 위반 시 write가
  PreToolUse에서 차단되고, 허용값 안내가 출력된다. soft 필드는 차단되지 않는다.
- **AC-6**: 정상 lifecycle(올바른 status 전환·버전 전환)이 회귀 없이 통과한다(false-block 0).

## Out of scope

- **전체 typed setter**(모든 po-state mutation을 setter로) — current_task.* 매 턴 scratch는
  기존 14-필드+enum 가드로 충분, 전면 setter화는 대공사라 제외(필요 시 별도 티켓).
- soft free-text 필드 검증.
- codex 관련 키(폐기).

## QA 노트

cua/단위 양쪽: (a) `version` 오기 po-state → migrate가 current_version으로 자가치유 +
statusline 정상 표시. (b) `version_now` → shape-guard 플래그. (c) 티켓에 `status: planning`
write 시도 → block. (d) 정상 lifecycle false-block 없음. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

## 메모

내부 SoT 불일치(`version` vs `current_version`, migrate:145)는 이 버그의 루트 — A를 먼저
고정하지 않으면 B~D가 엇갈린 SoT 위에 쌓임. A → C/D → B 순 권장.
