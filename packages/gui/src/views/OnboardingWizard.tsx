import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BrandMark from '../components/BrandMark'
import i18next from '../i18n'
import type {
  Engine, UiLang, WizardStep, EngineStatus,
} from './onboarding/types'
import { wrap, card, header, stepIndicator, stepDot } from './onboarding/styles'
import Step0_Language from './onboarding/Step0_Language'
import Step1_Engine from './onboarding/Step1_Engine'
import Step2_EngineConnect from './onboarding/Step2_EngineConnect'
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

  // Step 0 — reset CTA
  const [resetFeedback, setResetFeedback] = useState(false)

  // Step 3 (completion)
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

  // Check engine status when entering step 2
  useEffect(() => {
    if (step !== 2) return
    checkEngineStatus()
  }, [step])

  // T-PATCH-199: when a hidden login child exits (browser OAuth finished or the
  // user cancelled), re-poll engine status so a successful sign-in flips Next on
  // without manual re-check. Subscribed at the wizard level so it survives the
  // inner card re-renders. Returns unsubscribe.
  useEffect(() => {
    const api = (window as any).api
    if (!api?.onLoginExit) return
    const off = api.onLoginExit(() => { checkEngineStatus() })
    return off
  }, [])

  // Trigger completion when entering step 3
  useEffect(() => {
    if (step !== 3) return
    setCompleting(true)
    setCompleteError('')
    const completeOpts: Record<string, unknown> = { engine, uiLanguage: uiLang }
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
          <BrandMark size={20} style={{ marginRight: 10 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{t('onboarding.title')}</span>
          <div style={stepIndicator}>
            {([0, 1, 2, 3] as const).map(s => (
              <div
                key={s}
                style={{
                  ...stepDot,
                  background: s === step ? '#8B5CF6' : s < step ? '#8B5CF655' : '#333',
                  width: s === step ? 24 : 8,
                }}
              />
            ))}
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
          <Step4_Complete
            completing={completing}
            done={done}
            completeError={completeError}
            completionStepKeys={completionStepKeys}
            onPrev={() => setStep(2)}
            onDone={onDone}
            onRetry={() => {
              setCompleteError('')
              setDone(false)
              setStep(3)
            }}
          />
        )}
      </div>
    </div>
  )
}
