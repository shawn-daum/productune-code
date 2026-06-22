---
ticket_id: T-PATCH-233
version: v0.5
slug: legacy-type-migration
title: v0.5 티켓 legacy type → 9-canon 마이그레이션 + pre-frontmatter-lint type WARN→BLOCK 승격
type: refactor
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: state-integrity
estimated_complexity: L3
risk_flags: [mass-file-edit, false-block-risk]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-233: legacy type 마이그레이션 + lint BLOCK 승격

## Request

T-PATCH-224 D 가드는 ticket `type`을 **WARN(non-block)**으로만 검사한다.
이유: v0.5 티켓 187/249개가 legacy type(`build`·`code`·`feature`·`fix`·`bug`·
`bugfix`·`patch`·`chore`·`feat`·`chore/bugfix`)이라 hard-block 시 AC-6 false-block
대량 발생. BLOCK 승격 선행 조건 = **전 티켓 9-canon 매핑 + 파일 일괄 수정**.

legacy 분포(T-PATCH-224 dev 조사):
`build`(57) `code`(43) `feature`(33) `fix`(18) `bug`(15) `bugfix`(8) `patch`(7)
`chore`(4) `feat`(1) `chore/bugfix`(1) — 총 187개.

## 선행 조건 (착수 전 결정 필요)

매핑표 확정이 선행 조건이다. 제안 매핑(착수 시 PO/developer 합의 후 확정):

| legacy | 9-canon 후보 | 비고 |
|--------|-------------|------|
| build | impl | 빌드 파이프라인 변경은 impl로 분류 |
| code | impl | 코드 변경 일반 → impl; 순수 리팩이면 refactor 고려 |
| feature | impl | 신기능 구현 → impl; design 산출물 동반이면 design |
| fix | impl | 버그픽스 구현 → impl (test면 test) |
| bug | impl | 위 동일 |
| bugfix | impl | 위 동일 |
| patch | impl | 패치 → impl |
| chore | refactor | 비기능 정리 → refactor |
| feat | impl | feature 약어 |
| chore/bugfix | refactor | 복합 → 주 성격으로 단일 canon 선택 |

**착수 전 PO/designer와 매핑표 리뷰 필수.** legacy 티켓 중 소수는 `design`·`test`·
`docs`·`doctrine`으로 재분류가 맞을 수 있다(개별 판단 필요).

## Acceptance

- **AC-1**: 매핑표 확정 및 docs 기록(별도 `.md` 또는 티켓 본문 업데이트).
- **AC-2**: v0.4·v0.5 전 티켓(`docs/tickets/v0.4/**/*.md` + `v0.5/**/*.md`)의 `type`이
  9-canon(`design|impl|refactor|test|qa|deploy|close|docs|doctrine`) 중 하나.
  legacy type 잔존 0.
- **AC-3**: 마이그레이션 완료 후 `pre-frontmatter-lint.sh`의 type 검사를
  **WARN → BLOCK(exit 2)으로 승격**.
- **AC-4**: 승격 직후 티켓 전수 lint 재검증 — false-block **0**.
- **AC-5**: 정상 신규 티켓 write(올바른 canon type) false-block **0**.

## Out of scope

- 9-canon 외의 frontmatter 필드 값 수정(이 티켓은 `type`만).
- v0.3 이하 티켓 소급(범위 밖, 필요 시 별도).
- ticket 내용(본문) 수정.
- pre-frontmatter-lint의 다른 채널(Bash) 개선 → T-PATCH-234.

## 의존성

- T-PATCH-224 D 가드 live(**완료**) — 이 티켓의 BLOCK 승격 타깃.
- 매핑표 PO 결정 필요(blocking).

## Outcome (2026-06-22, close)

- **AC-1/AC-2 달성**: 매핑 확정(build/code/feature/fix/bug/bugfix/patch/feat/chore-bugfix→impl,
  design+impl→impl, doctrine-update→doctrine, chore 4건 개별판단) + 전 버전 티켓 196개 type
  9-canon 마이그레이션 완료. completeness gate clean(잔존 legacy 0). QA GRILL 검증.
- **AC-3/AC-4/AC-5 이월 → T-PATCH-237**: WARN→BLOCK flip은 독립 GRILL이 extraction-asymmetry
  잡아 revert(user 결정 안 A). 훅이 `^[[:space:]]*type:`를 본문까지 매치 → 본문 TS 코드
  (`type === …` 등 14곳/9티켓)가 BLOCK 시 false-block. 코드라 중화 불가 → 근본 fix=frontmatter-scope
  추출이 선행. T-PATCH-237이 그 위에서 안전 BLOCK까지 담당.
- 결론: 마이그레이션(비가역 bulk) done · flip은 훅 하드닝 선행 필요로 T-237 분리.
