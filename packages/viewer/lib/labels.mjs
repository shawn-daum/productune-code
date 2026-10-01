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
export const STORE_LABEL = { home: '홈', prd: 'PRD', ticket: '티켓', wiki: '위키', feature: '기능', artifact: '아티팩트', glossary: '용어 사전', release: '릴리즈 노트' }

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

export const PAGE = {
  title: 'productune 뷰어',
  h1: 'productune — 뷰어',
}

// T-708 결함 11 (PO 결정, 사용자 축자 "티켓목록이랑 prd버튼 좌측 패널에 있는데
// 굳이 메인페널에 있을필요없"): 카드 아래 '티켓 목록 보기'·'PRD 열기' 버튼은
// 사이드바 '티켓'·'PRD' 행과 같은 이동이라 없앴다 — gotoTickets/openPrd 라벨도
// 함께 제거.
export const HOME = {
  working: '진행 상황',
  legendMain: '담당',
  legendDerived: '검수',
  overall: '전체',
  // T-792: 홈의 이번 버전 결정 묶음 — 사용자 표현 "결정은 홈에 신설하자" 그대로.
  decision: '결정',
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
export const PROGRESS_OUT_OF_SCOPE_LABEL = '항목 밖'

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
  tableHeaders: ['ID', '제목(slug)', '유형', '상태', '담당'],
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
  linksHeading: '함께 쓰는 기능',
  linksEmpty: '연결된 기능이 아직 없어요.',
  evidenceHeading: '근거 티켓',
  specHeading: '스펙 파일',
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

// ---------- interaction script strings (embedded into the browser-side JS
// via JSON.stringify at generation time — still this ONE label layer, never
// a second copy hand-typed inside the template string) ----------
export const FILE_HREF_NOTE =
  // T-705 §C 제안 교체 문구 그대로(해요체 등록 통일).
  '이 문서는 페이지 안에 들어있지 않아요 — 아래 파일을 열어서 봐요.'

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
