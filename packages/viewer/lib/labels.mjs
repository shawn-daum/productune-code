// viewer/lib/labels.mjs — the ONE label layer for the generated viewer (T-706).
//
// Every user-visible string the viewer renders lives here, sourced from
// T-705's Designer verdict (docs/tickets/v1.10/T-705.md §outcome, tables
// A/B/C/F): A = keep (wording unchanged, only its location moves here), B/C
// = new wording (the Designer's exact replacement text), F = the wiki group
// label table. render.mjs imports this module rather than embedding any
// Korean (or other user-facing) string literal itself — enforced by
// scripts/qa/viewer-labels.test.ts, which asserts render.mjs's own source
// carries no Hangul character outside a comment.
//
// Register (T-705 §E): every string below reads 해요체, matching the
// mockup's own #labels JSON voice — no store's copy stays in the old
// formal '-다' register.

// ---------- A. kept verbatim (relocated only — T-705 §A) ----------
export const STORE_LABEL = { home: '현재 버전', prd: 'PRD', ticket: '티켓', wiki: '위키', feature: '기능', artifact: '아티팩트', env: 'env', glossary: '용어 사전', release: '릴리즈 노트', disc: '규율' }

export const COMMON = {
  close: '닫기',
  // T-705 §C: no aria-label this specific existed in the mockup (screen-reader
  // only) — Designer's proposed wording, sharpened from a bare "상세".
  detailPanel: '상세 패널',
}

// T-708 결함 7: a store whose sidebar collapses to exactly one group (feature,
// today) shows this static line instead of a clickable group button — text
// lifted verbatim from the approved mockup (docs/artifacts/v1.10/
// define-screen-set.html ~line 4181, "그룹 없음 · 전체 3개"). `unit` is the
// caller's own count-unit word (FEATURE.countUnit '개', WIKI.countUnit '장', …)
// — this function holds no store-specific vocabulary of its own.
export function noGroupLabel(count, unit) {
  return `그룹 없음 · 전체 ${count}${unit}`
}

// T-958: the env screen and Home's env block — strings verbatim from the
// approved screen set (docs/artifacts/v1.13/define-screen-set.html
// #screen-env · home env-blk, data-label env.* · home.env.none).
export const ENV = {
  set: '설정됨',
  unset: '비어 있음',
  note: '키 이름과 설정 여부만 보여요. 값은 이 화면에 없어요.',
  sample: '견본',
  noFile: 'env 파일 없음',
  emptyHead: '이 제품에는 env 파일이 없어요.',
  emptyDetail: (dir) => `찾은 폴더: ${dir} · 찾은 이름: .env · .env.*`,
  go: 'env 보기',
  reveal: '키 목록 보기',
  mask: '키 목록 가리기',
  sampleKeys: (n) => `견본 · ${n}개 키`,
  sampleNote: '견본 파일은 설정 여부를 세지 않아요.',
  homeNone: '코드 폴더에 env 파일이 없어요.',
  machineScope: '기기 범위',
  codeWins: '제품 코드 값이 우선',
  plainValue: '보통 값',
  machineEmptyHead: '기기 범위에 저장된 키가 없어요.',
  machineEmptyDetail: '터미널에서 prdt env set <KEY> 로 저장하면 키 이름이 여기에 보여요.',
  homeNoneLine: '이 제품의 코드 폴더에 env 파일이 없어요.',
}

export const PAGE = {
  titlePrefix: '[prdt]',
  titleFallback: 'viewer',
  h1: 'productune: 뷰어',
}

// T-708 결함 11 (PO 결정, 사용자 축자 "티켓목록이랑 prd버튼 좌측 패널에 있는데
// 굳이 메인페널에 있을필요없"): 카드 아래 '티켓 목록 보기'·'PRD 열기' 버튼은
// 사이드바 '티켓'·'PRD' 행과 같은 이동이라 없앴다 — gotoTickets/openPrd 라벨도
// 함께 제거.
export const HOME = {
  working: '진행 상황',
  // T-792: 홈의 이번 버전 결정 묶음 — 사용자 표현 "결정은 홈에 신설하자" 그대로.
  decision: '결정',
  // T-1138: the 결정 bucket lists decision tickets (질문) and decision pages (기록) in one table.
  decisionHeaders: ['구분', 'ID', '제목', '상태', '버전'],
  decisionKind: { ticketOpen: '질문 · 열림', ticketDone: '질문 · 완료', ticketDropped: '질문 · 중단', page: '기록' },
  // T-881: the approved screen set's 「현재 버전」 screen (docs/artifacts/v1.12/
  // define-screen-set.html, home-progress · home-cases; T-796 outcome). The
  // matrix labels (담당 · 검수 · 전체) went with the matrix.
  here: 'now',
  // T-961: stage-bar counts as the v1.13 screen set (T-955) labels them.
  stageTickets: (n) => `티켓 ${n}`,
  stageDone: (done, total) => `티켓 완료 ${done}/${total}`,
  scope: '스코프',
  scopeSub: (n) => `이번 버전 PRD ${n}항목`,
  // T-1046: the 「PRD 항목 밖 티켓」 block — one-line definition, then (only when any) the malformed count linking to the ticket list.
  scopeOutDef: '어느 PRD 항목에도 묶이지 않은 작업 티켓이에요. 티켓의 prd_item 이 비어 있거나 열린 섹션 항목과 맞지 않아요.',
  scopeOutEmpty: '없음',
  scopeMalformed: (n) => `형식이 틀린 티켓 ${n}건`,
  // T-1046 (T-1051 = A): decision records are not scope work, so the count skips them; this note says how many.
  scopeDecisionNote: (n) => `결정 기록 ${n}건은 항목에 묶지 않아 여기서 세지 않아요.`,
  scopeDecisionLink: '결정 목록 보기',
  scopeFixTag: (n) => `형식 고치기 ${n}`,
  scopeFixTitle: '버전 없이 키만 적혀 있어요. <버전>#<키> 형식으로 고쳐 주세요.',
  waitDec: '내 결정 대기',
  waitDecEmpty: '기다리는 결정이 없어요.',
  waitReq: '사용자 작업 대기',
  waitReqEmpty: '지금 할 일이 없어요.',
  dependency: 'dependency',
  beforeBuild: 'Build 진입 전',
  notConnected: '메인 패스가 아직 이어지지 않았어요. 합격선 티켓과 설계 → 구현 → QA → 배포 deps 가 Build 진입 때 생겨요. 지금은 「크리티컬 패스」만 보여요.',
  notConnectedBuilt: '메인 패스가 아직 이어지지 않았어요. 합격선 티켓과 설계 → 구현 → QA → 배포 deps 가 아직 없어요. 지금은 「크리티컬 패스」만 보여요.',
  // The screen set draws no state for "no open ticket at all"; this line is a
  // developer-written gap, reported in T-881 unresolved for the designer.
  dependencyEmpty: '열린 티켓이 없어요.',
  chipMain: '메인 패스',
  chipCritical: '크리티컬 패스',
  chipGate: '합격선',
  chipRider: '라이더',
  chipTurn: '사용자를 기다림',
  legendMainCritical: '메인 패스 · 크리티컬 패스',
  legendRider: '메인 패스 외의 best effort 작업',
  legendDone: '끝난 티켓',
  nodeOpen: (id) => `${id} 상세 열기`,
}

// T-795: the progress matrix's per-item row labels no longer live here as a
// hand-typed map (that map hardcoded productune's own v1.10 PRD item keys —
// a v1.11 item, or another project's own items, had no entry at all and fell
// back to their raw key). Every row's label now comes straight from the open
// PRD version section's own `#### <key> — <label>` heading text
// (collect.mjs's `collectPrdOpenItems`, consumed by render.mjs's
// `homeProgressBody`) — real PRD prose, not a second copy of it kept in code.
//
// 'out-of-scope' is the ONE row here that is NOT a PRD item at all (a ticket
// with no `prd_item`, or one whose item isn't in the open section) — it has
// no PRD heading to read a label from, so it keeps its own hardcoded label,
// same as every other genuine UI copy string in this file (§A keep, PRD.md's
// own existing "항목 밖" idiom reused verbatim).
export const PROGRESS_OUT_OF_SCOPE_LABEL = 'PRD 항목 밖 티켓'

// T-705 §B: spec_since 라벨을 영문 키 그대로 노출하던 것을 '시작 버전'으로.
export const DETAIL_FIELD_LABELS = {
  type: '유형',
  status: '상태',
  assignee: '담당',
  created: '생성일',
  version: '버전',
  spec_since: '시작 버전',
  kind: '종류',
}

// ---------- ticket store ----------
export const TICKET = {
  // T-705 §B: 2번째 헤더 'slug'(영문 그대로) → '제목(slug)'.
  tableHeaders: ['ID', '제목(slug)', '유형', '상태', '담당', '추가일'],
  sidebarLabel: '티켓',
  backlogLabel: 'backlog', // §A keep — 목업도 영문 소문자 그대로
  // T-709 결정 1: the current-version sidebar row's label tag —
  // `${currentVersion} · 현재` (e.g. "v1.10 · 현재"). Every other bucket row
  // (including backlog) shows its own bucket id plainly, no status word.
  currentTag: '현재',
  // §A keep — 목업 실측 문안 그대로(둘째 줄 포함, 개시 조건 있는 실제 사례).
  empty: '아직 티켓이 없어요.<br><span style="font-size:11px;">PO 가 첫 티켓을 만들면 여기 나타나요.</span>',
  // T-705 §B: raw fm.status(open/done/dropped)를 그대로 찍던 것 → 한글 텍스트.
  statusText: { open: '진행 중', done: '완료', dropped: '중단' },
  countUnit: '건',
}

// ---------- wiki store ----------
export const WIKI = {
  tableHeaders: ['파일', '제목', '상태', '버전'],
  sidebarLabel: '위키',
  // T-705 §E: 원문 '이 묶음에는 위키 문서가 없다.'를 해요체로. 둘째 줄은 T-707 확정
  // (분류-중립 문장 — 위키 사이드바는 frontmatter type 별로 그룹지어 렌더하므로 이
  // 문구가 여러 분류에서 재사용된다).
  empty:
    '이 묶음에는 위키 문서가 없어요.<br><span style="font-size:11px;">이 분류로 문서가 하나라도 쓰이면 여기 나타나요.</span>',
  // T-705 §D: 같은 pill 클래스(done 등)라도 스토어마다 다른 한글 — 위키/기능은 live=유효.
  statusText: { live: '유효', superseded: '대체됨', '': '미기재' },
  // T-705 §F — raw type → 최종 라벨("한글 라벨 (raw 영문)", feature 타입만 예외).
  groupLabels: {
    decision: '결정 (decision)',
    fact: '사실 (fact)',
    feature: '위키 · 기능 태그 (history)',
    learning: '교훈 (learning)',
    retro: '회고 (retro)',
    term: '용어 (term)',
  },
  unclassifiedLabel: '미분류', // §B: 영문 "UNCLASSIFIED" 그대로 노출하던 것 → 괄호 없이 '미분류'
  countUnit: '장',
}

// ---------- feature store ----------
// T-882: the feature screen reads the feature taxonomy (.prdt/config.json
// features.taxonomy + vocab) — strings below are the approved copy of
// T-808 outcome 「승인 문구」 and the approved mockup
// docs/artifacts/v1.12/feature-screen.html. Area / kind names and
// definitions are project data (config), never copy kept here.
export const FEATURE = {
  // T-901 = B: a project WITHOUT features.taxonomy keeps the pre-T-882 spec-file list.
  specList: {
    tableHeaders: ['기능', '제목', '상태', '시작 버전'],
    statusText: { live: '유효', superseded: '대체됨', '': '미기재' },
  },
  tableHeaders: ['이름', '종류', '정의', '티켓'],
  sidebarLabel: '기능',
  allLabel: '전체',
  empty: '기능 분류가 없어요.<br><span style="font-size:11px;">분류가 만들어지면 여기 나타나요.</span>',
  countUnit: '개',
  fields: { kind: '종류', area: '영역', tickets: '티켓', version: '버전', read: '읽기' },
  linksHeading: '연관 기능',
  linksEmpty: '연결된 기능이 아직 없어요.',
  evidenceHeading: '근거 티켓',
  evidenceEmpty: '근거 티켓이 아직 없어요.',
  specHeading: '스펙 파일',
  // T-964: the approved screen set's #screen-feature (T-955) — five guide sections from config
  // features.vocab.<key>.taxonomy.guide, in this order. No user screen (kind internal · component): T-1026 ③.
  guide: { when: '사용 상황', ux: '화면 구성', logic: '동작 방식', limits: '한계', example: '사례' },
  // T-1049 (T-1055 = A): `guide.ux[].at` = `<surface>.<part>` (or a bare `<surface>`). The viewer draws
  // these four surfaces as a map and numbers the tile whose part an item points at. `prdt doctor`
  // (SURFACE_KEYS in packages/core/scripts/prdt) checks the same keys — a test keeps both in step.
  surfaces: [
    { key: 'terminal', name: '터미널 대화', parts: [['chat', 'PO · 에이전트 답'], ['hook', '훅 안내 줄']] },
    { key: 'statusline', name: '상태줄', parts: [['stage', '단계 진행'], ['ticket', '티켓 번호']] },
    { key: 'viewer', name: '뷰어', parts: [['activity', '왼쪽 막대'], ['home', '현재 버전'], ['prd', 'PRD'], ['wiki', '위키'], ['disc', '규율']] },
    { key: 'cli', name: 'prdt 명령', parts: [['doctor', 'prdt doctor'], ['wiki', 'prdt wiki'], ['inbox', 'prdt inbox']] },
  ],
  specLink: (n) => `스펙 파일 · 지금 참인 것 ${n}줄 ›`,
  specTruthHeading: '지금 참인 것',
  specLinkBare: '스펙 파일 ›',
  flowSource: '흐름도 원문 (mermaid)',
  limitsNone: '알려진 한계 없음',
  noScreenKinds: ['internal', 'component'],
  noScreen: '사용자 화면 없음',
  guideEmptyHead: '이 기능의 설명을 아직 적지 않았어요.',
  guideEmptyDetail: '새로 생긴 기능이라 설명이 아직 없어요. 언제 쓰는지 · 어떻게 보이고 동작하는지는 이 기능을 만든 티켓이 채워요.',
  back: '← 돌아가기 · ',
  ticketUnit: '건',
  // mockup 상세 「티켓」 칸 실측: 「3건 · 완료 2 · 열림 1」, 근거 티켓 「T-353(열림)」.
  ticketStatus: { done: '완료', open: '열림', dropped: '취소' },
}

// ---------- glossary store (T-883) ----------
// Approved mockup docs/artifacts/v1.12/define-screen-set.html (screens
// 「용어 사전」 · 「릴리즈 노트」 · 「기능 상세 · 읽기 칸」) and T-873's approved
// strings: 「릴리즈 노트」, count unit 「개」, 「용어 사전 · N개」.
export const GLOSSARY = {
  sidebarLabel: '용어 사전',
  countLabel: '용어',
  countUnit: '개',
  tableHeaders: ['용어', '분류', '정의'],
  fields: { category: '분류', status: '상태' },
  empty: '용어 문서가 없어요.<br><span style="font-size:11px;">위키에 용어(term) 문서가 생기면 여기 나타나요.</span>',
}

// ---------- release-notes store (T-883) ----------
export const RELEASE = {
  sidebarLabel: '릴리즈 노트',
  countLabel: '릴리즈 노트',
  countUnit: '개',
  tableHeaders: ['버전', '제목', '날짜'],
  fields: { version: '버전', date: '날짜' },
  empty: '릴리즈 노트가 없어요.<br><span style="font-size:11px;">릴리즈 노트 파일에 버전 절이 생기면 여기 나타나요.</span>',
}

// ---------- discipline store (T-886: T-832 / T-877) ----------
// Approved strings of T-877 (mockup docs/artifacts/v1.12/discipline-links.html
// and the screen set's 「규율」 screens). `{N}` is filled in by the page script.
export const DISCIPLINE = {
  sidebarLabel: '규율',
  allLabel: '전체',
  contractsGroup: '계약 (contracts)',
  countLabel: '규율 문서',
  countUnit: '개',
  tableHeaders: ['문서', '구분', '줄'],
  // 구분 values — 「계약」 · 「목차」 are the new words; habit · playbook are the documents' own names.
  kind: { contract: '계약', habit: 'habit', index: '목차', playbook: 'playbook' },
  fields: { kind: '구분', copy: '사본', lines: '줄' },
  copyValue: '이 기기에 적용된 사본',
  linesValue: '{N}줄',
  // The shown path of the applied copy; the file name under it is the document's own.
  copyPathPrefix: '~/.prdt/discipline/',
  differs: '저장소 원본과 {N}줄이 달라요',
  overLine: '이 문서는 {N}행까지예요. 처음부터 보여 줘요.',
  emptyLine1: '규율 문서가 없어요.',
  emptyLine2: 'prdt 규율이 적용된 기기에서 뷰어를 만들면 나타나요.',
}

// ---------- discipline load diagram (T-1050) ----------
// Approved strings of docs/artifacts/v1.13/observation-fixes.html (T-1050 tab).
// `{N}` is filled in by discipline-load.mjs. Original `when:` text is shown as
// written (English) — never translated.
export const DISCIPLINE_LOAD = {
  title: '규율이 들어오는 때',
  source: '그림 출처:',
  sourceNote: '뷰어를 만들 때마다 다시 그린다.',
  personas: [['po', 'PO'], ['designer', 'Designer'], ['developer', 'Developer'], ['qa', 'QA']],
  lane1: { head: '1. 세션 시작 (상시)', sub: '세션 · 작업자가 시작할 때 전부 들어온다', parts: '정본 규율 · 파트 {N}개', layers: '파트 뒤에 붙는 블록', part: 'part {N}' },
  lane2: { head: '2. 필요할 때 (트리거)', sub: '상시 문서의 한 줄이 이 문서를 가리킬 때 읽는다', annex: 'contracts 부속 문서 · {N}', playbooks: '{P} playbook · {N} (메뉴의 when 줄)', override: 'playbook override' },
  lane3: { head: '3. 도구를 쓸 때마다 (훅)', sub: '이벤트마다 검사하고, 막거나 기록한다', allMatcher: '(전부)', dimNoneForPo: '흐린 훅: 없음 (PO 는 전부 받는다)', dimForOthers: '흐린 훅: PO 세션에서만 움직인다' },
  precedence: {
    head: '우선순위', hint: '오른쪽이 이긴다',
    steps: [['정본 규율', 'doctrine → contracts → habit'], ['기기 override', '~/.prdt/overrides/<persona>.md'], ['기기 playbook override', '그 playbook 실행 중에만'], ['프로젝트 override', '.prdt/overrides/<persona>.md']],
    floor: '바닥 (어느 override 도 못 바꿈): Secrets 절 전체 · 사용자 동의 관문 (push · 배포 · 되돌릴 수 없는 git · 방향 확인) · 읽기 전용 조항',
  },
  detailHint: '항목을 누르면 파일 경로와 원문 조건이 여기 보여요.',
  detail: { path: '경로', when: '원문 조건 (when)', matcher: 'matcher', event: '이벤트', size: '크기', poOnly: 'PO 세션에서만 움직인다', reads: '읽는 곳', scope: '받는 쪽' },
  partDetail: '한 파트 {L} 바이트 이하 · 이 파트 {B} 바이트',
  annexNote: 'contracts.md 의 한 줄이 이 문서를 가리킬 때 읽는다',
  menuNote: '메뉴 표의 when 이 맞을 때 작업자가 스스로 고른다',
  overrideItem: ['~/.prdt/overrides/playbooks/<name>.md', '그 playbook 을 고른 순간 --playbook <name> 으로 읽는다'],
  overrideDetail: '기기 override 블록 끝의 목록에 이름이 있을 때만',
  planMissing: '세션 시작 파트를 읽지 못했어요.',
  manifestMissing: '훅 목록(hook-manifest.json)을 읽지 못했어요.',
  scopePo: 'PO 만',
  scopeAll: '모든 페르소나',
  // Display facts for hooks, keyed by file name. The manifest says WHEN a hook
  // runs; which persona it acts for, and what it reads, live in each hook's own
  // source — a hook not listed here still renders (file name only).
  layers: {
    'prdt-audience-inject.sh': ['말투 · 형식 (register)', 'po', '~/.prdt/register 의 네 키 → discipline/register/<key>-<value>.md'],
    'prdt-plan-tier-inject.sh': ['요금제 등급 (plan-tier)', 'po', '~/.prdt/plan-tier'],
    'prdt-inbox-inject.sh': ['다른 프로젝트 권고 (inbox)', 'po', '~/.prdt/inbox.md 중 이 프로젝트 앞 줄'],
    'prdt-overrides-inject.sh': ['기기 override', 'all', '~/.prdt/overrides/<persona>.md (+ playbook override 목록)'],
    'prdt-project-overrides-inject.sh': ['프로젝트 override', 'all', '.prdt/overrides/<persona>.md'],
  },
  poOnlyHooks: ['prdt-user-prompt.sh', 'prdt-question-check.sh'],
}

/** 「읽기」 칸 값 — 「용어 사전 · 5개」 · 「릴리즈 노트 · 18개」. */
export function readFieldValue(label, count, unit) {
  return `${label} · ${count}${unit}`
}

// ---------- artifact store ----------
export const ARTIFACT = {
  // T-705 §G: '크기' 열 추가 — 언어와 추가일 사이(목업 실측 순서).
  tableHeaders: ['경로', '종류', '상태', '티켓', '언어', '크기', '추가일'],
  sidebarLabel: '아티팩트',
  bucketSuffix: ' 버킷', // §G count-badge: "<bucket> 버킷 · N건" (목업 실측)
  // T-705 §E: 원문 '이 버킷에는 산출물이 없다.'의 목업 실측 문안(둘째 줄 포함, §A keep).
  empty: '아직 산출물이 없어요.<br><span style="font-size:11px;">버전이 열리면 이 버킷에 manifest.json 이 생겨요.</span>',
  // T-705 §B: raw f.status 를 pill 없이 그대로 찍던 것 → pill + 한글 텍스트.
  statusText: { pending: '대기', approved: '승인', archived: '보관' },
  countUnit: '건',
}

// ---------- PRD store ----------
// T-709 결정 2: the "닫힌 버전" combined list→detail group (`closedLabel` /
// `tableHeaders` / `empty`) is gone — every closed round is now its own
// sidebar row, labeled with its own version id, rendering its own body
// directly (no title extraction, no table, no empty-state copy needed: a
// zero-closed-round repo just has fewer rows, never an empty list to caption).
export const PRD = {
  openLabelPrefix: '열린 섹션 · ',
}

// T-1108: a product with no open version / PRD section — strings verbatim from the approved
// screen set (docs/artifacts/v1.14/define-screen-set.html #screen-home-products · #screen-side-products,
// data-label home.idle.* · prd.idle.*). The product name, backlog count and last closed version fill the sample's slots.
export const IDLE = {
  homeHead: (name) => `${name} 는 지금 진행 중인 버전이 없어요.`,
  homeDetail: (backlog) => `${backlog > 0 ? `backlog 티켓 ${backlog}건이 대기 중이에요. ` : ''}새 버전을 시작하면 이 화면에 진행 상황이 보여요.`,
  prdHead: (name) => `${name} 는 진행 중인 PRD 섹션이 없어요.`,
  prdDetail: (lastClosed) => `${lastClosed ? `완료한 ${lastClosed} 은 왼쪽 목록에서 볼 수 있어요. ` : ''}새 버전을 시작하면 진행 중인 섹션이 생겨요.`,
  prdSideLabel: '진행 중인 섹션 없음',
}

// T-884 (T-860 / T-874): the open PRD's reading screen — outline, folds, 「결정할 것」 box,
// What cards. Strings are the T-874-approved set (docs/artifacts/v1.12/prd-reading.html;
// 「열린 질문」 → 「남은 질문」 and 「N줄」 kept per the T-874 log).
export const PRD_READING = {
  outlineHeading: '목차',
  decideHeading: '결정할 것',
  questionsHeading: '남은 질문',
  ticketsHeading: '결정 대기 티켓',
  goToPrd: 'PRD 로 이동',
  expandAll: '모두 펼치기',
  collapseAll: '모두 접기',
  resetFolds: '처음 상태로',
  openMark: '펼침',
  closedMark: '접힘',
  noDecide: '지금 정할 것이 없어요.',
  noQuestions: '남은 질문이 없어요.',
  noTickets: '기다리는 결정 티켓이 없어요.',
  reviewQuestions: (n) => `화면 승인 때 볼 것 ${n}건`,
  cardsHeading: (n) => `항목 ${n}개`,
  lineCount: (n) => `${n}줄`,
  // T-928 (approved mockup docs/artifacts/v1.13/define-screen-set.html #screen-prd): the head's
  // machine/meta paragraph folds behind one line; As-Is + To-Be read as one paired table.
  // T-970: As-Is / To-Be are never translated, so the heading and the column heads stay English.
  metaSummary: '이 문서에 대해: 만든 날 · 상태 · 파일 구성',
  pairTitle: 'As-Is → To-Be',
  pairHeads: ['As-Is', 'To-Be'],
  pairCount: (n) => `${n}쌍`,
  // T-1048: pairs grouped by the PRD's `####` meaning groups; pairs whose To-Be starts with the
  // `(v1.14 로 옮김, T-1021)` prefix gather into one muted group at the bottom.
  groupCount: (g, n) => `묶음 ${g} · ${n}쌍`,
  movedPrefix: /^\((v\d[\d.]*) 로 옮김,\s*(T-\d+)\)\s*/,
  movedTag: (v, t) => `${v} 로 옮김 · ${t}`,
  movedTitle: '옮긴 항목',
  // The PRD contract's own section names this screen keys off (never copy shown to a reader):
  // sections folded open at first (under the open version), the §Open Questions heading,
  // the §What heading, and the question-group titles.
  initialOpen: /^(합격선|What|Open Questions|As-Is → To-Be)(\s|$)/,
  asIsSection: /^As-Is(\s|$)/,
  toBeSection: /^To-Be(\s|$)/,
  questionsSection: /^Open Questions(\s|$)/,
  whatSection: /^What(\s|$)/,
  reviewGroup: /승인/,
}

// ---------- interaction script strings (embedded into the browser-side JS
// via JSON.stringify at generation time — still this ONE label layer, never
// a second copy hand-typed inside the template string) ----------
// T-1010: an HTML artifact shows in the side panel itself (iframe) with a
// control that opens the same file in a new browser tab (T-1067: an item of
// the detail's attribute row; no explanatory line).
export const FRAME = {
  openInNewTab: '새 탭에서 열기',
  frameTitle: '산출물 미리보기',
}

export const FILE_HREF_NOTE =
  // T-705 §C 제안 교체 문구 그대로(해요체 등록 통일).
  '이 문서는 페이지 안에 들어있지 않아요. 아래 파일을 열어서 봐요.'

// T-746: the home notice when the viewer is opened at an `#id` it cannot
// show (approved screen set docs/artifacts/v1.11/define-screen-set.html,
// 화면 「뷰어 홈 — 모르는/낡은 id」 · #labels `notice.unknown` /
// `notice.stale`, text after the `#id` verbatim). The page prints
// `#<id> — <text>`, the id exactly as received.
export const HASH_NOTICE = {
  unknown: '이런 항목을 찾을 수 없어요. 홈으로 돌아왔어요.',
  stale: '뷰어를 만든 뒤 옮겨지거나 지워졌어요. 홈으로 돌아왔어요.',
}

// T-797 개정: the topstrip's light/dark toggle — its accessible name says
// what pressing it does next (the page opens light by default).
export const THEME_TOGGLE = {
  toDark: '다크 모드로 바꾸기',
  toLight: '라이트 모드로 바꾸기',
}

// T-998 (T-999 = C): a decision ticket's `options` table drawn as cards.
// `headers` maps a column header (parenthetical dropped, lower-cased) to its
// role; `facts` = the labelled rows in a card, [label, dt class].
export const OPTION_CARD = {
  // a column whose header is not here still renders, labelled with its own header text (T-1132)
  headers: { 선택지: 'name', 결과: 'result', 예시: 'example', 'to-be 예시': 'example', pros: 'pros', 장점: 'pros', cons: 'cons', 단점: 'cons', 'trade-off': 'tradeoff', recommend: 'rec', 권장: 'rec', 추천: 'rec', 권고: 'rec' },
  facts: { result: ['결과', ''], pros: ['장점', 'p'], cons: ['단점', 'c'], tradeoff: ['절충', ''] },
  example: '예시',
  recommended: '권고',
  chosen: '✓ 선택됨',
  why: '권고 이유',
  // a recommend cell with no recommendation in it
  noRec: /^(—|-|없음)$/,
  // the leading 「권고」 marker in a recommend cell, dropped to leave the reason
  // (and a leading ✅ an authored 권장 cell opens with)
  recPrefix: /^(?:✅\s*)?(?:\*{0,2}권고\*{0,2}\s*[—–-]?\s*)?/,
  // which letter the answer picked, in the `## outcome` text: the PO's "= B" reading,
  // then a lone letter inside the verbatim quote, then "A 안"
  // the PO's normalized line comes first: `- 선택: B` (a letter, or a number for numbered options)
  pickPatterns: [
    /^[ \t]*[-*][ \t]*선택:[ \t]*([A-Za-z]|\d+)[ \t]*$/m,
    /=\s*([A-Z])(?![A-Za-z0-9가-힣])/,
    /["“*「]\s*(?:\d+\s*)?([A-Z])\s*(?:안|["”*」.]|$)/m,
    /(?:^|[\s—-])([A-Z])\s*안/m,
  ],
}
