---
name: productune
target: cli-install
method: install-script
auto: no
---

# Deploy — productune v1 (worktree of productune)

- productune 리포의 linked worktree — v1 신버전 작업 라인 (구 v0.6은 `_archive/productune/`).
- 산출물 두 개:
  - CLI (prdt): install.sh 로 `~/.prdt` 설치, 업데이트 = `prdt update`.
  - GUI (오케스트레이션 GUI 데스크톱 앱): `dist:mac` 빌드 → 로컬 설치. 웹 배포 없음.
- CI: GitHub Actions fresh-install-smoke.
