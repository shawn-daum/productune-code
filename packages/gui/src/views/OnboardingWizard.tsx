import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, Check, X, AlertTriangle, Zap, RotateCcw } from 'lucide-react'
import i18next from '../i18n'

type Engine = 'claude' | 'codex' | 'both'
type WikiBackend = 'filesystem' | 'graphiti'
type Tier = 'S' | 'A' | 'B'
type UiLang = 'en' | 'ko'
type WizardStep = 0 | 1 | 2 | 3 | '3.5' | 4

interface GraphitiConfig {
  llmProvider: 'ollama'
  llmModel: string
  embedderProvider: 'ollama'
  embedderModel: string
}

/** Recommended LLM models by hardware tier (ordered by preference). */
const MODEL_RECS: Record<'S' | 'A', string[]> = {
  S: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.1:8b'],
  A: ['qwen2.5:7b', 'llama3.1:8b', 'gemma2:9b'],
}

interface HardwareInfo {
  tier: Tier
  ram_gb: number
  apple_silicon: boolean
  docker: boolean
}

interface EngineStatus {
  installed: boolean
  authed: boolean
}

interface Props {
  onDone: () => void
}

export default function OnboardingWizard({ onDone }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<WizardStep>(0)

  // Step 0 — Language
  const [uiLang, setUiLang] = useState<UiLang>('en')

  // Step 1
  const [engine, setEngine] = useState<Engine>('claude')

  // Step 2 — Engine connection
  const [claudeStatus, setClaudeStatus] = useState<EngineStatus | null>(null)
  const [codexStatus, setCodexStatus] = useState<EngineStatus | null>(null)
  const [checkingEngine, setCheckingEngine] = useState(false)

  // Step 3 — Wiki backend
  const [wikiBackend, setWikiBackend] = useState<WikiBackend>('filesystem')
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [detectingHw, setDetectingHw] = useState(false)
  const [redetecting, setRedetecting] = useState(false)
  // Docker auto-install
  const [installPhase, setInstallPhase] = useState<'idle' | 'installing' | 'done' | 'error'>('idle')
  const [dockerLogs, setDockerLogs] = useState<string[]>([])
  const [installError, setInstallError] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  // Step 3.5 — Local LLM setup
  type LlmPhase = 'idle' | 'installing' | 'setup-graphiti' | 'registering-mcp' | 'done' | 'error'
  const [llmPhase, setLlmPhase] = useState<LlmPhase>('idle')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [llmLogs, setLlmLogs] = useState<string[]>([])
  const [llmError, setLlmError] = useState('')
  const [graphitiConfig, setGraphitiConfig] = useState<GraphitiConfig | null>(null)
  const llmLogEndRef = useRef<HTMLDivElement>(null)

  // Step 0 — reset CTA
  const [resetFeedback, setResetFeedback] = useState(false)

  // Step 4
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [done, setDone] = useState(false)

  // Step 0: detect OS locale to pre-select language default
  useEffect(() => {
    async function detectLocale() {
      try {
        const locale: string = await (window as any).api.getOsLocale()
        const defaultLang: UiLang = locale.startsWith('ko') ? 'ko' : 'en'
        setUiLang(defaultLang)
        await i18next.changeLanguage(defaultLang)
      } catch {
        // Fallback: use navigator.language in browser dev mode
        const navLang = navigator.language ?? ''
        const defaultLang: UiLang = navLang.startsWith('ko') ? 'ko' : 'en'
        setUiLang(defaultLang)
        await i18next.changeLanguage(defaultLang)
      }
    }
    detectLocale()
  }, [])

  // Reset docker install state when leaving step 3 / 3.5
  useEffect(() => {
    if (step !== 3 && step !== '3.5') {
      setInstallPhase('idle')
      setDockerLogs([])
      setInstallError('')
    }
  }, [step])

  // Auto-scroll docker log area to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dockerLogs])

  // Auto-scroll LLM log area to bottom
  useEffect(() => {
    llmLogEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [llmLogs])

  // Load installed models + pre-select default when entering step 3.5
  useEffect(() => {
    if (step !== '3.5') return
    ;(window as any).api.listOllamaModels()
      .then((models: string[]) => setInstalledModels(models))
      .catch(() => setInstalledModels([]))
    // Pre-select first recommended model for the detected tier
    if (!selectedModel && hardware) {
      const recs = MODEL_RECS[hardware.tier as 'S' | 'A'] ?? ['qwen2.5:7b']
      setSelectedModel(recs[0])
    }
  }, [step])

  // Check engine status when entering step 2
  useEffect(() => {
    if (step !== 2) return
    checkEngineStatus()
  }, [step])

  // Detect hardware when entering step 3
  useEffect(() => {
    if (step !== 3 || hardware) return
    setDetectingHw(true)
    ;(window as any).api.detectHardware()
      .then((hw: HardwareInfo) => {
        setHardware(hw)
        setWikiBackend(hw.tier === 'B' ? 'filesystem' : 'graphiti')
      })
      .catch(() => setHardware({ tier: 'B', ram_gb: 0, apple_silicon: false, docker: false }))
      .finally(() => setDetectingHw(false))
  }, [step])

  // Trigger completion when entering step 4
  useEffect(() => {
    if (step !== 4) return
    setCompleting(true)
    setCompleteError('')
    const completeOpts: Record<string, unknown> = { engine, wikiBackend, uiLanguage: uiLang }
    if (graphitiConfig) completeOpts.graphitiConfig = graphitiConfig
    ;(window as any).api.completeOnboarding(completeOpts)
      .then((result: { ok: boolean; error?: string }) => {
        if (result.ok) {
          setDone(true)
        } else {
          setCompleteError(result.error ?? t('onboarding.step4.unknownError'))
        }
      })
      .catch((e: any) => {
        setCompleteError(e?.message ?? t('onboarding.step4.unknownError'))
      })
      .finally(() => setCompleting(false))
  }, [step])

  async function checkEngineStatus() {
    setCheckingEngine(true)
    setClaudeStatus(null)
    setCodexStatus(null)
    try {
      if (engine === 'claude' || engine === 'both') {
        const s = await (window as any).api.checkClaude()
        setClaudeStatus(s)
      }
      if (engine === 'codex' || engine === 'both') {
        const s = await (window as any).api.checkCodex()
        setCodexStatus(s)
      }
    } catch { /* silent */ }
    finally { setCheckingEngine(false) }
  }

  async function handleReset() {
    try {
      await (window as any).api.clearLocalStorage()
    } catch { /* force: true — unlikely to fail */ }
    setResetFeedback(true)
    setTimeout(() => {
      window.location.reload()
    }, 1200)
  }

  async function handleSelectLang(lng: UiLang) {
    setUiLang(lng)
    await i18next.changeLanguage(lng)
  }

  async function handleClaudeLogin() {
    await (window as any).api.claudeLogin()
  }

  async function handleCodexLogin() {
    await (window as any).api.codexLogin()
  }

  function redetectHardware() {
    setRedetecting(true)
    ;(window as any).api.detectHardware()
      .then((hw: HardwareInfo) => {
        setHardware(hw)
        if (hw.docker) setWikiBackend('graphiti')
      })
      .catch(() => {})
      .finally(() => setRedetecting(false))
  }

  async function startDockerInstall() {
    setInstallPhase('installing')
    setDockerLogs([])
    setInstallError('')

    const unsub: (() => void) | undefined =
      (window as any).api.onDockerLog((line: string) => {
        setDockerLogs(prev => [...prev.slice(-500), line])
      })

    try {
      const result: { ok: boolean; error?: string } =
        await (window as any).api.installDocker()
      unsub?.()
      if (result.ok) {
        setInstallPhase('done')
      } else {
        setInstallError(result.error ?? t('onboarding.step4.unknownError'))
        setInstallPhase('error')
      }
    } catch (e: any) {
      unsub?.()
      setInstallError(e?.message ?? t('onboarding.step4.unknownError'))
      setInstallPhase('error')
    }
  }

  async function startLLMSetup() {
    setLlmPhase('installing')
    setLlmLogs([])
    setLlmError('')

    const unsub: (() => void) | undefined =
      (window as any).api.onInstallProgress((line: string) => {
        setLlmLogs(prev => [...prev.slice(-500), line])
      })

    try {
      // Phase 1: install Ollama + pull model + nomic-embed-text
      const llmResult: { ok: boolean; error?: string } =
        await (window as any).api.installLocalLLM({ model: selectedModel })
      unsub?.()
      if (!llmResult.ok) {
        setLlmError(llmResult.error ?? t('onboarding.wiki.graphiti.localLLM.failed'))
        setLlmPhase('error')
        return
      }

      // Phase 2: setup Graphiti (FalkorDB + containers)
      setLlmPhase('setup-graphiti')
      setLlmLogs([])
      const unsubG: (() => void) | undefined =
        (window as any).api.onGraphitiProgress((line: string) => {
          setLlmLogs(prev => [...prev.slice(-500), line])
        })
      const gResult: { ok: boolean; error?: string } =
        await (window as any).api.setupGraphiti()
      unsubG?.()
      if (!gResult.ok) {
        setLlmError(gResult.error ?? t('onboarding.wiki.graphiti.localLLM.failed'))
        setLlmPhase('error')
        return
      }

      // Phase 3: register graphiti MCP with Claude Code (non-fatal)
      setLlmPhase('registering-mcp')
      const mcpResult: { ok: boolean; alreadyRegistered: boolean; error?: string } =
        await (window as any).api.registerGraphitiMCP()
      if (!mcpResult.ok && !mcpResult.alreadyRegistered) {
        setLlmLogs(prev => [...prev,
          `WARN: ${mcpResult.error ?? 'graphiti MCP 등록 실패 — claude mcp add graphiti ... 수동 실행 필요'}`
        ])
      }

      // Done — save config for onboarding:complete
      setGraphitiConfig({
        llmProvider: 'ollama',
        llmModel: selectedModel,
        embedderProvider: 'ollama',
        embedderModel: 'nomic-embed-text',
      })
      setLlmPhase('done')
    } catch (e: any) {
      unsub?.()
      setLlmError(e?.message ?? t('onboarding.wiki.graphiti.localLLM.failed'))
      setLlmPhase('error')
    }
  }

  // Engine step 2: is everything ready to proceed?
  const needsClaude = engine === 'claude' || engine === 'both'
  const needsCodex = engine === 'codex' || engine === 'both'
  const claudeReady = !needsClaude || (claudeStatus?.installed && claudeStatus?.authed)
  const codexReady = !needsCodex || (codexStatus?.installed && codexStatus?.authed)
  const engineFullyReady = claudeReady && codexReady

  const completionStepKeys = [
    'onboarding.completionSteps.env',
    'onboarding.completionSteps.agents',
    'onboarding.completionSteps.instructions',
    'onboarding.completionSteps.memory',
    'onboarding.completionSteps.playwright',
  ] as const

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Header */}
        <div style={header}>
          <Zap size={20} strokeWidth={2.25} color="#FF6B2B" style={{ marginRight: 10 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{t('onboarding.title')}</span>
          <div style={stepIndicator}>
            {(() => {
              // '3.5' renders as step 3 in the indicator
              const stepNum = step === '3.5' ? 3 : (step as number)
              return ([0, 1, 2, 3, 4] as const).map(s => (
                <div
                  key={s}
                  style={{
                    ...stepDot,
                    background: s === stepNum ? '#FF6B2B' : s < stepNum ? '#FF6B2B55' : '#333',
                    width: s === stepNum ? 24 : 8,
                  }}
                />
              ))
            })()}
          </div>
        </div>

        {/* Step 0 — Language select */}
        {step === 0 && (
          <>
            <div style={body}>
              <div style={stepLabel}>{t('onboarding.step0.label')}</div>
              <div style={stepIntro}>
                {t('onboarding.step0.description')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <OptionCard
                  selected={uiLang === 'en'}
                  onClick={() => handleSelectLang('en')}
                  label={t('onboarding.step0.optionEn')}
                  intro=""
                  tech=""
                />
                <OptionCard
                  selected={uiLang === 'ko'}
                  onClick={() => handleSelectLang('ko')}
                  label={t('onboarding.step0.optionKo')}
                  intro=""
                  tech=""
                />
              </div>
            </div>
            <div style={footer}>
              {resetFeedback ? (
                <span style={{ fontSize: 11, color: '#34D399' }}>
                  {t('onboarding.step0.resetToast')}
                </span>
              ) : (
                <button style={btnReset} onClick={handleReset}>
                  <RotateCcw size={12} style={{ marginRight: 4 }} />
                  {t('onboarding.step0.resetCta')}
                </button>
              )}
              <button style={btnPrimary} onClick={() => setStep(1)}>
                {t('common.next')}
              </button>
            </div>
          </>
        )}

        {/* Step 1 — Engine select */}
        {step === 1 && (
          <>
            <div style={body}>
              <div style={stepLabel}>{t('onboarding.step1.label')}</div>
              <div style={stepIntro}>
                {t('onboarding.step1.intro').split('\n').map((line, i) => (
                  <span key={i}>{line}{i === 0 ? <br /> : null}</span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {(['claude', 'codex', 'both'] as Engine[]).map(val => (
                  <OptionCard
                    key={val}
                    selected={engine === val}
                    onClick={() => setEngine(val)}
                    label={t(`onboarding.engines.${val}.label`)}
                    badge={val === 'claude' ? t('onboarding.step1.optionRecommended') : undefined}
                    intro={t(`onboarding.engines.${val}.intro`)}
                    tech={t(`onboarding.engines.${val}.tech`)}
                  />
                ))}
              </div>
            </div>
            <div style={footer}>
              <button style={btnSecondary} onClick={() => setStep(0)}>{t('common.prev')}</button>
              <button style={btnPrimary} onClick={() => setStep(2)}>{t('common.next')}</button>
            </div>
          </>
        )}

        {/* Step 2 — Engine connection */}
        {step === 2 && (
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
                      onLogin={handleClaudeLogin}
                      onRecheck={checkEngineStatus}
                    />
                  )}
                  {needsCodex && (
                    <EngineStatusRow
                      name="Codex CLI"
                      status={codexStatus}
                      installUrl="https://github.com/openai/codex"
                      installHint="npm install -g @openai/codex"
                      onLogin={handleCodexLogin}
                      onRecheck={checkEngineStatus}
                    />
                  )}
                </div>
              )}

            </div>
            <div style={footer}>
              <button style={btnSecondary} onClick={() => setStep(1)}>{t('common.prev')}</button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!engineFullyReady && (
                  <button style={btnSkip} onClick={() => setStep(3)}>{t('common.skip')}</button>
                )}
                <button
                  style={{
                    ...btnPrimary,
                    opacity: engineFullyReady ? 1 : 0.4,
                    cursor: engineFullyReady ? 'pointer' : 'not-allowed',
                    pointerEvents: engineFullyReady ? 'auto' : 'none',
                  }}
                  onClick={() => setStep(3)}
                  disabled={!engineFullyReady}
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3 — Wiki Backend */}
        {step === 3 && (
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
                        onClick={() => setWikiBackend(val)}
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
                            <button style={btnDockerInstall} onClick={startDockerInstall}>
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
                            onClick={redetectHardware}
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
                            <button style={btnDockerInstall} onClick={startDockerInstall}>
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
            {/* Tier B warning: graphiti not available, will use filesystem */}
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
              <button style={btnSecondary} onClick={() => setStep(2)}>{t('common.prev')}</button>
              <button
                style={btnPrimary}
                onClick={() => {
                  if (wikiBackend === 'graphiti' && hardware?.tier !== 'B') {
                    // Tier S/A + graphiti → run local LLM setup
                    setStep('3.5')
                  } else {
                    // Tier B or filesystem → auto keeper, skip to completion
                    if (wikiBackend === 'graphiti' && hardware?.tier === 'B') {
                      setWikiBackend('filesystem')
                    }
                    setStep(4)
                  }
                }}
              >
                {t('common.next')}
              </button>
            </div>
          </>
        )}

        {/* Step 3.5 — Local LLM setup */}
        {step === '3.5' && (
          <>
            <div style={body}>
              <div style={stepLabel}>{t('onboarding.wiki.graphiti.localLLM.title')}</div>

              {/* Tier + RAM summary */}
              {hardware && (
                <div style={{ fontSize: 12, color: '#707070', marginBottom: 10 }}>
                  {t('onboarding.wiki.graphiti.localLLM.tierSummary', {
                    tier: hardware.tier,
                    ram_gb: hardware.ram_gb,
                    chip: hardware.apple_silicon ? ' · Apple Silicon' : '',
                  })}
                </div>
              )}

              {/* Model selection (idle phase) */}
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
                        onClick={() => setSelectedModel(m)}
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

              {/* Progress log (installing phases) */}
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

              {/* Done */}
              {llmPhase === 'done' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#34D399', marginTop: 8 }}>
                  <CheckCircle2 size={16} strokeWidth={2} />
                  {t('onboarding.wiki.graphiti.localLLM.done')}
                </div>
              )}

              {/* Error */}
              {llmPhase === 'error' && (
                <>
                  <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{llmError}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnDockerInstall} onClick={startLLMSetup}>
                      {t('onboarding.wiki.graphiti.localLLM.retryBtn')}
                    </button>
                    <button
                      style={btnRedetect}
                      onClick={() => {
                        setWikiBackend('filesystem')
                        setLlmPhase('idle')
                        setStep(4)
                      }}
                    >
                      {t('onboarding.wiki.graphiti.localLLM.skipToKeeper')}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div style={footer}>
              {llmPhase === 'idle' ? (
                <>
                  <button style={btnSecondary} onClick={() => setStep(3)}>{t('common.prev')}</button>
                  <button
                    style={{ ...btnPrimary, opacity: selectedModel ? 1 : 0.4, cursor: selectedModel ? 'pointer' : 'not-allowed' }}
                    onClick={startLLMSetup}
                    disabled={!selectedModel}
                  >
                    {t('onboarding.wiki.graphiti.localLLM.installBtn')}
                  </button>
                </>
              ) : llmPhase === 'done' ? (
                <>
                  <div />
                  <button style={btnPrimary} onClick={() => setStep(4)}>
                    {t('common.next')}
                  </button>
                </>
              ) : (
                // Installing / error phases — no nav (except error has retry buttons above)
                <div />
              )}
            </div>
          </>
        )}

        {/* Step 4 — Complete */}
        {step === 4 && (
          <>
            <div style={{ ...body, alignItems: 'center', textAlign: 'center', paddingTop: 32, paddingBottom: 32 }}>
              {completing && (
                <>
                  <Loader2 size={32} className="pdt-spin" color="#A0A0A0" style={{ marginBottom: 16 }} />
                  <div style={{ fontSize: 14, color: '#A0A0A0' }}>{t('onboarding.step4.applying')}</div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%' }}>
                    {completionStepKeys.map(key => (
                      <div key={key} style={{ fontSize: 12, color: '#505050', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#505050' }}>◌</span>
                        {t(key)}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!completing && done && (
                <>
                  <CheckCircle2 size={48} color="#34D399" strokeWidth={1.75} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('onboarding.step4.done')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%', marginBottom: 24 }}>
                    {completionStepKeys.map(key => (
                      <div key={key} style={{ fontSize: 12, color: '#34D399', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Check size={12} strokeWidth={3} />
                        {t(key)}
                      </div>
                    ))}
                  </div>
                  <button style={{ ...btnPrimary, padding: '12px 32px', fontSize: 14 }} onClick={onDone}>
                    {t('onboarding.step4.start')}
                  </button>
                </>
              )}

              {!completing && !done && completeError && (
                <>
                  <XCircle size={32} color="#EF4444" strokeWidth={1.75} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('onboarding.step4.failed')}</div>
                  <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 24, wordBreak: 'break-all' }}>
                    {completeError}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnSecondary} onClick={() => setStep(3)}>{t('common.prev')}</button>
                    <button style={btnPrimary} onClick={() => {
                      setCompleteError('')
                      setDone(false)
                      setStep(4)
                    }}>
                      {t('common.retry')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function OptionCard({
  selected, onClick, label, badge, intro, tech,
}: {
  selected: boolean
  onClick: () => void
  label: string
  badge?: string
  intro: string
  tech: string
}) {
  return (
    <div
      style={{
        ...optionCard,
        borderColor: selected ? '#FF6B2B' : '#2A2A2A',
        background: selected ? '#1E1108' : '#161616',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...radio, background: selected ? '#FF6B2B' : 'transparent' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: '#F0F0F0' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 9999,
            background: '#2A1A08', color: '#FF6B2B', border: '1px solid #FF6B2B55',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: '#A0A0A0', marginTop: 5, paddingLeft: 24, lineHeight: 1.45 }}>{intro}</div>
      {tech && <div style={{ fontSize: 11, color: '#606060', marginTop: 2, paddingLeft: 24, lineHeight: 1.45 }}>{tech}</div>}
    </div>
  )
}

function EngineStatusRow({
  name, status, installUrl, installHint, onLogin, onRecheck,
}: {
  name: string
  status: EngineStatus | null
  installUrl: string
  installHint: string
  onLogin: () => void
  onRecheck: () => void
}) {
  const { t } = useTranslation()
  const isReady = status?.installed && status?.authed

  return (
    <div style={engineRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {isReady
          ? <Check size={15} color="#34D399" strokeWidth={3} />
          : status?.installed
            ? <AlertTriangle size={15} color="#FBBF24" strokeWidth={2} />
            : <X size={15} color="#EF4444" strokeWidth={3} />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 11, color: '#505050', marginLeft: 'auto' }}>
          {status === null
            ? t('onboarding.step2.statusChecking')
            : isReady
              ? t('onboarding.step2.statusReady')
              : status.installed
                ? t('onboarding.step2.statusInstalledNoAuth')
                : t('onboarding.step2.statusNotInstalled')}
        </span>
      </div>

      {status && !status.installed && (
        <div style={{ paddingLeft: 24 }}>
          <div style={{ fontSize: 11, color: '#505050', fontFamily: 'monospace', marginBottom: 6 }}>
            {installHint}
          </div>
          <button
            style={btnEngineAction}
            onClick={() => (window as any).api.openExternal(installUrl)}
          >
            {t('onboarding.step2.installGuide')}
          </button>
        </div>
      )}

      {status && status.installed && !status.authed && (
        <div style={{ paddingLeft: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnEngineAction} onClick={onLogin}>
            {t('onboarding.step2.loginTerminal')}
          </button>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            {t('onboarding.step2.recheck')}
          </button>
        </div>
      )}

      {isReady && (
        <div style={{ paddingLeft: 24 }}>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            {t('onboarding.step2.recheck')}
          </button>
        </div>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const colors: Record<Tier, { bg: string; color: string; label: string }> = {
    S: { bg: '#0D2A1A', color: '#34D399', label: 'Tier S' },
    A: { bg: '#2A2000', color: '#FBBF24', label: 'Tier A' },
    B: { bg: '#1A1010', color: '#F87171', label: 'Tier B' },
  }
  const c = colors[tier]
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 9999,
      background: c.bg, color: c.color, fontWeight: 600,
    }}>
      {c.label}
    </span>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function logLineColor(line: string): string {
  if (line.startsWith('OK')) return '#34D399'
  if (line.startsWith('ERR') || line.includes('오류')) return '#EF4444'
  if (line.startsWith('WARN') || line.includes('WARN:')) return '#FBBF24'
  if (line.includes('확인 중') || line.includes('설치 중') || line.includes('pull 중')) return '#FBBF24'
  return '#505050'
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1, minHeight: 0,
  background: '#0A0A0A',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  userSelect: 'none',
  color: '#F0F0F0',
}
const card: React.CSSProperties = {
  background: '#141414', border: '1px solid #2A2A2A',
  borderRadius: 14, width: 460,
  boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
  overflow: 'hidden',
}
const header: React.CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid #222',
  display: 'flex', alignItems: 'center',
}
const stepIndicator: React.CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
}
const stepDot: React.CSSProperties = {
  height: 8, borderRadius: 9999,
  transition: 'width 0.2s, background 0.2s',
}
const body: React.CSSProperties = {
  padding: '20px 20px 8px',
  display: 'flex', flexDirection: 'column', gap: 4,
  minHeight: 200,
}
const footer: React.CSSProperties = {
  padding: '12px 20px 16px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const stepLabel: React.CSSProperties = {
  fontSize: 11, color: '#505050', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 8,
}
const stepIntro: React.CSSProperties = {
  fontSize: 12.5, color: '#B0B0B0', lineHeight: 1.55,
  marginBottom: 12,
}
const hint: React.CSSProperties = { fontSize: 12, color: '#505050', marginTop: 8 }
const hwBadgeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
}
const hwSpinner: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  minHeight: 160, gap: 4,
}
const engineRow: React.CSSProperties = {
  background: '#161616', border: '1px solid #2A2A2A',
  borderRadius: 8, padding: '10px 12px',
}
const dockerBox: React.CSSProperties = {
  marginTop: 8, padding: '10px 12px',
  background: '#1A1208', border: '1px solid #FBBF2444',
  borderRadius: 6,
}
const logArea: React.CSSProperties = {
  marginTop: 8,
  background: '#0A0A0A', border: '1px solid #222', borderRadius: 4,
  padding: '8px 10px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11, lineHeight: 1.6,
  maxHeight: 120, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 1,
}
const btnEngineAction: React.CSSProperties = {
  background: '#1E1E2E', color: '#818CF8',
  border: '1px solid #818CF844', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}
const btnDockerInstall: React.CSSProperties = {
  background: '#2A1E00', color: '#FBBF24',
  border: '1px solid #FBBF2466', borderRadius: 4,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnRedetect: React.CSSProperties = {
  background: '#1A1A1A', color: '#A0A0A0',
  border: '1px solid #333', borderRadius: 4,
  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  transition: 'opacity 0.15s',
}
const optionCard: React.CSSProperties = {
  border: '1px solid #2A2A2A', borderRadius: 8,
  padding: '10px 12px', cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
}
const radio: React.CSSProperties = {
  width: 14, height: 14, borderRadius: 9999,
  border: '2px solid #FF6B2B', flexShrink: 0,
  transition: 'background 0.15s',
}
const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 4,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
const btnSkip: React.CSSProperties = {
  background: 'transparent', color: '#606060', border: 'none',
  fontSize: 12, cursor: 'pointer', padding: '8px 10px',
}
const btnReset: React.CSSProperties = {
  background: 'transparent', color: '#505050', border: 'none',
  fontSize: 11, cursor: 'pointer', padding: '4px 8px',
  display: 'flex', alignItems: 'center',
}
const tierBBox: React.CSSProperties = {
  marginTop: 8, padding: '10px 12px',
  background: '#1A1200', border: '1px solid #FBBF2444',
  borderRadius: 6,
}
