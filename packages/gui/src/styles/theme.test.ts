/**
 * theme.test.ts — T-419 regression: explicit setTheme() pin must detach the
 * prefers-color-scheme listener installed by initTheme(), so a later OS theme
 * change can no longer silently override the user's choice.
 *
 * Before the fix, initTheme() attached the media-query listener permanently:
 * ANY subsequent OS change re-ran setTheme() unconditionally, clobbering an
 * explicit pin — contradicting the initTheme() doc comment ("an in-app toggle
 * calls setTheme, which pins the class and stops OS tracking taking visible
 * effect").
 *
 * This package has no jsdom dependency (vitest.config.ts runs unit tests under
 * the `node` environment — see setup comment there), so theme.ts's `document`/
 * `window` globals are hand-stubbed here with the minimum surface the module
 * touches: classList add/remove/contains, style.setProperty, offsetHeight, and
 * a fake MediaQueryList whose listener set we can inspect/dispatch directly —
 * enough to observe attach/detach without a real DOM.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

type ChangeHandler = (e: { matches: boolean }) => void

class FakeClassList {
  private classes = new Set<string>()
  add(...names: string[]): void {
    names.forEach((n) => this.classes.add(n))
  }
  remove(...names: string[]): void {
    names.forEach((n) => this.classes.delete(n))
  }
  contains(name: string): boolean {
    return this.classes.has(name)
  }
}

class FakeMediaQueryList {
  matches: boolean
  private listeners = new Set<ChangeHandler>()
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener(_type: 'change', cb: ChangeHandler): void {
    this.listeners.add(cb)
  }
  removeEventListener(_type: 'change', cb: ChangeHandler): void {
    this.listeners.delete(cb)
  }
  get listenerCount(): number {
    return this.listeners.size
  }
  /** Simulate the OS flipping its preference. */
  dispatch(matches: boolean): void {
    this.matches = matches
    // Snapshot before iterating: a listener could remove itself mid-dispatch.
    for (const cb of [...this.listeners]) cb({ matches })
  }
}

describe('T-419: setTheme pin detaches the OS prefers-color-scheme listener', () => {
  let root: { classList: FakeClassList; style: { setProperty: ReturnType<typeof vi.fn> }; offsetHeight: number }
  let mql: FakeMediaQueryList

  beforeEach(() => {
    vi.resetModules()
    root = { classList: new FakeClassList(), style: { setProperty: vi.fn() }, offsetHeight: 0 }
    mql = new FakeMediaQueryList(/* prefers light */ false)

    ;(globalThis as unknown as { document: unknown }).document = {
      documentElement: root,
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      matchMedia: (_q: string) => mql,
    }
    ;(globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({
      getPropertyValue: (_prop: string) => '#8B5CF6',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as { document?: unknown }).document
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle
  })

  test('auto mode: OS change applies while no explicit pin has happened', async () => {
    const { initTheme, currentTheme } = await import('./theme')
    initTheme()
    expect(mql.listenerCount).toBe(1)

    mql.dispatch(true) // OS -> light
    expect(currentTheme()).toBe('light')

    mql.dispatch(false) // OS -> dark
    expect(currentTheme()).toBe('dark')
  })

  test('explicit setTheme() detaches the listener; further OS changes are ignored', async () => {
    const { initTheme, setTheme, currentTheme } = await import('./theme')
    initTheme()
    expect(mql.listenerCount).toBe(1)

    setTheme('light') // explicit user pin
    expect(currentTheme()).toBe('light')
    expect(mql.listenerCount).toBe(0) // listener detached, not just ignored internally

    // An OS change after the pin must NOT flip the app theme back.
    mql.dispatch(true) // OS -> light (no-op, no listener left)
    mql.dispatch(false) // OS -> dark
    expect(currentTheme()).toBe('light')
  })

  test('toggleTheme() is an explicit action too and also detaches the listener', async () => {
    const { initTheme, toggleTheme, currentTheme } = await import('./theme')
    initTheme() // boots to dark (mql.matches = false)
    expect(currentTheme()).toBe('dark')

    toggleTheme()
    expect(currentTheme()).toBe('light')
    expect(mql.listenerCount).toBe(0)

    mql.dispatch(false) // OS -> dark, must not override the pin
    expect(currentTheme()).toBe('light')
  })

  test('the boot-time initTheme() apply itself is not a pin', async () => {
    const { initTheme } = await import('./theme')
    initTheme()
    // If the initial applyTheme(currentTheme()) call inside initTheme were
    // routed through the pinning setTheme(), the listener attached two lines
    // later would already be a no-op detach target — this asserts it isn't.
    expect(mql.listenerCount).toBe(1)
  })
})
