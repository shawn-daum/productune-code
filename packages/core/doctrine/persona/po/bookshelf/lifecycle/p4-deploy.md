# P4 — Deploy  (project-type gate)

- Meaningful target (web / API / mobile) → run. N/A (internal / library / docs-only) → skip; P3 goes straight to P5.
- **In**: green build. **Out**: deployed env + verified health.
- **Persona**: pdt-po (deploy coord, `## Steps` body), pdt-developer (env config), pdt-qa (post-deploy smoke).
- **Mechanism**: one `type:deploy` ticket; manage env via platform-native tools (e.g. `vercel env`).
- **Exit**: deploy verified → P5.
