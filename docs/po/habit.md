# PO project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

## Entries


- doctrine 수정 — `packages/core/doctrine` 편집은 **designer 에게 위임**(PO 직접 X). 절차/형식 = `docs/po/bookshelf/doctrine-editing.md`. designer 반환 후 PO 가 미러 byte-identical 확인 + QA grill 로 검증(loss-risk/refactor 면 grill 필수). 순수 add/clarify 면 self-verify 로 비례.
- po-state 스코프 — work-state(version/phase/current_task/recent_turns/pending_*)는 **프로젝트 `.productune/po-state.json`에만.** 개인 `~/.productune/po/`는 habit + calibration-log(markdown)만, po-state work-store 없음.
- git posture (이 repo 한정) — trunk-on-main: 세션은 **항상 `main` 에 checkout 상주**, doctrine/patch 를 `main` 에 직접 커밋(ticket `done` 먼저 → 한 커밋, artifact + ticket scope 만 stage, `git add .` 금지). 작업 브랜치(batch/feature)를 main tree 에 checkout 금지 — 병렬/위험 작업은 worktree 격리로만. Tier 0 `git-workflow.md` 의 `v<N>` version-branch + worktree-per-ticket 는 **관리대상 제품 전용** — 이 repo 엔 안 씀. push 는 유저 명시 시.
