---
ticket_id: T-PATCH-126
version: v0.5
round: patch
type: chore
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: skipped
qa_loops: 1
slug: brandmark-brace-spacing
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-126 — 상단바 로고 괄호 사이 띄어쓰기

## §1. Request

shawn (대화, 2026-06-12): 상단바에 쓰는 로고(BrandMark, `{` `}` 한 쌍) 사이에 띄어쓰기 하나 넣어줘. 현재 `letterSpacing` 이 빡빡해 `{}` 가 붙어 보임 → `{ }` 처럼 한 칸 벌어지게.

## §2. Acceptance

- BDD-1: Given 상단바 BrandMark / Then `{` 와 `}` 사이에 시각적 공백 한 칸이 보인다.
- BDD-2: 두 괄호 색(violet `{` / mint `}`)·크기·정렬 등 나머지 스타일 불변.
- BDD-3: BrandMark 가 다른 곳(있다면)에서 재사용돼도 깨지지 않음.

## §3. Plan

`packages/gui/src/components/BrandMark.tsx`: 두 span(`{` / `}`) 사이에 공백 한 칸을 넣음. 권장: 두 글자 사이에 `<span> </span>` 또는 `{' '}` 삽입(letterSpacing 음수값 영향 안 받게), 또는 `letterSpacing` 음수(-0.05em) 완화로 간격 확보. 시각 검증 후 자연스러운 쪽 채택.

## §4. Outcome

`packages/gui/src/components/BrandMark.tsx`: 외곽 flex 스타일 객체에 `gap: '0.22em'` 추가, `{` span 과 `}` span 사이의 공백 span 제거.

```
// style const (외곽 wrapper)
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.22em',          ← 추가
  userSelect: 'none',
  flexShrink: 0,

// JSX
<span style={{ color: '#8B5CF6' }}>{`{`}</span>
<span style={{ color: '#2DD4BF' }}>{`}`}</span>   ← 사이 공백 span 제거
```

#### Attempt 1 (FAILED — user hands-on)

`<span style={{ letterSpacing: 'normal' }}>{' '}</span>` 공백 span 삽입안. user hands-on 결과 괄호가 여전히 붙어 보임. 근본 원인: 외곽 wrapper 가 `display: inline-flex` (L18) 라서 flex 컨테이너 안의 **공백만 든 텍스트 노드 span 은 폭 0 으로 collapse** — 화이트스페이스가 렌더링되지 않음. letterSpacing 격리는 무관했고 flex 가 공백을 먹어버린 것.

#### Attempt 2 (현재 — self-verify PASS)

flex 컨테이너에서 안정적으로 보이는 간격은 텍스트 공백이 아니라 **flex `gap`**. 외곽 style 객체에 `gap: '0.22em'` 추가 → 두 자식 span(`{` / `}`) 사이에 항상 보이는 간격 확보. `em` 기준이라 `size` prop 에 비례 스케일. 공백 텍스트 노드(span)는 완전히 제거.

설계 노트:
- 두 괄호 색(violet `#8B5CF6` / mint `#2DD4BF`)·`fontSize`(size prop)·`fontWeight 700`·정렬(inline-flex/center) 전부 불변 → BDD-2 충족.
- 자식 span 2개만 남고 gap 은 외곽 wrapper 한정 — 재사용처는 BrandMark 단위로 임베드되므로 레이아웃 영향 없음(BDD-3).

BDD 매핑: BDD-1 → flex gap 으로 `{` `}` 사이 시각적 간격 가시화. BDD-2 → 색/크기/정렬 불변. BDD-3 → 자식 구조 단순화, gap 은 wrapper 내부 한정으로 재사용 안전.

Self-verify (Electron headless 불가 → 정적+타입 검증):
- `pnpm exec tsc --noEmit` → PASS (TSC_EXIT=0). `pnpm run build` (vite renderer + electron main/preload) → PASS (✓ built).
- React 규칙: 신규 hook/effect 없음(스타일 한 줄 추가 + JSX 한 줄 제거). hook 어김 없음.

User hands-on 필요: 상단바 로고가 `{ }` 로 한 칸 벌어져 보이는지 시각 확인.

Deviation: attempt 1 의 공백 span 방식은 flex collapse 로 무효 → flex `gap` 방식으로 교체.
