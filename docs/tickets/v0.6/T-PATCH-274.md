---
ticket_id: T-PATCH-274
version: v0.6
slug: install-coexist-trust-autoaccept-po-failsafe
title: full↔lite 설치 공존(#20) + trust 자동수락(#19a) + PO doctrine-미주입 fail-safe(#19c)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: cli-tooling
estimated_complexity: L3
risk_flags: [install-hooks]
created_at: 2026-06-30T01:30:00Z
---

# T-PATCH-274 (#19/#20): cross-machine 신뢰성 — 설치 공존 + trust + PO fail-safe

다른 기기에서 full/lite 실행 시 훅이 제대로 적용되게 하는 근본 fix. 실측 버그: full+lite 둘 다 글로벌 `~/.claude/settings.json`에 등록 + **동명 `session-start-doctrine.sh`** → lite 설치가 full의 doctrine 훅 clobber → pdt-po가 독트린 0으로 떠서 제품(애니어그램) roleplay. (이 기기만 수동 패치됨.)

## Acceptance
- **AC-#20a 공존(no-clobber)**: full install.sh ↔ lite install.sh가 글로벌 settings.json 머지 시 **서로의 훅을 strip하지 않음**. 원인 진단(strip/is_pdt가 path-scoped인지 basename-match인지) 후, **각 install이 자기 dir 훅만 strip**하도록 보장. full+lite 둘 다 설치돼도 두 시스템 훅(특히 SessionStart doctrine) **공존**.
- **AC-#20b 네임스페이스**: 동명 `session-start-doctrine.sh` 충돌 방지(경로-스코프 strip으로 충분하면 rename 불필요; 아니면 분리). 검증: 둘 다 설치 후 글로벌 SessionStart에 full+lite doctrine 훅 **둘 다 존재**.
- **AC-#19a trust 자동수락**: productune init/onboard(및 lite init)가 프로젝트 생성/오픈 시 `~/.claude.json` projects[absdir].hasTrustDialogAccepted=true 자동 설정 → 새 프로젝트가 trusted로 떠서 permission+hooks+doctrine 정상.
- **AC-#19c PO fail-safe**: doctrine 미주입(agent_type 부재/주입 빈값) 감지 시 pdt-po가 **엉뚱하게 roleplay하지 말고** 명시적 안내/에러(예: "doctrine 미로드 — onboard 필요"). 조용한 오동작 금지.
- **AC 무회귀**: 단독(full만/lite만) 설치 정상. 기존 훅/permission/statusline 무손상.

## Out of scope
- 자동 push/배포(여전히 각 기기 수동/auto-update로 당김). lite 레포 변경은 별도 커밋.

## Plan
PLAN-FIRST(별도 dispatch): 양 install.sh의 strip/is_pdt 실제 매칭 진단 → 공존 설계 + trust 자동수락 위치(init/onboard/launch) + PO fail-safe 감지점(po-runner/hook). 2개 레포(full+lite) touch-set + 순서. 그 후 impl + QA grill(load-bearing 설치 훅).

## Outcome
done — clobber 진단: lite install이 basename(`session-start-doctrine.sh$`)으로 strip → full 동명 훅 제거(양방향 latent). fix: #20-A lite strip을 exact-path(`!= $cmd`)로 + #20-B1 full is_pdt에서 공유-basename fallback 제거(path-scoped만) → 상호 비-clobber. #19a trust 자동수락(full init-project.mjs setTrustAccepted + 런처 ensure_trust + `--trust-accept` CLI / lite 런처 jq every-launch; atomic·realpath·backup·idempotent·non-blocking). #19c PO fail-safe(8 agent .md: doctrine 블록 없으면 roleplay 금지+안내 / 양 hook `! -s` 빈파일 fail-loud). **PO-verify pass**: 양 설치순서 공존 /tmp 실측(full=1·lite=1 both orders) + bash-n/node + fail-safe/`-s` grep. trust 실파일 round-trip=dev functional 검증. full=v0.6, lite=별도 레포. ※ session-limit로 grill 미완 — 1pm 후 재grill 권장(backlog).

## Persona Activity
(PO-managed)
