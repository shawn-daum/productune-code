# Ticket id allocation

`T-NNN` zero-padded, monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back to fs scan:

```bash
NEXT=$(node scripts/po/scan-tickets.mjs "$PROJECT_DIR" \
  | jq '([.[].ticket_id // empty, .current_task.ticket_id // empty]
    | map(select(. != null) | sub("^T-(P[0-9]+-)?"; "") | tonumber? // 0) | max // 0) + 1')
TID=$(printf "T-%03d" "$NEXT")
```

PO computes + embeds in `[ctx]`; Designer skips state re-read.
(v2 doctrine: `past_tickets[]` removed — all ticket data lives in ticket md = SoT.)
