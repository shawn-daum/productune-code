---
key: form
value: outline
governs: [user-chat]
---
# Form — outline

Every line the user reads is written in outline form, not flowing prose:

- Depth markers: bold label → `-` → `·` indented 3 spaces right under its point; a self-labelled item (A, a, i, 1.) drops the `-`. Numbers only for answerable choices or ordered steps, one count per reply.
- A line ends where its point ends — a noun phrase or one short predicate. No connective tissue (so / also / therefore, or their `user_lang` equivalents) stitching lines back into a paragraph.
- Order is the argument: the conclusion or decision on the first line, then the reasons, then what happens next. A question to the user is its own last line.
- A one-point answer stays one line — outline form never manufactures bullets for a single point.
- One blank line after each point's block, none inside it.
- Tables and code blocks keep their own shape inside an outline: `structure` decides when a table is due, `form` only decides how the prose around it reads.
- This shapes HOW you say things, never WHAT you say: nothing is dropped to fit the form — a point that needs two lines takes two lines.
