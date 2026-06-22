---
ticket_id: T-PATCH-118
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: opus
effort: medium
estimated_complexity: L3
qa_status: pass
completed_at: 2026-06-11
qa_loops: 0
slug: statusline-ticket-count
area_tags: [core/statusline, doctrine/po, doctrine/designer, core/ci]
created_at: 2026-06-11
---

# T-PATCH-118 — statusline 티켓 카운트 `(0/0)`: P2 티켓 미발행(doctrine 갭) + 감지 실패(파서 결함 2건) 동시 수정

## §1. Request

shawn (ad-hoc, 사용자 승인 작업): 디자인 페이즈에서 statusline 이 `v0.1 | phase 2: Design (0/0)` 으로 표시됨. "티켓을 발행 안 하고 phase 를 진행하는 케이스인지, 발행됐는데 statusline 이 감지를 못 하는 건지" 조사 + 수정 요청. 감지 못 하는 경우도 가끔 생기는 것 같다는 관찰.

### 조사 결과 — 세 가지 원인이 모두 실재

| # | 원인 | 증거 |
|:--|:--|:--|
| 1 | **P2 티켓 발행 의무가 doctrine 에 없음** | `designer/bookshelf/phase2-3-ticket-sequence.md` 는 이름과 달리 티켓 발행 지시 0건 (S1~S5 게이트 체인만). `ticket-schema.md` 에 P2 design 티켓(T1/T2/T3)이 정의돼 있으나 발행을 강제하는 문장이 어디에도 없음. `po/lifecycle/index.md` P2 항목도 동일. → 티켓 없이 P2 를 도는 게 doctrine 상 합법 → `(0/0)` |
| 2 | **`phase:` frontmatter drift** | statusline 은 `phase: <int>` 로 카운트하는데 v0.5 티켓 136개 중 27개(T-PATCH-092~117 + 008)가 `phase:` 누락. v0.4 는 0/129 — 전수 부재 (필드가 v0.5 본 티켓부터 도입됐고 patch-round 는 계속 누락) → drift 가 아니라 발행 관행에 한 번도 정착한 적 없음 |
| 3 | **statusline 파서 600바이트 컷** | `statusline-productune.sh` 가 `fh.read(600)` 으로만 frontmatter 를 읽음 → frontmatter 가 600B 초과인 티켓 7건(T-014/015/019/020, T-PATCH-006/089/090 — 최대 1363B)은 닫는 `---` 를 못 찾아 `phase:` 가 있어도 통째 skip |

## §2. Acceptance

- BDD-1: Given frontmatter 가 600B 를 초과하고 `phase: 3`/`status:` 를 가진 티켓 / When statusline 실행 / Then 해당 티켓이 done/total 에 포함된다.
- BDD-2: Given `phase: "3"` 처럼 따옴표로 감싼 정수 / When statusline 실행 / Then 정상 카운트된다.
- BDD-3: Given 이 레포 v0.5 / When statusline 실행 / Then phase 3 카운트가 phase-less 0건 기준이 아닌 backfill 후 전체 기준으로 나온다 (27건 backfill 완료).
- BDD-4: Given P2 진입 / When PO 가 `phase2-3-ticket-sequence.md` 를 따름 / Then branch(A/B/C)별 design 티켓(T1/T2/T3, `phase: 2`)을 체인 시작 **전에** 발행하라는 의무 조항이 doctrine 에 존재한다.
- BDD-5: Given `phase:` 또는 `status:` 가 없는 티켓 md / When `scripts/ci/check-ticket-frontmatter.sh` 실행 / Then 비-zero exit + 파일 목록 출력 (재발 방지 lint).

## §3. Out of scope

- 사용자 dogfood 프로젝트(v0.1)의 po-state 복구 — 본 수정 배포 후 자연 치유.
- statusline 의 worktree 해석 로직 (T-PATCH-117 에서 완료).
- GUI 쪽 티켓 카운트 표시 (statusline 한정).

## §4. Plan

1. `packages/core/scripts/statusline-productune.sh`: `fh.read(600)` → `fh.read(4096)`, phase 정규식 `^phase:\s*["']?(\d+)` 로 quoted-int 허용.
2. v0.5 phase-less 27건에 `phase: 3` backfill (전부 P3 patch 티켓).
3. doctrine: `po/bookshelf/lifecycle/ticket-ops.md` 에 "모든 티켓 frontmatter 는 발행 시점의 `phase:` 를 반드시 포함 (statusline·GUI 카운트 의존)" 의무 조항. `designer/bookshelf/phase2-3-ticket-sequence.md` 에 P2 진입 시 branch별 티켓 발행 섹션 추가. `po/bookshelf/lifecycle/index.md` P2 항목에 티켓 발행 1줄.
4. `scripts/ci/check-ticket-frontmatter.sh` 신설 — `phase:`(정수) + `status:`(enum) 검증.

## §5. Outcome

(P5 에서 기입)

## Persona Activity

| persona | session | started_at | note |
|:--|:--|:--|:--|
| main (shawn 직행) | - | 2026-06-11 | 조사+구현 일괄 |
