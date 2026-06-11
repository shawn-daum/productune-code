---
ticket_id: T-PATCH-111
version: v0.5
round: patch
type: fix
status: review
phase: 3
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pass
qa_loops: 0
slug: ticket-id-version-namespace
area_tags: [gui/navigation, gui/quickopen, infra/tickets]
created_at: 2026-06-11
---

# T-PATCH-111 — ticket-detail tab/QuickOpen/resolution 을 version 으로 namespace

## §1 Request (why)

T-PATCH-103 이 Version History 의 ticket id/title 을 클릭하면 `ticket-detail` 탭이 열리도록 배선했다.
이때 탭 식별자·QuickOpen 항목 식별자·ticket-detail 해석(resolution)이 **전부 `ticket_id` 단독 키**로만 동작한다.
사용자 우려(원문):

> "현재 버젼 티켓이랑 이름 겹치는 문제없어? 지금 당장이 아니고 앞으로 생길 가능성. cmd p할때 문제생기지않을까 검토."

즉 **version 간 ticket_id 충돌** 위험이다.

### 오늘 상태 (라이브 충돌 없음 — 운 좋게 prefix 가 다름)

디스크 확인 결과:
- `docs/tickets/v0.4/` → `T-P4-NNN` (+ `T-P4-048-em`)
- `docs/tickets/v0.5/` → `T-NNN`, `T-PATCH-NNN`

두 버전의 id 공간이 prefix(`T-P4-` vs `T-`/`T-PATCH-`)로 갈려 **현재는 충돌하지 않는다**.
그러나 이건 네이밍 관례에 의존한 우연일 뿐 코드가 보장하는 불변식이 아니다.

### 미래 충돌 시나리오 (이 티켓이 막으려는 것)

가령 v0.6 가 다시 `T-001` 부터 번호를 매기면 `v0.5/T-001` 과 `v0.6/T-001` 이 같은 id 를 갖는다.
코드를 직접 읽고 확인한 충돌 지점 3곳:

1. **QuickOpen 항목 id 충돌 (React key collision)**
   `packages/gui/src/views/workspace/shell/helpers.ts` `buildQuickOpenItems` (L228~250)
   각 ticket 항목 `id: \`ticket:${tk.ticket_id}\``. `scanTickets` 는 모든 version dir 를 평면으로 합쳐
   반환하므로(`electron/ipc/tickets.ts` `tickets:scan` L161~221, dedup 없음), 같은 `ticket_id` 두 개가
   동일한 항목 id 를 갖는다 → React key 중복 / 리스트에서 한쪽이 다른 쪽을 가린다. sublabel 에 version 이
   있어도(`tk.version ?? ''`) 사람 눈에만 구분되고 항목 id 는 여전히 충돌.

2. **단일 공유 탭 id → 잘못된 탭으로 focus**
   세 진입점이 전부 `\`ticket-detail:${ticket_id}\``, payload `{ ticketId }` 로 탭을 연다:
   - `helpers.ts` L243~248 (QuickOpen)
   - `views/versionHistory/TicketCard.tsx` `handleOpen` L27~33 (T-PATCH-103)
   - `components/workspace/TicketDashboardView.tsx` `Card` L165~170
   `store/workspace.ts` `openTab` (L403~431) 은 **tabId 문자열로만 전역 dedup** 한다 — 이미 열린 탭이 있으면
   같은 id 면 새로 안 열고 그 탭을 focus 한다. 따라서 `v0.5/T-001` 탭이 열린 상태에서 `v0.6/T-001` 을 열면
   → 기존 v0.5 탭으로 focus 가 튄다 (= **다른 내용**을 보게 됨). 탭 제목도 `ticket_id` 뿐이라
   (`workspace.ts` defaultTitle L760) 두 탭을 열어도 구분 불가.

3. **ticket-detail 해석이 first-match (잘못된/모호한 파일 로드)**
   `TicketDetailTab` (L223~250) 은 payload 의 `ticketId` 만 들고 `api.ticketsRead(projectDir, ticketId)` 호출.
   `tickets:read` 핸들러(`electron/ipc/tickets.ts` L126~158) 는 **모든 version dir 를 순회하며
   `<ticketId>.md` 첫 매칭을 반환**한다(L142~156). version 정보가 안 넘어오므로 `T-001` 이 여러 버전에 있으면
   `readdirSync` 순서상 먼저 걸리는 파일을 로드 → 사용자가 의도한 버전과 다른 ticket 을 보게 될 수 있다.

`version` 은 이미 가용하다: `types.ts` `Ticket.version?: string | null`, scan 결과 각 ticket 에 채워짐
(`tickets.ts` L189). 단지 탭 id / 항목 id / read 경로가 그걸 안 쓸 뿐이다.

### Risk verdict

**미래 대비 hardening (P2 — 오늘 라이브 버그 아님).** 현재 prefix 분리로 충돌이 없으므로 긴급도는 낮다.
그러나 (a) 불변식이 코드가 아닌 네이밍 관례에만 의존하고, (b) 버전 번호 리셋은 자연스러운 미래 사건이며,
(c) 충돌 시 증상이 "조용히 잘못된 티켓을 보여줌" 이라 디버깅이 어렵다 → version namespace 화로 선제 차단할 가치가 있다.
디스크 변경/마이그레이션 불필요 (런타임 키 구성만 변경), 따라서 저위험 패치.

## §2 Acceptance

- [x] A1. 같은 `ticket_id` 가 두 버전에 존재할 때, QuickOpen 에서 각각 **별개 항목**으로 뜨고 React key 경고가 없다
  (항목 id 가 version 으로 namespace). sublabel 의 version 표기는 유지.
  → 항목 id `ticket:${tk.version ?? '∅'}/${tk.ticket_id}` 로 namespace, sublabel 무변경.
- [x] A2. `v0.5/T-001` 탭이 열린 상태에서 QuickOpen/Version History/Dashboard 어디서든 `v0.6/T-001` 을 열면
  **별개 탭**이 새로 열린다 (focus 가 기존 탭으로 튀지 않음). 같은 (version, id) 재클릭은 기존 동작대로 dedup-focus.
  → 탭 id `ticket-detail:${version}/${id}`. `openTab` 의 tabId dedup 이 (version,id) 단위로 동작.
- [x] A3. ticket-detail 탭이 (version, id) 로 정확한 파일을 로드한다. `v0.6/T-001` 탭은 `v0.6/T-001.md` 내용을 보여준다.
  → payload `version` → TicketDetailTab → `ticketsRead(..., version)` → `tickets:read` 가 `docs/tickets/<version>/<id>.md` 직접 조회.
- [x] A4. **하위 호환**: version 이 null/unknown 인 legacy ticket 도 오늘과 동일하게 열리고 로드된다 (regression 없음).
  prefix-분리된 현행 v0.4/v0.5 ticket 들은 동작 변화가 체감되지 않아야 한다.
  → version 부재 시 탭 id = legacy `ticket-detail:${id}`, read = 기존 first-match 순회 유지.
- [x] A5. 세 진입점(helpers.ts / TicketCard / TicketDashboardView)이 **동일한 탭 id 규칙**을 쓴다 — 한 곳에서 연 탭을
  다른 곳에서 재클릭하면 dedup-focus 되어야 하므로 키 생성이 일관돼야 한다.
  → 공통 헬퍼 `ticketDetailTabId(version, id)` (helpers.ts) 를 세 곳 모두 호출.

## §3 Out of scope

- 디스크상의 ticket 파일/디렉터리 rename 또는 id 마이그레이션 — 안 한다 (런타임 키만 변경).
- ticket_id 네이밍 규칙 변경 / PO 발번(發番) 로직 — 다루지 않음.
- ticket-detail 내부 pipeline·next-action 렌더링 로직 — 변경 없음.
- 동일 version 내 ticket_id 중복(같은 폴더에 같은 id) — 별개 문제로 본 티켓 범위 밖.

## §4 Implementation plan

핵심: **탭 id / QuickOpen 항목 id / read 경로를 (version, id) 로 namespace**. payload 에 `version` 동반.

1. **공통 키 헬퍼 1개 도입** (예: `helpers.ts` 또는 인접 util) —
   `ticketDetailTabId(version: string | null | undefined, id: string)`:
   version 이 truthy 면 `\`ticket-detail:${version}/${id}\``, 아니면 legacy fallback `\`ticket-detail:${id}\``.
   세 진입점이 전부 이 헬퍼를 호출하게 해 A5 의 일관성을 보장.

2. `views/workspace/shell/helpers.ts` `buildQuickOpenItems` (L232~248):
   - 항목 `id` 를 `\`ticket:${tk.version ?? '∅'}/${tk.ticket_id}\`` 류로 namespace (legacy 표기 규칙 합의).
   - `open` 의 `openTab(...)` 첫 인자를 `ticketDetailTabId(tk.version, tk.ticket_id)` 로, payload 를
     `{ ticketId: tk.ticket_id, version: tk.version ?? null }` 로 확장. 탭 제목은 id 유지(또는 version 병기 검토).

3. `views/versionHistory/TicketCard.tsx` `handleOpen` (L27~33):
   `openTab(ticketDetailTabId(ticket.version, ticket.ticket_id), 'ticket-detail',
   { ticketId: ticket.ticket_id, version: ticket.version ?? null }, ticket.ticket_id)`.
   주석(L24~26 "Tab id `ticket-detail:<id>` is fixed")도 갱신.

4. `components/workspace/TicketDashboardView.tsx` `Card` (L165~170):
   동일하게 헬퍼 + payload `version` 동반으로 교체. (이 뷰는 ticket 객체에 `version` 보유.)

5. **payload → resolution 배선**:
   - `TabContent.tsx` (L79~80) 는 `tab.props` 를 그대로 넘기므로 변경 불필요. `TicketDetailTab` (L223~250) 에서
     `tabProps?.version` 을 읽어 `api.ticketsRead(projectDir, ticketId, version)` 로 넘긴다 (없으면 undefined).
   - `electron/ipc/tickets.ts` `tickets:read` (L126~158): optional 3번째 인자 `version?` 추가.
     version 이 주어지면 `path.join(ticketsRoot, version, \`${id}.md\`)` 만 시도(존재하면 그 파일, 없으면 null);
     version 이 없으면 **현행 first-match 순회 유지**(A4 legacy fallback). path-traversal 가드(L144~148)는 그대로 적용.
   - preload/ipc 타입(`window.api.ticketsRead` 시그니처)에 optional `version` 반영.

6. `store/workspace.ts` `defaultTitle` `ticket-detail` (L760): 그대로 `ticketId` 유지해도 무방하나,
   충돌 두 탭 구분을 위해 `version` 있으면 병기(예: `\`${ticketId} · ${version}\``) 검토 — UX 판단은 developer 재량,
   A2 의 "별개 탭" 충족이 우선.

backward-compat 규칙: 모든 분기에서 `version` 부재 시 **정확히 오늘 동작**(legacy tab id, first-match read)으로 떨어지게 한다.

## §5 QA smoke

수동 시나리오로 충돌 인공 재현 (디스크 변경 없이도 검증 가능하면 우선):
- S1. 임시로 `docs/tickets/` 에 서로 다른 두 버전 dir 에 같은 id 파일(예: `vTEST-a/T-001.md`,
  `vTEST-b/T-001.md`)을 두고: QuickOpen 에 두 항목이 뜨고 React key 경고 없음(A1), 각각 열면 별개 탭이
  뜨고 각 탭이 해당 version 내용 로드(A2/A3). 검증 후 임시 파일 제거.
- S2. 기존 v0.4/v0.5 ticket 한 개씩 열어 regression 없음 확인 — 탭 열림, 올바른 본문 로드(A4).
- S3. 같은 (version,id) 를 Version History 와 Dashboard 양쪽에서 클릭 → 같은 탭으로 dedup-focus(A5).
- S4. `npm run build`(또는 surface 빌드 커맨드) 통과 + ticket-detail 탭 lint/type 통과.

## §6 Persona Activity

### pdt-developer — impl (status → review)

(version, id) namespace 배선 구현 완료. 디스크 변경 없음 — 런타임 키 구성만 변경.

**공통 헬퍼**
- `ticketDetailTabId(version, id)` 신규(helpers.ts): version truthy → `ticket-detail:${version}/${id}`, 아니면 legacy `ticket-detail:${id}`. 세 진입점이 전부 이 헬퍼 호출(A5 일관성).

**Files**
- `packages/gui/src/views/workspace/shell/helpers.ts` — `ticketDetailTabId()` 헬퍼 export 추가. `buildQuickOpenItems` 의 ticket 항목 id 를 `ticket:${tk.version ?? '∅'}/${tk.ticket_id}` 로 namespace, `open` 의 openTab 을 헬퍼 + payload `{ ticketId, version: tk.version ?? null }` 로 교체. sublabel/label/priority 무변경.
- `packages/gui/src/views/versionHistory/TicketCard.tsx` — 헬퍼 import 추가. `handleOpen` 의 tabId/payload 를 `ticketDetailTabId(ticket.version, ...)` + `{ ticketId, version }` 로 교체. 고정-id 주석 갱신.
- `packages/gui/src/components/workspace/TicketDashboardView.tsx` — 헬퍼 import 추가. `Card` onClick 의 openTab 동일 교체.
- `packages/gui/src/components/workspace/main/panes/TicketDetailTab.tsx` — `tabVersion = tabProps?.version`(string 가드) 읽어 `ticketsRead(projectDir, ticketId, tabVersion)` 로 전달. `load` useCallback deps 에 `tabVersion` 추가. (frontmatter 파생 `version` 과 이름 충돌 방지 위해 `tabVersion` 명명.)
- `packages/gui/electron/preload.ts` — `ticketsRead` 시그니처에 optional `version?: string` 추가, `tickets:read` invoke 에 전달.
- `packages/gui/electron/ipc/tickets.ts` — `tickets:read` 핸들러에 optional `version?` 추가. 내부 `tryRead(versionDir)` 헬퍼로 path-traversal 가드 + read/parse 공통화. version 주어지면 `docs/tickets/<version>/<id>.md` 단일 조회(부재 시 null, fall-through 금지); version 부재 시 기존 first-match 순회 유지(A4).

**Routing**: `TabContent.tsx` 는 `tab.props` 를 그대로 `TicketDetailTab` 에 전달 → 변경 불필요. 탭 payload 타입은 `Record<string, unknown>` 이라 `version` 추가에 store 타입 변경 불필요.

**Verify**: `tsc --noEmit -p tsconfig.json`(src + electron 포함) → **0 errors**. full `pnpm build` 비요청으로 미실행. ChatPanel.tsx 미접촉(병행 작업). i18n 문자열 변경 없음(en/ko parity 영향 없음).

### pdt-qa — code-inspection verify (qa_status → pass)

Central build GREEN (gui tsc 0, locale 778, protected OK, smoke pass) taken as given — build/smoke not re-run. Verified by reading actual code against §2/§4.

**§2 Acceptance — all code-verified:**
- A1 — `buildQuickOpenItems` ticket item `id: ticket:${tk.version ?? '∅'}/${tk.ticket_id}` (helpers.ts:248) → version-namespaced React key; `sublabel` `[version, status].join(' · ')` unchanged (helpers.ts:244). PASS.
- A2 — `ticketDetailTabId(version, id)` (helpers.ts:20-22) → `ticket-detail:${version}/${id}` when version truthy, legacy `ticket-detail:${id}` otherwise. QuickOpen `open` (helpers.ts:259) passes `ticketDetailTabId(tk.version, ...)`. `openTab` dedups by tabId string → distinct (version,id) → distinct tab; same (version,id) → focus existing. PASS.
- A3 — payload `{ ticketId, version: tk.version ?? null }` (helpers.ts:261) → `TicketDetailTab` reads `tabVersion = typeof tabProps?.version === 'string' ? tabProps.version : undefined` (TicketDetailTab.tsx:228) → `api.ticketsRead(projectDir, ticketId, tabVersion)` (:243), `tabVersion` in `load` deps (:253). `tickets:read` with version → `tryRead(version)` single-dir `docs/tickets/<version>/<id>.md`, missing → null, no fall-through (tickets.ts:160-162). PASS.
- A4 — version absent (`undefined`/null/falsy): `ticketDetailTabId` → legacy `ticket-detail:${id}`; `tickets:read` version absent → first-match across version dirs preserved (tickets.ts:164-176). Path-traversal guard `resolved.startsWith(root + path.sep)` applied in both branches via shared `tryRead` (tickets.ts:144-147). Backward compatible. PASS.
- A5 — all three entry points call the shared `ticketDetailTabId`: helpers.ts:259 (QuickOpen), TicketCard.tsx:33 (`handleOpen`, import :8), TicketDashboardView.tsx:168 (`Card` onClick, import :7). Consistent key generation. PASS.

preload `ticketsRead(projectDir, ticketId, version?)` → `ipcRenderer.invoke('tickets:read', ..., version)` (preload.ts:175-180). No disk migration; runtime key composition only.

**§5 smoke — user-verify (runtime):**
- S1. Temporarily create two version dirs with the same id (`docs/tickets/vTEST-a/T-001.md`, `vTEST-b/T-001.md`); open QuickOpen (Cmd+P): confirm BOTH appear as separate items with no React key warning (A1), open each → two distinct tabs each loading its own version body (A2/A3). Remove the temp files after.
- S2. Open one existing v0.4 and one v0.5 ticket from QuickOpen/Version History → tab opens, correct body loads (A4 regression check).
- S3. Click the same (version,id) from Version History and from the Dashboard → both dedup-focus to the SAME tab (A5).

Result: §2 A1-A5 = PASS (code). Runtime collision reproduction (S1) + regression (S2) + dedup (S3) → user-verify.

## §6 Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-111 | 2026-06-11T00:00:00Z | 2026-06-11T00:00:00Z | claude-sonnet | medium |
| pdt-qa | T-PATCH-111-verify | 2026-06-11T00:00:00Z | 2026-06-11T00:00:00Z | claude-opus-4-8 | standard |
