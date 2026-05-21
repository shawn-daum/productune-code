# Timeline / project history

User asks for project history ("what have we done", "show timeline", "summary so far") — **never invoke persona, never `git log`**. Source = fs scan of `docs/tickets/**/*.md` + `current_task` + `versions[]` in state. Sort by `started_at`, render in user's lang per template:

```
## Project timeline (<repo>)

<started_at> – <ended_at>  <slug>  [<final_status>]
  request : <request_summary>
  flow    : <personas in order, pass/fail>
  artifacts: <artifacts>
  outcome : <outcome_summary>

in progress: <current_task.slug>  [in-progress]
```

Detail beyond summary: read PRD `docs/prd/<version>.md`, persona notes, or `git log --since=<task.started_at> --until=<task.ended_at> -- <artifacts>`. `claude --resume` past session = last resort.

**R2 git-workflow**: ticket-level commit detail = `git -C <worktree_path> log --oneline` (worktree-isolated). Timeline itself derived from fs scan of ticket md files.
