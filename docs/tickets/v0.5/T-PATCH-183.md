---
ticket_id: T-PATCH-183
version: v0.5
slug: md-viewer-light-dark-toggle
title: MD 뷰어 문서 표면 light/dark 토글 — ZoomControls 옆 sun/moon 버튼 + .md-doc.md-light 스코프 light 팔레트
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: [shared-primitive, new-theme]
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 14
note: 라이트 링크 대비 후속 = T-PATCH-185
---

## Problem

MD 뷰어(`MarkdownViewer.tsx` `viewerWrap`, `.md-doc`)는 dark 전용이다. 장문 PRD/doctrine
문서를 light 종이처럼 읽고 싶다는 요청. **문서 표면만** light/dark 토글하고 toolbar·shell·
chat·Mermaid/Image 탭은 dark 유지해야 한다. 전체 앱 light 는 Phase 5 — 이건 md-viewer 한정
조기 도입(early-light).

제약:
- `md-recipes.css` + `MdRenderer` 는 **chat 버블과 공유**(shared-primitive). light 는 절대
  `.md-doc.md-light` 스코프 밖으로 새면 안 된다 → chat 회귀 0.
- recipe 대부분 token 기반이라 var 재선언으로 flip 되지만, **raw-hex 박힌 지점**(code-block bg,
  MetadataPanel 인라인 스타일, sticky band 등)은 자동 flip 안 됨 → 명시 override 필요. 한 곳이라도
  놓치면 light 문서 위 dark island.
- default = dark, first run 도 dark.

검증 완료(개발자 재탐색 불필요):
- `ArtifactMermaidTab.tsx` 는 **자체 로컬 `viewerWrap`(line 261)** 사용, `.md-doc` 미사용 →
  Mermaid/Image 표면은 토글 영향 자연히 배제. 토글은 md 문서 전용으로 둔다.
- `zoom` 은 `viewerWrap` 의 CSS `zoom` 속성. light modifier 는 색만 건드리므로 zoom 과 직교.

## Light palette (token table) — SSoT = design-system.md §2.10

paper 배경 `#FAFAF9`. `.md-doc.md-light` 안에서 아래 themeable var 만 light 값으로 재선언.
전체 표·WCAG 근거는 **design-system.md §2.10** (이번 라운드 기록 완료). 핵심:

| token | light hex | md doc role |
|---|---|---|
| `--surface-base` | `#F1F0EE` | code-block bg |
| `--surface-body` | `#FAFAF9` | 문서 paper bg |
| `--surface-panel` | `#F1F0EE` | table zebra(even), metadata card bg |
| `--surface-subpanel` | `#ECEBE8` | inline-code bg, blockquote bg, table th |
| `--border-subtle` | `#ECEBE8` | td top border |
| `--border-default` | `#E2E0DC` | code/table 외곽, hr |
| `--border-strong` | `#CFCCC6` | th bottom, blockquote bar, hover |
| `--border-muted` | `#BDB9B2` | disabled 외곽 |
| `--text-primary` | `#1F1F22` | 본문 p/li/td (15.6:1 AAA) |
| `--text-emphasis` | `#101012` | h1/strong/th (17.4:1 AAA) |
| `--text-secondary` | `#3F3F46` | h3/code-block/blockquote (9.4:1 AAA) |
| `--text-muted` | `#57575E` | list marker/metadata (7.1:1 AAA) |
| `--text-faint` | `#6B6B73` | comment/placeholder (5.0:1 AA) |
| `--accent` | `#7C3AED` | link/inline accent (4.9:1 AA) |
| `--health-success` | `#0E8F63` | sx-string (4.6:1 vs code bg) |
| `--health-error` | `#C62828` | error tone (5.4:1 AA) |

## Scope mechanism

`.md-doc.md-light` modifier 를 `viewerWrap` div 에 토글로 붙인다(현재 `className="md-doc"` →
light 시 `"md-doc md-light"`). `md-recipes.css` 에 `.md-doc.md-light { --surface-…: …; }`
블록 1개로 위 var 전부 재선언 → token 기반 recipe(.md-h1/.md-body/.md-code-inline/.md-table*/
.md-blockquote/.md-ul·ol marker/.sx-*/.md-hr 등) **자동 flip**. **신규 token 명 금지** — 기존
명 재선언만.

CRITICAL: light 선언은 반드시 `.md-doc.md-light` 자손에 한정. `:root` 나 `.md-doc` 단독,
`.md-light` 단독으로 풀어두면 chat/shell 로 샌다.

## Raw-hex 변환 체크리스트 (자동 flip 안 됨 — 한 곳도 빠뜨리면 dark island)

`md-recipes.css`:
- [ ] `.md-code-block { background: var(--surface-base) }` — 이미 token. **단** light 에서
      `--surface-base` 재선언으로 자동 flip 됨(확인만). code 안 raw `#0A0A0A` 잔존 없는지 grep.
- [ ] `.sx-string` = `var(--health-success)` → light 재선언으로 `#0E8F63` flip(자동, 확인).
- [ ] 나머지 sx-* 전부 token → 자동.

`MarkdownViewer.tsx` (인라인 스타일, var 미사용 → **명시 override 또는 var화 필요**):
- [ ] `viewerWrap` 자체는 색 무(padding/maxWidth/fontSize만) → OK.
- [ ] sticky band(`stickyBand` `rgba(15,15,15,0.96)`/`borderBottom #1A1A1A`, `stickyRow`
      color `#B0B0B4`, chevron `#3A3A3A`) — sticky band 는 **문서 표면 위에 떠 있는 문서 크롬**.
      결정 필요(아래 open-q). 권장: light 시 band 도 light(paper 반투명 `rgba(250,250,249,0.96)`
      + border `var(--border-default)` + text `var(--text-muted)`). `md-light` 상태를 컴포넌트가
      알고 inline 분기 OR band 를 CSS 클래스화 후 `.md-doc.md-light .md-sticky-band` override.
- [ ] `modeHint`/`savedText`/breadcrumb 등은 **header/body 크롬**(문서 표면 밖) → dark 유지, 손대지 말 것.

`MetadataPanel.tsx` (전부 raw-hex 인라인 — `.md-doc` 자손이지만 token var 안 씀 → **flip 안 됨**):
- [ ] `panel` bg `#141414` / border `#1F1F1F` → light card(`#F1F0EE` / `#E2E0DC`).
- [ ] `titleText` `#F0F0F0` → `#101012`.
- [ ] `keyCell` `#707070` → `#6B6B73`; `valCell` `#C8C8CC` → `#3F3F46`.
- [ ] `badgeForTone` success `#34D399`/`#1C3A30`, error `#EF4444`/`#3A1C1C`, neutral `#A0A0A0`
      → light tone(success `#0E8F63`, error `#C62828`, neutral `#57575E`) + light border.
- [ ] `warnBadge` `#E0A030`/`#3A2E12` → light warn(text `#8A5A00`, border `#E8DCC0`).
- [ ] `toggleBtn` `#707070` + chevron `#707070` → `#6B6B73`.
      구현 권장: MetadataPanel 을 token var(`var(--surface-panel)` 등)로 var화 → `.md-doc.md-light`
      재선언이 자동 적용(인라인 px-literal 관행이지만 var 전환이 dual-maintenance 제거). var화가
      과하면 `md-light` boolean prop 받아 light 스타일 객체 분기. **둘 중 하나 — 누락 0 이 AC.**

## Toggle UI spec

- 위치: `MarkdownViewer` `headerRight`, `ZoomControls` **바로 옆**(zoom 그룹 다음, 같은 row).
  zoomEnabled 와 무관하게 항상 노출(문서 탭 한정).
- 아이콘: lucide `Sun`(현재 light→클릭 시 dark로) / `Moon`(현재 dark→클릭 시 light로). size 12,
  stroke 1.5(§7.2). 현재 테마가 아니라 **누르면 갈 테마**를 보일지 vs 현재 테마를 보일지 통일 —
  권장: **현재 상태 아이콘**(dark면 Moon, light면 Sun) + tooltip 이 동작 설명.
- 스타일: `ZoomControls` 의 `zoomBtn` 톤 재사용(bg `#1A1A1A`, color `#A0A0A0`, border `#1F1F1F`).
  **toolbar 는 항상 dark** — 버튼 자체는 light 로 안 바뀜.
- a11y: `aria-label` + `title` i18n. `aria-pressed` 로 토글 상태 노출.
- i18n keys (en.json / ko.json, `workspace.mdViewer.*` 블록에 추가):
  - `theme.toLight`: "Switch to light document" / "문서를 라이트로 전환"
  - `theme.toDark`: "Switch to dark document" / "문서를 다크로 전환"
  - (또는 단일 `theme.toggle` + 상태별 라벨 2개. 위 2-key 권장.)

## Persistence

- 전역 persisted localStorage key: `productune.mdViewer.theme` ('dark' | 'light').
- 기존 관행(`App.tsx` `productune.lastProject`, `QuickOpenPalette` RECENT_KEY) 따라
  **try/catch 가드** 필수(localStorage 불가 환경 silent fallback).
- first run / 파싱 실패 / 미설정 → **default 'dark'**.
- 전역 1개 key → 모든 md 탭이 같은 테마 공유(탭별 분리 아님). 토글 시 즉시 반영 + 저장.

## Edge cases

- **Mermaid/Image 탭**: 자체 `viewerWrap`(`.md-doc` 미사용) → 토글 영향 없음. 토글 버튼도
  md 문서 탭에서만 렌더(Mermaid/Image 헤더엔 미추가). 다이어그램은 dark 유지.
- **zoom + light**: `zoom` CSS prop 과 색 modifier 직교 → 동시 적용 안전. 회귀 확인만.
- **metadata/frontmatter card**: light 시 paper 보다 한 단계 진한 `#F1F0EE` card 로 분리감 유지
  (위 변환 체크리스트). badge tone 도 light contrast 로.
- **sx-* code 가독성**: code-block light bg(`#F1F0EE`) 위에서 dark string 색 `#34D399` 깨짐 →
  light `#0E8F63` 재선언으로 해결(§2.10). keyword/comment/punct/number 는 light text 토큰으로 충족.
- **sticky band**: 문서 표면 위 떠 있는 크롬 — light 시 band 도 light 권장(open-q). 안 바꾸면
  light 문서 위 dark 막대로 떠 시각 충돌.
- **prefers-color-scheme**: 이번 범위 밖. 명시 default dark 고정(OS light 여도 dark first run).

## AC

1. ZoomControls 옆 sun/moon 토글 노출(md 문서 탭 한정), default dark, first run dark.
2. 토글 시 **문서 표면만** light/dark flip — toolbar·breadcrumb·modeHint·shell·chat·Mermaid/Image
   탭 dark 유지(회귀 0).
3. light 에서 **dark island 없음**: code-block / inline-code / table(th·zebra·border) /
   blockquote / list marker / hr / link / **MetadataPanel(card·title·grid·badge·toggle)** /
   sticky band 전부 light 화. 위 체크리스트 전 항목 충족.
4. light 본문 WCAG-AA 이상(§2.10 ratio), sx-string 등 code 색 code-bg 위 AA.
5. `productune.mdViewer.theme` localStorage 영속(try/catch), 재실행 시 마지막 테마 복원.
6. chat 버블 렌더 회귀 0 (light 가 `.md-doc.md-light` 밖으로 안 샘 — grep 으로 셀렉터 스코프 확인).
7. 신규 DS token 명 0 (기존 token 재선언만). GUI tsc 통과.

## Scope guard

대상: `md-recipes.css`(`.md-doc.md-light` 블록 + sticky band 클래스화 시 1셀렉터),
`MarkdownViewer.tsx`(토글 버튼 + className 분기 + persistence + sticky band light),
`MetadataPanel.tsx`(light 분기/var화), `ZoomControls.tsx`는 **건드리지 않음**(토글은 형제 버튼으로
별도 추가, ZoomControls 재사용 계약 불변), `en.json`/`ko.json`(i18n keys).
- 전체 앱 light theme(Phase 5) 손대지 말 것 — `.md-doc.md-light` 스코프 엄수.
- `MdRenderer.tsx` 로직 변경 금지(shared-primitive, className 만 부모가 제어).
- Mermaid/Image 탭 색 변경 금지.
