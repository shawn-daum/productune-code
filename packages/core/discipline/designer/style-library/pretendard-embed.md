# Pretendard in one HTML file — glyph-subset base64 @font-face

A page opened from `file://` (review artifact · generated DS HTML · viewer) loads no sibling file, and the reader's machine may lack Pretendard. Embed the font inside the page as base64 `@font-face`, cut to the glyphs the page uses. The skeleton (`screen-set/skeleton.html`) declares the family only; this is the embed.

1. **Source**: npm `pretendard` — `node_modules/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2` · `Pretendard-SemiBold.woff2` (≈770 KB each). Never the variable font (`…/variable/woff2/PretendardVariable.woff2`, 2.0 MB — larger after the cut than both statics together).
2. **Glyph list**: the unique characters of the finished HTML minus its base64 blobs — tags, script JSON bodies included; every character that can render.
3. **Cut** (no install, ≈2 s per face):
   ```
   uvx --from 'fonttools[woff]' pyftsubset <source.woff2> \
     --text-file=<glyphs.txt> --flavor=woff2 --layout-features='*' \
     --output-file=<out.woff2>
   ```
4. **Embed**, one rule per face: `@font-face { font-family:'Pretendard'; font-weight:400; src:url(data:font/woff2;base64,…) format('woff2'); font-display:swap; }` — SemiBold: `font-weight:600 700`.
5. **Re-cut** when the page gains characters: 2–4 again; a glyph the cut lacks renders in the system font.

Expected size: ≈450 chars → ≈48 KB per face · ≈1,000 chars → ≈95 KB. A generator that emits the page runs the same steps itself, same input → same bytes.
