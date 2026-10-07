// T-1010: an HTML artifact opens rendered in the side panel (sandboxed iframe) with a
// 「새 탭에서 열기」 link. Vitest cannot launch a browser (isolation rule 6): this file checks
// the generated page's data, script, and CSP; the rendered click-through is
// `tests/viewer-artifact-frame.window.spec.ts` (@window).
import { describe, it, expect } from 'vitest'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { FRAME, FILE_HREF_NOTE } from '@productune/viewer/lib/labels.mjs'

const entry = (p: string, extra: object = {}) => ({
  fields: { bucket: 'v1.10', path: p, kind: p.split('.').pop(), status: 'approved' },
  diskRel: `docs/artifacts/v1.10/${p}`,
  inlined: false,
  ...extra,
})
const data = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [entry('mock.html', { bytes: 10 }), entry('gone.html'), entry('data.json', { bytes: 3 }), entry('note.md', { inlined: true, body: '# hi', bytes: 4 })] },
}
const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const detail = JSON.parse(html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)![1])

describe('artifact HTML in the side panel (T-1010)', () => {
  it('only an existing .html artifact is framed', () => {
    const a = detail.artifact
    expect(a['v1.10/mock.html'].frame).toBe(true)
    expect(a['v1.10/gone.html'].frame).toBeUndefined() // missing file -> fallback note
    expect(a['v1.10/data.json'].frame).toBeUndefined()
    expect(a['v1.10/note.md'].frame).toBeUndefined()
  })
  it('the panel script builds a sandboxed iframe without allow-same-origin and the new-tab link', () => {
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toMatch(/sandbox="[^"]*allow-same-origin/)
    expect(html).not.toMatch(/sandbox="[^"]*allow-top-navigation/)
    expect(html).toContain(FRAME.openInNewTab)
    expect(html).toContain(FILE_HREF_NOTE) // fallback still there
  })
  it('CSP allows frames from file: only', () => {
    expect(html).toMatch(/frame-src file:(;|")/)
  })
})
