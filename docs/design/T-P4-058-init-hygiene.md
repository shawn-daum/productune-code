# T-P4-058 — productune init / 폴더 열기 hygiene 강화

**Slug**: phase4-r4-init-hygiene  **Round**: phase4-r4 (R4 fix bundle)  **Status**: design v1
**Ticket**: [`docs/tickets/phase4/T-P4-058.md`](../tickets/phase4/T-P4-058.md)
**PRD anchor**: [docs/prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future](../prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future)
**Discovered by**: PO (x) — 다른 user (kate.axz-pc) 의 paepyeong 폴더 받아 작업 시 4 문제 동시 발견 (2026-05-07)
**Related**: T-P4-010 (init), T-P4-012 (openFolder dialog), T-P4-015 (onboarding wizard — first-run UX)

---

## 1. Context

PO 가 다른 머신 (kate.axz-pc) 에서 작업한 paepyeong 프로젝트 폴더를 본인 머신 (x) 으로 받아 productune 으로 이어 작업하다 4 문제 동시 발견:

1. **`.claude/settings.local.json` 잔재로 path glob mismatch → Write deny 폭주**
   - paepyeong/`.claude/settings.local.json` 의 `permissions.allow` 가 kate.axz-pc 의 absolute path glob 으로 가득 (예: `Read(//Users/kate.axz-pc/Desktop/**)`, `Bash(zip -r paepyeong_export.zip ...)`).
   - 본 PO 가 동일 폴더에서 designer R3 patch 시도 — 5 파일 Write 시 system-level path matching 이 본인 path 와 매칭 X → **Write 6 deny** 발생.
   - agent permissionMode (`bypassPermissions`) 와 무관 — claude code 의 path matching 은 별도 layer.

2. **`productune init` 의 settings.local.json default 빈약**
   - 신규 사용자가 `init` 직후 첫 작업 시 매 prompt 마다 백그라운드 sub-agent (codex / claude) 호출이 deny 됨 (settings.local.json 자체가 없거나 보수적).
   - 신규 사용자 onboarding 에서 첫 인상이 "왜 동작 안 하지" 가 됨.

3. **GUI [기존 폴더 열기] 가 legacy `.productune/` layout 을 self 로 인식 못 함**
   - paepyeong/`.productune/` = `briefs/`, `po-state.json`, `po.lock` 만 (config.json 없음 — 옛 CLI 로 init 한 흔적).
   - `dialog:openFolder` IPC (`packages/gui/electron/main.ts` L395+) 의 `readProductuneConfig()` 가 **`.productune/config.json` 존재 여부로만** self 분기.
   - → 이미 productune 프로젝트인데 `kind: 'none'` 떨어져 install 모달 노출 = **잘못된 분기**.

4. **install 모달 시각 — 어두운 배경 위 어두운 모달 + 회색 본문**
   - 사용자 캡처 (PO 첨부): 모달 본문 텍스트 색이 회색 계열 (~`#A0A0A0` 추정), 배경 contrast 낮음.
   - 한글 본문 가독성 특히 떨어짐 (한글 stroke 가 라틴 글리프 대비 thin 한 환경에서 contrast 더 필요).
   - WCAG AA (4.5:1) 미달 가능성 높음.

본 design 의 목표: 4 문제를 단일 ticket bundle 로 묶어 init / openFolder / 시각 hygiene 한 번에 정리.

---

## 2. Goals / Non-goals

### Goals

- `productune init` (CLI + GUI `project:installAt`) 가 `.claude/settings.local.json` 을 hygiene-aware 하게 처리: 기존 파일이 있으면 다른 user path 잔재 detect → backup + default 교체. 없으면 default template 박음.
- `.gitignore` 에 `.claude/settings.local.json` 자동 추가 (다른 user 잔재 재발 방지 — 가장 근본 차단).
- GUI `dialog:openFolder` 가 legacy `.productune/` layout (config.json 없이 briefs/po-state 만) 도 self 로 인식하고, 사용자 confirm 후 `initProject()` 로 idempotent migration 수행.
- install 모달 (`OpenFolderResult` 또는 `InstallProductuneModal` 류) 의 본문 / 배경 / elevation 토큰을 design system 정렬 + WCAG AA contrast 충족.

### Non-goals

- claude code 의 permission matching engine 자체 변경 (외부 프로덕트 영역).
- 다른 user 의 settings.local.json 을 silent rewrite — backup 없이 덮어쓰기 X. 항상 backup file 남김.
- Windows-specific path handling — productune dev/dogfood macOS 우선 (Phase 4 가정).
- 모달 재배치 / 신규 컴포넌트 — 기존 모달의 토큰 / contrast 만 조정.
- settings.local.json default template 의 권한 범위 확대 — 백그라운드 sub-agent 첫 호출 통과 + 자체 디렉터리 Write/Edit 만 cover (최소 권한 doctrine 유지).

---

## 3. Approach

### 3.1 settings.local.json hygiene (CLI + GUI 공통)

`packages/core/src/init.ts` 의 `initProject()` 안에 신규 step 추가 — `bootstrapClaudeSettings(projectDir)`. CLI / GUI 양쪽이 `initProject` 를 통해 동일 hygiene 적용.

#### Detection

```
.claude/settings.local.json 이 존재하면:
  read JSON
  permissions.allow 의 string entry 에 다른 user path glob 패턴 search:
    - /^[A-Za-z]+\(\/{1,2}Users\/(?!<currentUser>)[^/)]+\//
    - 즉: Tool(/Users/<other>/...) 또는 Tool(//Users/<other>/...)
  현재 user 이름:
    process.env.USER (mac) || os.userInfo().username
  if any foreign-user path detected:
    backup → .claude/settings.local.json.legacy-<ISO timestamp>
    write default template (아래)
  else:
    no-op (사용자 본인이 만든 customization 보존)
없으면:
  write default template
```

#### Default template

**검증 우선 — `./**` relative glob 의 claude code permission rule 작동 여부 미확정.** 본 design 은 absolute path templating 으로 안전하게 박음 (검증 후 작동 확인되면 후속 patch 에서 relative 로 단순화 가능).

```json
{
  "permissions": {
    "allow": [
      "Read(<projectDir>/**)",
      "Write(<projectDir>/**)",
      "Edit(<projectDir>/**)",
      "Bash(npm *)",
      "Bash(pnpm *)",
      "Bash(git *)",
      "Bash(node *)",
      "Bash(python3 *)",
      "Bash(jq *)",
      "Bash(claude *)",
      "Bash(codex *)"
    ]
  }
}
```

`<projectDir>` 는 `initProject(opts)` 의 `opts.projectDir` 로 substitute (absolute path). 본 PO 가 paepyeong 받은 케이스 = projectDir 가 본인 home 안이므로 본인 user path 와 자연스레 매칭.

#### Verification step (impl 단계 self-check)

dev 가 land 전 다음 실험으로 `./**` vs absolute 결정:

1. 새 폴더에 `.claude/settings.local.json` 만 `{"permissions":{"allow":["Write(./**)"]}}` 로 작성
2. claude code 에서 해당 폴더 안 파일 Write 시도
3. deny 발생 → absolute 채택. pass → relative 채택 (template 단순화).

### 3.2 `.gitignore` 자동 보강

`bootstrapClaudeSettings` 안에서 `<projectDir>/.gitignore` 검사:

- 파일 없으면 신규 생성 + `.claude/settings.local.json` 한 줄.
- 있으면 해당 줄 검색 → 없으면 append.
- 이미 있으면 no-op.

근본 차단 — settings.local.json 이 git tracking 되지 않으면 다른 user 잔재 자체가 폴더 이동 시 따라오지 않음.

### 3.3 GUI 폴더 감지 logic 강화

`packages/gui/electron/main.ts` 의 `readProductuneConfig` + `dialog:openFolder` handler 갱신.

#### 신규 함수 `detectProductuneLayout(dir)`

```
입력: 폴더 절대 경로
출력: { kind: 'self-current' | 'self-legacy' | 'none', config?, hints? }

logic:
  productuneDir = path.join(dir, '.productune')
  if !exists(productuneDir): return { kind: 'none' }

  configPath = path.join(productuneDir, 'config.json')
  if exists(configPath): try-parse → { kind: 'self-current', config }

  // legacy: config.json 없지만 productune 흔적
  legacyHints = []
  if exists(productuneDir/po-state.json): legacyHints.push('po-state.json')
  if exists(productuneDir/briefs/): legacyHints.push('briefs/')
  if exists(productuneDir/po.lock): legacyHints.push('po.lock')
  if exists(productuneDir/turns/): legacyHints.push('turns/')

  if legacyHints.length > 0: return { kind: 'self-legacy', hints: legacyHints }
  return { kind: 'none' }  // .productune/ 만 있고 productune 흔적 0
```

#### `dialog:openFolder` 분기 갱신

```
detect = detectProductuneLayout(dir)
if detect.kind === 'self-current': return { kind:'self', dir, config }
if detect.kind === 'self-legacy':
  return { kind:'self-legacy', dir, hints: detect.hints }
  // renderer 에서 "이 폴더는 옛 productune 프로젝트입니다 — 최신 layout 으로 업데이트할까요?" 모달
descendants = scanDescendantsForProductune(dir)  // 기존 함수에도 self-legacy 인식 적용
if descendants.length > 0: return { kind:'descendant', dir, descendants }
return { kind:'none', dir }
```

#### Migration handler

신규 IPC `ipcMain.handle('project:migrateLegacy', ...)`:

- 입력: `{ projectDir, slug? }` (slug 미지정 시 폴더 basename 으로 derive)
- 동작: `initProject({ slug, projectDir })` 호출.
  - `initProject` 는 이미 idempotent — `briefs/`, `po-state.json`, `po.lock` 보존.
  - 신규 추가: `config.json` 작성, `bootstrapPersonaMemory` (없는 docs/* 만 채움), `bootstrapClaudeSettings`.
- 반환: `{ projectDir, config, migrated: true }`.

renderer 측 UI: "이 폴더는 옛 productune 프로젝트로 보입니다 (감지: po-state.json, briefs/). config.json 만 추가하고 기존 작업 내역은 그대로 보존합니다. 진행할까요?" + [업데이트] [취소].

### 3.4 install 모달 시각

#### 현재 추정 토큰 (사용자 캡처 분석)

| 영역 | 추정 색 | 문제 |
|---|---|---|
| 모달 배경 | `#1E1E1E` ~ `#2A2A2A` | 앱 배경과 대비 부족 |
| 본문 텍스트 | `#A0A0A0` ~ `#B0B0B0` | WCAG AA 미달 (4.5:1 미달) |
| 헤딩 텍스트 | `#D0D0D0` | borderline |
| 모달 border | 없음 또는 매우 미약 | elevation 부재 |

#### 제안 토큰 (Phase 4 design system 정렬)

`packages/gui/src/styles/tokens.css` 또는 동등 위치에 정의:

| 역할 | 변수 | 값 | contrast vs `--surface-modal` |
|---|---|---|---|
| 앱 배경 | `--surface-app` | `#0F0F11` | — |
| 모달 배경 | `--surface-modal` | `#1C1C20` | — (12% lighter than app) |
| 본문 텍스트 | `--text-primary` | `#E8E8EA` | **12.6 : 1 ✅ AAA** |
| 보조 텍스트 | `--text-muted` | `#C8C8CC` | **8.4 : 1 ✅ AAA** |
| 비활성 텍스트 | `--text-disabled` | `#7A7A80` | 3.5 : 1 (AA Large only — 14pt+ bold 또는 18pt+ 에만 사용) |
| 모달 border | `--border-modal` | `rgba(255,255,255,0.10)` | — |
| 모달 shadow | `--shadow-modal` | `0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)` | — |

**요점**: 한글 본문은 `--text-primary` (`#E8E8EA`) 만 사용. `--text-muted` 는 부제 / hint / 메타데이터에만. `--text-disabled` 는 본문 절대 X.

#### 모달 컴포넌트 적용

- 모달 컨테이너:
  - `background: var(--surface-modal)`
  - `border: 1px solid var(--border-modal)`
  - `box-shadow: var(--shadow-modal)`
  - `border-radius: 12px`
  - `padding: 24px 28px`
- 본문 `<p>`: `color: var(--text-primary)`, `line-height: 1.55`, `font-size: 14px` (한글 가독성 minimum).
- 부제 / 폴더 path 표시: `color: var(--text-muted)`, `font-family: var(--font-mono)`.
- 버튼: 기존 design system 의 primary/secondary 버튼 토큰 (변경 X — modal 한정 토큰만 조정).

#### Backdrop

- `background: rgba(0, 0, 0, 0.55)` (앱 배경 위 layered).
- `backdrop-filter: blur(2px)` (선택 — perf 영향 낮음, 현대 hover 모달 패턴).

---

## 4. Implementation notes (개발자 참고)

- `bootstrapClaudeSettings` 위치: `packages/core/src/init.ts` 안. `initProject` 마지막 step 으로 추가 (config.json write 후, `bootstrapPersonaMemory` 와 동급).
- foreign-user detection regex: `/^[A-Za-z]+\(\/{1,2}Users\/([^/)]+)\//` 로 capture 후 `os.userInfo().username` 과 비교. CI / docker / non-mac 환경 (예: `/home/...`) 에서는 패턴 미매치 → 잔재 detect X (false negative 허용 — 본 hygiene 의 주 사용처는 mac dogfood).
- 백업 파일명: `settings.local.json.legacy-2026-05-07T1234Z.json` 형식. timestamp 는 `new Date().toISOString().replace(/[:.]/g,'-')`.
- `initProject` 의 idempotency 보존: `bootstrapClaudeSettings` 도 idempotent — 두 번 호출 시 두 번째는 no-op (default template 이 이미 박혀 있으면 skip).
- GUI `detectProductuneLayout` 은 main process 의 `readProductuneConfig` / `scanDescendantsForProductune` 와 같은 영역에 배치 (L413+ 부근).
- `scanDescendantsForProductune` 도 self-legacy 인식하도록 보강 — 현재 `readProductuneConfig` 만 호출 → null 반환 시 skip → legacy 폴더가 descendant 검색에서 누락. `detectProductuneLayout` 호출로 교체.
- 기존 `kind: 'self'` consumer (renderer) 와 호환 유지 — `'self-legacy'` 는 신규 kind 로 별도 처리 (기존 `'self'` flow 안 건드림).
- Migration UI 는 기존 `OpenFolderResult` 또는 등가 컴포넌트에 신규 분기 추가 — 별도 모달 컴포넌트 신설 X.
- contrast 검증: dev 가 macOS Color Picker / Stark / WebAIM contrast checker 중 하나로 4.5:1 + 7:1 (AAA) 확인. 캡처 evidence QA 에 첨부.

---

## 5. Alternatives considered

- **모든 settings.local.json 을 강제 default 로 덮어쓰기 (backup 없이)** — 사용자 본인 customization 잃을 위험. 채택 X. 항상 backup + foreign-user detect 분기.
- **GUI 에서 legacy layout 을 silent migrate (사용자 confirm 없이)** — productune doctrine 의 "사용자 명시 클릭만 트리거" 와 충돌. 채택 X. 항상 confirm 모달.
- **install 모달 색을 light theme 으로 toggle** — Phase 4 GUI 는 dark theme 단일 (mockup 기준). 채택 X. dark 안에서 contrast 만 맞춤.
- **detection 을 process.env.USER 만으로** — `USER` 미설정 환경 (일부 docker / CI) 존재. `os.userInfo().username` fallback 함께.
- **`.gitignore` 추가 X (settings.local.json 을 tracked 유지)** — 근본 차단 안 됨. PO 가 본 케이스에서 정확히 이 함정에 빠짐 (다른 user 의 .claude 가 git checkout 으로 따라옴 추정 — 또는 zip 으로 같이 옮김). 채택: 무조건 ignore.

---

## 6. Open questions

- **`./**` relative glob 의 claude code permission rule 호환성** — 본 design 은 absolute path templating 으로 보수 처리. impl 단계 self-check 후 작동 확인 시 후속 patch 에서 단순화 가능. (open)
- 다른 user 잔재 detect 시 사용자에게 noti 띄울지 vs silent backup — 본 design 은 silent + backup 채택 (init 흐름 끊지 않음). 후속 dogfood 에서 "왜 settings.local.json 이 바뀌었지?" 혼란 보고 있으면 noti 추가 검토. (open, post-land 관찰)
- legacy migration 시 `po-state.json` 의 schema version 호환성 — paepyeong 의 `po-state.json` 이 현재 doctrine schema 와 정합한지 본 ticket 범위에서 검증 X (`initProject` 가 schema migration 까지 하지 않음 — 단순 config.json 추가만). 향후 schema 충돌 발견 시 별도 ticket. (open)
- install 모달 한글 본문 font-size — 14px 권고하나 onboarding wizard 와의 typography hierarchy 정렬은 T-P4-015 와 cross-check 필요. (open, T-P4-015 와 align)

---

## 7. Activity log

- **2026-05-07** — design v1 작성. PO 가 paepyeong 폴더 받아 작업 시 발견한 4 문제 (settings.local.json 잔재 / default 빈약 / GUI legacy 감지 / 모달 가시성) 를 단일 ticket bundle 로 정의. detection regex / backup 정책 / `.gitignore` 자동 보강 / detectProductuneLayout 함수 / migration IPC / dark-theme contrast 토큰 정의. `./**` relative glob OQ 명시 — impl self-check 로 결정. (designer R1 turn, opus/xhigh)
