/**
 * SettingsView — Settings sidebar (T-P4-099).
 *
 * Both sub-tabs (일반 / 작업 흐름 규칙) now open their content in the main pane
 * via openTab — mirroring the General tab pattern (T-P4-096).
 * Sidebar = sub-tab nav list only. No inline content rendered here.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../store/workspace'

// T-P4-022 §16.3: 'integrations' placeholder reserved for external-connections sub-tab
type SettingsSubTab = 'general' | 'workflow' | 'mcp' | 'hooks' | 'cost'

export default function SettingsView() {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const [activeTab, setActiveTab] = useState<SettingsSubTab | null>(null)

  const tabs: { id: SettingsSubTab; label: string }[] = [
    { id: 'general',  label: t('settings.tabGeneral') },
    { id: 'workflow', label: t('settings.tabWorkflowRules') },
    { id: 'mcp',      label: t('settings.tabMcp') },
    { id: 'hooks',    label: t('settings.tabHooks') },
    { id: 'cost',     label: t('settings.tabCost') },
  ]

  const handleTabClick = (id: SettingsSubTab) => {
    setActiveTab(id)
    if (id === 'general') {
      openTab('general-settings', 'general-settings', undefined, t('settings.generalTabTitle'))
    } else if (id === 'workflow') {
      openTab('workflow-settings', 'workflow-settings', undefined, t('settings.tabWorkflowRules'))
    } else if (id === 'mcp') {
      openTab('mcp-servers', 'mcp-servers', undefined, t('settings.tabMcp'))
    } else if (id === 'hooks') {
      openTab('hooks', 'hooks', undefined, t('settings.tabHooks'))
    } else if (id === 'cost') {
      openTab('cost-archive', 'cost-archive', undefined, t('settings.tabCost'))
    }
  }

  return (
    <div style={wrap}>
      {/* Sub-tab list — nav only, content is in main pane */}
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
