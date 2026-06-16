---
ticket_id: T-PATCH-173
version: v0.5
slug: statusbar-usage-bars-and-cleanup
title: usage bars(5h/7d)를 하단 StatusBar에 가로 배치 + 좌하단 project 버튼 제거
type: code
status: todo
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: statusbar
risk_flags: [design-needed]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-173: StatusBar usage bars + 정리

## 요청 (user)
1. **usage/reset bars(5h / 7d, reset % + remaining)를 하단 StatusBar에 가로로 배치.** 현재 composer 위(UsageBar)에 세로 2줄 → StatusBar로 옮겨 가로 컴팩트.
2. **좌하단 `paepyeong ⌄` project 버튼 제거** — 굳이 필요 없음.

## 현 상태
- UsageBar(5h/7d) = composer 상단 영역 추정(UsageBar.tsx / usageWatch). StatusBar.tsx 우측은 T-159 BuildSegment, 좌측은 project name dropdown(recents).
- StatusBar 높이 28px — usage bars 가로 배치 시 컴팩트화 필요.

## Fix
1. UsageBar(5h/7d 게이지)를 StatusBar 안(좌/중앙 클러스터)에 **가로** 렌더로 이전 — 게이지 축소(인라인). 기존 usageWatch 데이터 그대로.
2. StatusBar 좌측 `project ⌄`(paepyeong) 제거. ⚠️ project 표시/전환 affordance 상실 주의 — project 전환은 File>Open/EntryGate로 가능하니 OK인지 designer 확인(전환 경로 유지 확인). 단순 표시만 남길지/완전 제거할지 결정.
3. StatusBar 레이아웃: [usage bars] ··· [BuildSegment(T-159)] 가로 정렬, 28px 톤 유지(필요시 약간 상향).

## Acceptance
- AC-1: 5h/7d usage bars가 StatusBar에 가로로 표시(composer 위 영역 제거).
- AC-2: 좌하단 project 버튼 제거(또는 표시-only). project 전환 경로 유지.
- AC-3: BuildSegment(T-159)와 공존, 레이아웃 안 깨짐. build PASS.

## Note
- design-first: StatusBar 28px에 usage bars + Build 동시 수용 레이아웃은 designer가 확정.
