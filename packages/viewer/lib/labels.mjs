// viewer/lib/labels.mjs — the ONE label layer for the generated viewer (T-706), per language (T-1277).
//
// The copy lives in one catalog per language — labels-ko.mjs · labels-en.mjs, same group keys in
// each (the CLI's prdt-messages.json has the same ko + en pair). `setViewerLang(lang)` points the
// exports below at one catalog; every importer reads them as live bindings, so render code names
// `TICKET.tableHeaders` and never a string. A language with no catalog falls back to ko.
// Which language: the project's `user_lang` (see collect.mjs `userLangOf`); this module holds no policy.
import ko from './labels-ko.mjs'
import en from './labels-en.mjs'

export const CATALOGS = { ko, en }
export const DEFAULT_LANG = 'ko'

/** T-1514: the 자투리 lane's fixed record value (`lane: 자투리`) — a frontmatter value matched, never shown; the
 *  same in every language. Lives here so render.mjs holds no Hangul literal (viewer-labels.test.ts). Twin of
 *  LANE_BESTEFFORT_NAME in prdt_lanes.py. */
export const JATTURI_LANE_RECORD = '자투리'

/** `ko-KR` / `EN` / `en_US` → the catalog key, or null when this viewer has no such catalog. */
export function catalogKey(lang) {
  const k = String(lang ?? '').trim().toLowerCase().split(/[-_]/)[0]
  return Object.hasOwn(CATALOGS, k) ? k : null
}

let current = ko
export let lang = DEFAULT_LANG
export let STORE_LABEL = ko.STORE_LABEL
export let COMMON = ko.COMMON
export let noGroupLabel = ko.noGroupLabel
export let ENV = ko.ENV
export let PAGE = ko.PAGE
export let HOME = ko.HOME
export let DETAIL_FIELD_LABELS = ko.DETAIL_FIELD_LABELS
export let TICKET = ko.TICKET
export let WIKI = ko.WIKI
export let FEATURE = ko.FEATURE
export let GLOSSARY = ko.GLOSSARY
export let RELEASE = ko.RELEASE
export let DISCIPLINE = ko.DISCIPLINE
export let DISCIPLINE_LOAD = ko.DISCIPLINE_LOAD
export let readFieldValue = ko.readFieldValue
export let ARTIFACT = ko.ARTIFACT
export let PRD = ko.PRD
export let IDLE = ko.IDLE
export let PRD_READING = ko.PRD_READING
export let FRAME = ko.FRAME
export let FILE_HREF_NOTE = ko.FILE_HREF_NOTE
export let HASH_NOTICE = ko.HASH_NOTICE
export let IDENTITY = ko.IDENTITY
export let THEME_TOGGLE = ko.THEME_TOGGLE
export let OPTION_CARD = ko.OPTION_CARD
export let LINKS = ko.LINKS

/** Select the catalog for `lang` (unknown → ko); returns the catalog key now in force. */
export function setViewerLang(l) {
  const key = catalogKey(l) ?? DEFAULT_LANG
  const c = CATALOGS[key]
  if (c === current) return key
  current = c
  lang = key
  ;({
    STORE_LABEL, COMMON, noGroupLabel, ENV, PAGE, HOME, DETAIL_FIELD_LABELS, TICKET, WIKI, FEATURE,
    GLOSSARY, RELEASE, DISCIPLINE, DISCIPLINE_LOAD, readFieldValue, ARTIFACT, PRD, IDLE, PRD_READING, FRAME, FILE_HREF_NOTE,
    HASH_NOTICE, IDENTITY, THEME_TOGGLE, OPTION_CARD, LINKS,
  } = c)
  return key
}
