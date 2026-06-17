---
ticket_id: T-PATCH-187
version: v0.5
slug: build-launcher-to-run-launcher
title: Build 런처 → ▶ Run 런처 (env 파일 자동발견 + Preview 자동 + 탭닫으면 서버 종료)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: run-launcher
risk_flags: spawn-security
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 60
---

## Problem
사용자: "내가 원한 건 Build가 아니라 Run이다. Smoke는 PO가 QA시키는 흐름이지 버튼이 아님." 기존 Build(+Smoke) 런처는 앱을 띄워 미리보는 수단이 없었음. 환경은 타입마다 다르므로(web=env.*, gui=불필요) 케이스 분기 필요.

## Fix
- `surfaces.<key>.run` 신설(additive, schema_v 불변): `string`(단일 명령) | `{ command, preview? }`(환경은 프로젝트 `.env*`에서 자동발견).
- 환경 레이블 = `.env.` 접두사 제거 후 나머지 그대로(1:1 유일; `.env.prod` vs `.env.prod.local` 충돌 회피). `*example*` 제외.
- 선택 환경 → 해당 `.env*` 파싱해 child env 주입(라벨은 발견 집합으로 검증 → 렌더러 임의경로 차단; security_6 모델 불변).
- `NODE_ENV`: process.env에서 먼저 제거(Electron dev값 누수→`next build` 깨짐 방지) 후 env파일 적용.
- Run → 서버 spawn → stdout localhost URL 첫 감지 시 인앱 'browser' Preview 탭 자동 오픈.
- 탭 닫으면 `closeTab`에서 SIGTERM(detached spawn + process-group kill — `sh -c` 손자까지). 단일 글로벌 락 제거(서버 동시 실행).
- Smoke UI 제거.

범위: web + gui. app(flutter) 기기선택+PTY는 후속.

## QA
paepyeong web Run(local/prod.local/test.local) → Preview 자동, 탭닫으면 포트 해제 — 사용자 확인 + 빌드 통과.
