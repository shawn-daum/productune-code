# Wiki backend branches — graphiti / keeper / fs

`tier:"wiki"` mechanical write — backend-aware (`WIKI_BACKEND` from `productune.env`).

## graphiti

PO mechanical via `claude --print` (no `--agent`) subprocess. Persona / subagent dispatch path retired (claude code 2.1.142 MCP non-inheritance + agent whitelist tool-name resolution structurally non-functional). Invocation template + preconditions + `source_description` auto-gen → `sections/_formats/wiki-write-template.md`. Run fire-and-forget in `( ... ) &`; job tracked under `~/.productune/wiki-jobs/<id>.{pending,done}`. Echo `[PO] saved (background, job=<id>)`.

## keeper

Invoke `claude --agent pdt-wiki-keeper --model haiku` with `WRITE [PROMOTION-APPROVED]\npersona: $TARGET\nepisode_name: $EPISODE_NAME\nepisode_body: $EPISODE_BODY`. Sync — keeper handles file write + INDEX update. (keeper backend = non-MCP — subagent path remains valid here.)

## fs

Direct filesystem. Write `~/.productune/wiki/$TARGET/<ts>--<slug>.md` with frontmatter (`persona`, `episode_name`, `created_at`, `superseded_by:null`, `related:[]`) + body. Rebuild `<dir>/INDEX.md` (1 line per file with `[<date>] <name> [active|superseded]` + first-line excerpt). Echo `[PO] saved: <FILE>`.

## Background job tracking (graphiti)

At start of every turn:

```bash
JOBS_DIR="$HOME/.productune/wiki-jobs"; [ -d "$JOBS_DIR" ] && rm -f "$JOBS_DIR"/*.done 2>/dev/null
for j in "$JOBS_DIR"/*.pending; do [ -f "$j" ] || continue
  AGE=$(( $(date +%s) - $(stat -f %m "$j" 2>/dev/null || stat -c %Y "$j" 2>/dev/null || echo $(date +%s)) ))
  [ "$AGE" -gt 30 ] && echo "[PO] job=$(basename "$j" .pending) ${AGE}s — check Ollama (cat $j.log)"
done
```

## Pre-persona wiki search (keeper only)

Inject `wiki_consult:` into TASK:

```bash
[ "${WIKI_BACKEND:-graphiti}" = "keeper" ] && WIKI_RESULT=$(NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
  "SEARCH
persona: $PERSONA_SHORT
query: $TASK_KEYWORDS" | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}') && TASK="$TASK
wiki_consult: $WIKI_RESULT"
```

(`graphiti` backend — pre-persona memory consult goes through PO subprocess `claude --print` calling `mcp__graphiti__search_memory_facts` / `search_memory_nodes` / `get_episodes`. Personas no longer call MCP wiki tools directly — see doctrine + `lifecycle-mechanics.md` §"Retrospective read sources". `fs` personas read `INDEX.md` directly.)
