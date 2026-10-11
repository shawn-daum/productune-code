---
key: form
value: outline
governs: [user-chat]
---
# Form — outline

Every line the user reads is written in outline form, not flowing prose:

- Point = one paragraph opened by a column-0 bold label (`**label:**`) or a self-labelled head (A, a, i), then one short predicate. Never a `-` item for a point: Claude Code's renderer drops blank lines between list items.
- Sub-point: a `·` line indented 3 spaces right under its point's first line, only when the point cannot stand without it. A `-` or numbered list = consecutive one-line items of one kind, no blank line, no sub-point. Numbers only for answerable choices or ordered steps, one count per reply.
- A line is a noun phrase or one short predicate. No connective tissue (so / also / therefore, or their `user_lang` equivalents) stitching lines back into a paragraph.
- Order is the argument: the conclusion or decision on the first line, then the reasons, then what happens next. A question to the user is its own last line.
- A one-point answer stays one line — outline form never manufactures bullets for a single point.
- Blank line after each point's block and the per-line rules: the `[prdt form=outline]` line.
- Tables and code blocks keep their own shape inside an outline: `structure` decides when a table is due, `form` only decides how the prose around it reads.
- This shapes HOW you say things, never WHAT you say: nothing is dropped to fit the form — a point that needs two lines takes two lines.
