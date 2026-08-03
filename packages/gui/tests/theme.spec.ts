import path from 'path'
import { test, expect } from '@playwright/test'
import { GUI_ROOT, cleanupHome, launchApp, sandboxHome } from './harness'

// T-359 regression: launch the real Electron app and drive the theme controller
// (window.productuneTheme.setTheme) between dark and light. Guards that BOTH modes
// render, the surface/text/accent tokens flip, and the single --brand-accent swap
// token fans out to the actual painted button. Screenshots land in test-results/.
//
// T-442 F1/F6: both tests now boot into a throwaway sandbox home. They used to
// run against the developer's REAL home, which meant the screen under test was
// whatever that machine's state produced — see the T-359 test below for what
// that hid.

/**
 * The wizard's primary CTA, in either locale.
 *
 * T-442 F-B: this used to be `/^(Next|다음)\b/`. JavaScript's `\b` is a
 * boundary between `[A-Za-z0-9_]` and anything else, so after a Hangul
 * syllable there is no boundary to find and the Korean branch could NEVER
 * match — '다음' → false, '다음 단계' → false (QA-measured). It was dead code
 * today only because `src/i18n.ts` hardcodes `lng: 'en'` and `sandboxHome()`
 * seeds nothing; the first spec to seed
 * `~/.productune/settings.json {ui:{language:'ko'}}` — the pattern
 * `fact--gui-testing-env` documents — would have failed on the locator and
 * been read as a product defect.
 *
 * The `\b` is kept for the ASCII branch, where it does the intended job of
 * rejecting 'Nextcloud'; the Hangul branch needs no separator rule because
 * '다음' is not a prefix of an unrelated label in this UI.
 */
const CTA_LABEL_RE = /^(?:Next\b|다음)/u

type Snap = {
  brandAccent: string; accent: string; paintedBtnBg: string
  ctaLabel: string; ghostBtnBg: string; buttonCount: number
  bgSurfaceBase: string; textPrimary: string; borderFocus: string
  personaPo: string; statusInProgress: string; fontFamily: string
}

test('T-359: token layer + accent flip render in BOTH dark and light', async () => {
  const home = sandboxHome('theme-t359')
  const app = await launchApp({ home })
  try {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 15_000 })
    await win.waitForTimeout(1200)

    const snap = async (mode: 'dark' | 'light'): Promise<Snap> => {
      await win.evaluate((m) => {
        ;(window as any).productuneTheme.setTheme(m)
        void document.documentElement.offsetHeight
      }, mode)
      await win.waitForTimeout(250)
      await win.screenshot({ path: path.join(GUI_ROOT, 'test-results', `t359-${mode}.png`) })
      // The matcher crosses into the page context, so it travels as a source
      // string — a RegExp cannot be serialised through evaluate(). Passing
      // CTA_LABEL_RE.source keeps one definition for both sides.
      return win.evaluate((ctaSource: string) => {
        const ctaRe = new RegExp(ctaSource, 'u')
        void document.documentElement.offsetHeight
        // T-442 F6 — this used to be `document.querySelector('button')`, i.e.
        // whatever button happened to come FIRST in the DOM. That is only the
        // accent-painted CTA on some screens, and which screen the app lands on
        // depends entirely on the HOME it boots against. It passed because it
        // ran against the developer's real home; the moment the spec was
        // sandboxed it read the wizard's `btnReset` ghost button
        // (background: transparent → rgba(0,0,0,0)) and failed.
        //
        // The product is fine. Select the button the design system actually
        // paints with var(--accent) — the wizard footer's primary CTA — and
        // keep the ghost button's paint alongside it, so a locator that ever
        // drifts back onto the wrong element fails loudly instead of silently
        // asserting something vacuous.
        const buttons = Array.from(document.querySelectorAll('button')) as HTMLElement[]
        const cta = buttons.find((b) => ctaRe.test((b.textContent ?? '').trim())) ?? null
        const ghost = buttons.find((b) => /Reset|초기화/.test((b.textContent ?? '').trim())) ?? null
        const cs = getComputedStyle(document.documentElement)
        return {
          brandAccent: cs.getPropertyValue('--brand-accent').trim(),
          accent: cs.getPropertyValue('--accent').trim(),
          paintedBtnBg: cta ? getComputedStyle(cta).backgroundColor : '',
          ctaLabel: cta ? (cta.textContent ?? '').trim() : '',
          ghostBtnBg: ghost ? getComputedStyle(ghost).backgroundColor : '',
          buttonCount: buttons.length,
          bgSurfaceBase: cs.getPropertyValue('--bg-surface-base').trim(),
          textPrimary: cs.getPropertyValue('--text-primary').trim(),
          borderFocus: cs.getPropertyValue('--border-focus').trim(),
          personaPo: cs.getPropertyValue('--persona-po').trim(),
          statusInProgress: cs.getPropertyValue('--status-in-progress').trim(),
          fontFamily: cs.getPropertyValue('--font-family').trim(),
        }
      }, CTA_LABEL_RE.source)
    }

    const dark = await snap('dark')
    const light = await snap('light')
    console.log('DARK ', JSON.stringify(dark))
    console.log('LIGHT', JSON.stringify(light))

    const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase()

    // Pretendard family active (§0.3).
    expect(dark.fontFamily.toLowerCase()).toContain('pretendard')

    // The CTA the accent assertions below hang on was actually found, and is a
    // genuinely painted element — without this the `toBe` could pass vacuously
    // on two empty strings if the locator ever stopped matching.
    for (const s of [dark, light]) {
      expect(s.buttonCount, 'no buttons rendered — wrong screen?').toBeGreaterThan(1)
      expect(s.ctaLabel, 'primary CTA not found on screen').toMatch(CTA_LABEL_RE)
      expect(s.paintedBtnBg, 'primary CTA is unpainted').not.toBe('rgba(0, 0, 0, 0)')
    }
    // …and the ghost button next to it is genuinely transparent. This is the
    // element the pre-T-442 selector was reading; asserting it here documents
    // that the old failure was a bad selector, not a broken token.
    expect(dark.ghostBtnBg, 'the reset button is a ghost by design').toBe('rgba(0, 0, 0, 0)')

    // Single-swap fan-out: accent + focus + persona-po + in-progress all track the
    // brand primitive, in BOTH modes, down to the painted button.
    for (const s of [dark, light]) {
      expect(norm(s.accent)).toBe(norm(s.brandAccent))
      expect(norm(s.borderFocus)).toBe(norm(s.brandAccent))
      expect(norm(s.personaPo)).toBe(norm(s.brandAccent))
      expect(norm(s.statusInProgress)).toBe(norm(s.brandAccent))
      expect(norm(s.paintedBtnBg)).toBe(norm(s.brandAccent))
    }

    // Everything actually FLIPS between modes.
    expect(norm(dark.brandAccent)).not.toBe(norm(light.brandAccent))       // accent flipped
    expect(norm(dark.paintedBtnBg)).not.toBe(norm(light.paintedBtnBg))     // painted accent flipped
    expect(dark.bgSurfaceBase).not.toBe(light.bgSurfaceBase)               // surface flipped
    expect(dark.textPrimary).not.toBe(light.textPrimary)                   // text flipped
  } finally {
    await app.close()
    cleanupHome(home)
  }
})

// T-417 #1 regression: the T-359 test above reads only :root primitives (--bg-*,
// --text-primary) which always flipped — it MISSED that md-recipes.css's global
// :root shadowed the LEGACY ALIASES the actual components consume (--surface-*,
// --text-emphasis/-muted/-faint, --border-*) with fixed dark hex, so those stayed
// dark in light mode (dark-on-dark panels/text). This test proves, on the REAL
// rendered app, that (a) the aliases flip, and (b) a real element painted with the
// md recipes the affected components use (e.g. .md-code-inline: bg --surface-subpanel
// / color --text-primary, and a panel painted --surface-panel/--text-emphasis)
// computes LIGHT surface + DARK text in light mode — not just a :root variable read.
test('T-417: legacy-alias surfaces render LIGHT (real element, not just :root)', async () => {
  const home = sandboxHome('theme-t417')
  const app = await launchApp({ home })
  try {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 15_000 })
    await win.waitForTimeout(1000)

    // Relative luminance (0=black … 1=white) from a computed "rgb(a)(r, g, b …)".
    const lum = (rgb: string): number => {
      const m = rgb.match(/\d+(\.\d+)?/g)
      if (!m || m.length < 3) return NaN
      const [r, g, b] = m.slice(0, 3).map(Number)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }

    type Probe = {
      // :root-computed aliases (the shadowed set the components use)
      surfacePanel: string; surfaceSubpanel: string
      textEmphasis: string; textMuted: string; textFaint: string
      borderDefault: string; borderStrong: string
      // real rendered elements' computed paint
      inlineCodeBg: string; inlineCodeColor: string
      panelBg: string; panelText: string
    }

    const probe = async (mode: 'dark' | 'light'): Promise<Probe> => {
      const out = await win.evaluate((m) => {
        ;(window as any).productuneTheme.setTheme(m)
        void document.documentElement.offsetHeight
        // A real chat-style inline-code node (NOT under .md-doc → reads the global
        // aliases, exactly the path that was stuck dark) + a panel-style card.
        const wrap = document.createElement('div')
        wrap.id = '__t417_probe__'
        const code = document.createElement('code')
        code.className = 'md-code-inline'
        code.textContent = 'probe'
        const panel = document.createElement('div')
        panel.style.background = 'var(--surface-panel)'
        panel.style.color = 'var(--text-emphasis)'
        panel.textContent = 'panel'
        wrap.appendChild(code)
        wrap.appendChild(panel)
        document.body.appendChild(wrap)
        void document.documentElement.offsetHeight
        const cs = getComputedStyle(document.documentElement)
        const csCode = getComputedStyle(code)
        const csPanel = getComputedStyle(panel)
        const r = {
          surfacePanel: cs.getPropertyValue('--surface-panel').trim(),
          surfaceSubpanel: cs.getPropertyValue('--surface-subpanel').trim(),
          textEmphasis: cs.getPropertyValue('--text-emphasis').trim(),
          textMuted: cs.getPropertyValue('--text-muted').trim(),
          textFaint: cs.getPropertyValue('--text-faint').trim(),
          borderDefault: cs.getPropertyValue('--border-default').trim(),
          borderStrong: cs.getPropertyValue('--border-strong').trim(),
          inlineCodeBg: csCode.backgroundColor,
          inlineCodeColor: csCode.color,
          panelBg: csPanel.backgroundColor,
          panelText: csPanel.color,
        }
        wrap.remove()
        return r
      }, mode)
      await win.waitForTimeout(150)
      await win.screenshot({ path: path.join(GUI_ROOT, 'test-results', `t417-${mode}.png`) })
      return out
    }

    const dark = await probe('dark')
    const light = await probe('light')
    console.log('T417 DARK ', JSON.stringify(dark))
    console.log('T417 LIGHT', JSON.stringify(light))

    // (a) every shadowed alias actually FLIPS between modes (before the fix these
    //     were frozen on md-recipes' dark hex regardless of mode).
    for (const k of ['surfacePanel','surfaceSubpanel','textEmphasis','textMuted','textFaint','borderDefault','borderStrong'] as const) {
      expect(dark[k], `alias --${k} must be non-empty`).toBeTruthy()
      expect(light[k], `alias --${k} must flip between modes`).not.toBe(dark[k])
    }

    // (b) REAL rendered elements: light mode = LIGHT surface + DARK text (no dark
    //     panels, no invisible/low-contrast text); dark mode = the inverse.
    expect(lum(light.panelBg), 'light panel bg must be light').toBeGreaterThan(0.6)
    expect(lum(light.panelText), 'light panel text must be dark').toBeLessThan(0.4)
    expect(lum(light.inlineCodeBg), 'light inline-code bg must be light').toBeGreaterThan(0.6)
    expect(lum(light.inlineCodeColor), 'light inline-code text must be dark').toBeLessThan(0.4)

    expect(lum(dark.panelBg), 'dark panel bg must be dark').toBeLessThan(0.4)
    expect(lum(dark.panelText), 'dark panel text must be light').toBeGreaterThan(0.6)
    expect(lum(dark.inlineCodeBg), 'dark inline-code bg must be dark').toBeLessThan(0.4)
    expect(lum(dark.inlineCodeColor), 'dark inline-code text must be light').toBeGreaterThan(0.6)
  } finally {
    await app.close()
    cleanupHome(home)
  }
})
