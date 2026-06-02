import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import i18next from '../i18n'
import type {
  Engine, WikiBackend, UiLang, WizardStep,
  GraphitiConfig, HardwareInfo, EngineStatus, LlmPhase,
} from './onboarding/types'
import { wrap, card, header, stepIndicator, stepDot } from './onboarding/styles'
import { MODEL_RECS } from './onboarding/helpers'
import Step0_Language from './onboarding/Step0_Language'
import Step1_Engine from './onboarding/Step1_Engine'
import Step2_EngineConnect from './onboarding/Step2_EngineConnect'
import Step3_WikiBackend from './onboarding/Step3_WikiBackend'
import Step3_5_LocalLLM from './onboarding/Step3_5_LocalLLM'
import Step4_Complete from './onboarding/Step4_Complete'

interface Props { onDone: () => void }

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

  // Step 3.5 — Local LLM setup
  const [llmPhase, setLlmPhase] = useState<LlmPhase>('idle')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [llmLogs, setLlmLogs] = useState<string[]>([])
  const [llmError, setLlmError] = useState('')
  const [graphitiConfig, setGraphitiConfig] = useState<GraphitiConfig | null>(null)

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
          <Zap size={20} strokeWidth={2.25} color="#8B5CF6" style={{ marginRight: 10 }} />
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
                    background: s === stepNum ? '#8B5CF6' : s < stepNum ? '#8B5CF655' : '#333',
                    width: s === stepNum ? 24 : 8,
                  }}
                />
              ))
            })()}
          </div>
        </div>

        {/* Step routing */}
        {step === 0 && (
          <Step0_Language
            uiLang={uiLang}
            resetFeedback={resetFeedback}
            onSelectLang={handleSelectLang}
            onReset={handleReset}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <Step1_Engine
            engine={engine}
            onSelectEngine={setEngine}
            onPrev={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2_EngineConnect
            needsClaude={needsClaude}
            needsCodex={needsCodex}
            claudeStatus={claudeStatus}
            codexStatus={codexStatus}
            checkingEngine={checkingEngine}
            engineFullyReady={!!engineFullyReady}
            onPrev={() => setStep(1)}
            onNext={() => setStep(3)}
            onCheckEngine={checkEngineStatus}
            onClaudeLogin={handleClaudeLogin}
            onCodexLogin={handleCodexLogin}
          />
        )}

        {step === 3 && (
          <Step3_WikiBackend
            wikiBackend={wikiBackend}
            hardware={hardware}
            detectingHw={detectingHw}
            installPhase={installPhase}
            dockerLogs={dockerLogs}
            installError={installError}
            redetecting={redetecting}
            onSelectBackend={setWikiBackend}
            onPrev={() => setStep(2)}
            onNext={() => {
              if (wikiBackend === 'graphiti' && hardware?.tier !== 'B') {
                setStep('3.5')
              } else {
                if (wikiBackend === 'graphiti' && hardware?.tier === 'B') {
                  setWikiBackend('filesystem')
                }
                setStep(4)
              }
            }}
            onStartDockerInstall={startDockerInstall}
            onRedetectHardware={redetectHardware}
          />
        )}

        {step === '3.5' && (
          <Step3_5_LocalLLM
            hardware={hardware}
            llmPhase={llmPhase}
            selectedModel={selectedModel}
            installedModels={installedModels}
            llmLogs={llmLogs}
            llmError={llmError}
            onSelectModel={setSelectedModel}
            onPrev={() => setStep(3)}
            onStartLLMSetup={startLLMSetup}
            onSkipToStep4={() => {
              setWikiBackend('filesystem')
              setLlmPhase('idle')
              setStep(4)
            }}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <Step4_Complete
            completing={completing}
            done={done}
            completeError={completeError}
            completionStepKeys={completionStepKeys}
            onPrev={() => setStep(3)}
            onDone={onDone}
            onRetry={() => {
              setCompleteError('')
              setDone(false)
              setStep(4)
            }}
          />
        )}
      </div>
    </div>
  )
}
