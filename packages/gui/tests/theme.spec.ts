import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

// T-359 regression: launch the real Electron app and drive the theme controller
// (window.productuneTheme.setTheme) between dark and light. Guards that BOTH modes
// render, the surface/text/accent tokens flip, and the single --brand-accent swap
// token fans out to the actual painted button. Screenshots land in test-results/.
const GUI_ROOT = path.resolve(__dirname, '..')

type Snap = {
  brandAccent: string; accent: string; paintedBtnBg: string
  bgSurfaceBase: string; textPrimary: string; borderFocus: string
  personaPo: string; statusInProgress: string; fontFamily: string
}

test('T-359: token layer + accent flip render in BOTH dark and light', async () => {
  const app = await electron.launch({
    args: [path.join(GUI_ROOT, 'dist-electron', 'main.js')],
    cwd: GUI_ROOT,
  })
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
      return win.evaluate(() => {
        void document.documentElement.offsetHeight
        const btn = document.querySelector('button') as HTMLElement | null
        const cs = getComputedStyle(document.documentElement)
        return {
          brandAccent: cs.getPropertyValue('--brand-accent').trim(),
          accent: cs.getPropertyValue('--accent').trim(),
          paintedBtnBg: btn ? getComputedStyle(btn).backgroundColor : '',
          bgSurfaceBase: cs.getPropertyValue('--bg-surface-base').trim(),
          textPrimary: cs.getPropertyValue('--text-primary').trim(),
          borderFocus: cs.getPropertyValue('--border-focus').trim(),
          personaPo: cs.getPropertyValue('--persona-po').trim(),
          statusInProgress: cs.getPropertyValue('--status-in-progress').trim(),
          fontFamily: cs.getPropertyValue('--font-family').trim(),
        }
      })
    }

    const dark = await snap('dark')
    const light = await snap('light')
    console.log('DARK ', JSON.stringify(dark))
    console.log('LIGHT', JSON.stringify(light))

    const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase()

    // Pretendard family active (§0.3).
    expect(dark.fontFamily.toLowerCase()).toContain('pretendard')

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
  }
})
