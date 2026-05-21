---
ticket_id: T-PATCH-001
version: v0.4
round: phase3-fixes
type: doctrine-update
status: todo
assignee: pdt-designer
created_at: 2026-04-30T04:34:00Z
started_at: null
completed_at: null
duration_min: null
estimated_complexity: L4
risk_flags: doctrine, protocol-change
slug: po-pre-flight
qa_status: pending
qa_loops: 0
---

# T-PATCH-001: PO pre-flight 체크리스트 프로토콜 + 티켓 타임스탬프 스키마

**Round**: phase3-fixes  **Stage**: doctrine-update  **Status**: done  **Assignee**: pdt-designer
**PRD anchor**: [docs/prd/productune.md#phase-3--phase-4-transition-notes-dogfood-학습](../../prd/productune.md#phase-3--phase-4-transition-notes-dogfood-학습)
**Estimated complexity**: L4  **Risk flags**: doctrine, protocol-change

> Phase 4 진입 전 즉시 적용해야 할 프로토콜 패치 2 개. Phase 3 dogfood 에서 발견된 PO 오케스트레이션 버그 (외부 의존성 위임 전 미요청) + Phase 4 대시보드 데이터 소스 결손 (티켓 타임스탬프 누락) 을 doctrine 수준에서 해소.

---

## Request

Phase 3 dogfood 결과 두 가지 즉각 패치가 필요:

### Fix 1 — PO pre-flight 체크리스트 프로토콜

**문제**: T-002 Google OAuth 케이스. PO 가 외부 의존성 (OAuth 앱 설정, API 키, 외부 서비스 가입, CLI 설치 등) 을 사용자에게 사전 요청하지 않고 페르소나에 위임 → 페르소나가 작업 중간에 막힘 발견 → 위임 실패 + 사용자 컨텍스트 전환 비용 발생. PO 오케스트레이션 버그.

**수정**: PO 가 L3+ 티켓 위임 전, 해당 티켓의 외부 의존성을 스캔 → 사용자에게 체크리스트 형태로 먼저 요청 → ✅ 확인 후에만 위임 진행. 형식 예시:

> 이 티켓 시작 전 필요한 것:
> - [ ] Google OAuth Client ID/Secret 발급 ([가이드 링크](...))
> - [ ] `.env.local` 에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 추가
>
> 완료되면 알려줘 → 위임 시작.

**스캔 대상 (외부 의존성 카테고리)**:
- 새 env 변수 추가 (PRD/티켓 본문에 신규 키 등장)
- OAuth 앱 / API 자격증명 (Google / GitHub / Supabase / Vercel 등)
- 외부 서비스 가입 (Vercel / Supabase / Cloudflare 등)
- 새 CLI 도구 설치 (`vercel`, `supabase` 등)
- 도메인 / SSL / DNS 권한
- 결제 정보 (유료 플랜 필요한 기능)

**적용 범위**: L3+ 티켓 (L1–L2 trivial 은 스킵). 위임 전 PO 가 1 회 fast-skim 후 외부 의존성 발견 시 게이트 발동.

### Fix 2 — 티켓 타임스탬프 스키마 표준화

**문제**: 현재 ticket markdown 파일에 타임스탬프 필드 없음. `po-state.json past_tickets` 에 `started_at`/`ended_at` 은 있으나 `created_at` 누락, `persona_session_meta` 에 `started_at` 없음 (`created_at` + `last_seen` 만). Phase 4 대시보드 (티켓 카드 / 6-stage breadcrumb / 페르소나 활동 시간선 / duration 통계) 가 의존할 데이터 소스가 결손 상태.

**수정**: 세 곳에 타임스탬프 필드 표준 추가:

(a) **ticket markdown frontmatter 표준**:
```yaml
---
ticket_id: T-NNN
round: <round-id>
type: PRD|test|issue|impl|refactor|qa
status: todo|in-progress|review|done|blocked|abandoned
assignee: pdt-<persona>
created_at: 2026-MM-DDTHH:MM:SSZ
started_at: null
completed_at: null
duration_min: null
estimated_complexity: L<n>
risk_flags: <auth|payments|migration|none>
---
```

상태 전이 시 mechanical update:
- `todo → in-progress`: `started_at` 채움
- `in-progress → done|abandoned|blocked`: `completed_at` + `duration_min` (= `completed_at - started_at` 분 단위) 채움

(b) **`po-state.json` `past_tickets[]` 스키마 보강**:
```json
{
  "ticket_id": "T-NNN",
  "slug": "...", "title": "...",
  "created_at": "...",
  "started_at": "...",
  "ended_at": "...",
  "duration_min": 47,
  "status": "done", "stage": "impl",
  "calibration_outcome": { "...": "..." }
}
```

(c) **`persona_session_meta.<persona>` 에 `started_at` 필드 추가** (기존 `created_at` + `last_seen` 과 별개):
```json
"persona_session_meta": {
  "pdt-designer": {
    "id": "...",
    "created_at": "...",
    "started_at": "...",
    "last_seen": "...",
    "turns": 4,
    "model_history": ["..."],
    "effort_history": ["..."],
    "complexity_level": "L6",
    "confidence_history": [0.7, 0.85, 0.9, 0.92]
  }
}
```

`created_at` = 세션 ID 발급 시각, `started_at` = 페르소나가 해당 티켓에서 처음 invoke 된 시각 (대시보드의 페르소나별 활동 시간선 기준점).

---

## Inputs

- PRD: [docs/prd/productune.md](../../prd/productune.md) — Phase 4 활동 로그 + Phase 3 → 4 transition notes
- 기존 doctrine: [po/sections/delegation.md](../../../po/sections/delegation.md), [po/sections/tickets.md](../../../po/sections/tickets.md)
- Phase 3 dogfood 케이스: T-002 Google OAuth (외부 의존성 미요청 위임 실패)
- Phase 4 로드맵: [docs/tickets/v0.4/ROADMAP.md](../phase4/ROADMAP.md) — 타임스탬프 표준 의존 라운드/티켓 명시

## Acceptance

### Fix 1 (PO pre-flight)
- [ ] `po/sections/delegation.md` 에 "Pre-flight external dependency check" 섹션 신설 — 트리거 (L3+) / 스캔 카테고리 6 종 / 사용자 체크리스트 메시지 포맷 / ✅ 확인 후 위임 흐름 명시
- [ ] 스캔 카테고리 6 종 (env / OAuth / 외부 서비스 가입 / CLI 설치 / 도메인 / 결제) 각각의 detection 규칙 1 줄씩 정의
- [ ] L1–L2 trivial 은 게이트 스킵 명시 (현재 trace 패턴과 정합)
- [ ] 체크리스트 메시지 형식 예시 1 개 포함 (Google OAuth 케이스 그대로)
- [ ] 사용자 응답 ("완료" / "스킵하고 진행" / "이거 못해") 처리 분기 정의

### Fix 2 (타임스탬프 스키마)
- [ ] `po/sections/tickets.md` 의 ticket file format 예시에 frontmatter (`created_at` / `started_at` / `completed_at` / `duration_min` 포함) 추가
- [ ] `po/sections/tickets.md` 의 po-state.json schema 예시에 `past_tickets[]` 의 `created_at` + `duration_min` 추가
- [ ] `po/sections/tickets.md` 의 schema 예시 `persona_session_meta` 항목에 `started_at` 필드 추가 + `created_at` 과의 의미 차이 1 줄 주석
- [ ] 상태 전이 시 mechanical update 로직 (`started_at` / `completed_at` / `duration_min`) 을 `tickets.md` 또는 `delegation.md` 에 `jq` 스니펫으로 명시
- [ ] 기존 `past_tickets` 데이터 마이그레이션 정책 명시: **마이그레이션 X**, 누락 항목은 GUI 에서 "—" + warning badge (Phase 4 ROADMAP 의 결정 그대로)
- [ ] Phase 4 ROADMAP 의 "타임스탬프 필드 표준" 섹션과 doctrine 이 일치하는지 cross-check

## Out of scope

- 기존 `past_tickets` 데이터 백필 / 마이그레이션 (의도적으로 X — 신규 표준은 forward-only)
- 타임스탬프 기반 시각화 컴포넌트 구현 (Phase 4 Round 4 의 T-P4-043 에서)
- pre-flight 게이트의 GUI 표현 (Phase 4 Round 4 에서; 본 패치는 doctrine + CLI 동작만)
- 외부 의존성 자동 충족 (e.g. OAuth 앱 자동 발급) — Phase 4 Round 1 의 T-P4-014 등 별도 티켓
- 타임스탬프 외 다른 메타데이터 필드 (e.g. `reviewer`, `pr_url`) 추가 — 별도 패치
- mode toggle (`planner | developer`) 관련 변경 — Phase 4 Round 1 에서

---

## Notes

- 본 패치는 **Phase 4 진입의 prerequisite**. ROADMAP.md 가 명시한 "타임스탬프 필드 표준" 의 doctrine 반영 단계.
- Designer 가 doctrine md 두 파일 (`po/sections/delegation.md`, `po/sections/tickets.md`) 를 직접 편집. 페르소나 doctrine 변경 = 즉시 다음 호출부터 적용되므로 큰 회귀 위험은 없음 — 다만 hook 측 (`scripts/hooks/post-delegate-state-write.sh`) 의 `persona_session_meta` 쓰기 로직이 새 `started_at` 필드를 자동으로 채우는지 확인 필요 (필요 시 별도 후속 티켓 발행).
- Fix 1 의 pre-flight 체크리스트 메시지는 사용자 언어 (caveman lite, 한글) 로 surface. doctrine 본문은 영어 (기존 doctrine 정합).
