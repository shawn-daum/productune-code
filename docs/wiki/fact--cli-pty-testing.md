---
title: CLI/pty 테스트 기법 (CLI & pty testing techniques)
type: fact
status: live
version: v1.1
links: ["fact--gui-testing-env"]
---

# CLI/pty 테스트 — core 스크립트 검증 기법과 footgun

`packages/core` 스크립트(prdt/install.sh/hooks) 검증에서 실측 확정된 사실 (T-316/331/332/340).

## 셸 스크립트 e2e in vitest
- `execFileSync('bash',[install.sh])` + 샌드박스 `HOME`/`PRDT_HOME`/`CLAUDE_DIR` — jq 로직 중복 없는 최고 충실도 회귀. `test.skipIf(!hasJq())` 가드.
- core `vitest.config.ts`는 `test/**/*.test.ts`만 include — 다른 위치의 테스트 파일은 조용히 무시됨. 항상 `test/` 하위에 배치.
- prdt CLI는 `~/.prdt/bin/prdt` 고정 절대경로 — global PATH 가정 금지(`which prdt` 금지), 절대경로 호출.

## 인터랙티브(pty) 경로
- `prdt init` 인터랙티브 분기는 `sys.stdin.isatty()` 게이트 — 파이프 stdin으로 도달 불가. macOS `expect`로 real pty 구동 (`script -q /dev/null`은 stdin 전달 깨짐).
- expect 앞에 `set stty_init "rows R columns C"` 필수 — 없으면 자식 pty가 0x0으로 보고돼 gum/fzf가 렌더 못 하고 행.
- **bare `expect "패턴"`은 timeout 시 조용히 다음으로 진행** — 키를 블라인드로 보내는 테스트는 UI가 안 떠도 통과. 매치가 assertion이면 반드시 `timeout { exit 1 }` arm 있는 블록 사용.
- QA 휴리스틱: pty 스위트의 케이스당 소요가 expect timeout과 비슷하면 조용히 타임아웃으로 blind-pass 중일 확률 높음 (T-332 수정 후 32s→2.3s).

## gum/fzf 선택 UI
- **gum은 메뉴를 stderr에 그리고 stdout엔 선택 결과만** — `capture_output=True`는 "안 보이는데 키는 먹는" 블라인드 메뉴를 만든다. stdout만 캡처하고 stderr는 tty 상속. fzf는 /dev/tty 직접이라 면역.
- fzf `--height=<pct>`는 cursor-position DSR(ESC[6n)을 유발 — 응답 없는 pty에서 무한 대기. 기본 alt-screen(`--reverse`)이 안전.
- 다중 도구 fallback 체인(gum>fzf>input) 테스트는 케이스별 PATH 격리(symlink-only bin dir) 필수 — 미격리 PATH는 최우선 도구만 검증하게 됨.

## jq
- jq 함수 인자 cmd는 '.'에 재평가되는 closure — `any(gen; cond)` 안에선 generator 원소에 바인딩. generator 진입 전 `(cmd) as $c |`로 강제 평가.
