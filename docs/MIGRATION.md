# prdt 전환 매뉴얼 (productune → prdt)

> productune(구 시스템)을 쓰던 사람이 prdt로 갈아타는 전체 흐름.
> 원리·설계는 [`prdt-v1-flip.md`](prdt-v1-flip.md)·[`prdt-v1-design.md`](prdt-v1-design.md), 여기는 **하는 법**만.

전환은 딱 두 층위예요. **기기는 한 번, 프로젝트는 각각.**

```
┌─ 기기 전환 (기기당 1회) ─────────┐   ┌─ 프로젝트 이관 (프로젝트마다) ──┐
│  productune → Y   또는           │   │  cd <프로젝트>                  │
│  git clone → prdt-flip.sh        │──▶│  prdt → Y  →  아무 말           │
│  (구 hook/agent 은퇴, prdt 설치) │   │  (이관 + PO 자동 브리핑)        │
└──────────────────────────────────┘   └────────────────────────────────┘
```

---

## 1단계 — 기기 전환 (그 기기에서 처음 한 번만)

자기 기기가 어떤 상태인지에 따라 셋 중 하나:

### A. 구 productune을 CLI로 쓰던 기기 (가장 흔함)
```bash
productune          # 실행하면 전환 제안이 뜸 → Y
```
자동으로: 백업 → v1 가져오기 → 구 hook/agent 은퇴 → `~/.productune` 정리 → prdt 설치 → 검증.
끝나면 `prdt`·`prdt migrate`를 쓸 수 있어요. 이후 `productune`을 치면 "은퇴했어요" 안내만 나와요.

> 제안이 안 뜨면: `productune update` 한 번 실행(최신 받기) 후 다시 `productune`.

### B. productune을 **GUI 앱**으로만 쓰던 기기
앱 번들엔 git repo가 없어 위 자동 제안이 안 와요. 새 기기 경로(C)로 진행하세요.

### C. 완전 새 기기 / 새 합류자 (productune 흔적 없음)
```bash
git clone <productune repo> && cd productune
git checkout v1
packages/core/scripts/prdt-flip.sh      # 걷어낼 구 시스템이 없어도 안전 — 설치만 수행
```

**공통**: 전환 실패 시 자동 롤백돼 구 환경이 그대로 남아요. 수동 롤백은 출력에 찍힌
`prdt-flip.sh --rollback <백업경로>`.

---

## 2단계 — 프로젝트 이관 (이어서 작업할 프로젝트마다)

```bash
cd <프로젝트 폴더>
git status        # 미커밋 변경 있으면 먼저 커밋 (이관이 파일을 고쳐 씀)
prdt              # 구 프로젝트면 "마이그레이션할까요? [Y/n]" → Y
                  # → 이관 후 곧바로 PO가 열림
<아무 말이나>     # "다음 뭐 하지?" / "ㄱㄱ" 등 — PO가 알아서 브리핑+제안
```

- **첫 마디를 조립할 필요 없어요.** 이관된 프로젝트는 PO가 스스로 상태(stage·버전·오픈 티켓·
  최근 커밋)를 훑어 브리핑하고 다음을 제안합니다. 직전 작업을 기억하면 한 줄 덧붙이면 더 빨라요.
- 미리 보고 싶으면: `prdt migrate --dry-run` (아무것도 안 바꾸고 계획만 출력).
- 안 이어갈 프로젝트는 **그냥 두세요** — 이관은 옵트인. 조회는 계속 되고, 필요해질 때 이관하면 돼요.

### 이관이 하는 일 / 안 하는 일
| 이관됨 | 안 건드림 |
|---|---|
| po-state(phase→stage), 티켓(전량 v1 스키마), 위키(calibration·bookshelf·retro), surfaces | 소스 코드, git 이력, 원본 문서(legacy로 잔존) |
| 유실 필드는 티켓 본문 주석에 보존 | `docs/backlog.md`(Retro에서 PO가 수동 triage) |
| 구 마커 → `.productune(-lite).migrated`로 백업 개명 | — |

진행 중이던 작업 포인터(current_task)는 비워져요 — PO가 티켓·주석에서 복원하니 문제 없어요.

---

## 3단계 — 이후 일상

```bash
prdt                 # 프로젝트에서 PO와 대화 (신규 폴더면 init부터)
prdt doctor          # 상태 검진 (non-blocking)
prdt tickets --ready # 진행 가능한 티켓
prdt wiki search "질의"
prdt update          # prdt 최신화 (repo pull + 재설치)
```

---

## 트러블슈팅

| 증상 | 원인 / 처방 |
|---|---|
| `productune` 쳐도 제안이 안 뜸 | 앱 번들 설치 기기(B) — 새 기기 경로(C)로. 또는 `productune update` 후 재시도 |
| `prdt migrate: .prdt/ already exists` | 이미 이관됨. 바로 `prdt`로 진입 |
| PO가 브리핑 없이 일반 안내만 함 | 이관 온보딩은 1회용 — 이미 소비됨. 그냥 "상태 브리핑해줘"라고 하면 됨 |
| flip 도중 실패 | 자동 롤백됨 — 구 환경 그대로. 재시도하거나 원인 공유 |
| (VM ssh 헤드리스) `Not logged in` | keychain 잠금 — `security unlock-keychain` 선행 (`prdt-v1-flip.md`·QA 하니스 매뉴얼) |

---

## 롤백 (기기 전환 되돌리기)

```bash
prdt-flip.sh --rollback ~/.prdt/flip-backup-<타임스탬프>
```
settings·구 agent·`~/.productune` 홈까지 백업에서 복원돼요. 프로젝트 이관 되돌리기는
`.productune(-lite).migrated`를 원래 이름으로 되돌리고 `.prdt`를 지우면 됩니다.

---

## 팀 공지용 3줄 요약

1. **CLI 쓰던 분**: `productune` 실행 → Y (기기당 한 번).
2. **이어갈 프로젝트**: 폴더에서 `prdt` → Y → 아무 말 (PO가 브리핑).
3. **안 급하면 안 해도 됨** — 이관은 옵트인, 기존 프로젝트는 그대로 조회 가능.
