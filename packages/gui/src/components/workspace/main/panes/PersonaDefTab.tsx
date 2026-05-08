import { useTranslation } from 'react-i18next'
import { PERSONA_COLORS } from '../../../../store/personaPresence'
import type { PersonaId } from '../../../../store/personaPresence'

// ── Static persona metadata (T-P4-044 dispatch target, Phase 4 preview-only) ─

type PersonaKey = PersonaId

interface PersonaMeta {
  id: string
  key: PersonaKey
  initial: string
  nameKey: string
  roleKey: string
  modelSummary: string
  permissionMode: string
  mcpServers?: string[]
}

const PERSONA_META: Record<string, PersonaMeta> = {
  'pdt-po': {
    id: 'pdt-po', key: 'po', initial: 'P',
    nameKey: 'workspace.team.persona.po.name',
    roleKey: 'workspace.team.persona.po.role',
    modelSummary: 'sonnet / medium',
    permissionMode: 'acceptEdits',
    mcpServers: [],
  },
  'pdt-designer': {
    id: 'pdt-designer', key: 'designer', initial: 'D',
    nameKey: 'workspace.team.persona.designer.name',
    roleKey: 'workspace.team.persona.designer.role',
    modelSummary: 'opus / xhigh',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-developer': {
    id: 'pdt-developer', key: 'dev', initial: 'D',
    nameKey: 'workspace.team.persona.developer.name',
    roleKey: 'workspace.team.persona.developer.role',
    modelSummary: 'sonnet / high',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-qa': {
    id: 'pdt-qa', key: 'qa', initial: 'Q',
    nameKey: 'workspace.team.persona.qa.name',
    roleKey: 'workspace.team.persona.qa.role',
    modelSummary: 'haiku / low',
    permissionMode: 'bypassPermissions',
    mcpServers: [],
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function PersonaDefTab({ props }: Props) {
  const { t } = useTranslation()
  const personaId = (props?.persona as string) ?? ''
  const sourcePath = (props?.sourcePath as string) ?? `~/.claude/agents/${personaId}.md`
  const meta = PERSONA_META[personaId] ?? null

  if (!meta) {
    return (
      <div style={errorWrap}>
        <div style={errorText}>Unknown persona: {personaId}</div>
      </div>
    )
  }

  const color = PERSONA_COLORS[meta.key]

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={header}>
        <div style={{ ...avatar, background: color }}>
          {meta.initial}
        </div>
        <div style={headerInfo}>
          <div style={personaName}>{t(meta.nameKey)}</div>
          <div style={personaRole}>{t(meta.roleKey)}</div>
        </div>
        <div style={headerRight}>
          <div style={modelBadge}>{meta.modelSummary}</div>
        </div>
      </div>

      {/* Metadata */}
      <div style={metaSection}>
        <div style={metaRow}>
          <span style={metaLabel}>id</span>
          <span style={metaValue}>{meta.id}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>permissionMode</span>
          <span style={metaValue}>{meta.permissionMode}</span>
        </div>
        {meta.mcpServers && meta.mcpServers.length > 0 && (
          <div style={metaRow}>
            <span style={metaLabel}>mcpServers</span>
            <span style={metaValue}>{meta.mcpServers.join(', ')}</span>
          </div>
        )}
        <div style={metaRow}>
          <span style={metaLabel}>source</span>
          <span style={{ ...metaValue, fontFamily: 'monospace', fontSize: 10 }}>{sourcePath}</span>
        </div>
      </div>

      {/* Preview note */}
      <div style={previewNote}>
        {t('workspace.team.personaDef.previewNote')}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: '#0F0F0F',
  padding: 20,
  overflowY: 'auto',
}

const errorWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: '#E04040',
  fontFamily: 'monospace',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 20,
  paddingBottom: 16,
  borderBottom: '1px solid #1E1E1E',
}

const avatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
}

const headerInfo: React.CSSProperties = {
  flex: 1,
}

const personaName: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const personaRole: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  marginTop: 2,
}

const headerRight: React.CSSProperties = {
  flexShrink: 0,
}

const modelBadge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#A0A0A0',
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '2px 6px',
}

const metaSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 20,
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
}

const metaLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#505050',
  width: 120,
  flexShrink: 0,
}

const metaValue: React.CSSProperties = {
  fontSize: 11,
  color: '#C0C0C0',
}

const previewNote: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  fontStyle: 'italic',
  borderTop: '1px dashed #1E1E1E',
  paddingTop: 12,
}
