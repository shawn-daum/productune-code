---
ticket_id: T-PATCH-098
title: "Chat 입력창 클립보드 이미지 붙여넣기 — paste→디스크 저장→첨부 경로로 PO 전달"
version: v0.5
round: patch
type: feature
status: review
assignee: pdt-developer
estimated_complexity: L3
model: sonnet
effort: high
risk_flags: none
slug: composer-image-paste
qa_status: pass
qa_loops: 2
area_tags: [gui/chat, gui/composer, infra/ipc]
created_at: 2026-06-10
---

| T-PATCH-098 | composer-image-paste | review |

> §4.d implemented (cmux-style inline image reference): paste inserts a stable
> `[Image #N]` token at the textarea cursor; numbered chips above the composer;
> bidirectional sync with textarea as source of truth; `## Attached files` becomes a
> `#N → path` map. See §4.d acceptance + outcome below.

## §1 Request

사용자 지시 (verbatim):

> "input창 이미지 클립보드 붙여넣기 기능"

### 현재 상태 (코드 점검 결과)

대상 파일: `packages/gui/src/components/workspace/ChatPanel.tsx`

- 채팅 composer 는 단순 `<textarea>` (~478-487 라인, `onChange → setDraft`) 이며 **`onPaste` 핸들러가 없음**. 따라서 이미지 클립보드 붙여넣기는 현재 전혀 동작하지 않는다.
- 전송 경로: Cmd+Enter → `handleSubmit` (~122-164 라인) → `appendMessage` + `api.chatAppendMessage(projectDir, userMsg)` → `api.poSendMessage({ projectDir, text, resume })`.
- **파일 첨부 경로는 이미 존재**: paperclip 버튼이 `window.api.openFilePicker()` 를 호출하고, 첨부된 파일들은 메시지 본문 앞에 markdown `## Attached files` **경로(path) 목록**으로 prepend 된다 (~122-147 라인). 즉 파일은 **바이너리가 아니라 path 문자열**로 전달된다.
- PO 메시지 포맷은 현재 **text 만** 운반한다. 관련 파일: `src/lib/injectUserMessage.ts`, `electron/ipc/po.ts`, `electron/po-runner.ts`.
- 이미지/바이너리 지원은 **코드 어디에도 존재하지 않음** (net-new).

### 채택 방향 (designer 결정 — 가장 단순하고 견고한 경로)

클립보드 이미지를 새 처리 파이프라인으로 다루지 않고, **기존 "첨부=경로" 메커니즘을 재사용**한다:

> paste → 이미지 바이트를 프로젝트 attachments 디렉터리에 PNG 로 저장 (신규 electron IPC) → 반환된 path 를 기존 `attachedFiles` 에 추가 → 전송 시 paperclip 과 동일하게 `## Attached files` path 로 PO 에 전달.

근거: `claude --agent` 는 file path 형태의 이미지 입력을 인지할 수 있고, PO 가 이미 path 를 소비하므로 PO/runner 포맷 변경이 불필요하다. 이미지가 텍스트가 아닌 경로로 흐르므로 메시지 직렬화/IPC 페이로드도 기존과 동일하게 유지된다.

## §2 Acceptance

- [x] 입력창에서 이미지 클립보드 paste 시 composer 에 **thumbnail(미리보기)** 이 표시된다.
- [x] 표시된 thumbnail 에 **remove(제거) 컨트롤**이 있고, 제거하면 미리보기와 첨부 항목이 함께 사라진다. (기존 attached-files 팝업과 일관된 UI)
- [x] 전송 시 PO/claude agent 가 붙여넣은 이미지를 **인지**한다 (기존 paperclip 첨부와 동일하게 path 로 전달).
- [x] 이미지 paste 와 **동시에 텍스트 입력**이 가능하다 — 텍스트 + 이미지 첨부가 한 메시지로 함께 전송된다.
- [x] **비이미지 paste** (일반 텍스트/URL 등) 는 기존 textarea 텍스트 paste 동작을 그대로 유지한다 (회귀 없음).
- [x] 붙여넣은 이미지가 프로젝트 attachments 디렉터리에 PNG 파일로 영속화되고, `attachedFiles` 에 해당 path 가 추가된다.
- [x] 저장 실패/클립보드에 이미지 없음 등의 경우 textarea 입력이 깨지지 않고 안전하게 무시된다.

## §3 Out of scope

- **드래그 앤 드롭(drag-and-drop)** 으로 이미지/파일 추가 — 본 티켓은 클립보드 paste 만.
- **다중 이미지** 동시 paste 처리 — 1회 paste = 이미지 1개 기준. (복수 이미지 항목은 첫 번째만 처리하거나 후속 티켓 대상)
- PO/runner 메시지 포맷을 binary/multimodal 로 확장하는 작업 — 본 티켓은 기존 path 메커니즘 재사용에 한정.
- 이미지 리사이즈/압축/포맷 변환(PNG 외) 및 thumbnail 캐싱 최적화.
- attachments 디렉터리 정리(GC)/용량 제한 정책.
- 외부 URL 이미지의 자동 다운로드.

## §4 Implementation plan

대상 파일: `packages/gui/src/components/workspace/ChatPanel.tsx` (+ 신규 electron IPC, preload 노출)

1. **onPaste 핸들러 (composer)** — `<textarea>` (~478-487 라인) 에 `onPaste` 추가.
   - `e.clipboardData.items` 를 순회하여 `item.kind === 'file' && item.type.startsWith('image/')` 인 항목을 탐지.
   - 이미지 항목이 있으면: `e.preventDefault()` 로 기본 텍스트 paste 동작을 막고, `item.getAsFile()` → `Blob`/`ArrayBuffer` 추출.
   - 이미지 항목이 **없으면** preventDefault 하지 않고 기존 텍스트 paste 동작을 그대로 통과시킨다 (비이미지 회귀 방지).

2. **신규 IPC — 이미지 디스크 영속화** ⚠️ **electron-main 작업 (dev 주의)**
   - `electron/ipc/` 에 신규 채널 (예: `attachments:saveImage`) 추가: 인자 `{ projectDir, bytes(ArrayBuffer/base64), ext }`.
   - main 프로세스에서 `<projectDir>/.productune/attachments/` (또는 기존 프로젝트 규약에 맞는 attachments 디렉터리) 하위에 충돌 없는 파일명(예: `pasted-<timestamp>.png`)으로 PNG 저장 후 **절대 path 반환**.
   - preload (`window.api`) 에 해당 IPC 를 노출 — 기존 `openFilePicker` 노출 방식과 동일 패턴 사용.
   - ⚠️ **dev 플래그**: clipboard 이미지 디코딩은 renderer 에서 `Blob.arrayBuffer()` 로 충분하므로 electron `clipboard` 모듈 직접 접근은 불필요. 단, 파일 쓰기/디렉터리 생성·경로 검증은 반드시 main 프로세스 IPC 에서 처리 (renderer 직접 fs 접근 금지).

3. **attachedFiles 연동** — 저장 IPC 가 반환한 path 를 기존 `attachedFiles` 상태 배열에 push.
   - 이후 `handleSubmit` (~122-147 라인) 의 기존 `## Attached files` path prepend 로직이 그대로 이미지 path 를 포함하게 됨 → **PO 전달 경로 변경 불필요**.
   - paperclip 으로 추가한 파일과 paste 로 추가한 이미지가 동일 배열을 공유하므로 전송/제거 로직 일원화.

4. **composer UI — thumbnail + remove** — paste 된 이미지를 attached-files 팝업과 일관된 형태로 미리보기.
   - 첨부 항목이 이미지 path 인 경우 `file://` 또는 IPC 로 읽은 data URL 로 작은 thumbnail 렌더 (아이콘은 lucide-react, 컬러 emoji 금지).
   - 각 thumbnail 에 remove 컨트롤(예: lucide `X`) → 클릭 시 `attachedFiles` 에서 제거. (디스크 파일 정리는 out-of-scope, 항목만 제거)

5. **PO 전달 경로 확인** — `injectUserMessage.ts` / `electron/ipc/po.ts` / `electron/po-runner.ts` 는 **변경하지 않음**. path 기반 첨부가 기존 포맷 그대로 흐르는지만 검증.

### §4.b QA-feedback redesign — composer attachment chip (cmux-style)

> QA(유저) 피드백: paste 된 이미지가 `file://` thumbnail (`fileUrl()`/`thumbImg`,
> ~938–975행) 로 렌더되는데 Electron renderer 가 `file://` 을 차단 → **깨진 이미지
> 아이콘(green torn-image glyph) + `pasted-178108…` + X** 로 보인다. 유저 요청 =
> "cmux 스타일 attachment chip" (raster preview 가 아니라 깔끔한 reference token).
> 본 절은 §4 의 4번(thumbnail) 항목을 **깨질 수 없는 chip** 으로 대체한다.

#### 1) Source 전략 — 깨진 glyph 가 원천적으로 불가능하게

`file://` src 는 폐기. 두 옵션 중 **A 채택**:

- **A. icon-only chip (default · 채택)** — preview 를 raster 로 그리지 않는다. lucide
  `Image` 아이콘 tile + 라벨 + X 만. img element 자체가 없으므로 broken-glyph 가
  구조적으로 불가능. cmux / Claude Code 의 paste reference token 과 동일한 멘탈모델
  (이미지는 "첨부됨" 사실만 표시, 미리보기는 비핵심). 추가 IPC 불필요 — 가장 견고.
- **B. blob preview (옵션 · 기록만)** — paste 시점에 `item.getAsFile()` 의 bytes 로
  `URL.createObjectURL(blob)` 를 만들어 그 object URL 을 img src 로 쓰면 renderer 내부
  리소스라 `file://` 차단을 우회해 **실제 썸네일**도 가능. 단 (i) blob URL 생명주기 관리
  (`revokeObjectURL` on remove/unmount) (ii) paste 한 bytes 를 chip 상태에 보관해야 함
  → 복잡도 증가. 본 round 는 견고성 우선이라 보류. 후속 enh 로 A 의 tile 자리에만
  blob preview 를 끼우면 레이아웃 변경 0 으로 업그레이드 가능 (아래 layout 이 이를 보장).

> 결론: **A (icon-only chip)**. broken-glyph 재발 0, 추가 IPC 0, B 로의 업그레이드
> 경로를 layout 으로 열어둔다.

#### 2) Chip anatomy & tokens

가로 pill 1개 = `[ tile ][ label ][ X ]`. 단일 행, 높이 고정.

| 부위 | spec (design-system token) |
|---|---|
| chip container | bg `--surface-subpanel`, border 1px `--border-default`, radius `--radius-pill`(20px 아님 → 아래 주), height **28px**, padding `--space-1`(좌) `--space-2`(우), inline-flex, gap `--space-1-5`, max-width **180px** |
| tile (icon box) | 20×20, radius `--radius-md`, bg `color-mix(--persona-po 12%, transparent)` 아님 → **neutral** `--surface-base`, 중앙에 lucide `Image` `--icon-sm`(14) stroke `--icon-stroke-soft`(1.75) color `--text-secondary` |
| label | `metadata` recipe (`--text-sm` 12 / regular / wide / snug), color `--text-secondary`, **single-line ellipsis** (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`), flex:1 min-width 0 |
| X remove | lucide `X` `--icon-xs`(12) stroke `--icon-stroke-bold`(3, ≤12px 가독성) color `--text-muted`, hit-area 16×16, radius `--radius-full` |

> **radius 주의** — chip 28px 높이에 `--radius-pill`(20) 은 과해 보일 수 있다 →
> **`--radius-lg`(6)** 사용(message bubble 과 동일 계층감). chip 안의 tile(`--radius-md`)
> 과 X hit-area(`--radius-full`)는 §5 "다른 계층" 허용 범위.

**label 텍스트** — `pasted-178108….png` 같은 raw 파일명 노출 금지. 한국어 모드 `이미지`
+ 짧은 식별자, 또는 그냥 `이미지` (보호어 아님, §10 자유 번역). 영문 `image`. 파일명은
`title` 속성(hover tooltip)으로만 노출.

#### 3) Hover / remove affordance (§1.5.4 Feedback · §1.5.5 Escape)

- chip hover → border `--border-strong`, transition `--motion-fast`.
- X hover → bg `--surface-base`, X color `--text-secondary`(한 단 밝게, §8.1 패턴).
- X 클릭 → 해당 항목 `attachedFiles` 에서 제거(기존 §4-4 로직). 디스크 파일 정리는
  out-of-scope 유지.
- focus-visible(키보드) — chip 자체는 비포커스, X 버튼만 `outline 2px --accent` offset 2px.

#### 4) 다중 이미지 정렬

§3 Out of scope 가 "1 paste = 1 image" 이나 paperclip 으로 복수 첨부 가능하므로 multi
정렬을 명시한다: chip 들은 composer textarea **위 한 줄**에 `flex-wrap: wrap`, gap
`--space-2`(행·열 동일). 한 줄 넘치면 줄바꿈. 이미지 chip 과 기존 non-image file chip 은
같은 wrap row 를 공유(전송/제거 일원화, §4-3 정합). chip row 와 textarea 사이 `--space-2`.

#### 5) ASCII mockup

```
┌─ composer ────────────────────────────────────────────────┐
│  ┌──────────────────┐ ┌──────────────────┐                 │  ← chip row (flex-wrap)
│  │ [▦] 이미지     ✕ │ │ [▦] 이미지     ✕ │                 │
│  └──────────────────┘ └──────────────────┘                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 메시지를 입력하세요…                                  │   │  ← textarea
│  │                                                      │   │
│  └────────────────────────────────────────────────────┘   │
│                                          [📎]  [ 전송 ]      │
└────────────────────────────────────────────────────────────┘

chip 확대:
  ┌─────────────────────────────┐
  │ [▦]  이미지            ✕   │   height 28 · radius-lg · bg subpanel
  └─────────────────────────────┘
   tile      label(ellipsis)  X
   20×20     metadata/secondary  icon-xs/muted

  [▦] = lucide `Image` (icon-sm, stroke 1.75, text-secondary) in 20×20 neutral tile
  ✕   = lucide `X` (icon-xs, stroke 3, text-muted → hover text-secondary)
```

#### 6) 구현 메모

- `fileUrl()` / `thumbImg`(~938–975행)의 `file://` img 경로 **제거**. img element 미사용
  = broken-glyph 재발 0.
- chip 은 attachment 항목 타입(image vs other)과 무관하게 동일 pill 사용 가능 — image 는
  tile 에 `Image`, 기타 file 은 `Paperclip`/`FileText` 아이콘만 교체. label/remove 동일.
- (옵션 B 업그레이드 시) tile(20×20)을 그대로 `<img>` 컨테이너로 전환 → 외곽 chip
  레이아웃 변경 없음. blob URL 은 remove/unmount 에서 `revokeObjectURL`.

### §4.c QA-feedback: real thumbnail + temp storage

> QA(유저) 피드백 (verbatim 의도): §4.b 의 icon-only chip 구조는 OK 이나 (i) 붙여넣은
> 이미지를 **실제 미리보기(썸네일)로 보고 싶다**, (ii) 저장 파일은 **임시파일이어야
> 되고 무한 저장은 안 된다** ("임시파일이어야됨, 무한저장 x").
> 본 절은 §4.b 의 (1)Source 전략을 **옵션 B(blob preview)로 승격**하고, §4 의 IPC
> 영속화를 **프로젝트 영구 디렉터리 → OS temp + cleanup** 으로 교체한다. §4.b 의 chip
> anatomy/tokens/layout/hover(2·3·4절)는 **그대로 유지** — tile 안의 glyph 만 실제
> 썸네일로 교체하므로 외곽 레이아웃 변경은 0 이다 (§4.b 2)절이 보장한 업그레이드 경로).

---

#### 1) PREVIEW — renderer object-URL 썸네일 (file:// 폐기 유지)

핵심: 미리보기 소스는 **paste 시점의 bytes 로 만든 `URL.createObjectURL(blob)`**.
`file://` 도 disk read 도 쓰지 않으므로 renderer 차단/broken-glyph 가 구조적으로 불가능.
(디스크 path 는 PO 전달용으로만 쓰고, 미리보기와는 **분리**한다 — disk 파일이 temp 라
나중에 지워져도 미리보기는 영향받지 않는다.)

**a. object-URL 생성 (paste 시점)** — `onComposerPaste`(~323–358행)에서 IPC 저장 path 를
`attachedFiles` 에 push 할 때, **같은 `file` blob** 으로 object URL 도 만들어 path↔URL
매핑에 보관한다.

- 보관 위치: `attachedFiles: string[]`(path 목록) 은 PO 전달용으로 **그대로 두고**,
  미리보기 URL 은 별도 state `previewUrls: Record<string, string>`(key = 저장 path,
  value = object URL) 에 보관. → 전송/제거 일원화(§4-3)와 PO path block 은 무영향.
- 생성: `const url = URL.createObjectURL(file)` (또는 `new Blob([buf], {type})`).
  `res.ok && res.path` 성공 분기 안에서만 생성(저장 실패 시 URL 도 안 만든다 →
  orphan URL 0). `setPreviewUrls(prev => ({ ...prev, [res.path]: url }))`.

**b. 썸네일 렌더 (chip tile 안)** — §4.b 의 `chipTile`(20×20, `--radius-md`,
`--surface-base`)을 **유지하고** 내부 glyph 를 분기한다:

- `previewUrls[path]` 가 있으면 → `<img src={previewUrls[path]}>` 를 tile 에 채운다.
  tile 을 그대로 이미지 컨테이너로 사용(외곽 chip 레이아웃 변경 0, §4.b 6)절 그대로):
  - `width:'100%'; height:'100%'; objectFit:'cover'; borderRadius:'var(--radius-md)';`
    `display:'block'`. tile 자체에 `overflow:'hidden'` 추가(라운드 클립).
  - `alt=""` `aria-hidden` — label 이 이미 의미를 전달(중복 announce 방지, §접근성).
  - `draggable={false}` (tile 내 이미지 drag 방지).
- `previewUrls[path]` 가 **없으면** → 기존 `ImageGlyph()`(lucide `Image`) 폴백 유지.
  이 경로는 paperclip 으로 고른 이미지처럼 **path 만 있고 bytes 가 없는** 경우
  (= object URL 을 만들 blob 이 없음) → icon chip 으로 자연스럽게 떨어진다. broken-glyph
  재발 0(img 자체를 렌더하지 않음).

> tile 크기 결정: §4.b 의 **20×20 유지**. 28px chip height 안에서 20×20 썸네일은 충분히
> 식별 가능한 reference-token 크기이며, label+X 와의 정렬·max-width 180 을 그대로 지킨다.
> (확대가 필요하면 후속 enh 에서 tile 24×24 + chip height 32 로 동반 상향 — 본 round 는
> 레이아웃 변경 0 우선이라 20×20 고정.)

**c. object-URL 생명주기 — leak 방지 (필수)** — `createObjectURL` 은 명시적
`revokeObjectURL` 전까지 메모리에 blob 을 잡는다. 3개 시점에서 **반드시 revoke**:

| 시점 | 동작 |
|---|---|
| remove (X 클릭, `removeAttached`) | 해당 path 의 `previewUrls[path]` 를 `revokeObjectURL` 후 map 에서 delete. (chip 제거와 동시) |
| send (`handleSubmit` 성공 후 `attachedFiles` 비울 때) | 비우기 직전 **모든** `previewUrls` 값을 revoke 후 `setPreviewUrls({})`. |
| unmount | `useEffect(() => () => { Object.values(previewUrlsRef.current).forEach(URL.revokeObjectURL) }, [])` — 최신 map 을 ref 로 잡아 cleanup. |

> 구현 주의: revoke 누락 = blob 메모리 누수. remove/send 두 경로 모두에서 빠짐없이
> 돌도록, revoke 를 `removeAttached`/`handleSubmit` 안에 **함께** 묶는다(별도 호출 금지).

---

#### 2) TEMP STORAGE — OS temp + cleanup (무한 저장 폐기)

현재 `attachments:saveImage`(`packages/gui/electron/ipc/attachments.ts`)는
`<projectDir>/.productune/attachments/pasted-<ts>-<rand>.<ext>` 에 **영구** 기록 →
프로젝트 디렉터리에 무한 누적(= 유저가 지적한 문제). 이를 **OS temp 하위 + cleanup** 으로
교체한다.

**a. 저장 위치 — `app.getPath('temp')` 하위 전용 서브폴더 (채택)**

- 디렉터리: **`path.join(app.getPath('temp'), 'productune', 'pasted')`**.
  - `app.getPath('temp')` 채택 근거(vs `os.tmpdir()`): electron 권장 API 로 platform 별
    temp 를 정확히 가리키고(테스트/모킹도 용이), main 프로세스에서 이미 `app` import.
    `os.tmpdir()` 도 동등하나 electron 컨텍스트에서는 `app.getPath` 일관 사용.
  - `productune/pasted` 서브폴더로 격리 → cleanup 시 **이 폴더만** 스캔(다른 temp 파일
    오삭제 0). app 별 namespace.
- 파일명: 기존과 동일 **`pasted-<timestamp>-<rand>.<ext>`** 유지(충돌 방지 + cleanup 의
  age 판정에 timestamp/ mtime 활용).
- **path traversal/containment 가드**: 더 이상 projectDir 하위가 아니므로 containment
  기준을 **temp 서브폴더 root** 로 변경 — `resolvedDest.startsWith(tempRoot + path.sep)`
  검증. ext 화이트리스트(`IMAGE_EXTS`)·`MAX_IMAGE_BYTES`(20MB) 캡은 **그대로 유지**.
- 반환값: 기존과 동일하게 **절대 path**. → `## Attached files` path block 으로 PO 에
  흐르는 경로(§4-3/§4-5)는 **무변경**. PO 가 읽는 시점에 파일이 존재해야 하므로
  cleanup 은 그 이후로만 트리거(아래 c).

**b. cleanup 정책 — 2-layer (둘 다 적용)**

| layer | 트리거 | 동작 | 목적 |
|---|---|---|---|
| **L1 startup purge** | app ready (main 부팅 시 1회) | `productune/pasted` 안에서 **mtime 기준 N=24h 초과** 파일을 모두 unlink. 폴더 없으면 noop. | 비정상 종료/미전송 등으로 남은 **orphan** 정리. "무한 저장 x" 의 안전망. |
| **L2 post-consume delete** | 메시지 전송 완료(= PO 가 path 를 소비한 뒤) | 방금 전송한 message 의 첨부 path 들을 unlink. | 정상 흐름에서 즉시 회수 → temp 누적 최소화. |

- **N=24h 근거**: 전송 직후 회수(L2)가 정상 경로이므로 L1 은 안전망. 24h 면 같은 세션
  내 재사용/디버깅 여유 + 하루 단위 상한. (값은 main 상수 `ORPHAN_MAX_AGE_MS`.)
- L1 은 best-effort: unlink 실패(권한/사용중)는 swallow, 부팅을 막지 않는다.

**c. cleanup 시퀀싱 — PO 소비 전 삭제 금지 (핵심 안전조건)**

PO 가 path 로 이미지를 읽으므로, **PO 가 파일을 다 읽기 전에 지우면 안 된다**. L2 삭제는
반드시 전송 파이프라인이 path 를 PO 에 **넘긴 이후**로 sequence:

- 신규 IPC **`attachments:cleanup`** 추가: 인자 `{ paths: string[] }`. 각 path 가
  **temp 서브폴더(`productune/pasted`) 하위인지 containment 검증 후에만** unlink
  (projectDir 등 다른 곳의 paperclip 파일은 절대 삭제 금지 — image-from-temp 만 회수).
  실패는 swallow.
- 호출 위치: `ChatPanel.handleSubmit`(~120–164행)에서 `api.poSendMessage(...)` 가
  **resolve 된 직후**(= PO 에 메시지/ path 가 전달 완료된 뒤), 전송된 첨부 중
  **temp-image path 들만** 추려 `api.cleanupAttachments({ paths })` 호출.
  paperclip 으로 고른 비-temp 파일은 제외(유저 원본 보존).
  - temp 판별: path 가 `app.getPath('temp')/productune/pasted` prefix 인지 → renderer
    는 알기 어려우므로 **main-side containment 가드로 일원화**(renderer 는 전체 첨부 path
    를 넘기고, main 이 temp 하위만 골라 지운다). renderer 가 prefix 를 몰라도 안전.
- preview object URL revoke(§1.c send 시점)와 L2 disk cleanup 은 **독립** — URL revoke 는
  메모리, cleanup 은 disk. 순서 의존 없음(둘 다 전송 성공 후).

> 시퀀스 요약: paste → temp 저장(path 반환) + object URL(preview) → 전송 시 path 가
> PO 로 → **poSendMessage resolve 후** temp 파일 cleanup(L2) + 모든 preview URL revoke.
> 추가로 app 부팅마다 24h 초과 orphan purge(L1). → 무한 누적 0, PO read 전 삭제 0.

**d. §3 Out of scope 갱신** — 기존 §3 의 "attachments 디렉터리 정리(GC)/용량 제한 정책"
out-of-scope 항목은 **본 절(§4.c)이 부분적으로 대체**한다: temp 디렉터리 한정 cleanup(L1+L2)은
이제 in-scope. projectDir 의 paperclip 원본 GC·전역 용량 캡은 여전히 out-of-scope.

---

#### 5.c) ASCII mockup (썸네일 chip)

```
chip (preview 채워진 tile):
  ┌─────────────────────────────┐
  │ [🖼]  이미지            ✕   │   height 28 · radius-lg · bg subpanel
  └─────────────────────────────┘
   tile      label(ellipsis)  X
   20×20     metadata/secondary  icon-xs/muted
   └ object-URL <img> objectFit:cover, radius-md, overflow:hidden
   └ (bytes 없으면 lucide `Image` glyph 폴백 — §4.b 그대로)
```

#### 6.c) 구현 메모 (dev)

- `ImageChip`(~1018행): `previewUrls[path]` 있으면 `chipTile` 안에 `<img>`, 없으면
  `ImageGlyph()`. tile 에 `overflow:'hidden'` 추가. img 는 `objectFit:'cover'`/`alt=""`/
  `draggable={false}`.
- state 추가: `previewUrls: Record<string,string>` + `previewUrlsRef`(unmount cleanup).
  `onComposerPaste` 성공 분기에서 `createObjectURL`, `removeAttached`/`handleSubmit`/
  unmount 에서 `revokeObjectURL`(§1.c 표).
- `attachments.ts`: 저장 dir → `app.getPath('temp')/productune/pasted`, containment 기준
  변경, L1 startup purge 함수(`register` 시 1회 실행) + 신규 `attachments:cleanup` 핸들러.
  preload(`packages/gui/electron/preload.ts`)에 `cleanupAttachments` 노출(기존
  `saveAttachmentImage` 패턴).
- ⚠️ electron-main 변경(IPC dir/cleanup) → dev rebuild 필요. renderer fs 직접 접근 금지
  유지.

### §4.d QA-feedback: cmux-style inline image reference

> QA(유저) 피드백 (verbatim): "98 이미지 입력하면 cmux처럼 `[Image #7]` 이렇게 해줘야돼.
> 논문 참조처럼 알지? 그리고 이 영역을 지워버리면 아래 첨부에서도 지워주고. 그러니까
> 이미지1 이런식으로 가야하는거지."
>
> 의도 = cmux / Claude-Code paste 모델 채택 (학술 인용 참조처럼):
> (1) paste 시 textarea **본문 안 커서 위치**에 inline 토큰 `[Image #N]` 을 삽입한다 —
> 이미지는 detached chip 이 아니라 prose 안에서 citation 으로 참조된다. (2) chip 은 여전히
> textarea **위**에 뜨되 inline 토큰과 **번호가 일치**한다. (3) inline 토큰 ↔ chip 은
> **양방향 동기** — 본문에서 `[Image #N]` 을 지우면 해당 chip 도 사라지고, chip X 를
> 누르면 본문 토큰도 제거된다.
>
> 본 절은 §4.b/§4.c 의 chip anatomy/preview/temp-storage(저장·썸네일·cleanup)는 **그대로
> 유지**하고, 그 위에 **inline citation 레이어 + 양방향 sync**를 얹는다. PO 전달 경로
> (`## Attached files` path block)도 §4-3/§4-5 그대로, **번호 매핑만 추가**한다.

---

#### 1) 토큰 포맷 & 번호 정책 — stable-per-image (채택)

- **토큰 리터럴**: `[Image #N]` (대괄호 + 공백 + `#` + 정수). 영문 고정 리터럴 — `Image` 는
  보호어 취급(번역하지 않음). 이유: (i) cmux/Claude-Code 와 동일해 PO/agent 가 학습된
  패턴으로 인지, (ii) 파싱 regex 가 locale 무관하게 1개로 단순. 한국어 모드에서도 토큰은
  `[Image #N]` 그대로(유저 verbatim "이미지1" 은 멘탈모델 설명이지 리터럴 요구가 아님 —
  chip label 의 한글 `이미지` 와 토큰의 영문 `Image` 는 별개 레이어).
- **N 배정 = stable, monotonic, never-reused (per composer draft)**:
  - composer 별 단조 증가 카운터 `nextImageSeq`(초기 1)에서 N 을 뽑는다. paste 1회 →
    `N = nextImageSeq++`. 한 번 부여된 N 은 **그 이미지에 고정**되고, 항목이 제거돼도
    **재사용/재번호(renumber)하지 않는다**.
  - 근거(= 유저가 짚은 "논문 참조처럼"): citation 번호는 항목을 지워도 남은 참조의
    번호가 흔들리면 안 된다. renumber 방식은 `[Image #2]` 를 지웠을 때 `#3`→`#2` 로
    당겨야 하고, 그러면 본문에 이미 타이핑된 `[Image #3]` 토큰 텍스트까지 **string
    rewrite** 해야 한다(커서/undo 깨짐, race). stable 번호는 텍스트를 건드리지 않으므로
    **가장 단순하고 견고**. cmux 동일.
  - 결과로 번호에 hole 이 생길 수 있다(예: `#1`, `#3` 만 남음). **허용** — citation
    번호는 연속성이 아니라 **고유성/안정성**이 계약. 전송 시 `## Attached files` 블록도
    같은 N 으로 매핑되므로 PO 가 본문 `[Image #3]` ↔ path 를 정확히 correlate.
  - 카운터 lifecycle: send 성공(§4.c handleSubmit 의 `setAttachedFiles([])`) 또는 draft
    전체 비움 시점에 `nextImageSeq` 를 **1 로 리셋**(새 메시지 = 새 번호 공간). 리셋은
    "draft + attachedFiles 가 모두 빈" 상태에서만(부분 제거로는 리셋 금지).

#### 2) 데이터 모델 — 토큰 N ↔ attachment path 링크

§4.c 의 `attachedFiles: string[]`(PO 전달용 path 목록) + `previewUrls`(썸네일)는 **유지**.
inline 레이어를 위해 **단일 source-of-truth 배열**을 추가한다:

```
type ImageRef = {
  seq: number          // 토큰 N (stable, 1-based)
  path: string         // 저장된 temp 절대경로 (PO 전달 key)
  previewUrl?: string  // object URL (§4.c, 썸네일용)
}
attachments: ImageRef[]   // 순서 = paste 순서(= chip 표시 순서)
nextImageSeq: number      // 단조 카운터
```

- `attachedFiles`/`previewUrls` 를 **`attachments` 에서 파생**시켜 상태 중복을 없앤다:
  `attachedFiles = attachments.map(a => a.path)`, `previewUrls[path]` 는 `attachments`
  의 `previewUrl` 로 흡수(또는 그대로 두되 `ImageRef` 가 master). → handleSubmit/cleanup/
  revoke 로직(§4.c)은 `attachments` 에서 path/url 을 읽도록 1줄 조정.
- **링크 규칙**: 토큰 `[Image #N]` 의 N === `ImageRef.seq`. 본문 파싱으로 얻은 N 집합과
  `attachments` 의 seq 집합을 **reconcile**(아래 4절)하는 것이 sync 의 전부.
- non-image paperclip 첨부(§4.b otherAttachments)는 `ImageRef` 에 넣지 않는다 — inline
  토큰 대상이 아니며 기존 file chip 경로 유지(회귀 0).

#### 3) paste 시 inline 토큰 삽입 (커서 위치)

§4.c `onComposerPaste` 성공 분기(저장 path/objectURL 확보 직후)에 **토큰 삽입 + ImageRef
push** 를 추가한다. (`e.preventDefault()` 는 §4 그대로 유지 — 바이너리 기본 paste 차단.)

- **커서 삽입**: textarea 의 `selectionStart`/`selectionEnd` 를 읽어 현재 선택 구간을 토큰
  문자열로 치환한다.
  ```
  const ta = taRef.current
  const s = ta.selectionStart, e2 = ta.selectionEnd
  const token = `[Image #${seq}]`
  const insert = needsPad(draft, s) ? `${token} ` : token  // 앞뒤 공백 정규화
  const next = draft.slice(0, s) + insert + draft.slice(e2)
  setDraft(next)
  // caret 을 토큰 끝으로
  requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + insert.length; ta.focus() })
  ```
- **공백 정규화(`needsPad`)**: 토큰 앞 문자가 비공백이면 앞에 ` ` 1개, 토큰 뒤가 줄 끝/
  비공백이면 뒤에 ` ` 1개 — 토큰이 단어에 달라붙어 regex 가 깨지는 것 방지. (예:
  `보세요[Image #1]` 금지 → `보세요 [Image #1] `.)
- **정상 텍스트 타이핑과 공존**: 토큰은 일반 텍스트로 본문에 들어가므로 이후 타이핑/삭제/
  커서이동은 textarea 기본 동작 그대로. 토큰은 "특수 위젯"이 아니라 **plain text citation**
  (cmux 와 동일 — atomic delete 같은 건 하지 않는다, 견고성 우선).
- **다중 이미지 한 번에 paste**: §3 out-of-scope 가 "1 paste = 1 image" 이므로 현행대로
  **첫 이미지만**. 단 §1 카운터는 N 개 paste(연속)도 자연 지원 — paste 마다 `seq++` 라
  `[Image #1] [Image #2] …` 가 순서대로 커서 위치에 쌓인다.

#### 4) 양방향 sync — 본문 파싱 ↔ attachments reconcile

**source of truth = textarea 본문의 토큰 집합**. (유저가 본문에서 토큰을 지우는 행위가
1차 트리거이므로 텍스트를 master 로 잡는 것이 가장 직관적·견고.)

**A. 본문 → chip (토큰 삭제 시 chip 제거)** — `setDraft` 를 감싸는 `onComposerChange`
(또는 draft 변경 effect)에서:
```
const present = new Set([...next.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1])))
// 본문에 더 이상 없는 seq 의 ImageRef 를 드랍
setAttachments(prev => prev.filter(a => present.has(a.seq)))
```
- 드랍되는 ImageRef 는 §4.c 의 cleanup 규칙을 그대로 탄다: `previewUrl` revoke
  (메모리), temp disk 파일은 **즉시 unlink 하지 않음**(아직 미전송 — L1 24h orphan purge
  또는 send 후 L2 가 회수). → `removeAttached` 의 revoke 로직 재사용.
- regex 는 `matchAll` 로 **현재 본문에 실제 존재하는** N 만 수집 → 중복 토큰(유저가
  `[Image #1]` 을 복붙)도 set 으로 흡수(seq 존재 = 유지).

**B. chip → 본문 (chip X 클릭 시 토큰 strip)** — `removeAttached`(이제 `removeImageRef(seq)`)
가 chip 제거와 함께 본문에서 해당 토큰 텍스트를 제거:
```
const re = new RegExp(`\\s?\\[Image #${seq}\\]\\s?`, 'g')  // 양옆 공백 1개까지 흡수
setDraft(prev => prev.replace(re, ' ').replace(/\s{2,}/g,' ').trimStart())
setAttachments(prev => prev.filter(a => a.seq !== seq))  // + previewUrl revoke
```
- A 와 B 가 서로를 다시 트리거하지 않도록: B 는 draft 와 attachments 를 **함께** 갱신
  (B 의 setDraft 가 A 의 reconcile 를 타도 결과 동일 — idempotent, 무한루프 0).
- **stable 번호라 strip 시 다른 토큰 rewrite 불필요** — `#3` 지워도 `#1`/`#5` 토큰
  텍스트는 그대로(§1 의 핵심 이점).

**C. edge — 토큰 mid-text 삭제 / 부분 삭제**: 유저가 `[Image #2]` 중간 글자만 지워 토큰이
깨지면(`[Image #]`, `[Imag #2]`) regex 가 매치 실패 → 그 seq 가 `present` 에서 빠짐 →
A 규칙으로 chip 제거. 즉 **토큰이 온전하지 않으면 첨부도 떨어진다**(citation 무효화).
의도된 동작이며 cmux 와 동일(깨진 참조는 참조 아님).

#### 5) 전송 페이로드 — inline 토큰 + 번호 매핑 블록

`handleSubmit`(§4.c)의 본문 합성을 **번호 일치**하도록 조정:

- prose 는 토큰을 **그대로 포함**한 채 전송(유저가 친 `… [Image #1] 부분 확인해줘`).
- `## Attached files` 블록을 **`#N → path` 매핑**으로 발급(기존 `- <path>` 에 N 라벨 추가):
  ```
  ## Attached files
  - #1 → /var/folders/…/productune/pasted/pasted-….png
  - #3 → /var/folders/…/productune/pasted/pasted-….png
  ```
  N 은 `ImageRef.seq` 그대로. → PO/agent 가 본문 `[Image #1]` 을 path 로 deref(claude 는
  path 로 이미지 read). PO/runner 포맷은 **여전히 text-only** — 번호는 markdown 텍스트일
  뿐 직렬화/IPC 무변경(§4-5 정합).
- 매핑 블록은 **현재 본문에 살아있는 토큰의 seq 만** 포함(전송 직전 §4.A reconcile 결과 =
  `attachments`). 본문에서 지워진 이미지는 블록에도 안 나감(sync 정합).
- L2 cleanup(§4.c)은 `attachments.map(a=>a.path)` 를 넘기는 것으로 동일.

#### 6) Edge cases 정리

| 케이스 | 동작 |
|---|---|
| 빈 본문에 첫 paste | 커서=0, `[Image #1] ` 삽입(앞공백 없음, 뒤공백 1). seq 1. |
| 텍스트 사이 paste | 커서 양옆 공백 정규화 후 토큰 삽입. 앞뒤 단어와 분리. |
| 다중(연속) paste | seq 단조 증가 → `[Image #1] [Image #2] …`. hole 없음. |
| 토큰 mid-text 삭제(부분) | regex 매치 실패 → 해당 seq chip 제거(§4.C). |
| 토큰 통째 삭제 | §4.A → chip 제거 + previewUrl revoke. |
| chip X 클릭 | §4.B → 본문 토큰 strip + chip 제거. |
| 모든 항목 제거 후 empty | draft+attachments 모두 empty → `nextImageSeq` 1 리셋(§1). |
| 같은 토큰 복붙(`[Image #1]` 2개) | set 흡수 → seq 1 유지(chip 1개). 둘 다 같은 path deref(무해). |
| paperclip non-image | inline 토큰 대상 아님 — 기존 file chip/`## Attached files` 경로 그대로. |

#### 7) ASCII mockup — inline 토큰 + 번호 chip

```
┌─ composer ────────────────────────────────────────────────┐
│  ┌────────────────────┐ ┌────────────────────┐            │  ← chip row (flex-wrap)
│  │ [🖼] #1 이미지   ✕ │ │ [🖼] #3 이미지   ✕ │            │     번호 = inline 토큰 N
│  └────────────────────┘ └────────────────────┘            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 이 [Image #1] 의 레이아웃을 [Image #3] 처럼            │ │  ← textarea (inline citation)
│  │ 바꿔줘                                                │ │
│  └──────────────────────────────────────────────────────┘ │
│                                          [📎]  [ 전송 ]     │
└────────────────────────────────────────────────────────────┘

chip 확대 (번호 prefix 추가, §4.b anatomy 유지):
  ┌──────────────────────────────┐
  │ [🖼]  #1 이미지          ✕   │   height 28 · radius-lg · bg subpanel
  └──────────────────────────────┘
   tile   label           X
   20×20  "#N 이미지"      icon-xs/muted
   └ §4.c object-URL <img> (cover) — bytes 없으면 lucide `Image` glyph 폴백
   └ "#N" = --text-muted 한 단 흐리게, 그 뒤 localized `이미지`/`image` = --text-secondary

  [🖼] = §4.c 썸네일(또는 lucide `Image` 폴백, 20×20 neutral tile)
  ✕    = lucide `X` (icon-xs 12, stroke 3, text-muted → hover text-secondary)
```

> chip label 변경점 = §4.b `이미지`/`image` 앞에 **`#N ` prefix** 1개만 추가(tile/X/hover/
> tokens 전부 §4.b·§4.c 그대로). prefix 색은 `--text-muted`(번호는 보조정보), 본문 라벨은
> `--text-secondary`. lucide-react 아이콘만, 컬러 emoji 금지.

#### 8) 구현 메모 (dev)

- 상태 통합: §4.c 의 `attachedFiles`/`previewUrls` 를 `attachments: ImageRef[]` 로
  단일화(또는 `attachments` master + 파생 getter). `nextImageSeq` ref/state 추가.
- `onComposerPaste`(~364행): 저장 성공 분기에서 `seq = nextImageSeq++`, 커서 위치 토큰
  삽입(§3), `ImageRef` push.
- `setDraft` → `onComposerChange` 래퍼로 교체: 변경마다 §4.A reconcile(regex `matchAll`
  `/\[Image #(\d+)\]/g`). textarea `onChange` 가 이 래퍼를 호출.
- `removeAttached` → `removeImageRef(seq)`: 본문 토큰 strip(§4.B) + ImageRef 제거 +
  previewUrl revoke(§4.c.1.c 표 그대로).
- `handleSubmit`(~120행): `## Attached files` 블록을 `- #${seq} → ${path}` 포맷으로
  발급(§5). L2 cleanup/`setAttachments([])`/`nextImageSeq=1` 리셋 추가.
- regex 1개(`/\[Image #(\d+)\]/g`)를 모듈 상수로 — 삽입·파싱·strip 일관.
- locale: chip 라벨은 §4.b `imageLabel`(`이미지`/`image`) 재사용 + `#N` 은 비번역 prefix.
  토큰 리터럴 `[Image #N]` 은 en/ko 공통(보호어). 신규 i18n 키 불필요.
- ⚠️ renderer-only 변경(electron-main IPC 무변경). §4.c 의 saveImage/cleanup IPC 그대로
  사용 — 번호는 순수 renderer 본문/매핑 텍스트 레이어.

### dev 핸드오프 플래그

- electron-main IPC 신규 채널 + preload 노출이 필요함 (renderer 단독으로 완결 불가).
- clipboard 이미지 API: renderer 에서 `clipboardData.items` + `getAsFile()` + `Blob.arrayBuffer()` 사용. macOS/Electron 에서 스크린샷 클립보드는 `image/png` 으로 들어오는 것이 일반적이므로 PNG 기본 가정.
- 경로 검증: IPC 에서 projectDir 하위로만 쓰도록 path traversal 방어.

## §5 QA scope

smoke:

- GUI 를 실행하고 채팅 입력창에 포커스를 둔다.
- 스크린샷(또는 이미지) 을 클립보드에 복사한 뒤 입력창에서 Cmd+V 로 붙여넣어 thumbnail 이 표시되는지 확인.
- thumbnail 의 remove 컨트롤로 첨부가 제거되는지 확인.
- 텍스트를 함께 입력한 뒤 전송 → 메시지에 `## Attached files` 이미지 path 가 포함되고 PO 가 이미지를 인지하는지 확인.
- 일반 텍스트를 paste 했을 때 기존 텍스트 paste 동작(그대로 본문 삽입)이 유지되는지(회귀 없음) 확인.

## Outcome

Implemented. 5 files changed (1 new). New `electron/ipc/attachments.ts` exposes `attachments:saveImage` — writes pasted clipboard image bytes to `<projectDir>/.productune/attachments/pasted-<ts>-<rand>.<ext>` with projectDir containment + image-ext whitelist + size cap, returns abs path. Registered in `main.ts`, exposed via `preload.ts` as `saveAttachmentImage`. `ChatPanel.tsx` composer: `onPaste` detects first `image/*` clipboard item → `Blob.arrayBuffer()` → IPC save → push path into existing `attachedFiles` (rides the existing `## Attached files` path block to PO; no PO/runner format change). Non-image paste falls through to default text-paste. Image attachments render as thumbnails with an `X` remove control; the file chip now counts non-image attachments only. tsc 0 errors (scoped `tsc --noEmit -p tsconfig.json`).

### §4.b QA-fix outcome

QA-feedback redesign applied (Option A, icon-only chip). The `file://` thumbnail
path is removed: `fileUrl()`, `thumbImg`, `thumbRow`, `thumbItem`, `thumbRemove`
deleted (now-dead). Image attachments render via a new `ImageChip` pill —
`chip`/`chipTile`/`chipLabel`/`chipRemove` styles on design-system tokens
(`--surface-subpanel`/`--border-default`/`--radius-lg`, 28px height, 20×20
`--surface-base` tile, ellipsis `metadata` label, X remove). The tile glyph is the
lucide `Image` icon rendered as inline SVG (imports region untouched per scope);
remove uses the already-imported lucide `X`. No `<img>` element and no `file://`
URL remain in the attachment chip → broken-glyph is structurally impossible.
Multiple chips flex-wrap in a single row above the textarea (`chipRow`). Hover
affordances: chip border → `--border-strong`, X → `--surface-base`/`--text-secondary`.
Visible label = localized `imageLabel` (`image`/`이미지`, key parity added to
en/ko); raw filename only in the `title` tooltip. `isImagePath` retained (still
classifies the attachments split). Scoped `tsc --noEmit -p tsconfig.json` → 0 errors.

### §4.d QA-fix outcome (cmux-style inline image reference)

Inline citation layer + bidirectional sync added on top of §4.b/§4.c (chip
anatomy / object-URL preview / temp storage all preserved; no electron-main
change — `saveAttachmentImage`/`cleanupAttachments` IPC reused as-is).

State refactor — `attachedFiles: string[]` + `previewUrls: Record<string,string>`
collapsed into a single source-of-truth `attachments: ImageRef[]`
(`{ seq, path, previewUrl? }`) for pasted images, plus `otherFiles: string[]` for
paperclip non-image attachments (never inline-tokenized). `attachedFiles` is now a
derived `useMemo` (`[...attachments.map(a=>a.path), ...otherFiles]`). Token counter
`nextImageSeqRef` (ref — read/incremented in async paste handler).

- **Token format & numbering (§4.d.1)** — module-level `IMAGE_TOKEN_RE =
  /\[Image #(\d+)\]/g` drives insertion, parse, and strip. Each paste pulls
  `seq = nextImageSeqRef.current++` (monotonic, never reused). Deleting a token
  leaves holes (`#1`,`#3`); no renumber. Counter resets to `1` only when
  draft **and** attachments **and** otherFiles are all empty (handleSubmit on send;
  `onComposerChange` on full clear). Partial removal never resets.
- **Inline insert at cursor (§4.d.3)** — `onComposerPaste` success branch reads
  `taRef.current.selectionStart/End`, splices `[Image #N]` into the draft with
  whitespace normalization (pad-left if preceding char non-space, pad-right if
  trailing non-space/EOL), `setDraft(next)`, then `requestAnimationFrame` restores
  caret past the token. ImageRef pushed with the same seq + object-URL preview.
- **Bidirectional sync, textarea = source of truth (§4.d.4)** — textarea `onChange`
  → `onComposerChange(value)`: `setDraft` then reconcile —
  `present = new Set([...value.matchAll(IMAGE_TOKEN_RE)].map(m=>Number(m[1])))`,
  drop any ImageRef whose seq ∉ present and revoke its previewUrl (memory only;
  temp disk left for L1/L2 cleanup). Broken/partial token → match fails → seq drops
  → chip removed (§4.d.4.C). chip X → `removeImageRef(seq)`: strips `\s?[Image #N]\s?`
  from draft (collapse double-space, trimStart) + drops ImageRef + revokes URL,
  draft and attachments updated together (idempotent, no loop; stable seq → no
  rewrite of sibling tokens).
- **Numbered chips (§4.d.7)** — chips moved ABOVE the textarea (flex-wrap row),
  keyed by seq, with a muted `#N` prefix (`chipSeq` = `--text-muted`) before the
  localized `imageLabel` (`--text-secondary`). §4.b/§4.c chip anatomy/tile/thumbnail/
  hover/tokens unchanged. No new i18n keys — `#N` is a non-translated prefix and the
  token literal `[Image #N]` is en/ko common (protected term).
- **Send payload (§4.d.5)** — `handleSubmit` keeps inline tokens in the prose; the
  `## Attached files` block now emits `- #${seq} → ${path}` for each ImageRef
  (paperclip files keep `- ${path}`). Text-only — no PO/runner format change. L2
  cleanup hands `attachedFiles` (= derived paths) to `cleanupAttachments` after
  `poSendMessage` resolves, as before.

Dead `isImagePath`/`IMAGE_PATH_RE` (the prior extension-split, now obsolete) removed.
Scoped `pnpm exec tsc --noEmit -p tsconfig.json` → 0 errors.

## QA verification (pdt-qa — code inspection)

Centralized build GREEN (tsc 0, locale parity 771, protected OK, smoke passed) — taken as given, not re-run. Verified by code inspection against actual implementation.

### §2 Acceptance

- [x] **paste → thumbnail** — `onComposerPaste` (ChatPanel ~364) detects first `image/*` clipboard item, `getAsFile()` → `arrayBuffer()` → `saveAttachmentImage` IPC; on `res.ok` builds `URL.createObjectURL(file)` into `previewUrls[res.path]`. `ImageChip` renders `<img src={previewUrl}>` (objectFit:cover, radius-md). REAL object-URL thumbnail, not `file://`. **(code-verified; live render = user-verify)**
- [x] **remove control** — each `ImageChip` has lucide `X` button → `removeAttached(path)` filters `attachedFiles` and revokes+deletes the matching `previewUrls[path]`. Chip + attachment removed together.
- [x] **PO recognizes image (path transport)** — `handleSubmit` prepends `## Attached files\n- <path>` block (ChatPanel ~126-129); image temp path rides the same block as paperclip. No PO/runner format change. **(verified; agent visual recognition = user-verify)**
- [x] **text + image together** — `draft` (text) and `attachedFiles` (paths) compose into one `text` body and one `userMsg`; both sent in a single `poSendMessage`.
- [x] **non-image paste = no regression** — `onComposerPaste` returns early (no `preventDefault`) when no `image/*` item found → default textarea text-paste preserved.
- [x] **persisted + path added to attachedFiles** — IPC writes bytes to disk and returns abs path; success branch pushes `res.path` into `attachedFiles`. (Storage is OS-temp per §4.c, not projectDir — see below.)
- [x] **save failure / no image = safe ignore** — `if (!imageItem) return`, `if (!file) return`, `if (res?.ok && res.path)` guard, outer try/catch swallow. Textarea untouched on any failure.

### §4.b Acceptance (cmux-style chip)

- [x] **no `<img src=file://>`, no broken glyph** — chip uses object-URL `<img>` OR lucide `ImageGlyph` fallback (path-only / no bytes). No `file://` anywhere. `fileUrl()`/`thumbImg`/`thumbRow` dead-code removed (not present in file).
- [x] **chip anatomy + tokens** — `chip` (28px h, `--radius-lg`, `--surface-subpanel`, `--border-default`, max-width 180), `chipTile` (20×20 `--surface-base` `--radius-md`), `chipLabel` (ellipsis, `--text-secondary`), `chipRemove` (16×16, lucide X size 12 stroke 3). Matches spec.
- [x] **localized label, filename in title only** — visible label = `t('workspace.chat.imageLabel')` (`image`/`이미지`); raw path only in chip `title`. Keys present + parity in en/ko (lines 304).
- [x] **hover affordances** — chip border → `--border-strong` on hover; X bg → `--surface-base`, color → `--text-secondary` on xHover.
- [x] **multiple images wrap** — `chipRow` is `flexWrap:'wrap'`, gap `--space-2`, rendered above textarea.

### §4.c Acceptance (real thumbnail + temp storage)

- [x] **object-URL thumbnail, not file:// / disk-read** — preview source is the pasted blob (`createObjectURL`), decoupled from disk path; survives temp cleanup.
- [x] **icon fallback when no bytes** — `previewUrl ? <img> : <ImageGlyph/>` — paperclip-picked image paths (no bytes) fall back to glyph; broken-glyph impossible (no img rendered).
- [x] **objectURL revoked on remove/send/unmount** — remove: `removeAttached` revokes+deletes per-path. send: `handleSubmit` revokes ALL `previewUrlsRef.current` then `setPreviewUrls({})`. unmount: `useEffect(()=>()=>{...revoke all},[])` via ref mirror. All three present.
- [x] **temp storage under `app.getPath('temp')/productune/pasted`** — `tempRoot()` (attachments.ts:30); write target rebased off projectDir.
- [x] **containment guard + ext whitelist + 20MB cap** — `isUnderTempRoot` guard on write+cleanup; `safeExt`/`IMAGE_EXTS` whitelist (defaults png); `MAX_IMAGE_BYTES = 20_000_000`.
- [x] **L1 boot purge of orphans >24h** — `purgeOrphans()` called in `register()`; unlinks files with `mtime` age > `ORPHAN_MAX_AGE_MS` (24h); best-effort (swallows, missing folder = noop).
- [x] **attachments:cleanup unlinks only temp-root paths** — handler skips any path failing `isUnderTempRoot` → paperclip originals never deleted; failures swallowed.
- [x] **cleanupAttachments exposed in preload** — preload.ts:83 `cleanupAttachments` → `attachments:cleanup`. `saveAttachmentImage` → `attachments:saveImage` (preload.ts:73).
- [x] **renderer triggers cleanup after poSendMessage resolves (L2)** — `handleSubmit` calls `api.cleanupAttachments({ paths: sentPaths })` immediately AFTER `await api.poSendMessage(...)` resolves; never before PO read.
- [x] **NO permanent accumulation under projectDir/.productune/attachments** — IPC no longer writes to projectDir; all writes go to OS-temp subtree. Confirmed no `.productune/attachments` write path remains in attachments.ts.
- [x] **image path flows to PO via `## Attached files`** — unchanged path-block transport (verified in §2).

### Registration / wiring

- `registerAttachments()` invoked at `main.ts:68` (import at :24). IPC channels live.

### Gaps / notes

- preload.ts:69-72 has a STALE comment ("persist … under `<projectDir>/.productune/attachments/`") that predates the §4.c temp-storage redesign. Cosmetic only — the implementation (`attachments.ts`) writes to OS-temp correctly; the JSDoc is misleading. Non-blocking; flag for a docs touch-up.
- `imageItem.getAsFile()` ext derives from MIME (`imageItem.type.split('/')[1]`); main-side `safeExt` defaults non-whitelisted to png — safe.

**Result: all code-verifiable §2 / §4.b / §4.c acceptance = PASS.** Runtime-only items (actual clipboard paste, live thumbnail paint, temp file unlink timing, agent image recognition) require user eyeball → status: user-verify.

### §4.d Acceptance (cmux-style inline image reference)

- [x] **paste inserts `[Image #N]` at cursor (whitespace-normalized)** — `onComposerPaste` success branch splices the token at `selectionStart/End` with pad-left/pad-right; caret restored after token via `requestAnimationFrame`.
- [x] **N stable, monotonic, never reused** — `nextImageSeqRef.current++` per paste; no renumber on delete; holes (`#1`,`#3`) allowed.
- [x] **counter resets to 1 only when draft + attachments both empty** — reset in `handleSubmit` (send) and in `onComposerChange` when `value.trim()===''` and no attachments/otherFiles. Partial removal never resets.
- [x] **numbered chips above composer, `#N` prefix matches token** — `chipRow` rendered above the textarea; `ImageChip` shows muted `#N` + localized label, keyed by seq.
- [x] **bidirectional sync, textarea = source of truth** — `onComposerChange` `matchAll(/\[Image #(\d+)\]/g)` reconciles tokens ↔ `attachments`; dropped refs revoke objectURL; chip X (`removeImageRef`) strips the `[Image #N]` token from the draft.
- [x] **broken/mid-text token delete drops the chip** — match failure removes the seq from `present` → ImageRef dropped (§4.d.4.C). idempotent, no loop.
- [x] **send: prose keeps inline tokens; `## Attached files` = `#N → path` map** — `handleSubmit` emits `- #${seq} → ${path}` for images, `- ${path}` for paperclip. Text-only, no PO/runner format change.
- [x] **§4.c saveImage/cleanup IPC + objectURL revoke reused as-is** — no electron-main change; revoke on remove/send/unmount preserved via `attachmentsRef`.
- [x] **multiple images / paste mid-text / delete mid-text / empty-after-all-removed** — covered by §4.d.6 edge table; reconcile + reset handle each. **(runtime paint/caret = user-verify)**

### user-verify steps

1. Launch GUI, focus the chat composer.
2. Copy a screenshot (Cmd+Shift+4 area → clipboard) and Cmd+V in the composer.
3. Confirm a chip appears showing a REAL thumbnail of the pasted image (not a broken-image glyph, not a green torn-image icon, not a raw `pasted-178…` filename). Label reads `image`/`이미지`; hover shows the path in tooltip.
4. Click the chip X → chip disappears.
5. Re-paste, type some text, send (Cmd+Enter). Confirm the message carries a `## Attached files` path and the agent reacts to the image.
6. After send completes, check `<OS temp>/productune/pasted/` — the just-sent `pasted-*.png` should be gone (L2 cleanup). Paste-but-don't-send files remain until next boot (L1 24h purge).
7. Paste plain text/URL → confirm normal text paste still inserts into textarea (no regression).

### risk

Low. Path-transport reuse means zero PO/runner format change. Main-side containment guard prevents deleting paperclip originals. Object-URL lifecycle revoked on all three exits (no leak). Only residual: the stale preload JSDoc (cosmetic) and the inherent runtime-only confirmation that the clipboard/render/cleanup behave on the live machine.

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-098 | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | high |
| pdt-developer | T-PATCH-098-qa-fix | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | high |
| pdt-developer | T-PATCH-098-qa-fix-4c | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | high |
| pdt-qa | T-PATCH-098-verify | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | standard |
| pdt-developer | T-PATCH-098-qa-fix-4d | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | high |
| pdt-qa | T-PATCH-098-verify-4d | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | standard |
| pdt-developer | T-PATCH-098-qa-fix-4e | 2026-06-11T00:00:00Z | 2026-06-11T00:00:00Z | claude-opus-4-8 | standard |
| pdt-qa | T-PATCH-098-verify-4e | 2026-06-11T00:00:00Z | 2026-06-11T00:00:00Z | claude-opus-4-8 | standard |

### §4.d verify (pdt-qa · code inspection — 2nd pass)

§4.d re-verified against `ChatPanel.tsx` (central build GREEN, given). All §2/§4.d
boxes confirmed in code:

- Paste inserts `[Image #N]` at the cursor — `onComposerPaste` (~448–469) splices
  `[Image #${seq}]` at `selectionStart/End` with pad-left/pad-right whitespace
  normalization, then restores caret via `requestAnimationFrame`.
- Seq stable/monotonic/never-reused — `nextImageSeqRef.current++` per paste (~440);
  no renumber on delete; reset to 1 only when `draft.trim()==='' && attachments
  empty && otherFiles empty` (`onComposerChange` ~501; `handleSubmit` ~160).
- Numbered chips — `chipRow` above the textarea (~662), keyed by `seq`, `#N` prefix
  (`chipSeq` `--text-muted`) + localized `imageLabel`.
- Bidirectional sync, textarea = source of truth — `onComposerChange`
  `matchAll(IMAGE_TOKEN_RE=/\[Image #(\d+)\]/g)` builds `present` set, drops any
  ImageRef whose seq ∉ present + revokes its objectURL (~488–500); chip X →
  `removeImageRef(seq)` strips `\s?[Image #N]\s?` from draft + drops ref + revokes
  URL (~394–402). Broken/partial token → match fails → chip drops.
- Send — prose keeps inline tokens; `## Attached files` emits `- #${seq} → ${path}`
  for images, `- ${path}` for paperclip (~129–134). Text-only; no PO/runner change.
- §4.c IPC reuse — `saveAttachmentImage`/`cleanupAttachments` unchanged; objectURL
  revoke on remove/send/unmount all present (~341, ~155, ~399).

`imageLabel`/`removeImage` keys present with en/ko parity (en.json/ko.json :303–304).
No live `file://` src or dead `thumb*`/`isImagePath` remain (comment-only matches).
Result: §4.d = PASS (code). User-facing visual → status `user-verify`; eyeball steps
already enumerated in the §4.d user-verify section above.

---

### §4.e QA-feedback: atomic token deletion

> qa-fix follow-up. §4.d 의 stable-never-reused 번호/양방향 sync 모델은 **그대로 유지**하고,
> 그 위에 토큰 삭제 UX 만 보강한다. (98 자체는 양호 — 본 절은 단일 후속 결함 수정.)

> QA(유저) 피드백 (요지): 본문에서 `[Image #N]` 토큰을 지우려고 Backspace 를 누르면 닫는
> 대괄호 `]` 하나만 지워지고 `[Image #1` 같은 **orphan 텍스트가 composer 에 그대로 남는다**.
> "[] 사이 내용 다 지워지게" — 즉 토큰을 한 번에 **통째로**(`[Image #N]` 전체 = 양 대괄호 +
> 사이 내용) 지워달라는 요구.

#### 원인 (현행 §4.d 동작)

토큰은 §4.d §3 의도대로 **plain text citation** 이라 Backspace/Delete 도 textarea 기본
문자단위 삭제다. `]` 한 글자 삭제 → 본문은 `[Image #1` → `onComposerChange`(~497) 의
`IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g` 가 더 이상 매치 안 됨 → 해당 `ImageRef` 만 드랍
(chip 사라짐, previewUrl revoke). **하지만 본문의 깨진 잔여 `[Image #1` 은 strip 되지
않는다** — change-time 로직은 chip 정합만 맞추고 textarea 텍스트는 손대지 않기 때문.
결과: chip 은 사라졌는데 prose 엔 half-token 리터럴이 남는 비대칭 상태.

#### 채택: KEYDOWN 인터셉트 = primary, CHANGE-time cleanup = 보완(fallback)

토큰을 §4.d 대로 plain text 로 유지하되, **삭제 경로에서만** atomic 하게 다룬다. 두 레이어:

1. **KEYDOWN 인터셉트 (primary, editor-grade)** — caret 이 토큰에 인접/내부일 때
   Backspace/Delete 를 가로채 토큰 **전체 span** 을 한 번에 제거.
2. **CHANGE-time cleanup (보완, 방어선)** — 그래도 본문에 들어온 half-token 잔여물
   (paste 사고, 마우스 selection 삭제, mid-token 편집 등 keydown 으로 못 잡은 경우)을
   change 시점에 sweep 한다.

primary 가 정상 키보드 삭제 99% 를 깔끔히 처리하고, cleanup 은 "어떤 경로로든 orphan 이
살아남지 않는다"는 불변식을 보장하는 안전망이다.

#### 1) KEYDOWN — 토큰 span 검출 + atomic 삭제

기존 `onKeyDown`(~194, 현재 Cmd/Ctrl+Enter 만 처리)에 **Enter 분기보다 먼저** atomic-delete
분기를 추가한다. IME `isComposing` 가드는 그대로 적용(조합 중 Backspace 는 가로채지 않음).

- **토큰 span 인덱싱**: 현재 `draft` 에서 `IMAGE_TOKEN_RE`(`/\[Image #(\d+)\]/g`)를
  `matchAll` 로 훑어 각 토큰의 `[start, end)` 구간(`m.index` ~ `m.index + m[0].length`)과
  `seq`(`Number(m[1])`)를 수집한다. 매 keydown 마다 즉석 계산 — 본문이 곧 source of truth라
  별도 위치 캐시 불필요(§4.d 모델 유지).
- **caret 위치 판정** (`s = selectionStart`, `e2 = selectionEnd`):
  - **선택 구간 없음(`s === e2`, 캐럿만)**:
    - `key === 'Backspace'` 이고 **`s === token.end`** (캐럿이 토큰 **바로 뒤** = 닫는 `]`
      직후) → `preventDefault()`, 그 토큰 span `[start,end)` 전체를 삭제.
    - `key === 'Delete'` 이고 **`s === token.start`** (캐럿이 토큰 **바로 앞** = 여는 `[`
      직전) → `preventDefault()`, 그 토큰 span 전체 삭제.
    - **mid-token (`token.start < s < token.end`)**: 방향 무관하게 `preventDefault()` +
      토큰 span **전체** 삭제. (토큰 내부를 부분 편집해 깨뜨리는 걸 원천 차단 — "사이 내용
      다 지워지게" 의 직접 충족.)
    - 어느 토큰 span 과도 인접/내부가 아니면 → **개입 안 함**(기본 textarea 삭제). 일반
      텍스트 편집은 §4.d 처럼 그대로 동작.
  - **선택 구간 있음(`s !== e2`)**: 선택 범위가 **어떤 토큰 span 과 겹치면(overlap)**, 삭제
    범위를 그 토큰(들)의 경계까지 **확장(snap)** 해 부분 절단을 막는다 — 즉 union(선택,
    겹친 토큰 span 전체)을 한 번에 제거. 토큰과 안 겹치는 순수 텍스트 selection 은 개입 안 함.
- **span 삭제 = 양옆 공백 1개 흡수**: §4.d §4.B `removeImageRef` 와 **동일 규칙** 재사용 —
  `\s?[Image #N]\s?` 패턴(또는 span ± 인접 단일 공백)으로 잘라 `\s{2,}→' '` 정규화 +
  `trimStart`. 토큰 삽입 시 pad-left/right 로 넣은 공백이 고아로 남지 않게.
- **삭제 후처리 = §4.d 경로 재사용(중복 구현 금지)**: span 제거한 새 문자열을
  **`onComposerChange(next)` 로 흘려보낸다.** 그러면 §4.d §4.A reconcile 이 그대로 돌며
  해당 `seq` 의 `ImageRef` 드랍 + `previewUrl` revoke + (draft 전체 빔 시) 카운터 리셋까지
  자동 수행 — chip 제거·preview revoke 를 §4.e 가 따로 구현하지 않는다. caret 은 삭제된
  span 의 `start`(공백 정규화 보정분 반영)로 `requestAnimationFrame` 에서 복원.

#### 2) CHANGE-time cleanup (보완 — orphan sweep)

`onComposerChange`(~497) 에서 chip reconcile **직전**에 본문의 half-token 잔여물을 strip.
keydown 인터셉트를 우회한 모든 경로(붙여넣기 사고, 외부 IME, 비정상 selection 삭제 등)의
방어선.

- **fragment 검출 규칙** — "닫힘 없는 열림" + "열림 없는 닫힘" 두 형태만 표적:
  - 여는 쪽 잔여: `\[Image #\d+(?!\])` — `[Image #N` 인데 바로 뒤에 `]` 가 안 오는 것.
  - 닫는 쪽 잔여: 매칭되지 않은 ` #N]`/`Image #\d+\]` 단편처럼 온전한 `[Image #N]` 의
    부분만 남은 형태.
  - **반드시 온전한 토큰을 먼저 보호**: `IMAGE_TOKEN_RE` 로 매치되는 완전 토큰 구간은
    cleanup 대상에서 제외하고(마스킹/인덱스 제외), 그 **밖에 남은** 단편만 제거한다 →
    멀쩡한 `[Image #2]` 옆에 깨진 `[Image #1` 이 있어도 #2 는 절대 안 건드림.
- **multi-token 안전성**: 완전-토큰 보호 후 단편만 지우므로, 같은 본문에 여러 토큰이 있어도
  서로 간섭 없음. 또 stable-never-reused 번호라 strip 후 남은 토큰의 N 을 **renumber 하지
  않는다**(§4.d §1 계약 유지 — 텍스트 rewrite 금지, hole 허용).
- cleanup 으로 본문이 바뀌면 그 정리된 문자열로 `setDraft` → 이어지는 reconcile 이 chip
  정합을 맞춤(orphan 단편이 사라졌으니 chip 도 정상 드랍됨). **idempotent** — 한 번 정리되면
  재실행해도 no-op(무한루프 0).

#### 3) chip ↔ 토큰 대칭 (이미 충족, 명시만)

- 토큰 제거(atomic keydown 또는 cleanup) → chip 제거 + previewUrl revoke: §4.d §4.A 경로로
  자동(위 1·2 가 `onComposerChange` 를 타므로).
- chip X → 토큰 strip: §4.d §4.B `removeImageRef` 그대로 — 변경 없음.
- temp disk 파일은 §4.c 규칙대로 즉시 unlink 안 함(미전송분은 L1 24h purge / send 후 L2 가
  회수). §4.e 는 메모리(objectURL)와 본문 텍스트만 다룬다.

#### 4) Acceptance (§4.e 추가분)

- [x] 캐럿이 `[Image #1]` 바로 뒤에서 **Backspace 1회** → `[Image #1]` 전체 + 인접 공백이
      한 번에 사라지고, **`[Image #1` 같은 잔여물이 남지 않는다**. chip 도 동시에 사라진다.
- [x] 캐럿이 토큰 바로 앞에서 **Delete 1회** → 동일하게 토큰 전체 atomic 삭제.
- [x] 토큰 **중간**에 캐럿을 두고 Backspace/Delete → 부분 절단 없이 토큰 전체 삭제.
- [x] 토큰을 포함하는 **드래그 selection** 삭제 → 토큰이 잘려 half-token 으로 남지 않는다
      (경계까지 snap).
- [x] `[Image #1] [Image #2]` 중 #1 만 지워도 **#2 는 그대로**(번호 renumber 없음, hole 허용).
- [x] (방어선) 어떤 경로로든 본문에 `[Image #N` / 닫힘 없는 단편이 들어오면 change 시점에
      strip 되어 composer 에 half-token 리터럴이 끝까지 살아남지 않는다.
- [x] 토큰과 무관한 일반 텍스트 Backspace/Delete 는 §4.d 와 100% 동일(회귀 0).
- [x] §4.d 의 stable-never-reused seq / 양방향 sync / PO 전달(`## Attached files` `#N→path`)
      모델은 변경 없음.

#### 5) Outcome (§4.e qa-fix)

Implemented in `ChatPanel.tsx` only (renderer-only; no electron-main / IPC / i18n
change). Two layers per §4.e:

- **KEYDOWN intercept (primary)** — `onKeyDown` gains a Backspace/Delete branch
  ahead of the Enter branch (IME `isComposing` guard kept). Each keydown re-indexes
  the live draft via `[...draft.matchAll(IMAGE_TOKEN_RE)]` into `[start,end)` spans
  (no position cache — body stays source of truth). Caret-only: Backspace at
  `s===span.end` (back edge), Delete at `s===span.start` (front edge), or mid-token
  (`start<s<end`) → `preventDefault()` + remove the WHOLE span. Selection present:
  any span overlapping `[s,e2)` expands (snaps) the delete range to the union of
  selection + token boundaries → no partial cut. Span removal absorbs ONE adjacent
  padding space (trailing preferred, else leading), collapses `\s{2,}→' '`, then
  feeds the result to `onComposerChange(next)` — so the existing §4.d reconcile does
  the chip drop + `previewUrl` revoke + counter reset (no duplicate impl). Caret
  restored at the cut point via `requestAnimationFrame`.
- **CHANGE-time sweep (complement / defense line)** — module-level
  `sweepOrphanTokenFragments` runs in `onComposerChange` BEFORE reconcile. It masks
  every COMPLETE `[Image #N]` span (via `matchAll`) to equal-length sentinel spaces,
  then matches fragment regexes ONLY over the masked text (`IMAGE_TOKEN_OPEN_FRAG_RE
  = /\[Image #\d*(?!\])/g` for `[Image #1` w/o close; `IMAGE_TOKEN_CLOSE_FRAG_RE =
  /(?<!\[)Image #\d+\]/g` for a `]`-remnant with no opener), re-projects the
  removals onto the real string (mask preserves length → indices align), and
  collapses double spaces.

Complete-token protection: the mask step replaces full-token spans with spaces, so
the fragment regexes structurally cannot see inside or across a valid `[Image #N]`
— an intact `[Image #2]` beside a broken `[Image #1` is untouched. Multi-token safe
(each complete span masked independently) and idempotent (after one sweep no
fragment remains → re-run is a no-op; early `return text` when no `[Image #`/`#N]`
present → no loop). Stable-never-reused numbering preserved: nothing renumbers
sibling tokens; holes allowed; §4.d bidirectional sync and the `## Attached files`
`#N → path` send block are unchanged.

Scoped `pnpm exec tsc --noEmit -p tsconfig.json` → 0 errors in `ChatPanel.tsx`
(2 pre-existing unrelated errors in `TicketDetailTab.tsx` are out of scope, not
touched). Runtime caret/keystroke behavior → user-verify.

#### 6) §4.e verify (pdt-qa · code inspection)

Central build GREEN (gui tsc 0, locale 778, protected OK, smoke pass) taken as
given — build/smoke not re-run. Verified by reading `ChatPanel.tsx` against §4.e.

**§4.e Acceptance — all code-verified:**
- KEYDOWN intercept runs ahead of the Enter branch with the IME `isComposing`
  guard kept (`onKeyDown` ChatPanel.tsx:194-277; Backspace/Delete branch :203
  before the Enter branch :273). Spans re-indexed live via
  `[...draft.matchAll(IMAGE_TOKEN_RE)]` (:210) — no position cache, body stays
  source of truth.
- Caret-only (`s === e2`, :220): Backspace at `s === sp.end` (back edge),
  Delete at `s === sp.start` (front edge), or mid-token `sp.start < s < sp.end`
  → `from/to = sp.start/sp.end`, `preventDefault()` + remove WHOLE span
  (:222-231). Non-adjacent → no intervention (default textarea delete). PASS for
  Backspace-after / Delete-before / mid-token boxes.
- Selection (`s !== e2`, :232): any span overlapping `[s,e2)` expands the delete
  range to the union of selection + token boundaries (:235-241) → no partial cut
  (selection-snap box). PASS.
- Span removal absorbs ONE adjacent padding space — trailing preferred
  (`draft[cutTo] === ' '`), else leading (:251-252) — then `\s{2,}→' '` collapse
  (:254), mirroring §4.d §4.B. Result routed through `onComposerChange(next)`
  (:257) so the §4.d reconcile drops the chip + revokes objectURL + (when fully
  empty) resets the counter — no duplicate chip/preview handling. Caret restored
  at `cutFrom` via `requestAnimationFrame` (:259-266). PASS.
- CHANGE-time sweep: `sweepOrphanTokenFragments(rawValue)` runs in
  `onComposerChange` BEFORE reconcile (:578). Module fn (:1169) early-returns when
  no `[Image #`/`#N]` present (:1170, idempotent/no-loop). It masks every COMPLETE
  `[Image #N]` span to equal-length spaces (:1172-1183), runs the fragment regexes
  `IMAGE_TOKEN_OPEN_FRAG_RE = /\[Image #\d*(?!\])/g` and
  `IMAGE_TOKEN_CLOSE_FRAG_RE = /(?<!\[)Image #\d+\]/g` ONLY over the masked text
  (:1188-1193), re-projects removals onto the real string (mask preserves length →
  indices align, :1196-1203), then collapses double spaces (:1205). Complete tokens
  protected (mask step), multi-token safe (each span masked independently),
  idempotent. PASS for defense-line box.
- `[Image #1] [Image #2]` delete #1 → #2 untouched: stable-never-reused seq, no
  renumber, holes allowed — §4.d §1 model unchanged (no sibling rewrite in either
  keydown or sweep path). PASS.
- Non-token Backspace/Delete = §4.d identical: keydown only intervenes when
  `from !== -1 && to !== -1` (:244); else falls through to default. PASS (no
  regression).
- §4.d model intact — `IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g` (:1159), stable seq
  `nextImageSeqRef.current++` (:526), bidirectional sync `onComposerChange`
  reconcile (:580-592) + chip-X `removeImageRef` strip (:480-488), send block
  `## Attached files` `- #${a.seq} → ${a.path}` (:129). All unchanged. PASS.

i18n: no new keys — `workspace.chat.imageLabel`/`removeImage` present with en/ko
parity (en.json/ko.json :303-304); `[Image #N]` token literal is en/ko common
(protected). renderer-only — no electron-main/IPC change for §4.e.

Result: §4.e = PASS (code). Runtime caret/keystroke paint → user-verify.

**§4.e user-verify steps:**
1. Paste an image into the composer → an `[Image #1]` token appears at the caret + a `#1` chip above.
2. Place the caret immediately AFTER `]` and press Backspace ONCE → the whole `[Image #1]` (and its padding space) disappears in one stroke; no `[Image #1` remnant survives; the chip vanishes too.
3. Place the caret immediately BEFORE `[` and press Delete ONCE → same atomic removal.
4. Put the caret in the MIDDLE of a token and press Backspace/Delete → whole token removed, no half-token.
5. Drag-select across a token (partially) and delete → selection snaps to the token boundary; no half-token left behind.
6. Paste two images (`[Image #1]`, `[Image #2]`), delete only #1 → #2 keeps its number (no renumber).
7. Type ordinary text and Backspace/Delete normally → behaves exactly as before (no regression).
