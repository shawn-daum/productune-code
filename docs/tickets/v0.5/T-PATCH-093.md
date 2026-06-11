---
ticket_id: T-PATCH-093
title: "PO chat 하이퍼링크 — 상대경로 linkify 루트 확장 + env 링크는 env 뷰어로 라우팅"
version: v0.5
round: patch
type: feature
status: done
phase: 3
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: pochat-link-widen-env-route
qa_status: pass
qa_loops: 0
area_tags: [gui/chat, gui/linkify, gui/env]
created_at: 2026-06-10
---

| T-PATCH-093 | pochat-link-widen-env-route | todo |

# T-PATCH-093 — PO chat 하이퍼링크: 상대경로 linkify 루트 확장 + env 라우팅

> GUI 수정 batch #1 (PO chat 하이퍼링크). 기존 동작을 **넓히는(widening)** 작업이며 신규 구현이 아님.

## §1 Request

사용자 지시 (verbatim):

> "하이퍼링크: Po 대답에 url 링크 / 산출물 링크 / 티켓 링크 등 언급하는게 있다면 밑줄 + 살짝 폰트 색을 바꿔서 clickable하게 만들어주고 클릭시 메인 panel에 띄우기(env같은건 우리 env뷰어처럼 띄운다든지) 아무튼 강제로 갖다주는 맥락이랑 같음. 이거 po가 상대 링크로 던져도 제대로 파싱?할 수 있지?"

### 현재 상태 (코드 인스펙션 — 이 작업은 widening)

- `packages/gui/src/lib/linkifyText.ts` 가 이미 linkify 수행 중:
  - `T-P4-\d+` → `ptn:ticket/...`
  - 상대경로 `(docs|packages)/….(md|tsx|ts|sh|json)` → `ptn:file/...`
  - bare `https?://...` URL → 그대로 링크
  - 핵심 정규식 `LINK_RE` 는 ~line 35-36. code-block(```` ``` ````, `` ` ``) / 기존 markdown 링크 / URL 내부 false-match 는 이미 가드되어 있음.
- `packages/gui/src/components/workspace/chat/MdRenderer.tsx` 의 `routeLink()` (~line 17-39) 가 클릭 라우팅:
  - `ptn:ticket/` → `openTab(... 'ticket-review' ...)`
  - `ptn:file/` → `openTab(... 'markdown' ...)`
  - `https://` → `openTab(... 'browser' ...)`
  - 밑줄 + 색상은 이미 적용됨 (`getLinkColor`): ticket `#8B5CF6` (violet), file `#38BDF8` (cyan), url `#C8C8CC` (gray).

### 메우려는 GAP

1. **상대경로 정규식이 `docs/`·`packages/` 루트만 커버.** `.productune/…`, `src/…`, 루트 직속 `config.json`, 선행 `./` 형태는 매칭 안 됨 → PO 가 던지는 상대 링크 일부가 plain text 로 남음.
2. **env 라우팅 없음.** env 파일은 현재 plain markdown 탭으로 열림. 전용 ENV 뷰어로 보내는 분기가 필요 ("강제로 갖다주는 맥락" = force-surfaced context). env 뷰어는 이미 존재:
   - 메인 pane: `packages/gui/src/components/workspace/main/panes/ProjectEnvPane.tsx` — tab kind `project-env`, props `{ filename }` 로 구동됨 (`TabContent.tsx:74-75`, store kind `'project-env'` @ `workspace.ts:36`).
   - IPC: `electron/ipc/projectEnv.ts`, side panel: `SidePanelProjectEnv.tsx`.
3. **사용자 질문에 대한 답 (상대 링크 파싱 가능?):** 현재는 `docs/`·`packages/` 루트 + `./docs…` 형태에 한해서만 파싱됨. 이 티켓 적용 후엔 `.productune/`, `src/`, 루트 직속 파일, 선행 `./` 를 포함한 **더 넓은 상대-루트 집합**까지 파싱됨. 즉 "지금은 부분적으로만, 이 패치 후엔 PO 가 던지는 일반적인 상대경로 전부" 가 정답.

## §2 Acceptance

- [x] `.productune/…` 루트 상대경로가 linkify 되어 `ptn:file/` 로 라우팅된다.
- [x] `src/…` 루트 상대경로가 linkify 된다.
- [x] 루트 직속 파일(예: `config.json`, `package.json`)이 linkify 된다.
- [x] 선행 `./` 가 붙은 상대경로(`./docs/x.md`, `./.productune/...`)가 linkify 된다.
- [x] env 대상 링크 클릭 시 markdown 탭이 아니라 **env 뷰어**(`project-env` 탭)로 열린다.
- [x] 기존 ticket(`T-P4-…`) / file(docs·packages) / url 라우팅에 **회귀 없음** — 기존 색상·밑줄·openTab kind 유지.
- [x] code-block(fenced/inline) 및 URL 내부 false-match 방지 가드가 그대로 유지된다 (확장된 루트도 URL path 내부에서 매칭되지 않아야 함).

## §3 Out of scope

- 절대경로(`/Users/...`) linkify — 대상 아님.
- 새 파일 확장자 추가(`.env`, `.yml` 등) — env 판별에 필요한 최소 범위 외엔 손대지 않음. (단, env 판별이 확장자/파일명에 의존하면 그 범위는 §4 에서 명시.)
- env 뷰어 자체 UI/IPC 변경 — 라우팅만 연결, 뷰어는 기존 그대로.
- ticket/file/url 의 색상 토큰 변경, 새 link 타입 추가.
- 외부(http) 링크의 브라우저 탭 동작 변경.

## §4 Implementation plan

1. **`linkifyText.ts` — `LINK_RE` 상대경로 alternation 확장 (~line 35-36):**
   - 현재 `(docs|packages)\/[\w/.\-]+\.(ext)` 의 루트 prefix 를 넓힌다. 권장 형태:
     - 선행 `\.?\/?` 를 허용해 `./` 흡수.
     - 루트 토큰을 `(docs|packages|src|\.productune)` 로 확장.
     - 루트 직속 파일(`config.json` 등)을 위해 "루트 prefix 없이 `[\w.\-]+\.(ext)`" 분기를 추가하되, **false-match 폭증 방지**를 위해 직속 파일은 화이트리스트(`config.json`, `package.json`, `tsconfig.json` 등 알려진 루트 매니페스트)나 명확한 경계(word-boundary, 앞이 공백/문장부호)로 제한 — designer 권장: 직속 bare-filename 은 화이트리스트 우선.
   - **가드 유지:** URL 분기(`https?://…`)가 alternation 에서 file 분기보다 **앞 또는 뒤 순서상** URL path 내부 `src/` 같은 토큰을 먹지 않도록 현재 alternation 우선순위 주석(line 25-34)을 갱신하고, code-block 스킵 로직(`CODE_BLOCK_RE`, `_linkifySegment` 분리)은 변경하지 않는다.
   - filePath 캡처 시 선행 `./` 는 normalize 해서 `ptn:file/` href 에 정규화된 경로를 싣는다(라우팅 일관성).

2. **`MdRenderer.tsx` — `routeLink()` env 분기 추가 (~line 25-30, `ptn:file/` 처리 직전):**
   - `ptn:file/` href 의 target 이 env 대상이면 `project-env` 탭으로, 아니면 기존 markdown 탭으로 분기.
   - env 탭 open 형태(기존 store 시그니처와 일치):
     `openTab('project-env:<filename>', 'project-env', { filename }, <filename>)`
     — `ProjectEnvPane` 가 `tabProps.filename` 으로 `projectEnvRead` 결과에서 해당 file group 을 찾으므로, props 에 **`filename`** 키를 반드시 싣는다 (path 전체가 아닌 basename 매칭 여부는 `projectEnv.ts` IPC 의 `FileGroup.filename` 규칙에 맞춰 확정).

3. **env target 판별 규칙 (designer 지정):**
   - 다음 중 하나면 env 대상으로 간주:
     - basename 이 `.env` 로 시작 (`.env`, `.env.local`, `.env.production` 등), 또는
     - 경로가 `.productune/` 루트이면서 env 계열 파일명 규칙에 해당.
   - 판별은 `routeLink` 내부 헬퍼(`isEnvTarget(filePath)`)로 분리해 테스트/회귀 용이하게.
   - env 가 아닌 `.productune/config.json` 등은 **env 가 아니므로** 기존대로 markdown 탭(또는 §4-1 의 file 라우팅)으로 떨어져야 함 — env 판별이 `.productune/` 루트 전체를 삼키지 않도록 주의.
   - `getLinkColor` 에는 env 전용 색상 분기를 추가할지 여부를 developer 재량으로 두되, 추가 시 기존 file cyan 과 구분되는 톤(예: env=amber 계열)으로. 색상 미추가도 acceptance 통과(밑줄+clickable 유지면 됨).

## §5 QA scope

- **smoke.** PO chat 메시지에 다음 형태를 섞어 렌더 후 클릭 검증:
  - `.productune/x.json`, `src/foo.ts`, `config.json`, `./docs/y.md` → linkify + 올바른 탭 open.
  - `.env.local` 류 → `project-env` 탭(env 뷰어) open.
  - 기존 `T-P4-114`, `docs/a.md`, `https://...` → 회귀 없이 기존 탭으로 open.
  - fenced/inline code-block 내부 경로 → 링크화 안 됨(plain 유지).
  - URL(`https://host/src/x.ts`) 내부의 `src/` 토큰 → 별도 file 링크로 잘리지 않음.

## Persona Activity

| When | Persona | Action |
|---|---|---|
| 2026-06-10 | pdt-developer | impl: `linkifyText.ts` `LINK_RE` 루트 확장(`src`/`.productune`/선행 `./`/루트 매니페스트 화이트리스트/`.env*`), URL 분기 우선순위 선두 이동 + 그룹 인덱스 재배열, 선행 `./` href normalize. `MdRenderer.tsx` `isEnvTarget()` 헬퍼 + `routeLink()` env→`project-env` 탭 분기, `getLinkColor` env=amber(`#F59E0B`). node 정규식 회귀 검증 전 케이스 pass. status→review. |
| 2026-06-10 | pdt-qa | QA PASS → user-verify. §2 전항목 코드+정규식 검증. |

### QA verdict (pdt-qa) — PASS → user-verify

All §2 acceptance verified by code inspection + node regex/routing harness (read-only, no build):

- [x] `.productune/…` linkify → `ptn:file/` — `LINK_RE` alt-4a root `\.productune` 매칭 확인; basename 이 `.env*` 아니면 markdown 라우팅 (`routeLink` L38-48).
- [x] `src/…` linkify — alt-4a root `src` 매칭 확인 (`src/foo.ts` → `[foo.ts](ptn:file/src/foo.ts)`).
- [x] 루트 직속 매니페스트 — alt-4b 화이트리스트 `(config|package|tsconfig)\.json` 매칭; `notes.json`/`random.txt` 등 비화이트리스트는 비매칭 (false-match 폭증 방지 확인).
- [x] 선행 `./` 상대경로 — `\.?\/?` prefix 가 `./docs/y.md`, `./.productune/a.json` 흡수; `_linkifySegment` 가 `replace(/^\.\//,'')` 로 href normalize (L98).
- [x] env 대상 → `project-env` 탭 — `isEnvTarget` 정규식 `/^\.env[a-zA-Z0-9._-]*$/` 이 IPC `ENV_FILENAME_RE`(`projectEnv.ts` L46)와 정확히 일치; `routeLink` 가 basename 으로 `openTab('project-env:<basename>', 'project-env', { filename: basename }, basename)` 호출 (L43-46). `ProjectEnvPane` 가 `f.filename === filename` 으로 FileGroup 매칭 (`ProjectEnvPane.tsx` L371) → basename 키 정합 확인.
- [x] 기존 ticket/file/url 회귀 없음 — `T-P4-114`→`ptn:ticket/`, `docs/a.md`·`packages/gui/src/b.tsx`→`ptn:file/`, `https://`→browser 분기 전부 유지. 색상: ticket `#8B5CF6`, file `#38BDF8`, url `#C8C8CC` 불변; env 만 amber `#F59E0B` 신규 (`getLinkColor` L60-68). underline+cursor 유지 (`MdLink` L79).
- [x] code-block/URL false-match 가드 유지 — fenced/inline 세그먼트 skip 확인(`config.json`·`.env.local` in fence → plain); `https://host/src/x.ts` 통째 소비되어 내부 `src/` 미재매칭 (URL alt-1 선두 우선순위 확인). `.productune/config.json` 은 `isEnvTarget`=false → env 가 `.productune/` 루트 전체를 삼키지 않음 (§4-3 충족).

Regex/routing 로직 전부 code-verified. **user-verify** 사유: PO chat 에서 링크 클릭 시 (a) env 링크가 markdown 이 아닌 ENV 뷰어 탭으로 열리는지, (b) env 링크 amber 색 + 일반 file cyan 구분이 육안상 명확한지 — 실제 PO 응답 렌더 surface 의 visual 확인 필요.

**User should confirm:** PO 응답에 `.env.local`, `.productune/x.json`, `src/foo.ts`, `config.json`, `./docs/y.md` 섞어 렌더 → 밑줄+clickable 표시, `.env*` 클릭 시 ENV 뷰어 탭(amber 색), 그 외는 markdown 탭(cyan), `T-P4-114`/`https://` 회귀 없는지 육안 확인.
