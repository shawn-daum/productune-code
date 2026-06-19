---
ticket_id: T-PATCH-218
version: v0.5
slug: claude-detect-path-and-missing-ux
title: PO claude 검출(canSpawnClaude) PATH false-negative + 진짜-미설치 시 echo→설치/로그인 안내
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: engine-exec
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
completed_at: 2026-06-19T00:00:00Z
---

# T-PATCH-218: PO claude 검출 PATH + 미설치 UX 분기

## Request

cua VM에서 claude 설치+인증 후에도 PO 메시지 전송 시 **"echo mode — claude CLI not
detected"** 로 빠짐(shawn VNC 실측). 두 문제:

1. **검출 false-negative (버그)** — `po-runner.ts canSpawnClaude()` 가
   `process.env.PATH`(launchd 최소 PATH)만 순회하며 `existsSync(p/claude)` 체크.
   Finder/패키징 launch는 `~/.local/bin`·Homebrew 를 PATH에 안 넣으므로 claude 가
   설치·인증돼 있어도 "미검출" → echo mode. **실제 spawn(line ~512)은 T-PATCH-216에서
   withLoginShellPath 로 고쳤는데, 그 spawn을 게이트하는 이 검출은 누락**(216 miss).
2. **미설치 UX (요청)** — claude 가 *진짜* 없을 때 echo mode(원래 dev 편의용)로 조용히
   빠지면 일반 사용자에겐 혼란. 설치/로그인 안내를 노출해야 함(shawn 요청).

## 설계 방향

- **#1**: `canSpawnClaude` 가 `withLoginShellPath(process.env).PATH` 를 분할 검색 →
  실제 spawn과 동일 PATH. 검출 ≡ spawn 일치. (`path.delimiter` 사용)
- **#2**: echo fallback 진입 시, 패키징 앱(`app.isPackaged`)에서는 echo 대신
  "Claude Code CLI 미검출 — claude.ai/code 설치 후 로그인하고 재시도" 안내를 시스템
  메시지로 노출(기존 locale `engine.installHint` 재사용). dev(`!isPackaged`)는 기존
  echo mode 유지(UI 구동 편의).

## Acceptance

- **AC-1**: Given 패키징 앱(Finder launch) + claude 가 `~/.local/bin` 설치·인증,
  When PO 메시지 전송, Then echo mode 가 아니라 **실제 PO turn 이 돈다**(claude spawn,
  PRD 인터뷰 응답 스트리밍). (cua VM 실측)
- **AC-2**: Given 패키징 앱 + claude 미설치, When PO 메시지 전송, Then echo 무한반복이
  아니라 설치/로그인 안내가 명확히 노출된다.
- **AC-3**: dev(`!app.isPackaged`)는 기존 echo mode 동작 유지(회귀 없음).
- **AC-4**: 검출 PATH 로직이 실제 spawn(withLoginShellPath)과 동일 소스를 쓴다(drift 방지).

## Out of scope

- 앱 내 "엔진 연결" 설정 패널 재설계(별도).
- codex 검출(폐기 결정).

## QA 노트

cua VM: (a) claude 설치+인증 상태 → 실제 PO turn 확인, (b) claude 제거 상태 → 안내
노출 확인. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

---

## QA sign-off (2026-06-19, cua VM 실측) — qa_status: pass

- **AC-1 PASS (라이브)** — claude 설치+인증된 패키징 앱에서 PO 메시지 전송 → echo가
  아니라 **실제 PO turn 구동** 확인: `claude --agent pdt-po --print --output-format
  stream-json ...` spawn, PRD 인터뷰 응답 스트리밍 + 팀 위임까지 동작.
- **AC-4 PASS** — canSpawnClaude가 spawn과 동일 `withLoginShellPath` 사용(단일 소스).
- **AC-3** — dev echo mode는 `!app.isPackaged` 가드로 보존(코드상, 회귀 없음).
- **AC-2 구현됨, 라이브 미검증** — `claudeMissingNotice`(패키징+claude부재 시 설치/로그인
  안내). build green이나 claude-제거 상태 라이브 노출은 미실행 → 후속 hands-on 권장.

발견 경로: shawn VNC에서 "echo mode — claude CLI not detected" 표면화(claude 설치·인증
했는데도) → canSpawnClaude PATH false-negative 확인.
