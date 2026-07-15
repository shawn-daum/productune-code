---
title: GUI 런타임 아키텍처 사실 (GUI runtime architecture facts)
type: fact
status: live
version: v1.1
links: ["fact--gui-testing-env", "feature--gui-adapter"]
---

# GUI 런타임 아키텍처 — po-runner/health/model 파이프라인 사실

v1.1 patch 스트림(T-334~355)에서 실측으로 확정된 GUI 내부 구조 사실. 이 영역을 만질 때 먼저 읽을 것.

## po-runner 스트림/헬스 파이프라인
- **rate-limit 분류기는 2벌** — stderr-tail exit-code 경로(T-PATCH-271)와 `type:'result', is_error` JSON 경로. T-352에서 `classifyExitError`/`extractRateLimitReset`로 통일했지만, 감지 로직 추가 시 **두 경로 모두** 확인할 것.
- **'delegating' 헬스 이벤트는 dispatch당 2발** — detail 없는 선행 ping 후 persona 실린 재발신, 같은 priority. 소비자는 persona-aware 같은-priority 예외가 필요 (plain advance-only cascade는 두 번째 payload를 조용히 드롭 — T-355 실사고). 세 번째 소비자가 생기면 decision 페이지로 승격 검토.
- persona 라벨: 사용자 노출 표면은 반드시 `personaIdFromAgentType` → `PERSONA_LABELS` 매핑 경유 ("prdt-developer" 노출 금지). T-355에서 SessionHealthSegment가 마지막 미적용 표면이었음 — 신규 표면 추가 시 sweep.

## 모델 id 캡처
- **system init 봉투가 top-level model id를 턴 시작마다 실음** (날짜 스탬프 포함, 예 `claude-haiku-4-5-20251001`) — 세션 모델 캡처는 assistant 라인보다 init이 우선 포인트 (T-338 프로브).
- 워커 모델은 `extractSubagentCapture().model` → 기존 `po:worker-meta` 채널 (persona는 `delegatedByToolUseId.get(parent_tool_use_id)`) — 스트림에 model이 안 실리면 무해하게 미표시 (T-334).
- 표시 정책: `gui_model ?? 'opus'`는 display 전용 — po-runner spawn semantics(null=inherit)는 resume 보호 위해 불변 (T-334/335). alias 버전 표기는 관측 id 우선 + 번들 기본값, `pdt:po-model-observed` localStorage persist (T-342 ADR: 머신 레벨 사실이라 renderer-only zustand persist 채택, IPC 신설 회피).

## 기타 배선 사실
- GUI locale = `packages/gui/src/locales/{en,ko}.json`, `check-locale-keys.js`가 build/lint에서 parity 강제.
- `state:poStateChanged` webContents.send(projectDir 일치)로 디스크 재읽기 없이 poState 핫스왑 — stage/phase UI 라이브 갱신 저비용 패턴.
- **electron main/preload는 Vite HMR 미적용** — main 변경 검증은 반드시 앱 재실행(또는 fresh build+launch) 후.

## 렌더링/CSS footgun (T-325/327/354 실측)
- remark-rehype는 ordered-list `start!=1`일 때만 hast start emit — 커스텀 ol의 CSS 카운터는 start 기반 var로 counter-reset 시드해야 연속성 유지. CSS var 시드는 DOM 상속되므로 중첩 경계마다 명시 리셋(자체 start 없으면 0). MdRenderer ol 로직엔 아직 자동 테스트 없음(회귀 취약 — 후속 후보).
- Chromium: flex column + `justify-content:flex-end` + `overflow-y:auto` 조합은 넘친 내용이 스크롤 원점 위로 escape해 wheel-up 불가 — 해법은 justify 제거 + content wrapper(flexShrink:0)에 `margin-top:auto`. 스트림 로그 라인 children은 flexShrink:0 필수.
- `flex:1`+`alignSelf:stretch` 체인은 모든 조상이 definite height일 때만 유효 — 조상 하나가 `alignItems:center`면 content-sizing으로 조용히 fallback (T-327).
- **IME 조합 teardown**: textarea 리마운트는 브라우저 측 세션만 폐기 — macOS 입력기는 자체 상태를 들고 다음 포커스된 editable에 재삽입. 신뢰 시퀀스 = `blur()`(OS 커밋 강제) → 클리어/리마운트 → 리포커스 1 macrotask 지연 (React 18이 discrete keydown 안에서 effect 동기 flush하므로 같은 이벤트 내 리포커스는 죽어가는 세션을 재장전) (T-344→354 최종형).
- 알려진 미해결 quirk: compact WorkerStreamSlot에서 scrollHeight 오보고로 wheel-up 스크롤 불가 (auto-follow는 정상, T-327 유보 — non-blocking).
