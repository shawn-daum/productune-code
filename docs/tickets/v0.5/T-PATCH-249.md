---
ticket_id: T-PATCH-249
version: v0.5
slug: artifact-adopt-enforcement
title: artifact adopt enforcement — design close-gate "채택 artifact 존재" 검증 hook + manifest-lint archive-skip
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 2
requires_user_gate: false
area_tag: artifacts
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-249: artifact adopt enforcement

## Request

T-PATCH-248(doctrine, 통합 archive 모델)의 enforcement impl. user 결정(2026-06-24): adopt를
persona discipline에만 의존하지 말고 **hook으로 강제**(다른 가드와 동일 철학). doctrine이 본
티켓을 forward-ref(`artifact-manifest-schema.md:42,91`)하므로 발행 필수.

## Acceptance

- **AC-1 (2-2 lint archive-skip)**: `scripts/ci/check-artifact-manifest.sh`가 `docs/artifacts/<version>/archive/`
  하위 파일을 manifest-등록 검사에서 **제외**한다(현재 `find "$vdir" -type f`가 archive/도 검사 → 통합모델의
  archive=candidate가 CI FAIL). flat dir의 "모든 파일 manifest 등록" 검사는 그대로 유지. 검증: archive/에
  미등록 파일이 있어도 CI pass, flat에 미등록 파일이 있으면 CI fail.
- **AC-2 (2-1 adopt 강제 gate)**: design phase close 시 **채택 artifact가 flat + manifest에 실재**함을
  결정적으로 검증(없으면 BLOCK) — "deliverable이 claude-hosted/archive에만 남고 flat 미승격"인 silent
  미adopt를 차단. 메커니즘은 dev 판단(기존 `close_gate` 아이템 추가 / `pre-phase-gate-guard` 확장 중
  T-248 doctrine + 기존 close-gate 패턴에 정합하는 쪽). 최소 불변식: "design phase를 채택 artifact 0개로
  닫을 수 없다"(manifest에 flat-resolved adopted 엔트리 ≥1 — 디자인 산출물 kind 기준).
- **AC-3 (fail-safe)**: hook은 다른 productune 훅과 동일하게 **fail-open**(jq/의존성 부재·비-productune·
  비-design 컨텍스트에서 무해 통과, 무관 세션 brick 금지). non-design phase 전환엔 미발화.

## Out of scope
- candidate 자동 archive sweep(로컬 cadence 영역, CI auto-mutate 금지 — QA 확인사항). artifact 뷰어 핀 로직.

## Plan
dev: (1) check-artifact-manifest.sh archive/ exclude(`find ... -path '*/archive/*' -prune` 등). (2) design
close-gate 검증 — close_gate 생성기/`pre-phase-gate-guard`에 design-phase adopted-artifact 존재 체크 추가
(T-248 doctrine 기준 "design 산출물 kind ≥1 adopted"). fail-open 가드. QA grill(특히 fail-open + 무관세션
무해 + flat/archive 검사 경계).

## Outcome
shipped — 2파일: `scripts/ci/check-artifact-manifest.sh`(archive/ prune, AC-1) + `packages/core/scripts/hooks/pre-phase-gate-guard.sh` **G7**(design close 시 채택 design artifact flat+manifest+on-disk 실재 ≥1 검증, 없으면 BLOCK; AC-2). dev impl → QA grill: loop1 FAIL(AC-3 fail-open hole — malformed manifest fail-CLOSE) → dev fix(`jq -e . $MANIFEST` 파싱가능 pre-check → unparseable=skip/pass) → loop2 PASS. fail-open(jq absent·non-productune·non-design·corrupt manifest 전부 무해통과), no auto-mutate(block만).
**follow-up(비블로커, QA acceptable-with-followup):** G7이 design-deliverable kind set `{mockup,wireframe,design-system,spec}`를 bash에 하드코딩 — doctrine `artifact-manifest-schema.md`에 이 분류를 SoT로 선언 + hook이 참조하도록 하면 drift 방지. → backlog.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-developer | impl (2 files) | sonnet | done (loop2 — fail-open hole self-fixed on QA feedback) |
| pdt-qa | grill (+exec fixtures) | sonnet | loop1 FAIL(AC-3 malformed-manifest) → loop2 PASS |
