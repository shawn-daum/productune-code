---
id: 2
scope: project
title: docs/artifacts/<version>/manifest.json 백필
auto_check: for d in docs/artifacts/*/; do [ -d "$d" ] || continue; [ -f "${d}manifest.json" ] || exit 0; done; exit 1
---

## 배경

GUI 가 산출물을 매직 파일명 대신 manifest 로 주소화한다 (스키마:
`~/.productune/doctrine/persona/designer/bookshelf/artifact-manifest-schema.md`).
manifest 없는 버전 폴더는 GUI 표시·user-gate 상태·오배치 lint 에서 제외된다.

## PO 지시 프롬프트

> migration 0002 적용해줘: 기존 산출물을 manifest 로 백필.
> 1. productune repo 의 `scripts/backfill-artifact-manifest.mjs` 를 이 프로젝트 루트에서 실행
>    (`node <repo>/scripts/backfill-artifact-manifest.mjs .` — 멱등)
> 2. `bash <repo>/scripts/ci/check-artifact-manifest.sh .` 로 정합 확인 — 미등록/댕글링이
>    나오면 항목별로 분류해 사용자에게 surface (flat 규칙 위반 파일은 archive/ 평탄화 제안)
> 3. 적용 후 `.productune/config.json` 의 `schema_v` 를 2 로 갱신 (jq)
