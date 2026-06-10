import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import i18next from '../../i18n'

type Lang = 'en' | 'ko'

// ── T-PATCH-083: local mirror of NotificationSettings (avoids core import in renderer) ──
interface NotificationSettingsLocal {
  enabled: boolean
  types: {
    'dispatch-done': boolean
    'escalation-raised': boolean
    'phase-gate-entry': boolean
    'po-turn-done': boolean
  }
}

const DEFAULT_NOTIF: NotificationSettingsLocal = {
  enabled: true,
  types: {
    'dispatch-done': true,
    'escalation-raised': true,
    'phase-gate-entry': true,
    'po-turn-done': true,
  },
}

export default function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language as Lang

  async function handleLangChange(lng: Lang) {
    await i18next.changeLanguage(lng)
    try {
      await (window as any).api.setUiLanguage(lng)
    } catch { /* IPC unavailable in browser dev mode */ }
  }

  return (
    <div style={wrap}>
      {/* UI Language */}
      <div style={sectionTitle}>{t('settings.language.title')}</div>
      <div style={description}>{t('settings.language.descriptionEn')}</div>
      <div style={options}>
        <RadioOption
          selected={currentLang === 'en'}
          label={t('settings.language.optionEn')}
          desc={t('settings.language.optionEnDesc')}
          onSelect={() => handleLangChange('en')}
        />
        <RadioOption
          selected={currentLang === 'ko'}
          label={t('settings.language.optionKo')}
          desc={t('settings.language.optionKoDesc')}
          onSelect={() => handleLangChange('ko')}
        />
      </div>

      <div style={divider} />

      {/* Notifications — T-PATCH-083 */}
      <NotificationsSection />

      <div style={divider} />

      {/* Claude Code connection — T-PATCH-077 */}
      <ClaudeConnection />

      <div style={noteText}>{t('settings.language.immediateNote')}</div>
    </div>
  )
}

// ── Claude Code Connection ─────────────────────────────────────────────────────

type ClaudeStatus = 'checking' | 'connected' | 'not-connected'

function ClaudeConnection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ClaudeStatus>('checking')
  const [installed, setInstalled] = useState(false)

  async function probe() {
    setStatus('checking')
    try {
      const result: { installed: boolean; authed: boolean } =
        await (window as any).api.checkClaude()
      setInstalled(result.installed)
      setStatus(result.installed && result.authed ? 'connected' : 'not-connected')
    } catch {
      // IPC unavailable in browser dev mode — degrade gracefully
      setStatus('not-connected')
    }
  }

  useEffect(() => {
    probe()
    window.addEventListener('focus', probe)
    return () => window.removeEventListener('focus', probe)
  }, [])

  async function handleConnect() {
    try {
      await (window as any).api.claudeLogin()
    } catch { /* IPC unavailable in browser dev mode */ }
  }

  const iconColor =
    status === 'connected' ? '#4ADE80' :
    status === 'checking'  ? '#606060' :
    '#EF4444'

  const StatusIcon =
    status === 'checking'  ? <Loader2 size={13} color={iconColor} className="pdt-spin" /> :
    status === 'connected' ? <CheckCircle2 size={13} color={iconColor} /> :
                             <XCircle size={13} color={iconColor} />

  return (
    <div>
      <div style={sectionTitle}>{t('settings.claudeConnection.title')}</div>

      {/* Status row */}
      <div style={claudeStatusRow}>
        {StatusIcon}
        <span style={{ ...description, color: iconColor }}>
          {status === 'checking'
            ? t('settings.claudeConnection.statusChecking')
            : status === 'connected'
            ? t('settings.claudeConnection.statusConnected')
            : t('settings.claudeConnection.statusNotConnected')}
        </span>
      </div>

      {/* Not-connected affordances */}
      {status === 'not-connected' && (
        <div style={{ marginTop: 6 }}>
          <div style={description}>
            {!installed
              ? t('settings.claudeConnection.installHint')
              : t('settings.claudeConnection.authHint')}
          </div>
          {installed && (
            <div style={{ ...description, color: '#505050', marginTop: 4 }}>
              {t('settings.claudeConnection.terminalNote')}
            </div>
          )}
          <div style={claudeActions}>
            {installed && (
              <button style={claudeConnectBtn} onClick={handleConnect}>
                {t('settings.claudeConnection.connectBtn')}
              </button>
            )}
            <button style={claudeRecheckBtn} onClick={probe}>
              {t('settings.claudeConnection.recheckBtn')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Notifications section (T-PATCH-083) ──────────────────────────────────────

// Explicit kind→locale-key map (AC-15 — never interpolate hyphenated kind into i18n path).
const NOTIFY_TYPE_ROWS: Array<{
  kind: keyof NotificationSettingsLocal['types']
  labelKey: string
  descKey: string
}> = [
  {
    kind: 'dispatch-done',
    labelKey: 'settings.notifications.dispatchDone',
    descKey: 'settings.notifications.dispatchDoneDesc',
  },
  {
    kind: 'escalation-raised',
    labelKey: 'settings.notifications.escalationRaised',
    descKey: 'settings.notifications.escalationRaisedDesc',
  },
  {
    kind: 'phase-gate-entry',
    labelKey: 'settings.notifications.phaseGateEntry',
    descKey: 'settings.notifications.phaseGateEntryDesc',
  },
  {
    kind: 'po-turn-done',
    labelKey: 'settings.notifications.poTurnDone',
    descKey: 'settings.notifications.poTurnDoneDesc',
  },
]

function NotificationsSection() {
  const { t } = useTranslation()
  const [notif, setNotif] = useState<NotificationSettingsLocal>(DEFAULT_NOTIF)

  useEffect(() => {
    async function load() {
      try {
        const n = await (window as any).api?.getNotifications?.()
        if (n) setNotif(n)
      } catch { /* IPC unavailable in browser dev mode */ }
    }
    load()
  }, [])

  async function handleMasterToggle() {
    // rerender-functional-setstate: derive next from prev to avoid stale closure.
    setNotif((prev) => {
      const next = { ...prev, enabled: !prev.enabled }
      ;(async () => {
        try {
          await (window as any).api?.setNotifications?.(next)
        } catch { /* IPC unavailable in browser dev mode */ }
      })()
      return next
    })
  }

  async function handleTypeToggle(kind: keyof NotificationSettingsLocal['types']) {
    setNotif((prev) => {
      const next: NotificationSettingsLocal = {
        ...prev,
        types: { ...prev.types, [kind]: !prev.types[kind] },
      }
      ;(async () => {
        try {
          await (window as any).api?.setNotifications?.(next)
        } catch { /* IPC unavailable in browser dev mode */ }
      })()
      return next
    })
  }

  const typesDisabled = !notif.enabled

  return (
    <div>
      <div style={sectionTitle}>{t('settings.notifications.title')}</div>
      <div style={description}>{t('settings.notifications.description')}</div>

      {/* Master toggle */}
      <ToggleRow
        label={t('settings.notifications.master')}
        checked={notif.enabled}
        onToggle={handleMasterToggle}
      />

      {/* Per-type toggles — visually disabled when master is off (AC-13). */}
      <div style={typesDisabled ? toggleTypesDisabled : toggleTypes}>
        {NOTIFY_TYPE_ROWS.map(({ kind, labelKey, descKey }) => (
          <ToggleRow
            key={kind}
            label={t(labelKey)}
            desc={t(descKey)}
            checked={notif.types[kind]}
            onToggle={() => handleTypeToggle(kind)}
          />
        ))}
      </div>
    </div>
  )
}

// ── ToggleRow (AC-16) — label/desc on left, switch on right ──────────────────

function ToggleRow({
  label,
  desc,
  checked,
  onToggle,
}: {
  label: string
  desc?: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div style={toggleRowWrap} onClick={onToggle}>
      <div style={toggleRowLeft}>
        <span style={optionLabel}>{label}</span>
        {desc != null ? <span style={description}>{desc}</span> : null}
      </div>
      <div style={{ ...toggleTrack, background: checked ? '#8B5CF6' : '#2A2A2A' }}>
        <div
          style={{
            ...toggleKnob,
            transform: checked ? 'translateX(14px)' : 'translateX(2px)',
          }}
        />
      </div>
    </div>
  )
}

function RadioOption({
  selected,
  label,
  desc,
  onSelect,
}: {
  selected: boolean
  label: string
  desc: string
  onSelect: () => void
}) {
  return (
    <div
      style={{
        ...optionCard,
        borderColor: selected ? '#8B5CF6' : '#2A2A2A',
        background: selected ? '#160F28' : '#161616',
      }}
      onClick={onSelect}
    >
      <div style={optionTop}>
        <div style={{ ...radio, background: selected ? '#8B5CF6' : 'transparent' }} />
        <span style={optionLabel}>{label}</span>
      </div>
      <div style={optionDesc}>{desc}</div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 14px',
  gap: 10,
  overflowY: 'auto',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.5,
}

const options: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const divider: React.CSSProperties = {
  height: 1,
  background: '#222',
  margin: '4px 0',
}

const optionCard: React.CSSProperties = {
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
}

const optionTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
}

const radio: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 9999,
  border: '2px solid #8B5CF6',
  flexShrink: 0,
  transition: 'background 0.15s',
}

const optionLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
}

const optionDesc: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  paddingLeft: 22,
  lineHeight: 1.4,
}

const noteText: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  lineHeight: 1.5,
  marginTop: 4,
}

const claudeStatusRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 4,
}

const claudeActions: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
}

const claudeConnectBtn: React.CSSProperties = {
  background: '#8B5CF6',
  border: 'none',
  borderRadius: 5,
  color: '#FFFFFF',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 10px',
  transition: 'opacity 0.15s',
}

const claudeRecheckBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 5,
  color: '#A0A0A0',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  padding: '4px 10px',
  transition: 'border-color 0.15s, color 0.15s',
}

// ── ToggleRow + NotificationsSection styles (T-PATCH-083) ─────────────────────

const toggleRowWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 0',
  cursor: 'pointer',
}

const toggleRowLeft: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  paddingRight: 12,
}

const toggleTrack: React.CSSProperties = {
  width: 32,
  height: 18,
  borderRadius: 9,
  position: 'relative',
  flexShrink: 0,
  transition: 'background 0.15s',
}

const toggleKnob: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: '#F0F0F0',
  position: 'absolute',
  top: 2,
  transition: 'transform 0.15s',
}

// AC-13: per-type rows container — visually disabled when master is off.
// Values are preserved (not reset); pointer-events off prevents clicks.
const toggleTypes: React.CSSProperties = {}

const toggleTypesDisabled: React.CSSProperties = {
  opacity: 0.4,
  pointerEvents: 'none',
}
