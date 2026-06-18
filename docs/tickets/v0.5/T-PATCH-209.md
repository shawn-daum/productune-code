---
ticket_id: T-PATCH-209
version: v0.5
slug: qa-status-enum-add-skipped
title: qa_status enum에 skipped 추가 + requires_qa:false 생략 규칙 + v0.5 drift 정규화
type: docs
status: done
phase: 3
assignee: pdt-po
requires_qa: false
requires_user_gate: false
area_tag: ticket-schema
created_at: 2026-06-18T00:00:00Z
---

## 배경 / 목적

T-PATCH-208(절대경로 우회 버그)로 그동안 qa_status enum 강제가 무력화돼 광범위 drift가
누적됐음을 발견. 전 버전 분포: `ready`(59), `passed`(19), `n/a`(8), `self-verify`(7),
`skip`(4), `smoke`/`pending-live`/`todo`(2씩), `static-pass`/`shawn-visual`/
`pass-with-note`/`pass-with-issues`/`capture-on-next-occurrence`(1씩).

분석: 대부분은 기존 3개(pending/pass/fail)로 정규화 가능한 노이즈/오타지만, **"QA
대상이지만 안 함/불필요"** 는 진짜 빠진 상태(`skipped`/`skip`/`n/a`/`self-verify` 다수가
이 개념). enum을 1개만 확장한다(너무 많으면 안 됨).

## 설계 결정

1. **qa_status enum = `pending | pass | fail | skipped`** (`skipped` 1개 추가).
2. **requires_qa:false면 qa_status 생략** (값 강요 X). → `na`/`n/a` 불필요.
3. **정규화 매핑** (v0.5에만 적용 — 최근·의미 아는 것):

   | 기존 | → |
   |------|---|
   | passed / pass-with-note / smoke | pass |
   | pending-live / shawn-visual / capture-on-next-occurrence | pending |
   | self-verify | skipped |
   | (skipped) | 그대로 (이제 유효) |

4. **historical(v0.4 이하)은 손대지 않음**: `ready`(59) 등은 옛 컨벤션이라 의미 불명확 →
   블라인드 재작성이 원본보다 위험. done 티켓이라 훅(Write/Edit) 안 걸리고 lint도 미검사라
   무해. 의미 확정되면 별도 정규화(백로그).

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `packages/core/config/ticket-status-enum.json` (SoT) | qa_status에 `skipped` 추가 |
| `~/.productune/config/ticket-status-enum.json` (미러, 훅이 우선 읽음) | 동기 |
| `packages/core/doctrine/persona/designer/bookshelf/ticket-schema.md` | `qa_status ∈ pending\|pass\|fail\|skipped` + requires_qa:false→생략 명시 |
| `packages/core/scripts/hooks/pre-frontmatter-lint.sh` | 하드코딩 fallback QA_STATUS_ENUM 에 skipped (config와 parity) |
| `docs/tickets/v0.5/T-*.md` (해당분) | drift 정규화(위 매핑) |

## Acceptance Criteria

- **AC-1**: qa_status enum이 4개(`pending|pass|fail|skipped`)로 repo SoT·미러·훅 fallback·schema 문서 모두 일치.
- **AC-2**: 절대경로로 `qa_status: skipped` Write가 통과하고, 여전히 enum 밖 값(`ready` 등)은 차단된다(라이브 확인).
- **AC-3**: v0.5 drift가 매핑대로 정규화됨(enum 밖 잔존 0).
- **AC-4**: requires_qa:false 티켓은 qa_status를 생략한다(예 204/206/208/209).
- **AC-5**: historical(v0.4↓) qa_status는 의도적으로 미변경(별도 백로그).
