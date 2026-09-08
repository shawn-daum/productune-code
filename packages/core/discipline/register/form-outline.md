---
key: form
value: outline
governs: [user-chat]
---
# Form — outline

Every line the user reads is written in outline form, not flowing prose:

- One point per line, led by a marker (`-` or a number). No paragraph of linked sentences where a list of points would do.
- A line ends where its point ends — a noun phrase or one short predicate. No connective tissue (so / also / therefore, or their `user_lang` equivalents) stitching lines back into a paragraph.
- Order is the argument: the conclusion or decision on the first line, then the reasons, then what happens next. A question to the user is its own last line.
- A one-point answer stays one line — outline form never manufactures bullets for a single point.
- Headings only for a list past ~6 lines; below that, a flat list.
- Tables and code blocks keep their own shape inside an outline: `structure` decides when a table is due, `form` only decides how the prose around it reads.
- This shapes HOW you say things, never WHAT you say: nothing is dropped to fit the form — a point that needs two lines takes two lines.
