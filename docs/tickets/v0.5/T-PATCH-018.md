---
ticket_id: T-PATCH-018
version: v0.5
phase: 3
type: refactor
status: done
assignee: pdt-developer
estimated_complexity: L3
qa: false
risk_flags: i18n-parity, dev-variant-ambiguity, attribute-strings
slug: i18n-sweep
---

# T-PATCH-018: i18n coverage sweep — convert hardcoded user-visible strings to t()/tMode()

> Mechanical sweep. No new UX. QA: false, but recommend a light visual pass in BOTH
> ko + en locales after conversion (status labels, tab titles, tooltips render correctly,
> no raw `key.path` leaking, dev-mode wording where `.dev` variants added).

## Request

The GUI localizes via `react-i18next` through `src/i18n/useUserModeT.ts` (`tMode`/`t`),
backed by `src/locales/ko.json` + `src/locales/en.json`. A sweep of `packages/gui/src`
(components, views, onboarding, shared, store) found **49** user-visible string sites that
are HARDCODED (Korean literals, plus a set of English `title`/`aria-label`/`placeholder`
attribute literals) and NOT routed through `t()`/`tMode()`.

Notable patterns:
- **Every hardcoded *body/JSX* literal is Korean** — no hardcoded English JSX text exists.
- Hardcoded English appears only in **attribute strings** (`title`, `aria-label`, `placeholder`).
- Several sites **duplicate keys that already exist** in the locales (e.g. QuickOpenPalette
  legend/footer duplicate `workspace.quickOpen.*`; BrowserTab `title="Back"` duplicates
  `workspace.browser.back`). Conversion = REUSE the existing key, do not mint a new one.
- Two store files (`store/workspace.ts`, `store/poEvents.ts`) emit UI strings (tab titles,
  toast/todo descriptions) — these are user-visible and in scope despite living in `store/`.

Convert all enumerated sites. Where a string already has a locale key, wire the existing
key. Where missing, add the key to BOTH `ko.json` and `en.json` (parity is mandatory).

### Excluded (verified, NOT in scope)
- Code comments (incl. inline CSS comments in `TicketDashboardView.tsx:329–375`,
  `ConflictResolveModal.tsx:107/116/121`, `McpServerModal.tsx:304`, `McpServersTab.tsx:107`,
  `DeployTab.tsx:462`, `SidePanelPastVersions.tsx:82`, `PendingGateChip.tsx:180/185`,
  `index.ts:1`, `personaPresence.ts:12`, `useArtifacts.ts:15`, `poEvents.ts:33`).
- `console.*`, test ids, dev-only debug text.
- Example/format placeholders that read as *literal example values*, not UI copy
  (`NewProjectModal` `my-saas`, `McpServerModal` `npx @example/mcp-server`, `value`) —
  listed in open_questions, deferred unless PO wants them localized.

## Offending sites (enumerated)

Legend: **REUSE** = key already exists in locales (wire it, no new key). **NEW** = add to both locales.
`<existing>` in proposed-key column means use that exact existing key.

### components/MermaidBlock.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 89 | `Mermaid 렌더 오류` | NEW `workspace.mermaid.renderError` | Mermaid 렌더 오류 | Mermaid render error |
| 91 | `원문 소스:` | NEW `workspace.mermaid.sourceLabel` | 원문 소스: | Source: |
| 124 | `렌더링 중...` | REUSE `common.loading` (verify text) / else NEW `workspace.mermaid.rendering` | 렌더링 중... | Rendering… |
| 135 | `Mermaid 컴포넌트 오류` | NEW `workspace.mermaid.componentError` | Mermaid 컴포넌트 오류 | Mermaid component error |

### components/ErrorBoundary.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 25 | `렌더 오류` | NEW `app.errorBoundary.title` | 렌더 오류 | Render error |

### components/NewProjectModal.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 23 | `영소문자·숫자·하이픈만, 2자 이상` | NEW `app.newProject.slugRuleError` | 영소문자·숫자·하이픈만, 2자 이상 | Lowercase, digits, hyphens only; min 2 chars |
| 42 | `생성 실패` | NEW `app.newProject.createFailed` | 생성 실패 | Creation failed |
| 52 | `새 프로젝트 만들기` | NEW `app.newProject.title` (REUSE candidate: `HomeView` 47 same string) | 새 프로젝트 만들기 | New project |
| 57 | `프로젝트 이름 (slug)` | NEW `app.newProject.nameLabel` | 프로젝트 이름 (slug) | Project name (slug) |
| 67 | `영소문자, 숫자, 하이픈만 사용 가능합니다.` | NEW `app.newProject.slugHint` | 영소문자, 숫자, 하이픈만 사용 가능합니다. | Lowercase letters, digits, and hyphens only. |
| 77 | `첫 번째 Version ID` | NEW `app.newProject.firstVersionLabel` | 첫 번째 Version ID | First Version ID |
| 91 | `취소` | REUSE `common.cancel` | 취소 | Cancel |
| 93 | `다음 →` | REUSE `common.next` | 다음 → | Next → |

### components/GitHubOAuthFlow.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 59 | `OAuth 실패` | NEW `app.github.oauthFailed` | OAuth 실패 | OAuth failed |
| 73 | `repo 생성 실패` | NEW `app.github.repoCreateFailed` | repo 생성 실패 | Repo creation failed |
| 80 | `GitHub 토큰 확인 중…` | NEW `app.github.checkingToken` | GitHub 토큰 확인 중… | Checking GitHub token… |
| 84 | `GitHub 인증` | NEW `app.github.authTitle` | GitHub 인증 | GitHub authentication |
| 86 | `아래 코드를 GitHub에 입력하세요.` | NEW `app.github.enterCode` | 아래 코드를 GitHub에 입력하세요. | Enter the code below on GitHub. |
| 99 | `GitHub 인증 대기 중…` | NEW `app.github.waitingAuth` | GitHub 인증 대기 중… | Waiting for GitHub authentication… |
| 100 | `private repo '${slug}' 생성 중…` | NEW `app.github.creatingRepo` (interp `{{slug}}`) | private repo '{{slug}}' 생성 중… | Creating private repo '{{slug}}'… |
| 105 | `연결 완료` | NEW `app.github.connected` | 연결 완료 | Connected |
| 107 | `워크스페이스 열기` | NEW `app.github.openWorkspace` | 워크스페이스 열기 | Open workspace |
| 114 | `연결 실패` | NEW `app.github.connectFailed` | 연결 실패 | Connection failed |
| 117 | `로컬 전용으로 계속` | NEW `app.github.continueLocal` | 로컬 전용으로 계속 | Continue local-only |
| 118 | `재시도` | REUSE `common.retry` (verify wording) | 재시도 | Retry |

### views/HomeView.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 19 | `방금` | NEW `app.home.relTimeJustNow` | 방금 | just now |
| 20 | `${min}분 전` | NEW `app.home.relTimeMin` (interp `{{n}}`) | {{n}}분 전 | {{n}}m ago |
| 22 | `${hrs}시간 전` | NEW `app.home.relTimeHour` (interp `{{n}}`) | {{n}}시간 전 | {{n}}h ago |
| 24 | `${days}일 전` | NEW `app.home.relTimeDay` (interp `{{n}}`) | {{n}}일 전 | {{n}}d ago |
| 47 | `새 프로젝트 만들기` | NEW `app.home.newProject` (share w/ NewProjectModal title) | 새 프로젝트 만들기 | New project |
| 51 | `기존 폴더 열기` | NEW `app.home.openExisting` | 기존 폴더 열기 | Open existing folder |
| 78 | `최근 프로젝트 없음` | NEW `app.home.noRecent` | 최근 프로젝트 없음 | No recent projects |

### views/DesignStageView.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 60 | `_파일을 읽을 수 없습니다._` | NEW `workspace.designStage.readError` | _파일을 읽을 수 없습니다._ | _Cannot read file._ |
| 99 | `로딩 중...` | REUSE `common.loading` | 로딩 중... | Loading… |
| 103 | `docs/artifacts/ 에 디자인 산출물이 없습니다.` | NEW `workspace.designStage.empty` | docs/artifacts/ 에 디자인 산출물이 없습니다. | No design artifacts in docs/artifacts/. |
| 131 | `← 뒤로` | NEW `workspace.designStage.back` (REUSE candidate `common.prev` = '← Back') | ← 뒤로 | ← Back |
| 137 | `로딩 중...` | REUSE `common.loading` | 로딩 중... | Loading… |
| 143 | `docs/artifacts/ 에 디자인 산출물이 없습니다.` | REUSE `workspace.designStage.empty` (line 103) | — | — |
| 144 | `왼쪽에서 파일을 선택하세요.` | NEW `workspace.designStage.selectHint` | 왼쪽에서 파일을 선택하세요. | Select a file on the left. |

### views/WorkspaceShell.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 46 | `aria-label="Quick Open — ⌘P"` | NEW `workspace.quickOpen.ariaLabel` (interp shortcut) | 빠른 열기 — ⌘P | Quick Open — ⌘P |
| 55 | `검색 — 티켓 · 탭 · 스킬 · MCP · 산출물 · 페르소나` | NEW `workspace.quickOpen.searchHint` | 검색 — 티켓 · 탭 · 스킬 · MCP · 산출물 · 페르소나 | Search — tickets · tabs · skills · MCP · artifacts · personas |

### views/versionHistory/TicketCard.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 78 | `▲ 접기` / `▼ 자동저장 기록 ${n}건` | NEW `workspace.versionHistory.ticketCard.collapse` + `.autosaveCount` (interp `{{n}}`) | ▲ 접기 / ▼ 자동저장 기록 {{n}}건 | ▲ Collapse / ▼ {{n}} autosaves |

### views/versionHistory/RichDeployCard.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 25 | `${mins}분 ${secs}초` | NEW `workspace.versionHistory.deploy.durMinSec` (interp `{{m}}`,`{{s}}`) | {{m}}분 {{s}}초 | {{m}}m {{s}}s |
| 26 | `${secs}초` | NEW `workspace.versionHistory.deploy.durSec` (interp `{{s}}`) | {{s}}초 | {{s}}s |
| 32 | `배포` | REUSE `workspace.deploy.tabTitle`? — verify; else NEW `workspace.versionHistory.deploy.pill` | 배포 | Deploy |
| 37 | `${durationLabel} 소요` | NEW `workspace.versionHistory.deploy.took` (interp `{{dur}}`) | {{dur}} 소요 | took {{dur}} |
| 59 | `▲ 접기` / `▼ 배포 URL` | NEW `workspace.versionHistory.deploy.collapse` + `.urlLabel` | ▲ 접기 / ▼ 배포 URL | ▲ Collapse / ▼ Deploy URL |

### components/workspace/SettingsView.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 22 | defaultValue `'일반'` | REUSE `settings.tabGeneral` (drop inline defaultValue) | 일반 | General |
| 31 | defaultValue `'일반 설정'` | REUSE `settings.tabGeneral` or NEW `settings.generalTabTitle` | 일반 설정 | General settings |

### components/workspace/SidePanelVersionList.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 39 | `오늘` | NEW `workspace.versions.today` | 오늘 | Today |
| 150 | `${totalTickets} · 배포 ${totalDeploys}` | NEW `workspace.versions.ticketDeploySummary` (interp `{{tickets}}`,`{{deploys}}`) | {{tickets}} · 배포 {{deploys}} | {{tickets}} · {{deploys}} deploys |
| 159 | `'버전 히스토리'` (openTab title) | REUSE `workspace.versionHistory.title` | 버전 히스토리 | Version history |
| 168 | `'버전 히스토리'` (openTab title) | REUSE `workspace.versionHistory.title` | 버전 히스토리 | Version history |

### components/workspace/SidePanelPastVersions.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 75 | defaultValue `${pastCount}개 배포 ${totalDeploys}` | NEW `workspace.versions.pastSummary` (interp) | {{count}}개 배포 {{deploys}} | {{count}} versions · {{deploys}} deploys |

### components/workspace/SidePanelCurrentVersion.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 44 | `오늘 시작` | NEW `workspace.versions.startedToday` | 오늘 시작 | Started today |
| 45 | `${days}일째` | NEW `workspace.versions.daysSince` (interp `{{n}}`) | {{n}}일째 | Day {{n}} |
| 140 | `티켓` | REUSE `workspace.versions.tickets` (verify) | 티켓 | Tickets |
| 147 | `시작` | NEW `workspace.versions.startedLabel` | 시작 | Started |

### components/workspace/VersionRow.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 24 | `오늘` | REUSE `workspace.versions.today` (added above) | 오늘 | Today |

### components/workspace/ArtifactsPane.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 115 | `파일 목록을 불러오지 못했어요.` | NEW `workspace.artifacts.loadError` | 파일 목록을 불러오지 못했어요. | Could not load file list. |
| 118 | `다시 시도` | REUSE `common.retry` | 다시 시도 | Retry |
| 131 | `표시할 산출물이 없습니다` | REUSE `workspace.artifacts.empty` (verify wording) | 표시할 산출물이 없습니다 | No artifacts to show |
| 132 | `docs/artifacts/ 폴더에 산출물이 생기면 여기 나타납니다.` | NEW `workspace.artifacts.emptyHelper` | docs/artifacts/ 폴더에 산출물이 생기면 여기 나타납니다. | Artifacts appear here once added to docs/artifacts/. |

### components/workspace/QuickOpenPalette.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 70 | legend `티켓` | REUSE `workspace.quickOpen.section.ticket` | 티켓 | Tickets |
| 71 | legend `탭` | NEW `workspace.quickOpen.section.tab` | 탭 | Tabs |
| 72 | legend `스킬` | REUSE `workspace.quickOpen.section.skill` | 스킬 | Skills |
| 74 | legend `산출물` | NEW `workspace.quickOpen.section.artifact` | 산출물 | Artifacts |
| 75 | legend `페르소나` | REUSE `workspace.quickOpen.section.persona` | 페르소나 | Personas |
| 372 | `결과 없음` | REUSE `workspace.quickOpen.empty` | 결과 없음 | No results |
| 374 | `티켓 · 탭 · 스킬 · MCP · 산출물 · 페르소나` + `전체에서 검색했어요` | NEW `workspace.quickOpen.searchedScope` + `.searchedAll` | 티켓 · 탭 · 스킬 · MCP · 산출물 · 페르소나 / 전체에서 검색했어요 | tickets · tabs · skills · MCP · artifacts · personas / Searched everything |
| 377 | `<kbd>Esc</kbd> 로 닫기` | REUSE `workspace.quickOpen.hint.close` (or NEW `.closeKbd`) | 로 닫기 | to close |
| 501 | `aria-label="검색어 지우기"` | NEW `workspace.quickOpen.clearAria` | 검색어 지우기 | Clear search |
| 539 | `이동` | REUSE `workspace.quickOpen.hint.nav` (text part) | 이동 | navigate |
| 543 | `열기` | REUSE `workspace.quickOpen.hint.open` (text part) | 열기 | open |
| 547 | `범위` | NEW `workspace.quickOpen.hint.scope` | 범위 | scope |
| 552 | `닫기` | REUSE `workspace.quickOpen.hint.close` (text part) | 닫기 | close |

### components/workspace/McpServerModal.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 69 | `변경사항이 있습니다. 닫을까요?` | NEW `settings.mcp.modal.confirmClose` | 변경사항이 있습니다. 닫을까요? | You have unsaved changes. Close anyway? |
| 78 | `변경사항이 있습니다. 닫을까요?` | REUSE `settings.mcp.modal.confirmClose` | — | — |
| 131 | `이름 변경 실패` | NEW `settings.mcp.renameFailed` | 이름 변경 실패 | Rename failed |
| 143 | `저장 실패` | NEW `settings.mcp.saveFailed` | 저장 실패 | Save failed |
| 146 | `저장 실패` | REUSE `settings.mcp.saveFailed` | — | — |
| 268 | `title="Remove"` | REUSE `workspace.chat.removeFile`? verify; else NEW `settings.mcp.modal.removeEnv` | 제거 | Remove |

### components/workspace/LeftSidebar.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 117 | `title="새로고침"` | NEW `workspace.sidebar.refresh` | 새로고침 | Refresh |
| 118 | `aria-label="새로고침"` | REUSE `workspace.sidebar.refresh` | — | — |

### components/workspace/StatusBar.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 71 | `title="Recent projects"` | NEW `workspace.statusBar.recentProjects` | 최근 프로젝트 | Recent projects |

### components/workspace/BackgroundTaskSegment.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 437 | `aria-label="Close"` | NEW `common.close` (shared) | 닫기 | Close |

### components/workspace/SessionHealthBanner.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 94 | `aria-label="Dismiss"` | NEW `common.dismiss` (shared) | 닫기 | Dismiss |
| 95 | `title="Dismiss"` | REUSE `common.dismiss` | — | — |

### components/workspace/chat/RateLimitBanner.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 54 | `API 한도 도달 — 약 ${remaining}초 후 재시도 가능 (추정)` | NEW `workspace.chat.rateLimit.estimated` (interp `{{n}}`) | API 한도 도달 — 약 {{n}}초 후 재시도 가능 (추정) | API limit reached — retry in ~{{n}}s (estimated) |
| 55 | `API 한도 도달 — ${remaining}초 후 재시도 가능` | NEW `workspace.chat.rateLimit.exact` (interp `{{n}}`) | API 한도 도달 — {{n}}초 후 재시도 가능 | API limit reached — retry in {{n}}s |

### components/workspace/chat/PromotionCard.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 83 | `candidate 가 ${tier} 에 promote 되었습니다` | NEW `workspace.promotion.promoted` (interp `{{tier}}`) | candidate 가 {{tier}} 에 promote 되었습니다 | Candidate promoted to {{tier}} |
| 84 | `candidate 가 거절되었습니다` | NEW `workspace.promotion.rejected` | candidate 가 거절되었습니다 | Candidate rejected |
| 165 | `거절` | NEW `workspace.promotion.rejectCta` | 거절 | Reject |
| 175 | `승인` | NEW `workspace.promotion.approveCta` | 승인 | Approve |
| 195 | `거절하면 candidate 가 사라집니다 — 거절하시겠습니까?` | NEW `workspace.promotion.rejectConfirm` | 거절하면 candidate 가 사라집니다 — 거절하시겠습니까? | Rejecting removes the candidate — reject it? |
| 218 | `거절` | REUSE `workspace.promotion.rejectCta` | 거절 | Reject |

### components/workspace/chat/PendingGateChip.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 45 | `종료` (to_phase fallback) | NEW `workspace.gate.phaseEnd` | 종료 | End |
| 119 | `aria-label="결정 대기 항목"` | NEW `workspace.gate.pendingAria` | 결정 대기 항목 | Pending decision |
| 132 | `aria-label="닫기"` | REUSE `common.close` | 닫기 | Close |
| 164 | `placeholder="답변 입력..."` | NEW `workspace.gate.answerPlaceholder` | 답변 입력... | Type your answer… |
| 174 | `보내기` | NEW `workspace.gate.send` | 보내기 | Send |
| 183 | `진입 승인` | NEW `workspace.gate.approveEnter` | 진입 승인 | Approve entry |
| 187 | `보류` | NEW `workspace.gate.hold` | 보류 | Hold |
| 208 | `aria-label={결정 대기 항목 ${open?'닫기':'열기'}}` | NEW `workspace.gate.toggleAria` (interp `{{state}}` or two keys) | 결정 대기 항목 {{state}} | Pending decision {{state}} |
| 211 | `결정 대기` | NEW `workspace.gate.pendingLabel` | 결정 대기 | Pending decision |

### components/workspace/chat/TodoListPanel.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 126 | `placeholder="입력 후 제출…"` | NEW `workspace.todo.inputPlaceholder` | 입력 후 제출… | Type and submit… |

### components/workspace/main/panes/TicketDetailTab.tsx  (see open_questions — dev variants)
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 86 | `담당자` (fallback) | NEW `workspace.ticketDetail.defaultAssignee` | 담당자 | Assignee |
| 90 | `차단 — blocker 해소 대기` | NEW `workspace.ticketDetail.statusBlocked` (+`.dev`) | 차단 — 해소 대기 | Blocked — waiting |
| 92 | `${persona} 리뷰 대기` | NEW `workspace.ticketDetail.statusReview` (interp) | {{persona}} 리뷰 대기 | Awaiting {{persona}} review |
| 94 | `qa 검증 대기 (user-verify)` | NEW `workspace.ticketDetail.statusUserVerify` (+`.dev`) | 검증 대기 | Verification pending |
| 97 | `qa 검증 대기 (qa_status: pending)` | NEW `workspace.ticketDetail.statusQaPending` (+`.dev`) | 검증 대기 | Verification pending |
| 99 | `${persona} 진행 중` | NEW `workspace.ticketDetail.statusInProgress` (interp) | {{persona}} 진행 중 | {{persona}} in progress |
| 101 | `${persona} 착수 대기` | NEW `workspace.ticketDetail.statusTodo` (interp) | {{persona}} 착수 대기 | {{persona}} not started |
| 103 | `완료 — 다음 action 없음` | NEW `workspace.ticketDetail.statusDone` (+`.dev`) | 완료 | Done |
| 105 | `폐기됨` | NEW `workspace.ticketDetail.statusAbandoned` | 폐기됨 | Abandoned |
| 107 | `${persona} 대기 중` / `담당자 미지정` | NEW `workspace.ticketDetail.statusWaiting` + `.unassigned` | {{persona}} 대기 중 / 담당자 미지정 | {{persona}} waiting / Unassigned |
| 145 | `working · 진행 중` | NEW `workspace.ticketDetail.railActive` (+`.dev`) | 진행 중 | working |
| 148 | `idle · 세션 live` | NEW `workspace.ticketDetail.railIdle` (+`.dev`) | 대기 | idle |
| 235 | `title="Tickets 탭으로"` | NEW `workspace.ticketDetail.crumbBack` | Tickets 탭으로 | To Tickets tab |
| 260 | `티켓을 불러오지 못했어요. 티켓 파일이 존재하는지 확인해주세요.` | NEW `workspace.ticketDetail.loadError` | 티켓을 불러오지 못했어요. 티켓 파일이 존재하는지 확인해주세요. | Could not load ticket. Check that the ticket file exists. |
| 262 | `다시 시도` | REUSE `common.retry` | 다시 시도 | Retry |
| 304 | `읽기 전용` | NEW `workspace.common.readOnly` (shared) | 읽기 전용 | Read-only |
| 318 | `Korean body section (Request KR) 없음 — 전체 spec 을 확인하세요.` | NEW `workspace.ticketDetail.noKrBody` | Request KR 섹션 없음 — 전체 spec 을 확인하세요. | No Request (KR) section — see full spec. |
| 356 | `파생 · 읽기 전용` | NEW `workspace.ticketDetail.derivedReadOnly` | 파생 · 읽기 전용 | Derived · read-only |
| 408 | `다음 —` | NEW `workspace.ticketDetail.nextLabel` | 다음 — | Next — |

### components/workspace/main/panes/SkillMatrixTab.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 179 | `~/.claude/skills/ 에 설치된 skill 없음` | NEW `workspace.team.skillMatrix.emptyPrimary` | ~/.claude/skills/ 에 설치된 skill 없음 | No skills installed in ~/.claude/skills/ |
| 180 | `skill install 후 다시 시도하세요` | NEW `workspace.team.skillMatrix.emptySecondary` | skill install 후 다시 시도하세요 | Install a skill, then retry |

### components/workspace/main/panes/ZoomControls.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 40/41 | `축소` (title+aria) | NEW `workspace.zoom.out` | 축소 | Zoom out |
| 48/49 | `줌 초기화` (title+aria) | NEW `workspace.zoom.reset` | 줌 초기화 | Reset zoom |
| 57/58 | `확대` (title+aria) | NEW `workspace.zoom.in` | 확대 | Zoom in |

### components/workspace/main/panes/ArtifactMermaidTab.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 112 | `읽기 전용` | REUSE `workspace.common.readOnly` | 읽기 전용 | Read-only |
| 130 | `파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요.` | NEW `workspace.common.fileLoadError` (shared) | 파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요. | Could not load file. Try again shortly. |
| 133 | `다시 시도` | REUSE `common.retry` | 다시 시도 | Retry |

### components/workspace/main/panes/ArtifactMdTab.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 87 | `읽기 전용` | REUSE `workspace.common.readOnly` | 읽기 전용 | Read-only |
| 105 | `파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요.` | REUSE `workspace.common.fileLoadError` | 파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요. | Could not load file. Try again shortly. |
| 108 | `다시 시도` | REUSE `common.retry` | 다시 시도 | Retry |

### components/workspace/main/panes/BrowserTab.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 115/116 | `title`/`aria-label="Back"` | REUSE `workspace.browser.back` | 뒤로 | Back |
| 123/124 | `title`/`aria-label="Forward"` | REUSE `workspace.browser.forward` | 앞으로 | Forward |

### components/explorer/ContextMenu.tsx
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 43 | `aria-label="context menu"` | NEW `workspace.explorer.contextMenuAria` (needs `useTranslation` import — no hook present) | 컨텍스트 메뉴 | Context menu |

### store/workspace.ts (defaultTitle — tab titles)
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 615 | `'버전 히스토리'` | REUSE `workspace.versionHistory.title` | 버전 히스토리 | Version history |
| 616 | `'배포'` | REUSE `workspace.deploy.tabTitle` | 배포 | Deploy |
| 617 | `'일반 설정'` | NEW `settings.generalTabTitle` (shared w/ SettingsView 31) | 일반 설정 | General settings |
| 618 | `'작업 흐름 규칙'` | REUSE `settings.tabWorkflowRules` (verify) | 작업 흐름 규칙 | Workflow rules |
| 619 | `'MCP 서버'` | REUSE `settings.tabMcp` (verify) | MCP 서버 | MCP servers |
| 620 | `'훅'` | REUSE `settings.tabHooks` (verify) | 훅 | Hooks |

> NOTE: `store/workspace.ts` `defaultTitle` is a plain function, not a component — it cannot
> call the `useUserModeT` hook. Resolve via `i18n.t(...)` imported from the i18n singleton
> (`src/i18n`), or refactor so titles are resolved at render time in the consuming component.
> See open_questions.

### store/poEvents.ts (event-driven UI strings)
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 120 | `'확인 필요'` (openTab title) | REUSE `workspace.userVerify.tabTitle` (verify) | 확인 필요 | Verification needed |
| 125 | `${description} 후 체크` | NEW `workspace.userVerify.todoSuffix` (interp `{{description}}`) | {{description}} 후 체크 | Check after {{description}} |

> Same hook-availability caveat as `store/workspace.ts` — resolve via the `i18n` singleton.

### lib/version-id.ts
| line | current | proposed key | ko | en |
|---|---|---|---|---|
| 16 | `VERSION_ID_HINT_KO = '버전 이름 형식: v1 또는 v0.1'` | NEW `app.versionId.hint` | 버전 이름 형식: v1 또는 v0.1 | Version name format: v1 or v0.1 |

> The `_KO` constant suffix implies a hardcoded-locale design smell; replace consumers with the
> resolved key. Verify the single consumer (`NewProjectModal` versionInit) and rewire.

## Acceptance

- [ ] All **49** enumerated sites converted to `t()` / `tMode()` (use `tMode` for the
      `TicketDetailTab` status/rail labels that get `.dev` variants; `t()` elsewhere).
- [ ] Every NEW key added to BOTH `ko.json` and `en.json` — key set is **identical** across
      the two files (parity). No key present in one locale and missing in the other.
- [ ] REUSE sites point at an existing key whose rendered text matches the prior hardcoded
      string (verify wording before reusing; if it diverges, mint a NEW key instead).
- [ ] Interpolation values use named placeholders (`{{n}}`, `{{persona}}`, `{{slug}}`, …),
      not positional; no string concatenation of translated fragments.
- [ ] `store/workspace.ts` + `store/poEvents.ts` non-component sites resolve via the `i18n`
      singleton (not the hook).
- [ ] `pnpm tsc --noEmit` green (run from `packages/gui` or repo root per workspace config).
- [ ] No remaining hardcoded user-visible Korean/English literal in the swept set
      (re-run: `grep -rnE "[가-힣]" packages/gui/src --include='*.tsx' --include='*.ts' | grep -v locales` returns only comments; the attribute-literal grep is clean).
- [ ] (Recommended, qa:false) Light visual pass in ko AND en: tab titles, QuickOpen legend/footer,
      gate chip, promotion card, deploy/version-history cards, MCP modal, zoom/refresh tooltips.

## Plan

**Key-naming convention**
- Namespace by surface, mirroring existing tree: `app.*` (pre-workspace: home, onboarding,
  newProject, github, errorBoundary, versionId), `workspace.*` (in-workspace), `settings.*`,
  `common.*` (cross-surface atoms: `cancel`, `next`, `retry`, `loading`, + new `close`,
  `dismiss`).
- Sub-namespace by component/feature: `workspace.quickOpen.*`, `workspace.gate.*`,
  `workspace.promotion.*`, `workspace.ticketDetail.*`, `workspace.zoom.*`,
  `workspace.versionHistory.deploy.*`, `workspace.mermaid.*`, `settings.mcp.*`.
- Shared atoms get a `workspace.common.*` home: `readOnly`, `fileLoadError`.
- `.dev` suffix ONLY where dev-mode wording legitimately differs (jargon: `blocker`,
  `qa_status`, `action`, `working`/`idle`) — see open_questions.
- camelCase leaf keys, matching existing convention.

**Conversion order** (low-risk shared atoms first, so later files just reuse):
1. Add shared `common.*` atoms (`close`, `dismiss`) + `workspace.common.{readOnly,fileLoadError}`.
   Convert their consumers: BackgroundTaskSegment, SessionHealthBanner, the three Artifact*/Read-only sites.
2. REUSE-only files (no new keys, just wiring): BrowserTab, the openTab-title sites in
   SidePanelVersionList / store/workspace.ts / store/poEvents.ts, SettingsView, QuickOpenPalette
   duplicates.
3. Self-contained NEW-key components: ZoomControls, LeftSidebar, StatusBar, TodoListPanel,
   RateLimitBanner, MermaidBlock, ErrorBoundary.
4. Larger feature blocks: GitHubOAuthFlow, NewProjectModal, HomeView, DesignStageView,
   PromotionCard, PendingGateChip, ArtifactsPane, SidePanel* version widgets, version-history cards.
5. TicketDetailTab last (largest, dev-variant decisions) + lib/version-id.ts.
6. Run `tsc --noEmit`, then the verification greps, then visual pass.

**Cap**: none. All discovered user-visible sites are enumerated (49 conversion sites across
33 files; some sites are REUSE-only). Not capped.

## Open questions

1. **`.dev` variants for TicketDetailTab** — status/rail labels embed dev jargon
   (`차단 — blocker 해소 대기`, `qa 검증 대기 (qa_status: pending)`, `완료 — 다음 action 없음`,
   `working · 진행 중`, `idle · 세션 live`). Per the resolver, planner-mode base should be
   jargon-free and dev-mode `.dev` keeps the technical wording. Confirm we add `.dev` for:
   `statusBlocked`, `statusUserVerify`, `statusQaPending`, `statusDone`, `railActive`,
   `railIdle`. (Ticket assumes yes; base = planner-friendly, `.dev` = current jargon wording.)
2. **Example-value placeholders** — `NewProjectModal` `my-saas`, `McpServerModal`
   `npx @example/mcp-server` / `value`. These are literal format examples, not UI copy.
   Localize them or leave as-is? Ticket currently EXCLUDES them.
3. **Non-component string resolution** — `store/workspace.ts` `defaultTitle` and
   `store/poEvents.ts` handlers run outside React, so they can't use `useUserModeT`. Confirm
   the preferred pattern: call the `i18n` singleton's `t()` directly, or push title-resolution
   up into the rendering component? Ticket assumes the i18n-singleton approach.
