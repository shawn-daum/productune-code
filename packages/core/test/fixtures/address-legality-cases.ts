/**
 * ONE shared list of `address=` value probes, exercised against all three
 * address-legality gates (T-586 QA delta-grill round 2: the gates disagreed on
 * whitespace):
 *   - the resolver — `address_ok`/`trim()` in prdt-audience-inject.sh, driven
 *     from packages/core/test/scripts/audience-inject-hook.test.ts
 *   - the TS gate — `isLegalAddress`/`parseRegister` in
 *     packages/core/src/settings/register.ts, driven from
 *     packages/core/test/settings/register.test.ts
 *   - the CLI gate — `prdt register set` in packages/core/scripts/prdt,
 *     driven from packages/core/test/scripts/prdt-register-cli.test.ts
 *
 * The resolver is CANONICAL (contracts.md is explicit that it is the sole
 * authority on legal register values) — its ASCII-only (`[:space:]` under
 * `LC_ALL=C`) trim and its banned-character/length shape are the rule the
 * other two gates must match byte for byte. Before this fixture existed, each
 * fix commit correctly kept the three gates' banned-literal lists in sync by
 * hand, but nobody compared TRIM semantics across them — three separately
 * authored test lists cannot catch that kind of divergence by construction
 * (the NBSP defect this fixture was born to pin down: `address=` + NBSP + 32
 * `a`s is 34 raw bytes, which the resolver correctly rejected while the CLI
 * and the TS gate silently `.trim()`ed the NBSP away and accepted 32 `a`s).
 *
 * TO ADD A PROBE: append one entry below — never add it to only one test
 * file's own list. Every entry needs either `value` (a normal JS string,
 * valid UTF-8 when it hits the wire) or `rawBytes` (a raw byte sequence, for
 * a probe no JS string can represent, e.g. invalid UTF-8) but not both.
 * `legal` is the verdict every applicable gate must agree on; `finalValue`
 * (legal cases only, when trimming changes the value) is what every
 * applicable gate must resolve it to. `gates`, when given, restricts a probe
 * to the gates that can actually carry it byte-for-byte — see the two
 * invalid-UTF-8 entries below for why that's sometimes necessary; omit it to
 * run a probe against all three.
 */

export type Gate = 'resolver' | 'register-ts' | 'cli'

export interface AddressCase {
  label: string
  value?: string
  rawBytes?: readonly number[]
  legal: boolean
  finalValue?: string
  gates?: readonly Gate[]
}

export const ALL_GATES: readonly Gate[] = ['resolver', 'register-ts', 'cli']

export const ADDRESS_CASES: readonly AddressCase[] = [
  { label: 'plain ASCII', value: 'Shawn', legal: true },
  { label: 'unicode name (Korean)', value: '션님', legal: true },
  { label: '32 bytes — length boundary, legal', value: 'a'.repeat(32), legal: true },
  { label: '33 bytes — length boundary, illegal', value: 'a'.repeat(33), legal: false },
  { label: '11 Hangul chars = 33 bytes — multi-byte length boundary, illegal', value: '가'.repeat(11), legal: false },
  { label: 'leading/trailing ASCII space — trimmed away, then legal', value: '  Shawn  ', legal: true, finalValue: 'Shawn' },
  {
    // T-586 QA delta-grill defect: an on-disk `address=` + NBSP + 32 `a`s is 34
    // raw bytes. The resolver's ASCII-only trim leaves the NBSP in place, so
    // it correctly counts toward the 32-byte cap and rejects the line. The CLI
    // and the TS gate used to run it through a Unicode-aware trim (Python
    // `.strip()` / JS `.trim()`), both of which strip NBSP as whitespace,
    // silently arriving at a "legal" 32-`a` value — a different value than
    // what was on disk, accepted where the resolver refuses it outright.
    label: 'NBSP (U+00A0) + 32 `a`s — 34 raw bytes; NBSP must NOT be trimmed',
    value: ' ' + 'a'.repeat(32),
    legal: false,
  },
  { label: 'double quote — banned literal (forges the address\'s own quoted slot)', value: 'ab"cd', legal: false },
  { label: 'middle dot U+00B7 — banned literal (the key=value pair separator)', value: 'ab·cd', legal: false },
  { label: '`[prdt` literal — banned (a block/line header)', value: '[prdt', legal: false },
  { label: 'tab (C0 control)', value: 'ab\tcd', legal: false },
  { label: 'vertical tab U+000B (C0 control)', value: 'ab' + String.fromCharCode(0x0b) + 'cd', legal: false },
  { label: 'embedded CR (C0 control, not a line ending)', value: 'ab\rcd', legal: false },
  { label: 'NEL U+0085', value: 'ab' + String.fromCharCode(0x85) + 'cd', legal: false },
  { label: 'LINE SEPARATOR U+2028', value: 'ab' + String.fromCharCode(0x2028) + 'cd', legal: false },
  { label: 'PARAGRAPH SEPARATOR U+2029', value: 'ab' + String.fromCharCode(0x2029) + 'cd', legal: false },
  { label: 'empty value', value: '', legal: false },
  { label: 'whitespace-only (ASCII spaces)', value: '   ', legal: false },
  {
    // A real invalid byte sequence can sit in the register file the resolver
    // reads, but it cannot survive as a JS string used for CLI argv — Node
    // re-encodes argv strings as valid UTF-8, so this probe is resolver-only.
    label: 'invalid UTF-8 byte sequence (0x61 0xFF 0x62) — file bytes',
    rawBytes: [0x61, 0xff, 0x62],
    legal: false,
    gates: ['resolver'],
  },
  {
    // The TS-string analog of "not valid UTF-8": a lone surrogate can exist as
    // a JS string in memory but has no valid UTF-8 encoding — isLegalAddress's
    // own invalid-UTF-8 check (round-tripping through Buffer) is built to
    // catch exactly this. Not representable on disk or through CLI argv, so
    // this probe is register-ts-only.
    label: 'invalid UTF-8 (lone surrogate) — register-ts in-memory analog',
    value: '\ud800',
    legal: false,
    gates: ['register-ts'],
  },
]

export function appliesTo(c: AddressCase, gate: Gate): boolean {
  return !c.gates || c.gates.includes(gate)
}

/** Cases applicable to a gate, in fixture order. */
export function casesFor(gate: Gate): readonly AddressCase[] {
  return ADDRESS_CASES.filter((c) => appliesTo(c, gate))
}

/**
 * The raw bytes a case represents on disk — `rawBytes` verbatim, or `value`
 * UTF-8 encoded. Only the resolver gate ever sees a `rawBytes`-only case (see
 * the invalid-UTF-8 entries above), so this is the one helper that needs to
 * handle both shapes; the register-ts and cli gates only ever consume `.value`
 * directly since a JS string / CLI argv cannot carry invalid UTF-8.
 */
export function caseBytes(c: AddressCase): Buffer {
  if (c.rawBytes) return Buffer.from(c.rawBytes)
  if (c.value === undefined) throw new Error(`address-legality-cases: "${c.label}" has neither value nor rawBytes`)
  return Buffer.from(c.value, 'utf8')
}
