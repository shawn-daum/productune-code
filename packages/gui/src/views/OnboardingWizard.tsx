import { useEffect, useRef, useState } from 'react'

type Engine = 'claude' | 'codex' | 'both'
type WikiBackend = 'filesystem' | 'graphiti'
type Tier = 'S' | 'A' | 'B'

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

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

  // Step 4
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [done, setDone] = useState(false)

  // Reset docker install state when leaving step 3
  useEffect(() => {
    if (step !== 3) {
      setInstallPhase('idle')
      setDockerLogs([])
      setInstallError('')
    }
  }, [step])

  // Auto-scroll log area to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dockerLogs])

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
    ;(window as any).api.completeOnboarding({ engine, wikiBackend })
      .then((result: { ok: boolean; error?: string }) => {
        if (result.ok) {
          setDone(true)
        } else {
          setCompleteError(result.error ?? '알 수 없는 오류')
        }
      })
      .catch((e: any) => {
        setCompleteError(e?.message ?? '알 수 없는 오류')
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
        setInstallError(result.error ?? '알 수 없는 오류')
        setInstallPhase('error')
      }
    } catch (e: any) {
      unsub?.()
      setInstallError(e?.message ?? '알 수 없는 오류')
      setInstallPhase('error')
    }
  }

  // Engine step 2: is everything ready to proceed?
  const needsClaude = engine === 'claude' || engine === 'both'
  const needsCodex = engine === 'codex' || engine === 'both'
  const claudeReady = !needsClaude || (claudeStatus?.installed && claudeStatus?.authed)
  const codexReady = !needsCodex || (codexStatus?.installed && codexStatus?.authed)
  const engineFullyReady = claudeReady && codexReady

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 20, marginRight: 10 }}>⚡</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>productune 초기 설정</span>
          <div style={stepIndicator}>
            {([1, 2, 3, 4] as const).map(s => (
              <div
                key={s}
                style={{
                  ...stepDot,
                  background: s === step ? '#FF6B2B' : s < step ? '#FF6B2B55' : '#333',
                  width: s === step ? 24 : 8,
                }}
              />
            ))}
          </div>
        </div>

        {/* Step 1 — Engine select */}
        {step === 1 && (
          <>
            <div style={body}>
              <div style={stepLabel}>Step 1 / 4 — AI 엔진 선택</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {engineOptions.map(opt => (
                  <OptionCard
                    key={opt.value}
                    selected={engine === opt.value}
                    onClick={() => setEngine(opt.value)}
                    label={opt.label}
                    badge={opt.badge}
                    desc={opt.desc}
                  />
                ))}
              </div>
            </div>
            <div style={footer}>
              <div />
              <button style={btnPrimary} onClick={() => setStep(2)}>다음 →</button>
            </div>
          </>
        )}

        {/* Step 2 — Engine connection */}
        {step === 2 && (
          <>
            <div style={body}>
              <div style={stepLabel}>Step 2 / 4 — 엔진 연결 확인</div>

              {checkingEngine ? (
                <div style={hint}>⏳ 엔진 상태 확인 중...</div>
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

              {!checkingEngine && !engineFullyReady && (
                <div style={{ fontSize: 11, color: '#505050', marginTop: 12 }}>
                  * 터미널에서 로그인 후 재확인 버튼을 누르세요. 미완료 상태로도 진행할 수 있습니다.
                </div>
              )}
            </div>
            <div style={footer}>
              <button style={btnSecondary} onClick={() => setStep(1)}>← 이전</button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={btnSkip} onClick={() => setStep(3)}>건너뛰기</button>
                <button
                  style={{ ...btnPrimary, opacity: engineFullyReady ? 1 : 0.6 }}
                  onClick={() => setStep(3)}
                >
                  다음 →
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3 — Wiki Backend */}
        {step === 3 && (
          <>
            <div style={body}>
              <div style={stepLabel}>Step 3 / 4 — Wiki 메모리 백엔드</div>

              {(detectingHw || !hardware) ? (
                <div style={hwSpinner}>
                  <span style={{ fontSize: 22, marginBottom: 8 }}>⏳</span>
                  <span style={{ fontSize: 12, color: '#505050' }}>하드웨어 감지 중...</span>
                </div>
              ) : (
                <>
                  <div style={hwBadgeRow}>
                    <TierBadge tier={hardware.tier} />
                    <span style={{ fontSize: 12, color: '#707070' }}>
                      RAM {hardware.ram_gb}GB
                      {hardware.apple_silicon && ' · Apple Silicon'}
                      {' · '}Docker {hardware.docker ? '✓' : '✗'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {wikiOptions.map(opt => (
                      <OptionCard
                        key={opt.value}
                        selected={wikiBackend === opt.value}
                        onClick={() => setWikiBackend(opt.value)}
                        label={opt.label}
                        badge={opt.recommended(hardware.tier) ? '권장' : undefined}
                        desc={opt.desc}
                      />
                    ))}
                  </div>

                  {wikiBackend === 'graphiti' && !hardware.docker && (
                    <div style={dockerBox}>
                      {installPhase === 'idle' && (
                        <>
                          <div style={{ fontSize: 12, color: '#FBBF24', marginBottom: 10 }}>
                            🐳 Docker Desktop이 감지되지 않았습니다. Graphiti 사용에 필요합니다.
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button style={btnDockerInstall} onClick={startDockerInstall}>
                              🍺 Homebrew로 자동 설치
                            </button>
                            <button
                              style={btnRedetect}
                              onClick={() => (window as any).api.openExternal(
                                'https://www.docker.com/products/docker-desktop/'
                              )}
                            >
                              수동으로 다운로드 ↗
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
                          설치 중… 취소하려면 앱을 재시작하세요.
                        </div>
                      )}

                      {installPhase === 'done' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            style={btnDockerInstall}
                            onClick={() => (window as any).api.openDockerApp()}
                          >
                            🐳 Docker Desktop 실행하기
                          </button>
                          <button
                            style={{ ...btnRedetect, opacity: redetecting ? 0.5 : 1 }}
                            onClick={redetectHardware}
                            disabled={redetecting}
                          >
                            {redetecting ? '감지 중…' : '재감지'}
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
                              다시 시도
                            </button>
                            <button
                              style={btnRedetect}
                              onClick={() => (window as any).api.openExternal(
                                'https://www.docker.com/products/docker-desktop/'
                              )}
                            >
                              수동으로 다운로드 ↗
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={footer}>
              <button style={btnSecondary} onClick={() => setStep(2)}>← 이전</button>
              <button style={btnPrimary} onClick={() => setStep(4)}>다음 →</button>
            </div>
          </>
        )}

        {/* Step 4 — Complete */}
        {step === 4 && (
          <>
            <div style={{ ...body, alignItems: 'center', textAlign: 'center', paddingTop: 32, paddingBottom: 32 }}>
              {completing && (
                <>
                  <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
                  <div style={{ fontSize: 14, color: '#A0A0A0' }}>설정 적용 중…</div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%' }}>
                    {completionSteps.map(s => (
                      <div key={s} style={{ fontSize: 12, color: '#505050', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#505050' }}>◌</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!completing && done && (
                <>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>설정 완료</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%', marginBottom: 24 }}>
                    {completionSteps.map(s => (
                      <div key={s} style={{ fontSize: 12, color: '#34D399', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>✓</span>
                        {s}
                      </div>
                    ))}
                  </div>
                  <button style={{ ...btnPrimary, padding: '12px 32px', fontSize: 14 }} onClick={onDone}>
                    시작하기 →
                  </button>
                </>
              )}

              {!completing && !done && completeError && (
                <>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>설정 실패</div>
                  <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 24, wordBreak: 'break-all' }}>
                    {completeError}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnSecondary} onClick={() => setStep(3)}>← 이전</button>
                    <button style={btnPrimary} onClick={() => {
                      setCompleteError('')
                      setDone(false)
                      setStep(4)
                    }}>
                      다시 시도
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
  selected, onClick, label, badge, desc,
}: {
  selected: boolean
  onClick: () => void
  label: string
  badge?: string
  desc: string
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
      <div style={{ fontSize: 12, color: '#707070', marginTop: 4, paddingLeft: 24 }}>{desc}</div>
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
  const isReady = status?.installed && status?.authed

  return (
    <div style={engineRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 15,
          color: isReady ? '#34D399' : status?.installed ? '#FBBF24' : '#EF4444',
        }}>
          {isReady ? '✓' : status?.installed ? '⚠' : '✗'}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 11, color: '#505050', marginLeft: 'auto' }}>
          {status === null
            ? '확인 중…'
            : isReady
              ? '설치됨 · 인증됨'
              : status.installed
                ? '설치됨 · 미인증'
                : '미설치'}
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
            설치 가이드 ↗
          </button>
        </div>
      )}

      {status && status.installed && !status.authed && (
        <div style={{ paddingLeft: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnEngineAction} onClick={onLogin}>
            터미널에서 로그인
          </button>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            재확인
          </button>
        </div>
      )}

      {isReady && (
        <div style={{ paddingLeft: 24 }}>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            재확인
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
  if (line.startsWith('✅')) return '#34D399'
  if (line.startsWith('❌')) return '#EF4444'
  if (line.startsWith('🔍') || line.startsWith('📦') || line.startsWith('🐳')) return '#FBBF24'
  return '#505050'
}

// ── Data ───────────────────────────────────────────────────────────────────────

const engineOptions: { value: Engine; label: string; badge?: string; desc: string }[] = [
  {
    value: 'claude',
    label: 'Claude Code',
    badge: '권장',
    desc: 'Claude 3.x 기반. hooks 완전 지원. R1/R2/R4 워크플로 적용.',
  },
  {
    value: 'codex',
    label: 'Codex',
    desc: 'OpenAI Codex CLI. doctrine-only (hooks 미작동).',
  },
  {
    value: 'both',
    label: '둘 다',
    desc: 'Claude Code 기본 + Codex 보조 사용.',
  },
]

const wikiOptions: { value: WikiBackend; label: string; desc: string; recommended: (tier: Tier) => boolean }[] = [
  {
    value: 'graphiti',
    label: 'Graphiti',
    desc: '그래프 DB 기반 장기 기억. Docker + 로컬 LLM 필요. Tier S/A 환경 권장.',
    recommended: (tier) => tier === 'S' || tier === 'A',
  },
  {
    value: 'filesystem',
    label: 'Filesystem',
    desc: '심플, 의존성 없음. wiki-keeper 에이전트(Claude API)가 마크다운 파일로 기억 관리.',
    recommended: (tier) => tier === 'B',
  },
]

const completionSteps = [
  '~/.productune/productune.env 생성',
  'agents/ → ~/.claude/agents/ 심링크',
  'po-instructions.md 복사',
  'po-memory.md 초기화',
]

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  position: 'fixed', inset: 0,
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
