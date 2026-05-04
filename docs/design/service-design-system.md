# productune Phase 4 — 서비스 디자인 시스템 보강

**Status**: Design gate draft  **Companion**: [design-direction.md](./design-direction.md), [service-flow-and-screens.md](./service-flow-and-screens.md)

> `design-direction.md` 의 토큰을 실제 Phase 4 화면에 매핑하는 짧은 구현 규칙. Rich Markdown + custom React components 로 렌더링한다. Figma 없음.

---

## 1. Custom React components for rich Markdown

| Component | 용도 | Props 최소안 |
|---|---|---|
| `StageBreadcrumb` | PRD → Design → Build → QA → Deploy → Operate 현재 위치 | `current`, `lockedAfter`, `items` |
| `ArtifactTabs` | Mermaid / Wireframe / Design system 탭 | `artifacts[]`, `approvalStatus` |
| `ApprovalGateCard` | Build 전 디자인 승인 | `artifacts`, `onApprove`, `onRequestRevision` |
| `DependencyConsentCard` | 외부 CLI/라이브러리 설치·연결 동의 | `tool`, `why`, `command`, `location`, `reversibility`, `permissions` |
| `PersonaTrace` | 페르소나 활동 + skill trace | `persona`, `modelEffort`, `skillsUsed`, `confidence` |
| `ArtifactCabinet` | PRD/디자인/티켓/QA 산출물 목록 | `groups`, `selectedArtifact` |
| `EnvLayerTable` | 로컬/미리보기/프로덕션 값 상태 | `layers`, `variables`, `badges` |

---

## 2. 상태 색상 의미

| 상태 | Token | 사용처 |
|---|---|---|
| Ready / Pass / Synced | `success-500` | QA pass, 설치 완료, env 동기 |
| Needs attention | `warning-500` | 승인 대기, prod 값 없음, 낮은 confidence |
| Blocked / Fail | `error-500` | Build 실패, 필수 값 없음, 설치 실패 |
| Info / External | `info-500` | 공식 문서 fetch, 브라우저 auth 안내 |
| Current stage | `primary-600` | breadcrumb 현재 단계, primary action |

색만으로 의미 전달 금지. 항상 label 또는 icon text를 같이 둔다.

---

## 3. 핵심 컴포넌트 규칙

### 3.1 StageBreadcrumb

- 6개 stage는 항상 같은 순서: PRD, Design, Build, QA, Deploy, Operate.
- Design 승인 전 Build 이후 단계는 locked style.
- 현재 단계는 primary border + bold label.
- 완료 단계는 success dot만, 과한 체크 아이콘 반복 금지.

### 3.2 ApprovalGateCard

필수 포함:
1. 승인 대상 산출물 3종 링크: Mermaid doc, Excalidraw JSON, design system md.
2. “승인하면 Developer가 Build를 시작한다”는 결과 설명.
3. 버튼 4개: `이 디자인으로 Build 시작`, `특정 부분 수정`, `다시 작업`, `나중에`.
4. 승인 후 immutable record: timestamp, artifact paths, approver label.

### 3.3 DependencyConsentCard

필수 포함:
- 도구/라이브러리 이름과 공식 출처.
- 왜 지금 필요한지.
- 실행될 명령어. 기본 접힘, 고급 보기에서 표시.
- 설치/변경 위치.
- 되돌리는 방법.
- 인증 권한과 토큰 저장 위치.
- 예상 시간.

Primary button은 `설치하기`, `연결하기`, `적용하기`처럼 동사로 쓴다. `OK`, `계속` 금지.

### 3.4 PersonaTrace

- 사용자 표면에는 “PO가 질문 정리 중”, “Designer가 디자인 산출물 작성 중”처럼 자연어 1줄.
- Detail 열면 persona, model/effort, invoked skills, confidence, unresolved를 볼 수 있다.
- Skill chip은 source prefix를 보존한다: `mattpocock/to-prd`, `phuryn/pm-product-discovery`, `PolySkill/search`.

---

## 4. Markdown 렌더링 규칙

| Markdown 요소 | 렌더링 |
|---|---|
| Mermaid fence | `MermaidDiagram` component. parse 실패 시 원문 code block + 오류 1줄 |
| `.excalidraw.json` link | `ExcalidrawPreview` component. 편집은 별도 modal |
| 표 | sticky header, 13–14px, row hover |
| callout | `Info`, `Warning`, `Blocked`, `Approved` 네 종류만 |
| code block | dark surface, copy button, 기본 줄바꿈 off |

---

## 5. Accessibility baseline

- 모든 primary flow는 키보드만으로 가능해야 한다.
- Modal은 focus trap + Esc 취소. 단 설치 실행 중 취소 불가 구간은 명확히 표시.
- 색 대비 WCAG AA 이상.
- 상태 badge는 텍스트를 포함한다: `승인 대기`, `설치 완료`, `막힘`.
