// viewer/lib/mermaid.mjs — T-1049 (T-1056 = A): mermaid diagrams in the static viewer.
//
// A diagram is a feature guide's `flow` or a ```mermaid fence in any PRD / wiki /
// ticket body. Both emit the same inert block (`mermaidBlock`): the source as
// readable text inside `<pre class="mm-src" data-mermaid>`. Only when the
// generated page carries such a block does the page also embed mermaid's own
// browser bundle (~3.5 MB) plus a small runtime in ONE inline `<script>`,
// allowed by its content hash in the CSP (never 'unsafe-inline'). A page with no
// diagram is byte-identical to before. Without the `mermaid` package installed,
// or when a diagram fails to parse, the block stays as readable source.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'

/** The open tag every diagram block starts with — the one marker `hasMermaid` looks for. */
export const MM_OPEN = '<pre class="mm-src" data-mermaid>'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The inert, source-readable block for one diagram (what the runtime upgrades to an SVG). */
export function mermaidBlock(source) {
  return `${MM_OPEN}${esc(String(source).replace(/\s+$/, ''))}</pre>`
}

// The detail blob is JSON-embedded with every `<` escaped (render.mjs detailDataScript), so a block
// inside it reads `<pre class=\"mm-src\" data-mermaid>`.
const MM_OPEN_IN_JSON = JSON.stringify(MM_OPEN).slice(1, -1).replace(/</g, '\\u003c')

/** True when any of `parts` (page HTML or the JSON detail script) carries a diagram block. */
export function hasMermaid(...parts) {
  return parts.some((p) => typeof p === 'string' && (p.includes(MM_OPEN) || p.includes(MM_OPEN_IN_JSON)))
}

// Runtime: finds `pre[data-mermaid]` anywhere in the document (the page body or a detail pane an
// interaction just filled in), renders each in turn, and re-renders the drawn ones when the
// light/dark theme flips. A diagram that fails to parse stays as its source text, marked `mm-fail`.
export const MERMAID_RUNTIME = `;(function(){
var m=globalThis.mermaid;if(m&&m.default)m=m.default;if(!m||!m.render)return;
var cur=null,seq=0,queue=Promise.resolve(),pending=false;
function theme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'neutral'}
function init(){var t=theme();if(t!==cur){m.initialize({startOnLoad:false,securityLevel:'strict',theme:t,fontFamily:'inherit',flowchart:{htmlLabels:false}});cur=t}}
function draw(host,src){return queue=queue.then(function(){init();return m.render('mm'+(++seq),src).then(function(r){host.innerHTML=r.svg;host.removeAttribute('data-mm-fail')},function(){host.setAttribute('data-mm-fail','1')})}).catch(function(){})}
function scan(){pending=false;
document.querySelectorAll('pre[data-mermaid]').forEach(function(pre){
var host=document.createElement('div');host.className='mm-fig';host.setAttribute('data-mm-src',pre.textContent);
pre.replaceWith(host);host.textContent=pre.textContent;draw(host,pre.textContent).then(function(){if(host.hasAttribute('data-mm-fail')){var p=document.createElement('pre');p.className='mm-src mm-fail';p.textContent=host.getAttribute('data-mm-src');host.replaceWith(p)}})})}
function later(){if(!pending){pending=true;setTimeout(scan,0)}}
new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
new MutationObserver(function(){document.querySelectorAll('.mm-fig[data-mm-src]').forEach(function(h){draw(h,h.getAttribute('data-mm-src'))})}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
scan()})();`

/**
 * The inline script (mermaid bundle + runtime) and its CSP hash, or null when the `mermaid`
 * package is not installed (the page then shows each diagram as source text).
 */
export function mermaidScript() {
  let bundle
  try {
    const file = createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js')
    bundle = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  // A literal `<script` / `</script` inside inline script text could end or re-open the element.
  if (/<\/?script/i.test(bundle)) return null
  const script = `${bundle}\n${MERMAID_RUNTIME}`
  return { script, sha256: crypto.createHash('sha256').update(script, 'utf8').digest('base64') }
}

export const MERMAID_CSS = `
.mm-fig { display: flex; justify-content: center; margin: var(--space-8) 0 var(--space-12); padding: var(--space-12); border: 1px solid var(--border-item); border-radius: var(--radius-8); background: var(--bg-surface-on); overflow-x: auto; }
.mm-fig svg { max-width: 100%; height: auto; }
.mm-src { margin: var(--space-8) 0 var(--space-12); }
`
