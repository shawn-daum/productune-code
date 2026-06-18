---
ticket_id: T-PATCH-208
version: v0.5
slug: frontmatter-lint-absolute-path-bypass
title: 티켓 status enum drift 근본원인 — pre-frontmatter-lint 절대경로 우회 버그 수정
type: bugfix
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: ci-enforcement
created_at: 2026-06-18T00:00:00Z
---

## 배경 / 목적

티켓 `status`가 canonical enum(`todo | in-progress | review | user-verify | done |
blocked | abandoned`)을 벗어난 값(`pending`, `backlog`)으로 반복 오염 → dogfood에서
사용자가 "규칙 맞냐, 왜 자꾸 생기냐, 사람이 dropdown 고르듯 한정 못 하나"로 발견.

### 진짜 근본원인 (2026-06-18 확정)
사용자가 원한 "쓰기 전 한정값 강제(dropdown)" 가드는 **이미 구현·등록돼 있었다**:
- `packages/core/scripts/hooks/pre-frontmatter-lint.sh` — PreToolUse(Write|Edit|Bash),
  status/qa_status를 enum과 대조해 **exit 2로 차단** + 허용값 출력. settings.json +
  install.sh에 등록됨. enum SoT = `config/ticket-status-enum.json`.
- **그런데 Write/Edit 채널의 path 매처에 버그**: `[[ "$FILE_PATH" == docs/tickets/*/T-*.md ]]`.
  leading `/` strip 후 절대경로는 `Users/.../docs/tickets/...`가 되어 이 glob과
  불일치 → **exit 0(통과)**. **Write 도구는 항상 절대경로**를 쓰므로 가드가
  Write/Edit에서 단 한 번도 안 터졌다. (Bash 채널은 grep anywhere라 작동.)

실측: 절대경로+`pending` → exit 0(통과·가드무력) / 상대경로+`pending` → exit 2(차단).
→ 절대경로로 `pending`/`backlog`를 써도 조용히 통과 = drift의 원인.

## 수정 (이 티켓에서 적용)

`pre-frontmatter-lint.sh` Write/Edit 매처를 절대경로도 매칭하게:
```
[[ "$FILE_PATH" == docs/tickets/*/T-*.md || "$FILE_PATH" == */docs/tickets/*/T-*.md ]] || exit 0
```

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `packages/core/scripts/hooks/pre-frontmatter-lint.sh` | Write/Edit path 매처에 `*/docs/tickets/*/T-*.md` arm 추가 (절대경로 우회 차단) |

## Acceptance Criteria

- **AC-1**: 절대경로로 비-enum status(`pending`/`backlog`)를 Write/Edit하면 exit 2로 차단된다. ✓ (절대경로+pending → exit 2 확인)
- **AC-2**: 절대경로+valid status(`user-verify`)는 통과. ✓
- **AC-3**: 상대경로·Bash 채널 기존 동작 회귀 없음. ✓ (bash -n OK)
- **AC-4**: 라이브 확인 — 수정 직후 본 티켓(208) Write가 `qa_status: na`(qa enum 밖)로 실제 차단됨 → 가드가 절대경로 Write에서 작동함을 입증.
- **AC-5**: (별건 정정) T-PATCH-192 `backlog`→`todo`, 207 `pending`→`todo`, 199~205 `in-progress`→`user-verify`.

## 비고

- 사용자 직관("dropdown처럼 한정 선택")이 정확 — 그 메커니즘은 PreToolUse 차단 훅으로
  이미 존재했고 절대경로 매칭 버그로 무력화돼 있었다. 1줄로 복구.
- settings.json이 repo 경로 훅을 직접 가리켜 즉시 라이브.
- **잔존 정리 필요**: 같은 버그로 통과했던 `qa_status: na`(enum 밖; 예 204/206/204대) —
  qa_status는 `pending|pass|fail`만 유효. 별도 sweep로 정정(이 티켓 후속).
- 후속 후보: `check-ticket-frontmatter.sh`(CI lint)도 CI 워크플로 연결 — 현재 .github엔
  fresh-install-smoke만. 이중 안전망 백로그.
