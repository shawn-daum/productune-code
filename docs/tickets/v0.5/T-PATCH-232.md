---
ticket_id: T-PATCH-232
version: v0.5
slug: cua-verify-tier2-promote
title: cua VM 검증을 Tier 2(개인·크로스프로젝트 ~/.productune/qa/)로 승격 — dmg 기반 데스크톱 GUI 빌드면 어느 프로젝트에서든 사용 가능한 QA 검증 드라이버로
type: doctrine
status: done
phase: 3
assignee: pdt-po
requires_qa: true
qa_status: pass
requires_user_gate: true
area_tag: qa-doctrine
estimated_complexity: L2
risk_flags: [doctrine-relocation, loss-risk-on-tier1-removal]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-232: cua VM 검증을 Tier 2로 승격 (개인·크로스프로젝트)

## Request

shawn (2026-06-22): "cua 검증을 tier 2에도 넣고 싶다 — dmg 기반 GUI 빌드한 경우
(어느 프로젝트에서든) 사용할 수 있게."

## 왜 Tier 2인가 (PO 결정)

cua-vm은 shawn 개인 인프라(개인 cua-vm MCP + Lume VM)다 — 다른 productune 사용자는
그 VM이 없으므로 **제품 동봉 Tier 0/1에 살면 안 된다**. T-PATCH-227(maestro)과
**구조적으로 평행**하나, maestro는 제품 doctrine(Tier 0, 모든 사용자가 가진 OS 드라이버)
이고 cua는 개인(Tier 2)이다. cua를 Tier 0에 복제하지 말 것.

## 현황 조사

- 현 SoT는 프로젝트 Tier 1 `docs/qa/bookshelf/cua-vm-harness.md` (keychain 인증 교훈,
  click-coord 노트, cua 한계, GUI=keychain 교훈). 하니스 본체는 productune 레포 밖
  `/Users/x/Documents/dev/cua/cua-harness`에 산다.
- Tier 1 `docs/qa/habit.md`에 cua trigger 엔트리 1줄이 있고 bookshelf를 가리킨다.
- Tier 2 qa는 이미 골격이 있다: `~/.productune/qa/habit.md`(Communication/Product
  taste/Cross-project patterns 섹션, cap ≤100) + `~/.productune/qa/bookshelf/README.md`
  (append-only, source-tagged, 빈 bookshelf). Tier 2는 $HOME에만 산다 — 미커밋,
  Tier 0식 packages/core 미러 없음.
- surface-config-schema(Tier 0, T-227에서 편집됨)는 `type: web|electron|ios|android|
  node-lib|cli|server` + `smoke_driver: playwright|playwright-electron|maestro|script|manual`.
  **"desktop/macos-dmg" surface type도, 패키징 GUI용 verification-driver 매핑도 없다.**
  cua는 의도적으로 surface schema의 `manual` 계열이며 `smoke_driver`로 배선하지 않는다
  (agent-driven·비결정적). 즉 cua는 자동 게이트가 아니라 escalation 드라이버다.
- 의존: dmg 패키징 자체가 미정 후보(`v0.5-gui-distribution`, po-state). cua-on-dmg는
  dmg 빌드 존재를 전제. 단 cua는 지금까지 dmg 없이 dev/electron GUI(또는 electron-builder
  Productune.app)에서 써왔다 — dev-mode fallback이 존재한다.

## 설계 결정 (PO/user gate 대상 — load-bearing fork)

### 1. Tier 2 배치
- cua-vm-harness 메커닉 전체 → `~/.productune/qa/bookshelf/cua-vm-harness.md` (Tier 2 SoT).
  내용은 프로젝트 비종속화 리라이트: `com.productune.gui`/`Productune.app` 같은
  productune-전용 bundle id를 **플레이스홀더**(`<bundle-id>`, `<App>.app`)로 일반화하고,
  productune 전용 교훈(예 PO turn 검증 keychain)은 "어느 GUI 앱이든 GUI-claude는 keychain
  토큰을 읽는다"는 크로스프로젝트 형태로 승격.
- Tier 2 qa habit TRIGGER 1줄을 `~/.productune/qa/habit.md`에 추가 (Cross-project patterns):
  "패키징된 데스크톱 GUI 빌드(dmg/installed `.app`) 존재 + cua-vm MCP 가용 + AC가 실제-OS
  동작(TCC/무결 first-run/패키징 런치/Automation)에 걸림 → cua VM이 검증 드라이버;
  bookshelf/cua-vm-harness.md 참조. 평상시 스크립트 스모크를 대체하지 않는 escalation."

### 2. 프로젝트 Tier 1 사본 처분 → **stub-to-reference (권장)**
- 옵션: remove(Tier 2가 SoT) / keep(중복) / stub-to-reference.
- **권장: stub-to-reference.** 프로젝트 Tier 1 `docs/qa/bookshelf/cua-vm-harness.md`를
  productune-전용 알맹이만 남긴 얇은 stub으로 줄이고, 일반 메커닉은 Tier 2를 가리킨다.
- loss-risk: 통째 remove하면 (a) productune-전용 교훈(T-PATCH-230 keychain, com.productune.gui
  soft_reset 인자, T-199/207 위임 크로스링크)이 커밋된 doctrine에서 사라지고, (b)
  `docs/qa/habit.md`의 cua trigger 엔트리가 죽은 bookshelf 크로스링크를 갖게 되며, (c)
  cua-vm MCP가 없는 미래 협업자/CI가 이 프로젝트를 열 때 "이 프로젝트는 cua를 어떻게
  썼나"의 커밋된 흔적이 사라진다. stub은 그 손실을 막으면서 일반 메커닉의 SoT 중복은
  Tier 2로 단일화한다.
- Tier 1 stub이 남으면 `docs/qa/habit.md` cua 엔트리는 그대로 유효(stub→Tier2 체인).

### 3. dmg 게이트 시맨틱 + prereq/fallback
- 게이트 표현: "**패키징된 데스크톱 GUI 빌드**(dmg, 또는 installed `.app`) 존재"로 dmg에
  하드락하지 않는다 — dmg는 배포 포맷이고 cua가 실제로 닿는 건 설치된 `.app`이다.
  cua는 지금까지 electron-builder `Productune.app`(dmg 없이)로 검증해왔다.
- prereq: (a) cua-vm MCP 가용 + VM 데스크톱 상태(부팅 1클릭은 사람 몫), (b) 패키징된
  `.app`(dmg 산출물 or electron-builder 산출물) 존재. 둘 중 없으면 ENV fail → manual
  fallback + summary, product `qa_status: fail` 행 아님.
- fallback: dmg가 아직 없으면(`v0.5-gui-distribution` 미정) cua는 dev electron-builder
  `.app`으로 동작 가능(현 검증 방식). dmg는 cua의 enabler가 아니라 surface일 뿐.

### 4. Tier 0 터치 필요한가 → **불필요 (pure-Tier2 권장)**
- cua는 surface schema의 `manual` 계열이라 `smoke_driver`에 배선되지 않는다 — Tier 0
  surface-config-schema에 "desktop/macos-dmg" type이나 "personal verification driver"
  추상 훅을 넣을 seam이 없다. 넣으면 모든 productune 사용자가 보는 Tier 0에 "개인 cua
  드라이버" 개념이 새어들어 doctrine 누수(자기 VM 없는 사용자에게 무의미).
- cua를 surface 게이트가 아니라 **escalation 드라이버**로 두는 현 모델이면 Tier 2 habit
  trigger + Tier 2 bookshelf만으로 자족한다. Tier 0 무터치.
- (단, T-227처럼 "패키징 데스크톱 GUI"가 정식 surface type으로 정착하는 별개 결정이
  난다면 — 그건 dmg distribution 작업과 묶인 별도 티켓이고 본 티켓 범위 밖. 그때도 cua
  배선은 Tier 2로 남고 Tier 0엔 type만 추가.)

## Acceptance

- **AC-1**: cua-vm-harness 메커닉이 `~/.productune/qa/bookshelf/cua-vm-harness.md` (Tier 2
  SoT)에 프로젝트 비종속 형태로 존재한다 (productune 전용 bundle id → 플레이스홀더 일반화).
- **AC-2**: `~/.productune/qa/habit.md`에 cua trigger 1줄이 추가된다 — "패키징 데스크톱
  GUI 빌드 존재 + cua-vm MCP 가용 + 실제-OS AC → cua가 검증 드라이버, escalation(평상시
  스크립트 스모크 비대체), bookshelf 참조." (cap ≤100 유지).
- **AC-3** (user gate: FULL-REMOVE, not stub): 프로젝트 Tier 1 `docs/qa/bookshelf/cua-vm-harness.md`가
  통째 제거된다 (Tier 2 = 단일 SoT). 메커닉은 Tier 2로 일반화 이전 + 콘텐츠는 git history에 보존.
  `docs/qa/habit.md`의 cua 크로스링크(line 8) + cua 엔트리(line 12)는 Tier 2 경로로 repoint되어
  죽은 링크 없음. (closed 티켓들의 기존 `docs/qa/bookshelf/cua-vm-harness.md` 참조는 immutable
  아카이브 레코드 — 본 티켓 범위 밖, 라이브 doctrine 아님.)
- **AC-4**: Tier 0 무터치 — surface-config-schema 등 packages/core/doctrine 변경 없음
  (pure-Tier2). dmg 게이트는 "패키징 `.app` 존재"로 표현되고 dev-mode `.app` fallback이
  명시된다.
- **AC-5**: doctrine-editing 규칙 준수 — Tier 2 본문 영어, act-time voice, 5 leak
  category strip, bookshelf source-tag(`T-PATCH-232` or `project · 2026-06-22`).
  Tier 2는 미커밋·미러 없음(Impact checklist Tier 0 항목 n/a).

## Out of scope

- dmg 패키징/배포 자체(`v0.5-gui-distribution` 별개 후보).
- "패키징 데스크톱 GUI"를 Tier 0 surface type으로 정식화(별개 티켓, dmg 작업과 묶임).
- 프로젝트 Tier 1 cua-vm-harness의 productune 전용 교훈 자체 수정(보존만).

## Files to touch

- `~/.productune/qa/bookshelf/cua-vm-harness.md` (신규, Tier 2 SoT) — author
- `~/.productune/qa/habit.md` (cua trigger 1줄 append, Cross-project patterns)
- `docs/qa/bookshelf/cua-vm-harness.md` (stub-to-reference로 축소)
- (n/a) `docs/qa/habit.md` — 기존 cua 엔트리 그대로 유효, stub 체인 확인만
- (n/a) Tier 0 `packages/core/doctrine/**`, init.ts, install.sh, migrations — pure-Tier2

## Open questions

1. stub-to-reference vs full-remove — PO 권장은 stub(loss-risk 회피)이나 user가 "프로젝트
   doctrine을 깨끗이 비우고 Tier 2 단일 SoT"를 원하면 remove. **user gate 항목.**
2. dmg 게이트를 "dmg only"로 좁힐지 vs "패키징된 `.app` 일반"으로 둘지. PO 권장은 후자
   (cua가 실제 닿는 건 설치된 `.app`, dev fallback 보존). user 확인 필요.
3. Tier 2 cua-vm-harness에서 하니스 본체 경로(`/Users/x/.../cua-harness`)는
   shawn 개인 절대경로라 Tier 2(개인)에 그대로 둬도 무방 — 확인.

## Promotion candidates

- (이 티켓 자체가 Tier 1 → Tier 2 승격이므로 별도 promotion 후보 없음. close 시
  harness-memory drain: 본 결정이 Tier 2에 정착했는지 점검 후 임시 메모 삭제.)

## Close (2026-06-22)

designer opus(plan→author) → qa opus GRILL CLEAN(0 must-fix). ★user gate: **FULL-REMOVE** (stub 아님 — §2/Open-Q1의 stub 권장은 게이트 전 prose, AC-3가 governs). user 근거: cua=개인 크로스프로젝트 인프라 + 레포 위생(이 레포 Tier1은 productune 자기작업 시에만 읽힘) → Tier2 단일 SoT가 깔끔, git 내구성 비용은 개인 백업으로 커버.

변경:
- 신규 Tier2 SoT `~/.productune/qa/bookshelf/cua-vm-harness.md`(53L) — 재사용 메커닉 전량 이동(click-coord·keychain 절차·cua 한계·soft_reset·escalation 프레이밍·boot=human), project-agnostic 리라이트(bundle id→`<bundle-id>`/`<App>.app`, VM명→`<vm>`, keychain 교훈 "any GUI-launched claude" 일반화). productune 전용 크로스링크(surfaces.gui·T-199/207)는 의도적 drop. grill 손실검증: reusable 0 손실.
- Tier2 `~/.productune/qa/habit.md` 트리거 1줄(16L, cap OK): 패키징 데스크톱 GUI(.app, dmg-only 아님) + cua-vm MCP + 실제-OS AC → cua=검증 드라이버(escalation, 평상 스모크 비대체).
- ★Tier1 `docs/qa/bookshelf/cua-vm-harness.md` 통째 제거(git 삭제, history 복구가능). `docs/qa/habit.md`(8·12행) Tier2로 repoint — live dead-link 0. closed 티켓(T-216/217/218/220/221/224/231)의 옛 경로 참조는 immutable archive(scope 밖).
- Tier0 무터치(pure-Tier2, git diff packages/core/doctrine empty).

minor(non-blocking, 수용): Tier2 intro read-first 목록에 STATUS.md 미포함(본문엔 참조 유지) · §2 stale pre-gate prose(AC-3가 govern). Tier2는 $HOME 전용 미커밋(미러 없음). repo-hygiene("docs 내부문서 커밋 재고")는 backlog 별도 항목.
