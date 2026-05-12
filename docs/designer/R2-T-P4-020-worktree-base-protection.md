# R2 T-P4-020 design plan trace (OQ resolved 2026-05-11)

## OQ-T020 결정 (designer 권고 그대로 채택)

| OQ | 결정 | 권고 = 결정 |
|---|---|---|
| 1. hook 이미 존재 | backup + 교체 (`.bak` 보존) | ✅ |
| 2. base dirty 시 | 사용자 확인 모달 ("보관할까요 또는 지금 저장할까요?") | ✅ |
| 3. prefix manual override | 자동 분류 only — frontmatter field / Settings X | ✅ |
| 4. remote mismatch | pre-emptive fetch | ✅ |

## §1.5 self-check
- §1.5.1 Few Things ✓ — toast 1줄 + 모달 2종 only
- §1.5.4 Feedback ✓ — error reason 4 enum 자연어 메시지
- §1.5.5 Escape ✓ — base dirty 모달의 보관/저장 둘 다 escape 가능

## 후속 dispatch order
1. T-P4-020 dev impl (다음 turn dispatch)
2. T-P4-021 design plan (autosave hook)
3. T-P4-022 (deploy + PO trigger 모달)
4. T-P4-023 (history 카드 UI)
