import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BrandMark from '../components/BrandMark'
import i18next from '../i18n'
import type {
  UiLang, WizardStep, EngineStatus,
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

  // Step 2 — Engine connection (codex폐기: claude only)
  const [claudeStatus, setClaudeStatus] = useState<EngineStatus | null>(null)
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

  // T-PATCH-220 Q7: focus-recheck — when the user alt-tabs away to install
  // claude and comes back, re-probe so they don't have to manually hit Recheck.
  // Only active while on step 2 to avoid spurious probes on other steps.
  useEffect(() => {
    if (step !== 2) return
    function onFocus() { checkEngineStatus() }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus) }
  }, [step])

  // Trigger completion when entering step 3
  useEffect(() => {
    if (step !== 3) return
    setCompleting(true)
    setCompleteError('')
    // codex폐기 (T-PATCH-235): 엔진은 항상 claude — 리터럴 인라인.
    const completeOpts: Record<string, unknown> = { engine: 'claude', uiLanguage: uiLang }
    // T-PATCH-213: guard deref — .catch traps only promise rejection.
    const api = (window as any).api
    if (!api?.completeOnboarding) { setCompleting(false); return }
    api.completeOnboarding(completeOpts)
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
    try {
      // codex폐기: always claude only
      const s = await (window as any).api.checkClaude()
      setClaudeStatus(s)
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

  // Engine step 2: is everything ready to proceed? (codex폐기: always claude)
  const needsClaude = true
  const claudeReady = claudeStatus?.installed && claudeStatus?.authed
  const engineFullyReady = claudeReady

  // T-311: legacy dual-mode downgraded to read-only — onboarding:complete now only
  // seeds productune.env, pre-warms the Playwright MCP cache, and saves the UI
  // language. The retired steps (agents symlink / po-instructions / enforcement
  // hooks / memory) must NOT be listed: a green check for a no-op is a false
  // confirmation. Keep this list in sync with the ipc/onboarding.ts handler.
  const completionStepKeys = [
    'onboarding.completionSteps.env',
    'onboarding.completionSteps.playwright',
    'onboarding.completionSteps.language',
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
            onPrev={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2_EngineConnect
            needsClaude={needsClaude}
            claudeStatus={claudeStatus}
            checkingEngine={checkingEngine}
            engineFullyReady={!!engineFullyReady}
            onPrev={() => setStep(1)}
            onNext={() => setStep(3)}
            onCheckEngine={checkEngineStatus}
            onClaudeLogin={handleClaudeLogin}
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
