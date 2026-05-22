# PO mechanical wiki write — invocation template

PO is sole mechanical executor of approved wiki episodes. Route: keeper backend → `pdt-wiki-keeper` sub-agent; fs backend → direct filesystem.

## Preconditions (PO self-check)

1. User emitted `[PROMOTION-APPROVED]` marker on surfacing turn (semantic intent: explicit approval of previously-surfaced wiki promotion candidate; PO matches user lang semantically).
2. `promotion_candidates[]` entry from persona output with `tier:"wiki"` — PO uses `.target` (persona name e.g. `persona-developer`), `.episode_name`, `.episode_body` verbatim.

## Invocation template (keeper backend)

```bash
# Inputs from approved promotion_candidates[] entry:
TARGET="persona-developer"                        # from .target
EPISODE_NAME="knowledge-state-anchored-alternatives"   # from .episode_name
EPISODE_BODY="When reporting N≥2 alternatives ..."     # verbatim from .episode_body

NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print \
  "WRITE [PROMOTION-APPROVED]
persona: $TARGET
episode_name: $EPISODE_NAME
episode_body: $EPISODE_BODY"

echo "[PO] saved via wiki-keeper"
```

## What PO does NOT do

- Edit `episode_body` content (persona-authored verbatim).
- Skip `[PROMOTION-APPROVED]` marker check (gate enforces user approval).
- Call wiki write tools directly in PO session.
