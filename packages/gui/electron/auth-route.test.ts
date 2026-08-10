/**
 * auth-route.test.ts — T-434
 *
 * The ticket's Acceptance asks for a per-variant report. These are those
 * variants, mechanically:
 *
 *   (1) PO-flagged auth URL              → system browser
 *   (2) plain doc / deployed-site URL    → internal pane
 *   (3) unflagged URL on the IdP net     → system browser
 *   (4) misroute → escape hatch          → UI; pinned in escapeHatch.test.tsx.
 *       What this file pins for (4) is the precondition: the URL handed to a
 *       pane is byte-identical to the input, so the pane's escape hatch has the
 *       real URL to hand out.
 *
 * `dispatchUrl` is tested with injected sinks so "the system browser was
 * actually called" is an assertion, not a claim (doctrine #4).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  routeUrl,
  dispatchUrl,
  matchAuthEndpoint,
  isLoopbackHost,
  matchesPathPrefix,
  containsPathSegment,
  IDP_RULES,
  AUTH_PATH_PREFIXES,
  AUTH_PATH_CONTAINS,
  type RouteSinks,
} from './auth-route'

function sinks(): RouteSinks & { external: string[]; internal: string[] } {
  const external: string[] = []
  const internal: string[] = []
  return {
    external,
    internal,
    openExternal: (u) => external.push(u),
    openInternalPane: (u) => internal.push(u),
  }
}

// ── Variant (1) — tier ①, producer intent ────────────────────────────────────

describe('variant 1 — PO-flagged auth URL opens in the system browser', () => {
  it('the flag wins over a URL that would otherwise stay internal', () => {
    // A perfectly ordinary URL: no IdP host, no auth path. Only the flag moves it.
    const url = 'https://console.acme-corp.example/projects/42'
    expect(routeUrl(url).target).toBe('internal-pane')
    expect(routeUrl(url, { authIntent: true })).toEqual({
      target: 'system-browser',
      reason: 'producer-intent',
    })
  })

  it('the flag actually reaches shell.openExternal — not the pane', () => {
    const s = sinks()
    dispatchUrl('https://console.acme-corp.example/login-ish', { authIntent: true }, s)
    expect(s.external).toEqual(['https://console.acme-corp.example/login-ish'])
    expect(s.internal).toEqual([])
  })

  it('an absent or false flag does NOT disarm the tier-② net', () => {
    // shawn's premise: the net is a safety net. A producer that forgets — or is
    // wrong — must not be able to pin an IdP login inside the app, because the
    // embedded view cannot complete it at all.
    const gh = 'https://github.com/login'
    expect(routeUrl(gh).target).toBe('system-browser')
    expect(routeUrl(gh, { authIntent: false }).target).toBe('system-browser')
  })
})

// ── Variant (2) — tier ③ default, unauthenticated reading stays in-app ───────

describe('variant 2 — plain doc / deployed-site URLs open in the internal pane', () => {
  const internalCases: readonly string[] = [
    // Docs
    'https://docs.anthropic.com/en/docs/claude-code/hooks',
    'https://react.dev/reference/react',
    // A deployed participant site (the thing the journey is FOR)
    'https://enneagram-mentor.vercel.app/',
    'https://my-product.vercel.app/pricing?ref=chat',
    // GitHub READABLE surfaces — the reason github.com is a path-scoped rule and
    // not a whole-host rule. A whole-host rule would bounce every repo link out
    // of the app and empty the internal pane of its most common content.
    'https://github.com/shawn-kim-axz/productune',
    'https://github.com/shawn-kim-axz/productune/blob/main/README.md',
    'https://github.com/shawn-kim-axz/productune/issues/12',
    'https://github.com/settings/tokens',
    // Vercel readable surfaces
    'https://vercel.com/docs/functions',
    'https://vercel.com/shawn/productune/deployments',
  ]

  for (const url of internalCases) {
    it(`stays internal: ${url}`, () => {
      const d = routeUrl(url)
      expect(d.target).toBe('internal-pane')
      expect(d.reason).toBe('default-internal')
    })
  }

  it('reaches the pane sink, never the OS', () => {
    const s = sinks()
    dispatchUrl('https://enneagram-mentor.vercel.app/', {}, s)
    expect(s.internal).toEqual(['https://enneagram-mentor.vercel.app/'])
    expect(s.external).toEqual([])
  })
})

// ── Variant (3) — tier ②, the IdP safety net on an UNFLAGGED URL ─────────────

describe('variant 3 — unflagged URL matching the IdP net opens in the system browser', () => {
  const netCases: ReadonlyArray<readonly [string, string]> = [
    // R-34 itself: GitHub login (passkey / WebAuthn — impossible in a webview).
    ['https://github.com/login', 'github.com/login'],
    ['https://github.com/login?return_to=%2Fshawn%2Frepo', 'github.com/login'],
    ['https://github.com/login/oauth/authorize?client_id=x', 'github.com/login/oauth/authorize'],
    ['https://github.com/login/device', 'github.com/login/device'],
    ['https://github.com/sessions/two-factor/app', 'github.com/sessions/two-factor/app'],
    // Dedicated auth hosts — whole host
    ['https://accounts.google.com/o/oauth2/v2/auth?scope=email', 'accounts.google.com'],
    ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'login.microsoftonline.com'],
    ['https://appleid.apple.com/auth/authorize', 'appleid.apple.com'],
    ['https://nid.naver.com/nidlogin.login', 'nid.naver.com'],
    ['https://kauth.kakao.com/oauth/authorize?client_id=x', 'kauth.kakao.com'],
    // Subdomain wildcards
    ['https://acme.okta.com/oauth2/default/v1/authorize', 'okta.com'],
    ['https://acme.eu.auth0.com/authorize?client_id=x', 'auth0.com'],
    // Path-scoped mixed hosts
    ['https://vercel.com/login', 'vercel.com/login'],
    ['https://gitlab.com/users/sign_in', 'gitlab.com/users/sign_in'],
    ['https://www.figma.com/login', 'figma.com/login'],
    // The host-agnostic sub-net: an IdP nobody put on the list.
    ['https://sso.internal.example.com/oauth/authorize?client_id=x', 'path:/oauth/authorize'],
    ['https://keycloak.example.com/realms/r/protocol/openid-connect/auth', 'path:/protocol/openid-connect/auth'],
  ]

  for (const [url, matched] of netCases) {
    it(`routes out: ${url}`, () => {
      const d = routeUrl(url)
      expect(d.target).toBe('system-browser')
      expect(d.reason).toBe('idp-allowlist')
      expect(d.matched).toBe(matched)
    })
  }

  it('every rule in IDP_RULES is reachable by matchAuthEndpoint', () => {
    // A rule that can never match is a rule that lied in review.
    for (const rule of IDP_RULES) {
      const host = rule.subdomains ? `tenant.${rule.host}` : rule.host
      const pathname = rule.paths ? rule.paths[0] : '/'
      const probe = new URL(`https://${host}${pathname}`)
      expect(matchAuthEndpoint(probe), `unreachable rule: ${rule.host}`).not.toBeNull()
    }
  })
})

// ── F3 — the net matches path SEGMENTS, not bare prefixes ───────────────────
//
// QA finding F3 (nuisance, no stranding): a bare `startsWith` sent every path
// that merely SPELLS a rule's prefix to the system browser. Safe direction,
// real cost — an org named `login-tools` or `sessionize` lost the app on every
// single link. The cases below are QA's, by name.

describe('F3 — a prefix that is not a whole path segment does not leave the app', () => {
  const overTriggers: readonly string[] = [
    // github.com rule `/login` — these are user/org account pages, not logins.
    'https://github.com/loginsomething',
    'https://github.com/loginsomething/some-repo',
    'https://github.com/login-tools',
    'https://github.com/login-tools/cli/blob/main/README.md',
    // github.com rule `/session` / `/sessions`
    'https://github.com/sessionize',
    'https://github.com/sessionize/schedule',
    // github.com rule `/signin`
    'https://github.com/signin-widget/repo',
    // AUTH_PATH_PREFIXES `/authorize` — ordinary product copy on any host.
    'https://example.com/authorized-users',
    'https://example.com/authorization',
    // AUTH_PATH_PREFIXES `/oauth/authorize`
    'https://example.com/oauth/authorized-apps',
    // vercel.com rule `/signup`
    'https://vercel.com/signups-are-open',
  ]

  for (const url of overTriggers) {
    it(`stays internal: ${url}`, () => {
      const d = routeUrl(url)
      expect(d.target).toBe('internal-pane')
      expect(d.reason).toBe('default-internal')
    })
  }

  it('the real auth endpoints still leave — R-34 first', () => {
    // The whole point of the boundary is that it costs the net NOTHING. If any
    // of these regressed, the participant is back to a passkey prompt inside a
    // webview that cannot serve it.
    const stillOut: ReadonlyArray<readonly [string, string]> = [
      ['https://github.com/login', 'github.com/login'],
      ['https://github.com/login/', 'github.com/login/'],
      ['https://github.com/login?return_to=%2Fshawn%2Frepo', 'github.com/login'],
      ['https://github.com/login#frag', 'github.com/login'],
      ['https://github.com/login/device', 'github.com/login/device'],
      ['https://github.com/login/oauth/authorize?client_id=x', 'github.com/login/oauth/authorize'],
      ['https://github.com/session', 'github.com/session'],
      ['https://github.com/sessions/two-factor/app', 'github.com/sessions/two-factor/app'],
      ['https://vercel.com/signup', 'vercel.com/signup'],
      ['https://gitlab.com/users/auth/github/callback', 'gitlab.com/users/auth/github/callback'],
    ]
    for (const [url, matched] of stillOut) {
      const d = routeUrl(url)
      expect(d.target, url).toBe('system-browser')
      expect(d.matched, url).toBe(matched)
    }
  })

  it('a rule whose prefix ALREADY ends in `/` keeps matching', () => {
    // `/saml2/` is the shape that a naive "next char must be /" check breaks:
    // the separator is inside the prefix, so there is no second one to demand.
    expect(routeUrl('https://idp.example.com/saml2/sso/idp').matched).toBe('path:/saml2/')
    expect(matchesPathPrefix('/saml2/sso/idp', '/saml2/')).toBe(true)
    // ...and the guard is load-bearing on the real list, not just this one case.
    for (const prefix of AUTH_PATH_PREFIXES) {
      expect(matchesPathPrefix(prefix, prefix), prefix).toBe(true)
      expect(matchesPathPrefix(`${prefix}/deeper`, prefix), prefix).toBe(true)
    }
  })

  it('the contains sub-net is bounded on the right, not the left', () => {
    // Keycloak sits UNDER a realm segment, so the fragment can never be a
    // prefix — the left boundary comes free with the fragment's leading `/`.
    // Its device endpoint hangs one segment further down and must still leave.
    expect(routeUrl('https://kc.example.com/realms/r/protocol/openid-connect/auth').matched)
      .toBe('path:/protocol/openid-connect/auth')
    expect(routeUrl('https://kc.example.com/realms/r/protocol/openid-connect/auth/device').matched)
      .toBe('path:/protocol/openid-connect/auth')
    // ...but a longer WORD in that final segment is not the endpoint.
    expect(routeUrl('https://kc.example.com/realms/r/protocol/openid-connect/authz').target)
      .toBe('internal-pane')
    for (const frag of AUTH_PATH_CONTAINS) {
      expect(containsPathSegment(`/tenant${frag}`, frag), frag).toBe(true)
      expect(containsPathSegment(`/tenant${frag}x`, frag), frag).toBe(false)
    }
  })

  it('a non-boundary hit does not mask a real endpoint later in the path', () => {
    // The scan must continue past the first `indexOf`. `/authorized` is not the
    // endpoint; the `/authorize` that follows it is.
    expect(containsPathSegment('/a/authorizedx/authorize', '/authorize')).toBe(true)
    expect(containsPathSegment('/a/authorizedx', '/authorize')).toBe(false)
  })
})

// ── Variant (4) precondition — the URL survives the routing verbatim ─────────

describe('variant 4 precondition — an internally-routed URL is preserved verbatim', () => {
  it('query string, fragment, and casing all survive to the pane sink', () => {
    // The pane escape hatch can only hand out the URL it was given. If routing
    // normalized or truncated it, one-action recovery would land somewhere else.
    const url = 'https://Example.COM/a/b?x=1&y=%20z#frag'
    const s = sinks()
    dispatchUrl(url, {}, s)
    expect(s.internal).toEqual([url])
  })

  it('exactly one sink fires per call', () => {
    const s = sinks()
    dispatchUrl('https://github.com/login', {}, s)
    dispatchUrl('https://docs.example.com/', {}, s)
    expect(s.external.length + s.internal.length).toBe(2)
  })
})

// ── Loopback: the localhost-callback / dev-preview question ───────────────────

describe('loopback URLs never leave the app', () => {
  it('a dev server / preview stays internal even on an auth-looking path', () => {
    // The generic auth-path sub-net would otherwise fire here, and a
    // participant's own app served at /oauth/authorize is exactly what the
    // internal pane is for. Also settles the OAuth localhost-callback case: a
    // 127.0.0.1 callback we are ever asked to open is never handed to the OS.
    expect(routeUrl('http://localhost:5173/oauth/authorize')).toEqual({
      target: 'internal-pane',
      reason: 'loopback',
    })
    expect(routeUrl('http://127.0.0.1:3000/login').reason).toBe('loopback')
    expect(routeUrl('http://[::1]:8080/authorize').reason).toBe('loopback')
  })

  it('tier ① still overrides loopback — a flagged URL is the producer speaking', () => {
    expect(routeUrl('http://localhost:5173/login', { authIntent: true }).target)
      .toBe('system-browser')
  })

  it('isLoopbackHost covers the forms Electron/Vite actually emit', () => {
    for (const h of ['localhost', '127.0.0.1', '127.0.0.2', '0.0.0.0', '[::1]', 'app.localhost']) {
      expect(isLoopbackHost(h), h).toBe(true)
    }
    for (const h of ['github.com', 'localhost.evil.example', '1.2.3.4']) {
      expect(isLoopbackHost(h), h).toBe(false)
    }
  })
})

// ── Scheme guard — the security property ─────────────────────────────────────

describe('only http(s) can ever reach the OS', () => {
  it('non-web schemes stay internal even when flagged as auth', () => {
    // shell.openExternal hands the OS an arbitrary protocol handler. A
    // page-controlled URL (a webview will-navigate) must never get there, and a
    // wrongly-set flag must not be an escalation path.
    for (const url of [
      'file:///Users/dev/proj/docs/artifacts/a.html',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'about:blank',
      'ptn:ticket/T-434',
    ]) {
      expect(routeUrl(url, { authIntent: true }), url).toEqual({
        target: 'internal-pane',
        reason: 'non-web-scheme',
      })
    }
  })

  it('unparseable input stays internal', () => {
    expect(routeUrl('').reason).toBe('unparseable')
    expect(routeUrl('not a url').reason).toBe('unparseable')
  })

  it('a non-web scheme never reaches the openExternal sink', () => {
    const s = sinks()
    const spy = vi.fn()
    dispatchUrl('javascript:alert(1)', { authIntent: true }, { ...s, openExternal: spy })
    expect(spy).not.toHaveBeenCalled()
  })
})
