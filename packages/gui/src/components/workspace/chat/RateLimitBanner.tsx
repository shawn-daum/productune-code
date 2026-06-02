/**
 * RateLimitBanner — rate-limit countdown banner (T-012).
 *
 * Renders between rp-msgs and rp-input when sessionHealth.state === 'rate-limited'.
 * Counts down from the deadline derived from retryAfterSec > resetAt > 60s fallback.
 * Calls onExpired() when countdown reaches 0 — clearHealth() + setStreaming(false).
 *
 * Design tokens: SessionHealthBanner warn variant
 *   bg = --surface-subpanel #1A1A1A
 *   left bar = --health-warn #FBBF24
 *   icon = lucide Clock 14px
 *   height = 36px
 */

import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import type { PoHealthDetail } from '../../../store/sessionHealth'

interface RateLimitBannerProps {
  detail: PoHealthDetail
  onExpired: () => void
}

export default function RateLimitBanner({ detail, onExpired }: RateLimitBannerProps) {
  // deadline 은 마운트 시 1회 계산 (ref — re-render 마다 재계산 X)
  const deadlineRef = useRef<number>(calcDeadline(detail))

  // isEstimate: retryAfterSec 없고 resetAt 없을 때 true
  const isEstimate = detail.retryAfterSec == null && !detail.resetAt

  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1_000)),
  )

  useEffect(() => {
    if (remaining === 0) {
      onExpired()
      return
    }
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1_000))
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

  const text = isEstimate
    ? `API 한도 도달 — 약 ${remaining}초 후 재시도 가능 (추정)`
    : `API 한도 도달 — ${remaining}초 후 재시도 가능`

  return (
    <div style={banner}>
      <Clock size={14} strokeWidth={2} style={{ color: '#FBBF24', flexShrink: 0 }} />
      <span style={bannerText}>{text}</span>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function calcDeadline(detail: PoHealthDetail): number {
  if (detail.retryAfterSec != null && detail.retryAfterSec > 0) {
    return Date.now() + detail.retryAfterSec * 1_000
  }
  if (detail.resetAt) {
    const parsed = Date.parse(detail.resetAt)
    if (!isNaN(parsed)) return parsed
  }
  return Date.now() + 60_000
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
