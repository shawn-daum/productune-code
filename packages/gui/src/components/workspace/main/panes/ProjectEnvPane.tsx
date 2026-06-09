/**
 * ProjectEnvPane — T-PATCH-076 r2
 *
 * Main-pane tab for `project-env:<filename>`.
 * Full key/value editor for ONE .env* file.
 *   - Masked-by-default values (type="password"); per-row click-to-reveal
 *   - Edit / add / remove keys
 *   - Save writes back at mode 0600; comment + blank-line round-trip preserved
 *   - Duplicate / empty-key inline validation
 *
 * SECURITY contract:
 *   - Values are masked by default (type="password" → browser renders ••••••).
 *   - Revealed state is transient in-memory only (Set<index>); cleared on
 *     filename/projectDir change (via key-remount).
 *   - Values are NEVER logged to console.
 *   - Writes go through projectEnvWrite IPC which uses mode 0o600.
 *
 * Props: { filename: string } — the .env* filename to edit.
 * The component looks up projectDir from the workspace store.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Eye,
  EyeOff,
  Plus,
  Save,
  X,
  KeyRound,
  Loader2,
} from 'lucide-react'
import { useWorkspace } from '../../../../store/workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvEntry {
  key: string
  value: string
}

interface FileGroup {
  filename: string
  entries: EnvEntry[]
  raw: string
}

// ── EnvRow ─────────────────────────────────────────────────────────────────────

interface RowProps {
  entry: EnvEntry
  index: number
  revealed: boolean
  hasError: boolean
  errorMsg?: string
  onToggleReveal: (i: number) => void
  onKeyChange: (i: number, key: string) => void
  onValueChange: (i: number, value: string) => void
  onRemove: (i: number) => void
}

// Module-level component (rerender-no-inline-components)
function EnvRow({
  entry, index, revealed, hasError, errorMsg,
  onToggleReveal, onKeyChange, onValueChange, onRemove,
}: RowProps) {
  const { t } = useTranslation()
  const [keyFocus, setKeyFocus] = useState(false)
  const [valFocus, setValFocus] = useState(false)

  return (
    <div>
      <div style={rowWrap}>
        {/* Key input */}
        <input
          type="text"
          value={entry.key}
          onChange={(e) => onKeyChange(index, e.target.value)}
          placeholder={t('workspace.projectEnv.keyPlaceholder')}
          aria-label={t('workspace.projectEnv.keyLabel')}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          style={{
            ...keyInput,
            borderColor: hasError ? '#EF4444' : (keyFocus ? '#3A3A3A' : '#222'),
          }}
          onFocus={() => setKeyFocus(true)}
          onBlur={() => setKeyFocus(false)}
        />

        {/* Value input — password when masked, text when revealed */}
        <input
          type={revealed ? 'text' : 'password'}
          value={entry.value}
          onChange={(e) => onValueChange(index, e.target.value)}
          placeholder={t('workspace.projectEnv.valuePlaceholder')}
          aria-label={t('workspace.projectEnv.valueLabel')}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="new-password"
          style={{
            ...valInput,
            borderColor: valFocus ? '#3A3A3A' : '#222',
          }}
          onFocus={() => setValFocus(true)}
          onBlur={() => setValFocus(false)}
        />

        {/* Reveal / mask toggle */}
        <button
          type="button"
          style={iconBtn}
          title={revealed ? t('workspace.projectEnv.maskValue') : t('workspace.projectEnv.revealValue')}
          aria-label={revealed ? t('workspace.projectEnv.maskValue') : t('workspace.projectEnv.revealValue')}
          onClick={() => onToggleReveal(index)}
        >
          {revealed ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
        </button>

        {/* Remove row */}
        <button
          type="button"
          style={iconBtn}
          title={t('workspace.projectEnv.removeKey')}
          aria-label={t('workspace.projectEnv.removeKey')}
          onClick={() => onRemove(index)}
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Inline validation error */}
      {errorMsg ? (
        <div style={rowError}>{errorMsg}</div>
      ) : null}
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────────

interface EditorProps {
  filename: string
  projectDir: string
  initialEntries: EnvEntry[]
  initialRaw: string
  /** Called on successful save so the parent can reload. */
  onSaved: () => void
}

/**
 * Self-contained editor for a single .env* file.
 * Manages its own dirty / revealed / validation state.
 * Key the component on `filename:loadKey` so the parent forces remount on reload.
 */
function EnvEditor({ filename, projectDir, initialEntries, initialRaw, onSaved }: EditorProps) {
  const { t } = useTranslation()

  const [entries, setEntries] = useState<EnvEntry[]>(initialEntries)
  // Transient in-memory set — never persisted, cleared on remount
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Map<number, string>>(new Map())
  const [saving, setSaving] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleReveal = useCallback((i: number) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const handleKeyChange = useCallback((i: number, key: string) => {
    setEntries((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], key }
      return next
    })
    setDirty(true)
    setValidationErrors((prev) => {
      const next = new Map(prev)
      next.delete(i)
      return next
    })
  }, [])

  const handleValueChange = useCallback((i: number, value: string) => {
    setEntries((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], value }
      return next
    })
    setDirty(true)
  }, [])

  const handleRemove = useCallback((i: number) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
    setRevealed((prev) => {
      const next = new Set<number>()
      for (const idx of prev) {
        if (idx < i) next.add(idx)
        else if (idx > i) next.add(idx - 1)
      }
      return next
    })
    setValidationErrors((prev) => {
      const next = new Map<number, string>()
      for (const [k, v] of prev) {
        if (k < i) next.set(k, v)
        else if (k > i) next.set(k - 1, v)
      }
      return next
    })
    setDirty(true)
  }, [])

  const handleAddRow = useCallback(() => {
    setEntries((prev) => [...prev, { key: '', value: '' }])
    setDirty(true)
  }, [])

  function validate(): boolean {
    const errs = new Map<number, string>()
    const seen = new Set<string>()
    for (let i = 0; i < entries.length; i++) {
      const k = entries[i].key.trim()
      if (!k) {
        errs.set(i, t('workspace.projectEnv.errorEmptyKey'))
        continue
      }
      if (seen.has(k)) {
        errs.set(i, t('workspace.projectEnv.errorDuplicateKey'))
      } else {
        seen.add(k)
      }
    }
    setValidationErrors(errs)
    return errs.size === 0
  }

  async function handleSave() {
    if (!validate()) return
    setError(null)
    setSaving(true)
    try {
      const result: { ok: boolean; error?: string } =
        await (window as any).api.projectEnvWrite(
          projectDir,
          filename,
          entries.map((e) => ({ key: e.key.trim(), value: e.value })),
          initialRaw,
        )
      if (!result.ok) {
        setError(result.error ?? t('workspace.projectEnv.writeError'))
        setSaving(false)
        return
      }
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? t('workspace.projectEnv.writeError'))
      setSaving(false)
    }
  }

  // ── Render-time duplicate / empty key detection ───────────────────────────

  const trimmedKeys = entries.map((e) => e.key.trim())
  const seenKeys = new Set<string>()
  const dupSet = new Set<number>()
  const emptyKeySet = new Set<number>()
  for (let i = 0; i < trimmedKeys.length; i++) {
    if (!trimmedKeys[i]) {
      emptyKeySet.add(i)
      continue
    }
    if (seenKeys.has(trimmedKeys[i])) {
      dupSet.add(i)
    } else {
      seenKeys.add(trimmedKeys[i])
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={editorWrap}>
      {/* Structural write error (no values exposed) */}
      {error ? (
        <div style={errorBannerInline}>
          <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Entry rows */}
      {entries.length === 0 ? (
        <div style={emptyEntries}>{t('workspace.projectEnv.noKeys')}</div>
      ) : (
        entries.map((entry, i) => (
          <EnvRow
            key={i}
            entry={entry}
            index={i}
            revealed={revealed.has(i)}
            hasError={dupSet.has(i) || emptyKeySet.has(i) || validationErrors.has(i)}
            errorMsg={validationErrors.get(i)}
            onToggleReveal={toggleReveal}
            onKeyChange={handleKeyChange}
            onValueChange={handleValueChange}
            onRemove={handleRemove}
          />
        ))
      )}

      {/* Action bar */}
      <div style={actionRow}>
        <button type="button" style={addBtn} onClick={handleAddRow} disabled={saving}>
          <Plus size={12} strokeWidth={2} />
          <span>{t('workspace.projectEnv.addKey')}</span>
        </button>
        {dirty ? (
          <button type="button" style={saveBtn} onClick={handleSave} disabled={saving}>
            <Save size={12} strokeWidth={2} />
            <span>{t('workspace.projectEnv.save')}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── ProjectEnvPane ─────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

export default function ProjectEnvPane({ props: tabProps }: Props) {
  const { t } = useTranslation()
  const filename = typeof tabProps?.filename === 'string' ? tabProps.filename : ''
  const project = useWorkspace((s) => s.project)
  const projectDir = project?.projectDir ?? ''

  const [group, setGroup] = useState<FileGroup | null>(null)
  // Bumped on each successful save → remounts EnvEditor (clears transient state)
  const [loadKey, setLoadKey] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>('idle')

  const prevDirRef = useRef<string>('')

  const load = useCallback(async () => {
    if (!projectDir || !filename) {
      setLoadState('error')
      return
    }
    setLoadState('loading')
    try {
      const result: { files: FileGroup[] } =
        await (window as any).api.projectEnvRead(projectDir)
      const found = (result.files ?? []).find((f) => f.filename === filename) ?? null
      setGroup(found)
      setLoadState('done')
    } catch {
      setLoadState('error')
    }
  }, [projectDir, filename])

  useEffect(() => {
    if (!projectDir || !filename) return
    // Reset on projectDir switch
    if (projectDir !== prevDirRef.current) {
      setGroup(null)
      prevDirRef.current = projectDir
    }
    load()
  }, [projectDir, filename, load])

  const handleSaved = useCallback(() => {
    load().then(() => setLoadKey((k) => k + 1))
  }, [load])

  return (
    <div style={wrap}>
      {/* Header bar — mirrors VersionPrdPane */}
      <div style={headerBar}>
        <div style={breadcrumb}>
          <KeyRound size={13} style={{ color: '#707070', flexShrink: 0 }} />
          <span style={crumbText}>{filename || '.env'}</span>
        </div>
        <div style={secBadge}>
          <span>{t('workspace.projectEnv.securityBadge')}</span>
        </div>
      </div>

      {/* Body */}
      <div style={scrollBody}>
        {loadState === 'loading' ? (
          <div style={centerState}>
            <Loader2 size={18} style={{ color: '#505050' }} className="pdt-spin" />
          </div>
        ) : loadState === 'error' ? (
          <div style={errorBanner}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <span style={errorText}>{t('workspace.projectEnv.readError')}</span>
            <button style={retryBtn} onClick={load}>{t('common.retry')}</button>
          </div>
        ) : loadState === 'done' && group === null ? (
          <div style={notFoundBanner}>{t('workspace.projectEnv.fileNotFound')}</div>
        ) : loadState === 'done' && group !== null ? (
          <EnvEditor
            key={`${filename}:${projectDir}:${loadKey}`}
            filename={filename}
            projectDir={projectDir}
            initialEntries={group.entries}
            initialRaw={group.raw}
            onSaved={handleSaved}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
}

const headerBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 16px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
  minHeight: 32,
}

const breadcrumb: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  overflow: 'hidden',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 11,
}

const crumbText: React.CSSProperties = {
  color: '#A0A0A0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const secBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const scrollBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 24px 24px',
}

const centerState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 40,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#141414',
  borderLeft: '3px solid #EF4444',
  borderRadius: 4,
  padding: '10px 14px',
  maxWidth: 520,
}

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: '#C8C8CC',
  flex: 1,
}

const retryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
}

const notFoundBanner: React.CSSProperties = {
  padding: '10px 14px',
  background: '#141414',
  border: '1px solid #1F1F1F',
  borderLeft: '3px solid #505050',
  borderRadius: 4,
  fontSize: 12,
  color: '#707070',
  maxWidth: 520,
}

// ── Editor styles ──────────────────────────────────────────────────────────────

const editorWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  maxWidth: 680,
}

const errorBannerInline: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  padding: '7px 0 10px',
  fontSize: 11,
  color: '#EF4444',
  lineHeight: 1.4,
}

const emptyEntries: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  fontStyle: 'italic',
  padding: '4px 0 12px',
}

// ── Row styles ────────────────────────────────────────────────────────────────

const rowWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  paddingBottom: 4,
}

const keyInput: React.CSSProperties = {
  flex: '0 0 240px',
  minWidth: 0,
  background: '#1A1A1A',
  border: '1px solid #222',
  borderRadius: 3,
  color: '#A0A0A0',
  fontSize: 11,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  padding: '4px 6px',
  outline: 'none',
  transition: 'border-color 0.1s',
}

const valInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: '#1A1A1A',
  border: '1px solid #222',
  borderRadius: 3,
  color: '#707070',
  fontSize: 11,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  padding: '4px 6px',
  outline: 'none',
  transition: 'border-color 0.1s',
}

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'none',
  border: 'none',
  borderRadius: 3,
  color: '#505050',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}

const rowError: React.CSSProperties = {
  fontSize: 10,
  color: '#EF4444',
  paddingBottom: 4,
  paddingLeft: 248,
  lineHeight: 1.3,
}

const actionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingTop: 8,
}

const addBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  color: '#505050',
  fontSize: 11,
  cursor: 'pointer',
  padding: '4px 8px',
  fontFamily: 'inherit',
}

const saveBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#1A1030',
  border: '1px solid #8B5CF650',
  borderRadius: 3,
  color: '#8B5CF6',
  fontSize: 11,
  cursor: 'pointer',
  padding: '4px 8px',
  marginLeft: 'auto',
  fontFamily: 'inherit',
}
