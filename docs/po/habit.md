# PO project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

## Entries


- doctrine 수정 — `packages/core/doctrine` 편집은 **designer 에게 위임**(PO 직접 X). 절차/형식 = `docs/po/bookshelf/doctrine-editing.md`. designer 반환 후 PO 가 미러 byte-identical 확인 + QA grill 로 검증(loss-risk/refactor 면 grill 필수). 순수 add/clarify 면 self-verify 로 비례.
- po-state 스코프 — work-state(version/phase/current_task/recent_turns/pending_*)는 **프로젝트 `.productune/po-state.json`에만.** 개인 `~/.productune/po/`는 habit + calibration-log(markdown)만, po-state work-store 없음.
