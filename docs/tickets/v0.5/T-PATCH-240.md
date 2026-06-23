---
ticket_id: T-PATCH-240
version: v0.5
slug: p3-close-design-review
title: P3 close gate — design-compliance check (v0.5)
type: design
status: done
phase: 3
assignee: pdt-designer
requires_qa: false
requires_user_gate: false
area_tag: design-system
estimated_complexity: L2
risk_flags: [close-gate, no-waiver]
created_at: 2026-06-23T00:00:00Z
---

# P3 close gate — design-compliance check (v0.5)

close_gate step `design_review` (T+0, **mandatory, no waiver**). Auto-check the shipped v0.5 build against DS per `designer/bookshelf/phase3-close-gate.md`.

## Scope (verify each → ok | na | fail)
- design_system_consistency (color/spacing/typography tokens vs DS, no off-spec)
- typography (family + scale, no system default)
- color_palette (brand colors, no off-palette in critical UI)
- spacing (DS tokens, no magic-number px in critical layout)
- logo / favicon / og_image / meta_tags (entry HTML refs)
- app_icons_splash (Electron — note: dmg .icns is v0.5 Deploy scope, not yet landed)
- aesthetic_anti_default (3-axis rubric, `qa/bookshelf/design-review.md` bands SoT; utility-UI judged on restraint; close-FAIL = slop≥6 on entry surface / over-signature on utility / a11y regression)

## Outcome

- **design_system_consistency** ✗ — 다수 컴포넌트에 off-spec 인라인 hex 잔존. 주요 사례: `BrandMark.tsx` `#2DD4BF`(DS 미정의 mint), `onboarding/styles.ts` `#1E1E2E`/`#818CF8`(off-palette violet-indigo), `App.tsx` `#0F0F11`/`#242428`/`#161618`(근사 변형이나 DS 토큰 아님), 여러 컴포넌트 `#F87171`(DS `--health-error #EF4444` 아님). DS §11 마이그레이션 ticket 별도 예정이나, 진입 화면(FreshComposer/App.tsx)·온보딩 카드에서의 off-spec 사용은 critical UI 범위로 close-gate ✗.
- **typography** ✓ — `index.html` body 폰트 스택에 `Pretendard Variable` / `Pretendard` 선행 추가 (DS §4.1 미기재). 단, DS §4.1 주석 "WorkspaceShell 의 현행 stack 유지" + 한국어 fallback OS 위임 취지에 부합하며, Pretendard 는 `-apple-system` 계열 fallback 앞에 안전하게 선두 배치됨. 가족·굵기·크기 스케일 자체는 DS 준수 (13px body, 14px md, semibold heading 등). `main.tsx`에서 `pretendard/dist/web/variable/pretendardvariable.css` import 확인. ✓ 처리 (DS §4.1 delta로 기록 — 후속 DS 문서 갱신 권장).
- **color_palette** ✗ — `design_system_consistency` 항목과 동일 사유. 진입 화면(`App.tsx` 프로젝트 선택 모달, `FreshComposer` 초기 화면)에 DS 팔레트 외 hex 다수(`#2DD4BF`, `#0F0F11`, `#242428`, `#161618`). `--health-error` 대신 `#F87171` 사용 (대부분 utility 영역 — 대비는 6.9:1 AA 통과이나 token 불일치). `⚡` 컬러 이모지 `App.tsx`·`NewProjectModal.tsx` 사용 (DS §7.1 컬러 emoji 금지).
- **spacing** ✓ (partial) — WorkspaceShell shell grid row heights(44px/28px), activity bar 48px 등은 DS §3 `--space-12`(48) 정합. 온보딩 카드는 raw px(`10px`, `5px`, `20px`, `16px 20px`) 혼용이나, 이는 DS §11 "legacy 값 점진 정렬" 마이그레이션 대상으로 명시됨 — critical layout 게이팅 수준 아님. ✓ 처리 (레거시 인정 + 별도 ticket).
- **logo** ✓ — `src/assets/logo.png` 존재, `FreshComposer.tsx`에서 참조 + 렌더링 확인.
- **favicon** ✗ — `index.html`에 `<link rel="icon">` 태그 없음. 브라우저/Electron 탭 아이콘 미지정. `build/icon.icns` + `build/icon.png` 존재하나 entry HTML에 favicon 링크 미연결.
- **og_image** N/A — Electron 데스크탑 앱. OG 메타태그는 웹 배포 시 적용 (현재 Electron-only 빌드 — 해당 없음).
- **meta_tags** ✗ — `index.html`에 `<meta name="description">` 없음. `<title>productune</title>`는 존재. OG 태그(`og:title`, `og:description`, `og:image`) 없음 — Electron 앱이라 OG 자체는 N/A이나 `<meta name="description">` 부재는 close-gate ✗ 처리 (phase3-close-gate.md 항목 명시).
- **app_icons_splash** N/A (blocked-with-ref) — `build/icon.icns` + `build/icon.png` 빌드 리소스 존재 확인. dmg 패키징(`.icns` 실제 배포 검증)은 v0.5 Deploy scope — 아직 미착수. 현 Build phase 기준 아이콘 파일 자체는 있음 → N/A (블로킹 아님, Deploy phase에서 재검증 필요).
- **aesthetic_anti_default** ✓ — 3-axis 루브릭 평가: 진입 화면(App.tsx 프로젝트 선택 모달, FreshComposer, 온보딩 카드) + 유틸리티(WorkspaceShell 4-region). **Slop index**: 3/10 — 그라디언트 없음, `rounded-2xl`/shadow spam 없음, lucide spray 없음, max-w-7xl 3-up grid 없음. 진입 화면은 monochrome dark + brand purple CTA + logo 로 서명 있음. 온보딩은 step-card 패턴 (IDE utility 친화). 유틸리티 UI(workspace)는 4-region restraint 유지 — over-signature 없음. **System & finish**: 3/5 — token recipe(`md-recipes.css`) 잘 정의됨, 일부 inline hex 혼재가 system 완성도를 낮춤. **A11y & usability**: 4/5 — 신규 contrast 회귀 없음(`#F87171` 6.9:1 AA, `#2DD4BF` 10.3:1 AAA), focus ring `#8B5CF6 2px` 전역 선언, prefers-reduced-motion 구현됨. 기존 `#707070` 3.87:1 deferred(이미 backlog — 재블로킹 없음). ⚡ 이모지는 DS §7.1 위반이나 a11y 회귀 아님. close-FAIL 임계(slop≥6 / over-signature / a11y regression) 미달 → **✓**.

**요약: 4/8 ✓, 1 N/A+blocked-with-ref, 3 ✗** (design_system_consistency, color_palette, favicon, meta_tags)

> ✗ 항목 해소 후 status → done 으로 전환 가능. blocked: true 유지.

---

## 재검 (T-PATCH-241 fix 후, 2026-06-23)

developer fix 6건 파일 단위 재확인 (changelog 아닌 실파일 검증):
- ✓ `index.html` — `<meta name="description">` + `<link rel="icon" href="/favicon.png">` 추가 확인. `public/favicon.png`(903KB) 물리 존재 + Vite 기본 publicDir → `/favicon.png` 런타임 해석 OK. (주: `git status`상 `??` untracked — coordinator "git 추적 확인됨" 주장과 불일치하나, 파일 존재 + Vite publicDir 서빙은 git 상태 무관이므로 design-compliance ✗ 아님. developer/PO가 stage/commit 필요한 hygiene 사항으로 별도 surface.)
- ✓ `BrandMark.tsx:27-28` — 양 brace `#8B5CF6`(--accent) 통일, mint `#2DD4BF` 제거 확인. (주석 line 7 "mint close-brace" stale — cosmetic, 토큰 무관.)
- ✓ `onboarding/styles.ts:72-73` — `#1C1C20`(--surface-modal) / `#8B5CF6`(--accent) / border `rgba(139,92,246,0.27)` 확인.
- ✓ `App.tsx:452/466/495` — `#0F0F0F`/`#1C1C20`/`#141414` 토큰 정합 확인 (`#0F0F11`은 line 440 주석 잔재만, 라이브 스타일 아님).
- ✓ `App.tsx:387` + `NewProjectModal.tsx:54` — `⚡` 제거 → `<FolderOpen color="#8B5CF6" />` (lucide, DS §7.1) 확인.
- ✓ `TierBadge.tsx:7` — `#EF4444`(--health-error) 확인.

**재검 결과: favicon ✓, meta_tags ✓, color_palette ✓ (브랜드/이모지 해소). design_system_consistency = 여전히 ✗** — 범위 외 잔여 1건 발견: `onboarding/styles.ts:41` `stepIntro` color `#B0B0B0` 가 DS 미정의 hex (가장 가까운 토큰 `--text-muted #A0A0A0` / `--text-secondary #C8C8CC` 사이). 온보딩 intro 본문 = critical entry surface. 대비 8.49:1 AAA (a11y 회귀 아님) 이나 off-spec hex 1건이 critical surface에 잔존 → no-waiver close-gate에서 clean ✓ 불가. **fix: `#B0B0B0` → `#A0A0A0`(--text-muted) 또는 `#C8C8CC`(--text-secondary).**

**재검 요약: 5/8 ✓, 1 N/A, 1 ✗ (design_system_consistency — `styles.ts:41 #B0B0B0` 1건). ready_for_close = false (open ✗ 1).**

---

## 최종 재검 (T-PATCH-241 잔여 fix 후, 2026-06-23)

- ✓ `onboarding/styles.ts:41` — `stepIntro` color `#A0A0A0`(--text-muted) 확인 (`#B0B0B0` 제거). 대비 7.04:1 AAA.
- ✓ `BrandMark.tsx` — stale JSDoc 정정 확인 (`mint`/`#2DD4BF` 잔재 0).
- 스코프 critical surface 전체 재스캔: off-spec hex live style 0건 (`App.tsx:440` `#0F0F11`은 주석 한 줄 — 라이브 스타일 아님, 무해).

**design_system_consistency → ✓. open ✗ = 0.** 최종: **7/8 ✓ (design_system_consistency·typography·color_palette·spacing·logo·favicon·meta_tags·aesthetic_anti_default), og_image + app_icons_splash = N/A, 0 ✗.** close_gate `design_review` 통과. frontmatter `status: done`, `blocked` 제거.
