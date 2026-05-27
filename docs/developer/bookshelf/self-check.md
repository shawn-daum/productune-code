# Developer self-check — 3-item gate

Referenced by `docs/developer/habit.md` §2 (마무리 점검). Every `type:impl` / `type:refactor` ticket runs all three before declaring done. ≤30 lines.

## Items

1. **build** — project build green. Repo cmd (`pnpm build` / `pnpm -F <pkg> build` / repo-specific). Exit 0 required.
2. **type-check** — typecheck clean. `pnpm typecheck` / `tsc --noEmit`. Zero TS errors.
3. **lint** — lint clean. `pnpm lint` / repo lint cmd. Zero errors; warnings reported in `summary`.

## WHY

Catches drift before QA loop kicks in → reduces impl ↔ QA roundtrips. Surfaces config / type / dep drift introduced by impl that compiles locally but breaks CI.

## Failure handling

- One fail → fix in-loop (same session).
- Persistent fail → return `{blocked: true, reason: "self-check fail: <item>", details: <cmd output snippet>}`.
- Report all 3 outcomes in `summary` for PO mechanical lifecycle update.
