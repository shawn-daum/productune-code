---
id: 1
scope: project
title: PRD master 파일명을 PRD.md 로 통일 (md-single-SoT)
auto_check: ls docs/prd/*.md 2>/dev/null | grep -qv '/PRD.md'
---

## 배경

PRD 가 md 단일 SoT 가 되면서 GUI 와 doctrine write map 이 `docs/prd/PRD.md` 고정 경로를
읽는다. 프로젝트별 임의 파일명 (`<project>.md` 등) 은 write-map drift 를 만든다.

## PO 지시 프롬프트

> migration 0001 적용해줘: docs/prd/ 의 PRD master 파일명을 PRD.md 로 통일.
> 1. `git mv docs/prd/<현재이름>.md docs/prd/PRD.md`
> 2. 활성 문서의 옛 경로 참조를 갱신 (닫힌 티켓 본문의 링크는 역사 기록이라 보존)
> 3. 적용 후 `.productune/config.json` 의 `schema_v` 를 1 로 갱신 (jq)
