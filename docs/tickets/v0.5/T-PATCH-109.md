---
ticket_id: T-PATCH-109
version: v0.5
round: patch
type: feature
status: review
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pass
qa_loops: 0
slug: brand-logo-apply
area_tags: [gui/branding, gui/electron, gui/onboarding]
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-109: 신규 브랜드 로고 적용 — Electron 앱 아이콘 + 첫 시작 화면

## §1. Request

shawn (ad-hoc): 신규 브랜드 로고 — near-black(거의 검정) 배경 위의 네온 글래시(neon glassy) `{ }` 중괄호 마크 — 를 두 곳에 적용한다.

- (a) **Electron 앱 아이콘**: Dock / 작업표시줄 / 패키징된 `.app`·`.dmg` 아이콘.
- (b) **첫 시작 화면**: 최초 실행 시 `onboarding.status === 'pending'` 에서 보이는 `FreshComposer` 화면(전체화면 중앙, `#0F0F0F` 다크 배경)에 로고를 렌더.

### 자산 의존성 (BLOCKING — 최종 비주얼 게이트)

> **이 티켓의 최종 비주얼은 사용자 제공 자산에 의존한다.**
> 로고 이미지는 채팅에 붙여넣어졌을 뿐 **repo 에 파일로 존재하지 않으며**, 구현 에이전트가 채팅 이미지에서 바이너리를 추출할 수 없다.
> 따라서 본 티켓은 **배선(wiring)** 까지 구현·검증하고, **최종 비주얼은 사용자가 아래 §4 의 정확한 경로에 실제 자산을 드롭하면 자동으로 반영**되도록 한다.
> 자산이 들어오기 전에는 **기존 `build/icon.icns` (앱 아이콘) 와 placeholder (첫 화면 로고)** 로 배선을 완성·검증한다. 자산 교체만으로 코드 변경 없이 실물 로고가 적용되는 구조여야 한다.

### 현황 (조사 결과)

- `packages/gui/electron/main.ts` `createWindow()` (L125~) 의 `new BrowserWindow({...})` 에는 **`icon` 옵션이 없다.** dev 실행 시 Dock 아이콘이 브랜드 아이콘으로 강제되지 않는 상태(기본 Electron 아이콘).
- 패키징 아이콘은 `electron-builder.yml` 의 `mac.icon: build/icon.icns` 로 지정되어 있고 `build/icon.icns` 파일은 이미 존재한다. `directories.buildResources: build`.
- `build/` 에는 `icon.icns` 만 있고 **`icon.png` (1024²) 는 없다.**
- 첫 시작 화면은 `packages/gui/src/components/FreshComposer.tsx` (헤드라인 `h1` + supporting + composer, 중앙 정렬, `background: #0F0F0F`). **로고 이미지 요소가 현재 없다.** (헤드라인 위가 로고 자리.)
- `OnboardingWizard.tsx` 헤더(L143~)는 lucide `Zap` 아이콘 + `onboarding.title` 텍스트를 쓴다 — 이번 첫-화면 로고와 별개(OOS).
- vite 설정(`vite.config.ts`)에 `publicDir` override 없음 → 기본 `public/` 이 정적 자산 루트(현재 `public/` 디렉터리 없음). 렌더러 자산은 `src/` import 또는 `public/` 배치.

## §2. Acceptance

배선(wiring)은 이번 라운드에 완료한다. 최종 실물 비주얼은 사용자 자산 드롭에 게이트된다(§3).

- [x] **AC-1 (BrowserWindow icon 배선)**: `createWindow()` 의 `new BrowserWindow({...})` 에 `icon` 옵션이 추가되어, dev/non-packaged 실행에서 창·Dock 아이콘이 `build/icon.png` (없으면 `build/icon.icns`) 에서 로드된다. 경로는 `__dirname` 기준 `path.join(...)` 으로 해석하며, 파일이 없을 때 throw 하지 않고 조용히 기본 아이콘으로 폴백한다. → `resolveAppIcon()` + 조건부 스프레드 `...(appIcon ? { icon: appIcon } : {})`.
- [x] **AC-2 (electron-builder icon config)**: `electron-builder.yml` 의 `mac.icon: build/icon.icns` 유지(변경 없음). `build/icon.png` (1024×1024) 마스터가 buildResources(`build/`)에 존재하면 빌드가 소비. `dist:mac` 빌드는 본 라운드 미실행(§5 build 항목은 자산/패키징 게이트로 잔여) — 코드/설정 측 배선 완료.
- [x] **AC-3 (첫 화면 로고 렌더)**: `FreshComposer` 헤드라인(`h1`) **위**에 `import logoUrl from '../assets/logo.svg'` 를 `<img>` 로 렌더. placeholder `logo.svg` 커밋으로 레이아웃·간격 검증. (실물 비주얼은 자산 드롭에 게이트 — AC-5.)
- [x] **AC-4 (사이즈·배치·다크핏)**: `logoStyle` = `height 40 / width auto / objectFit contain / maxWidth 200 / marginBottom 20 / display block`, 부모 `alignItems: center` 로 중앙 정렬, background/border 없음. `alt="productune"` 고정 문자열(신규 i18n 키 없음 → en/ko parity 무영향).
- [ ] **AC-5 (최종 비주얼 게이트)**: 사용자가 §4 의 정확한 경로에 실물 자산을 드롭하면 **코드 변경 없이** (a) 앱 아이콘과 (b) 첫 화면 로고가 실물 브랜드 마크로 반영. — **사용자 자산 드롭 대기(잔여 의존성)**.
- [x] **AC-6 (회귀 없음)**: `createWindow` 의 `webPreferences`/`titleBarStyle`/zoom 복원 등 기존 로직 무변경(`icon` 키만 추가). `FreshComposer` send 플로우 마크업 무변경. `tsc --noEmit -p tsconfig.json` **0 errors**. (`vite build`/`dist:mac` 은 본 라운드 미실행 — full build 비요청.)

## §3. Out of scope / Dependency

**Dependency (BLOCKING 최종 비주얼):**
- 실물 로고 바이너리 자산은 **사용자 제공 입력**이다. 구현 에이전트는 채팅 이미지에서 추출 불가. 사용자가 §4 의 정확한 타깃 경로에 파일을 드롭해야 최종 비주얼이 완성된다. 그 전까지는 placeholder/기존 `icon.icns` 로 배선만 검증.

**Out of scope:**
- 자산 자체 제작/디자인(아이콘 export, `.icns` 멀티해상도 생성)은 사용자/디자인 측에서 제공. 단, `build/icon.png`(1024²) 마스터가 들어오면 `.icns` 재생성 절차는 §4 노트로만 안내.
- `OnboardingWizard` 헤더의 lucide `Zap` 아이콘 교체 — 별개 surface, 이번 범위 아님.
- ActivityBar / WorkspaceShell / StatusBar 등 본 작업공간 UI 의 로고·브랜딩.
- Windows `.ico` / Linux 아이콘 타깃(현재 `dist:mac` 만 운용). 단 `win.icon` 의 `build/icon.png` 폴백은 무해하게 동작.
- 스플래시 스크린 / 앱 부팅 애니메이션.
- favicon / `index.html` `<link rel="icon">` (Electron 렌더러라 탭 아이콘 영향 없음) — 필요 시 후속.

## §4. Implementation plan

### A. 자산 타깃 경로 (사용자가 드롭할 정확한 위치)

> 사용자는 아래 경로에 파일을 그대로 저장하면 된다. 파일명·확장자·해상도를 정확히 맞춰야 코드 변경 없이 적용된다.

| # | 경로 (repo 루트 기준) | 포맷 / 사양 | 용도 |
|:--|:--|:--|:--|
| 1 | `packages/gui/build/icon.png` | PNG, **1024×1024**, 투명 배경 권장(near-black 마크 자체는 불투명) | electron-builder 마스터 아이콘 소스 / dev BrowserWindow `icon` |
| 2 | `packages/gui/build/icon.icns` | macOS `.icns` (멀티해상도) | 패키징(`.app`/`.dmg`) 아이콘 — **이미 존재**, 신규 마크로 교체 |
| 3 | `packages/gui/src/assets/logo.svg` | SVG (우선) — 다크 배경용, 네온 글래시 `{ }` | 첫 화면(`FreshComposer`) 로고. SVG 없으면 4번 사용 |
| 4 | `packages/gui/src/assets/logo.png` | PNG, 투명 배경, 높이 ≥ 80px (2x 대비 권장 ~400×160) | 첫 화면 로고 폴백(SVG 미제공 시) |

`.icns` 재생성 노트(사용자/후속용): `build/icon.png`(1024²) 가 마스터로 들어오면 `iconutil` 또는 electron-builder 의 PNG→icns 자동 변환으로 `build/icon.icns` 를 재생성할 수 있음(절차 안내만, 본 티켓 코드 범위 아님).

### B. Electron 앱 아이콘 배선 (`packages/gui/electron/main.ts`)

- `createWindow()` 의 `new BrowserWindow({...})` 옵션에 `icon` 추가:
  - 모듈 상단(또는 함수 내)에서 아이콘 경로를 해석: `build/icon.png` 우선, 없으면 `build/icon.icns`.
  - `__dirname`(= `dist-electron/`) 기준 상대 경로로 `build/` 를 가리키도록 `path.join` 해석. dev(소스 트리)와 packaged(asar) 양쪽에서 깨지지 않게, 존재 검사(`fs.existsSync`) 후 존재하는 경로만 `icon` 에 주입.
  - 파일 부재 시 `icon` 미지정으로 폴백(throw 금지) — 자산 드롭 전에도 dev 실행이 정상 동작해야 함(AC-1).
- macOS 패키징 아이콘은 `electron-builder.yml` 의 `mac.icon` 이 담당(런타임 `icon` 옵션은 dev/Dock 보조). 기존 `mac.icon: build/icon.icns` 유지. `build/icon.png` 마스터가 buildResources(`build/`)에 존재하면 빌드 파이프라인이 소비 가능(AC-2).
- **주의(라우팅 회귀 방지)**: `webPreferences`, `titleBarStyle`, zoom 복원 등 기존 `createWindow` 로직은 손대지 않는다 — `icon` 키만 추가.

### C. 첫 화면 로고 렌더 (`packages/gui/src/components/FreshComposer.tsx`)

- 자산 import: `import logoUrl from '../assets/logo.svg'` (SVG 우선; 미제공 시 `logo.png`). vite 가 자산 URL 로 번들.
- `content` 컨테이너 안, `headline`(`h1`) **바로 위**에 로고 블록 추가:
  ```
  <img src={logoUrl} alt="productune" style={logoStyle} />
  ```
- `logoStyle` (디자인 토큰 정합):
  - `height: 40`, `width: 'auto'`, `objectFit: 'contain'`, `maxWidth: 200`,
  - `marginBottom: 20`, `display: 'block'`, 중앙 정렬(부모가 이미 `alignItems: 'center'`).
  - 다크 배경 위 네온 마크이므로 background/border 없음. (선택) `filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.25))'` 로 네온 글로우 살짝 — placeholder 단계에선 생략 가능, 자산 결정 후 미세조정.
- placeholder 단계: 자산 파일이 아직 없으면 import 가 빌드 실패를 일으키지 않도록, **placeholder `logo.svg` 를 `src/assets/` 에 임시 커밋**(단순 `{ }` 텍스트/패스 SVG)하여 배선·레이아웃을 검증. 사용자 실물 자산이 동일 경로를 덮어쓰면 자동 반영(AC-5).
- 기존 헤드라인/ supporting/ composer 마크업·send 플로우는 변경 없음(AC-6). 간격 리듬: 로고(`mb 20`) → `h1`(`mb 10`) → supporting(`mb 24`) → composer.

### D. 검증 순서
1. placeholder 자산으로 `tsc --noEmit` + `vite build` green 확인.
2. dev 실행 → 첫 화면(`pending`)에서 로고가 헤드라인 위 중앙에 40px 높이로 렌더되는지, Dock 아이콘이 `icon.png`/`icns` 로 뜨는지 확인.
3. `dist:mac` 으로 아이콘 오류 없이 `.dmg` 빌드 green 확인.
4. (사용자 단계) 실물 자산을 §4.A 경로에 드롭 → 코드 변경 없이 실물 마크 반영 확인(AC-5).

### §4.b QA-feedback (round-2)

사용자 QA 결과 두 가지 결함 확인 → 본 라운드에서 수정.

**BUG 1 — 로고가 잘못된 화면에 적용됨.** 첫 시작 화면 로고가 `FreshComposer` 에 들어갔으나, 사용자의 실제 "첫 시작 페이지" 는 런처 `packages/gui/src/views/HomeView.tsx` (lucide `Zap` 브랜드 마크 + "productune" + "phase 4 GUI MVP" + 새 프로젝트/기존 폴더/최근 항목) 이다. → `HomeView.tsx` 의 `<Zap size={48} … />` 브랜드 마크를 실물 로고 이미지로 교체: `import logoUrl from '../assets/logo.png'`(`src/views/` → `src/assets/logo.png` = `../assets/logo.png`), `<img src={logoUrl} alt="productune" />` (height 52 / width auto / objectFit contain / display block, `onError` 로 깨진 이미지 숨김). title/tagline/layout 유지, 미사용 `Zap` import 제거. `FreshComposer` 의 로고는 무해하므로 그대로 둠.

**BUG 2 — macOS Dock 아이콘이 기본 Electron 아톰.** `electron/main.ts` 의 `resolveAppIcon()` + `BrowserWindow.icon` 옵션은 macOS Dock 아이콘을 설정하지 못한다(macOS 는 `BrowserWindow.icon` 무시 — `app.dock.setIcon` 필요). → `nativeImage` 를 `electron` 에서 import; `app.whenReady` 진입부(`createWindow()` 직전)에서 darwin 일 때 `app.dock?.setIcon(nativeImage.createFromPath(iconPath))` 호출. `iconPath` 는 `resolveAppIcon()`(기존 existsSync 가드 재사용) 결과 → 자산 부재 시 throw 없음. `createFromPath` 가 빈 이미지를 반환하면(`isEmpty()`) skip. 기존 `BrowserWindow.icon` 옵션은 win/linux 용으로 유지.

> **Dock 아이콘 반영 조건**: `app.dock.setIcon` 은 런타임 Dock 타일만 갱신한다. 변경이 보이려면 사용자가 **dist-electron 을 재빌드(electron build) 후 앱을 재시작**해야 한다(dev 핫리로드로는 main 프로세스 변경이 적용되지 않음). 패키징된 `.app`/`.dmg` 의 정적 아이콘은 여전히 `electron-builder.yml` `mac.icon: build/icon.icns` 소관.

touched: `HomeView.tsx`, `electron/main.ts` (+ 본 티켓). 신규 i18n 키 없음(`alt="productune"` 리터럴) → en/ko parity 무영향. `tsc --noEmit -p tsconfig.json`(src+electron 포함) → **0 errors**. full build/`vite build`/`dist:mac` 미실행(비요청).

## §5. QA — smoke

| Area | Check |
|:--|:--|
| build | `tsc --noEmit` 0 errors; `vite build` green; `dist:mac` 아이콘 오류 없이 `.dmg` 생성 |
| app icon (dev) | dev 실행 시 Dock/창 아이콘이 `build/icon.png`(없으면 `.icns`)에서 로드; 파일 부재 시 throw 없이 기본 아이콘 폴백 (AC-1) |
| app icon (packaged) | `mac.icon: build/icon.icns` 유지, 패키징 아이콘 정상 (AC-2) |
| first page logo | `pending` 상태 첫 화면(`FreshComposer`)에서 헤드라인 위 중앙에 로고 렌더, height 40 / maxWidth 200 / objectFit contain, 다크 배경 핏 (AC-3/AC-4) |
| spacing | 로고→헤드라인 간격 20px, 기존 리듬 유지, 레이아웃 깨짐 없음 (AC-4) |
| asset swap | placeholder→실물 자산 경로 교체 시 코드 변경 없이 (a)아이콘 (b)첫화면 로고 반영 (AC-5) |
| regression | FreshComposer send 플로우 / OnboardingWizard 헤더 / EntryGate 라우팅 / 기존 패키징 영향 없음 (AC-6) |

## §6. Persona Activity

### pdt-developer — impl (status → review)

배선(wiring) 구현 완료. 자산-게이트 비주얼 항목은 사용자 자산 드롭 대기.

**Files**
- `packages/gui/electron/main.ts` — `import fs from 'fs'`; `resolveAppIcon()` 추가(`__dirname` 기준 `../build/icon.png` 우선 → `../build/icon.icns` 폴백, `fs.existsSync` 가드로 부재 시 throw 없이 `undefined`); `createWindow()` 의 `new BrowserWindow({...})` 에 조건부 `...(appIcon ? { icon: appIcon } : {})` 주입. 기존 `webPreferences`/`titleBarStyle`/zoom/close-to-tray 로직 무변경.
- `packages/gui/src/components/FreshComposer.tsx` — `import logoUrl from '../assets/logo.svg'`; `h1` 바로 위에 `<img src={logoUrl} alt="productune" style={logoStyle} onError={hide} />` 추가(`onError` 로 깨진 이미지 글리프 방지); `logoStyle`(height 40 / maxWidth 200 / objectFit contain / marginBottom 20) 추가. send 플로우·composer 마크업 무변경.
- `packages/gui/src/assets/logo.svg` — **placeholder** 네온 글래시 `{ }` SVG(다크 배경용). 실물 자산이 동일 경로 덮어쓰면 코드 변경 없이 반영.
- `packages/gui/src/vite-env.d.ts` — `/// <reference types="vite/client" />` (신규). `*.svg` 등 정적 자산 import 의 ambient 모듈 선언 → `tsc` 통과 목적.

**Verify**: `tsc --noEmit -p tsconfig.json` → **0 errors**. (full `pnpm build` / `vite build` / `dist:mac` 은 비요청으로 미실행.)

**Asset drop targets** (사용자 — §4.A 그대로):
- `packages/gui/build/icon.png` (PNG 1024×1024) — dev BrowserWindow icon + electron-builder 마스터.
- `packages/gui/build/icon.icns` (멀티해상도) — 패키징 아이콘(이미 존재, 신규 마크로 교체).
- `packages/gui/src/assets/logo.svg` (우선) — 첫 화면 로고(placeholder 덮어쓰기).
- `packages/gui/src/assets/logo.png` (PNG, 투명배경, ~400×160) — SVG 미제공 시 폴백. 사용 시 import 경로를 `logo.svg`→`logo.png` 로 1줄 교체.

**Not touched**: preload.ts / po-runner.ts / ToolUseGroup / MdRenderer / linkifyText / ArtifactsPane / ChatPanel / TicketDetailTab / OnboardingWizard / electron-builder.yml.

### pdt-qa — verify by code inspection (qa_status smoke → pass)

코드/배선 검증 only(빌드/smoke 미실행 — central build GREEN 수용). source 무수정. 최종 실물 비주얼은 §3 자산 의존성으로 **사용자 자산 드롭 게이트**(fail 아님).

**§2 AC ↔ code 대조**
- AC1 ✅ `main.ts:78-89` `resolveAppIcon()` — `__dirname/../build/icon.png` 우선 → `icon.icns` 폴백, `fs.existsSync` try/catch 가드로 부재/에러 시 `undefined`(throw 없음). `createWindow()`(L149,155) 조건부 스프레드 `...(appIcon ? { icon: appIcon } : {})`. `import fs from 'fs'`(L3) 존재.
- AC2 ✅ `electron-builder.yml` 미접촉(`mac.icon: build/icon.icns` 유지). `build/icon.png` 부재 — buildResources 에 마스터 들어오면 소비되는 배선만 완료. `dist:mac` 미실행 = 자산/패키징 게이트로 잔여(티켓 명시).
- AC3 ✅ `FreshComposer.tsx:27` `import logoUrl from '../assets/logo.svg'`; `h1`(L106) **바로 위** L98-103 `<img src={logoUrl} alt="productune" style={logoStyle} onError=hide />`. placeholder `src/assets/logo.svg` 커밋 존재(1215B, 네온 `{ }` SVG).
- AC4 ✅ `logoStyle`(L196-203): height 40 / width auto / maxWidth 200 / objectFit contain / display block / marginBottom 20. 부모 `content`(L185-192) `alignItems:'center'` 중앙 정렬, background/border 없음. `alt="productune"` 고정(신규 i18n 키 없음 → parity 무영향).
- AC5 ⏸ **자산 의존성 — 사용자 드롭 대기**(잔여). 코드 변경 없이 반영되는 구조 확인됨: 아이콘=동일 경로 existsSync 픽업, 로고=동일 import 경로 덮어쓰기. **비-fail**(BLOCKING dependency, 티켓 명시).
- AC6 ✅ `createWindow` 의 `webPreferences`/`titleBarStyle`/zoom/quit-guard 로직 무변경 — `icon` 키만 조건부 추가(L155). `FreshComposer` send 플로우/composer 마크업 무변경(L109+). `src/vite-env.d.ts` 신규 = `*.svg` ambient 모듈 → tsc 통과 목적(central tsc 0 와 정합).

**graceful fallback 정합**: 아이콘 부재 → `icon` 키 omit → Electron 기본 아이콘(throw 없음). 로고 이미지 깨짐 → `onError` 가 `display:none`(L102, 브로큰 글리프 방지). placeholder SVG 가 있어 현 상태에서도 로고 자리 렌더.

**verdict: PASS (wiring, code inspection).** asset-gated 항목(AC2 packaged icon, AC5 final visual)은 사용자 자산 드롭 의존 — **dependency 로 노트, fail 아님**.

**user-verify (runtime, eyeball)**
1. dev 실행 → `onboarding.status==='pending'` 첫 화면: 헤드라인 위 중앙에 로고(height 40, maxWidth 200, contain) 렌더 + 로고→헤드라인 간격 20px 확인.
2. Dock/창 아이콘: 현재 `build/icon.icns` 에서 로드(아직 `icon.png` 없음) — throw 없이 표시 확인.
3. `build/icon.png` 부재여도 dev 실행 정상(기본 아이콘 폴백) 확인.

**asset dependency (BLOCKING 최종 비주얼 — 사용자 액션 필요)**
- `packages/gui/build/icon.png` (PNG 1024×1024) — dev BrowserWindow icon + electron-builder 마스터. **현재 없음.**
- `packages/gui/build/icon.icns` — 패키징 아이콘(존재, 신규 마크로 교체 대상).
- `packages/gui/src/assets/logo.svg` — 첫 화면 로고(현재 placeholder; 실물로 덮어쓰기).
- `packages/gui/src/assets/logo.png` — SVG 미제공 시 폴백(사용 시 import 1줄 교체).
→ 위 경로에 실물 자산 드롭 시 **코드 변경 없이** 반영(AC5 완료). `.icns` 재생성은 §4 노트(iconutil/electron-builder PNG→icns).

qa_status: smoke → **pass** (배선 전부 PASS; asset-gated 비주얼은 사용자 자산 드롭 의존성으로 노트 — fail 아님; runtime 은 user-verify 위임).

### pdt-developer — qa-fix (round-2, status stays review)

QA-feedback 2건 수정(§4.b). 자산은 사용자가 이미 드롭함(`src/assets/logo.png` 263KB, `build/icon.png` 928KB 존재 확인).

**Files**
- `packages/gui/src/views/HomeView.tsx` — (BUG 1) 첫 시작 런처의 `<Zap size={48} … />` 브랜드 마크를 `<img src={logoUrl} alt="productune" />`(height 52 / width auto / objectFit contain / display block, `onError`→`display:none`)로 교체. `import logoUrl from '../assets/logo.png'` 추가, 미사용 `Zap` import 제거(`Plus`/`FolderOpen` 유지). title/tagline/btnGroup/recent 레이아웃 무변경.
- `packages/gui/electron/main.ts` — (BUG 2) `nativeImage` 를 `electron` import 에 추가. `app.whenReady` 의 `createWindow()` 직전에 darwin 가드 + `resolveAppIcon()`(existsSync 재사용) → `app.dock?.setIcon(nativeImage.createFromPath(iconPath))`, `isEmpty()` skip. 기존 `BrowserWindow.icon`(win/linux) 옵션 유지, `resolveAppIcon`/`createWindow` 나머지 로직 무변경.

**Verify**: `tsc --noEmit -p tsconfig.json`(include = src + electron) → **0 errors**. full build/`dist:mac` 미실행(비요청).

**User action (Dock 아이콘 반영)**: dist-electron 재빌드 + 앱 재시작 필요(§4.b 노트). dev 핫리로드로는 main 프로세스 변경 미적용.

**Not touched**: FreshComposer(기존 로고 무해하게 유지) / electron-builder.yml / preload.ts / 기타.

### pdt-qa — verify by code inspection (round-2, qa_status pass)

- BUG1 ✅ `HomeView.tsx` L4 `Zap` 제거(`Plus`/`FolderOpen` 잔존), L5 `import logoUrl from '../assets/logo.png'`. 브랜드 마크 블록(L55~)이 `<img src={logoUrl} alt="productune" … onError=hide />`. `../assets/logo.png` 경로 정합(`src/views/` 기준), 실물 파일 존재. title/tagline 무변경.
- BUG2 ✅ `main.ts` L1 `nativeImage` import. `app.whenReady` 진입부 darwin 가드 → `resolveAppIcon()`(`build/icon.png` 우선, existsSync) → `app.dock?.setIcon(nativeImage.createFromPath(...))`, `isEmpty()` skip. `BrowserWindow.icon` 옵션(L155) 유지.
- parity ✅ 신규 i18n 키 없음(`alt` 리터럴) → en/ko 무영향. tsc 0 errors.
- runtime user-verify: 첫 화면(HomeView)에 실물 로고 렌더 확인; Dock 아이콘은 **재빌드+재시작 후** 확인(런타임 setIcon 특성).

verdict: **PASS** (code inspection). status: review 유지.
