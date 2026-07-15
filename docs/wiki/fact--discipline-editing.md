---
title: discipline 수정 룰 (discipline editing)
type: fact
status: live
version: v1.1
links: ["retro--v1.0"]
---
# Discipline editing — productune-internal only

This method is THIS project's privilege: we own the prdt product repo, so discipline changes happen in `packages/core/discipline/` (SoT) and ship via `prdt-install.sh`. Everywhere else — every other machine, user, project — runtime discipline (`~/.prdt`) is read-only; that boundary is a shipped contract. Never port this page into shipped discipline, agents, or any distributed surface. Origin: v1.0→v1.1 dogfood ([[retro--v1.0]]).

## Authoring rules
- **Act-time voice.** Write every line as an instruction to the actor at act time. Strip the 5 leak categories: ① maintenance meta (caps, style rules about the file) ② structure exposition (tier/layering explanations) ③ migration/history ("replaces old X", "legacy") ④ design justification ("why we split it") ⑤ just-in-case (fields/options never used in action).
- **SSoT-first.** Before writing a new line, LOCATE the existing clause governing the same behavior — in the target file or the file owning the concern — and merge INTO it (sharpen, extend, requalify). Append a new bullet ONLY when no clause covers the behavior; a new file only when no home exists.
- **Mode by file kind.** doctrine / contracts / habit = curated rewrite — reads as if written today: no source tags, dates, incident references. playbook = edit mode — edit-in-place or extend, `(YYYY-MM-DD) [T-NNN]` tag allowed on the changed clause.
- **Language.** Discipline body is English only. EXCEPTION: a negative-example LITERAL — the exact string the actor must suppress or match — stays verbatim in its emitted form; keep it to the minimal matched substring, surrounding prose goes English.
- **Caps** (doctor-enforced): doctrine.md ≤20 · contracts.md ≤80 · po habit ≤60 · worker habit ≤40 · playbook body ≤80 · menu ≤15. Over cap → curate down (merge clauses, cut leaks), never truncate meaning.

## Impact checklist — sweep on every discipline change; apply or mark n/a
- Agent pointers `packages/core/agents/prdt-*.md` — persona entry text still valid
- `prdt` CLI `init` / `migrate` — new file/layout/schema embodied in fresh scaffolds AND existing-project migration
- Playbook frontmatter changed → `prdt menus` (generated; never hand-edit)
- Distribution — installs pick changes up only via `prdt-install.sh` re-run; other machines/teammates affected → say so in the change's message or MIGRATION.md (the `~/.prdt` mirror is install-automatic)

## Verify + close
- Load-bearing or multi-clause change → dispatch QA `grill` on the diff (read-only critique against the rules above — findings only, QA never writes discipline); a single-clause edit = self-check. Author blind spots are structural — self-check alone missed SSoT-first and an act-time leak on the same day. (2026-07-03) [T-303]
- Run `prdt doctor` — discipline caps + menu drift clean before the change ships.

## 미러 동기화 (v1.1 추가)
- 원본은 `packages/core/discipline/` + `packages/core/agents/` — 세션 반영은 install.sh 재실행(~/.prdt·~/.claude/agents 미러 갱신) 필요. dev 기기에서 "고쳤는데 안 먹는" 증상 1순위 원인 (v1.1에서 2회 실사고, 자동 감지는 T-353 backlog).
- agent .md 동기화 주장 검증 시 영향 파일 **전부** installed 카운터파트와 diff (T-340: 4개 중 1개만 sync된 사례).
- hook 관련 동작 사실은 [[fact--claude-hooks]] 참조.
