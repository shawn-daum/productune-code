---
ticket_id: T-PATCH-103
title: "Version History 티켓 클릭 시 상세 탭 열기 — 미연결(unwired) 핸들러 배선"
version: v0.5
round: patch
type: fix
status: review
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: pass
qa_loops: 0
slug: version-history-ticket-open
area_tags: [gui/version-history, gui/navigation]
created_at: 2026-06-10
---

| T-PATCH-103 | version-history-ticket-open | review |

# T-PATCH-103: Version History 티켓 클릭 시 상세 탭 열기 — 미연결 핸들러 배선

> GUI fix. Version History 탭의 `TicketCard` 에서 티켓을 클릭해도 상세가 열리지 않는다.
> 의도된 동작이 아니라 단순 미배선(unwired). 클릭→상세 탭 열기를 연결한다.

## §1 Request

### 1.1 유저 질문 (verbatim)

> "version history 에서 티켓 클릭하면 아무 반응 없는데 이거 원래 의도된거야?"

→ **아니다. 의도된 동작이 아니다.** 단지 핸들러가 배선되지 않은(unwired) 상태다.

### 1.2 근본 원인 — unwired

대상: `packages/gui/src/views/versionHistory/TicketCard.tsx`.

- `TicketCard` 에는 **expand 토글(`setExpanded`) 하나뿐**이다(73–80행, autosave/commit 시퀀스
  펼치기·접기). 이건 commit 디테일을 위한 것이고 정상 동작한다.
- 그러나 **티켓 자체를 상세 화면으로 여는 핸들러가 없다.** 카드 헤더(`cardHeader`)의
  ticket_id(`cardTicketId`, 41행) / title(`cardTitle`, 44행) 어디에도 `onClick`/`openTab`
  호출이 없다. 그래서 ticket_id·title 영역을 클릭하면 **아무 일도 일어나지 않는다.**
- 다른 진입점(Ticket Dashboard 카드, command palette)에서는 동일 티켓이 상세 탭으로 정상
  열린다. Version History 만 이 배선이 누락됐다.

> 즉 디자인 의도상 "클릭하면 상세가 열려야" 하는데, 구현에서 `openTab` 호출이 빠진 것뿐이다.

## §2 Acceptance

- [x] Version History 탭의 `TicketCard` 에서 ticket_id / title(카드 헤더)을 클릭하면 해당 티켓의
      **상세 탭(`ticket-detail`)이 열린다.**
- [x] 열리는 방식이 다른 진입점과 **일관**된다 — `TicketDashboardView` Card / command palette
      와 동일한 canonical `openTab('ticket-detail:<id>', 'ticket-detail', { ticketId }, <id>)`
      시그니처를 사용한다(§4.2).
- [x] 기존 **expand 토글은 그대로 유지**된다(autosave/commit 시퀀스 펼치기·접기). click-to-open
      은 ticket_id/title 영역에만 걸리고, expand 버튼 클릭과 **충돌하지 않는다**(이벤트 분리).
- [x] 클릭 가능 영역에 적절한 affordance: `cursor: pointer`, hover 시 시각 피드백(design-system
      토큰 한도 내), 키보드 접근(`role="button"` + `tabIndex` 또는 `<button>` + `onKeyDown` Enter/Space).
- [x] 같은 티켓을 다시 클릭하면 새 탭이 중복 생성되지 않고 기존 탭으로 focus 된다(탭 id 가
      `ticket-detail:<id>` 로 고정되므로 `openTab` 의 dedup 동작에 위임).
- [x] `pnpm tsc --noEmit` green.

## §3 Out of scope

- `ticket-detail` 상세 탭 자체(`TicketDetailTab`)의 내용/레이아웃 — 본 티켓은 진입 배선만.
- autosave/commit expand 영역의 동작·스타일 변경.
- `MdRenderer` 의 구형 `ticket-review` 진입 경로 정리(별개 — canonical 은 `ticket-detail`).
- 카드 meta line(assignee/QA/duration) 클릭 동작 — 헤더(id/title)만 클릭 대상.
- Version History 데이터 로딩/파싱(`parsePersonaActivity` 등) 변경.

## §4 Implementation plan

### 4.1 `TicketCard.tsx` 변경점

- `useWorkspace` 의 `openTab` 셀렉터 구독 추가:
  `const openTab = useWorkspace((s) => s.openTab)` (import: `../../store/workspace` — 경로
  확인; 다른 view 와 동일).
- 카드 헤더(`cardHeader`)의 ticket_id + title 묶음을 **클릭 가능 영역**으로 만든다. 권장:
  헤더 안에서 id/title 을 감싸는 `<button>`(또는 `role="button"` div)에 `onClick={handleOpen}`.
  `statusPill` 은 클릭 영역 밖(또는 내부라도 동일 핸들러로 무방)에 둔다.
- 핸들러:
  ```ts
  const handleOpen = () =>
    openTab(
      `ticket-detail:${ticket.ticket_id}`,
      'ticket-detail',
      { ticketId: ticket.ticket_id },
      ticket.ticket_id,
    )
  ```
- **충돌 방지**: expand `<button>`(73–80행)은 헤더 클릭 영역 **밖**(별도 형제 요소)이므로
  자연히 분리된다. 혹시 중첩되면 expand `onClick` 에 `e.stopPropagation()` 추가. `InfoPopover`
  트리거도 클릭 버블링이 상세 열기로 새지 않도록 확인(필요 시 `stopPropagation`).
- affordance: 클릭 영역에 `cursor: pointer`. hover 피드백은 `styles.ts` 의 `cardHeader`/
  `cardTicketId` 와 동일 토큰 계열로 추가(예: hover 시 `cardTitle` color 한 단계 강조). 컬러
  emoji 금지, lucide only(아이콘 추가 시).
- 키보드 접근: `<button>` 사용 시 기본 제공. `div role="button"` 면 `tabIndex={0}` +
  `onKeyDown` Enter/Space → `handleOpen`.

### 4.2 Canonical openTab 패턴 (참조)

상세 탭 진입의 정본 시그니처(코드베이스 2곳에서 동일하게 사용):

```ts
openTab(`ticket-detail:${id}`, 'ticket-detail', { ticketId: id }, id)
```

- `packages/gui/src/components/workspace/TicketDashboardView.tsx:165` (Card `onClick`)
- `packages/gui/src/views/workspace/shell/helpers.ts:218` (command palette `open()`)

탭 id `ticket-detail:<id>` 가 고정이므로 동일 티켓 재클릭 시 새 탭이 중복 생성되지 않고
기존 탭으로 focus 된다(`openTab` dedup). `TicketDetailTab` 은 `props.ticketId` 로 로드한다.

> 주의: `MdRenderer.tsx:35` 는 구형 `ticket-review` 타입을 쓴다. **canonical 은
> `ticket-detail`** 이므로 본 티켓은 `ticket-detail` 을 따른다.

## §5 QA scope

`qa_status: smoke` — 시각/동작 스모크. 자동화 가능 범위 + 수동 1패스.

- [ ] Version History 탭 → 티켓 카드의 ticket_id/title 클릭 → 해당 티켓 `ticket-detail` 탭이
      열리고 focus 된다. *(user-verify — runtime)*
- [ ] 같은 티켓 재클릭 → 새 탭 중복 생성 없이 기존 탭 focus. *(user-verify — runtime; 코드상 탭 id 고정으로 dedup 위임 확인됨)*
- [ ] expand 토글(autosave count 버튼) 클릭 → 상세 탭이 열리지 **않고** commit 시퀀스만
      펼쳐진다(충돌 없음). *(user-verify — runtime; 코드상 stopPropagation + 형제 분리 확인됨)*
- [ ] 클릭 영역에 `cursor: pointer` + hover 피드백. 키보드 Tab focus → Enter/Space 로 열림. *(user-verify — runtime; cardHeaderOpen cursor:pointer + native button 확인됨)*
- [ ] `InfoPopover` 트리거 클릭이 상세 열기로 새지 않는다. *(user-verify — runtime; 코드상 stopPropagation wrapper 확인됨)*
- [x] `pnpm tsc --noEmit` green. *(central build GREEN: gui tsc 0)*

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-developer | opus/standard | impl | §4 배선 완료. `TicketCard.tsx`: `useWorkspace((s) => s.openTab)` 구독 + `handleOpen` = canonical `openTab('ticket-detail:'+id, 'ticket-detail', { ticketId }, id)` (TicketDashboardView:165 / shell/helpers.ts:218 동일 시그니처). 카드 헤더 id+title 을 native `<button>`(styles `cardHeaderOpen` — reset chrome + `cursor:pointer`)으로 감싸 클릭→상세 탭, 키보드 접근은 `<button>` 기본(Enter/Space). expand 토글은 별도 형제 + `e.stopPropagation()`, `InfoPopover` 트리거는 `stopPropagation` wrapper 로 분리 — 클릭이 상세 열기로 새지 않음. 탭 id 고정으로 재클릭 dedup→focus(`openTab` 위임). i18n `ticketCard.openDetail` aria-label/title en·ko 추가. scoped `tsc --noEmit -p tsconfig.json`: 본 변경 4파일 0 에러(잔존 에러는 `ChatPanel.tsx` — 병렬 작업 WIP, 본 티켓 무관). status→review. |
| 2026-06-10 | pdt-qa | opus/standard | verify | Code inspection PASS. `handleOpen`(27–33행) = canonical 4-arg `openTab('ticket-detail:${ticket.ticket_id}', 'ticket-detail', { ticketId }, ticket.ticket_id)` — TicketDashboardView.tsx:165–170 / shell/helpers.ts:218–223 와 시그니처 일치(탭 id 고정 → dedup/focus, AC §2.2·§2.5 ✓). 헤더 id+title 은 native `<button style={cardHeaderOpen}>`(54–63행) — `cardHeaderOpen`(styles.ts:59–72) chrome reset + `cursor:pointer`, 키보드 접근 native 제공(AC §2.4 ✓). expand 토글(94–100행) `e.stopPropagation()` + 별도 형제, `InfoPopover`(64–68행) `stopPropagation` wrapper 로 격리 → 충돌 없음(AC §2.3 ✓). i18n `workspace.versionHistory.ticketCard.openDetail` en/ko:741 양쪽 존재. Central build GREEN(gui tsc 0 / parity 778 / protected OK / smoke pass) 전제. Pure-code AC §2.1–2.5 done. 런타임 시각/포커스 확인(클릭→탭 열림·focus, hover 피드백, Tab→Enter/Space)은 user-verify eyeball 남김. qa_status smoke→pass. |
