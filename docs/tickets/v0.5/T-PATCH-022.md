---
ticket_id: T-PATCH-022
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: L
risk_flags: [filesystem-write, doctrine-write]
qa: true
qa_status: pass
qa_loops: 1
slug: doctrine-save-flow
depends_on: [T-PATCH-020]
---

# T-PATCH-022 — Doctrine save-choice flow (direct write | PO review) + safety

## Request

Implement the save behavior for T1 / T2 doctrine edits in the `doctrine-file`
tab (T-PATCH-020 exposes an injectable `onSave` seam). This implements the
**SAVE decision (user-firm): the user chooses per-save.** Every save of an
editable (T1/T2) doctrine file opens a **save-choice dialog** with two paths:

1. **Save directly** — whitelisted direct write via `doctrine:writeFile`
   (T-PATCH-019). Whole-file replace.
2. **Request PO review** — route the edit into the PO's existing
   pending-promotion / approval flow instead of writing immediately. The PO
   approves it later through the existing promotion UI.

Both paths must exist; the user picks each time. Plus the safety layer:
dirty-close guard, on-disk conflict detection at save time, ko/en i18n, and
saved/error toasts.

### Investigation result — how the PO review path hooks in

The PO promotion mechanism is **already fully wired** end to end; "Request PO
review" reuses it, no new core/IPC needed for the happy path:

- **State model** — `packages/core/dist/state/pending-promotions.js` /
  `.d.ts`. `po-state.json :: pending_promotions[]`, each entry
  `PendingPromotion { id, persona, turn_id, scope?, kind?, target, delta,
  rationale, status, surfaced_at?, decided_at?, final_target? }`.
  `scope ∈ {project, global}`, `kind ∈ {habit, bookshelf}`,
  `status ∈ {pending, approved, dropped, edited}`.
- **Enqueue IPC (exists)** — `state:appendPendingPromotion`
  (`packages/gui/electron/ipc/state.ts:66`) → core `appendPendingPromotion`.
  Preload binding `appendPendingPromotion(projectDir, candidate)`
  (`packages/gui/electron/preload.ts:105`), where
  `candidate = Omit<PendingPromotion, 'id' | 'status'>`. **This is the hook** —
  "Request PO review" calls `api.appendPendingPromotion(projectDir, {...})`.
- **Surfacing UI (exists)** — `PendingPromotionDrain.tsx` lists pending entries
  and offers Save / Edit / Skip; on Save it calls `resolvePendingPromotion`
  then `mechanicalWrite`. `PromotionCard.tsx` is the inline-chat variant.
- **Write on approval (exists)** — `electron/mechanical-write.ts`
  `mechanicalWrite` resolves `scope`/`kind` and **appends** `delta` (or
  `final_target` for edited) to the target path.

### Sub-tasks needed (gaps found during investigation)

The PO path works, but two semantic gaps must be handled in this ticket:

- **GAP-1 (append vs replace mismatch).** `mechanicalWrite` **appends** `delta`
  to the target file. A doctrine *edit* is a whole-file replace, not an append.
  If we enqueue the full edited document as `delta`, PO approval would append the
  whole file again, duplicating content. **Resolution for v1:** the PO-review
  path must enqueue a **patch-style summary as `delta`** (a human-readable diff /
  change note, not the full file), so PO approval appends a curated note — which
  matches the existing promotion semantics (curation + append). The candidate's
  `rationale` carries "GUI doctrine edit, full-file replacement requested". This
  is a **required sub-task**: the GUI must NOT enqueue the full file as `delta`
  expecting a replace. If a true replace-on-approval is desired instead, that
  needs a new `mechanicalWrite` mode / IPC — flagged below, deferred.
- **GAP-2 (no replace-mode mechanical write).** There is no IPC today that
  applies an approved promotion as a **whole-file replace**. Out of scope for
  v1; the direct path covers whole-file replace, the PO path covers append/curate.
  Noted so QA does not expect PO-approval to overwrite the file.

## Acceptance criteria

- [AC-1] Saving an editable (T1/T2) doctrine file opens a **save-choice dialog**
  with exactly two primary actions — `t('workspace.doctrine.save.direct')`
  ("바로 저장") and `t('workspace.doctrine.save.requestReview')`
  ("PO 검토 요청") — plus Cancel. Dialog follows the existing modal footer order
  `[Cancel] [secondary] [primary]` and dark-theme styling used by
  `BaseDirtyModal.tsx` / `ConflictResolveModal.tsx`.
- [AC-2] **Direct path:** on "바로 저장", performs a conflict check (AC-5) then
  calls `api.doctrineWriteFile(path, content)` (T-PATCH-019, whole-file replace).
  On success → saved toast (AC-7), tab editor state marked clean. On IPC error
  → error toast, editor stays dirty.
- [AC-3] **PO-review path:** on "PO 검토 요청", calls
  `api.appendPendingPromotion(projectDir, candidate)` with
  `candidate = { persona: <personaKey→canonical>, turn_id: <generated>,
  scope: (T1 ? 'project' : 'global'), kind: (basename==='habit.md' ? 'habit' :
  'bookshelf'), target: <absolute file path>, delta: <change summary, NOT full
  file — see GAP-1>, rationale: 'GUI doctrine edit (T1/T2) requested via review' }`.
  On success → a distinct "검토 요청됨" toast and the editor is marked clean
  (the live file is unchanged; the request is queued for PO).
- [AC-4] **Dirty-close guard:** closing the tab / switching away while the
  editor is dirty prompts an unsaved-changes confirmation (reuse the
  `BaseDirtyModal.tsx` **visual pattern** — overlay, modal, `[Cancel]
  [secondary] [primary]`, Esc/backdrop = Cancel, busy-disables-Esc). Note:
  `BaseDirtyModal` is git-worktree-specific (props ticketId/slug/type, IPC
  `worktree.*`); it is a **pattern reference**, not a drop-in. Implement a small
  generic dirty-confirm variant (or generalize `BaseDirtyModal`) with actions
  `[취소] [버리고 닫기] [저장]`; "저장" reopens the save-choice dialog (AC-1).
- [AC-5] **Conflict detection at save:** at Edit-open, capture the file's
  mtime/hash from T-PATCH-019 (`doctrine:readFile` returns content + mtime/hash).
  At save time, re-stat; if mtime/hash differs from the captured snapshot (an
  agent promotion may have appended in between), open `ConflictResolveModal.tsx`
  instead of writing. Map its actions: primary "수정 후 다시 시도" = reload
  on-disk content into editor (user re-applies edits), secondary
  "다른 작업으로 전환" / Esc / backdrop = abort save (keep editor dirty). Reuse
  the modal as-is; pass the doctrine file path as `conflictPaths`.
- [AC-6] Conflict modal applies to **both** save paths (direct and PO-review):
  the stale-snapshot check runs before either IPC call.
- [AC-7] **Toasts:** success (saved / review-requested) and error toasts use the
  existing toast pattern from `PendingPromotionDrain.tsx` (auto-dismiss ~4s,
  manual close ✕, green `#34D399` ok / red `#E04040` error). Keys under
  `workspace.doctrine.*`.
- [AC-8] **i18n ko/en parity:** all new strings
  (`workspace.doctrine.save.{title,body,direct,requestReview,cancel}`,
  `workspace.doctrine.{savedToast,reviewRequestedToast,writeError,
  dirtyTitle,dirtyBody,dirtyDiscard,dirtySave,dirtyCancel}`) added to **both**
  `ko.json` and `en.json`. ko is the user-facing default. Reuse existing
  `workspace.deploy.conflict.*` keys for the conflict modal (already ko/en).
- [AC-9] All new dialogs/toasts use lucide icons only, no color emoji.
- [AC-10] `pnpm tsc --noEmit` passes.
- [AC-11] `pnpm lint` passes.

## Plan (re-read current files before editing)

- **Save seam:** T-PATCH-020 exposes the `doctrine-file` pane with an injectable
  `onSave(content)` seam. Wire the save-choice dialog as the `onSave` handler.
  Re-read the T-PATCH-020 pane to confirm the exact seam name/signature; adapt
  if it differs and note it.
- **Save-choice dialog (new component):** model on
  `packages/gui/src/components/workspace/BaseDirtyModal.tsx` (overlay/modal
  styles lines 170–263, Esc handling lines 48–54, footer order). Two action
  buttons + Cancel.
- **Direct write:** `api.doctrineWriteFile(path, content)` (T-PATCH-019; atomic
  tmp+rename owned by IPC). Mirrors preload camelCase binding convention in
  `packages/gui/electron/preload.ts`.
- **PO-review enqueue:** `api.appendPendingPromotion` —
  `packages/gui/electron/preload.ts:105`; IPC handler
  `packages/gui/electron/ipc/state.ts:66`; core
  `packages/core/dist/state/pending-promotions.js:48`. Candidate shape =
  `Omit<PendingPromotion, 'id'|'status'>` from
  `packages/core/dist/state/pending-promotions.d.ts:6`. `projectDir` from
  `useWorkspace((s) => s.project)` (see usage in `PromotionCard.tsx:53`).
  persona key mapping: navigator passes `'po'|'designer'|'dev'|'qa'`; map `dev`
  → canonical persona string consistent with how existing candidates set
  `persona` (verify against `tierLabel`/`resolveScopeKind` expectations in
  `PendingPromotionDrain.tsx:18` and `mechanical-write.ts:22`).
- **Conflict modal:** `packages/gui/src/components/workspace/ConflictResolveModal.tsx`
  — reuse as-is, `onResolve('manual')` = reload, `onCancel` = abort. mtime/hash
  comes from T-PATCH-019 `doctrine:readFile`.
- **Dirty-close guard:** reuse `BaseDirtyModal.tsx` styles; build generic variant
  (the existing one is worktree-bound). Tie into the tab-close path in the
  workspace store / tab dispatcher (re-read `packages/gui/src/store/workspace.ts`
  `closeTab`/`openTab` and the tab content dispatcher to find the close hook).
- **Toasts:** copy the toast pattern from
  `packages/gui/src/components/workspace/PendingPromotionDrain.tsx:61-70,236-247,
  446-473`.
- **i18n:** `packages/gui/src/locales/ko.json` + `en.json`, under
  `workspace.doctrine.*`; promotion keys already at ko/en.json:191–201.

## Out of scope

- The `doctrine-file` tab/pane, edit/preview toggle, textarea, line-cap badge —
  owned by T-PATCH-020.
- The TeamPanel navigator / file-open routing — owned by T-PATCH-021.
- `doctrine:listTiers/readFile/writeFile` IPC + path whitelist + atomic write +
  mtime/hash production — owned by T-PATCH-019 (this ticket consumes them).
- **Replace-on-approval mechanical write** (GAP-2): a new `mechanicalWrite`
  mode/IPC that overwrites instead of appends. Deferred — v1 PO-review path
  enqueues a curated change-summary `delta` (append semantics preserved).
- T0 save (read-only, never editable). Common Tier-0. T2 non-doctrine state files.
