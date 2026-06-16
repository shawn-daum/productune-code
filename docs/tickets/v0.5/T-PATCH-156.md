---
ticket_id: T-PATCH-156
version: v0.5
slug: calibration-log-tier1-bounded-read
title: calibration-log Tier2 글로벌 → Tier1 per-project + turn-open 마지막 ~8엔트리만 read
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: calibration-tiering
risk_flags: [core-doctrine, tier0-edit, mirror-sync, turn-open-behavior]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-156: calibration-log Tier1 + bounded read

## 배경 / 결정 (user 2026-06-16)

calibration-log이 `$HOME/.productune/po/bookshelf/calibration-log.md`(Tier2 글로벌, cross-project)에 4개 프로젝트(productune/paepyeong/oh-my-eyes/issue-tracker) 혼재(116줄·29KB). turn-open마다 전체 cat → 매 턴 크로스-프로젝트 노이즈 읽는 낭비.

결정: **calibration-log = Tier1 per-project** (`<repo>/docs/po/calibration-log.md`). turn-open은 **해당 프로젝트 로그 마지막 ~8엔트리만** read. cross-cutting 교훈(모델/하니스)은 calibration이 아니라 doctrine 승격.

## Edits (designer, SoT only; PO가 mirror-sync)

1. **habit.md** (Tier0 core):
   - line ~15 (turn-open): `$HOME/.productune/po/bookshelf/calibration-log.md` 전체 scan → **프로젝트 `docs/po/calibration-log.md` (Tier1)의 마지막 ~8엔트리** read 로 변경. (Read 툴로 가능 — repo-relative 경로, `$HOME` 확장 불필요.)
   - line ~4 (whitelist (c)): `calibration-log.md` → 프로젝트 `docs/po/calibration-log.md` (Tier1) 명시.
   - line ~46 (close): deviation 라인을 프로젝트 calibration-log에 append.
2. **calibration.md** (Tier0 bookshelf):
   - line ~6-7: "cross-project rolling `$HOME/.productune/po/bookshelf/calibration-log.md`" → "per-project `docs/po/calibration-log.md` (Tier1)".
   - line ~49 append 명령 경로 → `docs/po/calibration-log.md`.
   - line ~54 >100줄 compaction → per-project 기준 유지(프로젝트별이라 도달 빈도 낮음).
   - read 규약 = 마지막 ~8엔트리(라우팅 bias용); 패턴 재발은 doctrine 승격으로.
   - cross-cutting(모델 행동/하니스 quirk) 교훈은 calibration-log이 아니라 doctrine(routing/calibration bookshelf 또는 common) 승격 대상임을 1줄 명시.
3. tier 모델/다른 doctrine이 calibration을 Tier2로 칭하는 곳 grep해서 정합.

## Acceptance
- AC-1: habit.md + calibration.md가 calibration-log을 Tier1 per-project + 마지막 ~8엔트리 read로 일관 기술.
- AC-2: whitelist/append/read 경로가 모두 `docs/po/calibration-log.md`로 통일, `$HOME/.productune/po/bookshelf/calibration-log.md` 잔존 참조 0(grep clean).
- AC-3: cross-cutting → doctrine 승격 규칙 명시.
- AC-4: Tier0 변경분 ~/.productune mirror byte-identical(PO).

## Note
- 기존 116줄 글로벌 로그의 프로젝트별 분할 이전 = PO mechanical(별도, 본 티켓은 doctrine만).
- 경로 변경이라 grep으로 잔존 참조 0 확인 필수.
