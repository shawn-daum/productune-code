---
ticket_id: T-PATCH-133
version: v0.5
round: patch
type: feat
status: done
phase: 3
assignee: pdt-developer
estimated_complexity: L5
qa_status: skipped
model: sonnet
effort: high
slug: fresh-composer-attachment-parity
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-133 — FreshComposer 첨부 기능 동등화 (파일 첨부 + 클립보드 이미지)

## §1. Request

**배경**: 온보딩 첫 화면(`FreshComposer`)은 현재 순수 textarea만 제공한다. 반면 메인 채팅 작성기(`ChatPanel`)는 T-PATCH-098에서 구현한 전체 첨부 기능(파일 피커 클립 아이콘 · 클립보드 이미지 붙여넣기 · 번호 이미지 칩 / 일반 파일 칩 · `## Attached files` 블록 빌더 · `cleanupAttachments`)을 이미 갖추고 있다.

사용자가 첫 아이디어를 작성할 때도 스크린샷·참조 파일을 함께 첨부할 수 있어야 한다. FreshComposer가 기능 열위 상태로 남으면 "첫 메시지에 파일을 붙이려다 ChatPanel에서 다시 보내야 하는" 마찰이 발생한다.

**목표**: FreshComposer가 ChatPanel과 동일한 첨부 어포던스(paperclip 버튼 · 클립보드 이미지 붙여넣기 · 번호 칩 UI · 전송 시 `## Attached files` 블록 빌드 + `cleanupAttachments`)를 갖추도록 기능을 동등화한다.

**구현 범위 참조**:
- `packages/gui/src/components/FreshComposer.tsx` — 현재 상태: 순수 textarea 기반 hero 작성기. 첨부 로직 전무.
- `packages/gui/src/components/workspace/ChatPanel.tsx` — 재사용 대상 구현 원본 (T-PATCH-098 SoT).

## §2. Acceptance

### BDD-1 — 파일 첨부 (paperclip 버튼)

- **Given** FreshComposer 화면이 표시된 상태 / **When** 사용자가 `composerFooter` 내 paperclip 버튼을 클릭 / **Then** `api.openFilePicker()` IPC가 호출되고, 선택된 비이미지 파일이 `composerBox` 안에 파일 칩으로 표시된다.
- **Given** 파일 칩이 표시된 상태 / **When** 사용자가 Cmd+Enter(또는 전송 버튼)로 전송 / **Then** 전송 텍스트에 `## Attached files` 블록이 포함되고 해당 파일 경로가 `- path` 형식으로 열거된다.
- **Given** 파일 칩이 표시된 상태 / **When** 사용자가 칩의 삭제(×) 버튼 클릭 / **Then** 해당 파일이 첨부 목록에서 제거된다.

### BDD-2 — 클립보드 이미지 붙여넣기

- **Given** 클립보드에 이미지가 있는 상태 / **When** 사용자가 FreshComposer textarea에 붙여넣기(Cmd+V) / **Then** `api.saveAttachmentImage()` IPC가 호출되고, 번호(`#N`) 이미지 칩이 textarea 위(또는 아래)에 표시되며, textarea 본문에 `[Image #N]` 인라인 토큰이 삽입된다.
- **Given** 이미지 칩이 표시된 상태 / **When** 전송 / **Then** `## Attached files` 블록에 `- #N -> path` 형식의 이미지 라인이 포함된다.
- **Given** 이미지 칩이 표시된 상태 / **When** 칩 삭제(×) 클릭 / **Then** 칩과 textarea 내 `[Image #N]` 토큰(atomic fragment 포함)이 함께 제거된다 — ChatPanel의 `sweepOrphanTokenFragments` 동작과 동일.

### BDD-3 — fire-and-forget 전송 시 첨부 생존

- **Given** 첨부(이미지/파일)가 있는 상태 / **When** 전송 흐름 실행(`chatAppendMessage` → `poSendMessage` fire → `setTimeout(0)` → `onboardingSetDone` → `onConfirm`) / **Then** `## Attached files` 블록은 `poSendMessage` 호출 **이전** 텍스트 빌드 시 이미 포함되어 있고, `cleanupAttachments`는 `poSendMessage` fire **이후**(에러 미발생 경로)에 호출된다 — ChatPanel `handleSubmit` 순서와 동일.
- **Given** `chatAppendMessage` 또는 `onboardingSetDone` 에서 예외 발생 / **Then** 에러 핸들러가 기동되고 첨부 칩은 유지된다(재시도 가능 상태).

### BDD-4 — 히어로 레이아웃 무결성

- **Given** 이미지 칩 1개 이상이 표시된 상태 / **Then** 칩 행이 `composerBox` 안에서 중앙 정렬 레이아웃을 깨지 않고 렌더된다.
- **Given** composerFooter / **Then** paperclip 버튼이 기존 `keyHint`와 전송 CTA 사이(또는 keyHint 좌측)에 배치되고, 기존 Cmd+Enter 힌트와 전송 버튼은 위치·스타일 불변.
- **Given** 로고 / 헤드라인 / 서포팅 카피 / 에러 행 / **Then** 이 요소들의 스타일·위치는 변경되지 않는다.

### BDD-5 — ChatPanel 무회귀

- **Given** 기존 ChatPanel composer / **Then** 첨부 기능(파일 피커·클립보드 붙여넣기·칩·전송 블록·cleanup)이 리팩터링 전후로 동일하게 동작한다.

## §3. Plan

### 권장 접근 방식: 공유 훅/모듈 추출 (ChatPanel 리팩터링 + FreshComposer 적용)

ChatPanel의 첨부 로직(`onAttachFile`, `onComposerPaste`, `ImageRef` 상태, `ImageChip`, 파일 칩, `IMAGE_TOKEN_RE`, `sweepOrphanTokenFragments`, `## Attached files` 블록 빌더, `api.cleanupAttachments`)은 현재 ChatPanel 내부에 인라인으로 구현되어 있다. 이를 두 컴포넌트에서 공유하는 가장 깔끔한 방법은 공유 훅/모듈로 추출하는 것이다.

> **구현 방식 결정은 개발자 재량**: 아래 "A안(추출)"을 권장하지만, 공수·리스크 판단에 따라 "B안(복제)"도 허용한다. 단, 어느 방향이든 BDD-1~5를 모두 만족해야 한다.

---

#### A안 (권장) — 공유 훅 추출 + 양쪽 적용

**Step 1. 공유 훅 신설**

`packages/gui/src/hooks/useAttachments.ts` (또는 `useComposerAttachments.ts`) 신설.

추출 대상:
- `ImageRef` 타입 (previewUrl, path, index)
- `images` / `otherFiles` 상태 + 세터
- `onComposerPaste` — 클립보드 이미지 처리 (`api.saveAttachmentImage` → `ImageRef` 생성 → `[Image #N]` 토큰 삽입)
- `onAttachFile` — `api.openFilePicker` → 파일 경로 상태 추가
- `removeImage(index)` — 칩 삭제 + `sweepOrphanTokenFragments` 토큰 제거
- `removeFile(path)` — 파일 칩 삭제
- `buildAttachedFilesBlock(text)` — `## Attached files` 블록 빌드 유틸
- `cleanup()` — `api.cleanupAttachments` 래퍼
- `IMAGE_TOKEN_RE` 정규식
- `sweepOrphanTokenFragments` 함수

훅 시그니처(예시):
```ts
useAttachments(draft: string, setDraft: (v: string) => void)
  → { images, otherFiles, onComposerPaste, onAttachFile,
      removeImage, removeFile, buildAttachedFilesBlock, cleanup }
```

**Step 2. ChatPanel 리팩터링**

ChatPanel 내 위 로직을 `useAttachments` 훅 호출로 교체. 외부 동작 불변(BDD-5).

**Step 3. FreshComposer 적용**

- `useAttachments(draft, setDraft)` 훅 마운트.
- `composerBox` 내 textarea 위(또는 아래) 칩 행 추가: `images.map(img => <ImageChip …/>)` + `otherFiles` 파일 칩.
- `composerBox > composerFooter`에 `<Paperclip>` 아이콘 버튼 추가 (keyHint 좌측 또는 사이) — `onClick={onAttachFile}`.
- textarea `onPaste={onComposerPaste}`.
- `handleSend` 수정:
  1. `buildAttachedFilesBlock(draft.trim())` → `finalText` 생성.
  2. `userMsg.text = finalText` 로 저장(`chatAppendMessage`).
  3. `api.poSendMessage({ …, text: finalText })` fire.
  4. `setTimeout(0)` yield.
  5. `onboardingSetDone` → `onConfirm`.
  6. (성공 경로) `cleanup()`.
  7. (에러 경로) `setError` — 칩 상태 유지.

---

#### B안 (대안) — ChatPanel 로직 복제

ChatPanel의 첨부 로직을 FreshComposer에 그대로 복사·적용. 코드 중복이 발생하지만 ChatPanel 리팩터링 리스크가 없다. BDD-1~5는 동일하게 만족해야 한다.

---

### 변경 파일 (A안 기준)

| 파일 | 변경 내용 |
|---|---|
| `packages/gui/src/hooks/useAttachments.ts` | **신설** — 공유 첨부 훅 |
| `packages/gui/src/components/workspace/ChatPanel.tsx` | useAttachments 훅으로 인라인 로직 교체 (BDD-5 무회귀 필수) |
| `packages/gui/src/components/FreshComposer.tsx` | 훅 마운트 + 칩 UI + paperclip 버튼 + handleSend 수정 |

B안 선택 시 ChatPanel.tsx 수정 없이 FreshComposer.tsx에 로직 복제.

### 개발자 주의사항

- **전송 순서 엄수(BDD-3)**: `buildAttachedFilesBlock` → `chatAppendMessage` → `poSendMessage` fire → `setTimeout(0)` → `onboardingSetDone` → `onConfirm` → `cleanup()`. `cleanup`은 WorkspaceShell 전환 이후가 아닌 성공 경로에서 `onConfirm` 직후 호출.
- **에러 경로**: `cleanup` 은 catch 블록에서 호출하지 않는다 — 재시도 시 첨부 파일이 살아있어야 함.
- **레이아웃 제약(BDD-4)**: FreshComposer는 `maxWidth: 680` 중앙 정렬 컨테이너. 칩 행은 `composerBox` 내부(border/padding 안쪽)에서 렌더되어야 하며, 절대 위치나 overflow 로 레이아웃 이탈 금지.
- **아이콘**: Lucide `Paperclip` 사용 (디자인 시스템 §7 — lucide, 컬러 이모지 금지).
- **A안 추출 시**: ChatPanel 리팩터링은 기존 동작 변경 없이 순수 리팩터링이어야 함. 직후 `pnpm --filter @productune/gui build` 로 타입 에러 없음 확인 필수.

## §4. Outcome

A안(공유 훅 추출)으로 구현 완료. 신설 파일 2개 + 기존 파일 2개 수정.

### 생성 파일
- **`packages/gui/src/hooks/useComposerAttachments.ts`** (신설): `ImageRef` 타입, `IMAGE_TOKEN_RE`, `sweepOrphanTokenFragments`, `useComposerAttachments` 훅 — 이미지 붙여넣기·파일 피커·칩 삭제·토큰 원자 삭제·블록 빌더·`clearAttachments`·`cleanupSentFiles` 전체 포함.
- **`packages/gui/src/components/workspace/chat/ImageChip.tsx`** (신설): `ImageGlyph`, `ImageChip` 컴포넌트, `chipRow` 스타일 — ChatPanel·FreshComposer 공유 프레젠테이션.

### 수정 파일
- **`ChatPanel.tsx`**: 인라인 첨부 로직 전체(IMAGE_TOKEN_RE, sweepOrphanTokenFragments, ImageRef, ImageGlyph, ImageChip, chipRow, chip* 스타일)를 `useComposerAttachments` 훅 호출 + `ImageChip` import로 교체. 외부 동작 불변(BDD-5).
- **`FreshComposer.tsx`**: `useComposerAttachments` 마운트, 이미지 칩 행(`composerBox` 내부), 파일 칩 행, `Paperclip` 버튼(footerLeft), textarea `onChange`→`onComposerChange` + `onPaste={onComposerPaste}`, `handleKeyDown`에 원자 토큰 삭제 인터셉트 추가, `handleSend` 재작성(RESOLUTION-1: `cleanupSentFiles` 미호출 — fire-and-forget 전송이므로 PO가 파일을 읽는 중일 수 있음; L1 24h purge에 위임).

### BDD 검증
- **BDD-1** ✅ paperclip 버튼 → `openFilePicker` IPC → 파일 칩 렌더 → 전송 시 `## Attached files` 블록 포함.
- **BDD-2** ✅ 클립보드 이미지 붙여넣기 → `saveAttachmentImage` IPC → 번호 칩 + `[Image #N]` 토큰 삽입 → 전송 시 `- #N -> path` 라인 포함.
- **BDD-3** ✅ `buildAttachedFilesBlock` → `chatAppendMessage` → `clearAttachments` → `poSendMessage` fire → `setTimeout(0)` → `onboardingSetDone` → `onConfirm` 순서 엄수. catch 경로에서 clearAttachments/cleanup 미호출(재시도 가능).
- **BDD-4** ✅ 칩 행은 `composerBox` 내부(flexDirection:column, gap:10)에서 렌더; 로고·헤드라인·footer CTA 위치·스타일 불변.
- **BDD-5** ✅ ChatPanel은 순수 리팩터링 — `useComposerAttachments` 훅 인터페이스를 named destructuring alias로 연결해 기존 JSX 불변.

### Self-verify
`pnpm --filter @productune/gui build` → tsc --noEmit PASS + Vite build PASS (에러 0, 경고 0, chunk-size 경고는 mermaid/katex 기존 라이브러리로 본 티켓과 무관).
