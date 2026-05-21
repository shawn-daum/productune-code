import { useTranslation } from 'react-i18next'
import { ALL_PERSONAS, PERSONA_COLORS } from './filterReducer'
import type { FilterState, FilterAction } from './types'
import { filterBar, filterGroup, personaChipBtn, dateLabel, dateInput, resetBtn } from './styles'

export interface FilterToolbarProps {
  filter: FilterState
  dispatch: React.Dispatch<FilterAction>
  defaultFrom: string
  defaultTo: string
}

export default function FilterToolbar({ filter, dispatch, defaultFrom, defaultTo }: FilterToolbarProps) {
  const { t } = useTranslation()
  return (
    <div style={filterBar}>
      {/* Persona chips */}
      <div style={filterGroup}>
        {ALL_PERSONAS.map((key) => {
          const active = filter.personas.has(key)
          const color = PERSONA_COLORS[key]
          return (
            <button
              key={key}
              style={personaChipBtn(active, color)}
              onClick={() => dispatch({ type: 'toggle-persona', key })}
              aria-pressed={active}
              title={t(`workspace.versionHistory.filter.persona.${key}`)}
            >
              {t(`workspace.versionHistory.filter.persona.${key}`)}
            </button>
          )
        })}
      </div>

      {/* Date range */}
      <div style={filterGroup}>
        <label style={dateLabel}>{t('workspace.versionHistory.filter.dateRange.start')}</label>
        <input
          type="date"
          style={dateInput}
          value={filter.dateFrom}
          onChange={(e) => dispatch({ type: 'set-date-from', value: e.target.value })}
        />
        <label style={dateLabel}>{t('workspace.versionHistory.filter.dateRange.end')}</label>
        <input
          type="date"
          style={dateInput}
          value={filter.dateTo}
          onChange={(e) => dispatch({ type: 'set-date-to', value: e.target.value })}
        />
        <button
          style={resetBtn}
          onClick={() => dispatch({ type: 'reset-dates', from: defaultFrom, to: defaultTo })}
        >
          {t('workspace.versionHistory.filter.dateRange.reset')}
        </button>
      </div>
    </div>
  )
}
