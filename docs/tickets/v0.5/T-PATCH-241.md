---
ticket_id: T-PATCH-241
version: v0.5
slug: p3-close-design-fix
title: P3 close-gate design ✗ 4건 fix — entry/onboarding off-spec hex + favicon + meta
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: design-system
estimated_complexity: L2
risk_flags: [close-gate-blocker, entry-surface]
created_at: 2026-06-23T00:00:00Z
---

# P3 close-gate design ✗ 4건 fix

T-PATCH-240 design_review (no-waiver) 4 ✗ 해소. 범위 = **진입/온보딩 critical surface + index.html만** (DS §11 전체 hex→token 마이그는 별도 deferred 티켓, 건드리지 않음).

## Fix scope
1. `packages/gui/index.html` — `<meta name="description" content="...">` 추가 + `<link rel="icon" href="...">` (build/icon.png 참조, 올바른 상대경로).
2. 진입/온보딩 off-spec hex → DS 토큰 정렬:
   - `BrandMark.tsx:28` `#2DD4BF`(mint) → DS 브랜드 토큰 (T-006 brand=CLI purple; mint 승격 안 함).
   - `views/onboarding/styles.ts:73-74` `#1E1E2E`/`#818CF8` → DS surface/accent 토큰.
   - `App.tsx:451,486,494` `#0F0F11`/`#242428`/`#161618` → DS surface 토큰.
   - critical UI `#F87171` → DS `--health-error #EF4444`.
   - `App.tsx`·`NewProjectModal.tsx` `⚡` 컬러 이모지 제거 (DS §7.1) → DS-consistent 아이콘/텍스트.

## Outcome

빌드 결과: **pass** (`pnpm --filter @productune/gui build` — 4.21s, 에러 없음. 기존 CSS 주석 경고·chunk size advisory는 pre-existing, 본 패치 무관).

### 수정 내역 (file:line → token/value)

1. **index.html** — `<meta name="description">` 추가 (ko/en 제품 설명) + `<link rel="icon" href="/favicon.png">` 추가. `public/favicon.png`를 `build/icon.png`에서 복사해 Vite publicDir 경로로 제공.
2. **BrandMark.tsx:28** — `#2DD4BF` (mint) → `#8B5CF6` (`--accent` / `--brand-purple`). 닫는 `}` 도 브랜드 퍼플로 통일.
3. **views/onboarding/styles.ts:72-74** — `btnEngineAction`: `#1E1E2E` → `#1C1C20` (`--surface-modal`), `#818CF8` (indigo-400, off-spec) → `#8B5CF6` (`--accent`), border alpha → `rgba(139,92,246,0.27)` (accent 계열 정합).
4. **App.tsx:452** — `#0F0F11` → `#0F0F0F` (`--surface-body`). **App.tsx:487** — `#242428` → `#1C1C20` (`--surface-modal`). **App.tsx:495** — `#161618` → `#141414` (`--surface-panel`). `⚡` 컬러 이모지 제거 → `<FolderOpen size={14} color="#8B5CF6" strokeWidth={2} />` (lucide, DS §7.1 정합).
5. **NewProjectModal.tsx:53** — `⚡` 컬러 이모지 제거 → `<FolderOpen size={16} color="#8B5CF6" strokeWidth={2} />` (lucide, DS §7.1 정합).
6. **views/onboarding/TierBadge.tsx:7** — `#F87171` (red-400, off-spec) → `#EF4444` (`--health-error`).
7. **(follow-up — designer 재검 누락분)** **views/onboarding/styles.ts:41** — `stepIntro` color `#B0B0B0` (DS 미정의) → `#A0A0A0` (`--text-muted`). 온보딩 intro = critical entry surface. 동반 cosmetic: **BrandMark.tsx** 상단 JSDoc 'mint close-brace' stale 문구 → brand-purple로 정정 (이전 unresolved 해소). 재빌드 **pass** (4.03s, 에러 없음).
