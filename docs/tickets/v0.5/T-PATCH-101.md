---
id: T-PATCH-101
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
qa_status: pass
estimated_complexity: L2
effort: medium
created_at: 2026-06-10
slug: prd-open-version-fallback
area_tags: [gui/prd, infra/ipc]
---

# T-PATCH-101 — PRD open-version fallback (snapshot가 없는 current version에서 PRD.md로 폴백)

## §1. Request

### 사용자 보고 (verbatim)

메인 프로세스가 아래 에러를 계속 쏟아낸다:

```
Error occurred in handler for 'artifacts:readFile': ENOENT … docs/prd/versions/v0.5.md
```

### Root cause (코드 인스펙션으로 확인)

1. **PrdSection이 OPEN 버전에 대해 존재하지 않는 스냅샷을 읽으려 한다.**
   `packages/gui/src/components/workspace/PrdSection.tsx:43` 이
   `snapshotRel = docs/prd/versions/<versionId>.md` 를 만들고, 현재 열려있는(OPEN)
   버전 v0.5 에 대해서도 이 경로를 먼저 probe 한다 (L44 의 snapshot-first probe).
   하지만 컴포넌트 자신의 주석(L4–6)과 p5-close doctrine 에 따르면
   `docs/prd/versions/<v>.md` 는 **버전 CLOSE(P5) 시점에만 기록되는 불변(immutable)
   스냅샷**이다. v0.5 는 현재 P3 진행 중(OPEN) 이므로 그 파일은 아직 정당하게 존재하지
   않는다. OPEN/current 버전의 PRD 는 versioned snapshot 이 아니라 살아있는 SoT
   `docs/prd/PRD.md` 에서 읽어야 한다.
   - 확인: `docs/prd/versions/` 에는 `v0.4.md`(closed) 만 있고 `v0.5.md` 는 없음.
     `docs/prd/PRD.md` 는 존재함.

2. **artifacts:readFile 핸들러에 existsSync 가드가 없어 ENOENT 가 그대로 throw 된다.**
   `packages/gui/electron/ipc/artifacts.ts` (~line 147) 가
   `fs.readFileSync(resolved, 'utf-8')` 를 existsSync 체크 없이 호출 → 파일이 없으면
   ENOENT 를 던지고, 이것이 메인 프로세스의 unhandled handler error 로 로그를 도배한다.
   없을 때는 throw 대신 graceful 하게 null/empty 를 반환해야 한다.

즉 (1) 은 "OPEN 버전인데 snapshot 경로를 먼저 때린다"는 잘못된 경로 선택이고,
(2) 는 "없는 파일을 안전하게 다루지 못하는" 핸들러 결함이다. 두 결함이 합쳐져
현재(OPEN) 버전 화면을 열 때마다 ENOENT 스팸이 발생한다.

## §2. Acceptance

- [x] OPEN/current 버전(예: v0.5)에서는 PrdSection 이 `docs/prd/versions/<v>.md` 대신
      살아있는 `docs/prd/PRD.md` 를 읽는다.
- [x] CLOSED 버전(예: v0.4)에서는 기존대로 `docs/prd/versions/<v>.md` 스냅샷을 읽는다.
- [x] 파일이 없을 때 `artifacts:readFile` 핸들러가 더 이상 ENOENT 를 throw 하지 않고
      null/empty 를 반환한다 (메인 프로세스 로그에 ENOENT 스팸이 사라짐).
- [x] CLOSED 버전의 PRD view(v0.4 스냅샷 표시)에 회귀가 없다.
- [x] PRD 가 아직 없는 경우(open version 인데 PRD.md 도 없을 때) UI 가 graceful 한
      empty-state(placeholder)를 표시하고 crash/스팸이 없다.

## §3. Out of scope

- P5 close 시점의 스냅샷 생성/쓰기 로직 변경 (이 티켓은 read-path 만 다룬다).
- MarkdownViewer / artifact-md 탭 렌더링 로직 변경.
- artifacts:readFile 의 path-containment(루트 외부 접근 차단) 안전장치 변경 — 기존 유지.
- po-state / version lifecycle 자체의 스키마 변경.

## §4. Implementation plan

### packages/gui/src/components/workspace/PrdSection.tsx

- **OPEN vs CLOSED 판정 도입.** 현재 `versionId` 만으로 무조건 snapshot 경로를 만드는
  로직(L43–44)을 버린다. 대신 "이 versionId 가 현재(open) 버전인지, 닫힌(closed)
  버전인지"를 결정한다:
  - current/open 버전 식별: `useWorkspace` 의 po-state(현재 버전) 와 props 의
    `versionId` 를 비교한다. `versionId` 가 미지정이거나 현재 open 버전과 같으면
    → **OPEN** 으로 간주.
  - 그 외(닫힌 버전 row 에서 호출) → **CLOSED**.
- **경로 선택을 판정 결과 기준으로 분기.**
  - OPEN → `PRD_MASTER_REL` (`docs/prd/PRD.md`) 만 probe.
  - CLOSED → `docs/prd/versions/<versionId>.md` 만 probe.
  - (기존의 "snapshot-first 후 catch 로 master fallback" 추측 방식을 제거 — 어느
    파일을 읽을지 결정론적으로 정한다.)
- **empty-state graceful 처리.** probe 결과가 없으면(`prd === null`) 기존 placeholder
  를 그대로 표시. OPEN 버전인데 PRD.md 가 없는 정상 상황에서도 에러 없이 placeholder.
- 주석(L1–14) 을 새 동작에 맞게 갱신: "OPEN→PRD.md, CLOSED→snapshot, 추측 probe 제거".

### packages/gui/electron/ipc/artifacts.ts (~line 147)

- `fs.readFileSync(resolved, 'utf-8')` 호출 직전에 `fs.existsSync(resolved)` 가드 추가.
  - 파일이 없으면 throw 하지 말고 `null` (또는 빈 결과) 반환 → 렌더러의 probe 가
    조용히 "not found" 로 처리하도록.
- 기존 path-containment(루트 디렉터리 밖 접근 차단) 체크는 **그대로 유지** — 가드는
  containment 통과 후에만 적용.
- 반환 타입이 null 을 포함하도록 정리하고, 호출부(PrdSection 의 `probe`) 가 null 을
  "found 아님"으로 해석하도록 정합성 확인.

## §5. QA scope

- **smoke** (qa_status: smoke)
  - OPEN 버전(v0.5) 워크스페이스를 열 때 메인 프로세스 로그에 `artifacts:readFile`
    ENOENT 스팸이 없는지 확인.
  - OPEN 버전에서 PRD row 클릭 시 `docs/prd/PRD.md` 가 열리는지 확인.
  - CLOSED 버전(v0.4) row 에서 PRD row 클릭 시 `docs/prd/versions/v0.4.md` 스냅샷이
    열리는지(회귀 없음) 확인.
  - PRD 가 없는 상태에서 placeholder 가 표시되고 crash/스팸이 없는지 확인.

## §6 Persona Activity

<!-- PO managed, append-only, structured — Result ≤ 80 chars -->
| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-developer | opus/standard | 1 | impl: OPEN→PRD.md, CLOSED→snapshot + existsSync guard |
| 2026-06-10 | pdt-qa | opus/standard | 1 | code-verify PASS; smoke→pass; user-verify (open-v0.5 ENOENT/closed-v0.4/missing-PRD) |
