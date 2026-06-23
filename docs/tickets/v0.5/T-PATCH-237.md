---
ticket_id: T-PATCH-237
version: v0.5
slug: frontmatter-scoped-lint-extraction
title: pre-frontmatter-lint frontmatter-scope 추출 + type WARN→BLOCK flip (T-233 후속)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
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
  스코프 제한**.
  - **Write**: 전체 content에서 line-1 앵커(`content[0:3]=='---'`)된 첫 `---`…`---`
    슬라이스만 lint. `---` 블록 없으면 PASS.
  - **Edit (확정 = 디스크-read + FM-diff 게이팅, B)**: snippet의 `---` 유무로 판정 금지.
    on-disk frontmatter를 읽되 **Edit가 frontmatter를 실제로 바꿀 때만 검사**:
    on-disk content에 old→new 치환 적용 → 적용後 FM 슬라이스(`FM_after`)와 적용前
    FM 슬라이스(`FM_before`) 비교. **같으면(본문 전용 편집) PASS**(frontmatter 무책임),
    다르면 `FM_after`를 검사(bad → BLOCK). file_path 읽기 실패 → PASS(cardinal).
    → 본문 편집이 legacy qa_status/type로 false-block 되는 회귀(post-impl GRILL #5)
    제거하면서 frontmatter 변경은 여전히 게이트.
- **AC-2**: 14개 본문줄(T-PATCH-233 grill §1: T-P4-020:201/597, T-P4-044:169,
  T-P4-116:130/210, T-P4-046:107, T-P4-023:776, T-P4-119:416, T-P4-112:332/373/938/980,
  T-PATCH-166:37, T-PATCH-086:81)을 Edit해도 rc0(no false-block) — 코드 원형 보존.
  **필수 테스트**: 본문 `---` 수평선 + 다음 줄 `type: feature` 코드를 포함하는 Edit
  new_string → rc0 (axis-1 trap; 이 케이스가 Edit 규칙의 정오를 가름).
- **AC-3**: type WARN→BLOCK flip(**양 채널 진짜 BLOCK**). 신규 티켓 bad type → BLOCK,
  9-canon → PASS, status/qa_status/version 무회귀.
  - **Bash (확정 = BLOCK)**: WARN 유지 금지 — PostToolUse verify가 status/qa_status만
    보고 type은 안 봐서(plan-grill 입증) WARN이면 heredoc/sed로 bad type 우회 가능.
    기존 Bash 암(L363-376)의 보수적 리터럴 type 감지를 WARN→exit2로 승격
    (shell-expansion `type: $X` → PASS 안전장치 유지).
- **AC-4 (재스코프)**: 훅 헤더엔 col-0 `^type:` self-check 커맨드가 **없음**(이미
  `^[[:space:]]*type:`로 맞음 — plan-grill 정정). 따라서 훅 변경 불요. 대신 frontmatter-
  scope가 canonical 검사임을 훅 헤더 주석에 1줄 명시 + 이 col-0 오해를 낳은 prose 정정.
  (no-op으로 falsely-close 금지.)
- **AC-5**: 독립 QA GRILL(load-bearing 게이트 — false-block/false-negative 양방향 +
  전 코퍼스 무회귀, CRLF·leading-blank-line·본문 `---`·multi-doc 엣지 포함). dev
  self-test만으로 close 금지.
  - **AC-5 핵심(B 회귀 닫힘 입증 필수)**: 전 코퍼스(384) **Edit(본문 no-op)** 회귀 = HEAD
    대비 0 신규 block(특히 v0.4 legacy qa_status 75개 본문 Edit → rc0). frontmatter를
    실제 바꾸는 Edit(bad type/qa_status/status/version)는 여전히 BLOCK 입증.

## 참고

- 선행 완료: T-233 마이그레이션(전 티켓 frontmatter type = 9-canon, clean).
- backlog "T-PATCH-233 follow-up, 훅 한계" 항목이 이 티켓으로 해소됨.
- 별개 잔여(out of scope): v0.4 일부 티켓 whole-file write가 pre-existing
  `qa_status: "ready"` legacy enum으로 BLOCK(T-233 grill aside) — v0.4 status 정리 부채.
