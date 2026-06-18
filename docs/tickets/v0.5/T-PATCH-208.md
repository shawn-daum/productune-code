---
ticket_id: T-PATCH-208
version: v0.5
slug: enforce-ticket-frontmatter-lint
title: 티켓 status enum drift 재발 방지 — check-ticket-frontmatter lint을 자동 강제(훅/CI)
type: fix
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: true
area_tag: ci-enforcement
risk_flags: >
  훅으로 강제하면 매 티켓 Write/Edit마다 lint 실행 — 잘못 짜면 정상 작업을 막거나
  노이즈. PostToolUse(write 이후라 이미 쓰임 → 경고+자가수정 유도) vs PreToolUse
  (쓰기 전 차단, 새 내용 파싱 까다로움) vs Stop(턴 끝 검사) vs CI(push 시, 로컬
  CLI 흐름은 push 안 할 수 있어 약함). settings.json/install.sh 훅 등록 변경은
  민감 — 기존 훅 체인 안 깨지게.
estimated_complexity: L3
created_at: 2026-06-18T00:00:00Z
---

## 배경 / 목적

티켓 frontmatter의 `status`가 canonical enum(`todo | in-progress | review |
user-verify | done | blocked | abandoned`, `designer/bookshelf/ticket-schema.md:14`)
을 벗어난 값(`pending`, `backlog` 등)으로 반복 오염된다. dogfood에서 사용자가 직접
"status 두 개가 이상한데 규칙 맞냐, 왜 자꾸 생기냐"로 발견(2026-06-18: T-PATCH-192
`backlog`, T-PATCH-207 `pending`).

### 근본 원인 (확인됨)
- **lint은 존재 + 정확하다**: `scripts/ci/check-ticket-frontmatter.sh`가 `status`를
  enum과 대조해 `bad-status`로 FAIL시킨다(phase 정수 + frontmatter 닫힘도 검사).
  실행하면 위반을 즉시 검출.
- **그러나 자동 트리거가 없다**: `.github/workflows/`엔 `fresh-install-smoke.yml`
  하나뿐(이 lint 미포함). 훅/빌드/커밋 훅 어디에도 미연결. doctrine
  (`po/bookshelf/lifecycle/ticket-ops.md`)은 "lint이 batch를 fail시킨다"고 적었으나
  **실제 강제 지점이 없음** → 세션마다 synonym이 조용히 통과·누적.
- `scripts/ci/`의 다른 check-*(artifact-manifest, symlink, env-key 등)도 호출처가
  안 잡힘 — lint 묶음 전체가 수동 방치된 게 시스템적 갭.

## 설계 결정 (enforcement 지점 — 택1/조합, 게이트)

| 옵션 | 트리거 | 강도 | 트레이드오프 |
|------|--------|------|------------|
| **A. PostToolUse 훅** | docs/tickets/**/T-*.md Write/Edit 직후 | 로컬 작성 시점, 모든 세션 | 이미 쓰인 뒤 경고(자가수정 유도). 매 편집 실행 비용 |
| **B. Stop 훅** | 턴 종료 시 lint 실행 | 턴 단위, 로컬 | 턴 중간 위반은 끝에 한 번 잡음. 가장 가벼움 |
| **C. CI lint 워크플로** | push/PR | 사후, 원격 | 로컬 CLI 흐름이 push 안 하면 무력. check-* 묶음 일괄 수용 가능 |
| **D. pre-commit** | git commit | 커밋 시점 | productune 커밋이 main 직접 — 잡긴 함. 훅 설치 필요 |

권장: **B(Stop 훅, 가장 가벼움) 또는 A** 로 로컬 강제 + **C** 로 묶음 lint를 CI에도
연결(이중 안전망). 어떤 지점이든 `check-ticket-frontmatter.sh` 재사용(중복 구현 금지).

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/core/scripts/hooks/<new>.sh` (택 A/B 시) | tickets 경로 변경 감지 → check-ticket-frontmatter 실행 → 위반 시 경고/blocked 컨텍스트 emit |
| `packages/core/scripts/install.sh` (+ settings.json 등록) | 새 훅 등록 (기존 훅 체인 보존) |
| `.github/workflows/lint.yml` (택 C 시, 신규) | `scripts/ci/check-*` 묶음 실행 |
| `po/bookshelf/lifecycle/ticket-ops.md` | "lint이 강제된다"를 실제 트리거와 일치하게 갱신 |

## Acceptance Criteria

- **AC-1**: 비-enum status(`pending`/`backlog` 등)로 티켓을 쓰면 자동으로(훅 또는 CI) 검출돼 신호가 뜬다 — 조용히 통과하지 않는다.
- **AC-2**: `check-ticket-frontmatter.sh`를 재사용(중복 lint 신설 금지).
- **AC-3**: 기존 훅 체인 / 정상 티켓 작성 흐름을 막지 않는다(false-positive·과차단 없음).
- **AC-4**: doctrine 문구가 실제 강제 메커니즘과 일치한다.

## 비고

- 본 티켓의 트리거 사건: T-PATCH-192(`backlog`)·207(`pending`) — 둘 다 본 작업에서 `todo`로 정정 완료. 199~205의 `in-progress`도 `user-verify`로 정정(구현완료·QA대기 정확 표기).
- QA: 일부러 bad-status 티켓 작성 → 강제 트리거가 잡는지 확인.
