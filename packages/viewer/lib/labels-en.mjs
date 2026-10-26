// viewer/lib/labels-en.mjs — the English catalog of the viewer's label layer (T-1277).
// Same group keys and shapes as labels-ko.mjs (a test pins that); chosen when the project's
// `user_lang` is English. Regex entries that read a document's own prose (PRD section names,
// decision-ticket cells) accept the English wording and the Korean one, since a product's
// contract headings are shared across languages.

const STORE_LABEL = { home: 'Current version', prd: 'PRD', ticket: 'Tickets', wiki: 'Wiki', feature: 'Features', artifact: 'Artifacts', env: 'env', glossary: 'Glossary', release: 'Release notes', disc: 'Discipline' }

const COMMON = {
  close: 'Close',
  detailPanel: 'Detail panel',
}

function noGroupLabel(count, unit) {
  return `No groups · ${count}${unit} in total`
}

const ENV = {
  set: 'Set',
  unset: 'Empty',
  note: 'Only key names and whether they are set show here. Values are never on this screen.',
  sample: 'sample',
  noFile: 'No env file',
  emptyHead: 'This product has no env file.',
  emptyDetail: (dir) => `Folder searched: ${dir} · names searched: .env · .env.*`,
  openEditor: 'Open in text editor',
  openVsCode: 'Open in VS Code',
  copyPath: 'Copy path',
  copied: 'Path copied',
  sampleKeys: (n) => `sample · ${n} keys`,
  sampleNote: 'Sample files are not counted as set or unset.',
  homeNone: 'No env file in the code folder.',
  machineScope: 'Machine scope',
  codeWins: 'Product code value wins',
  plainValue: 'plain value',
  machineEmptyHead: 'No keys are stored in machine scope.',
  machineEmptyDetail: 'Store one in the terminal with prdt env set <KEY> and its name shows up here.',
}

const PAGE = {
  titlePrefix: '[prdt]',
  titleFallback: 'viewer',
  h1: 'productune: viewer',
}

const HOME = {
  working: 'Progress',
  decision: 'Decisions',
  decisionHeaders: ['Kind', 'ID', 'Title', 'Status', 'Version'],
  decisionView: { why: 'Why', how: 'How', what: 'Answer', question: 'Question', recommend: 'Recommended', missing: 'Not recorded', answer: (a) => `Answer ${a}`, waiting: 'Waiting', pages: 'Records', note: 'Select a row to unfold why · how · answer.' },
  decisionKind: { ticketOpen: 'Question · open', ticketDone: 'Question · done', ticketDropped: 'Question · dropped', page: 'Record' },
  here: 'now',
  stageTickets: (n) => `Tickets ${n}`,
  vh: {
    dep: 'Deployed',
    dev: 'Dev',
    none: 'No record',
    hint: 'Once the deployed version is written in this product\'s DEPLOY.md, it shows here.',
    meta: (at, ref) => [at ? `deployed ${at}` : '', ref ? `ref ${ref}` : ''].filter(Boolean).join(' · '),
    noOpen: 'No open version',
    linesHead: 'Product lines',
    linesHeaders: ['Product', 'Deployed', 'Dev', 'Stage'],
  },
  stageDone: (done, total) => `Tickets done ${done}/${total}`,
  scope: 'Scope',
  scopeSub: (n) => `${n} PRD items this version`,
  scopeOutDef: 'prd_item is empty or matches no item',
  scopeOutEmpty: 'None',
  scopeMalformed: (n) => `${n} malformed ticket${n === 1 ? '' : 's'}`,
  scopeDecisionNote: (n) => `${n} decision${n === 1 ? '' : 's'} left out`,
  scopeDecisionLink: 'Decision list',
  scopeLane: (name) => `Lane ${name}`,
  scopeNoLane: 'Items not tied to a lane',
  scopeLaneRule: 'Lane count = all tickets of that lane · item count = that item\'s tickets · an item sits under the lane with most of its tickets',
  scopeFixTag: (n) => `Fix format ${n}`,
  scopeFixTitle: 'Only a key is written, without a version. Fix it to the <version>#<key> form.',
  waitDec: 'Waiting for my decision',
  waitDecEmpty: 'No decision is waiting.',
  waitReq: 'Waiting for user work',
  waitReqEmpty: 'Nothing to do right now.',
  dependency: 'dependency',
  beforeBuild: 'Before Build',
  notConnected: 'The main path is not connected yet. Gate tickets and the design → implement → QA → deploy deps appear when Build starts. Only the "critical path" shows for now.',
  notConnectedBuilt: 'The main path is not connected yet. Gate tickets and the design → implement → QA → deploy deps do not exist yet. Only the "critical path" shows for now.',
  dependencyEmpty: 'No open tickets.',
  chipMain: 'Main path',
  chipCritical: 'Critical path',
  chipGate: 'Gate',
  chipRider: 'Rider',
  chipTurn: 'Waiting for the user',
  legendMainCritical: 'Main path · critical path',
  legendRider: 'Best-effort work off the main path',
  legendDone: 'Finished tickets',
  nodeOpen: (id) => `Open ${id} details`,
}

const PROGRESS_OUT_OF_SCOPE_LABEL = 'Tickets outside PRD items'

const DETAIL_FIELD_LABELS = {
  type: 'Type',
  status: 'Status',
  assignee: 'Assignee',
  created: 'Created',
  version: 'Version',
  spec_since: 'Since version',
  kind: 'Kind',
}

const TICKET = {
  tableHeaders: ['ID', 'Title', 'Type', 'Status', 'Assignee', 'Added'],
  sidebarLabel: 'Tickets',
  backlogLabel: 'backlog',
  currentTag: 'current',
  empty: 'No tickets yet.<br><span style="font-size:11px;">They show up here once the PO creates the first one.</span>',
  statusText: { open: 'In progress', done: 'Done', dropped: 'Dropped' },
  countUnit: '',
}

const WIKI = {
  tableHeaders: ['File', 'Title', 'Status', 'Version'],
  sidebarLabel: 'Wiki',
  empty:
    'No wiki documents in this group.<br><span style="font-size:11px;">It shows up here once a document of this kind is written.</span>',
  statusText: { live: 'Valid', superseded: 'Superseded', '': 'Not set' },
  groupLabels: {
    decision: 'Decision',
    fact: 'Fact',
    feature: 'Wiki · feature tag (history)',
    learning: 'Learning',
    retro: 'Retro',
    term: 'Term',
  },
  unclassifiedLabel: 'Unclassified',
  countUnit: '',
}

const FEATURE = {
  specList: {
    tableHeaders: ['Feature', 'Title', 'Status', 'Since version'],
    statusText: { live: 'Valid', superseded: 'Superseded', '': 'Not set' },
  },
  tableHeaders: ['Name', 'Kind', 'Definition', 'Tickets'],
  sidebarLabel: 'Features',
  allLabel: 'All',
  empty: 'No feature taxonomy.<br><span style="font-size:11px;">It shows up here once a taxonomy is created.</span>',
  countUnit: '',
  fields: { kind: 'Kind', area: 'Area', tickets: 'Tickets', version: 'Version', read: 'Read' },
  linksHeading: 'Related features',
  linksEmpty: 'No linked features yet.',
  evidenceHeading: 'Evidence tickets',
  evidenceEmpty: 'No evidence tickets yet.',
  specHeading: 'Spec file',
  guide: { when: 'When it is used', ux: 'Screen layout', logic: 'How it works', limits: 'Limits', example: 'Example' },
  surfaces: [
    { key: 'terminal', name: 'Terminal chat', parts: [['chat', 'PO · agent reply'], ['hook', 'Hook notice line']] },
    { key: 'statusline', name: 'Status line', parts: [['stage', 'Stage progress'], ['ticket', 'Ticket number']] },
    { key: 'viewer', name: 'Viewer', parts: [['activity', 'Left bar'], ['home', 'Current version'], ['prd', 'PRD'], ['wiki', 'Wiki'], ['disc', 'Discipline']] },
    { key: 'cli', name: 'prdt commands', parts: [['doctor', 'prdt doctor'], ['wiki', 'prdt wiki'], ['inbox', 'prdt inbox']] },
  ],
  specLink: (n) => `Spec file · ${n} line${n === 1 ? '' : 's'} true now ›`,
  specTruthHeading: 'True now',
  specLinkBare: 'Spec file ›',
  flowSource: 'Flow diagram source (mermaid)',
  limitsNone: 'No known limits',
  noScreenKinds: ['internal', 'component'],
  noScreen: 'No user screen',
  guideEmptyHead: 'This feature has no description yet.',
  guideEmptyDetail: 'It is a new feature, so there is no description yet. The ticket that builds it fills in when it is used and how it looks and works.',
  back: '← Back · ',
  ticketUnit: '',
  ticketStatus: { done: 'done', open: 'open', dropped: 'dropped' },
}

const GLOSSARY = {
  sidebarLabel: 'Glossary',
  countLabel: 'Terms',
  countUnit: '',
  tableHeaders: ['Term', 'Category', 'Definition'],
  fields: { category: 'Category', status: 'Status' },
  empty: 'No glossary documents.<br><span style="font-size:11px;">They show up here once the wiki has a term document.</span>',
}

const RELEASE = {
  sidebarLabel: 'Release notes',
  countLabel: 'Release notes',
  countUnit: '',
  tableHeaders: ['Version', 'Title', 'Date'],
  fields: { version: 'Version', date: 'Date' },
  empty: 'No release notes.<br><span style="font-size:11px;">They show up here once the release notes file has a version section.</span>',
}

const DISCIPLINE = {
  sidebarLabel: 'Discipline',
  allLabel: 'All',
  contractsGroup: 'Contracts',
  countLabel: 'Discipline documents',
  countUnit: '',
  tableHeaders: ['Document', 'Kind', 'Lines'],
  kind: { contract: 'Contract', habit: 'habit', index: 'Index', playbook: 'playbook' },
  fields: { kind: 'Kind', copy: 'Copy', lines: 'Lines' },
  copyValue: 'The copy applied on this machine',
  linesValue: '{N} lines',
  copyPathPrefix: '~/.prdt/discipline/',
  differs: '{N} lines differ from the repository original',
  overLine: 'This document is {N} lines long. Shown from the start.',
  emptyLine1: 'No discipline documents.',
  emptyLine2: 'They show up once the viewer is built on a machine with prdt discipline applied.',
}

const DISCIPLINE_LOAD = {
  title: 'When discipline gets loaded',
  source: 'Diagram source:',
  sourceNote: 'Redrawn every time the viewer is built.',
  personas: [['po', 'PO'], ['designer', 'Designer'], ['developer', 'Developer'], ['qa', 'QA']],
  lane1: { head: '1. Session start (always)', sub: 'All of it loads when a session or worker starts', parts: 'Canonical discipline · {N} parts', layers: 'Blocks appended after the parts', part: 'part {N}' },
  lane2: { head: '2. When needed (trigger)', sub: 'Read when one line of an always-loaded document points at this one', annex: 'contracts annexes · {N}', playbooks: '{P} playbooks · {N} (the menu\'s when line)', override: 'playbook override' },
  lane3: { head: '3. Every tool use (hooks)', sub: 'Each event is checked, then blocked or logged', allMatcher: '(all)', dimNoneForPo: 'Dimmed hooks: none (the PO gets all)', dimForOthers: 'Dimmed hooks: run only in the PO session' },
  precedence: {
    head: 'Precedence', hint: 'the right side wins',
    steps: [['Canonical discipline', 'doctrine → contracts → habit'], ['Machine override', '~/.prdt/overrides/<persona>.md'], ['Machine playbook override', 'only while that playbook runs'], ['Project override', '.prdt/overrides/<persona>.md']],
    floor: 'Floor (no override can change it): the whole Secrets section · user consent gates (push · deploy · irreversible git · direction confirm) · read-only clauses',
  },
  detailHint: 'Select an item to see its file path and original condition here.',
  detail: { path: 'Path', when: 'Original condition (when)', matcher: 'matcher', event: 'Event', size: 'Size', poOnly: 'Runs only in the PO session', reads: 'Reads', scope: 'Applies to' },
  partDetail: 'At most {L} bytes per part · this part {B} bytes',
  annexNote: 'Read when one line of contracts.md points at this document',
  menuNote: 'The worker picks it by itself when the menu table\'s when matches',
  overrideItem: ['~/.prdt/overrides/playbooks/<name>.md', 'Read with --playbook <name> the moment that playbook is picked'],
  overrideDetail: 'Only when its name is in the list at the end of the machine override block',
  planMissing: 'Could not read the session-start parts.',
  manifestMissing: 'Could not read the hook list (hook-manifest.json).',
  scopePo: 'PO only',
  scopeAll: 'All personas',
  layers: {
    'prdt-audience-inject.sh': ['Voice · form (register)', 'po', 'the four keys of ~/.prdt/register → discipline/register/<key>-<value>.md'],
    'prdt-plan-tier-inject.sh': ['Plan tier (plan-tier)', 'po', '~/.prdt/plan-tier'],
    'prdt-inbox-inject.sh': ['Advice from other projects (inbox)', 'po', 'lines of ~/.prdt/inbox.md addressed to this project'],
    'prdt-overrides-inject.sh': ['Machine override', 'all', '~/.prdt/overrides/<persona>.md (+ the playbook override list)'],
    'prdt-project-overrides-inject.sh': ['Project override', 'all', '.prdt/overrides/<persona>.md'],
  },
  poOnlyHooks: ['prdt-user-prompt.sh', 'prdt-question-check.sh'],
}

function readFieldValue(label, count, unit) {
  return `${label} · ${count}${unit}`
}

const ARTIFACT = {
  tableHeaders: ['Path', 'Kind', 'Status', 'Ticket', 'Language', 'Size', 'Added'],
  sidebarLabel: 'Artifacts',
  bucketSuffix: ' bucket',
  empty: 'No artifacts yet.<br><span style="font-size:11px;">A manifest.json appears in this bucket once the version opens.</span>',
  statusText: { pending: 'Pending', approved: 'Approved', archived: 'Archived' },
  countUnit: '',
}

const PRD = {
  openLabelPrefix: 'Open section · ',
}

const IDLE = {
  homeHead: (name) => `${name} has no version in progress.`,
  homeDetail: (backlog) => `${backlog > 0 ? `${backlog} backlog ticket${backlog === 1 ? ' is' : 's are'} waiting. ` : ''}Progress shows on this screen once a new version starts.`,
  prdHead: (name) => `${name} has no PRD section in progress.`,
  prdDetail: (lastClosed) => `${lastClosed ? `The finished ${lastClosed} is in the list on the left. ` : ''}An in-progress section appears once a new version starts.`,
  prdSideLabel: 'No section in progress',
}

const PRD_READING = {
  outlineHeading: 'Outline',
  decideHeading: 'To decide',
  questionsHeading: 'Open questions',
  ticketsHeading: 'Tickets waiting for a decision',
  goToPrd: 'Go to PRD',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  resetFolds: 'Reset',
  openMark: 'open',
  closedMark: 'closed',
  noDecide: 'Nothing to decide right now.',
  noQuestions: 'No open questions.',
  noTickets: 'No decision tickets are waiting.',
  reviewQuestions: (n) => `${n} to check at screen approval`,
  cardsHeading: (n) => `${n} item${n === 1 ? '' : 's'}`,
  lineCount: (n) => `${n} line${n === 1 ? '' : 's'}`,
  metaSummary: 'About this document: created · status · file layout',
  pairTitle: 'As-Is → To-Be',
  pairHeads: ['As-Is', 'To-Be'],
  pairCount: (n) => `${n} pair${n === 1 ? '' : 's'}`,
  groupCount: (g, n) => `Group ${g} · ${n} pair${n === 1 ? '' : 's'}`,
  movedPrefix: /^\((v\d[\d.]*) (?:로 옮김|moved),\s*(T-\d+)\)\s*/,
  movedTag: (v, t) => `moved to ${v} · ${t}`,
  movedTitle: 'Moved items',
  initialOpen: /^(합격선|Gate|What|Open Questions|As-Is → To-Be)(\s|$)/,
  asIsSection: /^As-Is(\s|$)/,
  toBeSection: /^To-Be(\s|$)/,
  questionsSection: /^Open Questions(\s|$)/,
  whatSection: /^What(\s|$)/,
  reviewGroup: /승인|approv/i,
}

const FRAME = {
  openInNewTab: 'Open in a new tab',
  frameTitle: 'Artifact preview',
}

const FILE_HREF_NOTE =
  'This document is not inside the page. Open the file below to read it.'

const HASH_NOTICE = {
  unknown: 'No such item was found. Back to home.',
  stale: 'It was moved or removed after the viewer was built. Back to home.',
}

const IDENTITY = {
  idle: 'idle',
  tool: 'productune',
  ticket: 'Tickets',
  cardLabel: 'Version progress summary',
  ticketBar: (done, total) => `Tickets done ${done}/${total}`,
  stage: { define: 'define', build: 'build', ship: 'ship', retro: 'retro', idle: 'idle' },
  idTitle: (project, version, stage) => `${project} = .prdt/config.json slug · ${version} = po-state.version · ${stage} = po-state.stage`,
  idIdleTitle: (project) => `${project} = .prdt/config.json slug · idle = po-state.stage is idle or there is no version`,
  cardTopTitle: (stageName, stage, done, total) => `${stageName} = the status line's name for po-state.stage(${stage}) · ${done}/${total} = done / all of this version's tickets that belong to the current stage (status line "stage: ${stageName} ${done}/${total}", stageOfTicketType rule)`,
  countTitle: 'Tickets = done / all of the open + done tickets in this version folder (dropped excluded, any type)',
  decTitle: 'dec = number of open tickets with type: decision (status line decision)',
  reqTitle: 'req = number of open · assignee: user · non-decision tickets whose predecessors are all closed (status line request)',
  toolTitle: 'Tool name · tool version = the top ## line of the installed package\'s docs/RELEASES.md (prdt --version)',
}

const THEME_TOGGLE = {
  toDark: 'Switch to dark mode',
  toLight: 'Switch to light mode',
}

const OPTION_CARD = {
  headers: { option: 'name', options: 'name', 선택지: 'name', result: 'result', 결과: 'result', example: 'example', 'to-be example': 'example', 예시: 'example', 'to-be 예시': 'example', pros: 'pros', 장점: 'pros', cons: 'cons', 단점: 'cons', 'trade-off': 'tradeoff', recommend: 'rec', recommendation: 'rec', 권장: 'rec', 추천: 'rec', 권고: 'rec' },
  facts: { result: ['Result', ''], pros: ['Pros', 'p'], cons: ['Cons', 'c'], tradeoff: ['Trade-off', ''] },
  example: 'Example',
  recommended: 'Recommended',
  chosen: '✓ Chosen',
  why: 'Why recommended',
  noRec: /^(—|-|none|없음)$/i,
  recPrefix: /^(?:✅\s*)?(?:\*{0,2}(?:권고|recommended?)\*{0,2}\s*[—–-]?\s*)?/i,
  pickPatterns: [
    /^[ \t]*[-*][ \t]*(?:선택|choice|chosen|pick):[ \t]*([A-Za-z]|\d+)[ \t]*$/im,
    /=\s*([A-Z])(?![A-Za-z0-9가-힣])/,
    /["“*「]\s*(?:\d+\s*)?([A-Z])\s*(?:안|["”*」.]|$)/m,
    /(?:^|[\s—-])(?:option\s+)?([A-Z])\s*(?:안|option\b)/m,
  ],
}

const LINKS = {
  lineRef: ' line (?<n>\\d+)',
  stageRef: '(?= stage \\d+)',
  playbookRef: '(?= playbook(?![\\w-]))',
  menuSuffix: ' menu',
}

export default {
  STORE_LABEL, COMMON, noGroupLabel, ENV, PAGE, HOME, PROGRESS_OUT_OF_SCOPE_LABEL, DETAIL_FIELD_LABELS, TICKET, WIKI, FEATURE,
  GLOSSARY, RELEASE, DISCIPLINE, DISCIPLINE_LOAD, readFieldValue, ARTIFACT, PRD, IDLE, PRD_READING, FRAME, FILE_HREF_NOTE,
  HASH_NOTICE, IDENTITY, THEME_TOGGLE, OPTION_CARD, LINKS,
}
