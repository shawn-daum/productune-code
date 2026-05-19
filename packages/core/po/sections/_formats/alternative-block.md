# Alternative-block format spec

Each option block — 3 fields, this order:

```
### Option <label> — <one-line headline>

**Pros**
- [<axis-anchor>] <pro 1>
- [<axis-anchor>] <pro 2>
- ...

**Cons**
- [<axis-anchor>] <con 1>
- [<axis-anchor>] <con 2>
- ...
```

Then single recommendation line (only when PO/Designer has preference):

```
**Recommended: <label>** — <reason, ending with anchor citation>.
```

## `<axis-anchor>` syntax

Citation MUST reference axis from `## User knowledge state (engineering)`. Two forms permitted:

1. `[<axis label>]` — short form. Example: `[Electron IPC]`, `[React lifecycle]`.
2. `[<axis label> · <level>]` — explicit level. Example: `[Electron IPC · solid (no-buffer-drop is gap)]`.

If pro/con references gap rather than strength, prefer form 2 with parenthetical to make gap visible.

If relevant axis doesn't exist yet in `## User knowledge state`, PO/Designer either:
- (preferred) appends new axis line first (per `po-memory.md` schema), then cites it, OR
- uses `[gap — new axis: <label>]` placeholder + surfaces "knowledge axis not yet logged" same turn so user can confirm.

## Recommendation line

If PO/Designer recommends option, recommendation line MUST end with anchor citation justifying why this user (with this knowledge state) benefits from this option.

Example (good):
> **Recommended: B** — listener-before-send is structurally guaranteed; the `[Race conditions · concept-level fluent]` reader will recognize the pattern, and `[Electron IPC · solid]` covers the no-buffer-drop semantics once called out.

Example (bad — vague + no anchor):
> **Recommended: B** — cleanest approach. (REJECTED: vague descriptor, no anchor citation.)
