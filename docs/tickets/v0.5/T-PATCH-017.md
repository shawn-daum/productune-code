---
ticket_id: T-PATCH-017
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L2
qa: true
qa_status: pass
qa_loops: 1
risk_flags: css-transform-clipping, zoom-scale-overflow
slug: artifact-detail-zoom
---

# T-PATCH-017: Artifact detail — fix content clipping + reliable +/- zoom

> The artifact (산출물) detail view clips/cuts content. The user wants +/- zoom (font-size
> in/out) controls and the underlying clipping fixed.

## Request

In the artifact detail view, (a) provide +/- zoom (font-size step) controls, and (b) fix the
underlying clipping/overflow so long content is fully scrollable, not truncated.

### Investigation findings

The artifact detail view is `components/workspace/main/panes/ArtifactMdTab.tsx` (routed from
`ArtifactsPane.tsx:95` → `openTab(..., 'artifact-md', ...)` → `TabContent.tsx:49`). It is the
`.md` artifact viewer; `.mmd` goes to `ArtifactMermaidTab`, `.html` to `BrowserTab`.

`+/-` zoom controls already exist: `ArtifactMdTab` imports and renders `ZoomControls`
(ArtifactMdTab.tsx:12, 79-84) — a shared T-022 component (`ZoomControls.tsx`) using
lucide `ZoomIn`/`ZoomOut` icons plus a percent reset button. So the missing-controls part of
the request is largely already implemented; this ticket is primarily the **clipping fix**
plus verifying/hardening the zoom behavior.

**Root cause of clipping** — the zoom is implemented as a CSS `transform: scale(zoom)`:

```
// ArtifactMdTab.tsx:115-119
<div style={zoomOuter}>                         // overflow: visible, minHeight: 100%
  <div style={{ ...viewerWrap, transform: `scale(${zoom})`,
                transformOrigin: 'top left', width: `${100 / zoom}%` }}>
    <MdRenderer text={content} />
  </div>
</div>
```

`transform: scale()` does not change layout box size, so the scroll container
(`body`, ArtifactMdTab.tsx:192-195, `overflow: auto`) measures the **pre-scale** height. When
`zoom > 1`, the visually enlarged content overflows but the scroll area's scrollHeight is
computed from the unscaled box → the bottom of the content is unreachable / clipped. The
`width: 100/zoom%` compensation only addresses horizontal width, not height. `zoomOuter`
having `overflow: visible` + `minHeight: 100%` does not give the scroll parent the scaled
height either.

This is the core "content gets cut" bug: it is the zoom-scale interaction, and it also
manifests at default zoom for very long docs only if other overflow constraints exist — but
the clear, reproducible clip is at `zoom > 1`.

### Recommended fix

Replace `transform: scale()` zoom with **font-size–based zoom** (the request literally asks
for font-size in/out). Drive a CSS `font-size` (or a `--md-zoom` font-size multiplier) on the
viewer wrapper instead of `transform`. Font-size scaling reflows real layout, so the
scroll container measures the true content height and nothing is clipped. This also matches
the user's "font-size in/out" framing.

## Plan

1. **ArtifactMdTab.tsx** — change the zoom application (lines 114-120):
   - Remove `transform: scale(${zoom})` / `transformOrigin` / `width: 100/zoom%` from the
     inner wrapper.
   - Apply zoom as font-size, e.g. set `fontSize: \`${zoom}em\`` (or
     `${Math.round(zoom*16)}px`) on `viewerWrap` so `MdRenderer` text + headings (em-based)
     scale, and the box reflows naturally inside the `overflow: auto` `body`.
   - Verify `MdRenderer` (`components/workspace/chat/MdRenderer.tsx`) uses relative units so
     it inherits the font-size; if it hard-codes px, set a base font-size on its container
     instead. (Confirm during impl.)
   - Keep `viewerWrap` `maxWidth: 780` (line 241-245) but ensure it does not impose a fixed
     height; remove `zoomOuter`'s now-unnecessary `overflow: visible` if it interferes.
2. **Reuse existing `ZoomControls`** (already wired, ArtifactMdTab.tsx:79-84) — no new icon
   work; `ZoomIn`/`ZoomOut`/percent reset already present and lucide-based. Keep
   `ZOOM_STEP`/`MIN`/`MAX`/`DEFAULT` from `ZoomControls.tsx`.
3. Confirm the `body` scroll container (line 192) reaches the bottom of long content at
   100%, min, and max zoom after the change.
4. Apply the same font-size approach (or note divergence) consistently — but scope this
   ticket to the artifact detail (`ArtifactMdTab`). `ArtifactMermaidTab` / `ImageTab` zoom by
   scale legitimately (diagrams/images) and are out of scope unless they share the same
   clipping; do not change them here.

### Acceptance Criteria

- [AC-1] The artifact detail view exposes +/- (zoom in / zoom out) controls using
  lucide-react icons (`ZoomIn`/`ZoomOut`), with no color emoji. (Already present via
  `ZoomControls`; verify still rendered.)
- [AC-2] Increasing zoom enlarges the content text AND the full content remains scrollable to
  the very bottom — no clipping/cut-off at any zoom level (min, 100%, max).
- [AC-3] A long markdown artifact (content taller than the pane) scrolls fully at default
  zoom with no truncation.
- [AC-4] Reset returns to 100% / default font-size; percent indicator reflects current level.
- [AC-5] `pnpm tsc --noEmit` passes.

## Out of scope

- ArtifactMermaidTab and ImageTab zoom behavior (diagram/image scale is intentional).
- Persisting zoom level across tab close/reopen.
- Keyboard zoom shortcuts (Ctrl +/-).
- Markdown rendering/theming changes beyond what font-size scaling requires.
