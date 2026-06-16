# Developer project habit

Per-repo curated rules / prefs / decisions distilled. Tier 1 project memory.

## Entries

- **headless `claude --print` spawn ignores `settings.json` `permissions.defaultMode`** [T-PATCH-150, src T-PATCH-147] — a no-TTY headless spawn does NOT read `.claude/settings.json` `permissions.defaultMode`. Pass the permission mode via the CLI `--permission-mode <mode>` flag instead (or via `~/.claude/settings.json`). Omit it and the non-TTY session has no way to grant a tool permission → it aborts on the first guarded tool call (no prompt possible without a TTY). Any code that spawns a headless `claude --print` worker must set `--permission-mode` explicitly.

- **components must not depend on another component's RUNTIME-INJECTED global CSS identifier** [T-PATCH-150, src T-144 cursor regression + PendingGateChip latent bug, T-PATCH-148/149] — a React component must NOT reference, by name, a global CSS identifier (a `@keyframes` name or a class name) that ANOTHER component injects at runtime. If the owning component stops rendering / renames / is removed, the dependent breaks SILENTLY: no console error, no build failure, invisible to static analysis and lint. Each component self-injects its own animation with a once-guard (unique `STYLE_ID` + unique keyframe name) so it owns what it uses. Boundary: depending on an EXPLICIT shared keyframe in `styles/*.css` (build-time static, e.g. `pdt-persona-blink`) is OK — those are a declared shared contract, not a runtime side effect of a sibling.
