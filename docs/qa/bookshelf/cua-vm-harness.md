# cua macOS-VM GUI 검증 하니스 (QA escalation 드라이버) — Tier 1

격리된 macOS VM(Lume) 안에 **패키징된 `Productune.app`을 설치·구동**하고, QA(=
Claude Code)가 MCP 도구로 화면을 직접 보며 클릭/타이핑해 검증하는 하니스. 임베드
LLM·API키 없음 — QA가 두뇌, MCP가 VM 안의 손. 하니스 본체는 productune 레포 밖에
산다: `/Users/x/Documents/dev/cua/cua-harness` (먼저 그 `README.md` +
`HANDOFF.md` 읽기).

> 왜 별도 도구인가: `gui` surface의 스크립트 스모크(`smoke_driver: playwright-electron`,
> `_electron.launch`)는 **렌더 프로세스 안**만 본다 — 실제 OS 통합(TCC 권한 프롬프트,
> Automation, Spotlight, 무결-first-run, 패키징된 앱의 코드서명·런치)은 못 닿는다.
> cua는 그 사각지대 전용 **escalation 드라이버**다. 평소 게이트를 대체하지 않는다.

## 언제 cua를 꺼내는가 (trigger)

`type:test`/user-gate 티켓 중, AC가 **실제-OS 동작**에 걸려 있을 때만:

- **TCC 권한 플로우** — 화면녹화 / 접근성 / 파일·폴더 / Automation 프롬프트가
  뜨는지/안 뜨는지. fresh VM = 무결 TCC라 "프롬프트 안 뜸"을 깨끗이 재현 가능.
- **무결 first-run / 온보딩** — 예: T-PATCH-199(무터미널 OAuth) — 인증 안 된 상태에서
  Login → 터미널 안 뜨고 브라우저만 뜨는지, Automation 프롬프트 미발생인지.
- **패키징된 `.app` 런치** — dev `electron .`가 아니라 electron-builder 산출물
  (`com.productune.gui`)을 실제 설치해 구동.
- **CLI/외부앱 연동 hands-on** — file:// 라우팅 등 OS가 중재하는 동작(예: T-PATCH-207
  cmux 후보).

위에 안 걸리면 cua 쓰지 말 것 — playwright-electron 스크립트 스모크가 더 빠르고
결정적이다. cua는 agent-driven이라 비결정적이고 느리다(= surface schema 기준 `manual`
계열, config의 `smoke_driver`로 배선하지 않는다).

## 호출 절차 (QA)

```bash
# 0) MCP 한 번만 (레포 부모 /dev/cua의 .mcp.json에 cua-vm 이미 등록됨;
#    cua-harness에서 직접 켰으면 수동 등록)
claude mcp add --transport stdio cua-vm -- \
  uv --directory /Users/x/Documents/dev/cua/cua-harness run python mcp_vm_server.py
# → mcp__cua-vm__screenshot / left_click / type_text / press_key / hotkey /
#   scroll / open_target / run_command / screen_size … (12 raw tools, 화면=2048×1536)

cd /Users/x/Documents/dev/cua/cua-harness
# 1) VM이 데스크톱인지 확인(부팅 직후면 §운영규칙의 1클릭 선행). 단발 확인:
uv run python vmctl.py shot                          # out/now.png
# 2) 패키징된 앱 설치+실행 (electron-builder 산출 Productune.app 경로 지정)
./install_app.sh /path/to/Productune.app
# 3) screenshot → 판단 → left_click/type_text/hotkey 로 AC 한 줄씩 검증, run_command로 상태/TCC assert
# 4) 매 테스트 전 클린: 그 앱 TCC+상태만 초기화 (TCC 미부여 클린 = 무결 first-run 재현)
./soft_reset.sh com.productune.gui
./soft_reset.sh com.productune.gui --reinstall /path/to/Productune.app   # 빌드까지 새로
```

## 운영 규칙 (반드시)

- **부팅 1클릭은 사람 몫**: VM(`cua`, api_port 8443) 부팅하면 macOS Setup Assistant
  (Apple ID/FileVault)가 뜬다. 프로그램적 자동 스킵은 신뢰성 있게 불가(MDM 미등록 →
  managedclient purge; STATUS.md에 전수 시도 기록). VNC로 "Other Sign-In Options →
  Set Up Later" **1회 클릭**. `lume get cua | grep vnc`로 주소 확인.
- **일상 리셋 = `soft_reset.sh <bundle>`** (in-place·빠름·clone 안 함·Apple ID 안 뜸).
  **`--all` 금지** — 하니스 자체 computer-server 권한까지 날아가 권한 다이얼로그가
  쏟아진다.
- **cua VM은 켜둔 채 soft_reset만 반복.** `reset.sh`(golden re-clone)는 복구용 — 쓰면
  Apple ID Setup 재트리거 → 위 1클릭 다시. clone/재부팅마다 1클릭 필요(테스트마다 아님).
- **입력 shift quirk**(`+`→`=`, 일부 대문자): 정확한 문자열은 `run_command`(VM 셸)나
  클립보드 경유. composer 입력칸은 placeholder 라인 클릭으론 포커스가 안 잡힘 →
  입력박스 하단(예 y≈1420) 클릭 + `pbcopy`→`cmd v`. titlebar 포커스는 좌측(예 700,86;
  중앙은 메뉴 오발). osascript/System Events 호출 금지(TCC Automation 프롬프트가 포커스 강탈).
- **★ GUI에서 PO turn 검증 시 claude 인증은 반드시 VM Keychain에 (T-PATCH-230 교훈)**:
  GUI(Electron, 콘솔세션) 컨텍스트의 claude는 **macOS Keychain**(`Claude Code-credentials`)에서
  토큰을 읽는다. 호스트 토큰을 `~/.claude/.credentials.json` **파일**로만 복사하면 shell/CLI
  claude는 되지만 **GUI-claude는 keychain의 stale 토큰을 읽어 401 → "claude exited with an
  error (code 1)"** 로 매 turn 사망(stderr 0바이트라 silent — 오진 유발). 해결: 호스트
  `security find-generic-password -s "Claude Code-credentials" -w` 추출 → VM에서
  `security unlock-keychain -p lume …/login.keychain-db` 후 **기존 stale 항목 delete →
  fresh add**(`security delete-generic-password -s 'Claude Code-credentials'` →
  `security add-generic-password -s 'Claude Code-credentials' -a lume -w "<json>"`). 또는
  VM에서 진짜 `claude auth login` 브라우저 OAuth 1회. OAuth 토큰은 수시간 만료/rotate되니
  검증 세션마다 재확인. (실제 사용자 머신은 정상 keychain 로그인 상태라 이 문제 없음 —
  순수 하니스 셋업 한계.)
- **env fail ≠ product fail**: VM 미부팅/하니스 미준비로 인한 실패는 ENV fail →
  manual fallback + `summary` 기록, product `qa_status: fail` 행 아님(maestro 디바이스
  미준비 선례와 동일, `surface-config-schema.md` "Driver prerequisites").

## 결과 처리

- AC 한 줄씩 pass/fail은 평소대로 `qa_status` + fail 행(`fail-patterns.md`)으로.
- cua가 닿은 영역(area-tag에 `tcc`/`first-run`/`oauth` 등)임을 fail note에 남겨, 같은
  OS-통합 영역의 누적 fail이 다음 `type:test` trigger로 굴러가게 한다.

## 크로스링크

- 사각지대 출처: `qa/habit.md` (escalation 드라이버 엔트리) · 본 하니스
  `HANDOFF.md`/`README.md`/`STATUS.md`.
- surface 게이트(평상시): tier0 `qa/bookshelf/surface-config-schema.md` ·
  `.productune/config.json` → `surfaces.gui`(playwright-electron).
- 검증 위임 결정: `docs/tickets/v0.5/T-PATCH-199.md`(2026-06-18 외부 하니스 위임).
