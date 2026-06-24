---
ticket_id: T-PATCH-231
version: v0.5
slug: claude-spawn-health-smoke
title: claude spawn 헬스 스모크 — 시작/첫턴 실패 시 더미 spawn으로 원인 분류(auth 401·미설치·비호환 조기 감지)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: engine-exec
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-231: claude spawn 헬스 스모크

## Request

shawn(2026-06-22, 선택 a). productune은 통제 밖 `claude` CLI에 의존 → claude 인증 만료/
업데이트/미설치 시 PO turn이 **silent하게 깨짐**(매번 사용자 신고로만 인지). 실제 사례:
GUI PO turn이 `claude exited with an error (code 1)`로 죽었는데 **stderr 0바이트**라 원인이
안 보였고, cua 격리 진단으로 한참 파서야 **claude API 401(인증)** 임이 드러남(turn은
`terminal_reason:completed`인데 `result.is_error=true, 'API Error: 401'`). 시작/첫 실패 시
**자동 원인 분류 + actionable 노출**이 있었으면 즉시 잡혔을 케이스.

## 설계 방향 (헬스 스모크 — 폴백형)

- **트리거**: PO turn이 비정상 종료(exit≠0) 또는 result.is_error=true일 때 **자동 1회** 헬스
  스모크(평상시 토큰 0). 선택적으로 온보딩/앱 시작 시 1회.
- **스모크 = prod spawn과 동형**(stdio·플래그·env 동일)으로 trivial 프롬프트 1회 spawn →
  stream-json의 **`result.subtype`/`is_error`/`error`** 를 파싱해 원인 분류:
  - `error=authentication_failed` / 401 → "claude 인증 만료/무효 — `claude auth login` 재로그인 필요"
  - spawn ENOENT / `command -v claude` 실패 → "claude 미설치 — claude.ai/code"
  - exit≠0 + completed 아님 → "claude 비호환/오류 — 버전 확인"
- **핵심**: claude는 401에도 turn 로직을 'completed'로 내고 exit 1 → **exit code만 보면 안 되고
  stream-json `result.is_error`/`error`까지 파싱**해야 정확히 분류됨(이번 진단의 교훈).
- **결과 노출**: GUI actionable 배너 + PO Log(현재 빈 placeholder라 stderr 미노출 — 이 갭도
  같이; 최소한 result.error를 배너에 표면화). CLI는 stderr/안내 출력.

## Acceptance

- **AC-1**: PO turn이 exit≠0/`is_error`로 끝나면 헬스 스모크가 자동 1회 돌아 원인을 분류한다.
- **AC-2**: 인증 실패(401)·미설치·비호환을 각각 구분된 actionable 메시지로 노출한다(silent 사망 금지).
- **AC-3**: 분류가 exit code가 아니라 stream-json `result.is_error`/`error`(+ spawn 에러)를 근거로 한다.
- **AC-4**: 평상시(정상) 토큰/지연 오버헤드 0(폴백형 — 실패 시에만).

## Out of scope

- claude 버전 pin. PO Log 패널 전체 구현(별도 — 단 result.error 배너 노출은 본 티켓).

## 메모

T-PATCH-230(GUI code-1)의 진짜 원인 = cua VM의 stale keychain 토큰 401(하니스 아티팩트,
제품 버그 아님). 그 진단이 오래 걸린 이유 = silent 0-stderr exit 1. 본 티켓은 그 silent
실패를 자동 분류·노출해 재발 시 즉시 원인 파악하게 함. 참고: `docs/qa/bookshelf/cua-vm-harness.md`
(GUI=keychain 인증 교훈).

## QA 노트

cua: 인증 정상→스모크 pass. keychain 토큰 제거/만료 상태→401 분류 + 배너 노출 확인.
미설치 상태→미설치 분류. (GUI 검증은 cua-vm-harness.md의 keychain 절차 선행.)

## Close (2026-06-22)

dev sonnet 구현 → qa sonnet PASS(0 must-fix). 8파일: `po-runner.ts`(runHealthSmoke 신규 폴백 함수 + SmokeClassification/Result type), `ipc/po.ts`(withSessionCapture onDone가 lastHealthState==='error-other'일 때만 smoke 1회 발화), `preload.ts`, `store/sessionHealth.ts`, `SessionHealthBanner.tsx`(auth/not-installed/incompatible 3분류 actionable copy), `useIpcSubscriptions.ts`, locale en/ko.
- AC-1~4 전부 PASS. ★AC-3 핵심 — 분류 근거가 exit code 아니라 stream-json `result.is_error`/`result.error`(`/authentication_failed|401/`) 우선, exit code는 봉투 부재 시 fallback, ENOENT는 spawn error로 not-installed.
- AC-4 — 정상 턴 토큰/지연 0(error-other 아니면 미호출).
- RISK-1 fix 적용: `ipc/po.ts` smoke then/catch에 `wc.isDestroyed()` 가드(async 완료 전 창 닫힘 'Object destroyed' 방지). build EXIT0(tsc+vite, 906 locale parity).
- **라이브 hands-on 잔여**: keychain 토큰 제거→401 분류+배너 노출 cua/VNC 확인(헤드리스 불가). 미커밋(commit-on-request).

## Deploy live-verify (2026-06-23, cua-VM + VNC) — not-installed PASS · auth/401 부분(발견)

fresh arm64 dmg 설치본에서:
- **AC-1/AC-2/AC-3 (not-installed) ✅**: claude 바이너리 숨김(`~/.local/bin/claude` mv) 후 PO turn → spawn 실패 → 헬스 스모크 자동발화 → **"Claude Code CLI not detected. Install it from claude.ai/code … then retry — Settings → engine to reconnect."** actionable 배너 노출. 분류근거 = spawn ENOENT(exit code 아님). silent 사망 아님.
- **auth/401 분기 ⚠️ 부분 — 발견**: keychain 토큰을 합성 무효토큰으로 손상 후 turn → claude exit 1 → 배너가 **"claude exited unexpectedly — version may be incompatible" (incompatible 분류)** 로 떨어짐(auth 아님). 합성 무효토큰은 깨끗한 stream-json 401 봉투를 만들지 않고(토큰 refresh 실패 경로 추정) exit-code fallback → incompatible. 즉 **일부 인증실패가 auth 아닌 incompatible로 분류될 수 있음** — 헤드라인 시나리오(진짜 만료토큰 API 401)는 진짜 stale 토큰 없인 재현 불가. 스모크 발화 + actionable 배너(AC-1) 자체는 동작. classification matcher가 401 봉투에만 의존 → 인증실패 일부 미커버 가능성 = 후속 검토 후보(진짜 401 발생 시 재검증, 또는 matcher 확장).
- 검증 후 keychain 토큰 원복(백업→복원, claude --print AUTH_OK 확인) + 바이너리 복원 완료.
