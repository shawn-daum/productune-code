---
ticket_id: T-PATCH-125
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L2
qa_status: skipped
qa_loops: 0
slug: open-folder-slug-fallback
area_tags: [gui/electron]
created_at: 2026-06-12
---

# T-PATCH-125 — File>Open 프로젝트명 누락 + 새로고침 시 시작화면 복귀

## §1. Request

shawn (대화, 2026-06-12): GUI 상단바 File>Open Project 로 oh-my-eyes 열면 ① 상단바에 로고만 뜨고 프로젝트명 안 나옴 ② 새로고침(Cmd+R) 시 WorkspaceShell 이 아니라 HomeView(시작화면)로 돌아감. 최근 프로젝트 열기 경로는 정상.

근본원인: `dialog:openFolder`(및 `project:openKnownDir`)는 recents 추가 시 `detect.config?.slug ?? path.basename(dir)` fallback 을 주지만, **렌더러로 반환하는 `config` 객체엔 fallback 을 적용 안 함**. oh-my-eyes `.productune/config.json` 에는 top-level `slug` 필드가 없어(`schema_v:4`, `surfaces` 만) `result.config.slug === undefined`. → App.tsx 가 `setProject({ slug: undefined, ... })` → 타이틀 빈칸 + localStorage 직렬화 시 slug drop → 새로고침 lazy-init 의 `saved?.slug` 가드 미충족 → HomeView 로 폴백. recents 경로는 basename fallback("oh-my-eyes")이 저장돼 멀쩡.

## §2. Acceptance

- BDD-1: Given config.json 에 `slug` 가 없는 프로젝트를 File>Open 으로 / When 연다 / Then 상단바에 폴더 basename(예: `oh-my-eyes`)이 프로젝트명으로 표시된다.
- BDD-2: Given 위 상태에서 / When 새로고침(Cmd+R) / Then 시작화면이 아니라 동일 프로젝트의 WorkspaceShell 이 그대로 복원된다.
- BDD-3: `dialog:openFolder` 와 `project:openKnownDir` 의 `kind:'self'` 반환 config 의 `slug` 가 항상 truthy (`config.slug ?? path.basename(dir)`).
- BDD-4: 기존 slug 보유 프로젝트는 동작 불변(basename 으로 덮어쓰지 않음 — 기존 slug 우선).

## §3. Out of scope

- oh-my-eyes 리포의 config.json 에 `slug` 추가(별도 리포 데이터 수정 — 권장은 하되 본 티켓 범위 아님).
- config schema 에 slug 필수화 / 마이그레이션.

## §4. Plan

`packages/gui/electron/ipc/project.ts` — `dialog:openFolder` 핸들러(약 327줄)와 `project:openKnownDir` 핸들러(약 365줄)의 `self-current` 반환부:
- `return { kind: 'self', dir, config: detect.config }` → `config` 의 slug 를 basename 으로 보정해서 반환. 예: `const cfg = { ...detect.config, slug: detect.config?.slug ?? path.basename(dir) }` 후 `config: cfg`.
- `self-healable` 의 `healed` 경로도 동일 보정(이미 `healed.slug ?? basename` 으로 recents 추가하므로 반환 config 도 맞춤).
- App.tsx 쪽은 변경 불필요(IPC 가 항상 truthy slug 반환하면 해결). 단 방어적으로 App.tsx 의 fallback 도 검토 가능하나 SoT 는 IPC 한 곳으로.

## §5. Outcome

`packages/gui/electron/ipc/project.ts` 두 핸들러의 `self-current` 반환부에 basename fallback 을 반환 config 에도 적용 — recents 에만 있던 fallback 을 렌더러 반환 config 로 미러링.

- `dialog:openFolder` (~L323-339): `self-current` 분기에서 `const cfg = { ...detect.config, slug: detect.config?.slug ?? path.basename(dir) }` 후 `addToRecents(dir, cfg.slug)` + `return { kind:'self', dir, config: cfg }`. `self-healable`(heal 성공) 분기도 동일하게 `const cfg = { ...healed, slug: healed.slug ?? path.basename(dir) }` 후 `config: cfg` 반환.
- `project:openKnownDir` (~L361-376): 위와 동일한 두 분기 보정(`self-current` + `self-healable` heal 성공).

설계 노트:
- `detect.config?.slug ?? path.basename(dir)` 순서로 **기존 slug 우선**(truthy slug 보유 프로젝트는 basename 으로 덮어쓰지 않음) → BDD-4 충족. `??` 는 `null`/`undefined` 만 fallback, 빈 slug 가 아닌 정상 slug 는 그대로 통과.
- recents 추가도 같은 `cfg.slug` 를 쓰도록 통일(이전엔 인라인 표현식 중복) → recents/반환 config slug 가 항상 일치.
- App.tsx 무변경(SoT 를 IPC 한 곳으로 유지) — IPC 가 항상 truthy slug 를 반환하므로 타이틀바 표시(BDD-1) + Cmd+R lazy-init `saved?.slug` 가드 통과로 WorkspaceShell 복원(BDD-2) 자동 해결.

BDD 매핑: BDD-1/2 → 반환 config slug 가 항상 truthy(타이틀+새로고침 복원). BDD-3 → 두 핸들러 self-current 반환 config.slug = `config.slug ?? basename`. BDD-4 → `??` 우선순위로 기존 slug 보존.

Self-verify (Electron headless 불가 → 정적+타입 검증):
- `pnpm exec tsc --noEmit` (gui, src+electron 단일 tsconfig) → PASS (exit 0, 무출력).
- `pnpm run build` (locale-keys + locale-protected + tsc + vite renderer + electron main/preload) → PASS (exit 0). main.js/preload.js 정상 번들.
- 논리 검증: `??` 로 기존 slug 보존 + null/undefined 시 basename. oh-my-eyes(`schema_v:4`, top-level slug 없음) 케이스 → `detect.config?.slug === undefined` → basename `oh-my-eyes` 반환 확인.

User hands-on 필요: File>Open 으로 slug 없는 프로젝트(oh-my-eyes) 열어 ① 타이틀바에 `oh-my-eyes` 표시 ② Cmd+R 후 WorkspaceShell 복원 확인.

Deviation: 없음. plan 의 spread+`??` 방식 그대로. recents 추가 인자를 `cfg.slug` 로 통일한 것은 동일 값의 중복 제거(동작 불변).
