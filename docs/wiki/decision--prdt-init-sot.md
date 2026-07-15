---
title: 프로젝트 생성 SoT = prdt init --json (project creation single source of truth)
type: decision
status: live
version: v1.1
links: ["feature--gui-adapter", "fact--claude-hooks"]
---

# 결정 — 모든 프로젝트 생성/마이그레이션은 `prdt init --json` 단일 SoT

(T-321, 2026-07-07경 확정)

- 모든 GUI 프로젝트 생성 경로(`project:create`/`installAt`/`init:project`)는 `~/.prdt/bin/prdt init --json` (cwd=projectDir)로 위임. 마이그레이션은 `prdt migrate`.
- 레거시 `.productune`-writing `initProject`는 생성/마이그레이션에 더는 사용하지 않음 — GUI가 새 `.productune`을 낳지 않음. prdt CLI 부재 시 명시 Error (조용한 fallback 금지).
- 배경: pdt-* 에이전트 완전 은퇴(T-293/T-311)로 T-285 dual-registration 모델 obsolete — 런타임 스폰/resolve는 prdt-* 단일 (`poAgentFor` = 상수 `prdt-po`).
- 근본 원인 기록: `.productune` 재탄생 버그는 `project:create`가 문서화된 계약(prdt init --json) 대신 레거시 mjs를 호출해서 발생 — 로컬 green이 놓친 이유는 create→spawn 체인 e2e 테스트 부재.
- 잔존 예외 (의식적 유보): `tryHealProject`(config 없는 기존 `.productune` heal-on-open)는 여전히 레거시 initProject 경유 — 신규 생성이 아닌 heal이고 이후 마이그레이션 버튼이 노출되므로 현행 유지. migrate-prompt 대체는 다음 버전 검토 항목.
