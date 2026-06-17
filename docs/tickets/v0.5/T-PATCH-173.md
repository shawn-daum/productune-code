---
ticket_id: T-PATCH-173
version: v0.5
slug: statusbar-usage-bars-and-cleanup
title: usage bars(5h/7d)를 하단 StatusBar에 가로 배치 + 좌하단 project 버튼 제거
type: code
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
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
1. **usage/reset bars(5h / 7d)를 하단 StatusBar에 가로로 배치** — composer 위(UsageBar) 세로 2줄에서 StatusBar로 이전. (1차 작업, 커밋 완료)
2. **좌하단 `slug ⌄` project 버튼 제거.**
3. **usage bars에 "Session" 설명 라벨 추가** — 사용자가 바가 무엇인지 알 수 있게.
4. **usage bars의 reset TIME(resets in …) 다시 보이게 복원** — 1차에서 28px에 맞추려 tooltip으로 숨겼던 것을 사용자가 다시 보길 원함.

## 최종 결정 (user, 2026-06-17)
- **Fork A — project 버튼 완전 제거**: "아무 동작 안 함" → slug ⌄ 버튼 + Recent 드롭업 + 죽은 코드 전부 삭제. project 전환은 File>Open / EntryGate 경로로 유지(영향 없음).
- **Session 라벨**: clock 아이콘 + "Session"(ko "세션") muted 라벨을 5h/7d 게이지 앞에 prefix. 데이터 있을 때만 렌더(dangling 라벨 방지).
- **reset time 복원**: compact(statusbar) 모드에서도 "% · resets in Xh Ym"을 인라인 표시. 28px로 빠듯해 **StatusBar 높이 28→34px** 상향(StatusBar.tsx height + WorkspaceShell gridTemplateRows 동기). 가독성 > 컴팩트.

## Fix (구현)
1. (1차) UsageBar `statusbar` variant → StatusBar 좌측 클러스터에 가로 렌더.
2. StatusBar.tsx: slug 버튼 + Recent 드롭업 + 죽은 코드 전부 제거
   (dropdownOpen/recents/dropdownRef state, handleSlugClick/handleSelectRecent,
   outside-click useEffect, RecentEntry interface, ChevronDown import,
   slugWrap/slugBtn/sep/dropdownPanel/dropdownItem* 스타일, onOpenRecent prop).
   → onOpenRecent 전달 체인 정리: WorkspaceShell·EntryGate·App.tsx의 죽은 forward 제거
   (HomeView의 openRecent 경로는 유지).
3. UsageBar.tsx: `sessionLabel` prop 추가(StatusBar에서 i18n `workspace.statusBar.session` 주입),
   compact 모드 reset 라벨 복원("· resets in …"), `sessionLabelStyle`/`resetStyleCompact` 추가.
4. StatusBar.tsx height 28→34, WorkspaceShell gridTemplateRows status 행 28px→34px.
5. i18n: en `Session` / ko `세션` 추가(en.json·ko.json 동시).

## Acceptance
- AC-1: 5h/7d usage bars가 StatusBar에 가로로 표시(composer 위 영역 제거). ✅ (1차)
- AC-2: 좌하단 project 버튼 **완전 제거**. project 전환 경로(File>Open/EntryGate) 유지. ✅
- AC-3: usage bars에 "Session" 설명 라벨 표시. ✅
- AC-4: reset TIME이 usage bars에 인라인으로 다시 보임. ✅
- AC-5: BuildSegment(T-159)와 공존, 레이아웃 안 깨짐. build PASS(tsc + locale-key + vite). ✅

## Note
- 높이 34px는 가독성 우선 사용자 결정. statusBarVisible=false일 때는 기존대로 0px 붕괴.
