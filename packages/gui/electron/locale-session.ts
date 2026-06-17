/**
 * locale-session.ts — match the in-app browser/Preview webview's Accept-Language
 * to the UI language (T-PATCH-187).
 *
 * The 'browser' tab (Run Preview, external links) renders in the
 * `persist:browser-tab` <webview> partition. Without an Accept-Language header,
 * Chromium defaults to en-US, so embedded sites (e.g. Kakao OAuth) show English
 * even when the app — and the project being previewed — are Korean. We rewrite
 * the header on that partition to follow the current UI language.
 */

import { session } from 'electron'
import { getUiLanguage, type UiLanguage } from '@productune/core'

const WEBVIEW_PARTITION = 'persist:browser-tab'

function headerFor(lng: UiLanguage): string {
  return lng === 'ko'
    ? 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    : 'en-US,en;q=0.9'
}

let acceptLanguage = headerFor('en')

/** Refresh the cached Accept-Language from a given (or the persisted) UI language. */
export function setWebviewAcceptLanguage(lng?: UiLanguage): void {
  try {
    acceptLanguage = headerFor(lng ?? getUiLanguage())
  } catch {
    acceptLanguage = headerFor('en')
  }
}

/** Install the header rewriter on the webview partition. Call once at app-ready. */
export function installWebviewAcceptLanguage(): void {
  setWebviewAcceptLanguage()
  session.fromPartition(WEBVIEW_PARTITION).webRequest.onBeforeSendHeaders((details, cb) => {
    details.requestHeaders['Accept-Language'] = acceptLanguage
    cb({ requestHeaders: details.requestHeaders })
  })
}
