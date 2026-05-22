# Wiki backend branches — keeper (default) / fs

`tier:"wiki"` mechanical write — backend-aware (`WIKI_BACKEND` from `productune.env`).

**Default: wiki-keeper.**

## keeper *(default)*

Invoke `claude --agent pdt-wiki-keeper --model haiku` with `WRITE [PROMOTION-APPROVED]\npersona: $TARGET\nepisode_name: $EPISODE_NAME\nepisode_body: $EPISODE_BODY`. Sync — keeper handles file write + INDEX update. (keeper backend = non-MCP — subagent path remains valid here.)

## fs

Direct filesystem. Write `~/.productune/wiki/$TARGET/<ts>--<slug>.md` with frontmatter (`persona`, `episode_name`, `created_at`, `superseded_by:null`, `related:[]`) + body. Rebuild `<dir>/INDEX.md` (1 line per file with `[<date>] <name> [active|superseded]` + first-line excerpt). Echo `[PO] saved: <FILE>`.

## Pre-persona wiki search

Inject `wiki_consult:` into TASK:

```bash
[ "${WIKI_BACKEND:-keeper}" = "keeper" ] && WIKI_RESULT=$(NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
  "SEARCH
persona: $PERSONA_SHORT
query: $TASK_KEYWORDS" | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}') && TASK="$TASK
wiki_consult: $WIKI_RESULT"
```

(`fs` backend — personas read `~/.productune/wiki/persona-<x>/INDEX.md` directly.)
