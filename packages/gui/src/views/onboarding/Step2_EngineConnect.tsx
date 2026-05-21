import { useTranslation } from 'react-i18next'
import type { EngineStatus } from './types'
import EngineStatusRow from './EngineStatusRow'
import { body, footer, stepLabel, stepIntro, hint, btnSecondary, btnSkip, btnPrimary } from './styles'

interface Step2Props {
  needsClaude: boolean
  needsCodex: boolean
  claudeStatus: EngineStatus | null
  codexStatus: EngineStatus | null
  checkingEngine: boolean
  engineFullyReady: boolean
  onPrev: () => void
  onNext: () => void
  onCheckEngine: () => void
  onClaudeLogin: () => void
  onCodexLogin: () => void
}

export default function Step2_EngineConnect({
  needsClaude, needsCodex, claudeStatus, codexStatus,
  checkingEngine, engineFullyReady,
  onPrev, onNext, onCheckEngine, onClaudeLogin, onCodexLogin,
}: Step2Props) {
  const { t } = useTranslation()
  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step2.label')}</div>
        <div style={stepIntro}>
          {t('onboarding.step2.intro').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 ? <br /> : null}</span>
          ))}
        </div>

        {checkingEngine ? (
          <div style={hint}>{t('onboarding.step2.checking')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {needsClaude && (
              <EngineStatusRow
                name="Claude Code"
                status={claudeStatus}
                installUrl="https://docs.anthropic.com/en/docs/claude-code"
                installHint="npm install -g @anthropic-ai/claude-code"
                onLogin={onClaudeLogin}
                onRecheck={onCheckEngine}
              />
            )}
            {needsCodex && (
              <EngineStatusRow
                name="Codex CLI"
                status={codexStatus}
                installUrl="https://github.com/openai/codex"
                installHint="npm install -g @openai/codex"
                onLogin={onCodexLogin}
                onRecheck={onCheckEngine}
              />
            )}
          </div>
        )}
      </div>
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!engineFullyReady && (
            <button style={btnSkip} onClick={onNext}>{t('common.skip')}</button>
          )}
          <button
            style={{
              ...btnPrimary,
              opacity: engineFullyReady ? 1 : 0.4,
              cursor: engineFullyReady ? 'pointer' : 'not-allowed',
              pointerEvents: engineFullyReady ? 'auto' : 'none',
            }}
            onClick={onNext}
            disabled={!engineFullyReady}
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    </>
  )
}
