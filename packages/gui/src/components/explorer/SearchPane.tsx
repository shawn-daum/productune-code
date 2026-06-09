import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown, ChevronRight, Search, Loader2, Info,
  File, FileText, FileCode, FileImage,
} from 'lucide-react'
import { useSearch } from '../../store/search'
import type { SearchFileGroup, SearchMatch, SearchMatchRange } from '../../store/search'
import { useWorkspace } from '../../store/workspace'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 240
const ACCENT = '#8B5CF6'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.log') {
    return <FileText size={13} strokeWidth={1.75} color="#8ab4f8" />
  }
  if (ext === '.html' || ext === '.htm' || ext === '.ts' || ext === '.tsx' ||
      ext === '.js' || ext === '.jsx' || ext === '.css' || ext === '.json' ||
      ext === '.yml' || ext === '.yaml') {
    return <FileCode size={13} strokeWidth={1.75} color="#8ab4f8" />
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
    return <FileImage size={13} strokeWidth={1.75} color="#8ab4f8" />
  }
  return <File size={13} strokeWidth={1.75} color="#606060" />
}

/** Split a match line into segments around the highlight ranges. */
function renderMatchText(text: string, ranges: SearchMatchRange[]): React.ReactNode[] {
  const sorted = [...ranges]
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(text.length, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  if (sorted.length === 0) return [text]
  const out: React.ReactNode[] = []
  let cursor = 0
  // Trim leading whitespace for display (VS Code style) — but keep alignment of
  // the first non-space so the highlight position stays meaningful.
  sorted.forEach((r, idx) => {
    if (r.start < cursor) return
    if (r.start > cursor) out.push(text.slice(cursor, r.start))
    out.push(<mark key={`m${idx}`} style={markStyle}>{text.slice(r.start, r.end)}</mark>)
    cursor = r.end
  })
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  projectDir: string
}

export default function SearchPane({ projectDir }: Props) {
  const { t } = useTranslation()
  const {
    query, options, status, result, errorMsg,
    collapsed, setQuery, toggleOption, setStatus, setResult, setError,
    toggleCollapsed, collapseAll, expandAll,
  } = useSearch()
  const { openTab } = useWorkspace()

  const [open, setOpen] = useState(true)
  const [activeMatch, setActiveMatch] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqSeqRef = useRef(0)

  // ── Debounced search driver ───────────────────────────────────────────────
  const runSearch = useCallback(
    (q: string) => {
      const api = (window as any).api
      if (!api?.searchContent || !projectDir) return
      const trimmed = q.trim()
      if (!trimmed) {
        setStatus('idle')
        setResult(null)
        setError(null)
        return
      }
      const seq = ++reqSeqRef.current
      setStatus('searching')
      // Always project-wide — scopeDir = null (T-PATCH-049: scope toggle removed)
      const scopeDir = null
      api.searchContent({ projectDir, scopeDir, query: trimmed, options })
        .then((res: any) => {
          // Ignore stale responses (a newer request superseded this one).
          if (seq !== reqSeqRef.current) return
          if (res?.error) {
            setError(res.error)
            setResult(res)
            setStatus('error')
            return
          }
          setError(null)
          setResult(res)
          setStatus(res.fileCount > 0 ? 'results' : 'noresult')
        })
        .catch((e: any) => {
          if (seq !== reqSeqRef.current) return
          setError(e?.message ?? 'search failed')
          setStatus('error')
        })
    },
    [projectDir, options, setStatus, setResult, setError],
  )

  // Re-run on query / options change (debounced).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, options, runSearch])

  // ── Open file at match (AC-3) ──────────────────────────────────────────────
  const handleOpenMatch = useCallback(
    (group: SearchFileGroup, match: SearchMatch) => {
      const matchKey = `${group.absPath}:${match.line}`
      setActiveMatch(matchKey)
      // Unique tab id per file+line so different match lines re-open at the right
      // place; dedupe still focuses an already-open identical match.
      const tabId = `code-search:${group.absPath}:${match.line}`
      openTab(
        tabId,
        'code-search',
        { projectDir, path: group.absPath, line: match.line, ranges: match.ranges },
        group.name,
      )
    },
    [openTab, projectDir],
  )

  const allCollapsed =
    !!result && result.groups.length > 0 && result.groups.every((g) => collapsed.has(g.absPath))

  const handleCollapseAll = useCallback(() => {
    if (!result) return
    if (allCollapsed) expandAll()
    else collapseAll(result.groups.map((g) => g.absPath))
  }, [result, allCollapsed, expandAll, collapseAll])

  return (
    <div style={sectionWrap}>
      {/* Section header — collapsible "Search in files" */}
      <div
        style={sectionHead}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        title={t('workspace.search.sectionTitle')}
      >
        {open
          ? <ChevronDown size={12} strokeWidth={2.5} color="#707070" />
          : <ChevronRight size={12} strokeWidth={2.5} color="#707070" />}
        <span style={sectionLabel}>{t('workspace.search.sectionTitle')}</span>
        {result && result.totalMatches > 0 && (
          <span style={sectionCount}>{result.totalMatches}</span>
        )}
      </div>

      {open && (
        <>
          {/* Search controls */}
          <div style={searchZone}>
            <div style={searchField}>
              <Search size={13} strokeWidth={2} color="#707070" style={{ flexShrink: 0 }} />
              <input
                style={input}
                type="text"
                value={query}
                spellCheck={false}
                placeholder={t('workspace.search.placeholder')}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('workspace.search.sectionTitle')}
              />
              <span style={optRow}>
                <OptToggle
                  label="Aa"
                  on={options.caseSensitive}
                  title={t('workspace.search.optCase')}
                  onClick={() => toggleOption('caseSensitive')}
                />
                <OptToggle
                  label="|ab|"
                  on={options.wholeWord}
                  title={t('workspace.search.optWord')}
                  onClick={() => toggleOption('wholeWord')}
                  small
                />
                <OptToggle
                  label=".*"
                  on={options.regex}
                  title={t('workspace.search.optRegex')}
                  onClick={() => toggleOption('regex')}
                />
              </span>
            </div>

            <div style={ignoreHint}>
              <Info size={11} strokeWidth={1.75} color="#707070" style={{ flexShrink: 0 }} />
              {t('workspace.search.ignoreHint')}
            </div>
          </div>

          {/* Results / states */}
          {status === 'results' && result && (
            <>
              <div style={summaryBar}>
                <span>
                  {t('workspace.search.summary', {
                    matches: result.totalMatches,
                    files: result.fileCount,
                  })}
                  {result.truncated && <span style={truncatedNote}> · {t('workspace.search.truncated')}</span>}
                </span>
                <button
                  style={collapseAllBtn}
                  onClick={handleCollapseAll}
                  title={t('workspace.search.collapseAll')}
                  aria-label={t('workspace.search.collapseAll')}
                >
                  {allCollapsed
                    ? <ChevronRight size={13} strokeWidth={2} color="#707070" />
                    : <ChevronDown size={13} strokeWidth={2} color="#707070" />}
                </button>
              </div>
              <div style={resultsList}>
                {result.groups.map((group) => {
                  const isCollapsed = collapsed.has(group.absPath)
                  return (
                    <div key={group.absPath} style={fileGroup}>
                      <div
                        style={fileRow}
                        onClick={() => toggleCollapsed(group.absPath)}
                        title={group.relPath}
                      >
                        {isCollapsed
                          ? <ChevronRight size={12} strokeWidth={2.5} color="#707070" style={{ flexShrink: 0 }} />
                          : <ChevronDown size={12} strokeWidth={2.5} color="#707070" style={{ flexShrink: 0 }} />}
                        <span style={{ flexShrink: 0, display: 'flex' }}>{fileIcon(group.name)}</span>
                        <span style={fname}>{group.name}</span>
                        <span style={fpath}>{group.dir}</span>
                        <span style={fbadge}>{group.matches.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div>
                          {group.matches.map((match) => {
                            const matchKey = `${group.absPath}:${match.line}`
                            const isActive = activeMatch === matchKey
                            return (
                              <div
                                key={match.line}
                                style={isActive ? matchLineActive : matchLine}
                                onClick={() => handleOpenMatch(group, match)}
                              >
                                <span style={lineNo}>{match.line}</span>
                                <span style={matchCode}>
                                  {renderMatchText(match.text, match.ranges)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {status === 'searching' && (
            <div style={statePane} aria-live="polite">
              <Loader2 size={18} strokeWidth={2} color="#38BDF8" className="pdt-spin" />
              <p style={stateText}>{t('workspace.search.searching')}</p>
            </div>
          )}

          {status === 'noresult' && (
            <div style={statePane}>
              <Search size={28} strokeWidth={1.5} color="#707070" />
              <h3 style={stateTitle}>{t('workspace.search.noResultTitle')}</h3>
              <p style={stateText}>{t('workspace.search.noResultBody', { query: query.trim() })}</p>
              <p style={stateHint}>{t('workspace.search.noResultTip')}</p>
            </div>
          )}

          {status === 'error' && (
            <div style={statePane}>
              <Info size={28} strokeWidth={1.5} color="#E04040" />
              <h3 style={stateTitle}>{t('workspace.search.errorTitle')}</h3>
              <p style={stateText}>{errorMsg ?? t('workspace.search.errorBody')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Option toggle (VS-Code-style square) ────────────────────────────────────────

function OptToggle({
  label, on, title, onClick, small,
}: { label: string; on: boolean; title: string; onClick: () => void; small?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <span
      role="button"
      aria-pressed={on}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...optBase,
        ...(small ? { fontSize: 9 } : null),
        ...(on ? optOn : hover ? optHover : null),
      }}
    >
      {label}
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #1A1A1A',
  flex: '0 1 auto',
  minHeight: 0,
}

const sectionHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 24,
  padding: '0 8px',
  color: '#707070',
  cursor: 'pointer',
  userSelect: 'none',
  flexShrink: 0,
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const sectionCount: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  fontWeight: 600,
  color: '#A0A0A0',
  background: '#1A1A1A',
  borderRadius: 20,
  padding: '0 6px',
  lineHeight: '16px',
}

const searchZone: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 8px 10px',
  flexShrink: 0,
}

const searchField: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#0F0F0F',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '5px 8px',
}

const input: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#E8E8EA',
  fontFamily: 'inherit',
  fontSize: 13,
  minWidth: 0,
}

const optRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  marginLeft: 'auto',
}

const optBase: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 2,
  cursor: 'pointer',
  color: '#707070',
  fontSize: 10,
  fontWeight: 700,
  fontFamily: 'monospace',
  border: '1px solid transparent',
  userSelect: 'none',
}

const optHover: React.CSSProperties = {
  color: '#C8C8CC',
  background: '#1A1A1A',
}

const optOn: React.CSSProperties = {
  color: '#F0F0F0',
  background: 'color-mix(in oklab, #8B5CF6 18%, transparent)',
  borderColor: ACCENT,
}

const ignoreHint: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: '#707070',
  fontSize: 10,
  paddingLeft: 2,
}

const summaryBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  color: '#A0A0A0',
  fontSize: 12,
  borderTop: '1px solid #1A1A1A',
  borderBottom: '1px solid #1A1A1A',
  flexShrink: 0,
}

const truncatedNote: React.CSSProperties = {
  color: '#707070',
}

const collapseAllBtn: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: 4,
  padding: 0,
}

const resultsList: React.CSSProperties = {
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  flex: 1,
  padding: '2px 0 8px',
}

const fileGroup: React.CSSProperties = {
  borderBottom: '1px solid #161616',
}

const fileRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 26,
  padding: '0 8px 0 4px',
  cursor: 'pointer',
  userSelect: 'none',
}

const fname: React.CSSProperties = {
  color: '#E8E8EA',
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const fpath: React.CSSProperties = {
  color: '#707070',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}

const fbadge: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 600,
  color: '#A0A0A0',
  background: '#1A1A1A',
  borderRadius: 9999,
  minWidth: 18,
  textAlign: 'center',
  padding: '0 4px',
  lineHeight: '16px',
}

const matchLine: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '1px 8px 1px 0',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.55,
}

const matchLineActive: React.CSSProperties = {
  ...matchLine,
  background: 'color-mix(in oklab, #8B5CF6 12%, transparent)',
}

const lineNo: React.CSSProperties = {
  flexShrink: 0,
  width: 42,
  textAlign: 'right',
  color: '#505050',
  paddingRight: 4,
  userSelect: 'none',
}

const matchCode: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: 1,
  minWidth: 0,
}

const markStyle: React.CSSProperties = {
  background: 'color-mix(in oklab, #8B5CF6 30%, transparent)',
  color: '#F0F0F0',
  borderRadius: 2,
  padding: '0 1px',
  fontWeight: 600,
}

const statePane: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 10,
  padding: 24,
}

const stateTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#C8C8CC',
  margin: 0,
}

const stateText: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',
  maxWidth: 240,
  lineHeight: 1.4,
  margin: 0,
}

const stateHint: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  margin: 0,
}
