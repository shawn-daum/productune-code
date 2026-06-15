---
ticket_id: T-PATCH-138
version: v0.5
phase: 3
type: bugfix
status: done
assignee: pdt-developer
estimated_complexity: L2
risk_flags:
  - existing-hook-already-blocks-write-edit-gap-is-bash-and-indented-only
  - bash-sed-heredoc-write-channel-uncovered-by-pretooluse
  - hook-status-regex-line-anchored-misses-indented-fragment
  - normalize-vs-block-decision-block-chosen-surfaces-recurring-model-error
  - enum-third-copy-must-not-be-hardcoded-single-source-or-mirror
  - inline-hash-comment-must-survive-T-PATCH-136-parity
  - quoted-value-must-survive-multi-doc-non-ticket-md-out-of-scope
qa: true
qa_status: pass
slug: ticket-status-write-guard-bash-and-indented-gap
depends_on: []
lane: normal
round: dogfood-paepyeong
---

# T-PATCH-138 — ticket status write-guard 근본 보강 (비-canonical status 가 디스크에 박히는 경로 차단)

## Request

PO 도그푸딩(paepyeong)에서 freshly-written 티켓에 `status: in_progress`(snake) 가 박힌 것이
재확인됨. 추가로 과거 티켓들에 `status: qa`(ticket **type** 이 status 슬롯에 오배치). canonical
enum 은 `packages/core/doctrine/persona/designer/bookshelf/ticket-schema.md:14` 의 7-status
(`todo | in-progress | review | user-verify | done | blocked | abandoned`) — `qa` 는 status 가
아니라 type 이고, canonical kebab 은 `in-progress`.

T-PATCH-137 은 **read-side** band-aid(board 의 `LEGACY_STATUS_SYNONYMS` 에 `in_progress`/`qa`
흡수)다. 본 티켓은 **write-side 근본 fix** — 비-canonical status 가 ticket `.md` frontmatter 에
**처음부터 박히지 않도록** write 시점에 차단한다. 박히지 않으면 board/naturalize/po-state mirror
등 모든 downstream 으로 드리프트가 전파되지 않는다.

## 코드 사실 (착수 전 재검증 — 라인은 스냅샷)

**핵심 발견: write-guard 훅은 이미 존재하며 이미 동작한다 — 빈틈만 남았다.**

- **기존 훅** `packages/core/scripts/hooks/pre-frontmatter-lint.sh` (T-P4-136, 2026-05-19)
  - PreToolUse, matcher `Write|Edit`. `docs/tickets/*/T-*.md` 만 대상(`:32`).
  - `STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"` (`:55`) +
    `QA_STATUS_ENUM="pending|pass|fail"` (`:56`) — **enum 을 문자열로 하드코딩**(doctrine
    `ticket-schema.md:14` 과 별도 2번째 사본).
  - status 검출 `grep -qE '^status:'`(`:59`) — **줄 시작 앵커(선행 공백 불허)** + `head -1`
    (`:60`) — 첫 매치 1줄만. 미스 시 exit 2 로 **BLOCK**(`:67`), 정상/비-ticket 은 exit 0.
  - install 시 `~/.claude/settings.json` PreToolUse `Write|Edit` 로 등록됨
    (`packages/core/scripts/install.sh:143-144`, `$fmlint`).

- **재현(이 티켓의 근거 — `/tmp` 에서 실측):**
  - Write 전체파일 `status: in_progress` → **BLOCK(exit 2)** ✓ (이미 막힘)
  - Write 전체파일 `status: qa` → **BLOCK(exit 2)** ✓ (이미 막힘)
  - Edit top-level `new_string: "status: in_progress"` → **BLOCK(exit 2)** ✓
  - **Edit `new_string: "  status: in_progress"`(선행 공백/들여쓰기) → PASS(exit 0)** ✗ 빈틈①
  - **Bash `sed -i 's/todo/in_progress/' …T-112.md` → 훅 미발화(matcher 가 Write\|Edit 뿐)
    → PASS(exit 0)** ✗ 빈틈②
  - 정상 `status: in-progress` → PASS ✓

- **빈틈 분석 — write 가 어디로 새는가:**
  - **빈틈① 들여쓰기/앵커:** `^status:` 는 컬럼 0 만 본다. Edit 의 `new_string` 가 status 를
    들여쓰거나(거의 없음), 더 현실적으로는 status 줄이 fragment 안에서 선행 텍스트와 같은 줄에
    안 잡히는 경우 미검출. 작은 빈틈이나 회귀 방지 차원에서 닫는다.
  - **빈틈② Bash 채널(주 원인 후보):** PO 가 ticket status 를 `Edit` 가 아니라 Bash
    (`sed -i` / `cat > file <<EOF` / `printf >> file`)로 쓰면 훅이 **아예 발화하지 않는다**.
    task 가설("PO writes are raw Edit/sed — likely the latter")과 일치. 이게 freshly-written
    `in_progress` 가 살아남은 가장 그럴듯한 경로다.
  - **PreToolUse 본질적 한계:** Bash command 가 동적으로 조립하는 내용은 정적으로 status 값을
    뽑아내기 어렵다(변수/파이프). → Bash 채널은 "확실히 status 줄을 쓰는 패턴"만 보수적으로
    검출하고, 모호하면 통과시키되 PostToolUse 검증으로 사후 차단/교정을 보강한다(아래 설계).

- **shared write choke point 부재(확인됨):** `packages/gui/electron/mechanical-write.ts` 는
  **doctrine promotion append 전용**(`mechanicalWrite()` → `appendToTarget`). ticket status
  write 는 이 경로를 **타지 않는다**. 즉 코드 레벨 단일 choke point 없음 → 훅이 유일한 choke
  point. (CI `check-ticket-version.mjs` 는 version 만 린트, status 는 안 봄.)

- **enum 단일화 선례:** `packages/core/config/close-gate.p3.json` — 공유 literal 을 SoT
  (`packages/core/config/`)에 두고 install 이 `~/.productune/config/` 로 mirror(`install.sh:425-429`),
  훅이 그걸 읽는 패턴. status enum 도 동일 패턴으로 단일화 가능(아래 설계 결정).

- **downstream 소비자(왜 write 가 근본인지):** `packages/core/src/history/naturalize.ts:100`
  (`status === 'in-progress'`), board 정규화(T-PATCH-137 맵), po-state current_task mirror —
  전부 디스크 status 를 신뢰. 디스크가 깨끗하면 모두 깨끗.

## 설계 결정 (이 티켓에서 확정)

### 결정 A — normalize-silently vs block-and-correct → **BLOCK-and-correct 채택**

근거: `in_progress`/`qa` 는 **모델의 반복적 슬립**(snake-case 기본 토큰, type/status 혼동)이다.
silent normalize 는 친절하지만 **반복 에러를 은폐**해 doctrine/프롬프트 교정 신호를 잃는다.
기존 훅도 이미 block 정책이고(정합), block 은 같은 턴 안에서 모델이 corrective message 를 받아
canonical 로 재작성하므로 비용도 낮다. → **정책 유지 + 빈틈만 메움.** (단, Bash 채널은 정적
검출 한계상 "확실한 패턴만 block, 모호하면 PostToolUse 사후검증" 의 2단 방어.)

### 결정 B — enum 단일화 (3번째 하드코딩 사본 금지)

현재 enum 은 doctrine prose(`ticket-schema.md:14`) + 훅 문자열(`pre-frontmatter-lint.sh:55`)
2곳. 본 티켓이 또 다른 검증 지점을 추가하면 3번째 사본 위험. → `close-gate.p3.json` 선례대로
`packages/core/config/ticket-status-enum.json` (또는 동등 literal) 을 SoT 로 만들고
install 이 `~/.productune/config/` 로 mirror, 훅이 그 파일을 읽어 `STATUS_ENUM` 을 구성.
**doctrine prose 는 사람용 SoT 로 남기되, 기계 검증은 config literal 단일화.** (구현 부담이
크면 최소안: 기존 훅의 하드코딩 enum 을 유지하되 새 검증 지점을 추가하지 않고 기존 훅만 보강 —
developer 가 trade-off 판단. AC 에 "새 enum 사본 추가 금지" 만 강제.)

### 결정 C — 빈틈 메우기 (구체 변경)

1. **빈틈① 앵커 완화** `pre-frontmatter-lint.sh:59-61` (+ qa_status `:73-75`):
   `^status:` → `^[[:space:]]*status:` 로 선행 공백 허용. 값 추출 sed 도 동일하게 선행 공백
   tolerant. **단, T-PATCH-136 인라인 `#` 주석 parity**: 값에서 첫 ` #`(공백+해시) 이후를
   주석으로 떼고 비교(쿼티드 값의 `#` 는 보존). 즉 `status: done   # x` → `done` 으로 검증.
   (현재 훅은 `tr -d '"'"'"' '` 로 따옴표/공백만 제거 → 인라인 주석이 붙으면 `done#x` 류로
   enum 미스 → false BLOCK 위험. 이걸 같이 고친다.)
2. **빈틈② Bash 채널 커버** — install 의 PreToolUse 등록에 `Bash` matcher 추가하고, 훅이
   `TOOL_NAME == Bash` 일 때 `command` 문자열에서 **ticket md 를 대상으로 status 를 쓰는
   확실한 패턴**(예: `sed`/`>`/`printf`/heredoc 으로 `docs/tickets/.../T-*.md` 에
   `status: <non-canonical>` 를 주입)을 보수적으로 검출해 BLOCK. 모호하면(변수 보간 등) PASS.
   - 대안/보완: **PostToolUse `Bash`** 후처리 훅으로 방금 건드린 ticket md 의 status 를
     재검증(파일 디스크 상태를 직접 읽음 → 동적 조립도 사후 포착). block 은 못하지만
     corrective message + 비-canonical 발견 시 즉시 알림. developer 가 Pre 보수검출 +
     Post 사후검증 조합으로 설계.
3. **호출/등록 동기화** `install.sh` `merge_claude_settings_hooks`: `$fmlint` 의 matcher 를
   `Write|Edit` → `Write|Edit|Bash` 로(또는 Post 훅 추가 시 PostToolUse 블록에도 추가).
   재실행 idempotent merge 이므로 기존 설치도 다음 install 에서 갱신됨. `is_pdt` basename
   매칭에 신규 훅 basename 추가(있으면).
4. **enum config literal** (결정 B 채택 시): `packages/core/config/ticket-status-enum.json`
   생성, `install.sh` config mirror 블록(`:423-429` 인근)에 cp 추가, 훅이
   `~/.productune/config/ticket-status-enum.json` 을 읽어 `STATUS_ENUM` 구성(없으면 기존
   하드코딩 fallback). qa_status enum 도 동봉 가능.

### Edge cases (반드시 보존)

- **인라인 `#` 주석** `status: done   # asset complete` → `done` 으로 검증(T-PATCH-136 parity,
  false BLOCK 0).
- **쿼티드 값** `status: "review"` / `'review'` → 따옴표 제거 후 검증(기존 동작 유지);
  쿼티드 안의 `#` 는 주석 아님.
- **멀티-doc / 비-ticket md** → 경로 필터(`docs/tickets/*/T-*.md`)로 이미 제외(불변).
- **status 키 없는 Edit/Write** → 통과(불변). qa_status 도 키 present 시에만 검사(불변).
- **Bash 모호 패턴**(변수/파이프로 status 동적 조립) → PreToolUse 는 PASS, PostToolUse 사후
  재검증에 위임(과차단 금지).

## Acceptance

- [AC-1] 기존 block 정책 회귀 0: Write 전체파일 `status: in_progress` / `status: qa` 는
  여전히 BLOCK(exit 2) + corrective message. 정상 `status: in-progress` 등 7-canonical 은 PASS.
- [AC-2] **빈틈① 닫힘:** 선행 공백 있는 status 줄(`  status: in_progress`)도 BLOCK.
  `^[[:space:]]*status:` 검출 + 값 추출이 선행 공백 tolerant.
- [AC-3] **인라인 `#` 주석 parity:** `status: done   # comment` 는 `done` 으로 판정 → PASS
  (false BLOCK 0). 쿼티드 `status: "a # b"` 의 `#` 보존. (단, status 값에 정당한 ` #` 사유
  없음 — 이 케이스는 주석으로만 발생.)
- [AC-4] **빈틈② Bash 채널:** `sed -i`/`>`/`printf`/heredoc 으로 ticket md 에
  `status: in_progress`(또는 비-canonical)를 주입하는 **확실한** Bash command 는 BLOCK
  (PreToolUse Bash matcher). 변수 보간 등 모호 케이스는 PASS(과차단 0).
- [AC-5] **사후 방어(PostToolUse, 채택 시):** Bash 가 ticket md 를 건드린 뒤 디스크의 status 가
  비-canonical 이면 corrective message 로 surfacing(또는 가능 시 block). 동적 조립 케이스도
  사후 포착.
- [AC-6] **enum 사본 비증가:** 새 검증 지점이 enum 을 하드코딩하지 **않는다**. 결정 B 채택 시
  `config/ticket-status-enum.json` 단일화 + install mirror + 훅이 읽음(없으면 기존 하드코딩
  fallback). 미채택 시 기존 훅 하나만 보강하고 새 사본 0.
- [AC-7] **install 동기화:** `merge_claude_settings_hooks` 가 `$fmlint`(및 신규 Post 훅 있으면)
  를 `Write|Edit|Bash`(/PostToolUse)로 등록. 재실행 idempotent(중복/스테일 0, `is_pdt`
  basename strip 정상).
- [AC-8] 경로 필터 불변: `docs/tickets/*/T-*.md` 외 md/일반 파일은 모든 채널에서 PASS.
  멀티-doc/비-ticket 영향 0.
- [AC-9] 훅 회귀 테스트: 위 케이스(canonical pass / in_progress·qa block / indented block /
  inline-comment pass / quoted pass / Bash-sed block / Bash-ambiguous pass / non-ticket pass)를
  스크립트형 테스트로 남김(픽스처 JSON event 주입). 셸 훅이라 가능한 범위에서.
- [AC-10] `pre-frontmatter-lint.sh` 셸 lint(shellcheck 있으면) + install.sh jq merge 유효성
  확인. GUI 빌드 영향 없음(훅/install/config 만 변경).

## Plan

착수 전 현재 소스 재독(라인 드리프트). T-PATCH-137(read band-aid)과 **독립** — 둘 다 머지돼야
write 차단 + 기존 디스크 드리프트 표시 정규화가 모두 커버됨.

1. `pre-frontmatter-lint.sh`: status/qa_status 검출 앵커 `^[[:space:]]*` 완화 + 값 추출에서
   인라인 `#` 주석 strip(쿼티드 보존). Bash matcher 분기 추가 — `command` 에서 ticket md
   대상 비-canonical status 주입 확실 패턴 보수 검출 → BLOCK.
2. (결정 B) `config/ticket-status-enum.json` SoT 생성 + `install.sh` config mirror cp 추가 +
   훅이 mirror 읽어 enum 구성(fallback 하드코딩 유지). 부담 크면 developer 판단으로 최소안
   (기존 훅만 보강, 새 사본 금지)으로 축소 — AC-6 의 "사본 비증가"만 무조건 만족.
3. (선택) PostToolUse `Bash` 사후검증 훅 신설(`post-ticket-status-verify.sh` 류) — 방금
   건드린 ticket md 의 status 재검증. `install.sh` PostToolUse 블록 + `is_pdt` basename 등록.
4. `install.sh merge_claude_settings_hooks`: `$fmlint` matcher `Write|Edit|Bash`(+ Post 훅)로
   갱신. idempotent merge 확인.
5. 회귀 테스트 스크립트(AC-9 케이스) + shellcheck/jq 유효성(AC-10).
6. **doctrine 보강 판단(권고만, author 금지):** PO lifecycle status-write 가 Edit 우선/Bash-sed
   금지인지 doctrine 명시 여부 — 만약 PO 가 status 를 Bash 로 쓰는 게 관행이면 그걸 Edit/공유
   헬퍼로 모는 doctrine 한 줄이 근본 보완. **단 doctrine 편집은 designer doctrine-editing
   flow(`docs/po/bookshelf/doctrine-editing.md`) 경유** — 본 티켓에서 author 하지 않고 PO 에게
   flag 만.

## Out of scope

- T-PATCH-137 범위(board read-side `LEGACY_STATUS_SYNONYMS` 흡수) — 별 티켓, 이미 진행 중.
- 기존 디스크에 이미 박힌 비-canonical status 의 일괄 migration(backfill) — 별도 후속(원하면
  one-shot `migrate-ticket-status.mjs`). 본 티켓은 **신규 write 차단**에 한정.
- `skills.ts`/`tickets.ts` GUI 파서(T-PATCH-136 잔여) — 무관.
- 본격 YAML 파서 도입 — 범위 외(셸 훅 최소 보강 원칙).
- doctrine prose 편집 — designer doctrine-editing flow 경유, 본 티켓은 flag 만.

## Outcome

기존 write-guard 훅(`pre-frontmatter-lint.sh`, T-P4-136)의 빈틈 2개 메움:
①앵커 `^status:` → `^[[:space:]]*status:` + 인라인 `#` 주석 strip(쿼티드 보존). ②Bash 채널 —
install matcher `Write|Edit` → `Write|Edit|Bash` + 훅에 보수적 Bash 검출 분기. enum 단일화(결정 B)
= `config/ticket-status-enum.json` SoT + install mirror, 훅이 읽고 하드코딩 fallback 유지(3번째 사본 0).
PostToolUse `post-ticket-status-verify.sh`(non-blocking surfacer)로 동적 Bash 조립 사후 포착.
GRILL QA: 1회차 fail(F1 — 쿼티드+인라인주석 합집합 over-block) → quote-aware 3-way normalizer로 수정 →
2회차 pass(20/20 회귀 + 적대 벡터 over-block 0, install merge idempotent, enum no-drift).
주의: 훅은 install 재실행 후 활성(아래 deploy 노트). doctrine prose 보강(Plan step 6)은 Bash 채널
커버로 잉여화 — 미적용.
