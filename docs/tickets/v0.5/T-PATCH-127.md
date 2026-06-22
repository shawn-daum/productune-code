---
ticket_id: T-PATCH-127
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: skipped
qa_loops: 0
slug: settings-no-default-highlight
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-127 — 설정 탭 기본 하이라이트 제거

## §1. Request

shawn (대화, 2026-06-12): 설정 탭 클릭하면 기본으로 '일반'이 하이라이트돼 있음. 기본으로 아무것도 하이라이트 안 되게.

근거: `SettingsView` 의 `activeTab` 기본값이 `'general'`. mount 시 자동으로 콘텐츠를 열지는 않고(`handleTabClick` 은 클릭에만 발동) 하이라이트만 표시됨 → 기본값을 비우면 하이라이트만 사라지고 동작 영향 없음.

## §2. Acceptance

- BDD-1: Given 설정 진입 직후 / Then 사이드바 4개 탭(일반/작업흐름/MCP/Hooks) 중 어느 것도 active 스타일(`tabBtnActive`)이 아니다.
- BDD-2: Given 탭 하나 클릭 / Then 해당 탭만 하이라이트 + 메인 페인에 콘텐츠 오픈(기존 동작 유지).
- BDD-3: `aria-selected` 가 진입 직후 전부 `false`.

## §3. Plan

`packages/gui/src/components/workspace/SettingsView.tsx`:
- `useState<SettingsSubTab>('general')` → `useState<SettingsSubTab | null>(null)`.
- 타입/비교부(`activeTab === tab.id`)는 null 안전하므로 그대로 동작. 타입만 `| null` 확장.

## §4. Outcome

`packages/gui/src/components/workspace/SettingsView.tsx` (~L19):

```
const [activeTab, setActiveTab] = useState<SettingsSubTab>('general')
→ const [activeTab, setActiveTab] = useState<SettingsSubTab | null>(null)
```

설계 노트:
- 기본값 `null` → 진입 직후 어느 탭도 `activeTab === tab.id` 미충족 → `tabBtnActive` 미적용 (BDD-1) + `aria-selected={activeTab === tab.id}` 전부 `false` (BDD-3).
- 타입을 `SettingsSubTab | null` 로 확장 — `setActiveTab(id)`(id: SettingsSubTab) 는 union 의 부분집합이라 타입 OK. 비교부 `activeTab === tab.id` 는 `null === 'general'` 등으로 null 안전.
- `handleTabClick` 무변경 — 클릭 시 `setActiveTab(id)` + `openTab(...)` 그대로 → 클릭 동작/콘텐츠 오픈 불변 (BDD-2).

BDD 매핑: BDD-1 → 기본 null 로 active 스타일 없음. BDD-2 → handleTabClick 불변. BDD-3 → 진입 직후 aria-selected 전부 false.

Self-verify (Electron headless 불가 → 정적+타입 검증):
- `pnpm exec tsc --noEmit` → PASS (union 확장 타입 충돌 없음). `pnpm run build` → PASS.
- React 규칙: hook 갯수/순서 불변(useState 한 개, 기본값만 변경). 신규 hook/effect 없음.

User hands-on 필요: 설정 진입 시 4개 탭 중 어느 것도 하이라이트 안 됨 + 탭 클릭 시 정상 하이라이트/콘텐츠 오픈 확인.

Deviation: 없음. plan 그대로.
