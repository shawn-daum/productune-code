# T-P4-023 design plan — R2 finale + OQ-T023-1~6 trace

본 plan = R2 마지막 ticket. OQ-T023-1~6 confirm 전후 trace 보존.

## Designer 권고 default

- OQ-1 카드 UI 위치 = Main pane tab `version-history` (T-P4-046 12번째)
- OQ-2 deploy entry = 별 카드 (좌측 border accent)
- OQ-3 시간순 default = 최신 위
- OQ-4 filter MVP = persona + date range
- OQ-5 어휘 = version 기반 ("이번 작업"/"지난 작업"), round = dev mode inner
- OQ-6 deploy 카드 영속화 = 마지막 20회 `~/.productune/state/deploy-history/<hash>.json`

## SoT 정정

- ticket md (T-P4-023.md) line 30 의 "past_tickets timeline" stale → useTicketScan SoT (T-P4-065 sub-f 정합)
- commit msg format T-P4-021 §3 신규 `[<reason>: <before>→<after>]` 정합

## Implementation 3단 PR

- 1차 sub-a~f (MVP minimum)
- 2차 sub-g~k (filter + 영속화 + live update)
- 3차 sub-l~n (dev raw + vocab lint + virtual list)
