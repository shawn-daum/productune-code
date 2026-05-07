# Developer project notes

페르소나 work-note / discoveries 누적. 새 ticket 작업 전 빠르게 훑어 과거 발견사항 재발견 비용 절약.

각 항목 = 한 줄 fact + ticket / 발견자 reference. 본격 plan 은 design doc / ticket 본문 참조.

---

## 2026-05-07

- **BSD grep `-P` 사실상 no-op** — `grep -qP "..."` 가 macOS BSD grep 에서 `usage: ...` 에러로 종료, `2>/dev/null` 로 stderr 억제 + exit code 만 보면 silent fail → 모든 패턴 미매칭. 증거: `packages/gui/scripts/check-locale-protected.sh` 가 T-P4-049 의 `"완료"` (status enum `done` 한글 번역) baseline 통과. 향후 .sh linter 추가 시 **perl** (`/usr/bin/env perl` + `-CSDA` UTF-8) 또는 Node.js script 우선. discovered T-P4-046 land, fix T-P4-057.
