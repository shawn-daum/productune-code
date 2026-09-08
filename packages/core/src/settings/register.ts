import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * The register (T-586) — how the PO speaks to the operator, as a named OBJECT
 * with four keys instead of free prose in an override file. Per USER (the
 * operator reading the PO), never per project: a cloned repository must not be
 * able to change how the product addresses its owner, so there is no project
 * layer.
 *
 * Storage: `~/.prdt/register`, one `key=value` per line, `#` comments, blank
 * lines, whitespace trimmed, unknown keys ignored, a repeated key → last wins.
 * Deliberately NOT ~/.productune/settings.json and NOT the project's
 * .prdt/config.json: the consumer is prdt-audience-inject.sh, a bash hook that
 * must read the file with no JSON parser — and it is that hook, not this
 * module, that is the single source of truth for the DOMAIN. `prdt register
 * --list` asks it. The copy below exists so the GUI can offer legal values and
 * write them without spawning a shell; test/settings/register.test.ts pins it
 * to the hook's `--list` output, so the two cannot drift apart unnoticed.
 *
 * Keys:
 * - `audience`  planner | developer  (absorbs T-326 audience-mode; default planner)
 * - `form`      prose | outline       (default prose)
 * - `structure` default | planner-tables (default default)
 * - `address`   free text — one line, 1–32 BYTES, no control / line-break
 *               characters, valid UTF-8; default none (`null`). A value, not a
 *               rule: the hook emits it only inside a fixed sentence of its own.
 *
 * `~/.prdt/audience-mode` (the T-326 file) is NOT read: one register mechanism.
 * install.sh migrates an existing audience-mode file into `register` once.
 */
export type RegisterAudience = 'planner' | 'developer'
export type RegisterForm = 'prose' | 'outline'
export type RegisterStructure = 'default' | 'planner-tables'

export interface Register {
  audience: RegisterAudience
  form: RegisterForm
  structure: RegisterStructure
  /** `null` = the user is not addressed by a name or title. */
  address: string | null
}

export type RegisterEnumKey = 'audience' | 'form' | 'structure'
export type RegisterKey = RegisterEnumKey | 'address'

/** Enum domains — a test-pinned copy of prdt-audience-inject.sh `--list`. */
export const REGISTER_DOMAIN: { readonly [K in RegisterEnumKey]: readonly Register[K][] } = {
  audience: ['planner', 'developer'],
  form: ['prose', 'outline'],
  structure: ['default', 'planner-tables'],
}

export const REGISTER_DEFAULTS: Readonly<Register> = {
  audience: 'planner',
  form: 'prose',
  structure: 'default',
  address: null,
}

export const REGISTER_KEYS: readonly RegisterKey[] = ['audience', 'form', 'structure', 'address']

export const ADDRESS_MAX_BYTES = 32

export function registerPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.prdt', 'register')
}

/**
 * The address shape the hook enforces: one line, 1–32 bytes, no C0 control or
 * DEL, none of the three multi-byte breaks (NEL · LS · PS), none of `"`,
 * `·`, `[prdt` (T-586 QA defect 1 — those three would forge the
 * binding/session line's own key=value grammar: `"` opens/closes the
 * address's own quoted slot, `·` is the pair separator between
 * key=value entries, `[prdt` is a block/line header this file's own output
 * uses), valid UTF-8. Kept identical to `address_ok` in
 * prdt-audience-inject.sh AND the CLI's `set` (packages/core/scripts/prdt) —
 * all three gates must refuse the same values byte for byte.
 */
export function isLegalAddress(value: string): boolean {
  if (!value) return false
  if (Buffer.byteLength(value, 'utf8') > ADDRESS_MAX_BYTES) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(value)) return false
  if (value.includes('"') || value.includes('·') || value.includes('[prdt')) return false
  // lone surrogates are the one way a JS string fails to be valid UTF-8
  if (Buffer.from(value, 'utf8').toString('utf8') !== value) return false
  return true
}

export function isLegalEnumValue<K extends RegisterEnumKey>(key: K, value: string): value is Register[K] {
  return (REGISTER_DOMAIN[key] as readonly string[]).includes(value)
}

/** Parse register-file text the way the hook does. Never throws. */
export function parseRegister(text: string): { values: Register; warnings: string[] } {
  const values: Register = { ...REGISTER_DEFAULTS }
  const warnings: string[] = []
  const lines = text.split('\n')
  lines.forEach((raw, i) => {
    const n = i + 1
    const line = raw.replace(/\r$/, '').trim()
    if (!line || line.startsWith('#')) return
    const eq = line.indexOf('=')
    if (eq < 0) { warnings.push(`L${n}: not a key=value line — ignored`); return }
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (key === 'audience' || key === 'form' || key === 'structure') {
      if (isLegalEnumValue(key, val)) (values as unknown as Record<string, string>)[key] = val
      else warnings.push(`L${n}: ${key}= is outside its domain (${REGISTER_DOMAIN[key].join('|')}) — resolved to the default \`${REGISTER_DEFAULTS[key]}\``)
    } else if (key === 'address') {
      if (isLegalAddress(val)) values.address = val
      else warnings.push(`L${n}: address= fails its shape (one line · 1–${ADDRESS_MAX_BYTES} bytes · no control or line-break characters · none of \`"\`, \`·\`, \`[prdt\` · valid UTF-8) — address unused`)
    } else {
      warnings.push(`L${n}: unknown key \`${key.slice(0, 40)}\` — ignored`)
    }
  })
  return { values, warnings }
}

/**
 * Read the per-user register. Missing / unreadable file → every default; an
 * illegal line → that key's default (never throws, never surfaces an illegal
 * value). `homeDir` is test-only (defaults to os.homedir()).
 */
export function readRegister(homeDir: string = os.homedir()): Register {
  try {
    return parseRegister(fs.readFileSync(registerPath(homeDir), 'utf-8')).values
  } catch {
    return { ...REGISTER_DEFAULTS }
  }
}

/**
 * Write ONE key, keeping every other line of the file (comments included) in
 * place: the first line carrying the key is replaced, later duplicates dropped,
 * a missing key appended. `null` (or `''`) removes the key. Refuses an illegal
 * value — the caller passes only what `--list` allows. Atomic tmp + rename,
 * mode 0600, same pattern as plan-tier.
 */
export function writeRegisterKey(key: RegisterKey, value: string | null, homeDir: string = os.homedir()): void {
  if (!REGISTER_KEYS.includes(key)) throw new Error(`register: unknown key \`${key}\``)
  const v = value === null ? '' : value.trim()
  if (v !== '') {
    if (key === 'address') {
      if (!isLegalAddress(v)) throw new Error(`register: address fails its shape (one line · 1–${ADDRESS_MAX_BYTES} bytes · no control or line-break characters · none of \`"\`, \`·\`, \`[prdt\` · valid UTF-8)`)
    } else if (!isLegalEnumValue(key, v)) {
      throw new Error(`register: ${key}=${v} is outside its domain (${REGISTER_DOMAIN[key].join('|')})`)
    }
  }
  const p = registerPath(homeDir)
  let existing = ''
  try { existing = fs.readFileSync(p, 'utf-8') } catch { existing = '' }
  const out: string[] = []
  let placed = false
  for (const raw of existing.replace(/\n$/, '').split('\n')) {
    if (existing === '') break
    const line = raw.replace(/\r$/, '')
    const t = line.trim()
    const eq = t.indexOf('=')
    const k = !t.startsWith('#') && eq >= 0 ? t.slice(0, eq).trim() : null
    if (k === key) {
      if (!placed && v !== '') { out.push(`${key}=${v}`); placed = true }
      continue // later duplicates (and the removed key) are dropped
    }
    out.push(line)
  }
  if (!placed && v !== '') out.push(`${key}=${v}`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, out.length ? out.join('\n') + '\n' : '', { mode: 0o600 })
  fs.renameSync(tmp, p)
}
