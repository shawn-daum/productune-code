/**
 * EstimatedBadge — "estimated" cost pill (T-290 / A7, consolidated in T-313).
 *
 * Shown next to a cost value whose contributing turns.jsonl line(s) carry
 * `cost_source:"estimated"` (usage×price-table conversion, not the real
 * invoice). `"reported"`/absent → renders nothing.
 *
 * T-313 (Ship-entry DS conformance): single shared implementation — was
 * duplicated as CostArchivePanel `estBadge` + UsageBar `costEstBadge`, both
 * off-spec. Now design-system §8.2 Pill/Chip, neutral variant:
 *   uppercase · `pill` typography recipe (`--text-xs` 10px · semibold ·
 *   `--tracking-widest`) · `--radius-pill` · bg `--surface-subpanel` ·
 *   text `--text-secondary`.
 * Hex inlined per the codebase's current convention (CSS-var migration is
 * tracked separately, see phase-mapping.ts header note).
 *
 * Deliberate deviation: §8.2 padding is `--space-1` × `--space-2-5` (4×10),
 * but both hosts are dense rows (UsageBar statusbar row is 16px tall; cost
 * table cells are inline next to `$0.0000`) — 4px vertical padding would
 * overflow the row. Vertical padding drops to 0 (line-height carries the
 * height); horizontal uses `--space-2` (8px).
 */

import { useTranslation } from 'react-i18next'

export default function EstimatedBadge({ show }: { show: boolean }) {
  const { t } = useTranslation()
  if (!show) return null
  return <span style={badge}>{t('costArchive.estimatedBadge')}</span>
}

const badge: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 4,
  padding: '0 8px',          // x = --space-2 (see header: dense-row deviation from §8.2's 4×10)
  fontSize: 10,              // --text-xs (pill recipe)
  fontWeight: 600,           // --weight-semibold
  letterSpacing: '0.06em',   // --tracking-widest
  lineHeight: 1.4,
  textTransform: 'uppercase',
  color: '#C8C8CC',          // --text-secondary (§8.2 neutral variant)
  background: '#1A1A1A',     // --surface-subpanel (§8.2 neutral variant)
  borderRadius: 20,          // --radius-pill
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}
