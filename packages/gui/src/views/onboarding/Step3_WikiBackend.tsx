import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, X, AlertTriangle } from 'lucide-react'
import type { WikiBackend, HardwareInfo } from './types'
import OptionCard from './OptionCard'
import TierBadge from './TierBadge'
import { logLineColor } from './helpers'
import {
  body, footer, stepLabel, stepIntro,
  hwSpinner, hwBadgeRow, dockerBox, logArea, tierBBox,
  btnSecondary, btnPrimary, btnDockerInstall, btnRedetect,
} from './styles'

interface Step3Props {
  wikiBackend: WikiBackend
  hardware: HardwareInfo | null
  detectingHw: boolean
  installPhase: 'idle' | 'installing' | 'done' | 'error'
  dockerLogs: string[]
  installError: string
  redetecting: boolean
  onSelectBackend: (val: WikiBackend) => void
  onPrev: () => void
  onNext: () => void
  onStartDockerInstall: () => void
  onRedetectHardware: () => void
}

export default function Step3_WikiBackend({
  wikiBackend, hardware, detectingHw,
  installPhase, dockerLogs, installError, redetecting,
  onSelectBackend, onPrev, onNext, onStartDockerInstall, onRedetectHardware,
}: Step3Props) {
  const { t } = useTranslation()
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dockerLogs])

  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step3.label')}</div>
        <div style={stepIntro}>{t('onboarding.step3.intro')}</div>

        {(detectingHw || !hardware) ? (
          <div style={hwSpinner}>
            <Loader2 size={22} className="pdt-spin" color="#707070" style={{ marginBottom: 8 }} />
            <span style={{ fontSize: 12, color: '#505050' }}>{t('onboarding.step3.detectingHw')}</span>
          </div>
        ) : (
          <>
            <div style={hwBadgeRow}>
              <TierBadge tier={hardware.tier} />
              <span style={{ fontSize: 12, color: '#707070' }}>
                RAM {hardware.ram_gb}GB
                {hardware.apple_silicon && ' · Apple Silicon'}
                {' · Docker '}
                {hardware.docker
                  ? <Check size={12} style={{ display: 'inline', verticalAlign: '-2px' }} color="#34D399" strokeWidth={3} />
                  : <X size={12} style={{ display: 'inline', verticalAlign: '-2px' }} color="#EF4444" strokeWidth={3} />}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {(['graphiti', 'filesystem'] as WikiBackend[]).map(val => (
                <OptionCard
                  key={val}
                  selected={wikiBackend === val}
                  onClick={() => onSelectBackend(val)}
                  label={t(`onboarding.wiki.${val}.label`)}
                  badge={(val === 'graphiti' ? (hardware.tier === 'S' || hardware.tier === 'A') : hardware.tier === 'B') ? t('onboarding.step3.optionRecommended') : undefined}
                  intro={t(`onboarding.wiki.${val}.intro`)}
                  tech={t(`onboarding.wiki.${val}.tech`)}
                />
              ))}
            </div>

            {wikiBackend === 'graphiti' && !hardware.docker && (
              <div style={dockerBox}>
                {installPhase === 'idle' && (
                  <>
                    <div style={{ fontSize: 12, color: '#FBBF24', marginBottom: 10 }}>
                      {t('onboarding.step3.dockerNotDetected')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={btnDockerInstall} onClick={onStartDockerInstall}>
                        {t('onboarding.step3.brewInstall')}
                      </button>
                      <button
                        style={btnRedetect}
                        onClick={() => (window as any).api.openExternal(
                          'https://www.docker.com/products/docker-desktop/'
                        )}
                      >
                        {t('common.download')}
                      </button>
                    </div>
                  </>
                )}

                {installPhase !== 'idle' && dockerLogs.length > 0 && (
                  <div style={logArea}>
                    {dockerLogs.map((line, i) => (
                      <div key={i} style={{ color: logLineColor(line) }}>{line}</div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}

                {installPhase === 'installing' && (
                  <div style={{ fontSize: 11, color: '#505050', marginTop: 8 }}>
                    {t('onboarding.step3.installing')}
                  </div>
                )}

                {installPhase === 'done' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      style={btnDockerInstall}
                      onClick={() => (window as any).api.openDockerApp()}
                    >
                      {t('onboarding.step3.openDocker')}
                    </button>
                    <button
                      style={{ ...btnRedetect, opacity: redetecting ? 0.5 : 1 }}
                      onClick={onRedetectHardware}
                      disabled={redetecting}
                    >
                      {redetecting ? t('common.detecting') : t('onboarding.step3.redetect')}
                    </button>
                  </div>
                )}

                {installPhase === 'error' && (
                  <>
                    <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>
                      {installError}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button style={btnDockerInstall} onClick={onStartDockerInstall}>
                        {t('common.retry')}
                      </button>
                      <button
                        style={btnRedetect}
                        onClick={() => (window as any).api.openExternal(
                          'https://www.docker.com/products/docker-desktop/'
                        )}
                      >
                        {t('common.download')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {wikiBackend === 'graphiti' && hardware?.tier === 'B' && (
        <div style={tierBBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <AlertTriangle size={13} color="#FBBF24" />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#FBBF24' }}>
              {t('onboarding.wiki.graphiti.tierB.title')}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#A09060' }}>
            {t('onboarding.wiki.graphiti.tierB.body')}
          </div>
        </div>
      )}
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        <button style={btnPrimary} onClick={onNext}>{t('common.next')}</button>
      </div>
    </>
  )
}
