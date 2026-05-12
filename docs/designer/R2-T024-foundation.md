# R2 OQ resolved + T-P4-024 foundation plan trace

## Decision trace (2026-05-11)

### R2 5 OQ
- OQ-1 conflict modal = hybrid (trivial 자동 / semantic 대화체 — 권고 그대로)
- OQ-2 autosave trigger = ticket frontmatter status/qa_status/qa_loops 변경 시점만 (권고 X — turn done 대비 보수적 채택)
- OQ-3 deploy gate = PO trigger + 사용자 confirm 모달, 별 버튼 X (권고 부분 reversal — PRD line 145 patch 필요)
- OQ-4 Vercel = REST API 1차 + CLI logs 보조, Marketplace 제외 (권고 그대로)
- OQ-5 외부 IDE 감지 = MVP 알림 only — Phase 5 정밀 처리 (권고 그대로)

### T-P4-024 4 OQ (사용자 권고 채택)
- OQ-T024-1 git-rules commit 정책 = 자동 commit X (권고 채택)
- OQ-T024-2 dev branch 이름 = 'dev' (권고 채택)
- OQ-T024-3 prefix 변경 영향 = 다음 ticket 부터만 — R2 §5.1 invariant 정합 (권고 채택)
- OQ-T024-4 protectedBranches manual = display only MVP (권고 채택)

## §1.5 self-check 결과

- R2 plan §10 — OQ-3 결정으로 §1.5.1 Few Things 추가 강화 (상시 배포 CTA 0)
- T-P4-024 plan §9 — 7 control / sub-tab (cap 상한 정합) + locked area = §1.5.2 progressive 정합

## 후속 dispatch order
1. T-P4-024 dev impl (진행 중 — background)
2. T-P4-020 design plan (worktree)
3. T-P4-021 (autosave)
4. T-P4-022 (deploy + PO trigger 모달)
5. T-P4-023 (history)

## 별 PO task
- PRD line 145 patch (사용자 명시 클릭 → PO trigger + 사용자 confirm) — **본 turn 진행**
- T-P4-046 dispatcher deploy tab type 추가 ticket 발행 (T-P4-022 land 시점까지 defer OK)
