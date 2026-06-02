import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitRules } from '@productune/core'

interface Props {
  projectDir: string
}

type SaveStatus = 'idle' | 'success' | 'error'

export default function WorkflowRulesPanel({ projectDir }: Props) {
  const { t } = useTranslation()

  const [rules, setRules] = useState<GitRules>({
    useDevBranch: false,
    useStagingEnv: false,
    featureBranchPrefix: 'feature',
    fixBranchPrefix: 'fix',
    protectedBranches: ['main'],
    autosaveTriggers: {
      onStatusChange: true,
      onQaStatusChange: true,
      onQaLoopsChange: true,
      onManual: true,
    },
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string>('')
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load rules on mount
  useEffect(() => {
    ;(window as any).api
      .loadRules(projectDir)
      .then((r: GitRules) => setRules(r))
      .catch(() => { /* keep defaults */ })
  }, [projectDir])

  // Derived: protected environment list
  const protectedEnvs = rules.useDevBranch ? ['main', 'dev'] : ['main']

  const persistRules = useCallback(async (next: GitRules) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    setSaveStatus('idle')
    setSaveError('')

    try {
      const result: { ok: boolean; error?: string } = await (window as any).api.saveRules(projectDir, next)
      if (!result.ok) throw new Error(result.error ?? 'unknown error')
      setSaveStatus('success')
      successTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
    } catch (e: any) {
      setSaveError(e?.message ?? t('settings.workflowRules.saveError'))
      setSaveStatus('error')
    }
  }, [projectDir, t])

  const handleToggle = useCallback((key: 'useDevBranch' | 'useStagingEnv') => {
    const next = { ...rules, [key]: !rules[key] }
    setRules(next)
    persistRules(next)
  }, [rules, persistRules])

  const handleAutosaveToggle = useCallback((key: keyof GitRules['autosaveTriggers']) => {
    const triggers = rules.autosaveTriggers
    const next: GitRules = {
      ...rules,
      autosaveTriggers: { ...triggers, [key]: !triggers[key] },
    }
    setRules(next)
    persistRules(next)
  }, [rules, persistRules])

  const handlePrefixChange = useCallback((key: 'featureBranchPrefix' | 'fixBranchPrefix', value: string) => {
    setRules(prev => ({ ...prev, [key]: value }))
  }, [])

  const handlePrefixBlur = useCallback((key: 'featureBranchPrefix' | 'fixBranchPrefix') => {
    const trimmed = rules[key].trim() || (key === 'featureBranchPrefix' ? 'feature' : 'fix')
    const next = { ...rules, [key]: trimmed }
    if (next[key] !== rules[key] || true) {
      setRules(next)
      persistRules(next)
    }
  }, [rules, persistRules])

  const handleRetry = useCallback(() => {
    setSaveStatus('idle')
    setSaveError('')
    persistRules(rules)
  }, [rules, persistRules])

  return (
    <div style={wrap}>
      {/* Section header */}
      <div style={sectionTitle}>{t('settings.workflowRules.sectionTitle')}</div>

      {/* useDevBranch toggle */}
      <ToggleRow
        label={t('settings.workflowRules.useDevBranch')}
        value={rules.useDevBranch}
        onToggle={() => handleToggle('useDevBranch')}
      />

      {/* useStagingEnv toggle */}
      <ToggleRow
        label={t('settings.workflowRules.useStagingEnv')}
        value={rules.useStagingEnv}
        onToggle={() => handleToggle('useStagingEnv')}
      />

      <div style={divider} />

      {/* featureBranchPrefix text */}
      <TextRow
        label={t('settings.workflowRules.featureBranchPrefix')}
        value={rules.featureBranchPrefix}
        placeholder={t('settings.workflowRules.prefixPlaceholder')}
        onChange={v => handlePrefixChange('featureBranchPrefix', v)}
        onBlur={() => handlePrefixBlur('featureBranchPrefix')}
      />

      {/* fixBranchPrefix text */}
      <TextRow
        label={t('settings.workflowRules.fixBranchPrefix')}
        value={rules.fixBranchPrefix}
        placeholder={t('settings.workflowRules.prefixPlaceholder')}
        onChange={v => handlePrefixChange('fixBranchPrefix', v)}
        onBlur={() => handlePrefixBlur('fixBranchPrefix')}
      />

      <div style={divider} />

      {/* protectedBranches — display only */}
      <div style={fieldRow}>
        <div style={fieldLabel}>{t('settings.workflowRules.protectedEnvLabel')}</div>
        <div style={chipsRow}>
          {protectedEnvs.map(env => (
            <span key={env} style={envChip}>{env}</span>
          ))}
        </div>
      </div>

      <div style={divider} />

      {/* autosaveTriggers — per-trigger toggles (v0.5 B1 / T-017) */}
      <div style={fieldLabel}>{t('settings.workflowRules.autosaveTriggersLabel')}</div>
      <ToggleRow
        label={t('settings.workflowRules.autosaveOnStatusChange')}
        value={rules.autosaveTriggers.onStatusChange}
        onToggle={() => handleAutosaveToggle('onStatusChange')}
      />
      <ToggleRow
        label={t('settings.workflowRules.autosaveOnQaStatusChange')}
        value={rules.autosaveTriggers.onQaStatusChange}
        onToggle={() => handleAutosaveToggle('onQaStatusChange')}
      />
      <ToggleRow
        label={t('settings.workflowRules.autosaveOnQaLoopsChange')}
        value={rules.autosaveTriggers.onQaLoopsChange}
        onToggle={() => handleAutosaveToggle('onQaLoopsChange')}
      />
      <ToggleRow
        label={t('settings.workflowRules.autosaveOnManual')}
        value={rules.autosaveTriggers.onManual}
        onToggle={() => handleAutosaveToggle('onManual')}
      />

      {/* Save status feedback */}
      {saveStatus === 'success' && (
        <div style={successBanner}>{t('settings.workflowRules.saveSuccess')}</div>
      )}
      {saveStatus === 'error' && (
        <div style={errorBanner}>
          <span style={errorText}>{saveError || t('settings.workflowRules.saveError')}</span>
          <button style={retryBtn} onClick={handleRetry}>
            {t('settings.workflowRules.retry')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <div style={toggleRow} onClick={onToggle} role="button" tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      aria-pressed={value}
    >
      <span style={fieldLabel}>{label}</span>
      <div style={{ ...toggleTrack, background: value ? '#8B5CF6' : '#2A2A2A' }}>
        <div style={{ ...toggleThumb, transform: value ? 'translateX(14px)' : 'translateX(0)' }} />
      </div>
    </div>
  )
}

function TextRow({ label, value, placeholder, onChange, onBlur }: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  onBlur: () => void
}) {
  return (
    <div style={fieldRow}>
      <div style={fieldLabel}>{label}</div>
      <input
        style={textInput}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        spellCheck={false}
      />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  marginBottom: 4,
}

const divider: React.CSSProperties = {
  borderTop: '1px solid #222',
  margin: '2px 0',
}

const toggleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  cursor: 'pointer',
  padding: '4px 0',
  userSelect: 'none',
}

const toggleTrack: React.CSSProperties = {
  position: 'relative',
  width: 30,
  height: 16,
  borderRadius: 9999,
  flexShrink: 0,
  transition: 'background 0.15s',
}

const toggleThumb: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  left: 2,
  width: 12,
  height: 12,
  borderRadius: 9999,
  background: '#FFFFFF',
  transition: 'transform 0.15s',
}

const fieldRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  lineHeight: 1.4,
}

const textInput: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '4px 8px',
  outline: 'none',
}

const chipsRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
}

const envChip: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  background: '#1F3A5F',
  color: '#7BB3E0',
  borderRadius: 4,
  padding: '2px 6px',
}

const lockedRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  opacity: 0.45,
  userSelect: 'none',
}

const phase5Chip: React.CSSProperties = {
  fontSize: 10,
  color: '#808080',
  background: '#222',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '2px 6px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const successBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#34D399',
  background: '#0D2A1E',
  border: '1px solid #164F35',
  borderRadius: 4,
  padding: '6px 10px',
  marginTop: 4,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: '#F87171',
  background: '#2A1010',
  border: '1px solid #4A1A1A',
  borderRadius: 4,
  padding: '6px 10px',
  marginTop: 4,
}

const errorText: React.CSSProperties = {
  flex: 1,
}

const retryBtn: React.CSSProperties = {
  fontSize: 11,
  color: '#F87171',
  background: 'transparent',
  border: '1px solid #F87171',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  flexShrink: 0,
}
