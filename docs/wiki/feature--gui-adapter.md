---
title: GUI 어댑터 (gui-adapter) — prdt dual-mode 아키텍처
type: feature
status: live
version: v1.1
links: ["decision--v1-single-line", "fact--gui-testing-env", "learning--sweep-discipline"]
---
# GUI 어댑터 — prdt dual-mode 아키텍처 결정 모음

v1.1의 중심 작업 (T-283~T-312). GUI가 prdt(`.prdt/`) 프로젝트를 legacy(`.productune/`)와 공존 지원하도록 만든 어댑터 계열의 확정 결정들.

## 판별 (detection)
- **project-kind은 projectDir 디스크 감지** — `.prdt/` 존재→prdt, else legacy. 단일 분기점: electron은 `electron/project-paths.ts`, core는 `src/state/project-kind.ts` (core→gui import 불가라 2곳 중복 — 세 번째 위치가 필요해지면 공유 패키지 추출 검토). prdt엔 heal 분기 없음(legacy heal의 initProject가 잘못된 `.productune/` 생성 위험).
- **renderer는 IPC 신설 없이 `isPrdtPoState(poState)`** — `typeof stage === 'string'` 판별. hook-install 배너 포함 A2~T-310 전부 이 단일 경로 재사용이 컨벤션.

## 경로·상태
- A1 스코프 경계: PROJECT-dir 경로만 dual-mode. 홈디렉토리(`~/.prdt`/`~/.productune`)는 설치 레벨 관심사 — GUI prdt hook 등록은 반드시 `install.sh`가 만든 `~/.prdt` 미러를 가리킨다(번들 coreDir 금지 — prdt hook 3종은 v1 repo 전용이라 legacy 번들에 없음).
- **version 브리지는 store-ingress 정규화** (`bridgePrdtVersion`, copy-on-write) — prdt flat `version`을 `current_version`으로 미러, legacy는 참조 passthrough, `versions[]`는 절대 합성 안 함(소멸 제도 UI 억제 유지). electron main은 디스크 직독이라 사이트별 수정. 주의: prdt 버전 범프가 legacy rename-guard엔 'rename'으로 보임 — guard는 legacy-only 게이트, current_version 전이 소비처 추가 시 동일 함정.
- po-runner는 env 파일 내용을 파싱하지 않음(존재 게이트만) — `~/.prdt/prdt.env` 계승에 필드 매핑 0건.

## 표시·기능
- UsageBar prdt 지표 = 프로젝트 누적 비용(turns.jsonl 합, per-session MAX 집계로 누적 스냅샷 이중계상 회피) — rate-limit % 제도는 v1 소멸. 세션 단위가 필요해지면 claudeSessionId 필터 후속.
- 4-stage 색: define #FB923C · build #38BDF8 · ship #F472B6 · retro #34D399 (Designer sign-off, T-313).

## legacy 지원 상태
- [[decision--v1-single-line]] 이후: legacy는 **조회 전용** (T-311) — 온보딩/설치 배선 없음, legacy 트리는 삭제됨(T-293). `prdt-install.sh` deprecation forwarder는 전 기기 `prdt update` 1회 후 제거 가능.
