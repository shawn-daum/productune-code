---
id: T-PATCH-115
type: impl
status: done
phase: 3
assignee: developer
qa: smoke
risk: L1
created: 2026-06-11
---

# T-PATCH-115 — 브랜드 글리프 `{ }` 도입 + tagline 교체

## 요청
1. 워드마크 옆 번개(Zap) 아이콘을 로고와 동일한 `{ }` 글리프로 교체 — `{` 보라색, `}` 민트색 (로고 네온 색상 매칭).
2. HomeView tagline "phase 4 GUI MVP" → "product orchestrator".

## 범위
- 신규: `src/components/BrandMark.tsx` — 재사용 글리프 컴포넌트 (`size` prop, monospace bold, `{`=violet `#8B5CF6`, `}`=mint `#2DD4BF` — 로고 에셋 `src/assets/logo.png` 네온 휴와 눈대중 매칭, 필요시 미세조정).
- `src/components/workspace/Titlebar.tsx` L12: `<Zap size={11} …/>` → `<BrandMark size={11}/>` (정렬 유지).
- `src/views/OnboardingWizard.tsx` L144: `<Zap size={20} …/>` → `<BrandMark size={20}/>` (marginRight 유지).
- `src/views/HomeView.tsx` L210, L244: tagline 문자열 교체 (하드코딩 → 그대로 문자열 교체, i18n 비대상 브랜드 문구).
- 제외: `SkillMatrixTab.tsx`의 Zap은 "auto" 의미 아이콘 — 유지.

## AC
1. Titlebar·OnboardingWizard에서 Zap 제거, `{ }` 글리프 렌더 (각 브레이스 색 분리).
2. 두 위치 모두 기존 크기/정렬/간격 유지.
3. tagline 2곳 모두 "product orchestrator".
4. 미사용 Zap import 제거, tsc 0 errors, locale check 통과.

## QA smoke
- `pnpm build` 클린 → 앱 실행 → Titlebar / HomeView hero·header / OnboardingWizard 비주얼 확인 (글리프 색·정렬, tagline).
