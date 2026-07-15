---
title: Claude Code hook 동작 사실 (Claude Code hook behavior facts)
type: fact
status: live
version: v1.1
links: ["fact--discipline-editing"]
---

# Claude Code hooks — prdt hook 설계에 영향 주는 실측 사실

## additionalContext persist-truncation (T-358 실사고)
- additionalContext는 **hook 커맨드별로 독립적으로** persist-truncate됨 (~10KB 초과 → 파일 persist + 2KB 미리보기만 컨텍스트 노출). 같은 event/matcher를 공유해도 각자 판정.
- **잘리면 안 되는 소형 payload는 자체 hook 등록으로 분리**하는 게 신뢰 가능한 완화 — 큰 블록 뒤에 붙이면 유실됨 (v1.1에서 기기 override 3건이 통째로 유실된 실사고 → `prdt-overrides-inject.sh` 분리, T-358).
- 라이브 실증: prdt-session-start.sh ~17KB는 persist/preview, 같은 턴의 소형 co-registered hook은 전문 렌더.

## prdt hook 설계 원칙
- stage-guard(UserPromptSubmit, T-336)는 **advisory-only** — prdt 프로젝트 디렉토리에서만 발화, 프롬프트당 1줄 비용, 그 외 무음. soft stages 보존 (doctrine #5).
- **한국어 프롬프트 매칭 토큰은 구(phrase) 단위** — 한국어엔 \b가 없어 bare 명사는 합성어에 오발화 (라이브러리→라이브, 머지소트→머지). intent가 드러나는 접미/목적어와 짝지을 것. 출시/릴리즈는 bare 유지 중 — '릴리즈 노트'류 오탐이 보이면 같은 처방.
- persona 부트스트랩(prdt-*.md)은 hook 주입이 있어도 self-load를 중복 실행하는 경향 실측 (T-340, 문구 강화로 감소·근절은 안 됨) — 유사 회귀 시 hook wiring보다 self-load 분기 문구부터 의심.
- discipline 원본은 `packages/core/discipline/` — 수정분이 세션에 반영되려면 install.sh 재실행(미러 갱신) 필요. 미러 staleness 자동 감지는 T-353(backlog).
