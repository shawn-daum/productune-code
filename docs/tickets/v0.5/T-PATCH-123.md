---
ticket_id: T-PATCH-123
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L2
qa_status: pass
qa_loops: 0
completed_at: 2026-06-11
slug: update-drop-migration-list
area_tags: [core/cli]
created_at: 2026-06-11
---

# T-PATCH-123 — productune update: 동봉 migration 목록 제거

## §1. Request

shawn (대화 합의, 2026-06-11): `productune update` 출력의 "동봉된 migration:" 목록이 **적용 여부와 무관하게 동봉 migration 전부를 무조건 나열**한다. update 는 글로벌 작업(productune repo `git pull` + `install.sh`)이라 프로젝트 `schema_v` 비교를 못 하고, 실제 적용 판정은 각 프로젝트 PO 세션이 담당(`session-start-doctrine.sh :: build_migration_block`, `id>schema_v` + `auto_check` exit0). 따라서 update 단계의 목록은 액션 불가 + 중복 노이즈.

결정: **목록 완전 제거**. PO 가 프로젝트별로 미적용분을 감지·제안한다는 안내만 한 줄 남긴다.

## §2. Acceptance

- BDD-1: Given `productune update` 실행 / Then "동봉된 migration:" 헤더 및 id/title 나열 루프가 출력되지 않는다.
- BDD-2: Given update 완료 / Then 마무리 메시지가 "각 프로젝트에서 productune 재실행 — 미적용 migration 은 PO 가 감지·제안" 취지의 한 줄을 포함한다.
- BDD-3: `MIG_DIR` 스캔/`for f in ...`/`printf '    %04d ...'` 블록이 update case 에서 제거됐다 (dangling 변수 참조 없음).
- BDD-4: update 의 나머지 동작(repo 해석 · dirty-check · `pull --ff-only` · `install.sh` 재실행 · exit 0)은 불변.

## §3. Out of scope

- `session-start-doctrine.sh` 의 per-project 감지 로직 (변경 없음 — SoT 유지).
- migration registry / `schema_v` 판정 메커니즘.
- `update` 를 cwd 프로젝트 인식으로 만드는 것 (옵션 A — 채택 안 함).

## §4. Plan

`packages/core/scripts/productune` update case (현 216~227줄):
- `MIG_DIR=...` ~ `fi` 블록(216~227) 제거.
- 228줄 마무리 say 를 한 줄로 갱신 — 예: `say "업데이트 완료. 각 프로젝트에서 productune 을 다시 실행하세요 — 미적용 migration 은 PO 가 감지·제안합니다."`

## §5. Outcome

`productune` update case: migration-list 블록(comment + `MIG_DIR` 스캔 + `if/for/printf`, 13줄) 제거 → 마무리 say 한 줄에 per-project 안내 통합. PO smoke: `bash -n` OK · `grep MIG_DIR|동봉된` 0건 · repo-resolve/dirty/pull/install/exit 불변. BDD-1~4 pass, qa_loops 0. 미커밋(유저 push 지시 대기).
