# T-P4-065 sub-c — ChatPanel persona selector 제거

- **Ticket**: T-P4-065 (sub-area c)
- **Round**: R5
- **Date**: 2026-05-08
- **Author**: pdt-designer
- **Status**: plan-ready
- **Related**: T-P4-041 (ChatPanel land), T-P4-049 (PersonaPresenceBar), sub-a/b/d/f (sibling plans)
- **Source directive**: 사용자 (2026-05-08) — "ChatPanel persona selector 제거. PO orchestrator 가 dispatch 결정."

---

## §1 Decision

ChatPanel 의 persona selector dropdown (`<select style={personaSelect}>`, 옵션 `@ pdt-po / @ pdt-designer / @ pdt-developer / @ pdt-qa`) 를 **완전 제거**한다. rp-input row 는 textarea + send button 두 element 만 가진다.

**사유**:

1. **Doctrine 위배** — `po-instructions` 의 `Routing — pick persona + model + effort` 섹션은 PO orchestrator 가 사용자 메시지를 분석해 dispatch persona / model / effort 를 자체 결정한다고 규정. 사용자가 직접 페르소나를 지정하면 PO autonomy 를 우회.
2. **Mental model 단순화** — 사용자는 "PO 와 대화"하는 단일 entry point 만 인지하면 됨. 4-way selector 는 사용자에게 routing 부담을 전가.
3. **Visibility 책임 분리** — dispatch 결과의 가시성은 T-P4-049 PersonaPresenceBar (4 페르소나 칩 idle/working/done) 가 담당. 입력 측 selector 는 redundant.

---

## §2 GUI 변경 list

| File | 변경 |
|---|---|
| `packages/gui/src/components/workspace/ChatPanel.tsx` | `<select>` element + `personaSelect` style + `nextDelegate`/`setNextDelegate` 사용 제거. send button + textarea 만. |
| `packages/gui/src/store/poChat.ts` | `nextDelegate` slice + `setNextDelegate` action + `delegateToKind` mapping 폐기. `DelegatePersona` type export 제거. |
| `packages/gui/electron/main.ts` | `po:sendMessage` IPC handler 의 `opts.persona` 파라미터 제거. `runPoTurn({ text, projectDir, sessionId })` 만. |
| `packages/gui/electron/preload.ts` | `poSendMessage(text, persona)` → `poSendMessage(text)` signature 변경. type 정의 동기화. |
| `packages/gui/electron/po-runner.ts` | `runPoTurn` 의 `persona` 인자 제거. spawn 은 항상 `claude --agent pdt-po --resume <session>`. PO 가 자체 dispatch 결정. |
| `packages/gui/src/locales/en/workspace.json` | `chat.personaSelectorAria` 키 제거. |
| `packages/gui/src/locales/ko/workspace.json` | `chat.personaSelectorAria` 키 제거. |
| `docs/tickets/R5/T-P4-041.md` | spec 의 `rp-input` 5-row 항목 정정 — `rp-psel` 항목 strikethrough 또는 삭제. layout 4-row 로 정정. |
| `docs/design/T-P4-041-*.md` (해당 design plan) | sub-c 결정 반영 — selector 항목 strikethrough + sub-c reference link. |

---

## §3 Layout 변경

### Before (5 element row in rp-input)

```
rp-input (auto height)
  ├─ textarea (flex-1)
  ├─ <select> persona selector (~110px)
  └─ <button> send (~64px)
```

### After (2 element row in rp-input)

```
rp-input (auto height)
  ├─ textarea (flex-1, 더 넓어짐)
  └─ <button> send (~64px)
```

### 전체 ChatPanel row 구조 (변경 없음 — 명문화)

```
rp-hdr           35 px   header (PO badge + title + minimize + close)
rp-ctx          ~28 px   stage chip + round-N · T-NNN action
rp-persona-bar   24 px   T-P4-049 PersonaPresenceBar (4 chip)
rp-msgs         flex-1   message list (6 bubble kinds)
rp-input         auto    textarea + send
```

5-row layout 자체는 유지. rp-input 내부의 element 수만 3 → 2.

---

## §4 PO routing 흐름 (변경 없음 — 명문화)

```
사용자 텍스트 입력
  └─ Enter / send button click
      └─ ChatPanel.onSend()
          └─ window.api.poSendMessage(text)              // persona 인자 X
              └─ preload.ts → ipcRenderer.invoke('po:sendMessage', { text })
                  └─ main.ts ipcMain.handle('po:sendMessage')
                      └─ runPoTurn({ text, projectDir, sessionId })
                          └─ spawn: claude --agent pdt-po --resume <session>
                              └─ PO 가 메시지 분석
                                  ├─ 단순 응답 → user 에게 직접 답변
                                  └─ dispatch 필요 → designer/developer/qa 에게 task 위임
                                      └─ PersonaPresenceBar 칩이 working → done 으로 갱신
                                          (T-P4-049 가 po-state.json subscribe 로 처리)
```

사용자 시점에서:
- 입력은 항상 PO 에게.
- dispatch 결과는 PersonaPresenceBar 칩 + chat 메시지의 6 종 kind border 색 (po/designer/developer/qa/user/system) 으로 식별.

---

## §5 마이그레이션 순서

1. **Doctrine / spec 갱신** (선행 — 코드 변경 전에 truth-source 정렬)
   - T-P4-041 ticket md 정정
   - T-P4-041 design plan 정정 (sub-c reference)
2. **ChatPanel.tsx** 의 `<select>` element + `personaSelect` style 제거. `nextDelegate` / `setNextDelegate` import 제거.
3. **poChat.ts** slice 폐기 — `nextDelegate` state, `setNextDelegate` action, `delegateToKind` mapping, `DelegatePersona` type 모두 제거.
4. **IPC signature 변경** — `preload.ts` 의 `poSendMessage(text)` 로 정정 + `main.ts` 의 `po:sendMessage` handler 에서 `opts.persona` 제거.
5. **po-runner.ts** 의 `runPoTurn` 의 `persona` 인자 제거. spawn argv 의 `--agent pdt-<persona>` → `--agent pdt-po` hardcode (또는 default constant).
6. **Locale key** 제거 — `chat.personaSelectorAria` (en/ko 둘 다).
7. **검증** — `pnpm --filter gui build`, `pnpm --filter gui typecheck`, locale lint, manual smoke (입력 → PO 응답 streaming).

순서 사유: 1 → doctrine 정렬, 2~3 → UI surface 제거, 4~5 → IPC/runner cleanup, 6 → leftover, 7 → 검증.

---

## §6 회귀 검증 (manual smoke)

| Scenario | Expected |
|---|---|
| 사용자 텍스트 입력 + Enter | PO 메시지 streaming 정상 |
| 사용자 텍스트 입력 + send button click | PO 메시지 streaming 정상 |
| 새 프로젝트 (no session) | 첫 메시지 후 session 생성, chat.json 영속화 |
| 기존 session resume | 이전 messages 복원, claude_session_id resume |
| Minimize → FAB → restore | panel state 유지 |
| PersonaPresenceBar 4 칩 | dispatch 시 칩 working → done 정상 갱신 |
| 6 메시지 kind border 색 | po/designer/developer/qa/user/system 색 유지 |
| Locale switch (en/ko) | personaSelectorAria 키 부재로 fallback 없음 (제거됨 자체가 정상) |

영향 없는 영역 (명시):
- chat.json schema (messages 자체는 그대로)
- claude session resume 로직
- StageStrip / round badge / T-NNN action
- 6 message kind 색 매핑

---

## §7 Out of scope

- **sub-a**: Phase 1~5 doctrine 통합
- **sub-b**: 5단 phase 통일 (stage taxonomy)
- **sub-d**: ticket stage → type rename
- **sub-e**: PRD / service-flow / mockup 정정
- **sub-f**: po-state slim (불필요 필드 제거)
- 코드 fix 자체 — 본 산출물은 plan only (developer 가 후속 ticket 으로 적용)
- `/command` slash palette (e.g. `/persona designer 호출`) — Phase 5 candidate, T-P4-041 Out of scope 그대로 유지

---

## §8 Open questions

1. **Send button 크기 / textarea 비율** — selector 제거로 textarea 가독 영역 증가. 두 옵션:
   - (A) 단순 fill — textarea 가 남은 공간 전부 차지. send button 은 auto width (~64px).
   - (B) max-width 제한 — textarea max-width 800px 등 제한.
   - **Designer 결정 (default)**: (A) 단순 fill. ChatPanel 자체가 right panel 의 좁은 영역이라 max-width 제한은 불필요.
2. **send button label vs icon** — 현재 land 상태 그대로 유지 (별도 결정 X). 본 ticket 은 selector 제거만 다룸.
3. **`/command` slash palette** — 향후 Phase 5 에서 사용자가 명시적으로 특정 페르소나 호출하고 싶을 때의 escape hatch. 본 ticket 미관여, 별도 PRD 필요.

---

## §9 정합성 검증 (sibling sub-area)

| Sibling | 본 plan 과 충돌 / 정합 |
|---|---|
| sub-a (doctrine 통합) | 정합 — `Routing — pick persona + model + effort` 명문이 본 결정의 근거 |
| sub-b (5단 phase 통일) | 무관 — phase taxonomy 와 input UI 는 직교 |
| sub-d (stage→type rename) | 무관 — ticket field rename 과 chat input UI 는 직교 |
| sub-f (po-state slim) | 정합 — `nextDelegate` 가 store-level 이라 po-state.json 영향 없음 (slim 작업과 무관하게 GUI store 에서만 제거) |
| T-P4-049 PersonaPresenceBar | 정합 — 사용자 가시성을 presence bar 가 담당, selector 와 책임 분리 명확 |

---

## §10 산출물 chunking 검증

- 1 산출물 (본 markdown) / 1 sub-area (sub-c). chunking ceiling 정합.
- 코드 변경 X. doctrine + spec + design plan 정정만 후속 ticket 으로 분리 가능.
