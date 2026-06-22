---
ticket_id: T-PATCH-237
version: v0.5
slug: frontmatter-scoped-lint-extraction
title: pre-frontmatter-lint frontmatter-scope 추출 + type WARN→BLOCK flip (T-233 후속)
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: state-integrity
estimated_complexity: L3
risk_flags: [hook-change, false-block-risk, load-bearing-gate]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-237: frontmatter-scope 추출 + type BLOCK flip

## Request

T-PATCH-233 후속. T-233에서 전 티켓 type을 9-canon으로 마이그레이션(196파일)했고
type을 WARN→BLOCK으로 올리려 했으나, 독립 QA GRILL이 **extraction-asymmetry**를
잡아 flip을 되돌림(user 결정 2026-06-22, 안 A):

- pre-frontmatter-lint의 필드추출(`extract_val`)이 `^[[:space:]]*type:`(들여쓰기 허용)을
  매치 → 티켓 **본문**의 들여쓰기된 `type:` 줄(대부분 TS 코드 예시)까지 검사 대상.
- completeness gate는 `^type:`(col-0)만 봐서 이 본문줄을 못 봄 = 구조적 사각.
- BLOCK 시 닫힌 옛 티켓 9개의 본문 코드영역을 targeted Edit하면 false-block.
- 본문줄 14곳은 실제 코드(`type === 'env-var'`, `'feature' | 'fix'` 등)라
  `#` 중화 불가(코드 예시 깨짐).

## 근본 원인

훅이 frontmatter 블록만 검사해야 하는데 edit 텍스트 전체에서 첫 `^\s*type:`를 잡음.
status/qa_status/version도 동일 한계를 안고 있으나 본문에 그 enum 예시가 드물어
지금까지 안 터짐(type만 본문 코드와 충돌).

## Acceptance

- **AC-1**: `extract_val`/`validate_*`를 **leading `---`…`---` frontmatter 블록으로
  스코프 제한**. Write 채널(전체 내용)은 자명. Edit/Bash 채널 snippet엔 `---` 컨텍스트가
  없으므로 — file_path의 실제 frontmatter를 읽어 판정하거나, snippet이 frontmatter를
  포함할 때만 검사하는 등 — Edit/Bash에서 본문 type 줄이 절대 false-block 안 되게.
- **AC-2**: 14개 본문줄(T-PATCH-233 grill §1: T-P4-020:201/597, T-P4-044:169,
  T-P4-116:130/210, T-P4-046:107, T-P4-023:776, T-P4-119:416, T-P4-112:332/373/938/980,
  T-PATCH-166:37, T-PATCH-086:81)을 Edit해도 rc0(no false-block) — 코드 원형 보존.
- **AC-3**: 그 위에서 type WARN→BLOCK flip(양 채널). 신규 티켓 bad type → BLOCK,
  9-canon → PASS, status/qa_status/version 무회귀.
- **AC-4**: 훅 헤더의 completeness 검증 커맨드 예시를 `^[[:space:]]*type:`로 정정
  (col-0 grep이 hook 추출과 불일치한 게 사각의 원인 — grill MUST-FIX #2).
- **AC-5**: 독립 QA GRILL(load-bearing 게이트 — false-block/false-negative 양방향 +
  전 코퍼스 무회귀). dev self-test만으로 close 금지.

## 참고

- 선행 완료: T-233 마이그레이션(전 티켓 frontmatter type = 9-canon, clean).
- backlog "T-PATCH-233 follow-up, 훅 한계" 항목이 이 티켓으로 해소됨.
- 별개 잔여(out of scope): v0.4 일부 티켓 whole-file write가 pre-existing
  `qa_status: "ready"` legacy enum으로 BLOCK(T-233 grill aside) — v0.4 status 정리 부채.
