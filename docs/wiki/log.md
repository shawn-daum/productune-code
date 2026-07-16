# Wiki log — append-only ritual/ingest/lint records
2026-07-03 retro(v1.0): backlog sweep — 미결 4건 backlog 티켓 발행(T-294~T-297), v1.1 스코프 11건 발행(T-283~T-293, gui-adapter)
2026-07-03 retro(v1.0): inbox 큐레이션 N/A(비어 있음) · wiki lint clean · doctor 151 warn 전건 legacy v0.x enum — 의식적 수용(retro--v1.0 기록)
2026-07-03 retro(v1.0): retro--v1.0.md 작성 — outcome: flip/smoke/migrate observed, §12.4-③ unobserved → T-294 이월
2026-07-03 define(v1.1) open: scope = productune·prdt·GUI 정합성(어댑터 A1~A8) · main 병합은 v1.1 완료까지 보류
(2026-07-06) curated 49 inbox lines → 3 new pages (feature--gui-adapter · fact--gui-testing-env · learning--sweep-discipline) + backlog T-315; dropped lines already recorded in ticket outcomes/tickets. Promotion candidate parked: core stateDir() lint/review-check (재발 2회) — retro에서 discipline-edit 검토.
(2026-07-06) readiness v1.1 진행 중: security N/A (로컬 도구 — 민감 표면인 settings.json 쓰기는 T-305/311에서 동의 게이트 실측 완료).
(2026-07-06) readiness v1.1: review ✓(6 findings→T-316 patched+QA) · ds ✓(T-313 fix+T-314 doc) · security N/A(로컬 도구, 동의 게이트 기실측) · run-prompt+prd sweep 사용자 대기.
- (2026-07-15) Retro v1.1: curated 86 inbox lines → 5 new + 3 updated pages · retro--v1.1.md · doctor 155 warnings consciously accepted (legacy enum=T-296 처방) · T-294 closed(observed) · tag v1.1
- 2026-07-16 readiness v1.2: review ✓(C1·C2 must-fix → T-370 패치·QA PASS) · ds ✓(위반 7건 → T-368 패치) · security N/A-skip(판단: injection·파괴적 git·env 오염은 QA grill 3라운드 커버, auth/PII/자동 push surface 없음) · prd ✓(잔여 = T-362 dogfood, ship 작업 자체)
