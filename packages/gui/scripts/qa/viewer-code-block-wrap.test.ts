// T-830: a fenced code block wraps a line longer than the panel instead of
// clipping / scrolling. Rendered check (420px + 1400px, light + dark) is in the
// ticket outcome; this pins the CSS so the wrap cannot regress silently.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_CSS } from '../../viewer/lib/render.mjs'

describe('viewer code block wrap (T-830)', () => {
  const rule = TEMPLATE_CSS.split('\n').find((l: string) => l.startsWith('.v-body pre')) ?? ''
  it('wraps long lines and never scrolls horizontally', () => {
    expect(rule).toContain('white-space: pre-wrap')
    expect(rule).toContain('overflow-wrap: anywhere')
    expect(rule).not.toContain('overflow-x')
  })
})
