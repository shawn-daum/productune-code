import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, BellRing, ExternalLink } from 'lucide-react'
import i18next from '../../i18n'
import { useWorkspace } from '../../store/workspace'

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
  const project = useWorkspace((s) => s.project)

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

      {/* App lifecycle prefs — T-PATCH-090 */}
      <AppSection />

      <div style={divider} />

      {/* Claude Code connection — T-PATCH-077 */}
      <ClaudeConnection />

      {/* PO session model/effort override (T-310) — prdt projects only; the
          section self-hides for a legacy project or when no project is open. */}
      {project?.projectDir && (
        <>
          <div style={divider} />
          <PoSessionSection projectDir={project.projectDir} />
        </>
      )}

      <div style={noteText}>{t('settings.language.immediateNote')}</div>
    </div>
  )
}

// ── PO session model/effort override (T-310) ─────────────────────────────────

// Mirrors packages/gui/electron/po-session-config.ts's allowlists — kept in
// lockstep by hand (main/renderer are separate bundles; the enum is too small
// to justify a shared runtime module across the electron/web boundary).
const PO_SESSION_MODEL_OPTIONS = ['opus', 'sonnet', 'fable'] as const
const PO_SESSION_EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

interface PoSessionConfig {
  supported: boolean
  model: string | null
  effort: string | null
}

function PoSessionSection({ projectDir }: { projectDir: string }) {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<PoSessionConfig>({ supported: false, model: null, effort: null })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // T-313: last attempted write, so the retry CTA can replay it verbatim on failure.
  const lastAttemptRef = useRef<{ model: string | null; effort: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await (window as any).api?.getPoSessionConfig?.(projectDir)
        if (!cancelled && result) setCfg(result)
      } catch { /* IPC unavailable in browser dev mode */ }
    })()
    return () => { cancelled = true }
  }, [projectDir])

  async function persist(next: { model: string | null; effort: string | null }) {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    setSaveStatus('idle')
    lastAttemptRef.current = next
    try {
      const result: { ok: boolean } = await (window as any).api.setPoSessionOverride(projectDir, next)
      if (!result.ok) throw new Error('save failed')
      setSaveStatus('success')
      successTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
    }
  }

  // T-313: replays the last attempted write — design-system §1.5.4 "실패 =
  // --health-error + 대안 CTA (재시도 / 로그 보기 / 취소)".
  function handleRetry() {
    if (lastAttemptRef.current) persist(lastAttemptRef.current)
  }

  function handleModelChange(value: string) {
    const model = value === '' ? null : value
    setCfg((prev) => ({ ...prev, model }))
    persist({ model, effort: cfg.effort })
  }

  function handleEffortChange(value: string) {
    const effort = value === '' ? null : value
    setCfg((prev) => ({ ...prev, effort }))
    persist({ model: cfg.model, effort })
  }

  // Legacy (`.productune`) project or no project open — section is a no-op.
  if (!cfg.supported) return null

  return (
    <div>
      <div style={sectionTitle}>{t('settings.poSession.title')}</div>
      <div style={description}>{t('settings.poSession.description')}</div>

      <div style={poSessionRow}>
        <div style={fieldLabelSm}>{t('settings.poSession.modelLabel')}</div>
        <select
          style={selectInput}
          value={cfg.model ?? ''}
          onChange={(e) => handleModelChange(e.target.value)}
        >
          <option value="">{t('settings.poSession.inherit')}</option>
          {PO_SESSION_MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div style={poSessionRow}>
        <div style={fieldLabelSm}>{t('settings.poSession.effortLabel')}</div>
        <select
          style={selectInput}
          value={cfg.effort ?? ''}
          onChange={(e) => handleEffortChange(e.target.value)}
        >
          <option value="">{t('settings.poSession.inherit')}</option>
          {PO_SESSION_EFFORT_OPTIONS.map((ef) => (
            <option key={ef} value={ef}>{ef}</option>
          ))}
        </select>
      </div>

      {saveStatus === 'success' && (
        <div style={{ ...notifTestResultOk, marginTop: 4 }}>{t('settings.poSession.saveSuccess')}</div>
      )}
      {saveStatus === 'error' && (
        <div style={poSessionErrorRow}>
          <span style={notifTestResultError}>{t('settings.poSession.saveError')}</span>
          <button style={poSessionRetryBtn} onClick={handleRetry}>
            {t('settings.poSession.retry')}
          </button>
        </div>
      )}
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

// ── Notifications section (T-PATCH-083, T-PATCH-089) ─────────────────────────

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

// VERIFY: on target macOS before shipping. Ventura+ (System Settings) scheme
// used as primary — falls back gracefully if the pane is absent on older OS.
// Monterey (12) and earlier: x-apple.systempreferences:com.apple.preference.notifications
const MACOS_NOTIF_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension'

function NotificationsSection() {
  const { t } = useTranslation()
  const [notif, setNotif] = useState<NotificationSettingsLocal>(DEFAULT_NOTIF)
  // T-PATCH-089: test notification state
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ shown: boolean; reason?: string } | null>(null)
  // T-PATCH-089: platform for darwin-only macOS deep link
  const [isDarwin, setIsDarwin] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const n = await (window as any).api?.getNotifications?.()
        if (n) setNotif(n)
      } catch { /* IPC unavailable in browser dev mode */ }
      try {
        const platform = await (window as any).api?.getPlatform?.()
        if (platform === 'darwin') setIsDarwin(true)
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

  // T-PATCH-089: fire a test notification bypassing the focus gate.
  async function handleTest() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const result = await (window as any).api?.fireTestNotification?.()
      setTestResult(result ?? { shown: false })
    } catch {
      // IPC unavailable in browser dev mode — degrade gracefully.
      setTestResult({ shown: false })
    } finally {
      setTestLoading(false)
    }
  }

  async function handleOpenMacosSettings() {
    try {
      await (window as any).api?.openExternal?.(MACOS_NOTIF_SETTINGS_URL)
    } catch { /* IPC unavailable in browser dev mode */ }
  }

  const typesDisabled = !notif.enabled
  // Test button disabled when master or po-turn-done type toggle is off (AC-4):
  // a test in that state would silently fail the toggle gate — don't offer it.
  const testDisabled = !notif.enabled || !notif.types['po-turn-done']

  // Derive inline result label key from IPC result (AC-5).
  function testResultKey(): string {
    if (!testResult) return ''
    if (testResult.shown) return 'settings.notifications.test.shown'
    if (testResult.reason === 'unsupported') return 'settings.notifications.test.unsupported'
    return 'settings.notifications.test.blockedToggle'
  }

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

      {/* T-PATCH-089: Test button — below per-type rows (AC-4). */}
      <div style={notifTestRow}>
        <button
          style={testDisabled ? notifTestBtnDisabled : notifTestBtn}
          onClick={testDisabled || testLoading ? undefined : handleTest}
        >
          <BellRing size={12} />
          <span>{t('settings.notifications.test.button')}</span>
        </button>

        {/* Inline result line — driven by IPC result (AC-5). */}
        {testResult !== null && (
          <span style={testResult.shown ? notifTestResultOk : notifTestResultWarn}>
            {t(testResultKey())}
          </span>
        )}
      </div>

      {/* T-PATCH-089: Persistent macOS guidance hint (AC-6). Always shown. */}
      <div style={notifMacosHint}>{t('settings.notifications.macosHint')}</div>

      {/* T-PATCH-089: Darwin-only deep link to System Settings ▸ Notifications (AC-7/8). */}
      {isDarwin && (
        <button style={notifMacosLinkBtn} onClick={handleOpenMacosSettings}>
          <ExternalLink size={11} />
          <span>{t('settings.notifications.openMacosSettings')}</span>
        </button>
      )}
    </div>
  )
}

// ── App lifecycle section (T-PATCH-090, T-PATCH-091) ─────────────────────────

const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1
const ZOOM_DEFAULT = 1.0

function AppSection() {
  const { t } = useTranslation()
  // Fallback to 'darwin' in browser dev mode — shows all toggles, handlers no-op gracefully.
  const [platform, setPlatform] = useState<string>('darwin')
  const [closeToTray, setCloseToTrayState] = useState(false)
  const [launchAtLogin, setLaunchAtLoginState] = useState(false)

  // T-PATCH-091 R3: zoom factor local state; seeded from IPC on mount.
  const [zoomFactor, setZoomFactorState] = useState<number>(ZOOM_DEFAULT)

  // T-PATCH-091 R4: statusBarVisible is owned by the workspace store;
  // changes propagate immediately to WorkspaceShell via zustand subscription.
  const statusBarVisible = useWorkspace((s) => s.statusBarVisible)

  useEffect(() => {
    async function load() {
      try {
        const [plat, ctt, lal, zf] = await Promise.all([
          (window as any).api?.getPlatform?.(),
          (window as any).api?.getCloseToTray?.(),
          (window as any).api?.getLaunchAtLogin?.(),
          // T-PATCH-091 R3: load persisted zoom on mount (AC-9).
          (window as any).api?.getZoomFactor?.(),
        ])
        if (plat) setPlatform(plat)
        if (typeof ctt === 'boolean') setCloseToTrayState(ctt)
        if (typeof lal === 'boolean') setLaunchAtLoginState(lal)
        if (typeof zf === 'number') setZoomFactorState(zf)
      } catch { /* IPC unavailable in browser dev mode */ }
    }
    load()
  }, [])

  // T-083 functional-setState pattern: derive next from prev, fire IPC in async IIFE.
  function handleCloseToTray() {
    setCloseToTrayState((prev) => {
      const next = !prev
      ;(async () => {
        try {
          await (window as any).api?.setCloseToTray?.(next)
        } catch { /* IPC unavailable in browser dev mode */ }
      })()
      return next
    })
  }

  function handleLaunchAtLogin() {
    setLaunchAtLoginState((prev) => {
      const next = !prev
      ;(async () => {
        try {
          await (window as any).api?.setLaunchAtLogin?.(next)
        } catch { /* IPC unavailable in browser dev mode */ }
      })()
      return next
    })
  }

  // T-PATCH-091 R3: step zoom factor; clamp to [0.8, 1.5], no debounce.
  // Main-process handler calls applyZoomToAllWindows so effect is immediate.
  function handleZoomStep(delta: number) {
    setZoomFactorState((prev) => {
      const raw = parseFloat((prev + delta).toFixed(2))
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw))
      ;(async () => {
        try {
          await (window as any).api?.setZoomFactor?.(next)
        } catch { /* IPC unavailable in browser dev mode */ }
      })()
      return next
    })
  }

  // T-PATCH-091 R4: status bar toggle — update zustand store (immediate WorkspaceShell
  // effect) + persist via IPC. No local mirror needed; store IS the source of truth.
  function handleStatusBarToggle() {
    const next = !statusBarVisible
    useWorkspace.getState().setStatusBarVisible(next)
    ;(async () => {
      try {
        await (window as any).api?.setStatusBarVisible?.(next)
      } catch { /* IPC unavailable in browser dev mode */ }
    })()
  }

  const zoomAtMin = zoomFactor <= ZOOM_MIN
  const zoomAtMax = zoomFactor >= ZOOM_MAX

  return (
    <div>
      <div style={sectionTitle}>{t('settings.app.title')}</div>

      {/* Close-to-tray: mac-only first cut (win.hide + activate). */}
      {platform === 'darwin' && (
        <ToggleRow
          label={t('settings.app.closeToTray')}
          desc={t('settings.app.closeToTrayDesc')}
          checked={closeToTray}
          onToggle={handleCloseToTray}
        />
      )}

      {/* Launch at login: shown on all platforms. */}
      <ToggleRow
        label={t('settings.app.launchAtLogin')}
        desc={t('settings.app.launchAtLoginDesc')}
        checked={launchAtLogin}
        onToggle={handleLaunchAtLogin}
      />

      {/* T-PATCH-091 R3: Zoom stepper (AC-8). Custom row — NOT a ToggleRow. */}
      <div style={zoomRowWrap}>
        <div style={toggleRowLeft}>
          <span style={optionLabel}>{t('settings.app.zoom')}</span>
          <span style={description}>{t('settings.app.zoomDesc')}</span>
        </div>
        <div style={zoomStepperWrap}>
          <button
            style={zoomAtMin ? zoomBtnDisabled : zoomBtn}
            onClick={zoomAtMin ? undefined : () => handleZoomStep(-ZOOM_STEP)}
            aria-label="Decrease zoom"
          >
            −
          </button>
          <span style={zoomDisplay}>{Math.round(zoomFactor * 100)}%</span>
          <button
            style={zoomAtMax ? zoomBtnDisabled : zoomBtn}
            onClick={zoomAtMax ? undefined : () => handleZoomStep(ZOOM_STEP)}
            aria-label="Increase zoom"
          >
            +
          </button>
        </div>
      </div>

      {/* T-PATCH-091 R4: Status bar visibility toggle (AC-11). */}
      <ToggleRow
        label={t('settings.app.statusBar')}
        desc={t('settings.app.statusBarDesc')}
        checked={statusBarVisible}
        onToggle={handleStatusBarToggle}
      />
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
  lineHeight: 1.6, // T-PATCH-214 #3: --leading-relaxed — multi-line helper microcopy was cramped
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

// ── ToggleRow + NotificationsSection styles (T-PATCH-083, T-PATCH-089) ────────

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

// T-PATCH-089: Test button row + result + macOS hint styles.
const notifTestRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 6,
  flexWrap: 'wrap',
}

const notifTestBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: '1px solid #3A3A3A',
  borderRadius: 5,
  color: '#C0C0C0',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  padding: '4px 9px',
  transition: 'border-color 0.15s, color 0.15s',
}

const notifTestBtn: React.CSSProperties = {
  ...notifTestBtnBase,
}

// Reuse opacity:0.4 + pointerEvents:none pattern from AC-13 of T-PATCH-083.
const notifTestBtnDisabled: React.CSSProperties = {
  ...notifTestBtnBase,
  opacity: 0.4,
  pointerEvents: 'none',
}

const notifTestResultOk: React.CSSProperties = {
  fontSize: 10,
  color: '#6EE7B7',
  lineHeight: 1.4,
}

const notifTestResultWarn: React.CSSProperties = {
  fontSize: 10,
  color: '#FCD34D',
  lineHeight: 1.4,
}

// T-313: PoSessionSection save failure — design-system §2.8 --health-error
// (`#EF4444`), distinct from the amber `notifTestResultWarn` above (that one
// is a soft "blocked toggle" notice, not a write failure).
const notifTestResultError: React.CSSProperties = {
  fontSize: 10,
  color: '#EF4444',
  lineHeight: 1.4,
}

const poSessionErrorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 4,
}

// T-313: retry CTA (design-system §1.5.4 실패 대안 CTA) — mirrors
// notifTestBtnBase's small bordered-button shape, recolored to --health-error.
const poSessionRetryBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #EF4444',
  borderRadius: 5,
  color: '#EF4444',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 8px',
  fontFamily: 'inherit',
}

const notifMacosHint: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  lineHeight: 1.6, // T-PATCH-214 #3: --leading-relaxed — multi-line macOS guidance microcopy
  marginTop: 6,
}

const notifMacosLinkBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: 'none',
  color: '#8B5CF6',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 0',
  marginTop: 2,
}

// ── T-PATCH-091 R3: Zoom stepper styles ─────────────────────────────────────

const zoomRowWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 0',
}

const zoomStepperWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const zoomBtnBase: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#D0D0D0',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 400,
  flexShrink: 0,
  transition: 'border-color 0.15s, color 0.15s',
}

const zoomBtn: React.CSSProperties = { ...zoomBtnBase }

const zoomBtnDisabled: React.CSSProperties = {
  ...zoomBtnBase,
  opacity: 0.3,
  pointerEvents: 'none',
}

const zoomDisplay: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#E0E0E0',
  minWidth: 38,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}

// ── PO session model/effort override styles (T-310) ──────────────────────────

const poSessionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 0',
}

const fieldLabelSm: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#D0D0D0',
}

const selectInput: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 5,
  color: '#E0E0E0',
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '4px 8px',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 140,
}
