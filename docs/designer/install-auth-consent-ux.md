# 외부 도구 설치 / PATH / 브라우저 Auth — Consent UX 디자인 (rough)

**Slug**: install-auth-consent-ux  **Created**: 2026-04-30  **Status**: rough (T-P4-003 진입 전 합의 대상)
**PRD anchor**: [docs/prd/productune.md#phase-4--개발-비숙련-기획자-모드-planner-mode-future](../prd/productune.md#phase-4--개발-비숙련-기획자-모드-planner-mode-future)
**Roadmap anchor**: [docs/tickets/v0.4/ROADMAP.md#round-6](../tickets/phase4/ROADMAP.md) — Round 6 외부 서비스 setup 가이드의 **사전 합의 디자인**
**Tokens**: [docs/artifacts/design-direction.md](./design-direction.md) (Pretendard / Productune Indigo / 4px grid / Lucide)

> "GA4 권한 → gcloud 필요 → 설치 명령어 그대로 던지기" 같은 패턴이 본 제품의 "터미널 무의존" 정신과 정면 충돌. 본 문서는 외부 도구가 필요할 때 등장하는 **3 종 마찰 (설치 / PATH / 브라우저 Auth)** 의 통합 UX 를 정의. 컴포넌트 스펙이 아니라 **흐름 + 모달 패턴 + 의사결정 게이트** — T-P4-003 Electron boilerplate 의 모달/IPC 골격에 영향을 주므로 Round 0 합의 필요.

---

## 0. 컨텍스트 / 문제 정의

| 항목 | 현재 (Phase 1 CLI) | 목표 (Phase 4 GUI) |
|---|---|---|
| **외부 CLI 설치** | agent 가 `brew install ...` 명령어를 출력 → 사용자가 직접 복붙 실행 | GUI 가 "어떤 도구인지 + 왜 필요한지" 설명 → 명시 동의 → agent 가 대신 실행 |
| **PATH 갱신** | 사용자에게 "터미널 새로 열어주세요" 요청 → 컨텍스트 단절 | 앱 내부 child shell 이 PATH 다시 로드 → 사용자에게 transparent |
| **브라우저 Auth** | "이 URL 열어서 로그인하세요" 안내 | GUI 가 브라우저 띄움 + callback 자동 캡처 → 결과 GUI 로 복귀 |
| **sudo 권한** | "비밀번호 입력하세요" → 터미널 개입 | 명시 동의 모달 + OS-native auth dialog 1 회 |

**왜 지금 디자인하나** — T-P4-003 (Electron boilerplate) 가 모달 시스템 / IPC 채널 / external 프로세스 spawn 패턴의 골격. 이걸 만들고 나서 "어 install 도 모달 필요하네" 식으로 끼워 넣으면 IPC 표면이 흐트러짐. **이 흐름의 추상화를 boilerplate 에 못 박는 게 맞음.**

또 Round 1 의 GitHub OAuth 팝업 (T-P4-014) 이 이미 "브라우저 Auth" 케이스 첫 등장 — Round 0 에서 패턴 합의가 안 되면 Round 1 에서 임시 구현됨.

---

## 1. Goals / Non-goals

### Goals
1. **명시 동의가 게이트** — 사용자 모르게 외부 도구 설치 / 권한 요청 0 건.
2. **무엇을 / 왜 / 어떻게 / 얼마나** 4 정보가 동의 화면에 항상 노출.
3. **PATH / sudo / 브라우저 callback** 같은 OS 마찰을 사용자 인지 밖으로 흡수.
4. **실패 시 사람이 읽을 수 있는 다음 액션** — 명령어 dump 금지.
5. **CLI / GUI 양쪽에 동일 의사결정 모델** — Phase 1 CLI 도 동일 prompt 포맷 차용 (즉시 적용 가능).

### Non-goals
- 외부 도구 자체의 GUI 래핑 (gcloud / vercel / supabase 의 모든 명령을 버튼으로 바꾸기 — Phase 5 이후).
- 자동 업데이트 / 자동 재설치 (사용자 의사 외 install 0).
- root system 도구 설치 (Homebrew 자체가 없는 사용자 — 본 라운드에서는 "Homebrew 가 없는 경우" 만 안내, 자동 설치는 별도 confirm).
- Linux 패키지 매니저 분기 (apt / dnf / pacman) — Phase 4 MVP 는 macOS 우선, Linux 는 Phase 5.

---

## 2. 핵심 원칙 (5 개)

> design-direction.md 의 5 원칙 위에 본 도메인 추가 5 원칙.

1. **명령어 > 상자 안에 가둔다 (Command in a box)**
   설치 명령어 / URL / 토큰을 GUI 평면 텍스트로 노출 X. 항상 dark surface 코드 블록 (design-direction §7.4) 안에 + "고급 보기" 토글 뒤로. 기본 화면은 자연어.

2. **동의는 한 단위 (Atomic consent)**
   "도구 A 를 설치할까요?" 와 "권한을 줄까요?" 와 "브라우저 열까요?" 를 한 모달에 묶지 않음. 각 단계마다 별도 동의 — 사용자가 어디서 그만둘지 결정.

3. **재시작 없는 전환 (No restart prompt)**
   "터미널 새로 열어주세요 / 앱 재시작하세요" 문구 사용 0. PATH 변화는 child shell 에서, 앱 내부 상태 변화는 in-place reload.

4. **취소가 무해 (Cancel is safe)**
   동의 취소 / 모달 닫기 / esc 가 항상 안전한 상태로 복귀. 절반쯤 설치된 상태 / 절반쯤 인증된 상태 X — 트랜잭션 단위로 전부 또는 0.

5. **로그는 선택적 (Logs on demand)**
   설치 / auth 진행 중 raw 로그는 기본 숨김 + status badge 만. "자세히 보기" 클릭 시에만 log panel slide-in. 실패 시에만 자동 펼침.

---

## 3. 도메인별 흐름 (3 종)

### 3.1 Flow A — 외부 도구 설치 (예: `gcloud`)

```mermaid
flowchart TD
  S[페르소나가 외부 도구 필요 감지<br/>예: GA4 권한 = gcloud 필요] --> D[설치 상태 검사<br/>which / brew list]
  D -- 이미 설치됨 --> OK[다음 단계로]
  D -- 미설치 --> M1[모달: 도구 설명 카드<br/>무엇/왜/어떻게/얼마나]
  M1 -- 취소 --> X[원래 화면 복귀<br/>티켓 status: blocked + 이유]
  M1 -- 설치하기 --> P[Homebrew 존재 검사]
  P -- brew 없음 --> M1B[모달: Homebrew 자체 설치 동의<br/>별도 consent]
  M1B -- 취소 --> X
  M1B -- 설치하기 --> Q
  P -- brew 있음 --> Q[child shell spawn:<br/>brew install --cask google-cloud-sdk]
  Q --> S2[Status panel:<br/>"gcloud 설치 중... ●"]
  S2 -- 성공 --> R[PATH 갱신<br/>internal: 새 child shell 의 env]
  S2 -- 실패 --> E1[실패 카드:<br/>1줄 자연어 + 다음 액션 3 버튼]
  R --> OK
  E1 -- 다시 시도 --> Q
  E1 -- 자세히 보기 --> LOG[log panel slide-in]
  E1 -- 도움말 --> HELP[공식 문서 링크<br/>외부 브라우저]
```

#### 3.1.1 컴포넌트 — `DependencyConsentCard` (modal-md, 560px)

```
┌────────────────────────────────────────────────────┐
│  [icon 32, info-500]  도구 설치 필요               │  ← title-1
│                                                    │
│  Google Cloud SDK (gcloud)  를 설치할까요?         │  ← title-2
│                                                    │
│  무엇이                                            │  ← label
│    Google 의 공식 명령줄 도구. GA4 / BigQuery /     │  ← body-sm
│    Cloud Run 같은 Google 서비스를 다룰 때 필요해요.│
│                                                    │
│  왜 지금                                           │  ← label
│    "GA4 권한 확인" 단계에서 이 도구가 있어야         │  ← body-sm
│    productune 이 Analytics 계정에 접근할 수 있어요.│
│                                                    │
│  어떻게 설치되나                                   │  ← label
│    Homebrew (이미 설치됨 ✓) 로 자동 설치합니다.    │  ← body-sm
│                                                    │
│  얼마나 걸리나                                     │  ← label
│    약 1–3 분 (인터넷 속도에 따라).                  │  ← body-sm
│                                                    │
│   [▸ 자세히: 실행될 명령어]                         │  ← ghost button (collapsed)
│                                                    │
│  ─────────────────────────────────────────         │  ← divider gray-200
│                                                    │
│           [ 취소 ]   [ 설치하기 ]                  │  ← ghost / primary
└────────────────────────────────────────────────────┘
```

| 영역 | 토큰 |
|---|---|
| modal | radius-xl, shadow-lg, Surface 2, p `space-6` (24) |
| icon | 32px Lucide `package-plus` (info-500) |
| title-1 / title-2 | design-direction §3.2 동일 |
| label | `label` token, gray-500 |
| body-sm | `body-sm` token, gray-700 (light) / gray-200 (dark) |
| 4-info 블록 사이 간격 | `space-4` (16) |
| 자세히 보기 펼침 | dark surface code block (`gray-900` bg + `gray-100` text), `radius-md` |
| 버튼 | secondary("취소") + primary("설치하기"), 우측 정렬, gap `space-2` |

**4-정보 표준 (반드시 4 개 모두)**:
1. **무엇이** — 도구의 정체 (1–2 문장 자연어, 마케팅 문구 X)
2. **왜 지금** — 현재 단계와의 인과 (티켓 / PRD 단계 명시)
3. **어떻게** — 설치 방법 + 사전 의존성 (Homebrew 등) 충족 여부 ✓ 표시
4. **얼마나** — 예상 시간 / 디스크 사용량 (큰 경우)

**자세히 보기 토글** = 실제 실행될 명령어를 dark surface code block 으로. 사용자가 검토하길 원할 때만.

#### 3.1.2 컴포넌트 — `InstallProgressPanel`

설치 진행 중 표시. modal 자리에 inline 으로 swap (close 버튼 비활성):

```
┌────────────────────────────────────────────────────┐
│  [spinner 16]  Google Cloud SDK 설치 중            │  ← title-3
│                                                    │
│  ──────────────────● 67%                           │  ← progress bar (primary-600)
│  방금: 의존성 다운로드 완료                         │  ← caption, gray-500
│                                                    │
│   [▸ 자세히 보기]                                  │  ← ghost button — log panel slide-in
└────────────────────────────────────────────────────┘
```

- **진행률**: brew / npm / pip 의 stdout 파싱이 가능할 때만 % 표시. 불가 시 indeterminate spinner + "방금: X" 형태로 phase 단위.
- **방금 (latest event)**: 최근 1 줄을 자연어로 (raw stdout X). 매핑 룰은 도구별 plugin (brew / npm / pip / curl).
- **자동 dismiss X** — 완료 시 success 상태 (2s 후 자동 close) 또는 실패 시 `InstallFailureCard` swap.
- **취소 버튼 노출 조건**: 시작 후 3s 이상 + 외부 호출 진행 중일 때만. clean rollback 가능 도구만 (brew uninstall 가능). 그 외에는 처음부터 취소 불가 명시.

#### 3.1.3 컴포넌트 — `InstallFailureCard`

```
┌────────────────────────────────────────────────────┐
│  [icon 24, error-500]  설치 실패                   │  ← title-2
│                                                    │
│  Google Cloud SDK 설치가 완료되지 않았어요.        │  ← body
│  네트워크 문제 가능성이 높아요 — Homebrew 가         │  ← body-sm, gray-500
│  공식 서버에서 파일을 받지 못했습니다.              │
│                                                    │
│  [▸ 자세히: 에러 로그]                              │
│                                                    │
│  ─────────────────────────────────────────         │
│                                                    │
│  [ 다시 시도 ]  [ 도움말 보기 ]  [ 건너뛰기 ]       │
└────────────────────────────────────────────────────┘
```

- **에러 분류 매핑** (도구별 plugin) → 자연어 1 줄 사유. 알 수 없는 에러도 "이유는 명확치 않아요. 로그를 확인해 주세요." + 자세히 보기 자동 펼침.
- **3 버튼**: 다시 시도 (primary) / 도움말 보기 (외부 공식 문서 새 창) / 건너뛰기 (티켓 blocked + 이유 기록 → 사용자가 수동 해결 후 PO 에게 "다시 시도해줘").

### 3.2 Flow B — PATH 갱신 (사용자에게 transparent)

> 핵심 결정: **"터미널을 새로 열어주세요" 라는 문구를 한 번도 사용하지 않는다.**

#### 3.2.1 메커니즘

```mermaid
flowchart LR
  I[설치 완료] --> S[GUI 가 새 child shell spawn<br/>node-pty]
  S --> E[새 shell 의 env<br/>= 갱신된 PATH 포함]
  E --> A[모든 후속 외부 호출은<br/>이 child shell 통해 실행]
  E --> V[검증: which gcloud<br/>→ 정상 응답 확인]
  V -- OK --> D[Status panel:<br/>"gcloud 사용 가능 ✓"]
  V -- Fail --> M[모달: "설치는 완료됐지만<br/>경로를 못 찾았어요"<br/>+ 도움말 + 수동 PATH 추가 가이드]
```

#### 3.2.2 사용자 경험

- 설치 success toast (4s 자동 dismiss): "Google Cloud SDK 설치 완료. 이제 사용할 수 있어요."
- **별도 알림 / 재시작 안내 없음** — 다음 작업이 자연스럽게 진행.
- 검증 실패 (1% 케이스) 만 모달 surface — 이때도 "터미널 재시작" 단어 X, 대신 "shell 환경을 다시 불러왔는데 도구를 못 찾았어요. 잠시 후 자동으로 다시 시도하거나, 수동 가이드를 볼 수 있어요." + 30s 후 자동 retry 1 회.

#### 3.2.3 구현 메모 (디자인 결정 아닌 전제)

> 본 섹션은 **개발자 영역** — 디자인 결정은 위 사용자 경험까지. 개발자가 본 디자인을 만족시키기 위해 알아야 할 전제만 기록.

- node-pty 로 spawn 한 child shell 은 **새 프로세스 = 새 env** → 부모 PATH 캐시와 독립.
- macOS GUI 앱은 `~/.zshrc` 의 PATH 변경을 부모 process 에서 자동 inherit X — 따라서 모든 외부 도구 호출은 child shell 통해 (login shell `-l` 옵션 사용).
- Homebrew 가 자체 셋팅한 PATH 는 `/opt/homebrew/bin` (Apple Silicon) / `/usr/local/bin` (Intel) — login shell 이 정상 로드.
- 이 패턴은 T-P4-060 (node-pty 기반 shell 자동화) 의 기본 동작이어야 함 — 단발 호출이 아니라 모든 outgoing exec 의 default.

### 3.3 Flow C — 브라우저 Auth (예: GitHub OAuth, Vercel login, gcloud auth)

```mermaid
flowchart TD
  S[페르소나가 auth 필요 감지<br/>예: GitHub repo 생성 → OAuth] --> M1[모달: Auth 동의 카드<br/>어디로 / 무엇을 / 얼마나]
  M1 -- 취소 --> X[원래 화면 복귀]
  M1 -- 로그인하기 --> CB[localhost callback server<br/>start: 임의 포트]
  CB --> O[shell.openExternal: 인증 URL<br/>기본 브라우저 띄움]
  O --> W[Waiting panel:<br/>"브라우저에서 로그인을 완료해 주세요"]
  W -- callback 수신 --> P[token / code 캡처<br/>secure storage 저장]
  W -- 5분 timeout --> T[Timeout 카드:<br/>"브라우저에서 응답이 없어요"]
  W -- 사용자 취소 --> X
  P --> OK[Success toast:<br/>"로그인 완료" + 사용자 이메일/계정 표시]
  T -- 다시 열기 --> O
  T -- 취소 --> X
```

#### 3.3.1 컴포넌트 — `BrowserAuthConsentCard` (modal-md, 560px)

```
┌────────────────────────────────────────────────────┐
│  [icon 32, info-500]  로그인이 필요해요             │  ← title-1
│                                                    │
│  GitHub 에 로그인해서 권한을 받을게요.              │  ← title-2
│                                                    │
│  어디서                                            │
│    github.com 의 공식 로그인 페이지                │
│                                                    │
│  무엇을                                            │
│    productune 이 비공개 저장소를 만들고 코드를      │
│    저장할 수 있도록 허용해요. (권한: repo)         │
│                                                    │
│  얼마나                                            │
│    약 30 초. 브라우저에서 한 번만 로그인하면        │
│    이후에는 자동으로 처리돼요.                     │
│                                                    │
│  [▸ 자세히: 보내는 데이터 / 토큰 저장 위치]         │
│                                                    │
│  ─────────────────────────────────────────         │
│                                                    │
│           [ 취소 ]   [ 로그인하기 ]                │
└────────────────────────────────────────────────────┘
```

**3-정보 표준** (Auth 는 4 정보 → 3 정보로 축약, "어떻게" 는 항상 "브라우저에서 OAuth/SSO" 로 동일):
1. **어디서** — 인증 도메인 (사용자가 피싱 의심하지 않게 명시)
2. **무엇을** — 받을 권한 (scope) 자연어 + 괄호 안에 기술 명칭
3. **얼마나** — 시간 + 일회성/지속 여부

#### 3.3.2 컴포넌트 — `BrowserAuthWaitingPanel`

브라우저가 띄워진 후 GUI 상태:

```
┌────────────────────────────────────────────────────┐
│  [icon 24, info-500 + pulse]  로그인 대기 중       │
│                                                    │
│  브라우저에서 로그인을 완료해 주세요.              │  ← body
│                                                    │
│  ─────────────────────────────────────────         │
│                                                    │
│  브라우저가 안 열렸나요?                           │  ← caption, gray-500
│  [ 다시 열기 ]   [ URL 복사 ]   [ 취소 ]            │
└────────────────────────────────────────────────────┘
```

- **타이머 표시 X** — 기본은 그냥 대기. 5 분 hard timeout 후 timeout 카드로 swap.
- **다시 열기** — `shell.openExternal` 재호출. 사용자가 실수로 브라우저를 닫았을 때.
- **URL 복사** — 브라우저가 자동으로 안 뜨는 환경 (원격 SSH / 헤드리스) fallback.
- **취소** — callback server 종료 + 모달 close. 절반쯤 인증된 상태 발생 X (token 미수신 = 0 상태).

#### 3.3.3 sudo / OS-native auth

- macOS Keychain / TouchID / 시스템 sudo 처럼 OS 가 직접 띄우는 auth dialog 는 **wrapping 시도 X** — OS-native 가 가장 안전 + 익숙.
- 단, **언제 OS dialog 가 뜨는지 사전 예고**: "시스템에서 비밀번호 / Touch ID 를 한 번 물어볼 거예요." 라는 inline 안내 (consent card 내 별도 줄).

#### 3.3.4 토큰 저장 위치

> 본 섹션은 **개발자 / 보안 영역** — 디자인 결정은 "토큰 저장 위치를 사용자가 자세히 보기 토글로 확인 가능" 까지. 구체 구현은 별도 보안 design doc.

- macOS Keychain / Windows Credential Manager / Linux libsecret — Electron `safeStorage` 기본.
- fallback: `~/productune/.secrets/` 에 OS user-only permission (0600) 으로 암호화 저장.
- "자세히 보기" 카드에 사용자가 본인 OS 의 저장 위치 / 삭제 방법 1 줄 안내.

---

## 4. 통합 패턴 — 3 종 흐름의 공통 layer

### 4.1 동의 카드 spec (정규화)

| 항목 | 설치 (Flow A) | PATH (Flow B) | Auth (Flow C) |
|---|---|---|---|
| **트리거** | which / brew list 결과 미존재 | 설치 직후 (사용자 인지 X) | 외부 API 401 / 토큰 부재 |
| **모달 surface** | DependencyConsentCard | (없음 — transparent) | BrowserAuthConsentCard |
| **표준 정보 필드** | 무엇/왜/어떻게/얼마나 (4) | — | 어디서/무엇을/얼마나 (3) |
| **자세히 보기 펼침** | 실행될 명령어 | — | 토큰 저장 위치 + 보낼 데이터 |
| **취소 버튼** | 항상 | — | 항상 |
| **결정 버튼 라벨** | "설치하기" | — | "로그인하기" |
| **진행 상태 컴포넌트** | InstallProgressPanel | — | BrowserAuthWaitingPanel |
| **실패 컴포넌트** | InstallFailureCard | (검증 실패 경우만) | TimeoutCard / 동일 패턴 |

### 4.2 IPC 채널 표면 (T-P4-003 영향)

본 디자인이 Round 0 boilerplate 에 요구하는 IPC 채널 (renderer ↔ main):

| 채널 | 방향 | 페이로드 |
|---|---|---|
| `external:detect` | renderer → main | `{ tool: "gcloud" }` → `{ installed: bool, version?: string }` |
| `external:install` | renderer → main (long-running) | `{ tool, manager: "brew" }` → stream `{ phase, progress, log }` |
| `external:install:cancel` | renderer → main | `{ jobId }` → `{ ok }` |
| `auth:start` | renderer → main | `{ provider: "github", scope: "repo" }` → `{ jobId }` |
| `auth:status` | main → renderer (event) | `{ jobId, state: "waiting"\|"success"\|"timeout" }` |
| `auth:cancel` | renderer → main | `{ jobId }` → `{ ok }` |
| `auth:reopen` | renderer → main | `{ jobId }` → `{ ok }` |

> **Round 0 합의 사항**: 위 채널 표면은 T-P4-003 의 IPC 패턴 정의 단계에서 **stub 만 등록** (실제 구현은 Round 6 T-P4-062 / T-P4-014). 이로써 Round 1 GitHub OAuth (T-P4-014) 가 등장할 때 채널 이름이 이미 자리잡혀 있음.

### 4.3 모달 큐 정책

같은 시점에 여러 동의가 필요해질 때 (예: gcloud 설치 → gcloud auth login):

- **순차 surface** (큐). 동시에 2 개 모달 X.
- 큐가 2 개 이상이면 첫 모달 상단에 "다음에 1 단계 더" 안내 1 줄 (caption, gray-500).
- 사용자가 중간 단계 취소 시 큐 전체 무효 + "이 작업은 N 단계가 모두 필요해요. 처음부터 다시 시도하시겠어요?" 안내.

---

## 5. CLI / Phase 1 즉시 적용 ver — 텍스트 prompt 정규화

> 이 디자인은 GUI 가 본진이지만, **현재 Phase 1 CLI 도 동일 정신으로 즉시 standardize 가능**. 사용자가 보고한 "GA4 → gcloud" 실제 케이스는 Phase 1 에서 발생 — GUI 까지 기다릴 수 없음.

### 5.1 표준 prompt 포맷 (CLI)

```
─────────────────────────────────────────────────────
도구 설치 필요: Google Cloud SDK (gcloud)

무엇이      Google 의 공식 명령줄 도구. GA4 / BigQuery 등에 접근.
왜 지금     "GA4 권한 확인" 단계에서 이 도구가 있어야 진행 가능.
어떻게      Homebrew (확인됨 ✓) 로 자동 설치.
얼마나      약 1–3 분.

실행될 명령어:
  brew install --cask google-cloud-sdk

설치할까요? [y/N]:
─────────────────────────────────────────────────────
```

- y → 페르소나가 직접 child shell 에서 실행 + 진행 표시 (텍스트 progress).
- N → 티켓 status: blocked + 이유 자동 기록.
- 네트워크 / 권한 실패 시 위 InstallFailureCard 의 텍스트 등가 (3 버튼 → 3 키 입력).

### 5.2 Auth CLI prompt 포맷

```
─────────────────────────────────────────────────────
로그인 필요: GitHub

어디서      github.com (공식 OAuth)
무엇을      비공개 저장소 생성 + 코드 push (권한: repo)
얼마나      약 30 초. 한 번만.

브라우저를 열까요? [y/N]:
─────────────────────────────────────────────────────
```

- y → `open` (mac) / `start` (win) / `xdg-open` (linux) 으로 브라우저 띄움 + localhost callback server start.
- "브라우저가 자동으로 열리지 않으면: <URL>" 안내 한 줄 추가.

### 5.3 적용 범위

- Phase 1 의 모든 페르소나가 외부 도구 / auth 필요 시 위 포맷 사용 — 페르소나 doctrine (`~/.productune/sections/`) 의 신규 섹션 `external-deps.md` 로 명문화 (별도 PO 티켓 발행 권고).
- CLI 와 GUI 의 정보 필드가 1:1 — Phase 4 GUI 전환 시 백엔드 로직 재사용.

---

## 6. 와이어프레임 (rough)

### 6.1 Flow A — 설치 동의 → 진행 → 성공

```
[Step 1: 동의]                 [Step 2: 진행]                [Step 3: 성공 toast]

┌─────────────┐               ┌─────────────┐               ┌──────────────┐
│ 도구 설치    │               │ ● 설치 중   │               │ ✓ gcloud      │
│ 필요         │               │ ──●─── 67%  │               │ 사용 가능     │
│              │               │             │               └──────────────┘
│ [4 정보]     │   →    →      │ 방금: ...   │   →    →      ↑ 우하단 4s
│              │               │ [▸ 자세히]   │
│ [취소][설치] │               │             │
└─────────────┘               └─────────────┘
```

### 6.2 Flow C — 브라우저 Auth

```
[Step 1: 동의]              [Step 2: 브라우저 띄움 + 대기]      [Step 3: 성공]

┌─────────────┐             ┌────────────────────────┐         ┌──────────────┐
│ 로그인 필요  │             │ ● 로그인 대기 중        │         │ ✓ shawn 으로  │
│              │             │                        │         │ 로그인 됨     │
│ [3 정보]     │   →   →     │ 브라우저에서 완료해주세요 │   →     └──────────────┘
│              │             │                        │
│ [취소][로그인]│             │ [다시열기][URL복사][취소]│
└─────────────┘             └────────────────────────┘
                                   ↑
                                 (외부 브라우저 화면)
                                 GitHub OAuth 동의
```

### 6.3 Flow A → C 체이닝 (gcloud 설치 + gcloud auth login)

```
[gcloud 설치 동의]   →   [설치 진행]   →   [auth 동의 — 다음 1 단계 안내]   →   [브라우저 대기]   →   [완료]
       ↑                                          ↑
   "다음에 1 단계 더" 라벨                    동일 라벨
```

---

## 7. 토큰 적용 정리

| 컴포넌트 | 토큰 |
|---|---|
| **모달 frame** | radius-xl (20), shadow-lg, Surface 2, p `space-6`, max-width 560 (md) / 720 (lg, 자세히 펼친 상태) |
| **타이틀** | title-1 (32px/700) — 카드 헤더, title-2 (20px/600) — 핵심 질문 |
| **info 라벨** | label (12px/500/0.01em), gray-500 |
| **info 본문** | body-sm (14px/400/1.5), gray-700 (light) / gray-200 (dark) |
| **자세히 코드 블록** | dark surface (gray-900 bg + gray-100 text), radius-md, p `space-4`, code token |
| **primary CTA** | Button primary md (36h, primary-600 bg) |
| **취소** | Button ghost md (gray-700 text) |
| **destructive 변형** | 본 도메인 destructive 버튼 X (취소는 ghost) — 위험은 동의 자체로 표현, 버튼은 항상 명확한 의지만 |
| **progress bar** | 4px height, primary-600 fill, gray-200 track, radius-full |
| **status icon** | Lucide 24px (consent), 32px (title), 16px (status badge), stroke 1.75 |
| **dot pulse (waiting)** | 8px circle + opacity animation 1.4s ease-in-out, info-500 |

---

## 8. 접근성

- 모달 open 시 focus trap + 첫 focus = primary CTA. esc 로 cancel.
- screen reader 안내 — `aria-live="polite"` 로 progress 변화 / "방금" 메시지 announce.
- 자세히 토글은 native `<details>` 또는 동등 — 키보드 단독 조작 가능.
- Auth 대기 패널의 pulse 애니메이션은 `prefers-reduced-motion` 시 정적 dot.
- 색만으로 상태 구분 X — 항상 icon + label + 색 3중.

---

## 9. Open questions

| # | 질문 | 영향 | 결정 시점 |
|---|---|---|---|
| **OQ-1** | Homebrew 자체가 없는 사용자 — 자동 설치 시도 vs "Homebrew 가 필요해요" 안내 + 외부 가이드 링크 | OS-level installer 설치는 sudo 필수 → 별도 consent 단계 깊어짐 | T-P4-062 plan 단계 |
| **OQ-2** | 설치 progress % 계산 — brew/npm/pip 별 stdout 파서 plugin 구조 | InstallProgressPanel 의 정확도 | T-P4-062 plan 단계 |
| **OQ-3** | OAuth callback server 의 포트 충돌 처리 — 임의 포트 retry vs 고정 포트 | 환경 변수 / 방화벽 정책 영향 | T-P4-014 plan 단계 |
| **OQ-4** | 모달 큐 길이 상한 — 3 단계 이상 체이닝 발생 시 사용자에게 "전체 보기" 화면 제공 여부 | 복잡 도구 (Supabase + Stripe + ...) 동시 setup 시 | Round 6 dogfood 후 |
| **OQ-5** | 헤드리스 / 원격 SSH 환경 (브라우저 자동 open 불가) — URL 복사 fallback 만으로 충분한가 | Phase 5 cloud / 원격 사용 시 | Phase 5 |
| **OQ-6** | "건너뛰기" 후 상태 — 티켓 blocked + 사용자 수동 해결 시 productune 이 어떻게 재감지 / 자동 unblock 하는가 | Round 1 ticket lifecycle | T-P4-013 / Round 1 plan |
| **OQ-7** | sudo 가 필요한 도구 (예: 일부 Linux 패키지) — 본 디자인은 macOS + Homebrew 가정. Linux apt/dnf 분기 시점 | Phase 5 Linux 지원 | Phase 5 |

---

## 10. 다음 액션

1. **사용자 합의** — 본 rough 디자인 검토 후 ✓ / 수정 / 거절. 거절 시 본 라운드 재호출.
2. **합의 후 → T-P4-003 IPC 채널 stub 추가** — §4.2 의 7 채널을 boilerplate 의 preload `contextBridge` 표면에 등록 (실제 구현 X, signature 만).
3. **CLI Phase 1 doctrine 갱신** — §5 의 prompt 포맷을 `~/.productune/sections/external-deps.md` (신규) 로 명문화 → 모든 페르소나가 외부 도구 호출 시 본 포맷 사용. 이건 PO 의 별도 doctrine 패치 티켓 (예: T-PATCH-002).
4. **Round 1 T-P4-014 (GitHub OAuth) 의 design 을 본 패턴 위에서** — Auth 컴포넌트 첫 실사용. 본 문서의 Flow C 가 그대로 참조됨.
5. **Round 6 T-P4-062 의 setup 가이드** — 본 문서의 Flow A 위에 도구별 plugin (gcloud / vercel / supabase / stripe / ...) 을 design doc 으로 별도 분해.

---

## Activity log

- **2026-04-30** — v1 rough 작성. 사용자 보고 케이스 (GA4 → gcloud) 를 발단으로 3 종 마찰 (설치 / PATH / 브라우저 Auth) 의 통합 UX 정의. design-direction.md 토큰 위에 모달 / progress / waiting / failure 컴포넌트 4 종 추가. T-P4-003 IPC 채널 7 종 stub 영향 명시. CLI Phase 1 즉시 적용 ver 병행 정의 (현재 페인 즉시 해소). Open questions 7 개 분기.
