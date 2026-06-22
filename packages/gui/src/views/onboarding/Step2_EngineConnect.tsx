import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineStatus } from './types'
import EngineStatusRow from './EngineStatusRow'
import {
  body, footer, stepLabel, stepIntro, hint, btnSecondary, btnPrimary, btnPrimaryDisabled,
  engineRow, btnEngineAction, btnRedetect,
} from './styles'

// codex폐기: 온보딩은 claude only — Engine 로컬 타입도 claude만
type Engine = 'claude'

interface Step2Props {
  needsClaude: boolean
  claudeStatus: EngineStatus | null
  checkingEngine: boolean
  engineFullyReady: boolean
  onPrev: () => void
  onNext: () => void
  onCheckEngine: () => void
  onClaudeLogin: () => void
}

interface LoginState {
  engine: Engine
  url: string | null
  needsCode: boolean
}

export default function Step2_EngineConnect({
  needsClaude, claudeStatus,
  checkingEngine, engineFullyReady,
  onPrev, onNext, onCheckEngine, onClaudeLogin,
}: Step2Props) {
  const { t } = useTranslation()

  // T-PATCH-199: hidden-spawn login progress state. While `login` is set, the
  // CLI child is mid browser-OAuth handshake; we show the waiting card + (once
  // the URL arrives) a "reopen browser" button + (on needs-code) a paste card.
  const [login, setLogin] = useState<LoginState | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const loginRef = useRef<LoginState | null>(null)
  loginRef.current = login

  useEffect(() => {
    const api = (window as any).api
    if (!api?.onLoginUrl) return
    const offUrl = api.onLoginUrl((p: { engine: Engine; url: string }) => {
      setLogin((prev) => (prev && prev.engine === p.engine ? { ...prev, url: p.url } : prev))
    })
    const offNeedsCode = api.onLoginNeedsCode((p: { engine: Engine }) => {
      setLogin((prev) => (prev && prev.engine === p.engine ? { ...prev, needsCode: true } : prev))
    })
    const offExit = api.onLoginExit(() => {
      setLogin(null)
      setCodeInput('')
    })
    return () => { offUrl?.(); offNeedsCode?.(); offExit?.() }
  }, [])

  function beginLogin(engine: Engine) {
    setCodeInput('')
    setLogin({ engine, url: null, needsCode: false })
    onClaudeLogin()
  }

  function reopenBrowser() {
    if (login?.url) (window as any).api?.openExternal(login.url)
  }

  function submitCode() {
    const code = codeInput.trim()
    if (!code) return
    ;(window as any).api?.submitLoginCode(code)
    setCodeInput('')
  }

  function cancelLogin() {
    ;(window as any).api?.cancelLogin()
    setLogin(null)
    setCodeInput('')
  }

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
        ) : login ? (
          <div style={engineRow}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {t('onboarding.step2.login.waiting')}
            </div>
            <div style={{ fontSize: 12, color: '#909090', lineHeight: 1.5, marginBottom: 10 }}>
              {t('onboarding.step2.login.waitingHint')}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {login.url && (
                <button style={btnEngineAction} onClick={reopenBrowser}>
                  {t('onboarding.step2.login.reopenBrowser')}
                </button>
              )}
              <button
                style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }}
                onClick={cancelLogin}
              >
                {t('onboarding.step2.login.cancel')}
              </button>
            </div>

            {login.needsCode && (
              <div style={{ marginTop: 12, borderTop: '1px solid #2A2A2A', paddingTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                  {t('onboarding.step2.login.needsCodeTitle')}
                </div>
                <div style={{ fontSize: 11.5, color: '#909090', lineHeight: 1.5, marginBottom: 8 }}>
                  {t('onboarding.step2.login.needsCodeHint')}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitCode() }}
                    placeholder={t('onboarding.step2.login.codePlaceholder')}
                    autoFocus
                    style={{
                      flex: 1, background: '#0A0A0A', color: '#F0F0F0',
                      border: '1px solid #333', borderRadius: 4,
                      padding: '6px 10px', fontSize: 12,
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                    }}
                  />
                  <button
                    style={{ ...btnEngineAction, opacity: codeInput.trim() ? 1 : 0.4 }}
                    onClick={submitCode}
                    disabled={!codeInput.trim()}
                  >
                    {t('onboarding.step2.login.submitCode')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {needsClaude && (
              <EngineStatusRow
                name="Claude Code"
                status={claudeStatus}
                installUrl="https://docs.anthropic.com/en/docs/claude-code"
                installHint="npm install -g @anthropic-ai/claude-code"
                onLogin={() => beginLogin('claude')}
                onRecheck={onCheckEngine}
              />
            )}
          </div>
        )}

        {/* T-PATCH-220: derive a why-disabled hint from claudeStatus.
            Only shown when not ready, not in OAuth flow, not still checking. */}
        {!engineFullyReady && !login && !checkingEngine && (
          <div style={{ ...hint, marginTop: 12 }}>
            {claudeStatus === null
              ? t('onboarding.step2.gate.checking')
              : !claudeStatus.installed
                ? t('onboarding.step2.gate.needInstall')
                : t('onboarding.step2.gate.needLogin')}
          </div>
        )}
      </div>
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        {/* T-PATCH-220 AC-1: single Next, disabled until engineFullyReady.
            While checking, keep disabled so there's no flash of enabled state. */}
        <button
          style={engineFullyReady && !checkingEngine ? btnPrimary : btnPrimaryDisabled}
          disabled={!engineFullyReady || checkingEngine}
          onClick={onNext}
        >
          {checkingEngine
            ? t('onboarding.step2.gate.checking')
            : t('common.next')}
        </button>
      </div>
    </>
  )
}
