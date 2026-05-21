# PO quick command reference

Loaded on-demand for command lookup. Doctrine: `~/.productune/po-instructions.md`.

## Step 1 — session bootstrap

```bash
cat ~/.productune/po-memory.md ./.productune/po-state.json
```

## Step 2B — PRD delegation to Designer

Per `~/.productune/sections/delegation.md` "PRD delegation":

```bash
NO_COLOR=1 claude --agent pdt-designer --model opus --print --output-format json "$TASK"
```

## Step 2C — ticket delegation to Developer / QA

First call (omit `--session-id`):

```bash
NO_COLOR=1 claude --agent pdt-developer --model "$MODEL" --print --output-format json "$TASK"
NO_COLOR=1 claude --agent pdt-qa        --model "$MODEL" --print --output-format json "$TASK"
```

Resume (subsequent turns):

```bash
NO_COLOR=1 claude --resume "$SID"       --model "$MODEL" --print --output-format json "$TASK"
```

## Step 3 — archive + calibrate

`jq` + `printf` only — no `python`. Update `po-state.json` and append calibration log to `~/.productune/po-memory.md` per `~/.productune/sections/calibration.md`.

## Reminder

- First persona call omits `--session-id`; hook R4 captures the new SID.
- Subsequent calls → `--resume "$SID"`.
- UUIDs strict 8-4-4-4-12 hex — never self-generate.
