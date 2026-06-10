---
id: 4
scope: project
title: .productune/config.json surfaces 블록 백필
auto_check: jq -e '.surfaces' .productune/config.json >/dev/null 2>&1 && exit 1; exit 0
---

## 배경

QA 3-item gate 의 build·smoke 명령을 레포에서 매번 추론하는 대신
`.productune/config.json` 의 `surfaces` 블록에서 조회한다 (스키마:
`~/.productune/doctrine/persona/qa/bookshelf/surface-config-schema.md`).
`surfaces` 없는 프로젝트는 legacy 모드(레포 추론)로 동작하며 이 migration 이 백필한다.

## PO 지시 프롬프트

> migration 0004 적용해줘: `.productune/config.json` 에 `surfaces` 블록 백필.
> 1. 제품의 surface 를 식별 (web / electron / ios / android / node-lib / cli / server)
>    하고 각 surface 의 build·smoke 명령을 레포에서 조사
> 2. `surface-config-schema.md` 스키마대로 `surfaces` 블록 작성 — smoke 스크립트가
>    아직 없으면 `smoke: null` (QA 는 manual fallback)
> 3. 적용 후 `.productune/config.json` 의 `schema_v` 를 4 로 갱신 (jq)
