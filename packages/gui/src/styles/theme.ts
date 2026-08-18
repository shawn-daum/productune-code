/*
 * theme.ts — theme controller (T-359)
 * ----------------------------------------------------------------------------
 * Sets the light/dark theme class on <html> (surface/text/border tokens flip via
 * the CSS theme blocks in tokens.css) AND propagates the accent-derived tokens.
 *
 * Why propagation is needed: Chromium does NOT re-resolve `var(--brand-accent)`
 * inside derived custom properties when the primitive is overridden by a
 * .theme-* rule (registered leaves flip, their var() consumers stay stuck —
 * verified in Electron/Chromium). So after toggling the class we READ the single
 * swap token `--brand-accent` (which flips correctly as a registered <color>)
 * and write the accent-derived tokens CONCRETELY as inline custom properties.
 *
 * This file holds NO brand hex. The one brand value lives in tokens.css
 * (`--brand-accent`, grep "SWAP POINT"); this controller only reads + fans it
 * out. A violet→blue swap is therefore still a single-token CSS edit.
 */

export type ThemeMode = 'dark' | 'light'

const CLASS: Record<ThemeMode, string> = { dark: 'theme-dark', light: 'theme-light' }

/** Read the resolved --brand-accent for the currently-applied theme class. */
function readBrandAccent(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || '#8B5CF6'
}

/** Fan the single brand value out to the accent-derived consumed tokens. */
function propagateAccent(mode: ThemeMode): void {
  const root = document.documentElement
  const a = readBrandAccent()
  // Derived tints are computed from the accent with NO var() reference, so they
  // are concrete and repaint correctly (the broken case is var()-to-primitive).
  const hover = `color-mix(in srgb, ${a} 84%, #000)`
  const subtle = `color-mix(in srgb, ${a} ${mode === 'dark' ? 16 : 14}%, transparent)`
  root.style.setProperty('--accent', a)
  root.style.setProperty('--accent-hover', hover)
  root.style.setProperty('--accent-subtle', subtle)
  root.style.setProperty('--border-focus', a)
  root.style.setProperty('--persona-po', a)
  root.style.setProperty('--status-in-progress', a)
}

/** Swap the class, then propagate the accent from --brand-accent. No pin bookkeeping —
 *  used for both the OS-driven auto path and the initial boot-time apply. */
function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  root.classList.remove(CLASS.dark, CLASS.light)
  root.classList.add(CLASS[mode])
  // Force a style recalc so --brand-accent reflects the new class before we read.
  void root.offsetHeight
  propagateAccent(mode)
}

// Cleanup for the OS prefers-color-scheme listener attached by initTheme(). Cleared
// (and the listener detached) the first time the user makes an explicit choice via
// the public setTheme() below — see T-419.
let detachOsListener: (() => void) | null = null

/**
 * Apply an EXPLICIT theme choice (in-app toggle, future settings UI, tests). This
 * pins the theme: it detaches the prefers-color-scheme listener so a subsequent OS
 * theme change can no longer silently override the user's pick (T-419 — the listener
 * used to stay attached forever and unconditionally clobber an explicit pin).
 */
export function setTheme(mode: ThemeMode): void {
  if (detachOsListener) {
    detachOsListener()
    detachOsListener = null
  }
  applyTheme(mode)
}

/** Current mode from the applied class, falling back to the OS preference. */
export function currentTheme(): ThemeMode {
  const root = document.documentElement
  if (root.classList.contains(CLASS.light)) return 'light'
  if (root.classList.contains(CLASS.dark)) return 'dark'
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = currentTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/**
 * Initialise theming at boot: apply the OS preference and keep in sync with it
 * until the user makes an explicit choice (an in-app toggle calls setTheme,
 * which pins the class and stops OS tracking taking visible effect).
 */
export function initTheme(): void {
  // Boot-time apply follows the OS preference but must NOT count as an explicit
  // pin — use applyTheme directly so the listener attached below isn't detached
  // before it even starts tracking.
  applyTheme(currentTheme())

  const mql = window.matchMedia?.('(prefers-color-scheme: light)')
  const handleOsChange = (e: MediaQueryListEvent): void => {
    applyTheme(e.matches ? 'light' : 'dark')
  }
  mql?.addEventListener?.('change', handleOsChange)
  detachOsListener = () => mql?.removeEventListener?.('change', handleOsChange)

  // Runtime theme API — consumed by a future in-app toggle (§0.7) and by E2E.
  ;(window as unknown as { productuneTheme?: unknown }).productuneTheme = {
    setTheme, toggleTheme, currentTheme,
  }
}
