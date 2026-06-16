---
ticket_id: T-PATCH-159
version: v0.5
slug: gui-build-button
title: GUI Build(+Smoke) 버튼 — surfaces config 기반 직접 실행 (zero-token)
type: code
status: todo
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: gui-build-button
risk_flags: [design-needed, child-process-exec]
estimated_complexity: L4
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-159: GUI Build 버튼 (design-first)

## 동기 (user)
PO가 매번 빌드해주는 것도 아니고, 빌드 커맨드를 매번 까먹음 → GUI에 Build 버튼. config의 surfaces build 커맨드 참조.

## ★PO 설계 판단 (user "생각좀해주라"에 대한 답)

**Q: 버튼 누르면 PO가 빌드 → build에 토큰 소모?**
**A: 아니오. PO/LLM 거치지 말 것.** 빌드는 결정적 shell 커맨드(`surfaces.<s>.build`) — electron `child_process`로 **직접 실행**하면 됨. LLM 무관 → **토큰 0**. PO turn과 완전 별개의 dev-tool 액션.

**config 소스**: `.productune/config.json`의 `surfaces` (이미 존재):
- `gui.build` = "pnpm --filter @productune/gui build", `gui.smoke` = "pnpm --filter @productune/gui smoke"
- `core.build` = "pnpm --filter @productune/core build"
→ 버튼이 이걸 읽어 실행. surface가 여러 개라 **surface picker**(gui/core) 또는 "build all".

**env**: spawn `cwd = projectDir` + `process.env` 상속. 빌드 커맨드 자체가 필요한 env(.env 등)는 그 도구(pnpm 등)가 알아서 읽음 → 별도 env 배선 불필요. (특정 surface가 추가 env 필요하면 surface-config에 env 키 확장 검토 — 현재는 불요.)

**PO Log Terminal(T-P4-054 backlog)와 관계**: 빌드 출력 패널 = 로그/터미널 뷰. 이 버튼의 output 패널이 그 터미널 인프라의 선구/공유가 될 수 있음.

## Designer가 plan-first로 결정할 UX (open)
1. **버튼 위치**: status bar / 툴바 / Surfaces 패널 中. surface picker(gui/core) 형태.
2. **출력 패널**: stdout/stderr 스트리밍 표시 + running/pass/fail 상태. (어디에 — 새 탭? 하단 패널?)
3. **Smoke 버튼**: build와 같은 패턴으로 `surfaces.<s>.smoke`도 (smoke_driver 고려 — playwright-electron 등).
4. **동시 실행/취소**: 빌드 중 재클릭/취소 처리.
5. **결과 알림**: B3 OS 알림 연동 여부.

## 아키텍처 (dev, designer plan 후)
- 신규 IPC `surface:build(projectDir, surfaceKey)` (+ `surface:smoke`) → `child_process.spawn`(shell, cwd=projectDir, env 상속) → stdout/stderr 이벤트 스트리밍 → renderer 패널. **LLM 무관, 토큰 0.**
- surfaces 스키마: `qa/bookshelf/surface-config-schema.md` 참조.

## Note
- design-first: Designer가 UX(위치/패널/picker) 확정 + 티켓 spec 보강 → dev IPC/exec/패널 구현 → QA.
- 핵심 원칙(못박음): **빌드는 직접 exec, PO/토큰 경유 금지.**
