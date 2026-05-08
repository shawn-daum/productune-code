# Developer project notes

페르소나 work-note / discoveries 누적. 새 ticket 작업 전 빠르게 훑어 과거 발견사항 재발견 비용 절약.

각 항목 = 한 줄 fact + ticket / 발견자 reference. 본격 plan 은 design doc / ticket 본문 참조.

---

## 2026-05-07

- **BSD grep `-P` 사실상 no-op** — `grep -qP "..."` 가 macOS BSD grep 에서 `usage: ...` 에러로 종료, `2>/dev/null` 로 stderr 억제 + exit code 만 보면 silent fail → 모든 패턴 미매칭. 증거: `packages/gui/scripts/check-locale-protected.sh` 가 T-P4-049 의 `"완료"` (status enum `done` 한글 번역) baseline 통과. 향후 .sh linter 추가 시 **perl** (`/usr/bin/env perl` + `-CSDA` UTF-8) 또는 Node.js script 우선. discovered T-P4-046 land, fix T-P4-057.
- **perl `-CSDA` 단독 함정 — `-Mutf8` 필수** — macOS perl 5.30+ 에서 `-CSDA` 만 켜면 파일은 Unicode char stream 으로 디코딩되지만 shell 인라인 한글 literal 패턴은 byte string 으로 남아 char/byte 불일치 → silent no-match. `-CSDA -Mutf8` 둘 다 켜야 regex source 도 UTF-8 char 로 해석됨. 후속 .sh linter 작성 시 동일 trap 회피. discovered T-P4-057 dev.
- **`.claude/settings.local.json` 잔재 = Write deny** — 다른 user 의 폴더 받아오면 그 사람의 `.claude/settings.local.json` 도 따라옴. allow 의 path glob 이 절대경로 (`/Users/<other>/...`) 라 본 user 작업 시 매칭 안 됨 → ask → 백그라운드 sub-agent 응답 X → deny. agent `permissionMode: bypassPermissions` 는 system-level path matching 우회 못 함. fix: 파일 통째 교체 또는 자체 path 추가. 근본: gitignore + init 시 foreign user path detect & backup. discovered paepyeong dogfood, fix T-P4-058.
- **session-level permission cache** — claude code 의 permission state 가 session 안에서 persistent. settings.local.json 변경 / 페르소나 spec frontmatter 변경 후에도 **기존 session 은 옛 cache 사용** → 같은 deny 반복. fix: **새 session 띄워야 반영**. discovered paepyeong dogfood (T-P4-058 settings 박은 후에도 deny 지속, restart 후 통과). T-P4-059 가 GUI 에서 이 상태를 사용자에게 visibility 로 노출 + restart CTA 제공.
- **sub-agent vs 메인 세션 권한 layer 분리** — 메인 세션 (PO) = `settings.local.json` `permissions.allow` + agent frontmatter `permissionMode` 둘 다 적용. sub-agent (designer/developer/qa/wiki-keeper) = **frontmatter `permissionMode` 만 봄, settings.local.json 무시**. 즉 sub-agent 가 자동화 (백그라운드 호출) 으로 작동하려면 frontmatter `bypassPermissions` 필수. 메인 세션은 `acceptEdits` 가 안전 (사용자 confirm 보존). discovered paepyeong dogfood, doctrine commit `5ab7e2e`.

## 2026-05-08

- **multi-axis schema migration — schema_version 1→2 통합** — Phase 1~5 doctrine + ticket stage→type rename + po-state slim 동시 schema 변경 시 단일 jq idempotent transform 묶어야 부분 migration 충돌 X. `schema_version` top-level key 가 idempotent guard. 부분 land 시 중간 상태 발생 → 사용자 환경 partial sync. T-P4-065 통합 ticket 안 sub-area 별 분리 impl 권장이지만 schema migration 자체는 한 sequence. discovered T-P4-065 design.
- **Phase axis ↔ ticket type axis 분리** — 사용자 가시 5단 (PRD/Design/Build/Deploy/Close) = doctrine Phase 1~5 동일 어휘. ticket type (design/impl/refactor/test/qa/deploy) = 별 axis. 같은 어휘 "stage" 사용 시 멘탈 모델 충돌 → ticket axis = `type` rename. doctrine `sections/stages.md` → `po-loop.md` rename (Three stages = PO 루프 3 step, ticket type 과 무관). discovered T-P4-065 sub-d.
- **chunking ceilings — designer 호출 단위** — 한 designer 호출 = 1~2 산출물 land + 1 sub-area 만. 큰 directive 욱여넣으면 시간 길어지다 막힘 + 산출물 품질 저하 + reject 시 모두 retry. doctrine: `packages/core/po/sections/delegation.md ## Chunking — delegation size limits`. 좋은 사례: promotion lifecycle 5단계 분리 호출. 안 좋은 사례: T-P4-065 첫 시도 (9 산출물 + 5 sub-area) reject. discovered T-P4-065 reject + chunking doctrine commit `b2fbe52`.
