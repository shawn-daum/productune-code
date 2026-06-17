---
ticket_id: T-PATCH-182
version: v0.5
slug: md-viewer-h4-recipe-and-list-breathing
title: MD 뷰어 density 해소 — H4 recipe 신설 + 리스트 호흡(노션식 후속)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: shared-primitive
estimated_complexity: L1
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 5
---

## Problem
T-180 reflow가 PRD feature를 `####`(H4) chunk로 나눴으나 `MdRenderer.tsx`는 h1~h3만 매핑 → H4가 className 없는 맨 `<h4>`로 렌더돼 위 콘텐츠에 붙고 리듬 깨짐(스크린샷 "1./2./3." 제목 빽빽). + `.md-doc` 리스트 item gap이 `--space-1`(4px)로 빡빡.

## Fix
1. `MdRenderer.tsx` heading map에 `h4` 추가 → `<h4 className="md-h4">{children}</h4>` (h1~h3와 동일 패턴, 추가 매핑일 뿐 로직 변경 아님).
2. `md-recipes.css`:
   - base `.md-h4` recipe 신설 — font-size ~13, weight 600, color `--text-emphasis`, **compact margin**(chat 안전용).
   - `.md-doc .md-h4` — 노션식: margin-top 넉넉(`--space-4`=16px 권장, H3 16과 동급/약간 작게), margin-bottom tight(`--space-1`=4px).
   - 리스트 호흡: `.md-doc .md-ul`/`.md-doc .md-ol` item gap `--space-1`→`--space-2`(4→8px). 필요 시 li margin 미세 조정.

## CRITICAL — shared-primitive
`md-recipes.css` + `MdRenderer`는 chat 버블 공유. base `.md-h4`는 compact로(chat에서 h4 드물지만 안전), Notion 리듬·리스트 gap 증가는 **`.md-doc` 스코프로만** → chat 회귀 0.

## AC
- PRD H4 feature 제목(`#### 1. …`)이 위 여백 확보돼 섹션 구분 명확
- `.md-doc` 리스트 항목 간 간격이 덜 빽빽 (gap 8px)
- chat 버블 렌더 회귀 0 (h4/리스트 gap 변화가 chat 안 건드림)
- 신규 hex 0(토큰만), GUI tsc 통과

## Scope guard
`MdRenderer.tsx`(h4 매핑 1줄) + `md-recipes.css`만. h5/h6는 범위 밖(필요 시 fall-through 허용).
