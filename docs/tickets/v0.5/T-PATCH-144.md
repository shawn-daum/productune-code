---
ticket_id: T-PATCH-144
version: v0.5
slug: persona-presence-sprite
title: PersonaPresenceBar dot+label 칩 → persona 캐릭터 스프라이트 애니메이션 교체
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: persona-presence-sprite
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-144: PersonaPresenceBar 캐릭터 스프라이트 애니메이션

## Request

채팅 패널 상단 `PersonaPresenceBar` 의 현재 `● PO ● Designer ● Developer ● QA` (dot + label 칩 줄) 을 **persona 캐릭터 애니메이션**으로 교체한다.

- 4명(po / designer / dev / qa) **항상 표시**.
- 해당 persona 가 **working 상태일 때만** 캐릭터 프레임 애니가 재생. `idle` 이면 정지(흐릿). `done` 은 기존 정책 유지.
- 이 bar 가 **단일 표시 지점**. 하단 `StatusBar` 는 건드리지 않는다. 기존 칩을 캐릭터로 대체.

**범위 한정**: 표시 레이어(`PersonaPresenceBar.tsx`)만 교체한다. `store/personaPresence.ts` 는 **불변**(타입·store·PERSONA_ORDER/LABELS/COLORS 그대로 사용). state machine(idle/working/done, `usePOPresenceDerive`, sub-agent derive) 변경 금지.

---

## 결정 사항 (1~8)

### 1. 애니 방식 — **A 채택 (sprite.png 1장 + CSS `background-position` `steps(4)`)**

근거(1줄): persona 당 PNG 1개만 번들/네트워크 진입(4프레임 import 대비 1/4), `background-position` 은 GPU-compositable 하고 JS rAF 루프·per-frame state 가 없어 re-render 0회 — 이 코드베이스의 정적 PNG ES-import 방식(`FreshComposer` `logoUrl`)과 keyframe-once 패턴(`ensureBlinkKeyframe`)에 그대로 얹힌다.

구현 골격:
- sprite 시트 = `2172×724` = `543×724` 프레임 4개 가로 배치.
- 표시 컨테이너에 `width: <표시폭>, height: <표시높이>`, `background-image: url(spriteUrl)`, `background-size: 400% 100%`(4프레임 가로 → 너비 400%), `background-repeat: no-repeat`.
- working: `animation: persona-sprite 0.6s steps(4) infinite;` keyframe `0% { background-position: 0% 0; } 100% { background-position: 100% 0; }` — `steps(4)` 가 4프레임을 끊어서 순환(마지막 프레임이 첫 프레임으로 되돌아오는 정수 스텝).
- idle/done: `animation: none` → `background-position: 0% 0`(frame-01 고정).

> 주의: `steps(4)` + `background-position: 0%→100%` 조합은 5번째 스텝 위치(100%)가 frame-01 과 겹쳐 한 프레임이 비는 흔한 버그가 있다. 시트가 정확히 4프레임이므로 `background-size: 400% 100%` + `background-position: 0% 0 → 100% 0` + `steps(4)` 면 0%·33.33%·66.67%·100%(=다시 frame-01 직전) 으로 떨어진다. 구현 후 육안으로 4프레임이 균등 순환하는지 확인할 것(AC-6).

### 2. 크기 / 레이아웃

- 캐릭터 portrait 비율 0.75(543:724 ≈ 0.75). 현재 `barStyle.height: 24` 는 캐릭터 표시에 너무 낮다 → **bar height 를 56px 로 상향**(캐릭터 + 아래 label 수용).
- 캐릭터 표시 높이 **40px** → 폭 `40 × 0.75 = 30px`.
- label(PO / Designer / Developer / QA) **유지**, 위치 = **캐릭터 아래**(세로 스택: 위 캐릭터 / 아래 label). 기존 `PERSONA_LABELS` + 기존 `labelStyle`(fontSize 10) 재사용.
- 4명 가로 배치: 각 셀 폭 ≈ 30px(캐릭터) — label("Developer")이 더 넓으므로 셀 `min-width` 는 label 폭에 맞춰 자동(`alignItems: center`). 셀 간 `gap` 은 기존 `barStyle.gap: 10` 유지하되 캐릭터 폭 고려해 12로. 4명 + gap 총폭이 패널 폭 내 수용되는지 확인(AC-4).
- `barStyle.padding` 은 `'4px 10px'` 로(상하 여백 확보).

### 3. idle 처리 — **frame-01 정지 + 흐릿(opacity 0.4) + 그레이스케일(`filter: grayscale(1)`)**

근거: "4명 항상 표시" 이므로 working 과 시각 구분이 명확해야 한다. idle = 정지 프레임 + `opacity: 0.4` + `filter: grayscale(1)`, working = full color + opacity 1 + 애니 재생. (그레이스케일+디밍 둘 다 적용해 흑백/저채도로 "대기 중"임을 즉시 전달.)

### 4. working 애니 스펙

- fps: **약 6.7fps** (4프레임 / 0.6s 루프). 캐릭터 work 모션에 자연스럽고 과하지 않음.
- 루프: 무한(`infinite`).
- persona color 활용: 캐릭터 자체는 풀컬러 PNG 이므로 색 입힘 불필요. 단 working 인 셀의 **label 색**은 기존 정책대로 `PERSONA_COLORS[persona]` 적용(idle = `--txt2` `#707070`, working/done = persona color) — 기존 `labelColor` 로직 그대로 재사용.

### 5. done 상태 — 기존 정책 유지

- 캐릭터는 frame-01 정지(full color, opacity 1, 그레이스케일 없음) + label 옆 `✓` + persona color.
- 기존 done artifact tooltip(hover 시 `artifact` 또는 `presence.doneNoArtifact`) + click-outside dismiss(`onDismiss`/`dismissDone`) 로직 **그대로 보존**. PO 는 기존대로 done 에 도달하지 않음(`usePOPresenceDerive` 미변경).

### 6. prefers-reduced-motion: reduce — 애니 정지 (필수)

- 기존 `ensureBlinkKeyframe` 의 `@media (prefers-reduced-motion: reduce)` 패턴을 그대로 따른다. 새 sprite keyframe 도 같은 `<style>` 주입 블록(또는 새 `ensureSpriteKeyframe`) 안에서 reduce 시 정적 프레임이 되도록:
  - reduce 시 `persona-sprite` keyframe 을 `0%,100% { background-position: 0% 0; }` 로 무력화하거나, working 셀에 `@media (prefers-reduced-motion: reduce) { animation: none; }` 적용.
- reduce 환경에서도 working/idle 시각 구분은 **컬러 vs 그레이스케일**(애니 무관)로 유지되므로 정보 손실 없음.

### 7. frame rate / 성능

- sprite-A 방식은 JS 타이머/rAF 없음 → 4명 동시 working 이어도 CSS compositor 가 `background-position` 만 step. re-render 0, main-thread 부담 무시 가능.
- keyframe `<style>` 은 document 당 1회만 주입(react-best-practices `advanced-init-once`, 기존 `ensureBlinkKeyframe` 와 동일 가드).

### 8. i18n

- label 은 기존 `PERSONA_LABELS`(코드 상수) 사용 — 신규 문자열 없음.
- aria: 기존 `workspace.presence.chipAriaLabel`(`{{persona}} — {{state}}`) + `workspace.presence.doneNoArtifact` 재사용. **신규 locale 키 불필요**(ko/en 추가 없음). 컨테이너 `role="status"` + `aria-label` 유지.

---

## 에셋 복사 목록 (src → dst)

복사 대상 디렉터리 신규 생성: `packages/gui/src/assets/personas/`

방식 A 채택이므로 **sprite 시트 4장만 복사**(frame 개별 PNG 는 불필요). key → 파일명 prefix 가 persona 별로 다름에 주의(po/designer/developer = `claude-bold-gen-work`, qa = `claude-v4-side-work`). store key `dev` → 파일 토큰 `developer`(TeamPanel `PERSONA_DIR` 와 동일 규칙).

| store key | src (ntf-assets/productune/) | dst (packages/gui/src/assets/personas/) |
|-----------|------------------------------|------------------------------------------|
| `po`       | `productune-role-po-claude-bold-gen-work-sprite.png`        | `po-work-sprite.png`        |
| `designer` | `productune-role-designer-claude-bold-gen-work-sprite.png`  | `designer-work-sprite.png`  |
| `dev`      | `productune-role-developer-claude-bold-gen-work-sprite.png` | `dev-work-sprite.png`       |
| `qa`       | `productune-role-qa-claude-v4-side-work-sprite.png`         | `qa-work-sprite.png`        |

복사 명령(developer 실행):
```
mkdir -p packages/gui/src/assets/personas
cp ../ntf-assets/productune/productune-role-po-claude-bold-gen-work-sprite.png        packages/gui/src/assets/personas/po-work-sprite.png
cp ../ntf-assets/productune/productune-role-designer-claude-bold-gen-work-sprite.png  packages/gui/src/assets/personas/designer-work-sprite.png
cp ../ntf-assets/productune/productune-role-developer-claude-bold-gen-work-sprite.png packages/gui/src/assets/personas/dev-work-sprite.png
cp ../ntf-assets/productune/productune-role-qa-claude-v4-side-work-sprite.png         packages/gui/src/assets/personas/qa-work-sprite.png
```

> frame-01 개별 PNG 는 idle/done 정지에도 sprite 의 frame-01(`background-position: 0%`)로 커버되므로 복사 불필요. 만약 방식 B 로 선회하면 frame-01~04 16장 복사 필요 — 본 ticket 은 A 기준.

import 패턴(`FreshComposer` 의 `import logoUrl from '../assets/logo.png'` 와 동일, Vite content-hash 번들):
```ts
import poSprite from '../../assets/personas/po-work-sprite.png'
import designerSprite from '../../assets/personas/designer-work-sprite.png'
import devSprite from '../../assets/personas/dev-work-sprite.png'
import qaSprite from '../../assets/personas/qa-work-sprite.png'

const PERSONA_SPRITE: Record<PersonaId, string> = {
  po: poSprite, designer: designerSprite, dev: devSprite, qa: qaSprite,
}
```

---

## 파일별 변경 범위

1. **`packages/gui/src/assets/personas/` (신규)** — 위 표대로 sprite 4장 복사.
2. **`packages/gui/src/components/workspace/PersonaPresenceBar.tsx`** — 유일한 코드 수정 파일:
   - sprite 4장 ES-import + `PERSONA_SPRITE` 매핑 추가.
   - keyframe 주입: 기존 `ensureBlinkKeyframe` 옆에 `ensureSpriteKeyframe`(또는 기존 함수에 `persona-sprite` keyframe 추가) — `<style>` once 가드 + reduce 미디어쿼리 포함.
   - `PersonaChip` 의 표시부 교체: `dotStyle` span → 캐릭터 div(background sprite). 세로 스택(캐릭터 위 / label 아래)으로 wrapper 조정. dim/grayscale by state.
   - `barStyle` 수정: `height: 24 → 56`, `padding: '0 10px' → '4px 10px'`, `gap: 10 → 12`.
   - **보존**: `usePOPresenceDerive`, done tooltip + `handleDocClick`/`onDismiss`, `role="status"`/aria, `PERSONA_ORDER` map, `labelColor` 로직, `PersonaPresenceBar` export 구조.
   - 더 이상 안 쓰는 `persona-blink` dot 스타일 코드는 정리(또는 done/PO 미사용 시 제거) — 단 keyframe-once 패턴 유지.

변경 파일 외(`store/personaPresence.ts`, `TeamPanel.tsx`, `StatusBar`, locale json) **수정 금지**.

---

## react-best-practices note (developer 준수)

- `advanced-init-once`: keyframe `<style>` 주입은 document 당 1회 가드(기존 `ensureBlinkKeyframe` 동일 패턴). 컴포넌트 mount 마다 재주입 금지.
- 애니는 **CSS 전담** — `useState`/`useEffect`/`setInterval`/`requestAnimationFrame` 으로 프레임을 돌리지 말 것(re-render 유발, 본 방식 A 의 목적 무효화). working 여부에 따라 `animation` CSS on/off 만.
- `useEffect` cleanup: 기존 done `document.addEventListener('click', …, true)` 의 `removeEventListener` cleanup 그대로 유지(누수 금지).
- 컴포넌트 내부에서 컴포넌트 정의 금지(`rerender-no-inline-components`) — sprite 셀은 모듈 스코프 컴포넌트/함수로.
- inline 객체 props 로 인한 불필요 re-render 주의(상수 스타일은 모듈 스코프로 hoist, 기존 `tooltipStyle`/`barStyle` 패턴 따름).

---

## Acceptance Criteria

- **AC-1**: bar 에 4명(po/designer/dev/qa) 캐릭터가 `PERSONA_ORDER` 순서로 **항상** 표시되고, 각 캐릭터 아래 label(PO/Designer/Developer/QA)이 보인다.
- **AC-2**: persona 가 `working` 일 때 해당 캐릭터만 4프레임 sprite 애니가 재생되고, `idle` persona 는 정지(frame-01)된다. (PO 는 `workspace.streaming` true 시 working — 기존 derive 동작 그대로.)
- **AC-3**: `idle` 캐릭터는 `working`/`done` 과 시각적으로 구분된다(그레이스케일 + opacity 0.4). working 은 풀컬러.
- **AC-4**: 4명 + label + gap 이 채팅 패널 기본 폭 안에서 가로 오버플로/줄바꿈 없이 들어간다(bar height 56px).
- **AC-5**: `done` persona 는 캐릭터 정지(full color) + label 옆 `✓` + persona color, hover 시 artifact tooltip(없으면 `presence.doneNoArtifact`) 노출, 칩 hover 후 바깥 클릭 시 dismiss 되어 idle 로 돌아간다(기존 동작 동일).
- **AC-6**: working 애니가 4프레임을 균등하게(끊김/빈프레임 없이) 무한 순환한다(`steps(4)` 검증, 위 §1 주의 확인).
- **AC-7**: OS `prefers-reduced-motion: reduce` 시 애니가 정지(정적 frame-01)되며, working/idle 컬러 구분은 유지된다.
- **AC-8**: 동작 중 React re-render 가 프레임마다 발생하지 않는다(애니는 CSS only — rAF/interval/state 프레임 루프 없음). 4명 동시 working 시 main-thread 부담 없음.
- **AC-9**: `store/personaPresence.ts`, `TeamPanel.tsx`, 하단 `StatusBar`, locale json 은 변경되지 않는다(diff 없음).
- **AC-10**: sprite 4장이 `packages/gui/src/assets/personas/` 에 복사되어 Vite ES-import 로 번들되고(빌드 통과), 누락 자산으로 인한 404/빈 이미지가 없다.
- **AC-11**: 신규 locale 키 없이 기존 `workspace.presence.*` aria 키가 재사용된다(ko/en 양쪽 build/lint 통과).
