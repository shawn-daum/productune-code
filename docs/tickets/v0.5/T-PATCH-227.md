---
ticket_id: T-PATCH-227
version: v0.5
slug: mobile-maestro-smoke-not-wired
title: ios/android surface가 smoke:null로 굳어 maestro가 안 도는 갭 (기기 간 비일관 + 매번 되물음)
type: doctrine
status: todo
phase: 3
assignee: pdt-po
requires_qa: true
requires_user_gate: false
area_tag: surface-config
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-227: mobile maestro smoke가 안 묶이는 갭

## Request

shawn(2026-06-19): 어떤 프로젝트(flutter)에서 smoke를 maestro로 구축했는데, **다른 기기에선
그걸 안 듣고 `smoke: null`로 떨어짐.** QA가 "android/ios의 경우 smoke null인데 maestro를
할까요?"라고 매번 되물음. 정확한 config 값은 그 뒤 수정됐을 수 있어 미상이나, **구조적 갭**은
값과 무관하게 재현됨.

## 현황 — 왜 null로 굳고 매번 되묻나 (조사)

- `surfaces[X].smoke: null` = "스크립트 미작성"을 의미(`qa/bookshelf/surface-config-schema.md:14`).
  QA 규칙: null → manual fallback + summary 기록, never silent-skip(:24).
- ios/android는 `smoke_driver: maestro`로 매핑되나(:26), maestro smoke가 동작하려면 **두 가지가
  같이 있어야 함**: (a) config `surfaces[X].smoke` = maestro 실행 명령(예: `maestro test .maestro/`)
  + (b) **`.maestro/*.yaml` flow 파일**(designer/dev가 작성하는 실제 테스트 시나리오).
- surfaces 블록 author 소유 = PO(:write rules), flow 파일 소유 = 미정의. 둘 중 하나라도 없으면
  smoke가 실질 null → QA manual fallback/되물음.
- **기기 간 비일관 원인**: surfaces는 config.json에 커밋되는 값이라 기기 간 동일해야 하나,
  maestro smoke 명령이 **author 안 된 채(또는 null로) 커밋**됐거나, flow 파일이 그 기기에
  없으면(gitignore/미커밋) → 다른 기기에서 null로 떨어짐.
- `p3-build.md:4`는 P3 open에 simulator **prereq(디바이스)** 검증만 하고, **smoke 명령/flow
  존재 자체**는 검증 안 함 → "디바이스는 보는데 maestro 배선은 안 봄" 갭.

## 설계 방향

1. **mobile surface smoke 배선 규칙 명문화**: `surfaces[ios|android].smoke` = maestro 명령을
   PO가 init/surface-change 시 author(현 PO write whitelist에 surfaces 포함됨 — 단 "mobile이면
   maestro 명령 + flow 경로 author" 명시 추가). null로 두지 말 것 — 진짜 미작성이면 그 사실을
   close-gate/summary에 명시적 노출(silent-null 금지 강화).
2. **flow 파일 소유·위치 정의**: `.maestro/*.yaml` 누가 언제 만드나(QA type:test? dev?), gitignore
   대상 아님(커밋돼 기기 간 공유). flow 부재 = smoke 불가이므로 그 의존을 명시.
3. **P3 open prereq 검증 확장**(`p3-build.md`): 디바이스 prereq뿐 아니라 **maestro smoke 명령
   존재 + flow 파일 존재**까지 확인 → 없으면 "maestro smoke 미배선 — flow 작성/명령 author
   필요"를 1회 surface(매 turn 되묻기 X, P3 open 1회 결정).
4. **QA 되물음 제거**: smoke가 배선돼 있으면 QA는 묻지 않고 실행, 진짜 null이면 한 번만
   manual fallback 기록(매번 "maestro 할까요?" 반복 금지). 이건 결정이 config에 박히면 자연 해소.

## Acceptance

- **AC-1**: ios/android surface의 maestro smoke 배선 규칙(명령 + flow 파일)이 surface-config-schema
  + p3-build에 명문화된다.
- **AC-2**: `.maestro` flow 파일의 소유·위치·커밋(gitignore 제외) 정책이 정의된다.
- **AC-3**: P3 open prereq 검증이 디바이스뿐 아니라 maestro 명령/flow 존재를 확인하고, 미배선
  시 1회 surface한다(매 turn 되묻기 없음).
- **AC-4**: smoke가 배선된 mobile 프로젝트는 기기를 바꿔도 동일하게 maestro가 돈다(config +
  flow가 커밋돼 동기화되므로).

## Out of scope

- maestro flow 시나리오 자체 작성(프로젝트별). 실제 디바이스/시뮬레이터 셋업(env).

## 확인 (2026-06-22)

maestro는 코드/스크립트/GUI 어디에도 하드코딩 경로가 없고 **오직 `surface-config-schema.md`
doctrine + config `surfaces` 기반**으로만 동작함(grep 전수 확인). 따라서 maestro smoke의 기기
간 동작은 **config surfaces 값 + `.maestro` flow 파일의 git 동기화에 100% 의존** — shawn이 다른
기기에서 그 smoke가 안 돈 증상의 직접 원인. "qa workflow에 maestro 추가"는 driver 매핑을
doctrine에 넣은 것이고, 실제 프로젝트 config에 maestro 명령/flow를 박아 **커밋·동기화**하는
것은 별개 작업이라 갭이 생김.

## 메모 (확정 진단용)

근본 원인 후보 A/B/C 중 본 티켓은 **B(surfaces에 maestro smoke가 null/미배선)** + flow 파일
부재 가설. 정확 확정엔 그 flutter 프로젝트의 `.productune/config.json` `surfaces` 블록 +
`.maestro/` 디렉터리 커밋 여부 실물 필요 — 받으면 A/B/C 즉시 가림. C(디바이스 부재)면 정상
동작(env fail ≠ product fail)이라 doctrine 변경 불요, 그땐 본 티켓 범위 축소.

## QA 노트

cua는 macOS 데스크톱 surface 전용이라 mobile maestro 검증엔 부적합 — 본 티켓 QA는 doctrine
grill(배선 규칙 정합 · p3 prereq 확장 정합) + 실 mobile 프로젝트 hands-on. 참고:
`qa/bookshelf/surface-config-schema.md`.
