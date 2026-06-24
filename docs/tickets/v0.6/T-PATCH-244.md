---
ticket_id: T-PATCH-244
version: v0.6
slug: distmac-arch-host-only-regression
title: dist:mac이 host arch(arm64)만 빌드 — electron-builder.yml의 arm64+x64를 CLI 인자가 덮어씀
type: impl
status: todo
phase: 4
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: build-dist
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-244: dist:mac arch host-only 회귀

## Request

shawn(2026-06-23, dmg Deploy 중 PO 발견): `pnpm --filter @productune/gui run dist:mac` 실행
시 **arm64 dmg만 생산**되고 x64 dmg는 갱신 안 됨(release/의 `productune-0.5.0.dmg`가 6/16자
stale로 남음). `electron-builder.yml`은 `mac.target.arch: [arm64, x64]`로 양 arch를 선언하지만,
package.json의 `dist:mac` = `electron-builder --mac dmg --config electron-builder.yml`에서
**CLI `--mac dmg` 인자가 YAML의 target(+arch 리스트)을 통째로 override** → arch가 host(arm64)
하나로 떨어짐. builder-debug.yml에 `arm64` 키만 남는 것으로 확정.

(6/16 release엔 x64 dmg도 있었음 = 회귀이거나 당시 별도 invocation.)

## 영향 / 우선순위

- **v0.5 deploy-blocker 아님**: 이번 배포는 arm64-only로 user 결정(2026-06-23). x64 미배포.
- **v0.6 이연 확정(user, 2026-06-23)**: 향후 Intel mac 멀티-arch 배포 필요 시점에 fix. v0.5 Deploy 중 발견 → v0.6 티켓으로 이동.

## Acceptance

- **AC-1**: `dist:mac`(또는 후속 명령)이 electron-builder.yml의 `mac.target.arch` 선언대로
  **arm64 + x64 dmg 둘 다** 생산한다(release/에 두 .dmg 모두 신규 mtime).
- **AC-2**: 수정 방식은 (a) `--mac dmg --arm64 --x64` 명시, 또는 (b) CLI target override 제거
  하고 YAML이 target+arch를 구동(`electron-builder --mac --config electron-builder.yml`) 중 택1.
- **AC-3**: 빌드 후 두 dmg의 바이너리 arch가 각각 arm64 / x86_64로 검증(`lipo -archs`).

## Out of scope

- universal binary(단일 dmg) 전환 — 별도 결정.
- 서명/공증(여전히 무서명 — B4 범위).

## Plan
(dev — package.json `dist:mac` 1줄 수정 + 재빌드 검증. L1.)

## Outcome
null

## Persona Activity
(PO-managed)
