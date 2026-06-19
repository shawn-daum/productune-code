---
ticket_id: T-PATCH-217
version: v0.5
slug: package-bundle-core-doctrine
title: 패키징 앱이 packages/core(doctrine·agents)를 번들 안 함 → 온보딩 setup ENOENT
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: packaging
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
completed_at: 2026-06-19T00:00:00Z
---

# T-PATCH-217: 패키징 앱 core 번들 누락 — 온보딩 setup ENOENT

## Request

cua pristine VM(갓 산 Mac 시나리오) 검증 중 발견. 패키징된 `productune.app`을
설치 → 온보딩(언어→엔진→연결) 후 setup 단계가 실패:

```
Setup failed
ENOENT: no such file or directory, scandir
'/Applications/productune.app/Contents/Resources/core/agents'
```

근본원인 — `packages/gui/electron/ipc/onboarding.ts:290`:
```js
const coreDir = path.join(app.getAppPath(), '..', 'core')
```
- dev: `getAppPath()`=`packages/gui` → `../core`=`packages/core` ✓ (개발 중엔 가려짐)
- 패키징: `getAppPath()`=`.../Resources/app.asar` → `../core`=`.../Resources/core`
- `electron-builder.yml` `extraResources`는 `build/tray`만 담음 → `packages/core`가
  번들에 **없음** → `readdirSync(core/agents)`(onboarding.ts:308, unguarded) ENOENT.

영향: **배포 dmg를 받은 모든 사용자가 온보딩 완료 불가**(앱 사용 불가). dev에서
100% 가려지고 패키징에서만 재현되는 전형적 번들 누락. setup은 `PRODUCTUNE_REPO=coreDir`도
기록하므로(onboarding.ts:299), 런타임 PO도 coreDir의 doctrine 전체를 참조.

## 설계 방향

`electron-builder.yml extraResources`에 `packages/core`를 `Contents/Resources/core`로
번들. 런타임 불요분 제외(node_modules·.turbo·dist·src·test·.DS_Store). 결과 경로가
`app.getAppPath()/../core`와 일치해 코드 무수정으로 해소.

- 담을 것(런타임 doctrine SoT): `agents/` `doctrine/` `config/` `skills/` `migrations/`
  `README.md` (+ po-instructions는 core에 부재 → 기존 existsSync guard로 무해).
- 제외: `node_modules` `.turbo` `dist`(빌드산출, gui는 build-time에 inline) `src`(TS원본)
  `test`.
- 심볼릭링크(onboarding 303: core/agents → ~/.claude/agents)는 번들 내부를 가리키게 됨
  — dev 동작과 동일. 앱 이동/업데이트 시 링크 깨짐은 기존 설계 한계(별도 후속).

## Acceptance

- **AC-1**: Given 패키징 `productune.app`을 무결 macOS에 설치, When 온보딩을 언어→엔진→
  "Connect later in Settings"(또는 연결)로 완료, Then setup 이 ENOENT 없이 성공한다
  ("Setup failed" 미발생). (cua pristine VM 실측)
- **AC-2**: `Contents/Resources/core/agents/*.md` 가 번들에 존재하고, setup 이
  `~/.claude/agents/`에 심볼릭링크를 생성한다.
- **AC-3**: 번들에 `node_modules`/`src`/`test`/`dist` 가 들어가지 않는다(불필요 비대 방지).
- **AC-4**: dev(`electron .`) 동작 회귀 없음(coreDir가 여전히 packages/core 해석).

## Out of scope

- 앱 이동/자동업데이트 시 symlink 재생성(별도 후속).
- core/dist 런타임 필요 여부 재검토(현재 gui가 build-time inline이라 불요 가정).

## QA 노트

cua pristine VM(golden 재클론, claude 미설치)에서 패키징 앱 설치 → 온보딩 완주 →
"Setup" 성공 확인. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

---

## QA sign-off (2026-06-19, cua pristine VM 실측) — qa_status: pass

수정: `electron-builder.yml extraResources`에 `../core → core` 추가
(node_modules·dist·src·test·.DS_Store·tsconfig 제외). TS 무변경.

- **AC-1 PASS** — pristine VM(claude 미설치)에 새 빌드 설치 → 온보딩 언어→엔진→
  "Connect later in Settings" → **"Setup complete"**(이전 ENOENT "Setup failed" 해소).
- **AC-2 PASS** — `~/.claude/agents/pdt-{po,designer,developer,qa}.md` 가 번들
  `…/Resources/core/agents/*.md` 로 심볼릭링크됨. `PRODUCTUNE_REPO=…/Resources/core`.
- **AC-3 PASS** — 번들 `core/`에 node_modules·src·test·dist 미포함(22M, agents·doctrine·
  config·skills·migrations·scripts·README 포함).
- **AC-4 PASS** — smoke(playwright-electron) green = dev 경로 회귀 없음(패키징 전용 변경).

발견 경로: T-PATCH-199/216 검증 후 "패키징 새환경 점검" 요청 → cua pristine
full-onboarding 완주에서 표면화(앞선 검증은 AC-1 브라우저열림까지만 봐 미발견).
