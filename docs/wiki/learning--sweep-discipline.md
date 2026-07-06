---
title: 스윕 규율 (sweep discipline) — 어댑터 시리즈 교훈
type: learning
status: live
version: v1.1
links: ["feature--gui-adapter"]
---
# 스윕 규율 — "목록 대조"가 아니라 "전수 재실행"

v1.1 어댑터 시리즈에서 반복 관찰된 검증 실패 패턴과 처방.

- **호출 그래프를 따라가라, 터치 파일 목록이 아니라.** electron 호출부만 치환해도 위임받는 core 내부 리터럴이 남는다 (유령 `.productune/po-state.json` 사건). change_meta.files 밖에서 같은 필드를 독립적으로 읽는 소비처(MainPanel/WelcomePanel)도 같은 이유로 누락됐다 — 필드 키잉 스윕은 전체 repo grep.
- **생성물 템플릿까지 훑어라.** 셸 스크립트/템플릿 안의 경로 리터럴은 grep에 한 단계 늦게 잡힌다 (pre-push 스크립트 사건). 같은 계열 재발 2회 — 신규 core 모듈에 stateDir() 경유를 강제하는 lint/code-review 체크 항목이 승격 후보로 대기 중.
- **감사 문서의 파일 카운트는 grep 재실행으로 검증하라.** costArchive.ts가 A1 스윕과 T-283 재감사 양쪽에서 누락된 채 "no delta"로 통과했다.
- **오염은 2층위다.** 포팅 시 참고 patch(워킹트리 diff)만 grep하면 커밋층 오염을 놓친다 — `git show <base-HEAD>:<file> | grep <symbol>` 교차 확인.
- **동작을 제거하면 그 동작을 말하는 UI 텍스트도 스윕하라.** no-op 강등 후 완료 화면이 거짓 체크를 표시한 사건 — '동작 제거' 티켓 acceptance에 UI 텍스트 스윕을 명시. 수동 미러 리스트(온보딩 완료 스텝)는 핸들러가 수행 스텝을 반환하는 SoT 구조로 전환 검토.
- **prdt false-positive predicate.** `current_version == null` 류 empty 판정은 prdt에서 필드 부재로 항상 참 — 신규 코드에서 이 형태를 보면 isPrdtPoState 분기 여부부터 확인.
