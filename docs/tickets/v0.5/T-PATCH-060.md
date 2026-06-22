---
ticket_id: T-PATCH-060
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L1
risk_flags: search-pane-empty-state
slug: search-pane-idle-empty-state-remove
qa_status: skipped
requires_qa: false
area_tag: gui-explorer
parent_ticket: T-PATCH-049
---

# T-PATCH-060: SearchPane idle 아이콘+텍스트 제거

## Context

T-PATCH-049 후속 QA. 검색창에 검색어를 입력하기 전 idle 상태에서 Search 아이콘과 "파일 내용 검색" 텍스트가 여전히 표시됨. 사용자 요청: 제거.

## Acceptance Criteria

- [ ] AC-1: 검색어 미입력(idle) 상태에서 아이콘/텍스트 empty state 없음, 빈 영역만 표시

## Plan

**File: `packages/gui/src/components/explorer/SearchPane.tsx`**

`status === 'idle'` block 전체 제거:
```tsx
// 아래 블록 삭제
{status === 'idle' && (
  <div style={statePane}>
    <Search size={28} strokeWidth={1.5} color="#707070" />
    <h3 style={stateTitle}>{t('workspace.search.emptyTitle')}</h3>
  </div>
)}
```

사용되지 않는 import:
- `Search` icon이 검색 input 내부에도 사용 중이면 유지, idle block에서만 쓰인다면 import 제거 불필요(다른 곳에서 사용 중이므로 유지).
- `stateTitle`, `statePane` 스타일 상수는 `noresult`/`error` state에서도 사용 중이므로 유지.
