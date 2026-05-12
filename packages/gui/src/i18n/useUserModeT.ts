/**
 * useUserModeT — mode-aware i18n resolver hook (T-P4-084).
 *
 * Resolver rules:
 *  - mode = 'developer' → try `<key>.dev` first, fallback to `<key>`
 *  - mode = 'planner'   → use `<key>` (base is planner-friendly)
 *  - mode = null        → use `<key>` (same as planner)
 *
 * Base keys are planner-friendly defaults.
 * Dev-variant keys carry `.dev` suffix only where the wording differs.
 */
import { useTranslation } from 'react-i18next'
import { useUserMode } from '../store/useUserMode'

export function useUserModeT() {
  const { t, i18n } = useTranslation()
  const mode = useUserMode((s) => s.mode)

  function tMode(key: string, options?: Record<string, unknown>): string {
    if (mode === 'developer') {
      const devKey = `${key}.dev`
      const devVal = i18n.exists(devKey) ? t(devKey, options) : null
      if (devVal !== null) return devVal
    }
    return t(key, options)
  }

  return { tMode, t, mode }
}
