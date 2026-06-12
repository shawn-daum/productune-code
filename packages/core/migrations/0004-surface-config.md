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
> 3. 기존 config 에 **MERGE** — 절대 전체 재작성 금지. 기존 top-level 필드
>    (`slug`·`created_at`·`version` 및 그 외 전부) 는 그대로 보존하고 `surfaces` 블록만
>    ADD + `schema_v` 만 4 로 갱신한다. 파일 손수 재작성하지 말고 jq 로 in-place 갱신:
>    `jq '.surfaces = {...} | .schema_v = 4' .productune/config.json > tmp && mv tmp .productune/config.json`
> 4. 적용 후 `slug` 보존 확인: `jq -e '.slug' .productune/config.json` (없으면 MERGE 실패 — 복구)
