---
id: 3
scope: project
title: 닫힌 버전의 PRD 스냅샷 백필 (docs/prd/versions/)
auto_check: V=$(jq -r '[.versions[]?|select(.ended_at!=null)]|sort_by(.ended_at)|last|.id // empty' .productune/po-state.json 2>/dev/null); [ -n "$V" ] && [ ! -f "docs/prd/versions/$V.md" ]
---

## 배경

버전 close 시 `docs/prd/versions/<v>.md` 불변 스냅샷이 의무가 됐고 (p5-close Master
archive), `pre-phase-gate-guard.sh` 가 이를 기계 강제한다 — **최근 닫힌 버전의 스냅샷이
없으면 다음 버전 시작 (G5) 과 다음 close (G4) 가 block** 된다. 기존 프로젝트는 소급
백필이 필요하다.

## PO 지시 프롬프트

> migration 0003 적용해줘: 닫힌 버전들의 PRD 스냅샷을 소급 생성.
> 1. po-state 의 `versions[]` 에서 `ended_at` 이 있는 버전 목록 확인
> 2. 각 버전의 close 시점 커밋을 git 이력에서 찾고 (`git rev-list -1 --before=<ended_at> HEAD`)
>    그 시점의 PRD 파일을 `docs/prd/versions/<v>.md` 로 추출 — 파일 머리에 스냅샷 배너
>    1줄 (`> **[버전 스냅샷 — <v>]** close 시점 불변 기록, 소급 생성`) 추가
> 3. PRD 파일이 존재하기 전에 닫힌 초기 버전은 건너뛰고 사용자에게 보고
> 4. 적용 후 `.productune/config.json` 의 `schema_v` 를 3 으로 갱신 (jq)
