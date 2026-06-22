---
id: T-PATCH-116
type: impl
status: done
phase: 3
assignee: developer
qa: smoke
risk: L1
created: 2026-06-11
---

# T-PATCH-116 — statusline worktree-인지 (version/phase 미표시 수정)

## 요청
worktree(`.productune/worktrees/<id>/`) 안에서 세션이 돌 때 statusline이 `branch: …`만 출력하고 version/phase가 빠짐. 원인: 스크립트가 cwd의 `.productune/po-state.json`만 읽는데 worktree에는 `.productune/`이 없음(gitignore).

## 범위
- `packages/core/scripts/statusline-productune.sh` 단일 파일.
- cwd에 `.productune/po-state.json`이 없으면: `git -C "$dir" rev-parse --git-common-dir` → main checkout 루트 도출 → 그쪽 `.productune/po-state.json`을 읽어 version/phase 렌더. branch는 기존대로 cwd의 git에서 (worktree 브랜치 그대로 표시).
- git 명령 실패/비-git 디렉토리: 기존 fallback 동작 유지 (무출력/branch-only).
- ticket 카운트(docs/tickets)도 동일하게 main 루트 기준으로 해석.

## AC
1. worktree cwd에서 `v0.1 | phase 1: PRD (…) | branch: v0.1-T-1-prd-authoring` 풀 출력.
2. 프로젝트 루트 cwd 동작 변화 없음 (회귀 없음).
3. 비-productune 디렉토리에서 기존과 동일한 무해한 출력.
4. install.sh 미러 경로(`~/.productune/`) 반영 (설치 스크립트가 복사하는 파일이면 미러 갱신 또는 절차 명시).

## QA smoke
- oh-my-eyes 실데이터: 루트와 `.productune/worktrees/T-001/` 각각에서 `echo '{"workspace":{"current_dir":"<dir>"}}' | statusline-productune.sh` 출력 비교.
