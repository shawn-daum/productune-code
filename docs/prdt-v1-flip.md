# prdt v1 — flip 체크리스트 (§12.6)

> 2026-07-03 사용자 결정: GUI 어댑터(A1~A8) **전에** flip. 원 설계는 어댑터를 flip 전 완료 조건으로
> 뒀으나(감사 문서), 구조 신뢰가 확보돼 환경 전환을 먼저 하고 어댑터를 flip 후 최우선으로 진행한다.
> 실행 도구: `packages/core/scripts/prdt-flip.sh` (기기마다 1회, `--rollback` 내장).

## 유의할 점 (flip 전 반드시 인지)

### 1. GUI는 당분간 "조회 전용" — 최대 유의점
- `pdt-po` agent가 제거되므로 **GUI에서 PO 스폰(운영) 불가**. 모든 운영은 CLI로:
  Claude Code 세션(Agent tool) 또는 `claude --agent prdt-po`.
- prdt 프로젝트(`.prdt/`)는 어댑터 전까지 GUI가 인식하지 못함. legacy 프로젝트의 파일/티켓 **조회**는 계속 동작.
- **UsageBar 정지**: `usage-state.json`은 구 statusline의 부수효과 산출물 — statusline 교체와 함께 생성 중단 (A7에서 turns.jsonl 기반으로 대체 예정). 비용 기록 자체는 `.prdt/turns.jsonl`에 계속 쌓임.

### 2. Build 페이즈에 엮인 full 프로젝트들 — lazy migrate 원칙
flip은 **프로젝트 상태를 일절 건드리지 않는다**. 각 프로젝트는 "다음에 굴릴 때" 그냥 `prdt` — legacy를 감지하면 마이그레이션을 제안(Y)하고 이어서 PO가 열린다 (명시 실행은 `prdt migrate [--dry-run]`):

| 프로젝트 | 상태 | 처방 |
|---|---|---|
| productune (자기 dogfood, GUI 작업) | P3 v0.6, **WIP 미커밋**, close_gate 4항 pending | **WIP 먼저 커밋** → migrate. close_gate는 제도 소멸 — pending 항목들은 Ship 진입 readiness ritual이 대체 |
| issue-tracker | P3 v0.2 | 재개 시 migrate |
| paepyeong | P3 v1 | 재개 시 migrate |
| oh-my-eyes | P5 v0.1 (close 중) | 재개 시 migrate — P5 잔무는 migrate 후 Retro stage로 이어짐 |
| daum-game-builder · hanta · ntf-archive | 티켓 0~21 | 재개 시 migrate |

- **migrate 전 재개 금지**: 구 agent가 없어 구 방식 운영이 불가하고, prdt-po에게 구 po-state를 읽히면 혼란만 생긴다. migrate가 구 마커를 `*.migrated`로 개명하므로 스코프된 legacy hook 걱정도 함께 사라짐.
- 완주 못 한 close_gate/pending_promotions 등 구 제도 상태는 migrate 시 버려진다(설계 §3/§7의 대체물이 존재) — 아까우면 migrate 전에 위키/문서로 옮겨둘 것.

### 3. 구 코드 freeze는 유지, repo 대청소는 flip과 분리
- main 브랜치의 구 full 코드는 계속 freeze(치명 버그 예외만, 예: 2026-07-02 frontmatter-lint 스코프 fix). GUI 개발은 main에서 계속 → v1으로 주기 merge.
- v1 브랜치의 legacy 트리 삭제·이름 정리(`prdt-install.sh`→`install.sh` 등)는 **어댑터 작업 때 함께** — 지금 지우면 main과의 merge 마찰만 커진다.

### 4. 기기별 재적용 — 자동 핸드오프 (2026-07-03 구현)
> **⏸ 스텁 임시 회수 중 (2026-07-03 저녁, 사용자 결정)**: 팀 전파 시점 통제를 위해 origin main·v0.6에서
> 핸드오프 스텁을 revert(fb589a5·0dfe0ed). 회수 동안 다른 기기는 수동 경로: `git checkout v1 && git pull`
> → `prdt-flip.sh`. 재배포 = revert 2건을 되돌려 push.
- 구 productune의 **런치 auto-update**가 main의 핸드오프 스텁을 전 기기에 배포한다. 각 기기에서
  `productune` 실행 → "prdt로 전환할까요? [Y/n]" → **Y**: v1 fetch → 영구 worktree(`~/.prdt/repo`,
  origin/v1 추적) → `prdt-flip.sh`(백업→단계 검증→**실패 시 자동 롤백**+대안 안내) → 완료 안내.
- **n**: 플래그 기록 후 다시 묻지 않음 (재제안: `rm ~/.productune/.prdt-handoff-declined`).
- 전환 후 갱신은 `prdt update`(worktree pull + 재설치). 수동 경로도 유효: v1 체크아웃에서 `prdt-flip.sh`.
- **GUI 앱 번들 설치 기기 주의** (cua VM 검증에서 발견): `PRODUCTUNE_REPO=/Applications/productune.app/...`인 기기는 git repo가 없어 **auto-update 채널이 없고 핸드오프 스텁이 도달하지 않는다** (스텁이 와도 fetch 불가 → 안전하게 건너뜀). 이런 기기는 새 기기 경로로: `git clone <repo> && git checkout v1` → `prdt-flip.sh` (flip이 앱이 등록한 hook/agent를 걷어냄 — cua VM에서 18개→5개 검증).

### 5. 잔존물은 의도적으로 남긴다
- `~/.productune/`(구 미러·productune.env), 각 프로젝트의 `.productune/`(마이그레이션 전까지), `docs/backlog.md` 등 legacy 문서 — 비파괴 원칙. GUI legacy 조회가 일부를 참조한다.

### 6. 롤백
- flip 스크립트가 실행 전 백업을 만든다: `~/.claude/settings.json` 사본 + 구 agent 파일 tar.
- `prdt-flip.sh --rollback <백업디렉토리>` 로 원복. (구 repo의 `install.sh` 재실행으로도 복구 가능.)

## flip이 실제로 하는 일 (기계 단계)
1. 백업 생성 (`~/.prdt/flip-backup-<ts>/`)
2. settings.json에서 구 full hook 17개 + lite hook 1개 제거 (prdt hook 5이벤트는 유지/보장)
3. statusline → `statusline-prdt.sh` 교체 (순수 표시 전용)
4. `~/.claude/agents/`에서 `pdt-*.md`·`pdtl-*.md`(+.bak) 제거 — `prdt-*` 4종만 잔존
5. prdt-install.sh 재실행(미러·메뉴판 최신화) + 검증 리포트

## flip 후 즉시 할 일
- [ ] productune repo: GUI WIP 커밋 → `prdt migrate` (첫 실전 인수)
- [ ] GUI 어댑터 A1~A8 착수 (감사 문서 `prdt-v1-gui-coupling.md`) — flip 직전 main 재검증 조항은 어댑터 PR에서 수행
- [ ] 다른 기기 flip 재적용
