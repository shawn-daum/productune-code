---
ticket_id: T-PATCH-106
title: "PO chat 하이퍼링크 — 절대경로 / file:// 링크 클릭 시 적절한 뷰어로 열기"
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pass
qa_loops: 0
slug: pochat-absolute-link-open
area_tags: [gui/chat, gui/linkify, gui/doctrine]
created_at: 2026-06-10
---

| T-PATCH-106 | pochat-absolute-link-open | review |

# T-PATCH-106 — PO chat 절대경로 / `file://` 링크 클릭 시 뷰어로 열기

> GUI 수정 (PO chat 하이퍼링크). T-PATCH-093 의 linkify/routing 을 **넓히는(widening)** 작업이며 신규 구현이 아님. 기존 `ptn:` 라우팅과 false-match 가드는 그대로 유지한다.

## §1 Request (verbatim) + Root cause

### 사용자 지시 (verbatim, 스크린샷 동반)

> PO 대답에 `habit.md` 라는 하이퍼링크가 떠 있는데(실제 경로 `/Users/x/.productune/po/habit.md`), 클릭하면 아무 일도 안 일어남. PO 가 친절하게 이런 말까지 덧붙임:
>
> "(터미널/뷰어에 따라 file:// 링크가 클릭이 안 될 수 있는데, 그땐 위 경로를 직접 열어주세요)"

즉, 링크는 보이고 클릭도 되는데 **핸들러가 없어서 무반응(dead link)** 인 상태.

### Root cause (코드 인스펙션)

링크가 죽는 경로는 두 갈래이며, 둘 다 절대경로 / `file://` 를 다루는 로직이 **아예 없어서** 발생한다.

1. **클릭 라우팅에 절대경로/`file://` 핸들러가 없음** — `packages/gui/src/components/workspace/chat/MdRenderer.tsx` 의 `routeLink(href)` (~line 30-58) 는 오직:
   - `ptn:ticket/...`
   - `ptn:file/...` (프로젝트 상대경로)
   - `https?://...`

   세 가지만 분기한다. PO 가 `[habit.md](file:///Users/x/.productune/po/habit.md)` 같은 **명시적 markdown 링크**를 emit 하면 `href` 가 `file://` 로 시작 → 어느 분기에도 안 걸리고 `routeLink` 가 **그냥 return**. `MdLink.handleClick` (~line 72-75) 은 `e.preventDefault()` 후 `routeLink` 만 호출하므로, 브라우저 기본 동작도 막힌 상태에서 아무 핸들러도 안 타 **무반응**. → 사용자가 본 정확한 증상.

2. **bare 절대경로는 linkify 가 매칭조차 안 함** — `packages/gui/src/lib/linkifyText.ts` 의 `LINK_RE` (~line 49-50) 파일 분기는 rooted-relative 만 본다:
   - `(?<![\w/.\-])\.?\/?(?:(?:docs|packages|src|\.productune)\/…\.ext | (config|package|tsconfig).json | .env*)`
   - 선두 lookbehind `(?<![\w/.\-])` 가 경로 중간 매칭을 막는다. `/Users/x/.productune/po/habit.md` 같은 **절대경로**는 `~/.productune` (홈 하위 Tier-2) 든 `/Users/.../` 든 이 규칙이 **매칭하지 않음**. 따라서 PO 가 bare 절대경로를 던지면 clickable 링크 자체가 안 생기거나, `file://` 명시 링크로만 떠서 (1) 의 dead link 가 된다.

3. **doctrine 파일은 `doctrine-file` 탭으로 열어야 함** — `~/.productune/<persona>/habit.md` 는 **Tier-2 personal doctrine** (projectDir 밖), `docs/<persona>/habit.md` 는 **Tier-1 project doctrine**.
   - 여는 방법: `PersonaDefTab.tsx` (~line 212) 가 표준 호출 형태를 보여준다:
     `openTab(tabId, 'doctrine-file', { tier, persona: <dir>, absPath, relName, editable }, title)`.
   - `persona` 는 **dir 이름**(`developer`)을 받는다. GUI key `dev` → dir `developer` 매핑 주의 (`electron/ipc/doctrine.ts` `PERSONA_DIRS = {po, designer, developer, qa}`).
   - 로드는 `api.doctrineReadFile(absPath, projectDir)` → `doctrine:readFile` IPC. 이 IPC 의 `isAllowedDoctrinePath` 가 `~` 를 `expandHome` 으로 확장하고 Tier-0/1/2 root containment + `habit.md | bookshelf/*.md` 형상 검사를 수행하므로, **Tier-2 절대경로 / 틸드 경로를 안전하게 읽을 수 있다.** Tier-1 매칭에는 `projectDir` 가 필요.

4. **`artifacts:readFile` 는 Tier-2 를 못 읽음** — `electron/ipc/artifacts.ts` (~line 137) 의 containment 가드는 `resolved.startsWith(projectDir + sep)` 라서, `~/.productune/...` 같은 **projectDir 밖 절대경로를 거부**한다. 따라서 doctrine 파일은 반드시 doctrine route 로 가야 하며, 기존 `ptn:file/` → `markdown` 탭 경로(내부적으로 artifacts readFile 계열)로 보내면 안 된다.

5. **in-pane 로 못 그리는 경로용 fallback IPC 부재** — 현재 preload/IPC 에는 `shell:openExternal` (`electron/ipc/project.ts` ~line 121) 만 있고 **`shell:openPath` 류 로컬 파일 열기 IPC 가 없다.** 따라서 fallback 을 쓰려면 신규 IPC + preload 노출이 필요하다.

## §2 Acceptance

- [x] **AC-1** PO chat 에서 Tier-2 personal doctrine 절대/`file://`/틸드 링크 (`~/.productune/<persona>/habit.md`, `/Users/<u>/.productune/<persona>/habit.md`, `file:///Users/<u>/.productune/<persona>/habit.md`, 그리고 `bookshelf/*.md`) 클릭 시 → `doctrine-file` 탭이 **tier 2** 로 열리고 내용이 렌더된다. 무반응 아님.
- [x] **AC-2** PO chat 에서 Tier-1 project doctrine 절대경로 (`<projectDir>/docs/<persona>/habit.md` 또는 `docs/<persona>/habit.md`) 클릭 시 → `doctrine-file` 탭이 **tier 1** 로 열린다. `projectDir` 는 `useWorkspace.getState().project?.projectDir` 에서 취득.
- [x] **AC-3** persona dir 매핑이 정확하다: 경로의 persona 세그먼트(`po|designer|developer|qa`)를 그대로 `doctrine-file` 탭의 `persona` prop(=dir 이름)으로 넘긴다. (key→dir 역매핑 불필요 — 경로엔 이미 dir 이름이 들어있음.)
- [x] **AC-4** doctrine 가 아닌 **프로젝트 내부 절대경로** (`<projectDir>/...` 하위이지만 doctrine 가 아님) 클릭 시 → projectDir 기준 상대경로로 변환해 기존 상대 파일 뷰어 라우팅(`ptn:file/<rel>`, env-target 이면 env 뷰어)으로 보낸다. 즉 §1-4 의 artifacts 거부에 걸리지 않도록 projectDir-relative 로 매핑.
- [x] **AC-5** 위 어느 분류에도 안 맞는 절대경로(프로젝트 밖 + doctrine 아님)는 **안전 fallback**: 신규 `shell:openPath` IPC 로 OS 기본 앱에서 연다. (in-pane 렌더 불가 경로를 dead link 로 두지 않음.)
- [x] **AC-6** linkify 가 bare 절대 doctrine 경로를 **clickable 내부 링크**로 변환한다 — 죽은 `file://` 링크가 아니라 `routeLink` 가 처리 가능한 href 로. (구현은 §4 참조: linkify 가 절대 doctrine 경로를 인식하도록 `LINK_RE` 확장.)
- [x] **AC-7** 기존 동작 **회귀 없음**: `ptn:ticket/`, `ptn:file/` (상대), `https?://`, env-target 라우팅, code-block / 기존 markdown 링크 / URL 내부 false-match 가드 전부 그대로. T-PATCH-093 의 linkify 케이스 보존.
- [x] **AC-8** 안전 가드 유지: doctrine route 는 `.md` + `habit.md | bookshelf/*.md` 형상만 통과(IPC `isAllowedDoctrinePath` 가 이미 강제). traversal/non-md 는 거부. fallback `shell:openPath` 는 절대경로에 한해 호출하고, `file://` 는 URL 디코드 후 로컬 path 로 정규화.

## §3 Out of scope

- doctrine 파일 **편집/저장/PO-review 플로우** 변경 (DoctrineFileTabHost 의 save-choice/conflict 로직). 본 티켓은 **열기(open)** 만 다룬다. `doctrine-file` 탭은 기본 render(Preview) 로 열리면 충분.
- linkify 의 ticket/url/env 규칙 자체 변경 (확장은 절대 doctrine/절대 파일 인식분만).
- 멀티-hue syntax highlight (OQ-A9-1, PO 미결) — 무관.
- 새로운 탭 타입 추가. 기존 `doctrine-file` / `markdown` / `project-env` 재사용.
- 비-doctrine 절대경로의 in-pane 렌더(코드/이미지 뷰어 신설). 그건 fallback(`shell:openPath`)으로 충분.

## §4 Implementation plan

세 지점 + 1 신규 IPC.

### (a) `packages/gui/src/lib/linkifyText.ts` — 절대 경로 인식 확장 (AC-6)

- `LINK_RE` 의 파일 분기에, bare **절대 doctrine 경로** 와 **절대 프로젝트 경로** 를 추가 인식하는 alternation 을 더한다. 우선순위(alternation 순서)는 기존 URL(alt-1) / 기존 markdown 링크(alt-2) 뒤에 와야 URL/링크 내부 false-match 가 안 난다.
  - 인식 대상: `~/.productune/<persona>/(habit.md | bookshelf/<name>.md)`, `file:///…/.productune/…`, 그리고 `/…/.productune/<persona>/…\.md` 형태의 절대경로.
  - 선두 가드: 기존 `(?<![\w/.\-])` 가 절대경로 선두 `/` 매칭을 막으므로, 절대경로 분기는 **`file://` 또는 `~` 또는 `/Users|/home` 같은 명시적 절대 prefix** 로 시작하는 토큰만 매칭하도록 별도 alternation 으로 작성(중간 경로 false-match 방지). bare 한 임의 `/x/y` 전체를 링크화하지 말 것 — doctrine/`.productune` 또는 `file://` 시그널이 있을 때만.
- `_linkifySegment` 의 `filePath` 핸들러를 확장: 매칭된 절대/`file://` 토큰은 **정규화하지 않고 그대로** href 로 넘기되(절대경로는 `ptn:file/` 로 감싸면 상대로 오인되므로) — **권장**: 절대/`file://` 토큰은 그대로 `[basename](<absToken>)` 형태로 두고, 라우팅 분류는 (b) `routeLink` 가 담당하게 한다. (linkify 는 "clickable 하게 만들기"만, 분류는 routeLink 일원화.)
  - basename 은 `file://` 디코드/경로 split 후 마지막 세그먼트.

### (b) `packages/gui/src/components/workspace/chat/MdRenderer.tsx` — `routeLink` 분기 추가 (AC-1~5)

`routeLink(href)` 에 기존 `ptn:`/`https?://` 분기는 그대로 두고, 그 뒤에 **절대/`file://` 분류 분기**를 추가한다:

1. **정규화**: `file://` 면 `new URL(href).pathname` + `decodeURIComponent` 로 로컬 절대 path 로 변환. `~/` 시작이면 그대로(또는 home 확장은 IPC `expandHome` 에 위임 — doctrine IPC 가 `~` 를 받음). 일반 절대경로(`/...`)는 그대로.
2. **doctrine 분류** (AC-1/2/3): 정규화된 path 가 doctrine 형상이면 — 즉
   - Tier-2: `~/.productune/<persona>/...` 또는 `<home>/.productune/<persona>/...`
   - Tier-1: `<projectDir>/docs/<persona>/...`
   인지 검사. persona ∈ `{po, designer, developer, qa}`, 파일은 `habit.md` 또는 `bookshelf/*.md`. 매칭되면:
   `openTab(\`doctrine-file:${absPath}\`, 'doctrine-file', { tier, persona: <dir>, absPath, relName, editable: false, projectDir }, basename)`
   - `tier`/`persona(dir)`/`relName`(`habit.md` | `bookshelf/<n>.md`) 를 경로에서 도출.
   - `projectDir = useWorkspace.getState().project?.projectDir` (Tier-1 IPC 검증에 필요; Tier-2 엔 무해).
   - 최종 통과 여부는 어차피 `doctrine:readFile` IPC `isAllowedDoctrinePath` 가 재검증하므로, 렌더러 측 분류는 라우팅 결정용 best-effort.
3. **프로젝트 내부 비-doctrine 절대경로** (AC-4): `projectDir` 가 있고 path 가 `projectDir + sep` 하위면 → `const rel = path 상대화` 후 기존 `ptn:file/` 경로 재사용(env-target 이면 `isEnvTarget` → project-env 탭). 즉 절대경로를 상대로 내려 `routeLink('ptn:file/' + rel)` 재진입 또는 동일 분기 호출.
4. **그 외 절대경로** (AC-5): `api.openPath?.(absPath)` (신규 IPC, §4-d) 호출. 실패/부재 시 no-op 대신 toast 또는 콘솔 경고는 선택.
- `getLinkColor` 에 doctrine 링크용 색(예: 기존 file cyan `#38BDF8` 재사용 또는 doctrine 보라 계열) 추가 — 시각적 회귀 없이. `MdLink.handleClick` 은 변경 불필요.

### (c) persona key→dir 매핑 주의

경로 세그먼트는 이미 **dir 이름**(`developer`)이다. `doctrine-file` 탭의 `persona` prop 은 dir 이름을 받으므로 (PersonaDefTab 호출과 동일) **추가 매핑 불필요**. key(`dev`)로 역변환하지 말 것.

### (d) 신규 fallback IPC — `shell:openPath` (AC-5)

- `electron/ipc/project.ts`: `ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(<expandHome(p) 후 절대경로>))` 추가. 절대경로만 허용(상대/빈 값 거부).
- `electron/preload.ts`: `openPath: (p) => ipcRenderer.invoke('shell:openPath', p)` 노출 (기존 `openExternal` 옆).
- `shell` 은 이미 `electron` 에서 import 가능 (`project.ts` 가 `shell.openExternal` 사용 중).

## §5 QA smoke

수동 스모크(렌더러 + IPC 동작 확인). Electron 앱 기동 후 PO chat 버블에 아래 케이스를 넣고 클릭:

1. **Tier-2 doctrine, 명시 markdown 링크**: `[habit.md](file:///Users/<u>/.productune/po/habit.md)` → 클릭 시 `doctrine-file` 탭(tier 2)이 열리고 habit.md 내용 렌더. (사용자 원증상 해소)
2. **Tier-2 doctrine, bare 틸드 경로**: 본문에 `~/.productune/designer/habit.md` → linkify 가 clickable 링크 생성, 클릭 시 tier 2 doctrine 탭.
3. **Tier-2 bookshelf**: `~/.productune/po/bookshelf/x.md` → tier 2 doctrine 탭.
4. **Tier-1 project doctrine**: `docs/po/habit.md` (또는 절대 `<projectDir>/docs/po/habit.md`) → tier 1 doctrine 탭. (`projectDir` 미설정 시 graceful — IPC 가 reject 하면 fallback 으로 빠짐)
5. **프로젝트 내부 비-doctrine 절대경로**: `<projectDir>/docs/artifacts/v0.5/foo.md` → 상대 변환되어 markdown 탭. env 파일이면 project-env 탭.
6. **프로젝트 밖 비-doctrine 절대경로**: `/etc/hosts` 류 → `shell:openPath` 로 OS 앱 열림(또는 거부 toast). 앱 크래시/무반응 없음.
7. **회귀**: `T-P4-123` → ticket 탭, `https://example.com` → browser 탭, ` `code` ` / 기존 `[t](url)` 링크 false-match 없음.
8. dev key 경로 주의: `~/.productune/developer/habit.md` → persona dir `developer` 로 정상 분류(‘dev’ 로 오변환 안 됨).

dev: `cd packages/gui && pnpm dev` (config 의 build/smoke 커맨드 기준). 본 라운드 `qa_status: smoke`, `qa_loops: 0`.

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-developer | opus/medium | impl | §4 전부 구현. linkify `LINK_RE` 에 alt-5 (`file://`/`~`/`/…` + `.productune/<persona>/…\.md`) 추가 → `[basename](ptn:doctrine/<absToken>)` 로 clickable. `_linkifySegment` 에 absDoctrine 그룹 핸들러 추가(분류는 routeLink 일원화). MdRenderer `routeLink` 에 `ptn:doctrine/` + bare `file://`/`~`/`/…` 분기 추가 → `routeAbsPath`: (1) doctrine 형상이면 `doctrine-file` 탭(canonical openTab 호출, tier/persona/relName 경로에서 도출, editable:false, projectDir threaded), (2) in-project 비-doctrine 절대경로면 projectDir-relative 로 `ptn:file/` 재진입(env-target 보존), (3) 그 외엔 신규 `shell:openPath` IPC fallback. getLinkColor 에 doctrine violet `#A78BFA`. 신규 IPC: `electron/ipc/project.ts` `shell:openPath` (expandHome → isAbsolute 가드 → `shell.openPath`), `electron/preload.ts` SHELL region 에 `openPath` 노출(artifactsListTree/attachments 미간섭). 회귀 가드: alt-5 가 URL/markdown-link 분기 뒤에 위치, code-block splitter 선처리 유지. `tsc --noEmit -p tsconfig.json` clean. qa_status: smoke. |
| 2026-06-10 | pdt-qa | opus/standard | qa(code-inspect) | PASS (code-inspection). AC-1~8 §2 vs 코드 대조 전부 충족. linkify alt-5 가 LINK_RE 의 5번째 그룹(URL=alt1/markdown-link=alt2 뒤)에 위치 → URL/기존링크 내부 false-match 없음(AC-7); `file://` 토큰 start-anchored, 절대경로는 `.productune/<persona>/` 시그널 있을 때만 매칭(bare `/x/y` 비링크화). `_linkifySegment` absDoctrine 핸들러가 `file://` 디코드 후 basename 산출, raw 토큰을 `ptn:doctrine/` 로 verbatim 전달(AC-6). MdRenderer `routeLink`: ptn:ticket/ptn:file(env-target 분기 포함)/https 기존 분기 보존, `ptn:doctrine/` + bare abs/`~`/`file://` 분기 추가(AC-7 회귀 없음). `routeAbsPath` (1) classifyDoctrine→Tier-2 `…/.productune/<persona>/<rel>.md`, Tier-1 `<projectDir>/docs/<persona>/<rel>.md`, persona=경로 dir(`developer` 그대로, key역매핑 없음 AC-3), openTab 호출형이 DoctrineFileTabHost 소비 props(absPath/relName/tier/persona/projectDir)와 일치(AC-1/2), editable:false(§3 open-only). (2) in-project 비-doctrine→projectDir-relative `ptn:file/` 재진입, env-target 보존(AC-4). (3) 그외→`api.openPath` shell fallback, 부재 시 console.warn(AC-5). 신규 IPC `shell:openPath` expandHome(`~`/`~/`)→`path.isAbsolute` 가드(상대/빈값 거부)→`shell.openPath`, preload SHELL region 노출(AC-5/8). 안전 가드: doctrine route 최종검증은 `doctrine:readFile`→`isAllowedDoctrinePath`(expandHome + Tier0/1/2 containment + habit.md\|bookshelf/*.md 형상 + json/env/state 거부)에 위임(AC-8). 시각/런타임 항목은 빌드 GREEN(gui tsc 0) 전제 하 user-verify 로 이관(§5 스모크). qa_status: smoke→pass. |
