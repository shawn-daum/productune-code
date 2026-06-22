---
ticket_id: T-PATCH-048
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L3
risk_flags: i18n-sweep, locale-ko, locale-en
slug: i18n-gap-sweep
qa_status: skipped
requires_qa: true
area_tag: gui-i18n
---

# T-PATCH-048: i18n 미적용 구간 전수 스캔 + 적용

## Request

GUI에 i18n이 적용되지 않아 `workspace.some.key` 같은 점-표기 fallback 문자열이 그대로 노출되는 곳들이 있음. 전수 스캔해서 모두 적용.

## Acceptance Criteria

- [ ] AC-1: `packages/gui/src/` 전체에서 hardcoded 한글/영문 UI 문자열 스캔 (t() 감싸지 않은 것)
- [ ] AC-2: `ko.json` / `en.json` 에 누락된 key 추가, 컴포넌트에 `t()` 적용
- [ ] AC-3: 렌더 결과에 `xxx.yyy.zzz` 형태의 i18n key fallback이 노출되지 않음 (ko 기준)
- [ ] AC-4: 새로 추가한 key는 ko.json + en.json 양쪽 모두 작성
- [ ] AC-5: `SkillMatrixTab.tsx` 헤더의 `Skill`, `Scanning skills…` 등 하드코딩 문자열 포함

## Plan

- `grep -rn ">[^<{]*[가-힣]" packages/gui/src/` — 한글 hardcode 탐지
- `grep -rn '>[^<{]*[A-Z][a-z]' packages/gui/src/components/` — 영문 UI 문자열 탐지
- `packages/gui/src/locales/ko.json`, `en.json` 갱신
- 변경 컴포넌트: 발견된 모든 파일
