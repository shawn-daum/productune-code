# T-P4-024 Settings — 작업 흐름 규칙 패널 구현 계획

**Created**: 2026-05-07  **Status**: impl-ready  **Ticket**: T-P4-024

---

## 1. 4 토글 + 2 텍스트 + display + Phase 5 lock 명세

| 필드 | 타입 | 기본값 | UI 라벨 (ko) | UI 라벨 (en) | 비고 |
|---|---|---|---|---|---|
| `useDevBranch` | boolean | false | 검증용 중간 환경 사용 | Use intermediate verification environment | 토글 |
| `useStagingEnv` | boolean | false | 외부 점검 환경 사용 (출시 후) | Use external review environment (post-launch) | 토글 |
| `featureBranchPrefix` | text | "feature" | 기능 작업 prefix | Feature work prefix | 텍스트 입력 |
| `fixBranchPrefix` | text | "fix" | 수정 작업 prefix | Fix work prefix | 텍스트 입력 |
| `protectedBranches` | derived | — | 보호된 환경 목록 | Protected environments | display only, `getProtectedBranches()` |
| `autosaveTriggers` | Phase 5 lock | — | Phase 5 에서 지원 예정 | Supported in Phase 5 | 회색 + lock chip |

**`getProtectedBranches(rules)` 규칙**:
- `useDevBranch=false` → `["main"]`
- `useDevBranch=true` → `["main", "dev"]`

---

## 2. `rules.ts` API (`packages/core/src/git-workflow/rules.ts`)

```typescript
export interface GitRules {
  useDevBranch: boolean
  useStagingEnv: boolean
  featureBranchPrefix: string
  fixBranchPrefix: string
}

// 저장 대상: <projectDir>/.productune/git-rules.json
export function loadRules(projectDir: string): GitRules
export function saveRules(projectDir: string, rules: GitRules): void   // atomic tmp+rename
export function getDefault(): GitRules                                  // ~/.productune/git-rules.default.json r/w
export function getProtectedBranches(rules: GitRules): string[]        // derive only
```

**캐시 전략**: 모듈 레벨 `Map<string, GitRules>` — `saveRules` 호출 시 해당 key 제거.

---

## 3. `WorkflowRulesPanel.tsx` 컴포넌트 구조

위치: `packages/gui/src/components/workspace/WorkflowRulesPanel.tsx`

```
WorkflowRulesPanel
  ├── Section header: "작업 흐름 규칙" / "Workflow Rules"
  ├── ToggleRow: useDevBranch
  ├── ToggleRow: useStagingEnv
  ├── TextRow: featureBranchPrefix
  ├── TextRow: fixBranchPrefix
  ├── DisplayRow: protectedBranches (read-only chips)
  └── LockedRow: autosaveTriggers (Phase 5 lock chip)
```

**저장 흐름**:
1. 토글/텍스트 변경 → local state 업데이트
2. `saveRules` IPC 호출 (atomic)
3. 성공 → status bar toast "다음 작업부터 적용됩니다" 1.5s
4. 실패 → 인라인 에러 + [다시 시도] CTA

---

## 4. Settings 탭 통합 frame — LanguageSettings 흡수 방식

현재: `LeftSidebar.tsx` 의 `activeIcon === 'settings'` 분기 → `<LanguageSettings />` 직접 노출

변경 후:
```
LeftSidebar
  └── activeIcon === 'settings'
        └── SettingsView (새 컴포넌트)
              ├── sub-tab list: ["작업 흐름 규칙", "Language / 언어"]
              ├── activeSubTab === 'workflow' → WorkflowRulesPanel
              └── activeSubTab === 'language' → LanguageSettings (위치만 이동, 기능 동일)
```

`SettingsView.tsx` 위치: `packages/gui/src/components/workspace/SettingsView.tsx`

sub-tab 구조는 단순 state (string enum) — 추후 T-P4-048 통합 시 tab 배열에 push만 하면 확장됨.

---

## 5. IPC 추가 (`electron/main.ts`, `electron/preload.ts`)

| IPC channel | 방향 | 역할 |
|---|---|---|
| `settings:loadRules` | renderer→main | `loadRules(projectDir)` 호출 |
| `settings:saveRules` | renderer→main | `saveRules(projectDir, rules)` 호출 |

---

## 6. i18n 키 (`settings.workflowRules.*`)

en/ko 동시 추가. 보호어 (`dev`, `staging`, `branch`, `worktree`) 값 안에 노출 금지.
