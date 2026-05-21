import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import type { HardwareInfo, LlmPhase } from './types'
import { logLineColor, MODEL_RECS } from './helpers'
import {
  body, footer, stepLabel, logArea, optionCard, radio,
  btnSecondary, btnPrimary, btnDockerInstall, btnRedetect,
} from './styles'

interface Step3_5Props {
  hardware: HardwareInfo | null
  llmPhase: LlmPhase
  selectedModel: string
  installedModels: string[]
  llmLogs: string[]
  llmError: string
  onSelectModel: (model: string) => void
  onPrev: () => void
  onStartLLMSetup: () => void
  onSkipToStep4: () => void
  onNext: () => void
}

export default function Step3_5_LocalLLM({
  hardware, llmPhase, selectedModel, installedModels, llmLogs, llmError,
  onSelectModel, onPrev, onStartLLMSetup, onSkipToStep4, onNext,
}: Step3_5Props) {
  const { t } = useTranslation()
  const llmLogEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    llmLogEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [llmLogs])

  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.wiki.graphiti.localLLM.title')}</div>

        {hardware && (
          <div style={{ fontSize: 12, color: '#707070', marginBottom: 10 }}>
            {t('onboarding.wiki.graphiti.localLLM.tierSummary', {
              tier: hardware.tier,
              ram_gb: hardware.ram_gb,
              chip: hardware.apple_silicon ? ' · Apple Silicon' : '',
            })}
          </div>
        )}

        {llmPhase === 'idle' && (
          <>
            <div style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 8 }}>
              {t('onboarding.wiki.graphiti.localLLM.selectModel')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {(MODEL_RECS[hardware?.tier as 'S' | 'A'] ?? ['qwen2.5:7b']).map(m => (
                <div
                  key={m}
                  style={{
                    ...optionCard,
                    borderColor: selectedModel === m ? '#FF6B2B' : '#2A2A2A',
                    background: selectedModel === m ? '#1E1108' : '#161616',
                    padding: '8px 12px',
                  }}
                  onClick={() => onSelectModel(m)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...radio, background: selectedModel === m ? '#FF6B2B' : 'transparent' }} />
                    <span style={{ fontWeight: 600, fontSize: 12, color: '#F0F0F0' }}>{m}</span>
                    {installedModels.some(im => im === m || im.startsWith(m + ':')) && (
                      <span style={{ fontSize: 10, color: '#34D399', marginLeft: 4 }}>
                        ✓ installed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(llmPhase === 'installing' || llmPhase === 'setup-graphiti' || llmPhase === 'registering-mcp') && (
          <>
            <div style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 8 }}>
              {llmPhase === 'installing' &&
                t('onboarding.wiki.graphiti.localLLM.pullingModel', { model: selectedModel })}
              {llmPhase === 'setup-graphiti' &&
                t('onboarding.wiki.graphiti.localLLM.settingUpGraphiti')}
              {llmPhase === 'registering-mcp' &&
                t('onboarding.wiki.graphiti.localLLM.registeringMCP')}
            </div>
            <div style={logArea}>
              {llmLogs.map((line, i) => (
                <div key={i} style={{ color: logLineColor(line) }}>{line}</div>
              ))}
              <div ref={llmLogEndRef} />
            </div>
            <div style={{ fontSize: 11, color: '#505050', marginTop: 8 }}>
              {llmPhase === 'installing' && t('onboarding.wiki.graphiti.localLLM.installing')}
            </div>
          </>
        )}

        {llmPhase === 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#34D399', marginTop: 8 }}>
            <CheckCircle2 size={16} strokeWidth={2} />
            {t('onboarding.wiki.graphiti.localLLM.done')}
          </div>
        )}

        {llmPhase === 'error' && (
          <>
            <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{llmError}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnDockerInstall} onClick={onStartLLMSetup}>
                {t('onboarding.wiki.graphiti.localLLM.retryBtn')}
              </button>
              <button style={btnRedetect} onClick={onSkipToStep4}>
                {t('onboarding.wiki.graphiti.localLLM.skipToKeeper')}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={footer}>
        {llmPhase === 'idle' ? (
          <>
            <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
            <button
              style={{ ...btnPrimary, opacity: selectedModel ? 1 : 0.4, cursor: selectedModel ? 'pointer' : 'not-allowed' }}
              onClick={onStartLLMSetup}
              disabled={!selectedModel}
            >
              {t('onboarding.wiki.graphiti.localLLM.installBtn')}
            </button>
          </>
        ) : llmPhase === 'done' ? (
          <>
            <div />
            <button style={btnPrimary} onClick={onNext}>
              {t('common.next')}
            </button>
          </>
        ) : (
          <div />
        )}
      </div>
    </>
  )
}
