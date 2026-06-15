---
ticket_id: T-PATCH-136
version: v0.5
phase: 3
type: bugfix
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags:
  - parser-blast-radius-all-frontmatter-fields
  - unquoted-trailing-hash-edge
  - quoted-value-hash-must-be-preserved
  - yaml-comment-rule-whitespace-prefixed-only
  - sibling-skills-parser-same-limitation-out-of-scope
  - i18n-protected-token-safety
qa: true
qa_status: pass
slug: ticket-frontmatter-inline-comment-parse-fix
depends_on: []
---

# T-PATCH-136 — 티켓 frontmatter 인라인 `#` 주석 파싱 버그 수정 (done 티켓이 todo로 오표시)

## Request

PO 도그푸딩에서 확인된 버그: GUI 티켓 보드가 "스키마 mismatch — 알 수 없는 status N개
todo fallback" 배너를 띄우고, **실제로는 `done` 인 티켓 6개가 todo 컬럼에 잘못 표시**됨.

근본 원인(확정): `packages/gui/electron/ipc/tickets.ts` 의 `parseFrontmatter` 가
**정규식 전용**이라 줄의 `key: value` 에서 value 쪽 나머지 전체를 캡처해 `.trim()` 만 한다.
YAML 인라인 `#` 주석을 떼지 않는다. 실데이터(oh-my-eyes 프로젝트)는
`status: done   # asset production complete ...` (6건), `status: superseded   # never started ...`
(1건) 형태다. 즉 value 가 `"done   # ..."` 로 파싱 → 알 수 없는 status → `todo` fallback.

인라인 `#` 주석(앞에 공백이 있는)은 **유효한 YAML** 이고 `done` 을 의미한다 — 따라서 이건
나쁜 데이터가 아니라 **productune 파서 버그**다. 추가로 `superseded` 는 canonical 7-status 가
아니지만(doctrine 은 dropped/superseded 에 `abandoned` 사용 — `ticket-schema.md:57` 에서
`abandoned = "superseded / dropped"` 로 명시), GUI 는 더 관대하게 alias 정규화로 흡수한다.

## 코드 사실 (착수 전 재검증 — 라인은 스냅샷 기준)

- **파서 버그 지점** `packages/gui/electron/ipc/tickets.ts`
  - `parseFrontmatter`(35~55): `lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)` 으로 value
    전체를 `m[2].trim()` 캡처. 스칼라 분기: ''→null, 'null'→null, true/false, 정수,
    `"..."` 따옴표 제거(50행), `[`/`{` 시작은 문자열로 보존(51행). **`#` 주석 처리 없음.**
  - `parseFrontmatter` 는 **모든 frontmatter 필드**를 먹인다(status·assignee·risk_flags·
    depends_on·title·slug·started_at·completed_at·duration_min 등). 호출 지점 2곳:
    **151행** (`tickets:read`) + **204행** (`tickets:scan`). → 수정의 blast radius 가 넓다.
  - `parseFrontmatter` 는 멀티라인 YAML 리스트(`risk_flags:` + `- item`)를 파싱하지 **않음**.
    `- item` 줄은 키 정규식에 안 걸려 `continue`. 즉 risk_flags/depends_on 같은 리스트는
    이 파서에선 어차피 무시되므로 `#` 수정의 영향권 밖(스칼라 줄만 대상).
- **status 정규화** `packages/gui/src/lib/useTicketScan.ts`
  - `LEGACY_STATUS_SYNONYMS`(30~36): planned→todo, qa-pending→review, user-pending→
    user-verify, cancelled→abandoned, design-proposal→in-progress. **`superseded` 없음.**
  - `normalizeStatus`(38~41): 시너님 맵 미스 시 raw 그대로 통과.
  - scan 결과(74~78) 와 `TicketDashboardView.collectAllTickets`(po-state current_task)
    양쪽에서 호출되는 **교차 정규화 지점**.
- **배너/그룹핑** `packages/gui/src/components/workspace/TicketDashboardView.tsx`
  - `KNOWN_STATUS_SET`(24): STATUS_ORDER(6개) + 'review' = canonical 7-status 일치.
  - `groupByStatus`(112~129): `known=KNOWN_STATUS_SET.has(raw)`, unknown & status!=null →
    `unknownCount++`, unknown → 'todo' fallback. **현재는 count 만 셈, 어떤 raw 값이
    문제인지 수집 안 함.**
  - `SchemaMismatchBanner`(134~146): `t('workspace.tickets.schemaMismatchBanner',{count})`.
  - i18n 키 `workspace.tickets.schemaMismatchBanner` — `en.json:258` / `ko.json:258`.
- **doctrine** `packages/core/doctrine/persona/designer/bookshelf/ticket-schema.md:48~57`:
  7-status = todo|in-progress|review|user-verify|done|blocked|abandoned. `abandoned` =
  "superseded / dropped" → `superseded→abandoned` 매핑은 doctrine 정합.
- **sibling 동일 한계(범위 밖)** `packages/gui/electron/ipc/skills.ts`
  `parseSkillFrontmatter`(47~): 같은 정규식 클래스(`/^([a-zA-Z_][\w-]*):\s*(.*)$/`).
  인라인 `#` 주석 미처리 + 따옴표 제거를 무조건(`replace(/^['"]|['"]$/g,'')`)으로 함 →
  같은 버그군. **본 티켓에서 고치지 않음(별도/범위 밖)**, 후속 티켓 후보로만 flag.

## 설계 결정 (이 티켓에서 확정)

### Part 1 — `parseFrontmatter` 인라인 `#` 주석 strip (tickets.ts)

YAML 규칙: `#` 가 주석을 시작하는 건 **줄 시작이거나 앞에 공백이 있을 때만**. 따옴표
문자열 안의 `#` 는 주석이 아니다.

1. **언쿼티드 스칼라:** value 에서 **첫 ` #`(공백+해시)** 앞까지만 취하고 이후를 버린 뒤
   `.trim()`. 즉 `done   # asset ...` → `done`. 줄 맨 앞 `#` 만 있는 value 케이스는
   key:value 형태가 아니므로 발생 불가(키 정규식이 먼저 거름).
2. **쿼티드 스칼라:** 기존 50행 `val.startsWith('"') && val.endsWith('"')` 분기는 `#`
   strip **대상에서 제외** — `"a # b"` 의 `#` 는 보존. 따라서 `#` strip 은 따옴표
   판정/제거 **이전**의 raw value 에 적용하되, **value 가 따옴표로 시작하면 strip 건너뜀**.
   순서 계약: (a) raw=`m[2]`; (b) raw 가 `"` 또는 `'` 로 시작하면 `#` strip 안 함;
   (c) 아니면 첫 ` #` 컷; (d) 그 다음 `.trim()` + 기존 타입 분기.
   - 주의: 작은따옴표(`'...'`) 도 따옴표로 간주해 strip 제외(기존 코드는 `'`를 unquote
     하진 않지만 `#` strip 으로 깨지면 안 되므로 보호만 함).
3. **언쿼티드인데 정당하게 trailing `#` 가 필요한 필드가 있는가? — blast radius 확인.**
   frontmatter 스칼라 필드(status/assignee/slug/title/type/branch/worktree_path/
   started_at/completed_at/qa_status/estimated_complexity 등)는 값에 ` #` 가 정당히 들어갈
   사유가 없음(경로/날짜/enum/식별자). title 만 자유 텍스트라 이론상 `feat #123` 같은 값이
   가능 → **title 에 ` #` 가 필요하면 따옴표로 감싸야 함(YAML 표준 동작과 일치)**. 이걸
   AC/주석으로 명시해 회귀를 의도된 동작으로 문서화.
4. 호출 2곳(151, 204) 공통 헬퍼이므로 한 곳 수정으로 read/scan 동시 적용.

### Part 2 — `superseded → abandoned` 시너님 추가 (useTicketScan.ts)

5. `LEGACY_STATUS_SYNONYMS`(30~36) 에 `superseded: 'abandoned'` 추가. doctrine 상
   `abandoned` 의미가 "superseded / dropped" 이므로 정합. Part 1 이 `# 주석` 을 떼고 나면
   `superseded` 가 깨끗이 들어오고, 이 시너님이 canonical 로 정규화.
   (Part 1 단독으론 `done` 6건은 고쳐지나 `superseded` 1건은 여전히 unknown → 둘 다 필요.)

### Part 3 — SchemaMismatchBanner 가 문제 값을 명시 (TicketDashboardView.tsx)

6. `groupByStatus`(112~129) 가 **distinct unknown raw status 문자열**을 수집해 반환형에
   추가: `{ byStatus, unknownCount, unknownValues: string[] }`. 중복 제거(Set), null/
   undefined 제외(기존 `status != null` 조건과 동일 게이트).
7. `SchemaMismatchBanner` 가 그 목록을 받아 카피에 표시(미래 케이스 자가진단). i18n
   `schemaMismatchBanner` 에 값 목록 보간 추가(en+ko). **protected-token 안전**: 기존
   카피의 보호 토큰(`todo`, `productune`, `status`, `enum`, `doctrine`, `mismatch`,
   `ticket`/`project`) 표기 유지하고, 새 보간은 `{{values}}` 같은 단일 슬롯으로 추가
   (값 자체는 raw 문자열이라 번역 대상 아님 → 토큰 깨짐 없음). UI-text 폰트 룰 준수.
   - 카피 예(확정은 PR): ko "… status 의 ticket {{count}}개를 \"todo\" 로 fallback 함
     (알 수 없는 값: {{values}}). 본 project 의 status enum 이 productune doctrine 과
     다를 수 있어요." / en "… ({{count}}) … (unknown values: {{values}}) …".

## Acceptance

- [AC-1] `parseFrontmatter` 가 언쿼티드 스칼라에서 첫 ` #`(공백+해시) 이후를 주석으로 떼고
  `.trim()` 한다. `status: done   # x` → `done`. read(151)·scan(204) 양쪽 적용.
- [AC-2] 쿼티드 value(`"a # b"`)의 `#` 는 **보존**된다(strip 안 함). 단일/이중 따옴표 모두.
- [AC-3] 인라인 주석이 없는 기존 value 는 **동작 변화 없음**(null/true/false/정수/따옴표/
  `[`·`{` 분기 회귀 0). 멀티라인 리스트(`- item`) 무시 동작도 그대로.
- [AC-4] `superseded` status 티켓이 `abandoned` 컬럼에 표시(시너님 정규화). `done   # ...`
  6건이 `done` 컬럼에 표시되고 unknownCount 에서 빠진다.
- [AC-5] 실데이터(oh-my-eyes) 또는 동등 픽스처에서 스키마 mismatch 배너가 사라진다
  (정당한 done/superseded 케이스에 한해 unknownCount=0).
- [AC-6] `groupByStatus` 가 distinct unknown raw 문자열 목록을 반환하고, 진짜 unknown 이
  남아 있을 때 배너가 그 값들을 나열한다(en+ko). protected-token 깨짐 0, UI-text 폰트 룰 준수.
- [AC-7] title 에 ` #` 가 필요한 경우 따옴표로 감싸야 표시됨(YAML 표준과 일치) — 주석/AC 로
  의도된 동작임을 명시. 언쿼티드 title 의 ` #` 이후가 잘리는 건 회귀 아님.
- [AC-8] `pnpm -C packages/gui tsc --noEmit` + lint 통과. (해당 시) 단위 테스트 추가/통과.
- [AC-9] 범위 밖 확인: `skills.ts` `parseSkillFrontmatter` 는 **건드리지 않음**. 후속
  티켓 후보로만 코멘트/플래그 남김.

## Plan

착수 전 현재 소스를 재독할 것(라인 드리프트 가능).

1. **Part 1** `tickets.ts` `parseFrontmatter`: raw value 에 대해 따옴표-시작 가드 후
   첫 ` #` 컷 → trim → 기존 타입 분기. 호출 2곳 자동 커버. title `#` 동작 주석화.
2. **Part 2** `useTicketScan.ts` `LEGACY_STATUS_SYNONYMS` 에 `superseded:'abandoned'` 추가.
3. **Part 3** `TicketDashboardView.tsx` `groupByStatus` 반환형에 `unknownValues` 추가,
   `SchemaMismatchBanner` props 확장, i18n en/ko `schemaMismatchBanner` `{{values}}` 보간.
4. **검증**: 픽스처 ticket md(인라인 주석 done / superseded / 쿼티드 `#` / 정상값)로
   파싱·그룹핑·배너 확인. tsc/lint. `skills.ts` 미변경 확인.

## Out of scope

- `skills.ts` `parseSkillFrontmatter` 동일 한계 수정(인라인 `#` + 무조건 unquote) — 별도
  후속 티켓. 본 티켓은 flag 만.
- `parseFrontmatter` 의 멀티라인 YAML 리스트(risk_flags/depends_on `- item`) 파싱 지원 —
  현 미지원 동작 유지, 본 버그와 무관.
- 본격 YAML 파서 도입(js-yaml 등)으로의 교체 — 범위 외(정규식 파서 최소 수정 원칙).
- CLI 측 ticket 파싱(있다면) — 본 티켓은 GUI IPC 파서에 한정.
