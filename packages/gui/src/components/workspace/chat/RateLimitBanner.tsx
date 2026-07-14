/**
 * RateLimitBanner — rate-limit countdown banner (T-012).
 *
 * Renders between rp-msgs and rp-input when sessionHealth.state === 'rate-limited'.
 * Three modes (T-352 adds the third):
 *   - 'exact'    — retryAfterSec, or an ISO resetAt that Date.parse resolves —
 *                  ticks down to a real deadline. Calls onExpired() at 0
 *                  (clearHealth() + setStreaming(false)).
 *   - 'estimate' — neither is present — ticks down from a guessed 60s.
 *   - 'static'   — resetAt is a human clock time claude's own session/usage-limit
 *                  message uses ("1:10pm (Asia/Seoul)") that can't be reliably
 *                  converted to an epoch (no tz math without a tz db) — shows the
 *                  time as-is with NO ticking countdown, since a fake countdown
 *                  against a made-up deadline would be actively misleading. The
 *                  user retries manually once the limit has actually reset
 *                  (composer stays disabled via the rate-limited health state
 *                  until then — see ChatPanel's `rateLimited` guard).
 *
 * Design tokens: SessionHealthBanner warn variant
 *   bg = --surface-subpanel #1A1A1A
 *   left bar = --health-warn #FBBF24
 *   icon = lucide Clock 14px
 *   height = 36px
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import type { PoHealthDetail } from '../../../store/sessionHealth'

interface RateLimitBannerProps {
  detail: PoHealthDetail
  onExpired: () => void
}

type BannerMode =
  | { kind: 'exact' | 'estimate'; deadline: number }
  | { kind: 'static'; displayTime: string }

export default function RateLimitBanner({ detail, onExpired }: RateLimitBannerProps) {
  const { t } = useTranslation()
  // mode 는 마운트 시 1회 계산 (ref — re-render 마다 재계산 X)
  const modeRef = useRef<BannerMode>(classifyBannerMode(detail))
  const mode = modeRef.current

  const [remaining, setRemaining] = useState<number>(() =>
    mode.kind === 'static' ? 0 : Math.max(0, Math.ceil((mode.deadline - Date.now()) / 1_000)),
  )

  useEffect(() => {
    if (mode.kind === 'static') return   // no epoch to count down to — static display only
    if (remaining === 0) {
      onExpired()
      return
    }
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((mode.deadline - Date.now()) / 1_000))
      setRemaining(next)
      if (next === 0) {
        clearInterval(id)
        onExpired()
      }
    }, 1_000)
    return () => clearInterval(id)
    // onExpired 은 stable ref 이어야 하지만, 실제로 변경될 경우 re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const text =
    mode.kind === 'static'
      ? t('workspace.chat.rateLimit.limitReached', { time: mode.displayTime })
      : mode.kind === 'estimate'
        ? t('workspace.chat.rateLimit.estimated', { n: remaining })
        : t('workspace.chat.rateLimit.exact', { n: remaining })

  return (
    <div style={banner}>
      <Clock size={14} strokeWidth={2} style={{ color: '#FBBF24', flexShrink: 0 }} />
      <span style={bannerText}>{text}</span>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function classifyBannerMode(detail: PoHealthDetail): BannerMode {
  if (detail.retryAfterSec != null && detail.retryAfterSec > 0) {
    return { kind: 'exact', deadline: Date.now() + detail.retryAfterSec * 1_000 }
  }
  if (detail.resetAt) {
    const parsed = Date.parse(detail.resetAt)
    if (!isNaN(parsed)) return { kind: 'exact', deadline: parsed }
    // T-352: resetAt didn't parse — a human clock time ("1:10pm (Asia/Seoul)"),
    // not ISO. Static display, no fake countdown (see file header).
    return { kind: 'static', displayTime: detail.resetAt }
  }
  return { kind: 'estimate', deadline: Date.now() + 60_000 }
}

// ── styles ─────────────────────────────────────────────────────────────────────

const banner: React.CSSProperties = {
  height: 36,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  background: '#1A1A1A',
  borderLeft: '4px solid #FBBF24',
  borderTop: '1px solid #2A2A2A',
  borderBottom: '1px solid #2A2A2A',
}

const bannerText: React.CSSProperties = {
  fontSize: 11,
  color: '#E0E0E0',
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
