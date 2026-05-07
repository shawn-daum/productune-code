# Developer project notes

페르소나 work-note / discoveries 누적. 새 ticket 작업 전 빠르게 훑어 과거 발견사항 재발견 비용 절약.

각 항목 = 한 줄 fact + ticket / 발견자 reference. 본격 plan 은 design doc / ticket 본문 참조.

---

## 2026-05-07

- **BSD grep `-P` 사실상 no-op** — `grep -qP "..."` 가 macOS BSD grep 에서 `usage: ...` 에러로 종료, `2>/dev/null` 로 stderr 억제 + exit code 만 보면 silent fail → 모든 패턴 미매칭. 증거: `packages/gui/scripts/check-locale-protected.sh` 가 T-P4-049 의 `"완료"` (status enum `done` 한글 번역) baseline 통과. 향후 .sh linter 추가 시 **perl** (`/usr/bin/env perl` + `-CSDA` UTF-8) 또는 Node.js script 우선. discovered T-P4-046 land, fix T-P4-057.
- **perl `-CSDA` 단독 함정 — `-Mutf8` 필수** — macOS perl 5.30+ 에서 `-CSDA` 만 켜면 파일은 Unicode char stream 으로 디코딩되지만 shell 인라인 한글 literal 패턴은 byte string 으로 남아 char/byte 불일치 → silent no-match. `-CSDA -Mutf8` 둘 다 켜야 regex source 도 UTF-8 char 로 해석됨. 후속 .sh linter 작성 시 동일 trap 회피. discovered T-P4-057 dev.
