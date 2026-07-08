/**
 * browserUrl.ts — T-328
 *
 * Pure, dependency-free URL-bar normalization for BrowserTab's address input.
 * Extracted from BrowserTab.navigate so the scheme-detection rule can be unit
 * tested without importing the component (which pulls in React/zustand/
 * react-i18next at module scope).
 *
 * Rule: any input that already carries a `scheme://` prefix (file://,
 * http://, https://, or any other RFC 3986 scheme) is passed through
 * unmodified. A bare input with no scheme (e.g. "example.com") gets
 * `https://` prepended, same as before T-328 — that prior behavior only
 * special-cased http/https, so `file:///…/x.html` typed into the address bar
 * was mangled into `https://file:///…/x.html` (T-328 bug #1).
 */

// RFC 3986 scheme: letter, then letters/digits/+/-/. — followed by "://".
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

export function normalizeBrowserUrl(target: string): string {
  return SCHEME_RE.test(target) ? target : `https://${target}`
}
