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
export const STORE_LABEL = { home: '홈', prd: 'PRD', ticket: '티켓', wiki: '위키', feature: '기능', artifact: '아티팩트' }

export const COMMON = {
  close: '닫기',
  // T-705 §C: no aria-label this specific existed in the mockup (screen-reader
  // only) — Designer's proposed wording, sharpened from a bare "상세".
  detailPanel: '상세 패널',
  // T-705 §C proposed replacement for the plain "token file sha256 <hash>" caption.
  tokenHashCaption: '토큰 파일 해시(sha256)',
}

export const PAGE = {
  title: 'productune 뷰어',
  h1: 'productune — 뷰어',
}

export const HOME = {
  working: '진행 상황',
  legendMain: '담당',
  legendDerived: '검수',
  gotoTickets: '티켓 목록 보기',
  openPrd: 'PRD 열기',
  overall: '전체',
}

// T-705 §B: linkage 연결→간선 (그래프 용어, T-600 정합). Everything else here
// is §A keep. 'out-of-scope' 는 PRD 밖 티켓의 트레일링 행(§A, PRD.md 기존 관용구
// "항목 밖" 재사용).
export const PROGRESS_ITEM_LABEL = {
  'north-star': '북극성',
  'prd-form': 'PRD 표현',
  linkage: '간선',
  'gui-deferral-marker': 'GUI 유예',
  'inherited-defects': '승계 결함',
  viewer: '뷰어',
  'ticket-frame': '티켓 틀',
  'out-of-scope': '항목 밖',
}

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
  // §A keep — 목업 실측 문안 그대로(둘째 줄 포함, 개시 조건 있는 실제 사례).
  empty: '아직 티켓이 없어요.<br><span style="font-size:11px;">PO 가 첫 티켓을 만들면 여기 나타나요.</span>',
  // T-705 §B: raw fm.status(open/done/dropped)를 그대로 찍던 것 → 한글 텍스트.
  statusText: { open: '진행 중', done: '완료', dropped: '중단' },
  // T-705 §C 제안 교체 문구 그대로.
  omittedNote:
    '지금은 이 두 묶음만 보여요 — 진행 중인 버전과, 아직 배정 안 된 백로그예요. 닫힌 라운드는 여기 없지만 아래 경로에 그대로 있어요:',
  omittedTableHeaders: ['묶음', '티켓 수', '용량', '경로'],
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
export const FEATURE = {
  // T-705 §B: 4번째 헤더 'spec_since'(영문 그대로) → '시작 버전'.
  tableHeaders: ['기능', '제목', '상태', '시작 버전'],
  sidebarLabel: '기능',
  // T-705 §E: 원문 '기능 스펙이 없다.'를 해요체로. 둘째 줄은 T-707 확정.
  empty:
    '기능 스펙이 없어요.<br><span style="font-size:11px;">Designer 가 스펙 파일을 만들면 여기 나타나요.</span>',
  statusText: { live: '유효', superseded: '대체됨', '': '미기재' },
  countUnit: '개',
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
export const PRD = {
  openLabelPrefix: '열린 섹션 · ',
  closedLabel: '닫힌 버전',
  // T-705 §G: '제목' 열 추가 — closed round title from the document, falling
  // back to its first line (render.mjs's extractTitle).
  tableHeaders: ['버전', '제목'],
  // T-705 §E: 원문 '닫힌 버전이 없다.'를 해요체로. 둘째 줄은 T-707 확정.
  empty:
    '닫힌 버전이 없어요.<br><span style="font-size:11px;">버전이 닫히면 여기 나타나요.</span>',
  countUnit: '개',
}

// ---------- interaction script strings (embedded into the browser-side JS
// via JSON.stringify at generation time — still this ONE label layer, never
// a second copy hand-typed inside the template string) ----------
export const FILE_HREF_NOTE =
  // T-705 §C 제안 교체 문구 그대로(해요체 등록 통일).
  '이 문서는 페이지 안에 들어있지 않아요 — 아래 파일을 열어서 봐요.'
