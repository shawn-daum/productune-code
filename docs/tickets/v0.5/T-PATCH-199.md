---
ticket_id: T-PATCH-199
version: v0.5
slug: onboarding-no-terminal-login
title: 온보딩 — 엔진 로그인을 무터미널 브라우저 OAuth로 전환 (옵션 A)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: true
area_tag: onboarding
risk_flags: >
  현재 claudeLogin 은 osascript 로 Terminal.app 을 제어한다 → macOS Automation
  TCC 권한 프롬프트를 유발하고, 검은 터미널 창을 노출한다. 타깃 유저(비-CLI
  기획자)가 1차 관문에서 막히는 지점. [T-PATCH-199 probe 2026-06-18: node-pty
  전제 폐기 — `claude auth login` 을 비-TTY 파이프 spawn 해도 정상적으로
  "Opening browser to sign in…" + OAuth URL 을 stdout 에 내고 브라우저를 스스로
  연다(TTY 에러 없음, stderr 비어있음). 따라서 숨은 일반 spawn + stdout URL
  파싱 + paste-code 폴백으로 충분 — 네이티브 의존성/ABI 리빌드 리스크 제거.
  "developer habit 의 headless-claude TTY 버그 기록" 은 레포에 존재하지 않음(grep
  0건) — 미검증 가정이었음.] 브라우저 OAuth 핸드셰이크 자체는 불가피(Anthropic
  영역) — 터미널/TCC 는 제거되나 브라우저는 남는다.
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-19T00:00:00Z
---

## 배경 / 목적

온보딩 Step2 의 "Login" 버튼(`onboarding:claudeLogin`)이 현재 다음을 한다:

```js
// packages/gui/electron/ipc/onboarding.ts:103-110, openTerminalWith :28-33
await execFileAsync('osascript', [
  '-e', 'tell application "Terminal" to activate',
  '-e', `tell application "Terminal" to do script "claude auth login"`,
])
```

문제 2가지:
1. **Automation 권한벽** — `osascript` 로 Terminal.app 을 제어하므로 "productune 이
   Terminal 을 제어하려 합니다" TCC 프롬프트가 뜨고, 거부 시 동작 불능.
2. **검은 터미널 창 노출** — README 가 정의한 타깃 유저("CLI 안 익숙, 복잡한 개발지식
   없음")가 정확히 이 지점에서 이탈한다.

핵심 사실: **Claude Code 인증의 신뢰 단계는 브라우저 OAuth 다.** `claude auth login`
은 시스템 브라우저를 자동으로 띄우는 런처일 뿐이고, 터미널 텍스트 입력은 브라우저
콜백이 안 닿을 때의 폴백이다. 즉 *터미널 창을 사용자에게 보여주는 것*은 본질이
아니라 구현 선택이다. URL 을 기본 브라우저로 여는 것 자체는 TCC 권한 항목이 없어
프롬프트가 발생하지 않는다.

→ `osascript→Terminal` 을 **숨은 자식 프로세스(node-pty) spawn** 으로 교체한다.
spawn 된 `claude` 가 스스로 브라우저를 연다. 사용자가 보는 것은 브라우저뿐, 터미널 0.

---

## 설계 결정

| 항목 | 결정 (probe 후 정정 — 2026-06-18) |
|------|------|
| **spawn 방식** | `node-pty` **불필요**. 일반 `spawn('claude',['auth','login'],{stdio:['pipe','pipe','pipe']})` — 숨은 자식 프로세스, 터미널 0. osascript 제거. codex 동일(`codex login`). |
| **브라우저 열기 주체** | spawn 된 `claude` 가 스스로 연다(probe 확인: stdout "Opening browser to sign in…"). claude 는 `open` 경유라 TCC Automation 프롬프트 없음. 안 열릴 때 대비해 **stdout 의 OAuth URL 을 파싱**(OSC-8 `\x1b]8;;…` 이스케이프 stripping 후 `https://…` 추출)해 GUI "브라우저 열기" 버튼으로도 노출. |
| **완료 감지** | 기존 `onboarding:checkClaude` 폴링 재사용(`onboarding.ts:69-89`, credentials.json/Keychain/`claude auth status`). `authed:true` 잡히면 Step2 Next 활성화. |
| **콜백 폴백** | claude 가 stdout 에 `"Paste code here if prompted >"` 를 낸다(probe 확인) → GUI 카드로 코드 입력 필드 노출 → 입력값을 `child.stdin` 에 write. 그래도 터미널 미노출. |
| **Step2 버튼 상태** | 현재 `engineFullyReady` 아니면 Next 회색 + Skip 만 활성(`Step2_EngineConnect.tsx:66-80`) → 불안 유발. Skip 을 "나중에 설정에서 연결" 안내와 함께 정상 경로로 격상(AC-6). |

### Probe 기록 (2026-06-18) — node-pty 폐기 근거
비-TTY 파이프 spawn 실측 stdout: `Opening browser to sign in…` / `If the browser didn't
open, visit: <OAuth URL>` (OSC-8 hyperlink 래핑) / `Paste code here if prompted >`. stderr
공백, TTY 요구 에러 없음. → 일반 spawn 으로 충분, node-pty/electron-builder ABI 작업 불요.

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 내용 |
|------|-----------|
| `packages/gui/electron/ipc/onboarding.ts` | `openTerminalWith` (osascript) 제거. `claudeLogin`/`codexLogin` → 일반 숨은 `spawn` + stdout URL 파싱(OSC-8 strip) + paste-code stdin write. |
| ~~`packages/gui/package.json`~~ | (정정) node-pty 불필요 — **의존성 추가 없음**. |
| `packages/gui/src/views/onboarding/Step2_EngineConnect.tsx` | 로그인 진행 상태 UI(브라우저 대기/"브라우저 열기" 버튼/코드입력 카드), Skip/Next 상태 재설계. |
| `packages/gui/src/locales/en.json` / `ko.json` | 로그인 진행/폴백 카드 문구 키 추가(동기). |

---

## Acceptance Criteria

- **AC-1**: Step2 "Login" 클릭 시 **터미널 창이 뜨지 않고** 시스템 브라우저가 열린다. macOS Automation 권한 프롬프트가 발생하지 않는다.
- **AC-2**: 브라우저에서 로그인 완료 후, GUI 가 별도 조작 없이 `checkClaude` 폴링으로 `authed:true` 를 감지해 Step2 Next 가 활성화된다.
- **AC-3**: 브라우저 콜백 실패 시(코드 붙여넣기 폴백) PTY 출력에서 코드를 감지해 GUI 카드로 안내한다 — 터미널은 끝까지 미노출.
- **AC-4**: codex 로그인(`codexLogin`)도 동일 패턴으로 동작한다.
- **AC-5**: `osascript` / `openTerminalWith` 호출이 코드베이스에서 제거되었다(grep 0건).
- **AC-6**: 미인증 상태에서 Skip 경로가 명확히 "나중에 설정에서 연결" 안내와 함께 정상 경로로 노출된다(죽은 회색 Next + 모호한 Skip 조합 해소).

---

## QA 노트

Electron OAuth 브라우저 흐름 + 무결-TCC first-run 검증은 자동화 불가 →
**외부 cua macOS-VM 온보딩-QA 하니스로 위임**(별도 프로젝트에서 진행, 2026-06-18 결정).
fresh VM = 무결 TCC 상태라 "프롬프트 안 뜸"을 깨끗이 재현 가능. 체크포인트:
1. 인증 안 된 상태에서 Login → 터미널 창 안 뜨고 브라우저만 뜨는지.
2. Automation 권한 프롬프트 발생 여부(발생하면 실패).
3. 브라우저 로그인 후 Next 자동 활성화(checkClaude 폴링).
4. paste-code 폴백 카드 동작(콜백 실패 시 stdin write).
5. (가능하면) 비개발자 완주 관찰 — "타깃 유저 미검증" 리스크 검증 겸.
~~node-pty 패키징 로드 검증~~ → node-pty 미사용으로 불요.

---

## QA sign-off (2026-06-19, cua macOS-VM 실측) — qa_status: pass

검증: 무결 VM + claude `~/.local/bin` 설치 + 패키징 productune.app(`com.productune.gui`)
Finder-launch. 빌드 green(tsc) · smoke PASS(playwright-electron) · acceptance ↓.

QA 중 **2건의 PATH 회귀 발견·수정**(commit 본 브랜치):
1. `startHiddenLogin` spawn `env: process.env` → `loginShellEnv()` — 없으면 claude
   ENOENT, 브라우저 미오픈(AC-1 fail).
2. `checkClaude`/`checkCodex` 검출 execFile에 `{env: loginShellEnv()}` — 없으면 claude
   설치돼도 "not installed"(AC-2 fail). 라이브 before/after 확인.

- **AC-1 PASS** — 라이브 GUI: "Connect" → `claude auth login` spawn → Safari가
  claude.ai OAuth 표시. 터미널無 · Automation 프롬프트無.
- **AC-2 PASS(검출)** — checkClaude가 "installed · not authed"로 정상 검출. 실계정
  완주 후 authed flip은 미변경 폴링 재사용(저위험). 실계정 완주는 미실행(VM).
- **AC-3 PASS(mech)** — 실출력 `Paste code here if prompted >` → `isPasteCodePrompt` 매칭.
- **AC-4 N/A** — codex 폐기 결정. 동일 fix는 login spawn+checkCodex에 선반영.
- **AC-5 PASS** — osascript/openTerminalWith 실호출 0건.
- **AC-6 PASS** — 라이브: "Connect later in Settings" + "continue without it /
  connect later from Settings" 안내 = 정상경로 Skip(죽은 회색 Next+모호 Skip 해소).

**user-gate 잔여(requires_user_gate)**: AC-2 실계정 OAuth 완주 + AC-6/온보딩
비개발자 완주 관찰은 throwaway VM/무계정 제약으로 미실행 — shawn hands-on 1회 권장.

**Sibling 발견 → T-PATCH-216 발행**: `po-runner.ts:510` + `mcp.ts:176`도 동일 PATH
버그(코어 PO 실행/MCP, load-bearing). 본 티켓 범위 밖이라 분리.
