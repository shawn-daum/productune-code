---
ticket_id: T-PATCH-248
version: v0.5
slug: artifact-candidate-adopt-lifecycle
title: artifact 후보/채택 lifecycle 명문화 — claude-code native artifact 정합 (후보=temp, 채택만 SoT+manifest)
type: doctrine
status: done
phase: 4
assignee: pdt-designer
requires_qa: true
qa_status: pass
qa_loops: 3
requires_user_gate: false
area_tag: artifacts
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-248: artifact 후보/채택 lifecycle

## Request

shawn(2026-06-23): claude-code에 native artifact 기능이 생기며 페르소나가 우리
`docs/artifacts/<version>/` SoT 폴더에 안 쓰는 경우가 빈발. shawn 결정 모델 = **artifact-AI는
후보(candidate) 생성용(temp/비-SoT), 채택(adopt)된 것만 SoT 폴더 + manifest에 기록.** v0.5에서
처리(v0.6에서 당김). 모델은 user가 이미 확정 — 본 티켓은 그 모델의 **doctrine 명문화**.

## Acceptance (모델은 확정 — designer는 적절한 doctrine 위치에 명문화)

- **AC-1**: artifact lifecycle에 **candidate vs adopted** 2단계 명문화:
  - **candidate** = 탐색/옵션용. **비-SoT**: claude-code native artifact(hosted 프리뷰) 또는
    로컬 scratch(`docs/artifacts/<version>/_candidates/` 등). manifest **미등록**, Artifacts 뷰어
    "현재 중요" 핀 **제외**, 폐기 가능.
  - **adopted** = 채택된 1개(또는 surface별 1개). **SoT**: `docs/artifacts/<version>/` 본 위치 +
    **manifest 엔트리**(`kind`/`source`/`source_hash` — 기존 manifest 규약 준수).
- **AC-2**: **adopt = 결정적 repo 기록** 규칙 — 채택 시 해당 artifact를 반드시 SoT 폴더 + manifest에
  **명시적으로 write**(designer/PO 액션). "claude가 알아서 SoT에 써주겠지"에 의존 금지(현 버그의 원인).
  candidate가 claude-hosted였으면 adopt 시 **repo로 끌어와** 파일로 고정.
- **AC-3**: 기존 artifact 관련 doctrine(예: `p1-prd.md` PRD-view artifact 규약, designer bookshelf의
  artifact/manifest 규약, lifecycle archive 규약)과 **정합** — 모순/중복 ghost 참조 0. candidate
  단계가 manifest/archive 규약과 충돌하지 않게.
- **AC-4**: cap 준수(트림 선행 필요 시 flag, silent breach 금지).

## 모델 수정 (2026-06-24, user 확정) — REOPENED, AC-1 재정의

초안(루프1-2)은 candidate를 `_candidates/` 신규 폴더 또는 claude-hosted로 뒀으나, user 결정으로
**통합 모델**로 단순화 (keep-vs-discard 판단 제거):
- **`_candidates/` 신개념 폐기.** 비채택 artifact(탐색 후보 + 밀려난 버전)는 전부 기존
  **`docs/artifacts/<version>/archive/`** (로컬·git)에 둔다.
- **candidate = 로컬 강제** (claude-hosted는 "잠깐 보는 스크래치"로만; 기록될 후보는 무조건 로컬).
- **adopt = `archive/` → flat `docs/artifacts/<version>/` 승격 + manifest 등록** (결정적 repo 기록).
- 효과: flat엔 채택+등록본만 → manifest-lint 자연 통과(`archive/`만 skip). keep-vs-discard 판단 불요.
- enforcement(2-1 hook) + lint archive-skip(2-2)은 **별도 impl 티켓(T-PATCH-249)** 으로 분리.

→ designer는 `artifact-manifest-schema.md` + `phase2-3-ticket-sequence.md`의 `_candidates/`·hosted
관련 서술을 이 통합 모델로 수정. (이전 루프의 AC-2 adopt=결정적-write 정신은 유지, 위치만 archive→flat.)

## Out of scope (→ 결정/후속 분리)

- **enforcement 메커니즘 구현**(hook으로 adopt 강제 / P2 close-gate에 "채택 artifact가 manifest에
  존재" 검증 추가)은 **별도 impl 결정** — 본 티켓은 doctrine 규칙만. (PO가 user에게 "doctrine만 vs
  enforcement hook까지" 결정 요청.)
- candidate 저장소를 claude-hosted vs 로컬 `_candidates/` 중 무엇으로 강제할지 — designer가
  sensible default 제시(둘 다 허용 권장), 강제 정책은 enforcement 결정과 함께.

## Plan
designer가 적절한 doctrine 파일(들)에 candidate/adopt lifecycle + adopt=결정적-repo-기록 규칙
명문화, 기존 artifact/manifest/archive 규약과 cross-ref 정합. QA grill.

## Outcome
shipped (doctrine) — **통합 archive 모델**(user 확정 2026-06-24) 최종본: `archive/` = candidate(로컬 강제), flat = adopted, **adopt = promote archive→flat + manifest**. `_candidates/`·hosted-as-SoT 폐기. keep-vs-discard 판단 제거(승자만 flat 승격, 나머지 archive 잔존→archive-tidy cadence). 2파일: `artifact-manifest-schema.md`(91, <100) + `phase2-3-ticket-sequence.md`(150 net-neutral, breach 미악화).
- 사이클: designer author → QA(루프1 FAIL: cap breach 154) → designer fix(150) → QA(루프2 PASS, 구모델) → **user 모델수정(통합)** → designer 재author → QA(루프3 PASS). archive/ 3중첩(candidate/superseded/reject)은 "flat이 SoT 판별자"라 어떤 룰도 구분 불요 = coherent; manifest는 superseded(status:archived row) vs candidate(row 없음)로 provenance 유지.
- enforcement(2-1 close-gate hook) + lint archive-skip(2-2)은 **T-PATCH-249**(impl)로 분리 — doctrine이 249를 forward-ref하므로 249 발행 필수.
**watch:** `artifact-manifest-schema.md` 91/100 — 다음 추가 시 split.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-designer | author (2 files) | sonnet | done (루프2 — 1차 cap-flag 오판 자가정정) |
| pdt-qa | grill | sonnet | loop1 FAIL(AC-4 cap breach) → loop2 PASS |
