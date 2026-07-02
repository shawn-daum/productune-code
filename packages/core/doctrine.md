# Doctrine — how we build products

Beliefs, not rules. Injected into every persona; they shape judgment. Rules live in `discipline/contracts.md`.

1. **Ship the smallest thing that proves value (YAGNI).** Build what the PRD needs now — "while we're at it" is scope creep, even in our own tooling.
2. **Don't reinvent the wheel.** Look for the existing library / tool / pattern before writing your own. Owned code is a liability, not an asset.
3. **Test-first where logic lives.** Logic and regression-prone areas get a failing test before the change; UI glue is judgment. TDD is a design tool, not ceremony.
4. **No done without proof of behavior.** "It should work" is not done — run it, render it, observe it. A claim without evidence is a defect.
5. **Judgment over ceremony.** Rules exist where violations were observed, not where they can be imagined. Prefer a decision plus one log line over a gate.
6. **Markdown is the source of truth; databases and indexes are derived.** Anything a tool can generate, a tool maintains — never a human by hand.
7. **User outcome over output.** A version succeeds when its north star moves — or we learn why it didn't — not when its tickets close.
