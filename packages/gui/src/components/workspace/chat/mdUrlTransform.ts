/**
 * mdUrlTransform — T-345 QA FAIL rework
 *
 * Custom `urlTransform` for the chat <ReactMarkdown> (MdRenderer). Without
 * one, react-markdown 9.x applies `defaultUrlTransform`, whose scheme
 * whitelist (http/https/mailto/irc/ircs/xmpp) rewrites every app-internal
 * href to "" — killing ALL `ptn:ticket/`, `ptn:file/`, `ptn:doctrine/`
 * routing links app-wide, plus bare `file://` hrefs from verbatim-preserved
 * explicit markdown links (QA live-verified: clicks silently no-op because
 * MdLink guards on `if (href)`).
 *
 * Contract:
 *   - `ptn:`  — pass through unchanged. Internal routing tag consumed by
 *     routeLink; MdLink always preventDefault()s, so it never navigates.
 *   - `file:` — pass through unchanged. Routed by routeAbsPath/routeLink
 *     (browser-preview tab / doctrine tab / markdown viewer), also never
 *     natively navigated.
 *   - everything else — delegate to react-markdown's own
 *     `defaultUrlTransform`, so the XSS posture for foreign schemes
 *     (javascript:, data:, vbscript:, …) is byte-identical to the library
 *     default. A blanket allow-all transform is forbidden here — it would
 *     reintroduce the javascript: XSS the default exists to block.
 *
 * Scheme match is case-insensitive (`JavaScript:` must not slip past a
 * lowercase-only prefix check into an allow branch — it doesn't reach one
 * here, but the ptn/file checks themselves are case-normalized for symmetry
 * with how browsers treat schemes).
 */

import { defaultUrlTransform } from 'react-markdown'

export function mdUrlTransform(url: string): string {
  const scheme = url.slice(0, url.indexOf(':') + 1).toLowerCase()
  if (scheme === 'ptn:' || scheme === 'file:') return url
  return defaultUrlTransform(url)
}
