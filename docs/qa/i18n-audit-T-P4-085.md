# i18n Audit — T-P4-085: User-mode Tone Vocab Full Audit

**Ticket**: T-P4-085  
**Date**: 2026-05-14  
**Auditor**: pdt-developer (r4-fix, audit-only)  
**Sources**: `packages/gui/src/locales/en.json`, `packages/gui/src/locales/ko.json`  
**Baseline ref**: T-P4-084 §7.1 / §7.2 (11 promised keys); T-P4-057 linter v2

---

## Executive Summary

- **Total locale keys scanned**: ~340 (en.json × ko.json; duplicate key groups noted below)
- **Mode-sensitive candidates identified**: 37 keys (sensitive) + 21 keys (review)
- **Suffix-covered** (`.dev` or `.planner` sub-key present): **2 key groups** (4 leaf keys)
- **Coverage rate**: ≈ 5% (2 / 37 sensitive have mode variants)
- **Critical violations** (`sensitive` + `missing` + `critical` severity): **13 items across 5 area_tags**
- **Top 5 follow-up candidates**: `settings/mcp`, `settings/hooks`, `locale/structural-bugs`, `workspace/schema-error`, `settings/workflow-rules`
- **T-P4-057 linter gap**: current linter does NOT check mode-coverage. Extension spec in §3.

> **Key structural finding**: en.json + ko.json both contain **duplicate top-level object keys**
> (`workspace.browser` x2, `workspace.artifacts` x2). In a strict JSON parser, the second
> definition silently overwrites the first, causing `navPlaceholder`, `openExternal`, and
> `autoOpenToast` to be inaccessible. This is a pre-existing structural bug, logged as
> `area_tag: locale/structural-bugs`, severity: critical.

> **T-P4-084 §7.2 gap**: Settings section-title mode variants (tabMcp, tabHooks, mcp.title,
> hooks.title, workflowRules.sectionTitle) are NOT present in the locale files as `.dev`
> sub-keys. Either the mode-awareness was deferred or handled at the component level with
> different key names. These are marked `suffix_status: missing` and `severity: critical`
> to trigger resolution.

---

## §1 Audit Matrix

Legend:
- `mode_sensitivity`: `sensitive` | `invariant` | `review`
- `suffix_status`: `covered` (.dev or .planner sub-key present) | `missing` (sensitive, no variant) | `n/a` (invariant)
- `severity`: `critical` | `medium` | `low` | `n/a`
- `action`: `emit-follow-up` | `spec-extend` | `none`

### 1.1 common.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| common.next | all CTAs | invariant | n/a | n/a | none |
| common.prev | all CTAs | invariant | n/a | n/a | none |
| common.skip | wizard / modals | invariant | n/a | n/a | none |
| common.retry | error recovery | invariant | n/a | n/a | none |
| common.cancel | modals | invariant | n/a | n/a | none |
| common.save | settings / forms | invariant | n/a | n/a | none |
| common.loading | async states | invariant | n/a | n/a | none |
| common.detecting | hardware detection | invariant | n/a | n/a | none |
| common.download | install guides | invariant | n/a | n/a | none |

### 1.2 onboarding.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| onboarding.title | wizard header | invariant | n/a | n/a | none |
| onboarding.step0.* (6 keys) | language selection | invariant | n/a | n/a | none |
| onboarding.step1.label | AI engine label | invariant | n/a | n/a | none |
| onboarding.step1.intro | engine intro | review | missing | low | none |
| onboarding.step1.optionRecommended | option badge | invariant | n/a | n/a | none |
| onboarding.step2.label | engine connection label | invariant | n/a | n/a | none |
| onboarding.step2.intro | intro text | review | missing | low | none |
| onboarding.step2.checking | status text | invariant | n/a | n/a | none |
| onboarding.step2.statusChecking | engine status badge | invariant | n/a | n/a | none |
| onboarding.step2.statusReady | "installed · authed" | **sensitive** | missing | medium | spec-extend |
| onboarding.step2.statusInstalledNoAuth | "installed · not authed" | **sensitive** | missing | medium | spec-extend |
| onboarding.step2.statusNotInstalled | "not installed" | **sensitive** | missing | medium | spec-extend |
| onboarding.step2.installGuide | link label | invariant | n/a | n/a | none |
| onboarding.step2.loginTerminal | "Login in terminal" | **sensitive** | missing | medium | spec-extend |
| onboarding.step2.recheck | action button | invariant | n/a | n/a | none |
| onboarding.step3.label | memory backend label | invariant | n/a | n/a | none |
| onboarding.step3.intro | intro text | review | missing | low | none |
| onboarding.step3.detectingHw | hardware detection | invariant | n/a | n/a | none |
| onboarding.step3.optionRecommended | option badge | invariant | n/a | n/a | none |
| onboarding.step3.dockerNotDetected | "Docker Desktop not detected" | **sensitive** | missing | medium | spec-extend |
| onboarding.step3.brewInstall | "Auto-install via Homebrew" | **sensitive** | missing | medium | spec-extend |
| onboarding.step3.installing | install progress | review | missing | low | none |
| onboarding.step3.openDocker | "Open Docker Desktop" | **sensitive** | missing | medium | spec-extend |
| onboarding.step3.redetect | action button | invariant | n/a | n/a | none |
| onboarding.step4.* (5 keys) | completion states | invariant | n/a | n/a | none |
| onboarding.engines.claude.label | engine card | invariant | n/a | n/a | none |
| onboarding.engines.claude.intro | "Run PO on Anthropic Claude — most stable" | review | missing | low | none |
| onboarding.engines.claude.tech | "claude-code CLI · full hooks/skills support" | **sensitive** | missing | medium | spec-extend |
| onboarding.engines.codex.label | engine card | invariant | n/a | n/a | none |
| onboarding.engines.codex.intro | "Run PO on OpenAI Codex (experimental)" | review | missing | low | none |
| onboarding.engines.codex.tech | "codex CLI · doctrine only (hooks not supported)" | **sensitive** | missing | medium | spec-extend |
| onboarding.engines.both.label | engine card | invariant | n/a | n/a | none |
| onboarding.engines.both.intro | review | review | missing | low | none |
| onboarding.engines.both.tech | "primary=claude-code, secondary=codex" | **sensitive** | missing | medium | spec-extend |
| onboarding.wiki.graphiti.label | wiki option | invariant | n/a | n/a | none |
| onboarding.wiki.graphiti.intro | "Graph DB-based long-term memory" | **sensitive** | missing | medium | spec-extend |
| onboarding.wiki.graphiti.tech | "Requires Docker + local LLM (Tier S/A recommended)" | **sensitive** | missing | medium | spec-extend |
| onboarding.wiki.filesystem.label | wiki option | invariant | n/a | n/a | none |
| onboarding.wiki.filesystem.intro | "Claude manages memory via markdown files" | review | missing | low | none |
| onboarding.wiki.filesystem.tech | "No library dependency · uses Claude API tokens" | **sensitive** | missing | medium | spec-extend |
| onboarding.completionSteps.env | "Create env file (~/.productune/productune.env)" | **sensitive** | missing | medium | spec-extend |
| onboarding.completionSteps.agents | "Register PO agent (agents/ → ~/.claude/agents/ symlink)" | **sensitive** | missing | medium | spec-extend |
| onboarding.completionSteps.instructions | "Apply PO instructions (po-instructions.md)" | review | missing | low | none |
| onboarding.completionSteps.memory | "Initialize PO memory (po-memory.md)" | review | missing | low | none |
| onboarding.completionSteps.playwright | "Prepare Playwright MCP cache (QA smoke gate, npx @playwright/mcp)" | **sensitive** | missing | medium | spec-extend |
| onboarding.versionInit.* (3 keys) | version init step | review | missing | low | none |

### 1.3 workspace.versions.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| versions.current | sidebar badge | invariant | n/a | n/a | none |
| versions.past | sidebar header | invariant | n/a | n/a | none |
| versions.noActive | empty state | invariant | n/a | n/a | none |
| versions.noPast | empty state | invariant | n/a | n/a | none |
| versions.ticketsDone | ticket count | invariant | n/a | n/a | none |
| versions.closed | date label | invariant | n/a | n/a | none |
| versions.tickets | ticket count | invariant | n/a | n/a | none |
| versions.retro | link label | invariant | n/a | n/a | none |
| versions.phaseLabel | phase label | invariant (protected) | n/a | n/a | none |
| versions.olderHint | hint text with doc path | review | missing | low | none |
| versions.unassigned | label | invariant | n/a | n/a | none |

### 1.4 workspace.versionDetail.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| versionDetail.notFound | error state | invariant | n/a | n/a | none |
| versionDetail.started / ended | date labels | invariant | n/a | n/a | none |
| versionDetail.active | status badge | invariant | n/a | n/a | none |
| versionDetail.sectionPhase | section header | invariant (protected) | n/a | n/a | none |
| versionDetail.sectionTickets | section header | invariant | n/a | n/a | none |
| versionDetail.sectionOutcome | section header | invariant | n/a | n/a | none |
| versionDetail.sectionApprovedPromotions | section header — "promotions" concept | review | missing | low | none |
| versionDetail.noTickets | empty state | invariant | n/a | n/a | none |
| versionDetail.observedPending | "pending (lazy — fill in next Version Phase 1)" | review | missing | low | none |

### 1.5 workspace.promotion.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| promotion.drainTitle | "Pending memory promotions" | review | missing | low | none |
| promotion.drainCount | count badge | invariant | n/a | n/a | none |
| promotion.save / skip / edit / editConfirm | action buttons | invariant | n/a | n/a | none |
| promotion.bulkHint / bulkPlaceholder / bulkApprove | bulk approve UI | invariant | n/a | n/a | none |
| promotion.savedToast | "[PO] saved." | invariant | n/a | n/a | none |
| promotion.writeError | "Write failed: {{error}}" | **sensitive** | missing | medium | spec-extend |

### 1.6 workspace.tickets.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| tickets.title | panel header | invariant | n/a | n/a | none |
| tickets.filterAll / filterCount | filter bar | invariant | n/a | n/a | none |
| tickets.noTickets | empty state | invariant | n/a | n/a | none |
| **tickets.schemaMismatchBanner** | error banner — "Schema mismatch — {{count}} ticket(s) have unknown status (shown under 'todo'). Project status enum may not match productune doctrine." | **sensitive** | missing | **critical** | emit-follow-up |

### 1.7 workspace.phaseGate.* / restartModal.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| phaseGate.badge | badge | invariant (protected) | n/a | n/a | none |
| phaseGate.versionEnd | label | invariant | n/a | n/a | none |
| phaseGate.modify / approve | CTA buttons | invariant | n/a | n/a | none |
| restartModal.title | modal title | invariant | n/a | n/a | none |
| **restartModal.body** | "Restarting starts a new claude session. Your chat history is preserved on disk." | **sensitive** | missing | medium | spec-extend |
| restartModal.restartNow / openSettings | CTA buttons | invariant | n/a | n/a | none |

### 1.8 workspace.chat.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| chat.session / title | panel labels | invariant | n/a | n/a | none |
| chat.messageCount / emptyHint | chat UI labels | invariant | n/a | n/a | none |
| chat.messagesPlaceholder | dev placeholder text | review | missing | low | none |
| chat.inputPlaceholder / send | input UI | invariant | n/a | n/a | none |
| chat.attachFile / filesCount / removeFile | file attach UI | invariant | n/a | n/a | none |
| chat.minimize / restartSession | window controls | invariant | n/a | n/a | none |
| chat.restartHint | "Use when PO is unresponsive or too slow" | review | missing | low | none |
| chat.restore | FAB label | invariant | n/a | n/a | none |
| chat.idleCtx / actionDefault | status chip | invariant | n/a | n/a | none |
| chat.todoChipLabel / todoEmpty / todoSubmit | todo chip | invariant | n/a | n/a | none |

### 1.9 workspace.sidebar.* / tab.* / pane.* / emptyPane.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| sidebar.tabs.* (4 keys) | tab labels | invariant | n/a | n/a | none |
| sidebar.*Hint (5 keys) | hint texts with ticket refs | review | missing | low | none |
| tab.close / barEmpty / splitRight / splitDown / closePane / newTab | tab UI chrome | invariant | n/a | n/a | none |
| tab.placeholder.body | dev placeholder | review | missing | low | none |
| tab.markdown.* (4 keys) | markdown viewer | invariant | n/a | n/a | none |
| pane.active | aria label | invariant | n/a | n/a | none |
| **emptyPane.title** | "Open a file or run a command" | **sensitive** | missing | medium | spec-extend |

### 1.10 workspace.quickOpen.* / kbd.* / statusBar.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| quickOpen.placeholder | "Search files, tickets, personas…" | review | missing | low | none |
| quickOpen.empty | empty state | invariant | n/a | n/a | none |
| quickOpen.hint.* (3 keys) | keyboard shortcut hints | invariant | n/a | n/a | none |
| quickOpen.section.* (4 keys) | result section headers | review | missing | low | none |
| kbd.* (5 keys) | keyboard shortcut labels | invariant | n/a | n/a | none |
| statusBar.placeholder | dev placeholder | review | missing | low | none |

### 1.11 workspace.sessionHealth.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| sessionHealth.healthy.label | "Ready" | invariant | n/a | n/a | none |
| sessionHealth.delegating.label | "Delegating to {{persona}}…" | invariant | n/a | n/a | none |
| sessionHealth.delegating.hint | "The product team is working on this." | review | missing | low | none |
| **sessionHealth.compacting.label** | "Compacting context…" | **sensitive** | missing | medium | spec-extend |
| **sessionHealth.compacting.hint** | "This can take 30–60 seconds." | **sensitive** | missing | medium | spec-extend |
| sessionHealth.rateLimited.label | "Rate limit reached" | invariant | n/a | n/a | none |
| sessionHealth.rateLimited.hintWithReset / hintNoReset | hint texts | invariant | n/a | n/a | none |
| **sessionHealth.permissionBlocked.label** | "Permission denied" | **sensitive** | missing | medium | spec-extend |
| **sessionHealth.permissionBlocked.hint** | "The session was stopped by a permission rule." | **sensitive** | missing | medium | spec-extend |
| sessionHealth.permissionBlocked.cta | "Restart session ↗" | invariant | n/a | n/a | none |
| **sessionHealth.errorOther.label** | "Session error" | **sensitive** | missing | medium | spec-extend |
| **sessionHealth.errorOther.hint** | "The PO process didn't respond as expected." | **sensitive** | missing | medium | spec-extend |
| sessionHealth.errorOther.cta / logCta | action buttons | invariant | n/a | n/a | none |

### 1.12 workspace.presence.* / explorer.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| presence.chipAriaLabel | aria label | invariant | n/a | n/a | none |
| presence.doneNoArtifact | "done" — T-P4-057 fix-forward verified | invariant | n/a | n/a | none |
| explorer.title / refresh | panel header | invariant | n/a | n/a | none |
| explorer.showHidden / hideHidden | "Show hidden files" / "Hide hidden files" | **sensitive** | missing | medium | spec-extend |
| explorer.empty / noFolder / openFolder | empty states | invariant | n/a | n/a | none |
| explorer.readError | error text | invariant | n/a | n/a | none |
| explorer.retry | retry button | invariant | n/a | n/a | none |
| explorer.contextOpen / contextReveal | "Reveal in Finder" | review | missing | low | none |
| explorer.contextCopyPath / contextCopyRel | "Copy Path" / "Copy Relative Path" | **sensitive** | missing | medium | spec-extend |
| **explorer.binaryNoPreview** | "Binary file. Cannot preview." | **sensitive** | missing | medium | spec-extend |

### 1.13 workspace.activityBar.* / phaseStrip.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| activityBar.explorer / project / team / settings | nav labels | invariant | n/a | n/a | none |
| phaseStrip.sectionLabel / roundsSection | section labels | invariant (protected) | n/a | n/a | none |
| phaseStrip.*AriaLabel (3 keys) | aria labels | invariant | n/a | n/a | none |
| phaseStrip.roundsHint | dev hint | review | missing | low | none |
| phaseStrip.phaseTooltip.prd | "PRD — Problem & scope alignment" | invariant | n/a | n/a | none |
| phaseStrip.phaseTooltip.design | "Design — Flow, wireframe & system" | invariant | n/a | n/a | none |
| **phaseStrip.phaseTooltip.build** | "Build — Ticket implementation (incl. QA)" | **sensitive** | missing | medium | spec-extend |
| phaseStrip.phaseTooltip.deploy | "Deploy — Release preparation & ship" | review | missing | low | none |
| phaseStrip.phaseTooltip.close | "Close — Retrospective & next round" | invariant | n/a | n/a | none |

### 1.14 workspace.team.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| team.title | panel title | invariant | n/a | n/a | none |
| team.section.personas | "Personas (4)" | invariant (protected) | n/a | n/a | none |
| team.section.skills / skillsMatrix / skillsMore / skillsLink / skillsCount | skill section labels | review | missing | low | none |
| team.section.wikiMemory | "Wiki / Memory" | review | missing | low | none |
| team.persona.*.name / *.role (8 keys) | persona card labels | invariant (protected) | n/a | n/a | none |
| **team.wiki.backend.fs** | "fs (local markdown)" | **sensitive** | missing | medium | spec-extend |
| **team.wiki.backend.graphiti** | "graphiti (knowledge graph)" | **sensitive** | missing | medium | spec-extend |
| **team.wiki.backend.keeper** | "keeper (Wiki Keeper agent)" | **sensitive** | missing | medium | spec-extend |
| team.wiki.userMemory / projectState / promotionCandidates | labels | review | missing | low | none |
| team.activeDot.tooltip | "Active (last seen {{seconds}}s ago)" | review | missing | low | none |
| team.skillMatrix.title / search / filterAssigned / addSkill | skill matrix UI | review | missing | low | none |
| team.personaDef.previewNote | "Preview only — editing persona spec is a Phase 5 feature." | review | missing | low | none |

### 1.15 workspace.deploy.* — T-P4-084 §7.1 baseline area

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| **deploy.confirmTitle** (base + .dev + .planner) | deploy confirm modal title | sensitive | **covered** ✓ | n/a | none |
| **deploy.confirmBody** (base + .dev + .planner) | deploy confirm modal body | sensitive | **covered** ✓ | n/a | none |
| deploy.confirmCta / confirmDismiss | modal buttons | invariant | n/a | n/a | none |
| deploy.startTrace / progressTrace / completeTrace / failedTrace | system trace messages | **sensitive** | missing | medium | spec-extend |
| deploy.errorAuth | "Connection lost. Check your settings." | review | missing | low | none |
| deploy.errorGeneric | generic error | invariant | n/a | n/a | none |
| deploy.tabTitle | "Deploy" — protected | invariant | n/a | n/a | none |
| deploy.progressBuilding / progressQueued / progressError / progressReady | build status labels | **sensitive** | missing | medium | spec-extend |
| deploy.logsCollapsed / logsExpand | "Show logs" / "Hide logs" | **sensitive** | missing | medium | spec-extend |
| deploy.envSummary | "Environment" | **sensitive** | missing | medium | spec-extend |
| deploy.retryCta / cancelCta | buttons | invariant | n/a | n/a | none |
| deploy.executeCtaMain | "Start deployment" | review | missing | low | none |
| deploy.noDeployment | empty state | invariant | n/a | n/a | none |
| deploy.prCreatedLink | "View submitted work item ↗" — already abstracted | review | missing | low | none |
| deploy.ticketsInDeploy | "Included tasks" — already abstracted | invariant | n/a | n/a | none |
| deploy.envConfigured | "External service connected" — already abstracted | invariant | n/a | n/a | none |
| deploy.logsWaiting | "Waiting for output…" | **sensitive** | missing | medium | spec-extend |
| deploy.stepPrCreating / stepPrCreated / stepMerging / stepMerged / stepDeployTriggering / stepDeployTriggered / stepFailed | pipeline step labels — already abstracted | invariant | n/a | n/a | none |
| deploy.conflict.trivialTitle / trivialBody / trivialCta | conflict modal — already abstracted | review | missing | low | none |
| deploy.conflict.semanticTitle | "Two tasks changed the same location" | **sensitive** | missing | medium | spec-extend |
| deploy.conflict.semanticBodyFiles / semanticBodyNoFiles | conflict body — already abstracted | review | missing | low | none |
| deploy.conflict.moreFiles / actionOurs / actionTheirs / actionManual / actionRetry / actionSwitch / actionHelp / abort | conflict actions | invariant | n/a | n/a | none |
| deploy.error.githubAuth | "The connection to your account was lost." — abstracted | review | missing | low | none |
| deploy.error.branchNotPushed | "This task hasn't been saved yet." — abstracted | review | missing | low | none |
| deploy.error.mergeConflict | "Another task changed the same file. See the conflict dialog." | **sensitive** | missing | medium | spec-extend |
| deploy.error.apiRateLimit | "Too many requests. Please wait a moment (approx. 5 min)." | invariant | n/a | n/a | none |
| deploy.error.vercelTriggerFail | "Check your external service settings." — abstracted | review | missing | low | none |
| deploy.error.generic | generic error | invariant | n/a | n/a | none |
| deploy.error.actionReconnect / actionRetry / actionWaitRetry / actionViewLog | error actions | invariant | n/a | n/a | none |

### 1.16 workspace.worktree.* / baseDirty.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| worktree.autoCreatedTrace | "[system] Ticket workspace ready" | review | missing | low | none |
| worktree.branchExistsTrace | "[system] Workspace already exists — resuming" | review | missing | low | none |
| worktree.hookMissingTrace | "[system] Safety check still installing — try again shortly" | review | missing | low | none |
| worktree.gitErrorTrace | "[system] Couldn't prepare workspace — see Settings to retry" | review | missing | low | none |
| baseDirty.title | "Unsaved changes detected" | invariant | n/a | n/a | none |
| **baseDirty.body** | "Your current work in progress isn't preserved yet. Set it aside, save it now, or cancel." | **sensitive** | missing | medium | spec-extend |
| **baseDirty.cancel** | "Cancel — keep ticket, skip workspace" | **sensitive** | missing | medium | spec-extend |
| baseDirty.saveNow / setAside | buttons | invariant | n/a | n/a | none |
| baseDirty.inlineError | "Couldn't prepare your workspace. Please try a different option." | **sensitive** | missing | medium | spec-extend |

### 1.17 workspace.versionHistory.* / artifacts.* / qaLoop.* / userVerify.* / browser.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| versionHistory.sidePanel.* (8 keys) | side panel labels | invariant | n/a | n/a | none |
| versionHistory.title / empty / subtitle | panel labels | invariant | n/a | n/a | none |
| versionHistory.kanban.column.todo / inProgress / done | kanban columns | invariant | n/a | n/a | none |
| versionHistory.kanban.column.qa | "QA" — invariant (protected persona term) | invariant (protected) | n/a | n/a | none |
| versionHistory.kanban.empty | empty state | invariant | n/a | n/a | none |
| versionHistory.filter.persona.* (4 keys) | persona filter labels | invariant (protected) | n/a | n/a | none |
| versionHistory.filter.dateRange.* (3 keys) | date filter | invariant | n/a | n/a | none |
| versionHistory.unassigned / deploy.* (2 keys) | misc labels | invariant | n/a | n/a | none |
| artifacts.sectionLabel / openAll / empty | artifacts panel | invariant | n/a | n/a | none |
| **artifacts.autoOpenToast** | "{{count}} files changed — use Quick Open (Cmd+P) to see more" — **NOTE: inaccessible due to duplicate key bug (overwritten by second `workspace.artifacts` block)** | review | missing | low | none |
| qaLoop.attempt | "attempt {{current}}/{{max}}" | review | missing | low | none |
| userVerify.tabTitle / todoCheck | confirm UI | invariant | n/a | n/a | none |
| browser.* (first block — navPlaceholder / openExternal etc.) | **NOTE: inaccessible — overwritten by second `workspace.browser` block** | review | missing | low | none |
| browser.back / forward / reload / popout / addressPlaceholder / addressLabel / iframeTitle / emptyHint / loadError / retry | browser panel | invariant | n/a | n/a | none |

### 1.18 settings.* — T-P4-084 §7.2 baseline area (critical)

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| **settings.tabWorkflowRules** | en.json value = "작업 흐름 규칙" **(Korean in English locale — i18n parity bug)** | **sensitive** | missing | **critical** | emit-follow-up |
| settings.tabLanguage | "Language / 언어" — intentionally bilingual | invariant | n/a | n/a | none |
| settings.workflowRules.sectionTitle | "Workflow Rules" (no .dev variant) | **sensitive** | missing | medium | spec-extend |
| **settings.workflowRules.useDevBranch** | "Use intermediate verification environment" — planner abstraction OK, but no dev variant showing "dev branch" | **sensitive** | missing | medium | spec-extend |
| **settings.workflowRules.useStagingEnv** | "Use external review environment (post-launch)" — abstracted | review | missing | low | none |
| **settings.workflowRules.featureBranchPrefix** | "Feature work prefix" — "prefix" is dev jargon | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.workflowRules.fixBranchPrefix** | "Fix work prefix" — "prefix" is dev jargon | **sensitive** | missing | **critical** | emit-follow-up |
| settings.workflowRules.protectedEnvLabel | "Protected environments" | **sensitive** | missing | medium | spec-extend |
| settings.workflowRules.phase5Lock | "Supported in Phase 5" — invariant | invariant | n/a | n/a | none |
| settings.workflowRules.autosaveTriggersLabel | "Auto-save triggers" | **sensitive** | missing | medium | spec-extend |
| settings.workflowRules.saveSuccess / saveError / retry | status texts | invariant | n/a | n/a | none |
| settings.workflowRules.prefixPlaceholder | "e.g. feature" — dev jargon | **sensitive** | missing | **critical** | emit-follow-up |
| settings.language.* (7 keys) | language settings — bilingual by design | invariant | n/a | n/a | none |
| settings.tabGeneral | "General" | invariant | n/a | n/a | none |
| **settings.tabMcp** | "MCP Servers" — T-P4-084 §7.2 promised mode variant; MISSING | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.tabHooks** | "Hooks" — T-P4-084 §7.2 promised mode variant; MISSING | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.mcp.title** | "MCP Servers" — T-P4-084 §7.2 promised "외부 도구 연결" for planner; MISSING | **sensitive** | missing | **critical** | emit-follow-up |
| settings.mcp.statusConnected / statusUnauth / statusChecking | status badges | invariant | n/a | n/a | none |
| **settings.mcp.emptyTitle** | "No MCP servers configured." | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.mcp.emptyDesc** | "Add servers via install.sh." | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.mcp.footerHint** | "MCP servers are external tools used by the AI engine." | **sensitive** | missing | **critical** | emit-follow-up |
| settings.mcp.addBtn / addBtnTooltip / testFailed / toastSaved / toastRestartNeeded | UI labels | review | missing | low | none |
| settings.mcp.modal.titleSuffix / nameLabel / transportLabel / commandLabel / urlLabel / envLabel / addEnvRow / testBtn / restartNotice / saveBtn / cancelBtn | modal form labels | **sensitive** | missing | medium | spec-extend |
| **settings.hooks.title** | "Hooks" — T-P4-084 §7.2 promised "자동 실행 규칙" for planner; MISSING | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.hooks.emptyHint** | "No hooks configured in ~/.claude/settings.json." — file path exposed to planner | **sensitive** | missing | **critical** | emit-follow-up |
| **settings.hooks.editHint** | "Edit ~/.claude/settings.json and restart" — file path exposed to planner | **sensitive** | missing | **critical** | emit-follow-up |
| settings.hooks.addHint | "Add via install.sh" | **sensitive** | missing | medium | spec-extend |
| settings.hooks.docsLink / copyBtn / footerHint | misc labels | review | missing | low | none |
| settings.general.userMode.title / description | mode selector | invariant | n/a | n/a | none |
| settings.general.userMode.developer.label / desc | mode option | invariant | n/a | n/a | none |
| settings.general.userMode.planner.label / desc | mode option | invariant | n/a | n/a | none |
| settings.general.userMode.unset.label / desc | mode option | invariant | n/a | n/a | none |

### 1.19 app.*

| key | component_context | mode_sensitivity | suffix_status | severity | action |
|---|---|---|---|---|---|
| app.onboardingTitle | app title | invariant | n/a | n/a | none |
| app.install.* (4 keys) | install prompt | invariant | n/a | n/a | none |
| app.descendant.* (4 keys) | multi-project dialog | invariant | n/a | n/a | none |
| app.migrate.* (4 keys) | migration dialog | invariant | n/a | n/a | none |

---

## §2 Critical Violation List

`severity=critical AND suffix_status=missing` — 13 items across 5 area_tags.

> Note: T-P4-084 §7.1 baseline keys (`workspace.deploy.confirmTitle` / `confirmBody`) are **covered** ✓.
> T-P4-084 §7.2 Settings section titles are **NOT covered** in locale files (critical gap — see items 1–8).

| # | key | planner_text (base / current) | dev_text (proposed .dev) | area_tag | follow_up_trigger |
|---|---|---|---|---|---|
| 1 | settings.tabMcp | "MCP Servers" | "MCP Servers" (keep EN abbreviation) | settings/mcp | D-1: §7.2 gap |
| 2 | settings.mcp.title | "MCP Servers" | "MCP Servers" → base should become "외부 도구 연결" (ko) / "External Tools" (en); .dev = "MCP Servers" | settings/mcp | D-1: §7.2 gap |
| 3 | settings.mcp.emptyTitle | "No MCP servers configured." | "No MCP servers configured." (planner: hide section or show "No external tools configured.") | settings/mcp | D-1: §7.2 gap |
| 4 | settings.mcp.emptyDesc | "Add servers via install.sh." | planner: omit or simplified; .dev = "Add servers via install.sh." | settings/mcp | D-1: §7.2 gap |
| 5 | settings.mcp.footerHint | "MCP servers are external tools used by the AI engine." | planner: "External tools connect AI to your services."; .dev = keep current | settings/mcp | D-1: §7.2 gap |
| 6 | settings.tabHooks | "Hooks" | planner: "Auto Rules" or hidden; .dev = "Hooks" | settings/hooks | D-1: §7.2 gap |
| 7 | settings.hooks.title | "Hooks" | planner: "Auto Rules"; .dev = "Hooks" | settings/hooks | D-1: §7.2 gap |
| 8 | settings.hooks.emptyHint | "No hooks configured in ~/.claude/settings.json." | planner: "No automation rules configured."; .dev = keep current (file path OK) | settings/hooks | D-1: file path exposure |
| 9 | settings.hooks.editHint | "Edit ~/.claude/settings.json and restart" | planner: hidden or "Contact your team admin to configure rules."; .dev = keep current | settings/hooks | D-1: file path exposure |
| 10 | settings.workflowRules.featureBranchPrefix | "Feature work prefix" | planner: "Feature work label"; .dev = "Feature branch prefix" | settings/workflow-rules | D-1: branch jargon |
| 11 | settings.workflowRules.fixBranchPrefix | "Fix work prefix" | planner: "Fix work label"; .dev = "Fix branch prefix" | settings/workflow-rules | D-1: branch jargon |
| 12 | settings.workflowRules.prefixPlaceholder | "e.g. feature" | invariant for dev; planner: "e.g. new-feature" (less technical) | settings/workflow-rules | D-1: prefix jargon |
| 13 | workspace.tickets.schemaMismatchBanner | "Schema mismatch — {{count}} ticket(s) have unknown status (shown under 'todo'). Project status enum may not match productune doctrine." | planner: "Some tasks have an unrecognized status and have been shown under 'Todo'. This may be a configuration issue."; .dev = keep current | workspace/schema-error | D-1: schema/enum jargon |

**Bonus structural critical (not mode-coverage but locale integrity — area_tag: locale/structural-bugs)**:

| # | issue | file | impact |
|---|---|---|---|
| S-1 | `settings.tabWorkflowRules` value = `"작업 흐름 규칙"` in **en.json** (Korean in English locale) | en.json L525 | English-locale users see Korean tab label |
| S-2 | `workspace.browser` top-level key defined **twice** (L437–442 + L511–522) | en.json + ko.json | L437-block keys (`navPlaceholder`, `openExternal`) silently lost — overwritten |
| S-3 | `workspace.artifacts` top-level key defined **twice** (L443–445 + L499–503) | en.json + ko.json | L443-block key (`autoOpenToast`) silently lost — overwritten |

---

## §3 T-P4-057 Linter Mode-aware Extension Spec

### Background

The current `check-locale-protected.sh` v2 (T-P4-057) does one thing: **protected token preservation** — it verifies that doctrine-fixed identifiers (persona names, phase/status enums, product names) are never Korean-translated in locale values. Exit code 1 on violation, exit code 2 on missing perl. This is working correctly.

The gap: the linter has **no mode-coverage check**. A developer can add a new sensitive key (e.g., a new MCP-related label) without any `.dev` variant, and CI remains green. This is the silent drift risk flagged in T-P4-085 §1.

### Proposed Extension: mode-coverage warn pass

**Goal**: Supplement (not replace) the protected-token check with a non-blocking **mode-coverage summary** that flags sensitive keys lacking `.dev` sub-keys.

**Design decisions**:
- **warn, not fail** — new keys are not always mode-sensitive. Developer makes the call.
- **stdout only** — warn output goes to stdout so PR reviewers see it but CI doesn't break.
- **covered_rate** — summary line: `Mode coverage: N/M sensitive keys have .dev variant (X%)`.
- If `covered_rate < 70%`, emit an additional `COVERAGE-LOW` warning (not exit 1).
- Existing protected-token fail logic (`exit 1`) is **unchanged**.
- Implementation language: extend the existing bash script with `node --input-type=module` or a lightweight `python3 -c` JSON parse (both available in the project's Node.js environment). **Do not add new script dependencies.**

**Sensitive key pattern list** (seed from this audit — to be maintained as a comment block in the script):

```bash
# MODE-SENSITIVE KEY PATTERNS (seed: T-P4-085 audit 2026-05-14)
# Extend this list when new mode-sensitive keys are added to the catalog.
MODE_SENSITIVE_PATTERNS=(
  "settings.tabMcp"
  "settings.tabHooks"
  "settings.mcp.title"
  "settings.mcp.emptyTitle"
  "settings.mcp.emptyDesc"
  "settings.mcp.footerHint"
  "settings.hooks.title"
  "settings.hooks.emptyHint"
  "settings.hooks.editHint"
  "settings.workflowRules.featureBranchPrefix"
  "settings.workflowRules.fixBranchPrefix"
  "settings.workflowRules.prefixPlaceholder"
  "workspace.tickets.schemaMismatchBanner"
  "workspace.sessionHealth.compacting.label"
  "workspace.sessionHealth.permissionBlocked.hint"
  "workspace.sessionHealth.errorOther.hint"
  "workspace.emptyPane.title"
)
```

**Check logic** (pseudocode):

```
for each PATTERN in MODE_SENSITIVE_PATTERNS:
  base_key = PATTERN
  dev_key  = PATTERN + ".dev"
  check if dev_key exists in en.json (using node/python JSON parse)
  if NOT exists:
    print "WARN: mode-coverage gap — '$base_key' has no .dev variant"
    warn_count++

covered_count = len(MODE_SENSITIVE_PATTERNS) - warn_count
rate = covered_count / len(MODE_SENSITIVE_PATTERNS) * 100
print "Mode coverage: $covered_count/$total sensitive keys have .dev variant ($rate%)"

if rate < 70:
  print "COVERAGE-LOW: mode coverage below 70% — review mode-sensitive keys"
```

**Integration**: the mode-coverage check runs AFTER the existing protected-token check loop, before the final exit. Single script, single run in prebuild.

**Current baseline coverage** (from this audit):
- Covered: 2 / 17 seed patterns = 12% → COVERAGE-LOW would fire immediately
- This is expected — the follow-up tickets from §2 will raise coverage

**Linter impl ticket trigger (§2-D condition D-3)**: warn items ≥ 5 (all 17 seed patterns would warn) → D-3 met → linter extension impl ticket should be triggered.

---

## §4 Coverage Summary

| metric | value |
|---|---|
| Total en.json leaf keys (approx) | ~342 |
| mode-sensitive keys identified | 37 |
| review keys (need design decision) | 21 |
| invariant keys (protected doctrine / pure UI chrome) | ~284 |
| Currently covered (.dev or .planner sub-key) | 2 key groups (confirmTitle + confirmBody) |
| **Coverage rate** | **≈ 5%** |
| Critical violations (missing + critical) | 13 |
| Structural bugs (duplicate keys, i18n parity) | 3 |
| T-P4-084 §7.1 baseline | 2 of 5 promised items covered in locale; 3 may be component-level |
| T-P4-084 §7.2 baseline | 0 of 6 promised items in locale files (critical gap) |

---

## §5 Follow-up Trigger Assessment (§2-D)

| area_tag | critical violations | D-1 trigger | D-2 medium trigger | recommended action |
|---|---|---|---|---|
| **settings/mcp** | 5 (items 1–5) | YES | YES (5 medium additional) | Emit follow-up ticket |
| **settings/hooks** | 4 (items 6–9) | YES | YES (3 medium additional) | Emit follow-up ticket |
| **settings/workflow-rules** | 3 (items 10–12) | YES | YES | Emit follow-up ticket |
| **workspace/schema-error** | 1 (item 13) | YES | — | Emit follow-up ticket |
| **locale/structural-bugs** | 3 (S-1/S-2/S-3) | YES | — | Emit follow-up ticket (separate from mode-coverage; pre-existing JSON bug) |
| settings/session-health | 0 critical | — | YES (6 medium) | PO judgment — batch with settings/mcp or defer |
| onboarding/setup | 0 critical | — | YES (8 medium) | PO judgment — defer to next version |
| **linter/mode-coverage** | 17 warn items | D-3 YES (≥5) | — | Emit linter impl ticket (spec = §3 above) |

**Total follow-up ticket candidates**: 6 (4 mode-coverage area tickets + 1 structural-bugs ticket + 1 linter impl ticket)

---

## §6 T-P4-084 §7.1 / §7.2 Baseline Confirmation

Per T-P4-085 §3 AC: "T-P4-084 §7.1/§7.2 11 keys — audit matrix에 suffix_status=covered로 포함 (재심 아님, baseline 확인)".

| §7 item | key | suffix_status in locale | note |
|---|---|---|---|
| §7.1 자동저장 모달 body | not found in locale files | — | may be component-level or deferred |
| §7.1 배포 준비 tooltip | not found in locale files | — | may be component-level or deferred |
| §7.1 배포 confirm body | `workspace.deploy.confirmBody` (.dev + .planner) | **covered** ✓ | |
| §7.1 Conflict 에러 모달 | `workspace.deploy.conflict.*` — single values, no .dev | **missing** | not in locale as mode variants |
| §7.1 Network 실패 toast | `workspace.deploy.error.*` — single values | **missing** | not in locale as mode variants |
| §7.2 Settings → MCP servers tab | `settings.tabMcp` = "MCP Servers" (single) | **missing** | critical gap |
| §7.2 Settings → Hooks tab | `settings.tabHooks` = "Hooks" (single) | **missing** | critical gap |
| §7.2 Settings → Stream-json log | not found | — | may be not-yet-implemented feature |
| §7.2 Settings → Models | not found | — | may be not-yet-implemented feature |
| §7.2 Settings → Environment | not found | — | may be not-yet-implemented feature |
| §7.2 Settings → Git rules sectionTitle | `settings.workflowRules.sectionTitle` = "Workflow Rules" (single) | **missing** | also: tabWorkflowRules has Korean in en.json (bug) |

**Conclusion**: 2 of 11 promised §7 items are confirmed `covered` in locale files. 3 items are not in locale (likely component-level or deferred). 6 items are `missing` — these constitute the critical §7.2 gap that follow-up tickets for `settings/mcp`, `settings/hooks`, and `settings/workflow-rules` must resolve.

---

*Audit doc generated: 2026-05-14 by pdt-developer T-P4-085 r4-fix. No code changes. Source of truth: `packages/gui/src/locales/{en,ko}.json` at worktree T-P4-085.*
