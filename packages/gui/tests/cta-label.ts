/**
 * cta-label.ts — T-442 F-B / T-450. The wizard CTA matcher, in one place.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * The regex used to live inside `theme.spec.ts`, which meant the only thing that
 * could exercise it was a test that boots the real app. On this machine booting
 * the app means the VM (a window), and the app only ever renders English —
 * `src/i18n.ts` hardcodes `lng: 'en'` and `sandboxHome()` seeds nothing — so the
 * Korean branch was never evaluated by anything, ever.
 *
 * That is how the original bug survived. The matcher was `/^(Next|다음)\b/`, and
 * JavaScript's `\b` is a boundary between `[A-Za-z0-9_]` and anything else. After
 * a Hangul syllable there is no such boundary to find, so the Korean alternative
 * could NEVER match: '다음' → false, '다음 단계' → false (QA-measured). The fix
 * was measured to work, but nothing pinned it, so the next edit could silently
 * reintroduce it — and it would surface as a locator failure in a VM-only test,
 * read as a product defect.
 *
 * Extracting it makes the matcher assertable by a pure unit test on the host, with
 * no app, no window and no locale plumbing. See `cta-label.spec.ts`.
 */

/**
 * The wizard's primary CTA, in either locale.
 *
 * The `\b` is kept for the ASCII branch, where it does the intended job of
 * rejecting 'Nextcloud'. The Hangul branch needs no separator rule, because '다음'
 * is not a prefix of an unrelated label in this UI — and as above, a `\b` there
 * does not mean "word boundary", it means "never matches".
 */
export const CTA_LABEL_RE = /^(?:Next\b|다음)/u

/** The reset/ghost button next to the CTA, same reasoning. */
export const RESET_LABEL_RE = /Reset|초기화/u
