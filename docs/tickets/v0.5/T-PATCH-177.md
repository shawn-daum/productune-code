---
ticket_id: T-PATCH-177
version: v0.5
slug: tray-persona-asset-and-waiting-badge
title: 메뉴막대/tray에 실행중 persona 에셋(최근 agent 우선) + PO가 user 입력 대기 시 빨간 badge
type: code
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: tray-persona
risk_flags: [design-needed, electron-tray]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-177: tray persona 에셋 + 대기 badge

## 요청 (user)
1. **메뉴막대(macOS menu bar / tray)에 실행 중 persona 에셋 표시** — 최근 실행 agent 우선(현재 working인 persona, 여럿이면 최근).
2. **PO가 user 입력을 기다릴 때(모든 persona idle) 빨간점(badge)** 로 표시.

## 조사/설계 (designer plan-first)
- 현 tray/menu-bar 존재 확인: electron main(app.dock.setIcon T-PATCH-109 있음 / Tray 객체 유무 grep). 없으면 Tray 신설 vs dock badge 활용 결정.
- 데이터: persona 활성/idle = personaPresence store(working/idle) — 단 이건 renderer. tray는 main process → main이 persona 상태를 알아야(IPC로 renderer→main push, 또는 health 이벤트 main에서 직접).
- 에셋: persona work sprite(또는 정지 프레임) — tray 아이콘 크기(macOS ~22px). 어떤 프레임/정적 vs 애니(tray 애니는 비용).
- 빨간 badge: 모든 persona idle + PO turn 종료(user 입력 대기) = tray 아이콘에 red dot overlay (또는 dock badge). "대기 중" 신호.

## 결정 필요 (designer 판단 + 필요시 surface)
- 표시 surface: macOS menu-bar Tray(신규) vs dock 아이콘 overlay. (Tray가 "메뉴막대" 요청에 부합.)
- 에셋 정적 vs 애니. tray 크기 제약.

## Acceptance (plan 후 dev)
- AC-1: persona working 시 tray/메뉴막대에 그 persona 에셋(최근 우선) 표시.
- AC-2: 모든 persona idle + 입력 대기 시 빨간 badge.
- AC-3: main↔renderer persona 상태 동기화. build PASS.

## Note
- design-first: surface(tray/dock) + 에셋 형태 designer 확정 → dev 구현.

---

## 설계 확정 (designer plan-first — T-PATCH-177)

### 조사 결과 (현 코드 사실)
- **Tray 객체 없음.** `electron/main.ts`는 `Tray`를 import/생성하지 않는다. `Menu`/`nativeImage`만 쓴다. 메뉴막대(상단 status bar) 아이콘 부재 → AC-1을 위해 **Tray 신설 필요**.
- **`getCloseToTray`는 오해 소지 있는 이름** — 실제로는 `win.hide()`만 한다(main.ts:213-218). 진짜 tray가 없으므로 hide 후 재진입 경로는 ⌘Tab/dock뿐. Tray 신설 시 tray click → `win.show()`로 이 빈틈도 메운다(부수 이득, OOS 아님 — tray 메뉴에 Show/Quit 포함).
- **Dock 아이콘은 이미 점유됨** — `app.dock.setIcon(brand)` (main.ts:386-396, T-PATCH-109). dock에 persona를 overlay하면 브랜드 아이콘과 충돌 + macOS dock badge는 텍스트 전용(`app.dock.setBadge(string)`), 임의 이미지 overlay 불가(그건 Windows `setOverlayIcon` API).
- **persona 상태는 renderer 전용** — `store/personaPresence.ts`(zustand). main은 모른다.
  - working/done 전이는 `store/poEvents.ts`가 `po:onHealth`(subagent working, line 423-427)와 `po:onDone`(line 408/436)에서 `setPersonaState` 호출로 구동.
  - done→idle 자동 복귀 타이머 2000ms(`AUTO_IDLE_MS`, personaPresence.ts:102).
  - 즉 main은 **이미 forward하는 IPC 이벤트의 원천**을 갖고 있지만, "어느 persona가 working인지"의 derived 상태(최근 우선 정렬, all-idle 판정)는 renderer store에만 있다.
- **에셋은 sprite sheet** — `src/assets/personas/{po,designer,dev,qa}-work-sprite.png`. 4프레임 가로 시트, CSS `background-position` step 애니(PersonaPresenceBar.tsx:42-47, 134). nativeImage로 그대로 tray에 못 쓴다(시트 전체가 들어감) → **프레임-0 정적 crop**이 필요.

### DECISION 1 — surface: **macOS Tray 신설** (dock overlay 기각)
- 사용자 요청 문구 "메뉴막대"는 macOS 상단 menu bar = `Tray`. dock 아님.
- dock은 brand 아이콘 점유 + dock badge는 텍스트만 → persona 이미지 표시 불가.
- **권고: Tray.** dock은 fallback도 아님(이미지 overlay API 부재). 단일 surface로 Tray 확정.
- 빨간 badge도 같은 surface(tray 아이콘 합성 이미지)에 그린다 — `app.dock.setBadge`(텍스트) 미사용.

### DECISION 2 — 에셋 형태: **정적 프레임-0, 22pt @1x/@2x, monochrome 아님(컬러 허용)**
- tray 애니(setImage 반복)는 비용·깜빡임 + macOS HIG상 비권장 → **정적**.
- working persona는 sprite **프레임-0만** crop해 tray 크기로 리사이즈. 시트(4프레임 가로)에서 width/4 영역.
- 두 경로 중 권고: **빌드 타임에 frame-0 PNG를 미리 추출**해 `build/tray/{po,designer,dev,qa}-22.png`(+@2x 44px)로 두고 main이 정적 로드. (런타임 sharp crop은 의존성 추가 — 기각.)
  - 추출 산출물은 designer가 별도 제공(이 티켓 dev 단계에서 sprite frame-0를 잘라 PNG 4종 + @2x 4종 커밋). idle 상태는 tray 비표시이므로 idle 에셋 불필요.
- macOS template(monochrome) 이미지는 persona 색 정체성(violet/orange/sky/green)을 잃으므로 **template 미사용, 컬러 유지**. `nativeImage.setTemplateImage(false)` 기본.

### DECISION 3 — main이 persona 상태를 아는 법: **renderer→main IPC push (derived snapshot)**
- main에서 health 이벤트 재해석(정렬·all-idle 판정 중복 구현) 대신, **이미 진실을 가진 personaPresence store가 derived snapshot을 push**.
- renderer가 store를 SoT로 유지하는 기존 아키텍처와 일치 + 정렬/판정 로직 단일화(중복·드리프트 방지).
- push payload(신규 IPC, renderer→main `tray:state`):
  ```ts
  // preload: api.trayUpdate(payload) → ipcRenderer.send('tray:setState', payload)
  interface TrayStatePayload {
    activePersona: PersonaId | null   // working 중 최근 우선(가장 큰 updatedAt). 없으면 null
    waiting: boolean                  // all idle + PO turn 종료(입력 대기)
  }
  ```
- **누가 push하나**: `personaPresence` store에 subscribe하는 얇은 effect(신규 `src/store/trayBridge.ts`, App 마운트 시 1회 init). store 변경 시 derived 계산 → 직전 push와 다를 때만 send(스로틀/dedupe).
- **activePersona 산출**(최근 우선): `entries` 중 `state==='working'`만 필터 → `updatedAt` 내림차순 → 첫째. working 없으면 done인 것 표시 안 함(done은 flash 후 idle 복귀 → 깜빡임 방지 위해 tray는 **working만** 반영, done은 무시). working 없으면 `null`.
- **waiting 산출**: 모든 persona `state==='idle'` **AND** PO turn 종료. PO turn 활성 신호는 `useWorkspace`의 `streaming`(true=turn 진행 중). 따라서 `waiting = allIdle && !streaming`. (streaming false + all idle = user 입력 차례.)
  - trayBridge는 `usePersonaPresence`와 `useWorkspace.streaming` 둘 다 subscribe해 합성.

### DECISION 4 — 빨간 badge 합성
- tray 아이콘 이미지에 **우상단 red dot overlay**를 main에서 합성.
- 권고: **미리 만든 합성 PNG 불가**(persona×waiting 조합) → main에서 런타임 합성도 nativeImage만으론 compositing API 부재.
  - 가장 깨끗: **2-레이어 에셋 사전 생성** — persona별 `*-22.png`(평상)와 `*-22-waiting.png`(red dot 박힌 버전) 2종씩, idle waiting은 별도 중립 아이콘 `tray-waiting-22.png`(브랜드 + red dot). main은 payload에 따라 `setImage`로 교체만.
  - 조합: working+활성 → `{persona}-22.png`(working 중엔 보통 waiting=false). all-idle+waiting → `tray-waiting-22.png`(red dot). all-idle+!waiting(turn 진행 중 잠깐) → `tray-idle-22.png`(브랜드, dot 없음) 또는 마지막 persona 잔상 없이 중립.
- red dot 사양: 직경 ~6pt(@2x 12px), 색 `#EF4444`(brand danger), 우상단, 1px 흰 외곽선(대비). PersonaPresenceBar 색 토큰과 별개 — 시스템 알림 도트 관례 따름.

### 파일/라인 impl 스펙 (dev 단계)
1. **`packages/gui/electron/tray.ts`** (신규) — `createTray()`/`updateTray(payload)`/`destroyTray()`.
   - `new Tray(nativeImage)`; module-level `let tray: Tray | null`.
   - tray context menu: Show productune(`win.show()`) / Quit(`app.quit()` via handleQuitRequest 재사용 검토 — PO turn guard 유지 위해 `handleQuitRequest` 호출 권고). tooltip = active persona label.
   - `updateTray({activePersona, waiting})`: 우선순위 working persona > waiting > idle 중립 → 해당 PNG로 `tray.setImage`. dedupe(직전 키 기억).
   - 에셋 로드 `resolveTrayIcon(name)`: `path.join(__dirname, '../build/tray/<name>.png')`, fs.existsSync guard(없으면 no-op, never throw — T-PATCH-109 패턴 준수).
2. **`packages/gui/electron/main.ts`**
   - import `Tray` 추가(line 1 import 목록).
   - `app.whenReady()` 후(또는 첫 createWindow 후) `createTray(() => mainWindow)`. quit 시 `destroyTray()`.
   - 신규 `ipcMain.on('tray:setState', (_e, payload) => updateTray(payload))`. (handle 아님 — fire-and-forget.)
3. **`packages/gui/electron/preload.ts`**
   - `trayUpdate: (payload: TrayStatePayload) => ipcRenderer.send('tray:setState', payload)` (window.api에 노출, ~line 5 근처 묶음).
4. **`packages/gui/src/store/trayBridge.ts`** (신규)
   - `initTrayBridge()`: `usePersonaPresence.subscribe` + `useWorkspace.subscribe`로 derived 계산 → dedupe 후 `window.api.trayUpdate(payload)`. App 루트 마운트 effect에서 1회 호출, unmount 시 unsubscribe.
   - derived 헬퍼는 personaPresence.ts에 `selectActivePersona(entries)` / `selectAllIdle(entries)` export로 두어 단위테스트 가능하게(정렬·판정 로직 SoT 1곳).
5. **에셋(신규, build resource)**: `packages/gui/build/tray/` 하위 — `{po,designer,dev,qa}-22.png`(+@2x), `tray-waiting-22.png`(+@2x), `tray-idle-22.png`(+@2x). designer가 sprite frame-0 crop + red dot 합성해 커밋.
6. **`packages/gui/electron-builder` config / extraResources** — `build/tray/**`가 패키징 산출물에 포함되는지 확인(dev는 `../build/`로 직접 접근, packaged는 resources 경로 점검). 미포함 시 `extraResources`에 추가 + `resolveTrayIcon`에 packaged 경로 fallback 1줄.

### Acceptance 보강
- AC-1: working persona 발생 시 tray 아이콘이 그 persona(최근 우선)로 교체. working 다중 시 updatedAt 최신 1명.
- AC-2: 모든 persona idle + `streaming===false`(turn 종료) → tray가 `tray-waiting`(red dot). turn 재개(streaming true) 또는 working 재진입 시 dot 해제.
- AC-3: renderer store가 SoT, `tray:setState` push로 main 동기화. 에셋 누락 시 throw 없이 default/no-op. `pnpm --filter @productune/gui build` PASS.

### morning surface (PO 판단 필요 분기)
- (해결됨, FYI) surface=Tray로 designer 확정. dock은 기술적으로 persona 이미지 표시 불가라 진짜 분기 아님 — 보고만.
- (확인 요청) **Quit 동작**: tray Quit이 `handleQuitRequest`(PO turn guard + 2-tap)를 타게 할지, tray는 즉시 종료 단순화할지. 권고: guard 재사용(데이터 안전).
- (확인 요청) **idle 중립 아이콘 디자인** — turn 진행 중이지만 working persona 미할당인 짧은 구간의 tray 표시. 권고: 브랜드 미니 아이콘(dot 없음).
