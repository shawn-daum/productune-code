---
ticket_id: T-PATCH-005
version: v0.5
phase: 3
type: patch
status: done
assignee: pdt-developer
estimated_complexity: L3
risk_flags:
  - "PATH mutation in running shell session — regression risk if npm prefix -g returns unexpected format"
  - "auth check fallback regex too broad may swallow partial-auth or error states as 'logged in'"
  - "hash -r is bash-only; zsh equivalent is rehash — must guard per shell"
---

## Request

<!-- KR -->
### 버그 설명

`install.sh`를 Claude Code CLI가 설치되어 있지 않은 fresh 환경에서 실행하면,
`ensure_claude_installed()` 내부의 `npm install -g @anthropic-ai/claude-code` 는
성공하더라도 그 직후 `command -v claude` 가 실패하거나,
혹은 설치는 통과하되 `ensure_claude_authed()` 에서 `claude auth login` 호출 시
`claude: command not found` 오류가 발생한다.

**정확한 실패 모드 (root cause):**

1. **PATH refresh 누락** (primary): `npm install -g` 는 npm global bin 디렉토리
   (예: `~/.npm-global/bin`, `~/.nvm/versions/node/<ver>/bin`)에 `claude` 바이너리를
   설치한다. 그러나 현재 bash 세션의 `$PATH`에 그 디렉토리가 포함되지 않은 경우,
   line 171 `command -v claude` 가 실패하여 `die "설치 후에도 claude CLI를 찾을 수 없습니다 — PATH 확인"` 이 발동된다.
   특히 macOS + nvm / fnm / npm prefix 커스텀 설정 환경에서 흔하다.

2. **PATH 문제가 line 171을 통과한 경우에도**: `ensure_claude_authed()` 가
   `claude auth login` 을 호출하는 시점까지 PATH가 올바르지 않으면 `claude: command not found` 발생.

3. **보조 실패 모드 — auth status plain-text 출력**: `claude auth status` 가
   JSON이 아닌 plain text (`Logged in as user@...` 형식)를 출력하는 Claude Code
   버전에서는 `jq -e '.loggedIn == true'` 파싱 실패 → 실제로 로그인되어 있어도
   불필요하게 `claude auth login` 을 재시도한다.

### 수정 요구사항

1. `npm install -g` 직후, `npm prefix -g` 로 실제 global prefix 경로를 조회하여
   `<prefix>/bin` 을 현재 세션 `$PATH` 앞에 prepend한다 (중복 추가 방지 포함).
   이후 `hash -r 2>/dev/null || true` (bash) / `rehash 2>/dev/null || true` (zsh)
   로 커맨드 해시 캐시를 초기화한다.

2. `ensure_claude_authed()` 의 인증 확인을 강화한다: jq JSON 파싱 실패 시,
   plain-text fallback으로 출력에서 `Logged in` 또는 `authenticated` 를
   case-insensitive grep 으로 검색한다. 둘 다 실패한 경우에만 `claude auth login` 호출.

3. 비대화형 환경에서 Claude Code 미설치 시 die 메시지에 정확한 설치 명령어를 포함한다
   (기존 메시지에 이미 포함되어 있으나 개행 포맷 개선).

4. 기존 로직 (jq preflight, agent symlink, doctrine mirror, hook merge, statusline,
   skills, PATH registration 등) 은 일체 변경하지 않는다.

---

## Acceptance

<!-- KR -->

- [ ] **AC-1**: macOS + nvm 환경 (npm global bin이 `~/.nvm/versions/node/*/bin` 에 있고
  현재 셸 PATH에 포함되지 않은 상태)에서 `install.sh` 실행 시, Claude Code가 자동
  설치되고 `ensure_claude_installed` 가 die 없이 완료된다.

- [ ] **AC-2**: AC-1 환경에서 설치 직후 `ensure_claude_authed` 내부 `claude auth status`
  및 `claude auth login` 호출이 "command not found" 없이 실행된다.

- [ ] **AC-3**: `claude auth status` 가 JSON 대신 plain text `Logged in as user@example.com`
  을 출력하는 Claude Code 버전에서 `ensure_claude_authed` 가 추가 로그인 시도 없이
  "Claude Code 인증 OK" 메시지를 출력하고 반환한다.

- [ ] **AC-4**: `claude auth status` 가 JSON `{"loggedIn": true, "email": "..."}` 를
  출력하는 환경에서 기존 동작과 동일하게 처리된다 (regression 없음).

- [ ] **AC-5**: Claude Code가 이미 설치되어 PATH에 있는 환경에서 `install.sh` 를 재실행하면
  PATH prepend 로직이 실행되지 않는다 (이미 PATH에 있는 경우 skip).

- [ ] **AC-6**: `npm prefix -g` 실패 시 (npm 미설치 등 엣지 케이스), PATH prepend가
  gracefully skip 되고 기존 `command -v claude` 체크 결과를 그대로 사용한다.

- [ ] **AC-7**: `install.sh < /dev/null` (비대화형) 실행 시, 기존과 동일하게
  "비대화형 환경: 먼저 설치 후 install.sh 재실행" die가 발동하며,
  메시지에 정확한 설치 명령어(`npm install -g @anthropic-ai/claude-code`)가 포함된다.

- [ ] **AC-8**: 기존 동작 전체 (agent symlink, doctrine mirror, hooks merge, statusline,
  skills, PATH registration, env file write 등)가 수정 전과 동일하게 동작한다.

---

## Plan

### 변경 대상 파일

`packages/core/scripts/install.sh`

---

### 변경 1: `ensure_claude_installed()` — npm install 직후 PATH refresh 추가

**위치:** line 170–171 사이 (npm install -g 성공 직후, command -v 재체크 직전)

**현재 코드 (line 168–175):**
```bash
    case "${ANS:-Y}" in
      [Yy]*|"")
        command -v npm >/dev/null 2>&1 || die "npm 미설치 — 먼저 Node.js 설치: https://nodejs.org"
        npm install -g @anthropic-ai/claude-code || die "Claude Code 설치 실패"
        command -v claude >/dev/null 2>&1 || die "설치 후에도 claude CLI를 찾을 수 없습니다 — PATH 확인"
        say "Claude Code 설치 완료: $(claude --version 2>/dev/null | head -1 || echo '?')"
        ;;
      *) die "Claude Code 설치 후 install.sh 재실행: npm install -g @anthropic-ai/claude-code" ;;
    esac
```

**변경 후:**
```bash
    case "${ANS:-Y}" in
      [Yy]*|"")
        command -v npm >/dev/null 2>&1 || die "npm 미설치 — 먼저 Node.js 설치: https://nodejs.org"
        npm install -g @anthropic-ai/claude-code || die "Claude Code 설치 실패"
        # Refresh PATH so the newly installed claude binary is visible in this session.
        # npm may install to a bin dir not yet in $PATH (e.g. ~/.nvm/…/bin, ~/.npm-global/bin).
        _NPM_GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin"
        if [ -d "$_NPM_GLOBAL_BIN" ] && [[ ":$PATH:" != *":$_NPM_GLOBAL_BIN:"* ]]; then
          export PATH="$_NPM_GLOBAL_BIN:$PATH"
          say "PATH에 npm global bin 추가: $_NPM_GLOBAL_BIN"
        fi
        unset _NPM_GLOBAL_BIN
        # Clear bash/zsh command hash cache so 'command -v claude' picks up the new binary.
        hash -r 2>/dev/null || rehash 2>/dev/null || true
        command -v claude >/dev/null 2>&1 || die "설치 후에도 claude CLI를 찾을 수 없습니다 — PATH를 확인하세요. 수동 확인: npm prefix -g"
        say "Claude Code 설치 완료: $(claude --version 2>/dev/null | head -1 || echo '?')"
        ;;
      *) die "Claude Code 설치 후 install.sh 재실행: npm install -g @anthropic-ai/claude-code" ;;
    esac
```

> 주의: `[[ ]]` 는 bash/zsh 모두 지원. 스크립트는 `#!/usr/bin/env bash` 이므로 문제 없음.
> `hash -r` 는 bash, `rehash` 는 zsh — `||` 체인으로 둘 다 시도.

---

### 변경 2: 비대화형 die 메시지 개선 (line 163)

**현재:**
```bash
    die "비대화형 환경: 먼저 설치 후 install.sh 재실행 — npm install -g @anthropic-ai/claude-code"
```

변경 없음 — 이미 설치 명령어가 포함되어 있다. AC-7 충족. **이 변경은 불필요하여 skip.**

---

### 변경 3: `ensure_claude_authed()` — plain-text fallback 추가

**위치:** line 178–200 전체 함수

**현재 코드:**
```bash
ensure_claude_authed() {
  local status
  status="$(claude auth status 2>/dev/null || true)"
  if printf '%s' "$status" | jq -e '.loggedIn == true' >/dev/null 2>&1; then
    local who org
    who="$(printf '%s' "$status" | jq -r '.email // ""' 2>/dev/null)"
    org="$(printf '%s' "$status" | jq -r '.orgName // ""' 2>/dev/null)"
    say "Claude Code 인증 OK${who:+ (${who}${org:+ / $org})}"
    return 0
  fi
  warn "Claude Code 로그인이 필요합니다."
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 'claude auth login' 먼저 실행 후 install.sh 재실행"
  fi
  say "이제 claude 로그인 흐름을 시작합니다 (브라우저가 열릴 수 있습니다)..."
  claude auth login || die "로그인 실패 — install.sh 재실행 필요"
  status="$(claude auth status 2>/dev/null || true)"
  if printf '%s' "$status" | jq -e '.loggedIn == true' >/dev/null 2>&1; then
    say "로그인 확인 완료"
  else
    die "로그인이 완료되지 않았습니다. 'claude auth login' 직접 실행 후 install.sh 재실행"
  fi
}
```

**변경 후:**
```bash
ensure_claude_authed() {
  local status
  status="$(claude auth status 2>/dev/null || true)"

  # Helper: returns 0 if $1 (status string) indicates authenticated.
  # Tries JSON parse first; falls back to plain-text grep for CLI versions
  # that output "Logged in as ..." instead of JSON.
  _is_authed() {
    local s="$1"
    printf '%s' "$s" | jq -e '.loggedIn == true' >/dev/null 2>&1 && return 0
    printf '%s' "$s" | grep -qiE '(logged in|authenticated)' 2>/dev/null && return 0
    return 1
  }

  if _is_authed "$status"; then
    local who org
    who="$(printf '%s' "$status" | jq -r '.email // ""' 2>/dev/null || true)"
    org="$(printf '%s' "$status" | jq -r '.orgName // ""' 2>/dev/null || true)"
    say "Claude Code 인증 OK${who:+ (${who}${org:+ / $org})}"
    unset -f _is_authed
    return 0
  fi

  warn "Claude Code 로그인이 필요합니다."
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    die "비대화형 환경: 'claude auth login' 먼저 실행 후 install.sh 재실행"
  fi
  say "이제 claude 로그인 흐름을 시작합니다 (브라우저가 열릴 수 있습니다)..."
  claude auth login || die "로그인 실패 — install.sh 재실행 필요"
  status="$(claude auth status 2>/dev/null || true)"
  if _is_authed "$status"; then
    say "로그인 확인 완료"
  else
    die "로그인이 완료되지 않았습니다. 'claude auth login' 직접 실행 후 install.sh 재실행"
  fi
  unset -f _is_authed
}
```

> `_is_authed` 를 로컬 함수로 정의하고 반환 전 `unset -f` 로 정리.
> jq가 PATH에 없거나 설치 안 된 경우 대비: jq preflight (line 203)이 이미 보장하므로
> jq 없음 케이스는 이 함수 도달 전 die된다. 추가 guard 불필요.

---

### 변경 4: 변경 없는 항목 (영향 없음 확인)

다음 함수/로직은 수정 대상 아님 — 무변경 확인:
- `verify_agents_recognized()` — 영향 없음
- `merge_claude_settings_hooks()` — 영향 없음
- `merge_claude_settings_statusline()` — 영향 없음
- Preflight block (line 202–206) — 호출 순서 변경 없음
- Agent symlink (line 208–232) — 영향 없음
- Doctrine mirror (line 256–270) — 영향 없음
- Tier 2 scaffold (line 284–294) — 영향 없음
- PATH registration (line 387–553) — 영향 없음
- PO env file (line 310–340) — 영향 없음

---

### 구현 순서

1. `ensure_claude_installed()` 에 PATH refresh 블록 추가 (변경 1)
2. `ensure_claude_authed()` 에 `_is_authed` helper + fallback 적용 (변경 3)
3. `bash packages/core/scripts/install.sh` 로 기존 환경(이미 설치+인증) 재실행하여 regression 없음 확인
4. (선택) nvm 환경에서 `nvm use system && npm uninstall -g @anthropic-ai/claude-code` 후 fresh install 시뮬레이션으로 AC-1, AC-2 검증

---

## Outcome

**변경 파일:** `packages/core/scripts/install.sh`

**변경 1 — `ensure_claude_installed()` PATH refresh 블록 추가**
- `npm install -g @anthropic-ai/claude-code` 직후에 `_NPM_GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin"` 으로 실제 global bin 경로를 조회한다.
- 해당 디렉토리가 존재하고 `$PATH`에 없으면 `export PATH="$_NPM_GLOBAL_BIN:$PATH"` 로 prepend하고 `say` 메시지 출력.
- `unset _NPM_GLOBAL_BIN` 으로 임시 변수 정리.
- `hash -r 2>/dev/null || rehash 2>/dev/null || true` 로 bash/zsh 커맨드 해시 캐시 초기화.
- 이후 `command -v claude` 체크는 기존과 동일하게 유지 (다이 메시지에 `npm prefix -g` 수동 확인 힌트 추가).

**변경 2 — `ensure_claude_authed()` `_is_authed` 헬퍼 + plain-text fallback 적용**
- 함수 내부에 `_is_authed()` 로컬 헬퍼 정의.
- jq JSON 파싱 (`'.loggedIn == true'`) 먼저 시도; 실패 시 `grep -qiE '(logged in|authenticated)'` plain-text fallback.
- 인증 확인 후 `unset -f _is_authed` 로 함수 정리 (정상 반환 경로, 로그인 후 경로 모두).
- jq로 `email`/`orgName` 추출할 때 `|| true` 추가하여 jq 없는 상황도 graceful 처리.

**검증:** `bash -n packages/core/scripts/install.sh` → PASS
