import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import WorkflowRulesPanel from './WorkflowRulesPanel'
import { useWorkspace } from '../../store/workspace'

type SettingsSubTab = 'general' | 'workflow'

interface Props {
  projectDir: string
}

export default function SettingsView({ projectDir }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const [activeTab, setActiveTab] = useState<SettingsSubTab>('general')

  const tabs: { id: SettingsSubTab; label: string }[] = [
    { id: 'general', label: t('settings.tabGeneral', { defaultValue: '일반' }) },
    { id: 'workflow', label: t('settings.tabWorkflowRules') },
  ]

  const handleTabClick = (id: SettingsSubTab) => {
    setActiveTab(id)
    if (id === 'general') {
      openTab('general-settings', 'general-settings', undefined, t('settings.tabGeneral', { defaultValue: '일반 설정' }))
    }
  }

  return (
    <div style={wrap}>
      {/* Sub-tab list */}
      <div style={tabList} role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            style={{
              ...tabBtn,
              ...(activeTab === tab.id ? tabBtnActive : {}),
            }}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={tabContent}>
        {activeTab === 'workflow' && <WorkflowRulesPanel projectDir={projectDir} />}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const tabList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  padding: '6px 8px',
  borderBottom: '1px solid #2A2A2A',
  flexShrink: 0,
}

const tabBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: '#707070',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  padding: '5px 8px',
  textAlign: 'left',
  transition: 'background 0.1s, color 0.1s',
  userSelect: 'none',
}

const tabBtnActive: React.CSSProperties = {
  background: '#1E2A3A',
  color: '#E0E0E0',
  fontWeight: 700,
}

const tabContent: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}
