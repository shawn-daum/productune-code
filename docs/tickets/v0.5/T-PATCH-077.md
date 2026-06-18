---
ticket_id: T-PATCH-077
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-09T00:00:00Z
estimated_complexity: L2
risk_flags: [auth]
slug: claude-code-connection-status-settings
qa_status: pass
requires_qa: true
requires_user_gate: false
area_tag: gui-settings
---

# T-PATCH-077: Claude Code connection status in Settings

## Request

shawn (Plan A ad-hoc): in the Settings view, show whether the Claude Code CLI is connected/authenticated. If not connected, surface a connect affordance + instructions so the user can connect. Reuse the existing onboarding auth-status check — do not write a new auth probe.

## Acceptance

- AC-1 (placement): Given Settings → General pane is open, Then a "Claude Code connection" section renders within `GeneralSettings` (e.g. below the existing User-mode section, above the immediate-note), using the existing settings section/card visual language.
- AC-2 (three states): The status indicator reflects exactly one of: `checking` (probe in flight), `connected` (CLI installed AND authenticated), `not-connected` (CLI missing OR not authenticated). Use a lucide status icon + label per project icon doctrine (no color emoji): `Loader2` (checking), `CheckCircle2` (connected), `XCircle`/`ShieldAlert` (not-connected).
- AC-3 (reuse existing check): Given the section mounts, When it probes status, Then it calls the existing `window.api.checkClaude()` (IPC `onboarding:checkClaude` → `{ installed, authed }`). `connected` ⇔ `installed && authed`. No new auth IPC is added.
- AC-4 (not-installed vs not-authed messaging): Given `installed === false`, Then the not-connected copy instructs the user to install the Claude Code CLI. Given `installed === true && authed === false`, Then the copy instructs the user to authenticate and shows the connect affordance.
- AC-5 (connect affordance): Given `not-connected` due to missing auth, When the user clicks "Connect", Then `window.api.claudeLogin()` (IPC `onboarding:claudeLogin`) runs and opens a Terminal at `claude auth login` (existing behavior). A short helper line explains a terminal window will open.
- AC-6 (re-check): Given the user returns after connecting, When they click "Re-check" (or the section re-mounts / window regains focus), Then status is re-probed and updates to `connected` without an app restart.
- AC-7 (no blocking): Given the probe errors or times out, Then the section shows `not-connected` with a re-check action and does not throw or block the rest of GeneralSettings.

## Out of scope

- Codex connection status (a `checkCodex`/`codexLogin` pair already exists; mirroring it can be a follow-up, not this ticket).
- Embedding a login flow inside the app — connect continues to delegate to the Terminal via the existing `claudeLogin` handler.
- Engine-env editing (`~/.productune/productune.env`, `MY_PO_ENGINE`) — referenced only as context; not modified here.
- A new Settings sub-tab — this lives inside the existing General pane.

## Plan

**No new IPC required** — reuse existing `electron/ipc/onboarding.ts` handlers already exposed on `window.api` via `preload.ts`:
- `checkClaude()` → `{ installed: boolean; authed: boolean }` (`onboarding:checkClaude`).
- `claudeLogin()` → `{ ok: boolean; error?: string }` (`onboarding:claudeLogin`) — opens Terminal at `claude auth login`.

**Renderer — `packages/gui/src/components/workspace/GeneralSettings.tsx`:**
- Add a `ClaudeConnection` section (inline subcomponent or co-located) rendered after the User-mode block.
- State: `status: 'checking' | 'connected' | 'not-connected'` and `installed: boolean`. On mount, set `checking`, call `await window.api.checkClaude()`, then derive status. Guard the `(window as any).api` call in try/catch (browser dev mode has no IPC) → fall back to `not-connected`.
- Status row: lucide icon + `t(...)` label per state. Reuse `sectionTitle` / `description` / `optionCard` style tokens already in `GeneralSettings.tsx`.
- When `not-connected`: render instructions (install vs authenticate, per `installed`) + a "Connect" button → `await window.api.claudeLogin()`, and a "Re-check" button → re-run the probe. Optionally re-probe on `window` `focus` event (cleanup listener on unmount).
- i18n: add `settings.claudeConnection.*` keys (title, statusChecking, statusConnected, statusNotConnected, installHint, authHint, connectBtn, recheckBtn, terminalNote) in KO + EN.

### QA scope

| Area | Check |
|:--|:--|
| auth | connected shown only when `installed && authed`; not-authed and not-installed produce distinct copy |
| reuse | uses existing `checkClaude`/`claudeLogin`; no new auth IPC introduced |
| flow | Connect opens Terminal at `claude auth login`; Re-check updates state without restart |
| resilience | IPC missing/timeout → `not-connected`, no throw, rest of GeneralSettings intact |

## Outcome

null

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
