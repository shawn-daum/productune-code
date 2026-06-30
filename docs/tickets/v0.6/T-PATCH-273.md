---
ticket_id: T-PATCH-273
version: v0.6
slug: launcher-auto-init-auto-update
title: productune 런처 — auto-init(미init 시 자동 scaffold) + auto-update(실행 시 자동 pull+install) (#21)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: cli-tooling
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-30T01:00:00Z
---

# T-PATCH-273 (#21): launcher auto-init + auto-update

`productune update`(=git pull --ff-only + install.sh + migration)는 이미 있음. 이걸 **실행 시 자동**으로 태우고, **미init 디렉터리는 자동 scaffold**(lite launcher 패턴 — `if [ ! -d .productune-lite ]` 자동 init). 대상: `packages/core/scripts/productune` 런처(+필요 시 GUI 실행 경로).

## Acceptance
- **AC-1 auto-init**: `productune`(서브커맨드 없는 launch)가 cwd에 `.productune/` 없으면 **자동 init scaffold** 후 PO 실행 (lite 동작 정합). 이미 init이면 그대로.
- **AC-2 auto-update**: launch 시 자동 `productune update`(pull --ff-only + install.sh). **가드 필수**: (a) repo working tree clean일 때만 (b) 현재 브랜치가 upstream 추적 + behind일 때만 (c) ff-only (d) 실패(offline/non-ff/dirty/detached)면 **skip + 1줄 안내 후 현 버전으로 계속**(launch 절대 안 막음) (e) opt-out env(`PRODUCTUNE_NO_AUTOUPDATE=1`) (f) 과빈도 방지(예: 하루 1회 또는 마지막 체크 timestamp). 업데이트 시 무엇이 바뀌었는지 1줄 안내.
- **AC-3 무회귀**: 명시적 `productune update`/`init`/`onboard` 그대로 동작. offline에서도 launch 정상. **dev 브랜치(예: v0.6)에서 origin/main과 non-ff면 skip**(개발 클론 보호).

## Out of scope
- 다른 기기로의 자동 전파(불가 — 기기별 clone·기기별 settings. 각 기기가 자기 auto-update로 갱신). lite 쪽 auto-update(별도 lite 레포 — 병렬 brief).

## Plan
dev: `productune` 런처에 auto-init 분기(.productune/ 부재 시 init 경로 호출) + launch 초입에 auto-update 가드 블록(clean+behind+ff-only+throttle+opt-out, 실패 무해). QA: 미init 디렉터리 자동 scaffold / dirty·non-ff·offline 시 skip+launch 지속 / opt-out 동작 / 정상 update 1회.

## Outcome
done — `productune` 런처: AC-1 auto-init(.productune/config.json 부재 시 init-project.mjs --skip-doctrine 자동 scaffold, 옛 T-117 self-heal 가드 흡수), AC-2 auto-update(banner 후 7가드: opt-out env·throttle 1일·repo resolve·clean·non-detached·upstream·fetch+behind·ff-only → pull --ff-only + install.sh + SHA 안내; 모든 실패 skip+launch 지속). 명시적 서브커맨드 무회귀(case가 auto블록 앞). QA pass(bash -n clean, set -e 안전 — 모든 git/install 가드, 현 v0.6 dirty+no-upstream 클론은 skip 확인). happy-path(clean+behind)=runtime flag. dev 클론 보호됨.

## Persona Activity
(PO-managed)
