---
title: GUI 검증 환경 (GUI testing env) — 패턴·footgun
type: fact
status: live
version: v1.1
links: ["feature--gui-adapter", "fact--qa-cua-vm"]
---
# GUI 검증 환경 — 재사용 패턴과 footgun

## 포커스/IME/합성키 검증은 VM으로
창 포커스 탈취·System Events 합성 키 이벤트·IME 입력소스 전환이 관여하는 검증은 호스트에서
돌리지 말 것 — 실사용자 세션으로 키/포커스가 샐 수 있다(T-354 실측). 이 클래스는
[[fact--qa-cua-vm]]의 격리 VM에서 구동. 그 외(headless·IPC 직접 주입·unit test)는 아래 로컬
패턴 그대로 유효.

## playwright-electron 라이브 검증 패턴
- 임의 프로젝트 대상: localStorage `productune.lastProject` 시드 + reload (끝나면 복원). 네이티브 다이얼로그 우회는 `open-recent-project` IPC(webContents.send).
- claude 스폰 없이 PO 스트리밍 턴 모사: `po:sendMessage` 등 ipcMain 핸들러 no-op 스텁 + `po:onMsgId/onAnnounce/onDone` 주입.
- HOME 오버라이드는 main 프로세스 파일 읽기만 격리 — Electron userData/localStorage는 HOME 비종속이라 dev 프로필이 오염된다. `--user-data-dir` 오버라이드 사용.

## 단위 테스트
- packages/gui vitest는 zustand 전역 mock — store-소유 로직은 exported 순수 함수로 추출해야 커버 가능(`dedupeMessagesById`·큐 함수 선례). electron ipc 모듈은 vitest.setup.ts 스텁으로 Electron 기동 없이 import 가능.
- core dist는 extensionless 상대 import라 bare Node ESM 직접 로드 불가 — 재현 시 esbuild 번들로 실행.
- 이 repo에서 `npx tsc`는 디코이 — `pnpm run build` 또는 `pnpm exec tsc -p tsconfig.json`.

## grep footgun
- 소스 내 NUL 바이트가 있으면 grep이 바이너리 취급해 조용히 스킵(costArchive.ts에서 살아있는 import를 두 번 숨김) — 삭제 게이트 스윕은 `grep -a` 또는 `file` 검사 선행.
- `install.sh`의 settings.json 머지는 set-idempotent(바이트 아님) — 재실행 시 배열 순서 재배열. 비교는 이벤트별 훅 SET으로.

## prdt doctor
- stage-completion 신호 조건: 해당 version 티켓 ≥1 AND open 0 (티켓 없는 신규 버전은 침묵). tickets의 version은 디렉토리명 그대로 — po-state.version과 문자열 정확 일치 필요.

## WorkspaceShell 도달 조건 (EntryGate footgun, T-328/347 실측)
- scratch prdt 프로젝트는 `.prdt/config.json{slug}` **그리고** `.prdt/onboarding.json{status:"done"}` 둘 다 있어야 WorkspaceShell/LeftSidebar 도달 — 없으면 EntryGate가 FreshComposer로 라우팅해 IPC 테스트가 콘솔에러 0으로 조용히 no-op(통과처럼 보이는 빈 실행).
- 렌더러 마운트: `pnpm run build` 후 `ln -sfn dist renderer`(gitignored) 없이 `_electron.launch(dist-electron/main.js)` 하면 #root 빈 상태.
- 격리 인스턴스에 ko UI가 필요하면 HOME 시드 `~/.productune/settings.json` `{ui:{language:'ko'}}` — 없으면 first-run onboarding에 착지 (T-355 QA).

## 라이브 주입 패턴 (T-355 QA)
- 헬스/프레즌스 표면: playwright-electron `app.evaluate`에서 `webContents.send('po:onHealth', …)` — claude 스폰 없이 실제 preload→poEvents→store 파이프라인 구동. 상태바/스프라이트류 티켓에 재사용.
- 전송은 Cmd+Enter(Playwright `Meta+Enter`) — plain Enter는 개행.

## CSS/레이아웃 전용 검증 경량 기법 (T-327)
- 워크스페이스 깊은 상태 없이 컴포넌트 CSS만 볼 땐 throwaway vite config(react만, electron 플러그인 제외) + standalone 마운트 + zustand store window 노출 → chromium Playwright로 getBoundingClientRect/scrollTop 상태 매트릭스 직접 구동. 검증 후 임시파일 삭제.
- pnpm monorepo라 unified/remark-*/playwright-core는 `packages/gui/node_modules`에 없음 — root `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>` 절대경로로 import.

## 셀렉터/렌더 레벨 footgun
- ASCII substring locator는 한국어 라벨('히스토리')을 놓치고 영어 파일명(title 속성)에 오매치 — ActivityBar류는 정확한 번역 라벨 또는 data-testid로 (T-351 QA).
- "클릭 가능" acceptance는 실렌더 DOM 검증 필수 — react-markdown v9 defaultUrlTransform이 커스텀 스킴 href를 빈 문자열로 sanitize하는 부류는 문자열 유닛 테스트로 못 잡음 (T-345).
- 실 macOS IME 자동화: AppleScript `keystroke`는 IME 우회, raw `key code`는 IME 통과 — 단 앱이 진짜 frontmost일 때만 도달(사용자 세션이 조용히 뺏으면 키가 사용자 앱으로 샘 → frontmost 게이트 필수, `packages/gui/scripts/qa/frontmostGate.ts`). 새 Chromium 창은 생성 시점의 입력소스에 바인딩(사후 TIS 전환 무효) (T-354).
