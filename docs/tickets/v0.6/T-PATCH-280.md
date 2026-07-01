---
ticket_id: T-PATCH-280
version: v0.6
slug: mainpane-doc-no-autorefresh
title: main pane PRD/markdown이 파일 변경 후 자동 갱신 안 됨 — load-once, 껐다켜야 보임
type: impl
status: user-verify
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui
estimated_complexity: L2
risk_flags: [gui]
created_at: 2026-06-30T23:17:27Z
---

# T-PATCH-280: main pane 문서 자동 갱신

shawn 보고(enneagram-mentor): PRD가 초안 생기기 전에 main pane에 떠서 placeholder만 보임. designer가 PRD 완성해도 그대로 → **앱 껐다 켜야(remount)** PRD가 보임. PO가 main pane 내용을 갱신(새로고침)해줘야 함.

## 근본 원인 (확정)
`MarkdownViewer.tsx:215`의 `load()`가 `useEffect(…, [load])`(`:228`)로 **마운트/`load` 콜백 변경 시 1회만** 실행. 파일이 디스크에서 바뀌어도(designer가 PRD 작성) re-load 트리거 없음 → 열린 탭은 옛 내용(placeholder) 유지. remount(앱 재시작) 시에만 다시 읽음.

## 재활용 가능한 기존 패턴
- `ipc/ticketsWatch.ts` — `fs.watch(docs/tickets/<v>) → 'tickets:changed'` push (debounce + broadcast). 문서용으로 미러 가능.
- `preload.ts:188 onPoStateChanged` — `{prdReady, prdPath}` 동반 신호. PRD ready 전이 시 발화되므로, 열린 PRD 탭 invalidate 트리거로 직접 활용 가능.

## Acceptance
- **AC-1**: main pane에 PRD/markdown 탭이 열려 있는 상태에서 해당 파일이 디스크에서 갱신되면 **앱 재시작 없이** 탭 내용이 자동 갱신(placeholder → 실제 PRD). enneagram-mentor에서 재현·확인.
- **AC-2**: 갱신은 그 파일을 보는 탭에만(엉뚱한 탭 reload 금지). debounce로 연속 write 1회 수렴.
- **AC-3**: 읽기 중 에러/부분 write 중간 상태에서 깨지지 않음(빈 내용으로 덮어쓰지 않음 — 마지막 정상 내용 유지하거나 로딩 표시).
- **AC-4**: 무회귀 — 다른 탭 종류(ticket/artifact/html), 수동 탭 전환 동작.

## Plan (개발자)
dev: 둘 중 택1 또는 조합. (A) docs 파일 watch IPC 신설(ticketsWatch 미러) → 'docs:changed'(path) push → MarkdownViewer가 자기 absPath 매칭 시 `load()` 재실행(refresh trigger). (B) `onPoStateChanged(prdReady)` 구독해 열린 PRD 탭 invalidate. 범용성은 A(모든 문서 탭), 최소변경은 B(PRD 한정). MarkdownViewer에 refresh nonce/key 추가해 `load` 재트리거. AC-3 위해 read 실패/빈 결과는 기존 내용 보존. qa: PRD 탭 열어둔 채 PRD 파일 변경 → 자동 갱신 확인.

## Outcome
**Code-complete + QA CLEAN (static). Pending user live-confirm.**

Root cause: `MarkdownViewer.tsx` `load()` ran once (useEffect([load])) — no file-watch, so disk changes didn't re-render until remount.

Fix (option A — generic, covers any docs/*.md tab):
- NEW `electron/ipc/docsWatch.ts` — `fs.watch(<projectDir>/docs, recursive)` filtered to `.md`, 300ms debounce, broadcasts `docs:changed` {projectDir, absPath}. Mirrors `ticketsWatch.ts`. Kept separate from state.ts's prd-signal watcher (that one dedupes on {v,p,prdReady} → would NOT fire on a content change to an already-ready PRD = exactly AC-1's case).
- `main.ts`: registerDocsWatch() + cleanup. `preload.ts`: watchDocs()/onDocsChanged(). `WorkspaceShell.tsx`: arms watchDocs alongside watchPoState.
- `MarkdownViewer.tsx`: subscribes onDocsChanged; changed absPath == own absPath → SILENT re-run of load() (no spinner). AC-3: empty/partial/error read KEEPS last-good content. Skips reload while editing (no draft clobber). Inline-body viewers (absPath='') never match.

QA (qa-bugfix): all 4 AC met statically; CLEAN. build PASS.

**Live-confirm REQUIRED (user):** open the PRD tab while it's still a placeholder, let the designer finish writing PRD.md → tab auto-refreshes to the real PRD WITHOUT app restart.

## Persona Activity
PO orchestrated. dev-bugfix (impl) · qa-bugfix (verify).

## Persona Activity
(PO-managed)
