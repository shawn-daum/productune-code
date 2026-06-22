---
ticket_id: T-PATCH-234
version: v0.5
slug: frontmatter-lint-bash-channel-parity
title: pre-frontmatter-lint Bash 채널 비대칭 해소 — version regex + type warn 추가
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: state-integrity
estimated_complexity: L1
risk_flags: [hook-change]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-234: pre-frontmatter-lint Bash 채널 비대칭 해소

## Request

T-PATCH-224 D 가드 완료 시점 deviation 기록(2026-06-22):

> "D Bash 채널 version/type 미검사 = minor (backlog)"

현재 `pre-frontmatter-lint.sh`는 두 채널을 가진다:

| 채널 | 검사 항목 |
|------|-----------|
| Write/Edit 채널 | `status` BLOCK + `qa_status` BLOCK + `version` BLOCK |
| **Bash(heredoc/sed) 채널** | `status` BLOCK + `qa_status` BLOCK (**version 미검사**, type 미검사) |

결과: PO가 Bash heredoc/sed로 `version: badval` 또는 `version: v99` 같은
규격 외 값을 쓰면 미포착. 저severity(Write/Edit이 primary 채널)이나 채널 간 정합성
원칙 위반.

## Acceptance

- **AC-1**: `pre-frontmatter-lint.sh` Bash 채널에 `version` regex 검사 추가.
  Write/Edit 채널과 동일 regex(`^v\d+(\.\d+)?(-[\w-]+)?$` 또는 legacy 예외 동일 처리).
- **AC-2**: Bash 채널에 `type` WARN(non-block) 추가 — T-PATCH-233(BLOCK 승격) 완료
  전까지는 WARN 유지, 이후 T-233과 함께 BLOCK 전환.
- **AC-3**: Bash로 `version: badval` write 시도 → **exit 2 차단** + 위반값·허용 regex 안내.
- **AC-4**: 정상 version(`version: v0.5`) Bash write false-block **0**.
- **AC-5**: 기존 Write/Edit 채널 동작 회귀 없음.

## Out of scope

- type BLOCK 승격 — T-PATCH-233 선행 후 별도(또는 T-233 일부로 처리).
- qa_status / status Bash 채널 — 이미 검사 중(이 티켓은 version/type 갭만).
- Bash 채널 외 채널 신설.

## 의존성

- T-PATCH-224 D 가드 live(**완료**) — 이 티켓은 그 연장.
- T-PATCH-233 완료 시 이 티켓의 type을 WARN→BLOCK으로 후속 전환(단순 1줄 수정).
