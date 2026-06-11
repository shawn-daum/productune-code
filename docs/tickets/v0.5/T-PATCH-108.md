---
ticket_id: T-PATCH-108
version: v0.5
round: patch
type: feature
status: review
assignee: pdt-developer
model: sonnet
effort: high
estimated_complexity: L3
qa_status: pass
qa_loops: 0
slug: tooluse-detail-plumbing
area_tags: [gui/chat, gui/tooluse, infra/po-runner]
created_at: 2026-06-10
---

# T-PATCH-108 — 도구사용 UI per-tool 상세정보 plumbing

## §1 Request (verbatim)

> 현재 도구사용ui에서 edit아래에 상세정보없음만 나오는데, 이거 claude code처럼 상세 정보 보이게할수있어? 토글은 유지.

해석: tool-use UI 의 각 도구 행(예: Edit)을 펼치면 지금은 `상세 정보 없음`(detail unavailable) 한 줄만 나온다. Claude Code 처럼 도구의 **입력 인자**(가능하면 결과까지)를 보여달라. **기존 토글 구조는 유지**.

## §2 Acceptance

- [x] AC1 — `ToolUseGroup` 의 inner `ToolRow` 를 펼치면 `상세 정보 없음` 대신 해당 도구의 **입력 상세**가 Claude-Code 스타일로 표시된다.
- [x] AC2 — 도구 타입별 포맷이 적용된다 (최소):
  - `Edit` / `MultiEdit` → 파일 경로 + old→new(또는 변경 요약). MultiEdit 은 N edits 요약.
  - `Write` → 파일 경로 (+ 본문은 truncated preview).
  - `Bash` → command (+ description 있으면 부제).
  - `Read` → 파일 경로 (offset/limit 있으면 병기).
  - `Grep` / `Glob` → pattern (+ path).
  - `Task` → subagent_type + prompt 요약.
  - generic(그 외 모든 도구) → pretty-print 된 input JSON.
- [x] AC3 — **토글 유지**: outer 그룹 disclosure + inner per-tool disclosure 구조/키보드 접근성/기본 collapsed 동작이 그대로 유지된다. 회귀 금지.
- [x] AC4 — 큰 입력은 **truncate** 된다(행 단위 + 문자 단위 cap). 잘린 경우 `…` 또는 `(+N줄)` 표시. UI 가 터지지 않는다.
- [x] AC5 — 상세가 **진짜로 없을 때**(input 미수신/빈 객체)는 graceful fallback 으로 기존 `상세 정보 없음` 문구를 그대로 보여준다.
- [x] AC6 — echo 모드/도구 없는 턴에서 회귀 없음. 기존 tool-group fold(N=1 포함), 텍스트 세그먼트 interleave, 세션 divider 동작 불변. (po-runner emit 의 `text` 하위호환 유지 + segmentation/seal 로직 불변)
- [ ] AC7 — (선택/Phase-2) `tool_result` 가 캡처되면 입력 상세 아래에 결과(또는 결과 요약/에러)도 표시한다. 본 라운드 필수 아님 — input 상세가 1차 산출물. (이번 라운드 미구현 — input 상세만 배송)

## §3 Out of scope

- chat.json 영속화: tool trace 메시지는 현재 persist 되지 않음(poEvents onDone 는 text segment 만 저장). reload 후 도구 상세 재현은 **OOS** — 현 라운드는 in-memory(턴 생존) 상세만. (재현은 별도 데이터-plumbing 티켓.)
- `tool_result` 풀 캡처가 §4 phase-2 추정치를 크게 초과하면 result 는 보류(AC7 선택). input 상세만 먼저 배송.
- diff 신택스 하이라이팅/컬러 diff 렌더러. 본 라운드는 monospace plain text + old/new 라벨 수준.
- AskUserQuestion / Task(delegating)의 기존 전용 처리 경로 변경 금지(그대로 둠).
- 새 아이콘/디자인 토큰 추가 금지 — 기존 DS §7(lucide, --text-muted, mono) 안에서.

## §4 Implementation plan

데이터 흐름(현재): `po-runner.handleStreamJsonLine` 가 assistant `tool_use` part 를 만나면
`cb.onAnnounce(msgId, { level:'tool', text:'→ tool: <name>' })` 만 emit → preload `poOnAnnounce` →
`poEvents` 가 `kind:'trace', traceLevel:'tool'` Message 로 적재 → `ChatPanel.groupToolTraces` 가 인접 tool trace 를 fold → `ToolUseGroup` 렌더. **`part.input` 은 파싱되어 있으나 generic 경로에서 버려진다**(po-runner.ts:601). 결과(`tool_result`)는 assistant content 가 아니라 별도 `type:'user'` 스트림 envelope 로 도착하므로 `tool_use_id` 상관이 필요 → result 는 phase-2.

### (A) po-runner — tool input 캡처 & forward

파일: `packages/gui/electron/po-runner.ts`

1. `AnnouncePayload`(L53)에 옵션 필드 추가:
   ```ts
   /** T-PATCH-108: tool_use.input — only set for level:'tool'. */
   toolName?: string
   toolInput?: unknown
   ```
2. 도구 emit 지점(L601)을 수정: `text` 는 그대로 두고(하위호환), `toolName: part.name`, `toolInput: part.input` 를 payload 에 실어 보낸다. `AskUserQuestion`/`Task` 의 기존 special-case 경로는 변경 금지(Task 는 generic announce 후 별도 health emit 하므로 toolInput 만 추가로 실어주면 됨 — ToolRow 가 Task 도 포맷 가능).
3. `toolInput` 직렬화 정책: po-runner 는 **가공하지 않고 raw input 객체를 그대로 전달**(직렬화/truncate 는 renderer 책임 — AC4 와 single source). IPC 구조화 클론 가능한 plain object 이므로 그대로 통과.
4. (phase-2, AC7) `tool_result` 캡처: `handleStreamJsonLine` 에 `type === 'user'` 분기 추가 → `message.content[]` 중 `type:'tool_result'` 인 part 의 `tool_use_id` + `content`(string|array) 를 모아 새 콜백 `onToolResult(msgId, { toolUseId, resultText, isError })` 로 emit. tool_use part 에도 `id` 를 함께 forward 해 renderer 가 상관. **추정치 초과 시 본 단계 생략하고 AC5 fallback 유지.**

### (B) 이벤트/타입/preload 전달

- `preload.ts` `poOnAnnounce`(L309): payload 타입을 `{ level; text; kind?; code?; toolName?; toolInput?: unknown }` 로 확장(현재 `kind`/`code` 가 타입에서 빠져있는 것도 같이 정리). listener 는 payload 통째 전달이라 로직 변경 최소.
- `lib/types.ts` `Message`(L113): trace 상세용 옵션 필드 추가
  ```ts
  /** T-PATCH-108: tool_use.input for kind:'trace' & traceLevel:'tool'. */
  toolInput?: unknown
  /** T-PATCH-108: tool name parsed from runner (avoids re-stripping text prefix). */
  toolName?: string
  ```
- `store/poEvents.ts` `poOnAnnounce` 핸들러(L172): trace Message 생성 시 `toolName: payload.toolName`, `toolInput: payload.toolInput` 를 함께 적재. 나머지(seal/segmentation) 불변.
- (phase-2) `onToolResult` 용 IPC 채널 + 핸들러 추가: tool trace Message 에 `toolResult?: { text; isError }` 를 `toolUseId` 매칭으로 patch. 매칭 키가 필요하면 trace Message 에 `toolUseId?` 도 추가.

### (C) ToolUseGroup — per-tool 렌더 (토글 유지)

파일: `packages/gui/src/components/workspace/chat/ToolUseGroup.tsx`

1. `ToolRow` 시그니처를 `{ name }` → `{ tool: Message }` 로 변경(또는 `name`+`input` 둘 다). `ToolUseGroup` 의 `tools.map` 은 `<ToolRow key={m.id} tool={m} />` 로.
2. 펼침 시 fallback 라인 대신 `formatToolDetail(tool)` 결과를 렌더. **outer/inner disclosure, chevron, aria-expanded, 기본 collapsed 는 그대로**(AC3).
3. `formatToolDetail(m: Message): { lines: string[] } | null` — `m.toolName`(없으면 기존 `toolName(m)` text-strip fallback) + `m.toolInput` 으로 분기:
   - `Edit`: `path` 한 줄 + `- old…` / `+ new…`(각 truncate). 다중행이면 첫 N줄.
   - `MultiEdit`: `path` + `edits[].length`개 요약(첫 1~2개 미리보기).
   - `Write`: `file_path` + `content` preview(truncated).
   - `Bash`: `command`(truncated, 줄바꿈 보존 N줄) + `description` 부제.
   - `Read`: `file_path`(+ `offset`/`limit`).
   - `Grep`/`Glob`: `pattern`(+ `path`/`glob`).
   - `Task`: `subagent_type` + `prompt`(truncated) 또는 `description`.
   - default: `JSON.stringify(input, null, 2)` (truncated).
   - input 이 null/undefined/`{}` → `null` 반환 → AC5 fallback 문구.
4. **Truncation(AC4)**: 공통 헬퍼 — 한 값 cap 예: 단일 라인 200자, 전체 detail 최대 ~12줄, 초과 시 마지막에 `… (+N줄)`. 매직넘버는 파일 상단 const 로.
5. 스타일: 기존 `rowDetail`(L181) 재사용 + 멀티라인용 `whiteSpace:'pre-wrap'`, `wordBreak:'break-all'` 추가. italic 은 fallback 전용으로 남기고 실제 detail 은 non-italic mono. 새 색/아이콘 금지(§3).
6. (phase-2/AC7) `m.toolResult` 있으면 input 블록 아래 `결과:` 섹션 추가(에러면 muted-red 대신 기존 error 톤 재사용, 신규 토큰 금지).

### (D) i18n

파일: `packages/gui/src/locales/en.json` + `ko.json` (L314 블록)

- `toolDetailUnavailable` 키는 **유지**(AC5 fallback).
- 라벨 키 추가(렌더 라벨 하드코딩 금지):
  - `toolDetail.truncatedMore`: ko `"… (+{{count}}줄)"` / en `"… (+{{count}} more lines)"`
  - `toolDetail.result`: ko `"결과"` / en `"Result"` (phase-2)
  - `toolDetail.error`: ko `"오류"` / en `"Error"` (phase-2)
- 도구 타입 라벨(`path:`, `command:` 등)은 식별자 성격이라 비번역 리터럴 허용 — 단 사용자 가독 문구는 i18n.

## §5 QA smoke

- 빌드/타입: `tsc` + GUI build 통과(`AnnouncePayload`/`Message`/preload 타입 확장 정합).
- 런타임(playwright-electron, surfaces.gui.smoke):
  1. claude 실 연결 또는 fixture stream-json 으로 `Edit`/`Bash`/`Read`/generic 도구가 섞인 턴을 1회 발생.
  2. tool-group outer toggle 펼침 → inner `Edit` row 펼침 → `상세 정보 없음` 이 **아님**을 확인하고 파일 경로 텍스트가 보이는지 assert.
  3. `Bash` row → command 문자열 노출 assert.
  4. input 이 없는(또는 빈) 도구를 fixture 로 주입 → 기존 `상세 정보 없음` fallback 이 그대로 나오는지 assert (AC5).
  5. 매우 긴 input(예: 500줄 Write content) fixture → truncate `… (+N줄)` 노출 + 레이아웃 안 깨짐 assert (AC4).
  6. 회귀: outer/inner 토글 기본 collapsed, chevron 회전, N=1 그룹, 텍스트↔도구 interleave 순서 불변 (AC3/AC6).
- phase-2 가 포함됐다면: tool_result fixture 로 `결과` 섹션 + 에러 케이스 1건 추가 assert.

## §6 Persona Activity

### pdt-developer — impl (status → review)

per-tool input 상세 plumbing 구현 완료 (phase-1 = input 상세). AC7(tool_result) 은 본 라운드 미구현.

**Files**
- `packages/gui/electron/po-runner.ts` — `AnnouncePayload` 에 옵션 `toolName?: string` / `toolInput?: unknown` 추가; assistant `tool_use` generic emit 지점에서 `cb.onAnnounce` payload 에 `toolName: part.name` + `toolInput: part.input`(raw, 미가공) 동봉. `text` 는 하위호환 그대로. `AskUserQuestion` early-continue + `Task` 의 delegating health 재-emit 경로는 무변경(Task 도 generic announce 를 타므로 toolInput 자동 동봉).
- `packages/gui/electron/preload.ts` — `poOnAnnounce` 바인딩 region **만** 편집: cb/listener payload 타입을 `{ level; text; kind?; code?; toolName?; toolInput? }` 로 확장(누락돼 있던 `kind`/`code` 도 함께 정리). SHELL region(`openPath`) / ARTIFACTS region(`artifactsListTree`) 미접촉.
- `packages/gui/src/lib/types.ts` — `Message` 에 옵션 `toolInput?: unknown` / `toolName?: string` 추가(kind:'trace' & traceLevel:'tool' 용).
- `packages/gui/src/store/poEvents.ts` — `poOnAnnounce` 핸들러 payload 타입에 `toolName`/`toolInput` 추가하고 trace Message 생성 시 동반 적재. segmentation/seal 로직 불변(여전히 `level==='tool'` 만 seal).
- `packages/gui/src/components/workspace/chat/ToolUseGroup.tsx` — `formatToolDetail(m)` 추가(Edit/MultiEdit/Write/Bash/Read/Grep/Glob/Task/generic 분기 + per-value `clip()` 200자 cap). `ToolRow` 시그니처 `{ name }`→`{ tool: Message }`. 신규 `ToolRowDetail` 가 detail 렌더 + 행 단위 12줄 cap + `… (+N)` tail. input 부재(null/비-object/빈 객체/포맷 결과 0줄)면 `null` 반환 → 기존 `toolDetailUnavailable` italic fallback 유지. outer/inner disclosure·chevron·aria-expanded·기본 collapsed 무변경. 실제 detail 스타일 = non-italic mono + `pre-wrap`/`break-all`.
- `packages/gui/src/locales/en.json` / `ko.json` — `toolDetailUnavailable` 유지. nested `toolDetail.{truncatedMore,result,error}` 추가(en/ko parity). 보호 status 리터럴 미사용.

**Verify**: `tsc --noEmit -p tsconfig.json` → **0 errors**. full `pnpm build` 미실행(비요청). commit 미수행.

### pdt-qa — verify by code inspection (qa_status smoke → pass)

코드 검증 only(빌드/smoke 미실행 — central build GREEN: gui tsc 0 / parity 778 / protected OK / smoke pass 기준 수용). source 무수정.

**§2 AC ↔ code 대조**
- AC1 ✅ `ToolUseGroup.tsx:226` 펼침 시 `ToolRowDetail` 가 `formatToolDetail()` 결과 렌더; input 부재 시에만 `toolDetailUnavailable` 라인(L236-239).
- AC2 ✅ `formatToolDetail`(L82-158) switch 가 Edit/MultiEdit/Write/Bash/Read/Grep/Glob/Task/default(JSON) 전부 커버. Edit=path+`-/+`, MultiEdit=path+`N edits`+첫 2개, Write=path+content lines, Bash=command lines+`# desc`, Read=path+offset/limit, Grep/Glob=pattern/path/glob, Task=subagent+prompt/desc, default=`JSON.stringify(...,2)`.
- AC3 ✅ outer disclosure(L169-184, `aria-expanded`, chevron rotate, `useState(false)` collapsed) + inner per-row disclosure(`ToolRow` L203-228, 동일 패턴) 구조 보존. `ToolRow` 시그니처 `{ tool: Message }`, `tools.map` → `<ToolRow key={m.id} tool={m} />`.
- AC4 ✅ per-value `clip()` 200자 cap(`MAX_LINE_CHARS`); row-level `MAX_DETAIL_LINES=12` slice + overflow 시 `toolDetail.truncatedMore` `… (+N)` tail(L242-253). `rowDetail` 스타일 `whiteSpace:'pre-wrap'`/`wordBreak:'break-all'`(L334-335) → 레이아웃 보호.
- AC5 ✅ `hasInput()`(L67-74) null/undefined/비-object/array/빈 객체 reject; 포맷 결과 0줄도 `null` 반환(L156) → italic `rowDetailFallback` `toolDetailUnavailable`(en `detail unavailable` / ko `상세 정보 없음`).
- AC6 ✅ po-runner emit 의 `text:'→ tool: <name>'` 하위호환 유지(po-runner.ts:611-616); poEvents seal 로직 `level==='tool'` 만 seal 불변(poEvents.ts:179-186 주변); ChatPanel `groupToolTraces`(ChatPanel.tsx:867)/`isToolTrace`(L864) 무변경, `<ToolUseGroup tools={item.tools} />`(L574) full Message 전달.
- AC7 ⏸ phase-2(tool_result) 의도적 미구현 — 티켓 명시. i18n `toolDetail.result/error` 키만 선반영(en/ko parity OK). 비-fail.

**plumbing 정합**: po-runner `AnnouncePayload.toolName/toolInput`(L60-66) raw forward → preload `poOnAnnounce` cb/listener payload 타입 확장(preload.ts:315-337, SHELL/ARTIFACTS region 미접촉) → poEvents trace Message 에 `toolName/toolInput` 적재(poEvents.ts:181-182) → types `Message.toolInput/toolName`(types.ts:132/135). end-to-end 일관. AskUserQuestion early-continue(po-runner.ts:599-606) + Task delegating re-emit(L620-623) 경로 무변경.

**verdict: PASS (code inspection).** in-memory(턴 생존) 상세만 — persistence-across-reload 은 §3 명시 OOS(poEvents onDone 는 text segment 만 persist).

**user-verify (runtime, eyeball — central smoke 외 수동 확인 권장)**
1. Edit/Bash/Read/generic 도구 섞인 턴 1회 발생 → tool-group outer 토글 펼침 → Edit row 펼침: `상세 정보 없음` 이 **아니고** `path: …` + `-/+` 표시 확인.
2. Bash row 펼침: command 문자열 노출 확인.
3. input 없는/빈 도구: `상세 정보 없음`(italic) fallback 유지 확인.
4. 500줄 Write content: `… (+N줄)` tail + 레이아웃 안 깨짐 확인.
5. 회귀: outer/inner 기본 collapsed, chevron 회전, N=1 그룹, 텍스트↔도구 interleave 순서 불변.
6. (참고) reload 후 도구 상세 사라짐 = 정상(OOS, 회귀 아님).

qa_status: smoke → **pass** (verifiable code 전부 PASS; runtime 은 user-verify 위임, AC7 은 의도적 phase-2 보류).
