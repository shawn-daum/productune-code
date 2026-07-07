---
title: v1 단일 개발 라인 (v1 single dev line)
type: decision
status: live
version: v1.1
links: ["retro--v1.0"]
---
# v1 단일 개발 라인 — v0.6/main은 참고 후 폐기

> **2026-07-07 갱신 (사용자 결정, B안).** 아래의 "원격 main/v0.6은 freeze 유지" 조항을 **supersede**한다. v1을 정본 trunk로 승격:
> - 로컬/원격 브랜치 rename: 구 `main` → `v0.6`(레거시 보존), `v1` → `main`.
> - 원격 반영: `origin/v0.6` = 레거시(fb589a5) 보존, `origin/main` force-update = v1 라인(49059ba), 구 `origin/v1` 삭제. GitHub 기본 브랜치 = `main`(이름 유지, 내용이 v1으로 교체).
> - 이후 **`main`이 유일 개발 라인 = trunk** (doctrine "trunk = main"과 정렬). `v0.6`는 조회 전용 레거시 브랜치.
> - `…/productune` 워크트리는 rename으로 `v0.6` 체크아웃이 됨 — 이제 레거시 참고용.

2026-07-04 사용자 결정. flip 문서 §3의 "GUI 개발은 main에서 계속 → v1으로 주기 merge"를 **supersede**한다.

- **v1 브랜치가 유일한 개발 라인.** GUI 포함 모든 신규 작업은 v1에서.
- v0.6/main의 코드는 **merge하지 않는다** — 변경사항(diff)을 참고 자료로 삼아 v1.1에 반영한다:
  - 어댑터 산출물(A1~A8 + T-298/304/305/306, v0.6에 12커밋) → T-308로 v1에 재적용 (T-PATCH 훈크 제외, 게이트·QA 재검증).
  - T-PATCH-284(컴포저 큐잉·PO 활동 라인)·286(GUI model/effort 오버라이드) 미커밋 기능 → T-309/T-310 신규 티켓으로 정식 재구현, 우선순위 T-293 뒤.
  - legacy 부속(v0.6 티켓 문서·구 doctrine 수정)은 폐기.
- 반영 완료 후 로컬 v0.6 브랜치와 더티 트리는 폐기. 원격 main/v0.6은 freeze 유지(비파괴).
- T-293 전제 변경: "main 최종 merge 후" → "T-308(v0.6 delta 반영) 완료 후".
