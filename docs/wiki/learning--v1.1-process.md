---
title: v1.1 프로세스 교훈 (process lessons)
type: learning
status: live
version: v1.1
links: ["fact--gui-testing-env", "retro--v1.1"]
---

# v1.1 프로세스 교훈 — 라우팅/검증 품질

- **"proof of behavior" = landed regression test** — ad-hoc node repro는 오늘 맞아도 내일 가드가 없다. 로직 있는 IPC 핸들러의 doctrine#4 증명은 커밋된 테스트 (T-320).
- **검증 레벨은 결함이 사는 레벨에 맞춘다** — 문자열/유닛 레벨 green이 실렌더 DOM(react-markdown href sanitize, T-345)·실 OS IME(T-344→354)·실터미널 stderr 렌더(T-332 블라인드 메뉴)의 결함을 통과시킨 사례 3건. "클릭 가능/보인다/입력된다"류 acceptance는 해당 레벨의 실구동 없이 pass 처리 금지.
- **커플링된 결함을 non-blocking으로 쪼개 미루면 재작업이 늘어난다** — fragile CSS 컴포넌트는 증상별 좁은 QA 말고 상태 매트릭스(줄수×레이아웃×상태) 통검증 (T-327, 3라운드 재작업).
- **필드 "존재"에 키한 휴리스틱은 "존재하지만 진행이 아니라 생성으로 채워진" 케이스 테스트 필요** — 무관한 후속 변경이 신호 필드를 채우기 시작하면 조용히 틀려짐 (T-324).
- **설치본 동기화 주장은 영향 파일 전부 diff** — "synced X"가 4개 중 1개만 sync한 사례 (T-340 QA).
- **dirty tree 위 검증에서 파일 임시 변형 시 복원점 먼저** — `git checkout` 원복이 개발자 미커밋 diff를 날린 실사고 (T-345 QA).
- **PO 디스패치 힌트는 참고, 워커가 실제 코드로 재확인** — 존재하지 않는 테스트 패턴을 힌트로 준 사례 (T-320).
- QA env: contextBridge로 freeze된 window.api는 monkeypatch 불가 — 관찰 가능한 부작용(DOM/파일) 기반 설계. 라이브 테스트에 실 워크트리 projectDir 사용 금지(실 chat.json 오염) — 항상 mkdtemp fixture (T-316).
