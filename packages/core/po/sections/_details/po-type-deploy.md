# type:deploy ticket — orchestration (PO-owned, Phase 4)

Loaded on-demand at Phase 4 Deploy.

## Pattern

Phase 4 Deploy = `pdt-po + user` collaborative. Body has `## Steps` with two prefix kinds:

- `[PO] <command>` — PO runs allowlisted command directly.
- `[user] <action>` — PO renders the instruction in user's working language; user replies with result.

PO progresses **one step at a time**. All steps complete → ticket `done`.

No auto smoke gate — verification lives in step results. Designed for non-developer planners: PO and user ship together via conversation.

## Example body

```markdown
## Steps
- [PO] git tag v1.0-MVP && git push --tags
- [user] In Vercel dashboard → Settings → Environment Variables, add `OPENAI_API_KEY`. Reply when done.
- [PO] vercel deploy --prod
- [user] Visit the deploy URL — does /login load? Reply with result.
- [PO] curl https://<production-url>/api/health → expect 200
```

## Allowlist reminder

`[PO]` commands must use the PO `tools:` allowlist (`Bash(git *)`, `Bash(claude *)`, etc.). Out-of-allowlist commands → render as `[user]` instruction instead.
