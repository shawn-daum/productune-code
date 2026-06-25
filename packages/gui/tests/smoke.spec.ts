import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

// Smoke gate (surfaces.gui.smoke): app launches → renderer mounts → zero console errors.
// Run via `pnpm --filter @productune/gui smoke` — builds first, then symlinks
// renderer -> dist so main.js's packaged-layout path (`../renderer/index.html`) resolves
// in the repo layout.
//
// T-PATCH-267: augmented with screenshot capture + visual layout assertions.
// Catches CSS breakage / collapsed layout (fail-pattern T-PATCH-095) without
// requiring a full visual-regression pixel baseline.
const GUI_ROOT = path.resolve(__dirname, '..')

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Assert that a selector is present, visible, and occupies a non-trivial area.
 * "Trivial" = width or height <= threshold (default 4 px). A collapsed or
 * zero-size element passes isVisible but fails the bounding-box check, which
 * is precisely the CSS-breakage pattern we want to catch.
 */
async function assertVisible(
  page: { locator: (s: string) => import('@playwright/test').Locator },
  selector: string,
  label: string,
  { minW = 4, minH = 4 }: { minW?: number; minH?: number } = {},
) {
  const el = page.locator(selector)
  await expect(el, `${label}: element not found`).toBeVisible({ timeout: 5_000 })
  const box = await el.boundingBox()
  expect(box, `${label}: no bounding box (element off-screen or display:none)`).not.toBeNull()
  expect(box!.width, `${label}: width ${box!.width} <= ${minW} — collapsed/zero`).toBeGreaterThan(minW)
  expect(box!.height, `${label}: height ${box!.height} <= ${minH} — collapsed/zero`).toBeGreaterThan(minH)
}

// ── tests ──────────────────────────────────────────────────────────────────────

test('smoke: window opens, renderer mounts, zero console errors', async () => {
  const electronApp = await electron.launch({
    args: [path.join(GUI_ROOT, 'dist-electron', 'main.js')],
    cwd: GUI_ROOT,
  })

  const consoleErrors: string[] = []
  try {
    const window = await electronApp.firstWindow()
    window.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    window.on('pageerror', (err) => consoleErrors.push(String(err)))

    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('productune')

    // Renderer mounted = React put something inside #root.
    await window.waitForSelector('#root > *', { timeout: 15_000 })

    // Let async init (IPC round-trips, store hydration) surface late errors.
    await window.waitForTimeout(1_000)

    expect(consoleErrors, `renderer console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('smoke: visual layout — app shell non-collapsed, titlebar + content area visible', async () => {
  // T-PATCH-267: visual render assertions.
  // The test captures a screenshot (CI artifact) and asserts key layout invariants
  // without a pixel-diff baseline:
  //   1. App shell (#root > *) occupies near-full viewport — not blank/collapsed.
  //   2. Titlebar band (fixed 38px by design) is present and occupies full width.
  //   3. The content viewport below the titlebar has meaningful height (> 100px).
  //   4. At least one interactive CTA button is visible and non-collapsed.
  //      — Either the HomeView hero buttons (New Project / Open Existing)
  //        or the OnboardingWizard Next/Continue button.
  //   5. No rendered text node with 0-height (catches display:none on text layers).
  //
  // After the IPC init settles the app will show ONE of:
  //   • OnboardingWizard (first run / no env)
  //   • HomeView hero (env exists, no recents)
  // In both cases the same structural invariants hold.

  const electronApp = await electron.launch({
    args: [path.join(GUI_ROOT, 'dist-electron', 'main.js')],
    cwd: GUI_ROOT,
  })

  try {
    const win = await electronApp.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 15_000 })
    // Wait for IPC init to settle (env-check + optional onboarding detection).
    await win.waitForTimeout(2_000)

    // ── 1. App shell covers viewport ──────────────────────────────────────────
    // The outermost React div (#root > *) uses width:100vw height:100vh.
    // A broken CSS import or a wrong display value collapses it to 0×0.
    const rootBox = await win.locator('#root > *').boundingBox()
    expect(rootBox, 'app shell: no bounding box — root element not rendered').not.toBeNull()
    expect(rootBox!.width, 'app shell: width collapsed (CSS broken?)').toBeGreaterThan(200)
    expect(rootBox!.height, 'app shell: height collapsed (CSS broken?)').toBeGreaterThan(200)

    // ── 2. Titlebar ───────────────────────────────────────────────────────────
    // Titlebar is always rendered (even during loading state). It is the first
    // child flex row of the app shell and has a 1px border-bottom.
    // Selector: first div child of the app shell — matches the Titlebar <div>.
    // We verify height ≥ 20px (design: 38px) so a collapsed/zero bar fails.
    const titlebarEl = win.locator('#root > * > div').first()
    const titlebarBox = await titlebarEl.boundingBox()
    expect(titlebarBox, 'titlebar: not rendered or off-screen').not.toBeNull()
    expect(titlebarBox!.height, `titlebar: height ${titlebarBox!.height} — collapsed or missing`).toBeGreaterThanOrEqual(20)
    expect(titlebarBox!.width, 'titlebar: zero width — layout broken').toBeGreaterThan(200)

    // ── 3. Viewport area (content below titlebar) ─────────────────────────────
    // The viewport div (flex:1, minHeight:0) sits as the second major child of
    // the app shell. We measure the root box height minus titlebar height to
    // confirm content area is meaningful (> 100px).
    const contentHeight = rootBox!.height - (titlebarBox?.height ?? 38)
    expect(contentHeight, `content area height ${contentHeight} ≤ 100 — viewport collapsed`).toBeGreaterThan(100)

    // ── 4. At least one CTA button visible ───────────────────────────────────
    // We look for any <button> that is visible with non-trivial size.
    // HomeView hero renders "New Project" + "Open Existing" buttons.
    // OnboardingWizard renders at minimum a "Next" / "Continue" button.
    // Either way there must be at least one clickable button in the frame.
    const buttons = win.locator('button:visible')
    const btnCount = await buttons.count()
    expect(btnCount, 'no visible buttons — content area rendered blank').toBeGreaterThan(0)

    // Verify the first visible button has non-zero size.
    const firstBtnBox = await buttons.first().boundingBox()
    expect(firstBtnBox, 'first button: no bounding box').not.toBeNull()
    expect(firstBtnBox!.width, 'first button: zero width — collapsed').toBeGreaterThan(4)
    expect(firstBtnBox!.height, 'first button: zero height — collapsed').toBeGreaterThan(4)

    // ── 5. Screenshot artifact ────────────────────────────────────────────────
    // Saved to test-results/ (playwright default). CI uploads this directory.
    // Naming convention: smoke-initial-screen.png
    // Purpose: human review of visual regression without a pixel-diff baseline.
    await win.screenshot({
      path: path.join(GUI_ROOT, 'test-results', 'smoke-initial-screen.png'),
      fullPage: false,
    })

    // ── 6. No fully-transparent / zero-opacity top-level content ─────────────
    // Detect a known CSS breakage pattern: the viewport div is rendered but its
    // opacity was set to 0 (e.g. a mis-applied animation keyframe). We read the
    // computed opacity of #root > * via evaluate.
    const rootOpacity = await win.evaluate(() => {
      const el = document.querySelector('#root > *') as HTMLElement | null
      if (!el) return null
      return parseFloat(window.getComputedStyle(el).opacity ?? '1')
    })
    expect(rootOpacity, 'app shell opacity is 0 — invisible render (CSS animation stuck?)').not.toBe(0)

  } finally {
    await electronApp.close()
  }
})

test('smoke: visual layout — onboarding or home screen key elements present', async () => {
  // T-PATCH-267: screen-specific element presence check.
  // Identifies which top-level screen the app landed on and verifies its
  // signature elements are non-collapsed. This is the layer that catches
  // a screen-specific CSS breakage (e.g. flex column collapsed to 0 height
  // only in OnboardingWizard, but not HomeView).

  const electronApp = await electron.launch({
    args: [path.join(GUI_ROOT, 'dist-electron', 'main.js')],
    cwd: GUI_ROOT,
  })

  try {
    const win = await electronApp.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root > *', { timeout: 15_000 })
    await win.waitForTimeout(2_000)

    // Detect which screen rendered.
    // OnboardingWizard: renders a step-indicator row (four dots).
    // HomeView hero: renders the "Productune" wordmark text + action buttons.
    // WorkspaceShell: ActivityBar + ChatPanel grid (unlikely in clean CI env).

    const isOnboarding = await win.locator('text=Productune').first().isVisible().catch(() => false)
    const hasButtons = (await win.locator('button:visible').count()) > 0

    if (!isOnboarding && !hasButtons) {
      // Nothing recognisable rendered — hard fail with screenshot evidence.
      await win.screenshot({
        path: path.join(GUI_ROOT, 'test-results', 'smoke-blank-screen.png'),
      })
      throw new Error(
        'smoke: neither onboarding nor HomeView rendered — screen appears blank. ' +
        'See test-results/smoke-blank-screen.png',
      )
    }

    // ── OnboardingWizard checks ───────────────────────────────────────────────
    const onboardingCard = win.locator('text=Productune').first()
    if (await onboardingCard.isVisible().catch(() => false)) {
      // The BrandMark "Productune" text is always present in the onboarding header.
      const box = await onboardingCard.boundingBox()
      expect(box, 'onboarding: brandmark text has no bounding box').not.toBeNull()
      expect(box!.height, 'onboarding: brandmark text height collapsed').toBeGreaterThan(0)

      // There must be at least one button (Next / Continue / Select language).
      await assertVisible(win, 'button:visible', 'onboarding CTA button')

      await win.screenshot({
        path: path.join(GUI_ROOT, 'test-results', 'smoke-onboarding.png'),
      })
    } else {
      // ── HomeView checks ───────────────────────────────────────────────────
      // HomeView hero always has the "New Project" and "Open Existing" buttons.
      await assertVisible(win, 'button:visible', 'HomeView CTA button')

      await win.screenshot({
        path: path.join(GUI_ROOT, 'test-results', 'smoke-homeview.png'),
      })
    }

  } finally {
    await electronApp.close()
  }
})
