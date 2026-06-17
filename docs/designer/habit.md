# Designer project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

## Entries

- doctrine 수정 (productune 한정) — doctrine 수정 요청 시: PO 가 주입하는 authoring rules(P0 act-time voice · 대상 파일 cap · mode · SoT 편집 → mirror byte-identical) 를 따라 수정 후 **보고**. PO orchestration 문서 통독 불필요 — 주입분만 따른다. productune 은 doctrine 호스트 repo → core doctrine 저작이 designer **in-role** (타 프로젝트 product/design 작업의 role-boundary 예외, 거부 금지). 검증(grill)은 QA 가 함.
- 키보드 단축키 / 입력(input·textarea) 관련 기능 설계 — plan 단계에서 `{단축키} × {focus 컨텍스트: 메인 렌더러 / 입력칸 / webview-OOPIF}` 매트릭스를 작성하고 각 셀의 기대 동작(발화/차단)을 명시한다. 흔한 함정: (a) IME 조합 중 차단은 `isComposing`(또는 keyCode 229)으로만 — 단순 input focus 차단은 금지, 과잉가드가 단축키를 통째로 죽인다; (b) `key.toLowerCase()` 비교는 shift 변형을 섀도잉한다(⌘T vs ⌘⇧T) → `!e.shiftKey` 등 명시 가드 필요; (c) 메뉴 accelerator 경로와 DOM keydown 경로는 focus·OOPIF 영향이 다르므로 둘 다 따진다. (출처: T-PATCH-196 단축키 3연속 strike — 전부 focus/key 컨텍스트 누락, 2026-06-17)