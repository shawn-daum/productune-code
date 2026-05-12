# T-P4-086 — Ticket → Version frontmatter migration (T-P4-065 sub-f spec gap forward fix)

**Status**: plan (design)
**Author**: pdt-designer
**Created**: 2026-05-11
**Slug**: ticket-version-frontmatter-migration
**Bundle**: T-P4-R4-fix
**Depends on**: T-P4-043 (Versions section), T-P4-085 (Rounds→Versions rename), T-P4-065 sub-f (ticket md = SoT)
**Persona chunking**: 2 deliverables (this plan + `T-P4-086.md` ticket md)

---

## §1 Goal

`ticket → poState.versions[N]` 단방향 magnetization 회복. ticket md frontmatter `version:<id>` field = SoT.
scan IPC 의 directory fallback (`fm.version ?? versionDir`) 폐기 → frontmatter 만 신뢰. 누락 ticket 은 "Unassigned" bucket 로 가시화.

기대 결과: `ProjectVersionsSection` expand 시 각 version row 가 자기 ticket list 를 정확히 표시. `TicketDashboardView` / `VersionDetailView` 모두 같은 mapping 사용.

## §2 문제 진단 (사용자 dogfood 2026-05-11)

### 2.1 표면 증상

`ProjectVersionsSection` (T-P4-085 land 이후) 의 version row expand 시:

- 모든 version 의 ticket count = `0`
- `noTickets` placeholder ("티켓 0") 표시
- 실제로는 `docs/tickets/phase4/T-P4-*.md` 에 56개 ticket md 존재

### 2.2 Root cause

`packages/gui/electron/main.ts:613~668` `tickets:scan` IPC handler 의 mapping 로직:

```ts
for (const versionDir of versionDirs) {   // versionDir = "phase4" | "phase3-fixes"
  for (const file of files) {
    const fm = parseFrontmatter(content)
    const ticket: ScannedTicket = {
      ticket_id,
      version: fm.version ?? versionDir,   // ← fallback: directory 이름
      // ...
    }
  }
}
```

- ticket md frontmatter 에 `version:` field **누락** (전수 grep 결과 = 0 매치).
- fallback 으로 `versionDir = "phase4"` 가 ticket.version 에 들어감.
- 그러나 `poState.versions[].id` 형식 = `"v0.1-bootstrap"` / `"v0.4-meta-dogfood"` 등 (semantic version slug).
- `ProjectVersionsSection.tsx:17–24` 의 `ticketsByVersion.set(tk.version, ...)` 가 `"phase4"` key 로만 누적 → `ver.id` 매칭 X.

### 2.3 컨텍스트 — T-P4-065 sub-f spec gap

`packages/core/po/sections/tickets.md` L76, L78 에 **이미** `version` 이 "Required frontmatter" 로 명시되어 있음:

> Required: `ticket_id`, `version`, `slug`, `type`, `status`, ...

→ T-P4-065 sub-f (po-state slim, ticket md = SoT) 의 frontmatter 확장 시점에 추가됐어야 할 field. spec 은 land 됐지만 기존 ticket md 일괄 stamp 누락 + PO ticket 발행 logic 미반영 = **forward fix 패턴**.

ROADMAP `feedback_roadmap_row_brevity` 정합으로 ROADMAP 행은 1줄만, 자세한 spec gap 정합은 본 plan 에 누적.

## §3 결정 사항 (사용자 confirm 없이 designer 판단 — `[ctx]` work-without-stopping 적용)

| OQ | 결정 | 근거 |
|---|---|---|
| **OQ-1** bulk migration 정책 | **옵션 a (timestamp 기반)** + 옵션 d (manual override) fallback | `versions[].started_at` 이 poState 에 이미 있음. ticket `created_at` 과 closest-match 매핑 → 자동 처리 후 mismatch 만 사용자 확인. 옵션 c (모두 current_version) 는 history loss. 옵션 d 만 단독은 56개 manual 부담 과다. |
| **OQ-2** ticket 발행 시 stamp | **PO mechanical write** | `tickets.md` PO mechanical-write whitelist 정합 (`type`, `status` 와 같은 frontmatter 메타). Designer 가 PRD 와 함께 ticket emit 할 때 `version` 미지정 시 PO 가 `poState.current_version` 으로 stamp. |
| **OQ-3** scan IPC fallback 정책 | **frontmatter 우선 + null fallback + GUI "Unassigned" bucket** | hard error 는 회귀 위험. directory fallback 폐기 (잘못된 mapping 보다 명시적 unknown 이 안전). null version ticket 은 ProjectVersionsSection 의 "Unassigned" pseudo-row 에 grouping. |
| **OQ-4** 매핑 누락 ticket 처리 | **"Unassigned" pseudo-row** (collapsed default, count badge 노출) | hidden 은 silent drop. "Unassigned" row 로 가시화 → 사용자가 catch 가능. |
| **OQ-5** `phase3-fixes/T-PATCH-*` | **별도 legacy version stamp `legacy/phase3-fixes`** | poState.versions 에는 존재 X. ticket md frontmatter 에 stamp 만 (artificial version id). ProjectVersionsSection 의 "Unassigned" 와는 별 — 의도된 archive grouping. 또는 Designer 검토 후 가장 가까운 v0.x 매핑 (timestamp 기반 자동 추천 가능). 1st pass = `legacy/phase3-fixes`, 사용자가 catch 후 재할당 가능. |

## §4 timestamp 기반 자동 매핑 알고리즘

```
for each ticket md in docs/tickets/**/*.md:
  ts = ticket.created_at  (or started_at if created_at missing)
  if ts is null:
    → version = poState.current_version  (last-resort)
    continue
  for each version in poState.versions:
    distance[version.id] = |ts - version.started_at|
  version = argmin(distance)
  stamp ticket md frontmatter: version: <version.id>
```

특수 처리:
- `phase3-fixes/T-PATCH-*` (4 ticket): `poState.versions` 에 phase3 시점 entry 없을 가능성 → `version: legacy/phase3-fixes` artificial id stamp.
- closed version 중 `outcome.retrospective_path` 만 reference 인 항목 (cap 5 footer): timestamp 매칭 시 후보 포함. 매핑 결과는 GUI 의 read-only mention 으로 노출 (별 ticket).

## §5 PO doctrine 갱신 (ticket 발행 시 stamp)

`packages/core/po/sections/tickets.md` 의 "PO mechanical-write whitelist" 에 `version` 명시 + 발행 sequence step 추가:

```
ticket 발행 시 PO mechanical write:
  1. Designer 가 ticket md emit (frontmatter 일부 채움, version 비워둬도 됨)
  2. PO 가 version 누락 감지 → poState.current_version 으로 stamp
  3. PO post-delegate hook: status / started_at / version 정합 확인 + 보정
```

`packages/core/po/po-instructions.md` 의 post-delegate hook section (해당하는 부분 — Designer 가 dev 호출 시 결정) 에도 동기 룰.

## §6 Scan IPC 변경 (`tickets:scan`)

`packages/gui/electron/main.ts:613~668` 변경 사항:

```diff
- version: fm.version ?? versionDir,
+ version: fm.version ?? null,
```

추가:
- frontmatter `version:` 있지만 빈 문자열 / falsy 인 경우 null normalize
- TypeScript type `ScannedTicket.version: string | null` 갱신
- consumer (ProjectVersionsSection / TicketDashboardView / VersionDetailView) 에서 null handling

## §7 GUI null handling

### 7.1 ProjectVersionsSection

`packages/gui/src/components/workspace/ProjectVersionsSection.tsx`:

```ts
const unassignedTickets = scannedTickets.filter(tk => tk.version == null)
// versions.map(...) 끝에 unassigned row append (count > 0 일 때만)
```

UI:
- pseudo-row label = "Unassigned" (en) / "할당 안 됨" (ko) — locale key `workspace.versions.unassigned`
- collapsed default + count badge
- 토큰: `--text-muted` 회색 라벨 (active 강조 X)
- §1.5.4 Feedback 정합: count badge 가 명시적 가시화 (Predictability)

### 7.2 TicketDashboardView / VersionDetailView

- VersionDetailView 가 `versionId` route param 받아 ticket filter — null version ticket 은 `/dashboard/unassigned` pseudo-route 또는 (간단) "Unassigned" 필터 옵션
- 1st pass: VersionDetailView 는 변경 X (없는 version id 로 진입 시 empty 그대로). 사용자가 ProjectVersionsSection 에서만 unassigned catch.

## §8 Migration tooling (1회성)

### 8.1 Script 위치

`packages/gui/scripts/migrate-ticket-version.mjs` (Node, dependency-free).

### 8.2 Pseudo-flow

```
1. read poState.versions[] from .productune/po-state.json
2. glob docs/tickets/**/*.md
3. for each file:
   - parse frontmatter (gray-matter or hand parser already in main.ts util)
   - if version key present + non-empty → skip (idempotent)
   - if file path matches phase3-fixes/ → stamp "legacy/phase3-fixes"
   - else:
     - ts = fm.created_at ?? fm.started_at
     - if ts null → stamp poState.current_version + warn
     - else → argmin timestamp distance vs versions[].started_at → stamp closest
4. dry-run mode: print mapping table (ticket_id, current version field, proposed version)
5. --apply mode: write back frontmatter (preserve order, only insert/update `version:` line)
6. summary: N ticket stamped, M warnings (null ts), K legacy
```

### 8.3 사용자 confirm gate

dry-run 출력 → 사용자가 mapping table 검토 → `--apply` 실행. mapping override 가 필요한 ticket 은 사용자가 직접 수정 후 재실행 (idempotent).

### 8.4 ticket md frontmatter insertion 위치

`ticket_id` 직후 (`version: <id>` line). 기존 field 순서 보존. line ending LF 보존.

## §9 회귀 / 정합

| 영향 ticket | 정합 |
|---|---|
| T-P4-043 (Versions section + ticket-review tab) | ✅ ticket grouping 회복 |
| T-P4-085 (Rounds→Versions rename) | ✅ 어휘 정합 + mapping 회복 |
| T-P4-065 sub-f (po-state slim + ticket md SoT) | ✅ 누락된 frontmatter field stamp 완료 = sub-f spec 정합 |
| T-P4-066 (Promotion lifecycle) | ✅ 무관 |
| T-P4-076~083 (PresenceBar / BG monitor) | ✅ 무관 |
| ROADMAP `phase4` directory | ✅ 변경 X (frontmatter SoT 만) |

## §10 §1.5 self-check (design-system)

- **Few Things** ✅ — 1 file = 1 ticket, `version` 1개 field 추가. 산만 X
- **Familiar** ✅ — "Unassigned" bucket = GitHub Issues / Linear 의 backlog 미할당 패턴
- **Predictability** ✅ — null fallback 명시 + 사용자에게 가시화 (silent drop X)
- **Feedback** ✅ — migration script dry-run + count badge → 사용자가 결과 확인 가능
- **Escape** ✅ — idempotent script + dry-run + 사용자 mapping override 경로 = 되돌리기 가능

## §11 Implementation 분해 (dev plan 위임용)

- **sub-a)** migration script + dry-run mapping table 생성 (`packages/gui/scripts/migrate-ticket-version.mjs`)
- **sub-b)** bulk frontmatter `version:` field 추가 (script `--apply` 실행 후 commit)
- **sub-c)** PO doctrine 갱신 — `packages/core/po/sections/tickets.md` 에 ticket 발행 시 version stamp step + whitelist 명시
- **sub-d)** scan IPC fallback 변경 — `packages/gui/electron/main.ts` 의 `fm.version ?? versionDir` → `fm.version ?? null` + TS type 갱신
- **sub-e)** ProjectVersionsSection "Unassigned" pseudo-row + locale key + count badge

## §12 Out of scope

- `phase3-fixes` directory 의 ticket 들을 v0.x 매핑 (1st pass = `legacy/phase3-fixes` artificial id). Designer 가 Round retrospective 시 재할당 가능.
- VersionDetailView / TicketDashboardView 의 unassigned filter UI — 1st pass X (ProjectVersionsSection 만 surface).
- po-state.json schema 변경 — `versions[]` 그대로 SoT, ticket md frontmatter 만 stamp.
- Directory 이동 (`docs/tickets/v0.x-XXX/` 로 재구성) — Out of scope. 사용자 결정 = directory 유지 + frontmatter SoT (옵션 A).
- ROADMAP 의 "Round 0~9" 어휘 — 별 axis (developer-facing internal).
- Light theme.

## §13 Open questions (잔여)

- OQ-A: timestamp 매핑 시 ticket 의 `created_at` 이 null/누락된 항목 처리 — 1st pass = `poState.current_version` last-resort + warn. 사용자가 catch 후 수동 수정. (Designer 결정 ok)
- OQ-B: PO post-delegate hook 의 version stamp 실패 시 (예: PO 가 frontmatter parse 실패) → 어디까지 retry? — dev plan 의 sub-c 단계에서 결정.
- OQ-C: `phase3-fixes/T-PATCH-*` 의 향후 처리 — 사용자가 v0.x 재할당 의지가 있는지 별 turn 에서 확인.

## §14 Promotion candidates (designer 출력 envelope 의 top-level array 와 동기)

(아래는 readability 용. PO 가 consume 하는 것은 designer JSON envelope top-level 의 `promotion_candidates` 배열.)

- `project` → `docs/designer/decisions.md` — `(2026-05-11) ticket↔version mapping: frontmatter version field = SoT, directory fallback 폐기 (T-P4-065 sub-f forward fix). Unassigned bucket 으로 누락 가시화.`

---

**End of plan.**
