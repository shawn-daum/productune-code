# 팀 Git · 티켓 규칙 — 한 장

어떤 repo에든 그대로 적용하는 공통 규칙. 팀은 repo를 공동 관리하지 않고 각자 관리하지만, 규칙은 하나다. 도구 설치 없음 — git과 md 파일이면 끝.

---

## 0. 모드 선택 — repo마다 하나

| | 솔로 모드 | 팀 모드 |
|---|---|---|
| 언제 | 혼자 만지는 repo | 둘 이상 만지거나, main이 배포에 직결되는 repo |
| 상주 branch | `main` | `dev` |
| 배포 행위 | `main` push | `dev → main` merge |

main이 배포로 이어지는 repo에서 "push 조심하자"는 습관은 규칙이 아니다. 구조로 막는다 — 그게 팀 모드다.

## 1. 솔로 모드 (trunk)

- `main`에 상주하고 모든 commit은 main 직행. branch 안 만든다.
- **push = 배포 게이트.** push 전에 빌드·테스트가 통과한 상태여야 한다. 통과 못 하면 push하지 않는다.
- 배포한 시점의 commit에 tag를 단다 (`v1.4.0`).

## 2. 팀 모드 (dev 상주, main = 배포 전용)

- **`main`에는 직접 push하지 않는다. 예외 없음.** (가능하면 repo 설정에서 branch protection으로 잠근다.)
- 일상 작업의 기준은 `dev`. pull도 dev, branch도 dev에서 딴다.
- 작업 단위: **feature branch → PR → dev merge**.
- 배포: **`dev → main` merge가 곧 배포 행위**다. merge하는 순간 나간다는 마음으로 한다. merge 직후 main에 tag.

```
feat/T-12-login-fix ──PR──▶ dev ──merge = 배포──▶ main (tag v1.4.0)
```

## 3. Branch 이름

- `feat/T-NNN-slug` · `fix/T-NNN-slug` — 예: `feat/T-12-export-csv`, `fix/T-31-login-redirect`
- **수명은 며칠 이내.** 일주일을 넘기면 작업을 쪼갠 것이 아니라 branch를 키운 것이다 — 쪼개라.
- merge 후 즉시 삭제.

## 4. Commit 메시지

Conventional Commits + 티켓 id:

```
feat: CSV 내보내기 버튼 추가 (T-12)
fix: 로그인 후 redirect 경로 복원 (T-31)
```

- prefix는 `feat:` `fix:` `refactor:` `docs:` `chore:` `test:` 여섯 개.
- 티켓이 있는 작업이면 끝에 `(T-NNN)`. 없으면 생략.
- `git add .` 대신 파일을 명시해서 stage한다.

## 5. 티켓 — md 파일 하나, 4요소

repo 안 고정 폴더 하나(예: `docs/tickets/`)에 `T-NNN.md`로 둔다. 번호는 repo별 증가 counter — 파일을 옮겨도, 티켓을 버려도 번호는 재사용하지 않는다.

4요소가 전부다: **id · status(open/done) · Request · Acceptance.**

복사해서 쓰는 템플릿:

```markdown
---
id: T-NNN
status: open
---

## Request

무엇을, 왜. 두세 문장이면 충분하다.

## Acceptance

- 완료를 판정할 수 있는 조건 (체크 가능한 문장으로)
```

- 끝나면 `status: open → done` 한 줄 수정. 그 외 상태는 만들지 않는다 — blocked·review 같은 사정은 본문에 한 줄 적는다.
- 티켓·문서 같은 메타 파일은 feature branch에 태우지 않고 상주 branch(솔로 `main` / 팀 `dev`)에 직접 커밋한다. 코드만 branch를 탄다 — 메타는 선형 타임라인 하나면 충분하다.

## 6. 배포 · 롤백

- **배포 = main의 tag.** 배포마다 `vX.Y.Z` tag를 main에 단다. "지금 뭐가 나가 있나"의 답은 항상 최신 tag.
- **롤백 = 이전 tag를 다시 배포.** 원인 수정은 그다음에 dev에서 정상 사이클로 처리한다.

## 7. 한 사이클 예시 (팀 모드)

```bash
# 1. 티켓 생성 — docs/tickets/T-12.md 작성, dev에 커밋
# 2. branch
git switch dev && git pull
git switch -c feat/T-12-export-csv
# 3. 작업 + 커밋
git commit -m "feat: CSV 내보내기 버튼 추가 (T-12)"
# 4. PR → dev merge → branch 삭제
# 5. 배포
git switch main && git pull
git merge dev            # ← 이 merge가 배포 행위
git tag v1.4.0
git push origin main --tags
# 6. 티켓 status: done, dev에 커밋
```
