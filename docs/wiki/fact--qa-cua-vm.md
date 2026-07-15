---
title: QA CUA VM — 격리 검증 환경 (isolation via cua VM)
type: fact
status: live
version: v1.1
links: ["fact--gui-testing-env"]
---
# QA CUA VM — 포커스/IME/합성키 격리 검증

이 기기 한정 인프라(T-357). 목적: QA 라이브 검증의 창 포커스 탈취·System Events 합성 키
이벤트·IME 입력소스 전환이 사용자의 실 세션으로 새는 사고를 원천 차단 — 화면·포커스·IME를
호스트와 완전히 분리된 lume VM(`cua`) 안에서 구동한다.

## 라우팅: VM 필수 vs 로컬 허용
- **VM 필수** — 다음 성격을 가진 검증은 반드시 이 VM에서 구동: 창 포커스 전환/탈취가 있는
  구동, System Events 합성 키 이벤트(`keystroke`/`key code`), IME 입력소스 전환·조합, 풀스크린
  전환. 호스트에서 돌리면 실사용자 세션으로 키/포커스가 새어나갈 수 있다 — T-354 QA에서 실제
  발생(키 `w`/`n`/`j` 누출 + 입력소스 ~2분간 한글로 전환, `docs/wiki/inbox.md` "(T-354 qa)" 항목).
- **로컬 허용** — 다음은 실제 OS 포커스/키 이벤트를 만들지 않으므로 호스트에서 그대로 실행:
  headless 구동(`claude -p` 등 GUI 없음), IPC 직접 주입(`webContents.send` 기반 — T-355 qa
  패턴, `po:onHealth` 등을 electron `app.evaluate`로 직접 발화), 순수 unit test.
- 애매하거나 VM으로 옮기기 전 임시 하네스가 필요하면 `frontmostGate`(아래)로 로컬 완화하되,
  같은 클래스 검증이 반복되면 VM으로 옮길 것.

## VM 기동·접속
- `lume ls` — 게스트 목록/상태/VNC 접속정보(포트·비번은 매 부팅 회전).
- `lume run cua --no-display` — 헤드리스 기동. `lume ssh cua '<cmd>'` — 비대화형 명령.
- 게스트: macOS 26.4 arm64, user `lume`(암호 `lume`), IP `192.168.64.16`, host gateway
  `192.168.64.1`(공유폴더 없음 — VM↔host 전송은 항상 네트워크 경유).
- VNC(사람 눈확인용): `lume ls`의 `vnc` 컬럼 → `open "vnc://:<pw>@127.0.0.1:<port>"`. cua-vm
  MCP 툴은 VNC 없이도 구동+스크린샷 가능; VNC는 사람이 직접 보거나(OAuth 로그인 등) 개입할 때만.

## computer_server 운영 노트
- **`--host 0.0.0.0` 패치**: `~/.cua-server/start_server.sh`를 패치해 `python -m computer_server`가
  `0.0.0.0:8443`으로 바인딩하도록 고정(기본은 loopback만 바인딩 → cua-vm MCP 서버가 호스트에서
  `192.168.64.16:8443`으로 접속 불가했던 원인). `.bak` 원본 보존, diff는 `--host 0.0.0.0` 플래그
  추가 한 줄뿐.
- **pip-upgrade-on-boot 캐비앗**: 이 스크립트는 **매 부팅마다** `cua-agent[all]` ·
  `cua-computer-server` · `playwright`를 `pip install --upgrade`로 갱신하고 `playwright install
  firefox`까지 돈 뒤에야 서버를 띄운다 — (a) 부팅~서버기동까지 지연이 있고 (b) 네트워크 필요,
  (c) 부팅마다 조용히 새 패키지 버전이 들어올 수 있어 재현성이 완전하지 않다. 재현성이 중요한
  검증이면 부팅 직후 `~/.cua-server/server.log`에서 실제 설치된 버전을 확인할 것.
- **server.log 무한 증가 footgun**: 이 로그는 로테이션이 없어 계속 누적된다(2026-07-15 확인
  시점 6GB+). 디스크 압박 시 `~/.cua-server/server.log`를 서버 재시작 없이 truncate해도 안전
  (append-only 쓰기).

## VM 내 검증 환경 (2026-07-15 확인 상태)
- 저장소: `~/dev/productune-v1` — origin은 `~/dev/productune.bundle`(git bundle, 공유폴더 없어
  호스트→VM 전송은 이 방식; §2의 dmg http.server 전송과 동일 원리를 git bundle에 적용).
  확인 시점 HEAD `7406608`이 호스트 HEAD와 정확히 일치.
- `node v26.5.0` / `pnpm 11.13.0`(brew) 설치돼 있고, workspace root `pnpm install` 완료
  (`node_modules` 957M), `packages/gui`는 `pnpm run build` 완료(`dist/` · `dist-electron/` 최신).
- Playwright(electron 전용, devDependency) 설치·구동 확인 완료 — 아래 "격리 실증" 참조.
- claude CLI 인증/PATH 관련 세부(§3~§4b)는 archived ops manual 그대로 유효 — 헤드리스 PO 세션을
  VM에서 돌릴 때만 필요, 이번 라운드는 불필요(GUI 부팅/렌더 검증만).

### 처음부터 다시 프로비저닝할 때 (bootstrap)
1. `brew install node pnpm` (brew는 이미 있음).
2. 저장소 전달: 호스트에서 `git bundle create productune.bundle main`(또는 필요 브랜치) →
   호스트 `python3 -m http.server`로 서빙 → VM에서 `curl`로 받고 `git clone <bundle> productune-v1`.
   (`.dmg` 전송과 동일한 "공유폴더 없음 → host http.server + VM curl" 패턴, §2.)
3. `cd productune-v1 && pnpm install` (workspace root).
4. `cd packages/gui && pnpm run build`.
5. Playwright electron smoke만 필요하면 `ln -sfn dist renderer` 후 `pnpm exec playwright test`
   (또는 `pnpm run smoke`가 build+symlink+test를 한 번에 함).

## 격리 실증 (E2E proof, 2026-07-15)
VM 안에서 실제 GUI 앱(Electron)을 기동해 대표성 있는 검증 한 번을 완주하고, 호스트 쪽 포커스가
전혀 영향받지 않았음을 확인했다.

- VM 내부: `cd ~/dev/productune-v1/packages/gui && ln -sfn dist renderer && node_modules/.bin/playwright test`
  — `tests/smoke.spec.ts` 3종(Electron 창 기동 → 렌더러 마운트 → 콘솔에러 0 확인, 레이아웃
  비붕괴 검증, 스크린샷 캡처). 결과: 2/3 pass — 실패한 3번째는 기존에 알려진(T-334 Outcome에
  기록된) `button:visible` strict-locator 브리틀니스로 이번 신규 회귀 아님; 앱 자체는
  WorkspaceShell까지 정상 렌더됨(사이드바 버튼 10개 확인).
- 호스트 측 `frontmost` 앱을 VM 구동 직전/직후 확인: `osascript -e 'tell application "System
  Events" to get name of first application process whose frontmost is true'` → 실행 전후 모두
  동일(`cmux`, 변화 없음) — VM 안에서 창을 열고 포커스를 가져간 Electron 인스턴스가 호스트로
  전혀 새지 않았음을 실측 확인.

## 로컬 완화: frontmost gate
`packages/gui/scripts/qa/frontmostGate.ts` — 로컬에서 아직 System Events 합성 키를 보내는
하네스가 있다면(VM으로 옮기기 전 과도기), 매 키 전송 직전 `assertFrontmost(expected)`를 호출해
frontmost 프로세스가 하네스가 기대하는 앱이 아니면 즉시 throw로 전송을 중단한다. VM 이관의
임시 backstop이며 VM 검증을 대체하지 않는다.

## 아카이브 참조 (읽기 전용, 그대로 유효)
`_archive/productune/docs/qa/bookshelf/cua-vm-harness.md` — dmg 전송, `claude` CLI PATH 함정,
keychain 401/잠금 해제, VNC, TCC 우회 등 세부 오퍼레이션 노트.

## 운영 caveat (추가)
- VM `~/.cua-server/server.log`는 무회전 무한증가(6GB+ 관측 — 부팅마다 pip 업그레이드 출력 누적) — 주기적 truncate 또는 start_server.sh에 회전 추가 필요 (작은 ops 후보).
