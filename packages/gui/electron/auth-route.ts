/**
 * auth-route.ts — T-434
 *
 * WHERE DOES A URL OPEN: the system default browser, or an internal pane?
 *
 * R-34 (rehearsal): a participant reached GitHub's passkey login inside the
 * in-app <webview> and could not finish. That is structural, not a bug we can
 * patch — Electron's embedded views do not carry the platform WebAuthn
 * authenticator or the OS password autofill, and the participant's passkeys and
 * passwords already live in their system browser. So auth-bearing flows must
 * LEAVE the app; unauthenticated reading (a doc, a deployed site, a preview)
 * stays in the internal pane where the app can keep the journey in one window.
 *
 * shawn fixed the judgment as THREE tiers, on the premise that any single
 * detector leaks:
 *
 *   ① Producer intent  — whoever hands us the URL knows whether it demands a
 *                        login (`authIntent`). Highest authority.
 *   ② IdP safety net   — an unflagged URL that matches a known auth endpoint
 *                        goes out anyway.
 *   ③ Escape hatch     — every internal pane that can host a URL carries a
 *                        standing "open in default browser" control, so a
 *                        misroute is one click from recovery. (Not in this
 *                        module — it is UI; see BrowserTab / HtmlViewer.)
 *
 * Tier ③ is why this module may err toward `internal-pane` on an unknown URL:
 * an under-trigger is recoverable in one action, while sending every URL out
 * would empty the app. It is also why an over-trigger of tier ② is the SAFE
 * error direction — the user still sees the page, just in their own browser.
 *
 * Deliberately dependency-free (no `electron` import) so the decision is unit
 * testable and so both the main process and the IPC layer share one authority.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RouteTarget = 'system-browser' | 'internal-pane'

export type RouteReason =
  /** ① the producer flagged this URL as an auth/login flow. */
  | 'producer-intent'
  /** ② unflagged, but the URL matches a known IdP / auth endpoint. */
  | 'idp-allowlist'
  /** Loopback (a local dev server / OAuth callback listener) — never leaves. */
  | 'loopback'
  /** Not http(s) — file:, about:, data:, custom schemes never reach the shell. */
  | 'non-web-scheme'
  /** Unparseable input — treated as internal, never handed to the OS. */
  | 'unparseable'
  /** ③ nothing said auth — internal pane, escape hatch covers a misroute. */
  | 'default-internal'

export interface RouteDecision {
  target: RouteTarget
  reason: RouteReason
  /** Which allowlist entry or path pattern matched, for logs and QA reports. */
  matched?: string
}

export interface RouteOptions {
  /**
   * Tier ① — the producer asserts this URL requires the user to authenticate.
   * Today's producer is a QA/PO envelope carrying `auth_required` alongside its
   * `browser_url` / `verify_url` (contracts: QA live/smoke extras), which is the
   * PO stating, in its own words, that a login is in the way.
   */
  authIntent?: boolean
}

export interface IdpRule {
  /** Lowercase host. */
  host: string
  /** Match `host` and any subdomain of it (`*.host`). */
  subdomains?: boolean
  /**
   * Path prefixes that are auth endpoints. OMITTED = the entire host is an auth
   * surface. PRESENT = only these paths leave the app, so a host that serves
   * both docs/dashboards AND a login (github.com, vercel.com) keeps its
   * readable pages in the internal pane. Without this split, "read this repo's
   * README" would bounce the participant out of the app on every link.
   */
  paths?: readonly string[]
}

// ── ② The safety net ──────────────────────────────────────────────────────────

/**
 * Known auth endpoints. Two shapes, per `IdpRule.paths` above.
 *
 * This list is a NET, not a spec — it is expected to be incomplete, which is
 * exactly why tiers ① and ③ exist. Adding a host here is cheap and safe;
 * missing one costs the user one click on the escape hatch.
 */
export const IDP_RULES: readonly IdpRule[] = [
  // ── Dedicated auth hosts — nothing on them is worth reading in-app ─────────
  { host: 'accounts.google.com' },
  { host: 'accounts.youtube.com' },
  { host: 'login.microsoftonline.com' },
  { host: 'login.microsoft.com' },
  { host: 'login.live.com' },
  { host: 'appleid.apple.com' },
  { host: 'nid.naver.com' },
  { host: 'kauth.kakao.com' },
  { host: 'accounts.kakao.com' },
  { host: 'id.atlassian.com' },
  { host: 'auth.atlassian.com' },
  { host: 'login.yahoo.com' },
  { host: 'auth0.com', subdomains: true },
  { host: 'okta.com', subdomains: true },
  { host: 'oktapreview.com', subdomains: true },
  { host: 'onelogin.com', subdomains: true },
  { host: 'duosecurity.com', subdomains: true },
  { host: 'accounts.dev', subdomains: true },

  // ── Mixed hosts — only the auth paths leave; docs/repos/dashboards stay ────
  // github.com/login covers /login/oauth/authorize and /login/device too
  // (prefix match), which is the R-34 flow.
  { host: 'github.com', paths: ['/login', '/session', '/sessions', '/signin', '/sign_in'] },
  { host: 'gitlab.com', paths: ['/users/sign_in', '/users/auth', '/oauth/authorize'] },
  { host: 'bitbucket.org', paths: ['/account/signin', '/site/oauth2/authorize'] },
  { host: 'vercel.com', paths: ['/login', '/signup', '/sso', '/api/auth', '/api/registration'] },
  { host: 'slack.com', subdomains: true, paths: ['/signin', '/sso', '/oauth'] },
  { host: 'notion.so', subdomains: true, paths: ['/login'] },
  { host: 'figma.com', subdomains: true, paths: ['/login', '/oauth'] },
  { host: 'npmjs.com', subdomains: true, paths: ['/login'] },
  { host: 'claude.ai', paths: ['/login', '/oauth'] },
]

/**
 * Host-agnostic auth paths — a second sub-net inside tier ②, for the IdP we
 * have never heard of (self-hosted Keycloak, a customer's SSO, a new provider).
 * A host allowlist misses those BY CONSTRUCTION, which is precisely the leak
 * shawn's premise predicts.
 *
 * Never applied to loopback hosts: a participant's own dev server can serve
 * `/oauth/authorize` while being exactly the thing we want inside the pane.
 */
export const AUTH_PATH_PREFIXES: readonly string[] = [
  '/oauth/authorize',
  '/oauth2/authorize',
  '/oauth2/v2.0/authorize',
  '/connect/authorize',
  '/authorize',
  '/saml2/',
  '/saml/sso',
  '/.auth/login',
]

/**
 * Same net, for endpoints that sit UNDER a tenant/realm segment and so are never
 * a path prefix (Keycloak: `/realms/<realm>/protocol/openid-connect/auth`).
 * Kept separate from the prefix list because a `contains` match on a short
 * fragment like `/authorize` would fire on ordinary docs paths.
 */
export const AUTH_PATH_CONTAINS: readonly string[] = [
  '/protocol/openid-connect/auth', // Keycloak
  '/oauth2/v1/authorize',          // Okta-style, tenant-prefixed
  '/adfs/oauth2/authorize',        // AD FS
]

// ── Host helpers ──────────────────────────────────────────────────────────────

/** Loopback / link-local — a local dev server, preview, or OAuth callback. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h.endsWith('.localhost') ||
    h.startsWith('127.')
  )
}

function hostMatches(rule: IdpRule, host: string): boolean {
  if (host === rule.host) return true
  return rule.subdomains === true && host.endsWith(`.${rule.host}`)
}

function pathMatches(rule: IdpRule, pathname: string): boolean {
  // No `paths` → the whole host is an auth surface.
  if (!rule.paths) return true
  // Plain prefix match: `/login` therefore also covers GitHub's
  // `/login/oauth/authorize` and `/login/device` — the R-34 flows.
  const p = pathname.toLowerCase()
  return rule.paths.some((prefix) => p.startsWith(prefix))
}

/**
 * Tier ② match. Returns the matched rule label (for logs / QA evidence) or null.
 * Exported so a test — and the ticket's variant report — can enumerate the net
 * without re-deriving the matching rules.
 */
export function matchAuthEndpoint(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase()
  if (isLoopbackHost(host)) return null

  for (const rule of IDP_RULES) {
    if (hostMatches(rule, host) && pathMatches(rule, parsed.pathname)) {
      return rule.paths ? `${rule.host}${parsed.pathname}` : rule.host
    }
  }

  const p = parsed.pathname.toLowerCase()
  for (const prefix of AUTH_PATH_PREFIXES) {
    if (p.startsWith(prefix)) return `path:${prefix}`
  }
  for (const frag of AUTH_PATH_CONTAINS) {
    if (p.includes(frag)) return `path:${frag}`
  }

  return null
}

// ── The decision ──────────────────────────────────────────────────────────────

/**
 * Decide where `url` opens. Pure — no side effect, no electron.
 *
 * Order is load-bearing:
 *   1. scheme guard FIRST. `shell.openExternal` on a non-web scheme hands the
 *      OS an arbitrary handler (file://, custom protocol) — a page-controlled
 *      URL must never reach it. Guarding before tier ① means even a wrongly
 *      flagged `file://` cannot escalate.
 *   2. tier ① producer intent.
 *   3. loopback pin — a local dev server is never an IdP, and pinning it here
 *      also settles the localhost-callback question: a `127.0.0.1` OAuth
 *      callback we are ever asked to open stays local.
 *   4. tier ② safety net.
 *   5. default internal (tier ③ recovers a misroute).
 */
export function routeUrl(url: string, opts: RouteOptions = {}): RouteDecision {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { target: 'internal-pane', reason: 'unparseable' }
  }

  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { target: 'internal-pane', reason: 'non-web-scheme' }
  }

  if (opts.authIntent === true) {
    return { target: 'system-browser', reason: 'producer-intent' }
  }

  if (isLoopbackHost(parsed.hostname)) {
    return { target: 'internal-pane', reason: 'loopback' }
  }

  const matched = matchAuthEndpoint(parsed)
  if (matched) {
    return { target: 'system-browser', reason: 'idp-allowlist', matched }
  }

  return { target: 'internal-pane', reason: 'default-internal' }
}

// ── Applying the decision ─────────────────────────────────────────────────────

/**
 * The two things a routed URL can do. Injected rather than imported so the
 * "did the system browser actually get called" question is answerable by a
 * unit test instead of a claim (doctrine #4).
 */
export interface RouteSinks {
  /** Hand the URL to the OS default browser (electron `shell.openExternal`). */
  openExternal: (url: string) => void
  /** Open the URL in an internal pane (renderer `browser` tab). */
  openInternalPane: (url: string) => void
}

/** Route `url` and fire exactly one sink. Returns the decision that was taken. */
export function dispatchUrl(
  url: string,
  opts: RouteOptions,
  sinks: RouteSinks,
): RouteDecision {
  const decision = routeUrl(url, opts)
  if (decision.target === 'system-browser') sinks.openExternal(url)
  else sinks.openInternalPane(url)
  return decision
}
