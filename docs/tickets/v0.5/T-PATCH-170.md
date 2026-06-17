---
ticket_id: T-PATCH-170
version: v0.5
slug: subagent-cost-attribution
title: 비용 아카이브에 PO만 나옴 — subagent 비용 미기록 (Agent 도구 디스패치 ≠ Bash post-delegate 훅)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: cost-archive
risk_flags: [po-runner, cost-logging, needs-stream-spec]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-170: subagent 비용 귀속

## 증상
비용 아카이브에 `pdt-po (main)` 만 표시, designer/dev/qa 비용 0.

## Root (확정)
`turns.jsonl`(비용 소스) 2-scope (스키마 주석):
- `scope="main"` — PO 누적 USD, **statusline 훅**.
- `scope="subagent"` — per-dispatch token+cost, **post-delegate-state-write 훅**.
그런데 post-delegate-state-write 훅 매처 = **PostToolUse(Bash)**. GUI의 PO는 subagent를 **Agent 도구**로 디스패치(Bash `claude --agent` 아님) → 훅 미발화 → **scope=subagent 항목 0** → main(PO)만 집계됨. (T-158 Task→Agent, post-delegate SID 미기록과 동일 클래스 — 훅이 Bash 디스패치 가정.)

## Fix (택1, 실측 후)
- **(A) po-runner가 subagent 비용을 스트림에서 캡처** → `scope=subagent` turns.jsonl 항목 직접 기록. Agent/Task tool_result 또는 sidechain usage 이벤트(T-165/166 sidechain 파싱과 연계)에서 per-subagent usage(in/out/cache) 추출 → persona=subagent_type, cost 계산해 append. (po-runner가 이미 turns.jsonl 쓰는지 확인 — 아니면 신규 writer.)
- **(B) PostToolUse 훅 매처를 Agent/Task 도구로 확장** — Bash뿐 아니라 Agent tool_use 후에도 fire. 단 훅은 도구 input/result에서 usage를 못 볼 수 있음(stream만 가짐) → (A)가 더 신뢰.
- 권장 (A): usage가 스트림에 있으므로 po-runner가 1차. 실측 1턴 덤프로 subagent usage 이벤트 형태(sidechain) 확인 후 구현. blind 금지.

## Acceptance
- AC-1: designer/dev/qa 위임 시 그 비용이 persona별로 비용 아카이브에 집계됨(PO만 아님).
- AC-2: scope=subagent turns.jsonl 항목이 per-dispatch persona+usage+cost로 기록.
- AC-3: main(PO) 집계 회귀 없음. build PASS + hands-on(위임 1턴 후 아카이브 확인).

## Note
- T-169(레이아웃)와 짝 — 170이 데이터 채우면 169 뷰에 persona별 행 자동 표시.
- 실측 의존(sidechain usage 이벤트 형태) — T-165/166과 같은 stream-spec 클래스.
