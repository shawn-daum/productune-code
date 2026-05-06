# UX Flow — productune GUI (Phase 4)

**Slug**: productune  **Created**: 2026-04-30  **Status**: draft

핵심 사용자 여정: **단일 GUI 모드** (terminal 무노출, GUI-only). `docs/design/productune/mockups/mockup.html` 이 workspace shell 의 source of truth 이다.

---

## 전체 앱 화면 전환

```mermaid
flowchart TD
    LAUNCH([앱 실행]) --> HOME[홈 화면\n새 프로젝트 / 기존 폴더 / Recent]

    HOME -->|새 프로젝트 만들기| INIT[프로젝트 init\nslug 입력 + GitHub 연결 선택]
    HOME -->|기존 폴더 열기| PICKER[폴더 선택 다이얼로그]
    HOME -->|Recent 클릭| WORKSPACE

    INIT -->|GitHub 연결| GITHUB[GitHub OAuth\n private repo 자동 생성]
    INIT -->|로컬 전용| WORKSPACE
    GITHUB --> WORKSPACE

    PICKER -->|.productune/ 없음| INIT_PROMPT[이 폴더에 productune 시작하기?]
    PICKER -->|.productune/ 있음| WORKSPACE
    INIT_PROMPT -->|확인| WORKSPACE

    WORKSPACE[메인 워크스페이스\nActivity Bar + Side Panel + Main split-pane + Right PO Chat]

    WORKSPACE -->|PRD stage| PRD_CHAT[Right PO Chat\n 단일 PO 세션]
    PRD_CHAT -->|PRD ready| DESIGN_GATE

    WORKSPACE -->|Design stage| DESIGN_GATE[디자인 검토 화면\n 4종 산출물 뷰어]
    DESIGN_GATE -->|system 탭| SYSTEM_VIEW[Design System 뷰어]
    DESIGN_GATE -->|flow 탭| FLOW_VIEW[UX Flow Mermaid 뷰어]
    DESIGN_GATE -->|wireframe 탭| WF_VIEW[Wireframe Excalidraw 뷰어]
    DESIGN_GATE -->|mockup 탭| MOCKUP_VIEW[Hi-fi Mockup 뷰어]
    DESIGN_GATE -->|이대로 진행| BUILD_STAGE
    DESIGN_GATE -->|다시 작업| PRD_CHAT

    WORKSPACE -->|Build stage| BUILD_STAGE[빌드 진행\nProject 탭 Tickets + Main ticket-review + PO trace]
    BUILD_STAGE -->|Developer 위임| PERSONA_TRACE[Persona Activity streaming\n 구현 결과 도착]
    PERSONA_TRACE -->|티켓 완성| TICKET_REVIEW[Ticket Review Gate\n변경 파일 + 요약 + 승인]
    TICKET_REVIEW -->|승인 ✓| NEXT_TICKET{다음 티켓 있음?}
    TICKET_REVIEW -->|수정 요청| PERSONA_TRACE
    NEXT_TICKET -->|yes| BUILD_STAGE
    NEXT_TICKET -->|no| QA_VIEW

    WORKSPACE -->|QA stage| QA_VIEW[QA 결과 뷰어\n pass / fail 판정]
    QA_VIEW -->|fail → 재작업| BUILD_STAGE
    QA_VIEW -->|pass| DEPLOY_VIEW

    WORKSPACE -->|Deploy stage| DEPLOY_VIEW[배포하기\n 배포 준비 → 승인 → Vercel]
    DEPLOY_VIEW -->|배포 완료| OPERATE_VIEW

    WORKSPACE -->|Operate stage| OPERATE_VIEW[운영 대시보드\n 다음 라운드 입력]
    OPERATE_VIEW -->|새 라운드 시작| PRD_CHAT
```

---

## 사용자 여정 1 — 새 프로젝트 (단일 GUI 모드)

```mermaid
sequenceDiagram
    actor User as 기획자
    participant App as productune GUI
    participant PO as pdt-po
    participant Designer as pdt-designer
    participant Dev as pdt-developer
    participant QA as pdt-qa

    User->>App: 앱 실행 → [새 프로젝트 만들기]
    App->>User: slug 입력 + GitHub 연결 선택
    User->>App: slug="my-saas", GitHub 연결
    App->>App: GitHub OAuth → private repo 생성
    App->>User: 메인 워크스페이스 (PRD stage 활성)

    User->>App: 채팅에 아이디어 입력
    App->>PO: 위임 (discovery interview)
    PO-->>App: 질문 relay (clarity loop)
    App->>User: "어떤 문제를 해결하나요?" (PO 질문)
    User->>App: 답변
    App->>PO: 답변 전달 → brief 완성
    PO->>Designer: PRD 작성 위임 (opus/max)
    Designer-->>App: PRD ready + 티켓 발행
    App->>User: "PRD 완성. 디자인 단계로 갈까요?" ← 사용자 게이트

    User->>App: 확인
    App->>PO: Design stage 진입
    PO->>Designer: design 4종 티켓 위임
    Designer-->>App: system.md + flow.md + wireframes + mockups
    App->>User: 디자인 검토 화면 (탭 4개)
    User->>App: mockup 검토 후 "이대로 진행"

    App->>PO: Build stage 진입
    PO->>Dev: 구현 티켓 위임 (sonnet/high)
    Dev-->>App: 구현 완료 + Persona Activity append
    App->>QA: QA 위임 (haiku)
    QA-->>App: pass
    App->>User: "QA 통과. 배포할까요?"
    User->>App: [배포하기]
    App->>App: 내부 배포 준비 → 승인 게이트 → Vercel 배포
    App->>User: "배포 완료 ✓ URL: https://my-saas.vercel.app"
```

---

## 화면 계층 (IDE paradigm)

```mermaid
graph LR
    subgraph "앱 레벨"
        H[홈 화면\nExplorer — 폴더 열기/새 프로젝트]
    end

    subgraph "IDE Layout"
        TB[Title bar\nQuick Open ⌘P]
        AB[Activity Bar 48px\n📁 Explorer\n⚡ Project\n👥 Team\n⚙ Settings]
        SP[Side Panel 260px\n선택 icon에 따라 변경]
        MP[Main Panel\nSplit-pane + tabs]
        RP[Right PO Chat 340px\n단일 PO 세션\n접힘 → FAB]
        SB[Status Bar 22px\nfull-width]
    end

    subgraph "Side Panel views"
        SP -->|Explorer| FT[File Tree + 검색\n.md/.json/.ts 클릭 → Main 탭]
        SP -->|Project| PW[Stage strip / Rounds / Tickets\nPreview / Recent Activity]
        SP -->|Team| TM[Personas / Skills\nWiki / Memory\nMatrix ↗]
        SP -->|Settings| ST[Env / Models\nMCP / Hooks / Workflow rules]
    end

    subgraph "Main Panel tabs"
        MP --> MDT[Markdown viewer\nPRD / ticket / design docs]
        MP --> DGT[Design Gate tab\n4-subtab 산출물 뷰어]
        MP --> TRT[Ticket Review tab\n변경파일 + PA table + 승인]
        MP --> PVT[Preview tab\nLocal / Vercel iframe]
        MP --> QAT[QA Result tab\npass/fail + suites]
    end

    H --> TB
    TB --> AB
    AB --> SP
    FT -->|file click| MDT
    PW -->|Design Gate| DGT
    PW -->|Ticket in review| TRT
    PW -->|Preview| PVT
```

---

## 상태 전이 — 6-stage + Review Gates

```mermaid
stateDiagram-v2
    [*] --> PRD : 프로젝트 시작
    PRD --> DesignReview : PRD ready
    note right of DesignReview : Gate 1 — Design Review\n4종 산출물 검토·승인
    DesignReview --> Build : 승인
    DesignReview --> PRD : 다시 작업

    Build --> TicketReview : 티켓 완성
    note right of TicketReview : Gate 2 — Ticket Review\n변경 파일·요약·승인 (티켓마다)
    TicketReview --> Build : 다음 티켓 또는 수정 요청
    TicketReview --> QA : 모든 티켓 승인

    QA --> Build : fail
    QA --> Deploy : pass (사용자 확인)
    Deploy --> Operate : 배포 완료
    Operate --> PRD : 다음 라운드
```

---

## 핵심 화면 목록 (wireframe + mockup 대상)

| 화면 | 설명 | 우선순위 |
|---|---|---|
| **Home** | 새 프로젝트 / recent / 기존 폴더 | P0 |
| **Workspace shell** | Activity Bar 48px + Side Panel 260px + Main split-pane tabs + Right PO Chat 340px + full-width Status Bar | P0 |
| **Project tab stage strip** | 상단 standalone breadcrumb 대체. Project 탭 내부 stage strip + PO Chat ctx chip | P0 |
| **Design review gate** | Main `design-gate` 탭에서 4-subtab 디자인 산출물 뷰어 + 승인 | P0 |
| **Team tab** | Personas / Skills / Wiki-Memory / Promotion candidates. 우측 별도 panel 아님 | P0 |
| Env panel | Settings 탭 entry + Main `env-view` 로 3-layer env 관리 | P1 |
| Deploy flow | 배포하기 → 진행 상황 | P1 |
| Memory editor | Team 탭 entry + Main 탭 기반 3-tier 메모리 검토/수정 | P2 |
