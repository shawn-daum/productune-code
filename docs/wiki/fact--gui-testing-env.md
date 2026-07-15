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
