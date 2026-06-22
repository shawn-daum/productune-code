---
ticket_id: T-PATCH-179
version: v0.5
slug: md-frontmatter-strip-metadata-card
title: MD 뷰어 YAML frontmatter strip + metadata 카드 패널 (Option A)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: shared-primitive, render-regression
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 8
---

## Problem
PRD/ticket 등 frontmatter를 가진 md 문서가 GUI md 뷰어에서 열리면, 문서 최상단 YAML
블록(`slug:` `version:` `round:` `state:` `ambiguity_score:` `risk_flags:` …)이 strip 되지
않고 그대로 markdown 본문으로 흘러들어가 **plain text 한 덩어리(paragraph blob)** 로
렌더링된다. `---` 펜스가 `<hr>` 또는 setext heading 으로 오인되기도 해 가독성이 HTML
대비 크게 떨어진다.

원인: render path `PrdSection → ArtifactMdTab → MarkdownViewer → MdRenderer` 어디에도
frontmatter 파싱이 없다(`gray-matter` 미사용). `MarkdownViewer.tsx:449` 가 로드된
`content` 를 그대로 `<MdRenderer text={content} />` 에 넘긴다.

사용자 승인 = **Option A: frontmatter strip + metadata card.**

## Design spec (the panel)

### 배치 (placement decision)
파싱·strip·패널 렌더링은 **`MarkdownViewer.tsx` (document layer) 에만** 둔다.
`MdRenderer` 는 chat 버블·artifact-md·generic viewer 3곳이 공유하며 **chat 메시지에는
frontmatter 가 없다.** MdRenderer 에 넣으면 chat 본문 첫 줄이 우연히 `---` 면 오작동
위험 + 공유 회귀 위험. document 단인 MarkdownViewer 는 "한 파일 = 한 문서" 계약이라
frontmatter 의 유일한 정당한 소유 지점이다.

### 파싱 (lib choice)
**`gray-matter` 도입 금지.** Node `Buffer`/`fs` 가정이 있어 renderer(브라우저) 번들에
깨끗이 들어가지 않는다. 대신 **경량 인라인 파서**를 신설한다:
`packages/gui/src/components/workspace/main/panes/frontmatter.ts`

- 시그니처: `parseFrontmatter(raw: string): { data: Record<string,string>; body: string }`
- 규칙: 문서가 정확히 `---\n` 으로 **시작**할 때만 동작. 다음 `\n---\n`(또는 EOF 직전
  `\n---`) 까지를 frontmatter 블록으로 잡고 그 **이후만 `body`** 로 반환.
- 블록 내부는 `key: value` 한 줄 단위로만 파싱(flat). nested map/멀티라인은 raw string
  으로 보존(값 그대로 저장). `risk_flags: a, b` 같은 인라인 리스트는 split 하지 않고 값
  문자열 그대로 둔 뒤 표시 단에서 콤마 분리(파서는 dumb, 표시단이 똑똑).
- 매칭 실패(여는 `---` 없음 / 닫는 `---` 없음) → `{ data:{}, body: raw }` (원문 그대로,
  손실 0).

### 패널 위치 & 기본 상태
- 위치: `viewerWrap`(본문) **바로 위**, sticky band **아래**. 즉 body scroll 컨텐츠
  최상단. zoom/sticky 로직 비간섭.
- editing(textarea) 모드에서는 **패널 숨김** — 편집 대상은 frontmatter 포함 원문이므로
  draft 는 항상 `content`(raw, frontmatter 포함) 그대로 유지. strip 은 **preview 렌더링
  전용**. (저장 라운드트립에서 frontmatter 유실 0 — AC 로 강제)
- 기본 **always-shown (우선 필드만)**, 나머지는 **collapsed**. collapse 토글은 패널
  하단 "더보기 N" / "접기" 텍스트 버튼.

### 우선 필드 (shown) / 접힌 필드 (collapsed)
field universe 는 PRD·ticket frontmatter 공통(`docs/tickets/v0.5/T-001.md` 등 실측).

- **shown (priority, 항상 표시):** `title`, `status`, `state`, `version`, `phase`,
  `type`, `assignee`, `slug`, `round`, `risk_flags`, `ambiguity_score`, `confidence`,
  `estimated_complexity`, `qa_status`
- **collapsed (더보기 안):** 위 우선셋 외 **나머지 전부** (`session_id`,
  `weights_override`, `created_at`, `started_at`, `completed_at`, `duration_min`,
  `qa_loops`, `clarity_iter`, `model`, `effort`, `worktree_path`, `branch`, `bundle`,
  `commit`, `depends_on`, `parent_ticket`, … 미래 신규 키 포함)
- 규칙: shown 셋은 **고정 화이트리스트 순서**대로, 실제 존재하는 키만 렌더. collapsed 는
  "남은 키 전부" (블랙리스트 아님 — 미래 키 자동 수용).

### 렌더 형태
1. **헤더 행(있으면):** `title` 값을 패널 상단 강조 텍스트(`--text-md-plus`,
   `--weight-semibold`, `--text-emphasis`)로. 없으면 생략.
2. **배지 행(badge row, pill):** `status` `state` `risk_flags`(각 flag 1배지)
   `qa_status` 는 색상 배지로.
   - status/state 매핑: `done`/`pass` → `--health-success`(#34D399) 계열,
     `todo`/`in_progress`/`review` → `--text-muted` 중립, `blocked`/`fail`/`error` →
     `--health-error`(#EF4444) 계열.
   - `risk_flags` 각 flag → 경고 톤(텍스트 `#E0A030`, border `#3A2E12` — 기존
     `lineCapBadgeOver` 와 동일 톤) pill. 빈 배열/`[]`/빈 문자열 → 배지 0개(행 자체 생략).
   - 배지 pill 스타일은 기존 `roBadge`(radius `--radius-pill` 20, border
     `--border-default`, fontSize `--text-xs` 10) 컨벤션 재사용.
3. **key-value 그리드:** 나머지 shown scalar(`version` `phase` `type` `assignee`
   `slug` `round` `ambiguity_score` `confidence` `estimated_complexity`).
   - 2열 grid (`gridTemplateColumns: 'max-content 1fr'`, rowGap `--space-1` 4,
     columnGap `--space-3` 12). key = `--text-faint`(#707070) `--font-mono`
     `--text-xs`; value = `--text-secondary`(#C8C8CC) `--text-sm`.
   - `ambiguity_score`/`confidence` 는 그리드 셀로(별도 게이지 불필요 — scope guard).
4. **collapsed 영역:** 동일 key-value 그리드 포맷. 토글 닫힘이 기본.

### 컨테이너 스타일 (tokens only — md-recipes.css :root)
- `background: var(--surface-panel)` (#141414), `border: 1px solid var(--border-default)`
  (#1F1F1F), `borderRadius: var(--radius-lg)` (6), `padding: var(--space-3) var(--space-4)`
  (12/16).
- `viewerWrap` 와 같은 가로 정렬 위해 패널도 `maxWidth: 780` + 동일 좌우 inset 안에 둔다
  (패널을 `viewerWrap` padding 박스 안 첫 자식으로 두면 자동 정렬 — 권장).
- 신규 색상 hex 도입 **금지.** 위에 적힌 값은 전부 기존 :root 토큰/기존 style 객체에서 옴.

## Implementation notes
- 신규 파일 `frontmatter.ts` (순수 함수, React 무관) + 신규 컴포넌트
  `MetadataPanel.tsx`(또는 MarkdownViewer 내 로컬 컴포넌트) — pdt-developer 재량.
- `MarkdownViewer.tsx` 변경 최소화:
  - `loadState==='done' && !editing` 일 때 `const { data, body } = parseFrontmatter(content)`
    (useMemo). preview 렌더를 `<MdRenderer text={body} />` 로 교체.
  - `<MetadataPanel data={data} />` 를 `viewerWrap` 박스 안 MdRenderer 위에 삽입.
    `data` 빈 객체면 패널은 `null` 반환(빈 박스 금지).
  - **draft/저장 경로는 `content`(raw) 그대로** — strip 은 preview 전용. textarea seed,
    `onSave(absPath, draft, …)`, dirty 비교 전부 raw 기준 불변.
  - sticky heading 수집은 MdRenderer 출력 DOM(`.md-h1..3`) 기반이라 body 가 frontmatter
    없이 들어가도 그대로 동작(오히려 정확). 변경 불필요.
- i18n: "더보기"/"접기" 라벨은 `t()` 키 신설 (`workspace.mdViewer.showMore` 등).

## Edge cases
- **frontmatter 없음:** `data` 빈 → 패널 미렌더(빈 박스 X), `body===raw`. 현행과 동일.
- **malformed YAML (닫는 `---` 없음 등):** 파서가 매칭 실패로 판단 → `data:{}`, `body:raw`
  → 패널 없이 **원문 그대로 렌더(손실 0)**. 깨진 패널/throw 금지.
- **non-PRD frontmatter (ticket md 등):** 동일 처리 OK. 화이트리스트가 PRD/ticket 공통
  키를 커버하고, 미지 키는 collapsed 로 흡수되므로 문서 타입 분기 불필요.
- **chat 버블:** MdRenderer 직접 사용 — 이 티켓 변경이 닿지 않음(회귀 0).

## AC
1. frontmatter 보유 PRD 를 md 뷰어로 열면 상단 YAML blob 이 **본문에서 사라지고**,
   파싱된 필드가 metadata 패널로 표시된다.
2. 우선 필드(title/status/state/version/phase/type/assignee/slug/round/risk_flags/
   ambiguity_score/confidence/estimated_complexity/qa_status)가 spec 형태(헤더/배지/그리드)
   로 보이고, 나머지 키는 "더보기"로 접혀 있다.
3. `risk_flags` 다중 값 → flag 당 경고 배지 N개; 빈 값 → 배지/행 미표시.
4. frontmatter 없는 md → 패널 미표시, 본문 정상(빈 박스 없음).
5. malformed frontmatter → throw 없이 원문 그대로 렌더(손실 0).
6. **편집→저장 라운드트립에서 frontmatter 유실 0** (저장된 파일이 원본 frontmatter 보존).
7. chat 버블/기타 MdRenderer 사용처 시각 회귀 없음.
8. 신규 색상 hex 0개 (md-recipes.css :root 토큰만).
9. GUI tsc 통과.

## Scope guard
- 수정 허용: `MarkdownViewer.tsx`, 신규 `frontmatter.ts`, 신규 `MetadataPanel.tsx`,
  i18n 리소스(라벨 키). 그 외 금지.
- **`MdRenderer.tsx` 수정 금지** (chat 공유 — 회귀 위험. 이 티켓의 핵심 placement 결정).
- `gray-matter` 등 신규 의존성 추가 금지(경량 인라인 파서).
- ambiguity/confidence 게이지·차트 등 신규 시각요소 금지(이번엔 그리드 셀 텍스트).
- PrdSection/ArtifactMdTab 시그니처 변경 금지(주입 계약 불변).
