# Wiki inbox — 1-line memory_notes appends; curated at stage boundaries
- env find(T-313): GUI locale은 packages/gui/src/locales/{en,ko}.json — check-locale-keys.js가 build/lint에서 parity 강제.
- env find(T-313): state:poStateChanged webContents.send(projectDir 일치)로 디스크 쓰기 없이 poState 핫스왑 — stage/phase UI 상태 라이브 구동 저비용 패턴.
- DS(T-314): prdt stage taxonomy(define/build/ship/retro)는 legacy 5-phase §2.6 축과 완전 분리된 별도 축 — 향후 GUI native prdt rework에서도 병합 금지(문서·코드 주석 동일 원칙).
- DS 이월 후보(T-314): queueChip padding(3×6)·remove-icon(13px) off-grid — §11 migration plan 대상. prdt stage 4색 CSS custom property 승격(--prdt-stage-*)도 미래 마이그레이션 판단.
- jq footgun(T-316): 함수 인자 cmd는 현재 '.'에 재평가되는 closure — any(gen; cond) 안에선 generator 원소에 바인딩됨. generator 진입 전 `(cmd) as $c |`로 강제 평가. 디버그 1사이클 소모.
- env find(T-316): core vitest에서 실제 셸 스크립트 e2e 구동 가능 — execFileSync('bash',[install.sh]) + 샌드박스 HOME/PRDT_HOME/CLAUDE_DIR(스크립트가 3개 env 존중). jq 로직 중복 없는 최고 충실도 회귀. test.skipIf(!hasJq()) 가드.
- 참조(T-316): legacy 배포 아티팩트 식별 = /scripts/hooks/<basename>.sh 경로 접미(18종+statusline-productune.sh) — 타 앱/사용자 훅 안전. 정본 목록은 install.sh @475f30b~1.
