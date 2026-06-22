---
ticket_id: T-PATCH-229
version: v0.5
slug: gui-app-not-updated-by-productune-update
title: productune update가 GUI 앱(.app) 바이너리를 안 갱신 — GUI측 fix가 다른 기기에 안 감
type: doctrine
status: abandoned
phase: 3
assignee: pdt-po
requires_qa: false
requires_user_gate: true
area_tag: distribution
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-22T00:00:00Z
---

> **ABANDONED (2026-06-22)** — 잘못된 원인 분석에서 파생. 본 티켓은 shawn이 보고한 증상이
> 아니라 T-PATCH-228 조사 중 "혹시 GUI로 돌리는 기기면?"이라는 가정에서 파생됨. shawn 확인:
> **dogfood는 전부 CLI, GUI는 안 씀** → 본 티켓이 전제한 "GUI로 PO 돌리는 기기"가 존재하지
> 않음. 또 GUI 업데이트는 `productune update`에 끼워넣지 않고 **GUI 자체의 별도 업데이트 채널**
> (앱 내 update 표시 등, 옵션 3 방향)로 갈 계획 → 여기 적은 옵션 1/2는 방향 부적합. 결정은
> backlog v0.6 "GUI 자체 업데이트 채널"로 이관. (#4의 실제 원인 = T-PATCH-228, 이미 done.)

# T-PATCH-229: GUI 앱이 productune update로 안 갱신됨

## Request

T-PATCH-228 조사 파생. `productune update` = `git pull --ff-only` + `install.sh`. install.sh는
agents 심볼릭링크 · doctrine 미러 · Tier2 스캐폴드 · productune.env만 다룸 — **GUI 앱
빌드/설치는 전혀 안 함**(`electron-builder`/`dist:mac`/`.dmg`/`release/` 참조 0건, 확정).

영향: **po-runner.ts(GUI)에 있는 모든 것** — 위임 agent-teams env · resume · 이번 세션의 PATH
fix(T-PATCH-199/216/217/218) · health 라벨(T-PATCH-221) — 은 git pull 해도 **설치된 .app이
구버전이면 다른 기기에 안 감.** 사용자가 GUI로 PO를 돌리는 기기는 `productune update`를 해도
옛 동작 그대로.

## 현황

- 배포 = 수동 dmg(unsigned, T-020). 자동 업데이트(electron-updater)는 backlog에 deferred
  ("서명·배포 인프라 필요 → 수동 dmg + 버전 불일치 배너로 감", 2026-06-10).
- `productune update`는 CLI/doctrine 갱신 채널이지 GUI 배포 채널이 아님 — 그런데 사용자 멘탈모델은
  "update 하면 다 최신"이라 GUI가 안 바뀐 걸 모름(silent staleness).

## 설계 방향 (택1 또는 조합 — 결정 필요)

1. **단기(문서/안내)**: `productune update`가 "GUI 앱은 별도 — 새 dmg 받아 재설치 필요" 안내를
   출력. GUI에 버전-불일치 배너(설치된 빌드 vs repo HEAD GUI 버전) 노출 강화. infra 0.
2. **중기(빌드 합류)**: `productune update`에 `--gui` 옵션 → `pnpm dist:mac`로 로컬 재빌드 후
   설치(서명 없이 in-place 교체). 빌드 의존(pnpm/electron-builder) 있는 기기 한정.
3. **장기(자동 업데이트)**: electron-updater + 서명/notarization/배포 채널 — backlog 항목 실현.
   비용 큼(인프라).

## Acceptance

- **AC-1**: `productune update` 시 GUI 앱이 갱신 대상이 아님을 사용자가 명확히 인지한다(안내 또는
  버전-불일치 배너).
- **AC-2**: (옵션 2 채택 시) 빌드 가능 기기에서 한 명령으로 GUI 앱이 repo HEAD로 재빌드·교체된다.
- **AC-3**: GUI 빌드 버전과 repo HEAD/CLI doctrine 버전의 불일치가 GUI에서 감지·표시된다.

## Out of scope

- 코드 서명/notarization 자체(별도 인프라 티켓).
- electron-updater 전면 도입(backlog v0.6+, 옵션 3).

## Open questions

- **OQ1**: 어느 옵션? 단기 안내(1)만으로 충분한지, 빌드 합류(2)까지 갈지 — 팀이 멀티-기기로
  dogfood하면 2가 실질 필요. 결정은 오너.

## 메모

이번 세션(2026-06-22)에 머지된 GUI fix들(199/216/217/218/221)도 이 갭 때문에 다른 기기엔
새 dmg 재배포 전까지 미적용. T-PATCH-228(CLI env)과 함께 "기기 간 미적용"의 두 갈래를 이룸 —
228=CLI 경로(git pull로 해결), 229=GUI 경로(dmg 재배포 필요).
