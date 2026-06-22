---
ticket_id: T-PATCH-202
version: v0.5
slug: cost-archive-per-persona-capture
title: Cost archive — per-persona 집계 복구 (dispatch --output-format json 전환)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: cost-archive
risk_flags: >
  [2026-06-18 설계 전환 — 옵션 B(트랜스크립트 기반) 채택. 원안(--output-format
  json 으로 dispatch 계약 변경)은 폐기.] 원안의 blast radius(페르소나 JSON 이
  봉투 .result 로 감싸짐 → PO 의 모든 결과 파싱 + strip + SID/persona 파싱이
  .result unwrap 필요, resume/promotion 회귀 위험)는 옵션 B 로 전부 제거된다.
  옵션 B 는 dispatch 출력을 안 바꾼다: 이미 캡처한 session_id 로 Claude Code
  세션 트랜스크립트(`~/.claude/projects/**/<SID>.jsonl`)를 find 해서 assistant
  행의 usage 를 합산하고 모델단가로 cost 를 파생한다. 잔여 리스크는 (1) 모델→단가
  표 유지보수, (2) resume 세션은 트랜스크립트가 누적이므로 session_id 별 1회만
  반영(T-PATCH-201 의 cumulative dedup 과 동일 처리) 정도로 낮음.
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

subagent 토큰-비용 캡처(`post-delegate-state-write.sh:183-277`)가 **단 한 번도
안 터졌다**(turns.jsonl subagent 행 0건). 근본 원인:

- dispatch 템플릿(`delegation.md:8`)이 `-p`(--print)만 쓰고 **`--output-format json`
  이 없다** → 출력이 텍스트 모드 → stdout 엔 페르소나가 찍은 자기 JSON
  (`{persona, session_id, summary...}`)만 있고 `total_cost_usd`/`usage`/`modelUsage`
  는 없다(이건 CLI 봉투 전용 필드).
- 그래서 캡처 python 이 `:236-237` 에서 cost·model·usage 전부 None → `sys.exit(0)`
  → append 없음. **항상 no-op.**
- SID 캡처만 되는 이유: `session_id` 는 doctrine 상 페르소나가 자기 JSON 에 직접
  넣으므로 `:54-60` 이 그걸 읽는다. 비용 필드는 페르소나 JSON 에 없다.

결과: 모든 비용이 statusline 의 `(pdt-po, main)` 으로만 기록되고 designer/dev/qa
귀속이 불가능 → cost-archive 의 persona 축이 영구히 비어있음.

---

## 설계 결정 (옵션 B — 트랜스크립트 기반, 2026-06-18 probe 확정)

dispatch 출력 포맷은 **그대로 둔다**(텍스트 `-p`). 비용은 이미 캡처한 session_id 로
Claude Code 세션 트랜스크립트에서 사후 집계한다.

probe 확정(`~/.claude/projects/**/<SID>.jsonl`):
- 파일명 = session UUID → `find ~/.claude/projects -name "<SID>.jsonl"` 결정적 매핑.
- `"type":"assistant"` 행에 `usage{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` + `model`(예 `claude-opus-4-7`) 존재.
- **cost(USD) 필드 없음** → usage × 모델단가로 파생.

| 항목 | 결정 |
|------|------|
| **캡처 위치** | `post-delegate-state-write.sh` — 이미 SID/persona 캡처하는 지점. 거기서 `find` 로 트랜스크립트 찾아 assistant 행 usage 합산. dispatch stdout 파싱은 **그대로**(페르소나 JSON 불변). |
| **dispatch 계약** | **변경 없음.** `delegation.md` 미수정. `.result` 언랩 없음. PO 결과파싱/resume/promotion/strip 무영향. |
| **resume 누적** | 트랜스크립트는 resume 시 누적 → session_id 별 **최종 누적 usage 1회만** upsert. T-PATCH-201 cumulative dedup 과 동일 철학. |
| **cost 파생** | usage 토큰 **항상** 기록. cost_usd 는 모델→단가표로 파생(단가표 한 곳 — `costArchive.ts`/공유 모듈). 모르는 모델 → 토큰만, cost_usd null. 단가 출처 `claude-api`. |
| **strip** | dispatch 출력 불변 → `post-bash-strip-cost.sh` 미수정. |

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/core/scripts/hooks/post-delegate-state-write.sh` | SID 로 트랜스크립트 find → assistant usage 합산 → `scope:'subagent'` 행(persona/model/usage/cost_usd) upsert(session_id 별 1회). 기존 SID/persona 캡처 유지. |
| `packages/gui/electron/ipc/costArchive.ts` (+ `packages/core/scripts/productune`) | 모델→단가표 + usage→cost_usd 파생 헬퍼(한 곳). T-PATCH-201 `subagent_total` 합산 분기가 이 행을 받음. |
| ~~`delegation.md`~~ | (폐기) dispatch 계약 변경 없음 — 미수정. |
| ~~`post-bash-strip-cost.sh`~~ | (폐기) 출력 불변 — 미수정. |

---

## Acceptance Criteria

- **AC-1**: dispatch 출력 포맷 불변(`delegation.md` diff 0, 페르소나 JSON stdout 그대로).
- **AC-2**: subagent 디스패치 후 SID 트랜스크립트에서 합산한 `scope:'subagent'` 행(올바른 `persona`/`model`/`usage`/`cost_usd`-or-null)이 turns.jsonl 에 기록된다(session_id 별 1회).
- **AC-3**: `cost:aggregate(by:'persona')` 와 `cost:aggregatePivot` 의 persona 축이 비어있지 않다(designer/dev/qa 등장).
- **AC-4**: 단가표에 있는 모델은 cost_usd 파생, 없는 모델은 usage 만(cost_usd null) — 크래시 없음.
- **AC-5 (회귀)**: dispatch 계약 불변 → resume/promotion/files_written/strip **자동 무영향**(스모크 확인).
- **AC-6**: T-PATCH-201 총액 산출(subagent_total 합산 + main_cumulative 세션별 최종)과 정합 — subagent 행 추가 후에도 총액 정확.

---

## 구현 주의 사항

- T-PATCH-201(누적 dedup) 이미 머지(`136dd23`) — subagent_total 합산 분기 존재.
- 트랜스크립트 경로는 프로젝트 dir 인코딩 + 타임스탬프라 비결정적 → 반드시 **파일명(SID)으로 find**, dir 추측 금지.
- assistant 행만 합산(`type:assistant`). attachment/user/system usage 혼입 주의.
- 단가표는 한 곳에만(중복 금지). 가격 변동 대비 주석 + 출처(claude-api).

## QA 노트

자동 검증 영역 큼: SID 픽스처 트랜스크립트 → usage 합산/파생 단위테스트.
실제: designer/dev/qa 디스패치 1회씩 → turns.jsonl persona 행 + cost-archive
persona 축 확인. 회귀(resume/promotion/strip)는 계약 불변이라 스모크만.
