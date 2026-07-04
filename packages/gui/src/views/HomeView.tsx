import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Plus, FolderOpen, FolderCode, Clock, FolderX, MoreHorizontal } from 'lucide-react'
import logoUrl from '../assets/logo.png'
import { CardActionMenu, type CardActionMenuItem } from '../components/shared/CardActionMenu'
import ProjectDeleteConfirmModal from '../components/ProjectDeleteConfirmModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentWithMeta {
  slug: string
  projectDir: string
  openedAt: string
  exists: boolean
  phase: number | null
  version: string | null
  /** T-306: prdt flat stage (define/build/ship/retro) — null for legacy projects.
   *  Optional: tolerates a stale main process that predates the field. */
  stage?: string | null
}

// Fallback shape when listRecentsWithMeta is unavailable (legacy preload)
interface RecentLegacy {
  slug: string
  projectDir: string
  openedAt: string
  // legacy compat fields (projects:list)
  created_at?: string
  path?: string
}

interface Props {
  onNewProject: () => void
  onOpenFolder: () => void
  onOpenRecent: (projectDir: string, slug: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('app.home.relTimeJustNow')
  if (min < 60) return t('app.home.relTimeMin', { n: min })
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return t('app.home.relTimeHour', { n: hrs })
  const days = Math.floor(hrs / 24)
  return t('app.home.relTimeDay', { n: days })
}

// ── ProjectCard ───────────────────────────────────────────────────────────────

function ProjectCard({
  entry,
  onOpenRecent,
  onOpenMenu,
  menuOpen,
  t,
}: {
  entry: RecentWithMeta
  onOpenRecent: (projectDir: string, slug: string) => void
  /** Open the action menu for this card at a viewport coordinate. */
  onOpenMenu: (entry: RecentWithMeta, anchor: { x: number; y: number }) => void
  /** Whether this card's menu is currently open (keeps the ⋯ button visible). */
  menuOpen: boolean
  t: TFunction
}) {
  const [hovered, setHovered] = useState(false)
  const missing = !entry.exists
  const hasMeta = entry.version !== null || entry.phase !== null || entry.stage != null

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: '#1A1A1A',
    border: `1px solid ${hovered && !missing ? 'rgba(139,92,246,0.5)' : '#222'}`,
    borderRadius: 8,
    overflow: 'hidden',
    cursor: missing ? 'default' : 'pointer',
    transition: 'border-color 0.15s, transform 0.15s',
    transform: hovered && !missing ? 'translateY(-1px)' : 'none',
    opacity: missing ? 0.45 : 1,
    userSelect: 'none',
  }

  const showMenuBtn = hovered || menuOpen

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={missing ? undefined : () => onOpenRecent(entry.projectDir, entry.slug)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpenMenu(entry, { x: e.clientX, y: e.clientY })
      }}
    >
      {/* ⋯ action menu trigger — keyboard accessible, hover/focus visible.
          stopPropagation so it never bubbles to the card-open click. */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={t('app.home.delete.menuAria', { slug: entry.slug })}
        title={t('app.home.delete.menuAria', { slug: entry.slug })}
        style={menuBtnStyle(showMenuBtn)}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          onOpenMenu(entry, { x: r.right - 4, y: r.bottom + 4 })
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MoreHorizontal size={15} />
      </button>

      {/* Thumbnail */}
      <div style={thumbStyle}>
        <FolderCode size={28} color="#3A3A3A" />
      </div>

      {/* Body */}
      <div style={cardBodyStyle}>
        {/* Slug */}
        <div style={slugStyle}>{entry.slug}</div>

        {/* Meta row: version chip + phase badge (legacy) / stage badge (prdt, T-306) */}
        {hasMeta && (
          <div style={metaRowStyle}>
            {entry.version !== null && (
              <span style={versionChipStyle}>{entry.version}</span>
            )}
            {entry.phase !== null && (
              <span style={phaseBadgeStyle}>
                {t('app.home.phaseBadge', { n: entry.phase })}
              </span>
            )}
            {entry.phase === null && entry.stage != null && (
              <span style={phaseBadgeStyle}>
                {/* reuse the workspace stage labels (Define/Build/Ship/Retro);
                    raw value as fallback for an unknown stage string */}
                {t(`workspace.stage.${entry.stage}`, entry.stage)}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={footerStyle}>
          {missing ? (
            <>
              <FolderX size={11} color="#806060" style={{ flexShrink: 0 }} />
              <span>{t('app.home.folderMissing')}</span>
            </>
          ) : (
            <>
              <Clock size={11} color="#505050" style={{ flexShrink: 0 }} />
              <span>{relativeDate(entry.openedAt, t)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HomeView ──────────────────────────────────────────────────────────────────

export default function HomeView({ onNewProject, onOpenFolder, onOpenRecent }: Props) {
  const { t } = useTranslation()
  const [recents, setRecents] = useState<RecentWithMeta[]>([])
  // T-PATCH-134: single open menu + delete-confirm target.
  const [menu, setMenu] = useState<{ entry: RecentWithMeta; anchor: { x: number; y: number } } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecentWithMeta | null>(null)

  // (a) remove-from-recents-only — non-destructive, no confirm. Optimistic drop,
  // then reconcile from the IPC's refreshed list.
  const handleRemoveFromList = (entry: RecentWithMeta) => {
    setRecents((prev) => prev.filter((e) => e.projectDir !== entry.projectDir))
    const api = (window as any).api
    api.removeRecent?.({ projectDir: entry.projectDir }).catch(() => {})
  }

  // (b) delete-from-disk — invoked by the confirm modal. Drops the card on success.
  const handleDeleteFromDisk = async (entry: RecentWithMeta) => {
    const api = (window as any).api
    const result = await api.deleteProject?.({ projectDir: entry.projectDir })
    if (result?.ok) {
      setRecents((prev) => prev.filter((e) => e.projectDir !== entry.projectDir))
    }
    return result ?? { ok: false, error: 'delete unavailable' }
  }

  const buildMenuItems = (entry: RecentWithMeta): CardActionMenuItem[] => {
    const items: CardActionMenuItem[] = []
    if (entry.exists) {
      items.push({
        key: 'open',
        label: t('app.home.delete.menuOpen'),
        onSelect: () => onOpenRecent(entry.projectDir, entry.slug),
      })
    }
    items.push({
      key: 'remove',
      label: t('app.home.removeFromList'),
      onSelect: () => handleRemoveFromList(entry),
    })
    if (entry.exists) {
      items.push({
        key: 'delete',
        label: t('app.home.delete.menuDelete'),
        danger: true,
        separatorBefore: true,
        onSelect: () => setDeleteTarget(entry),
      })
    }
    return items
  }

  useEffect(() => {
    const api = (window as any).api
    // T-PATCH-213: browser-dev-mode (no preload bridge) → api undefined. Guard the
    // property deref so the mount effect is a clean no-op instead of throwing into
    // the ErrorBoundary on the HomeView boot path.
    if (!api) return

    if (api.listRecentsWithMeta) {
      // T-PATCH-114: preferred path — full meta including exists:false entries
      api.listRecentsWithMeta()
        .then((entries: RecentWithMeta[]) => setRecents(entries))
        .catch(() => {
          // fallback: listRecents (filters missing dirs, no meta)
          api.listRecents?.()
            .then((es: RecentLegacy[]) =>
              setRecents(es.map((e) => ({
                slug: e.slug,
                projectDir: e.projectDir,
                openedAt: e.openedAt,
                exists: true,
                phase: null,
                version: null,
              })))
            )
            .catch(() => {})
        })
    } else if (api.listRecents) {
      // T-PATCH-050 preload without T-PATCH-114: meta-less card fallback (slug+time only)
      api.listRecents()
        .then((es: RecentLegacy[]) =>
          setRecents(es.map((e) => ({
            slug: e.slug,
            projectDir: e.projectDir,
            openedAt: e.openedAt,
            exists: true,
            phase: null,
            version: null,
          })))
        )
        .catch(() => {
          api.listProjects?.()
            .then((ps: any[]) =>
              setRecents(ps.map((p) => ({
                slug: p.slug,
                projectDir: p.path,
                openedAt: p.created_at,
                exists: true,
                phase: null,
                version: null,
              })))
            )
            .catch(() => {})
        })
    } else {
      api.listProjects?.()
        .then((ps: any[]) =>
          setRecents(ps.map((p) => ({
            slug: p.slug,
            projectDir: p.path,
            openedAt: p.created_at,
            exists: true,
            phase: null,
            version: null,
          })))
        )
        .catch(() => {})
    }
  }, [])

  // ── Empty state (hero) ──────────────────────────────────────────────────────
  if (recents.length === 0) {
    return (
      <div style={wrapCenter}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <img
            src={logoUrl}
            alt="Productune"
            style={{ height: 52, width: 'auto', objectFit: 'contain', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Productune
        </div>
        <div style={{ fontSize: 12, color: '#505050', marginBottom: 40 }}>product orchestrator</div>

        <div style={btnGroupVertical}>
          <button style={btnPrimary} onClick={onNewProject}>
            <Plus size={14} strokeWidth={2.25} />
            <span>{t('app.home.newProject')}</span>
          </button>
          <button style={btnSecondary} onClick={onOpenFolder}>
            <FolderOpen size={14} strokeWidth={2} />
            <span>{t('app.home.openExisting')}</span>
          </button>
        </div>

        <div style={{ marginTop: 40, color: '#505050', fontSize: 13 }}>{t('app.home.noRecent')}</div>
      </div>
    )
  }

  // ── Populated launcher (CapCut-style top-aligned) ───────────────────────────
  return (
    <div style={wrapTop}>
      {/* Header — logo + wordmark + tagline */}
      <div style={launcherHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={logoUrl}
            alt="Productune"
            style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Productune
            </div>
            <div style={{ fontSize: 11, color: '#505050', lineHeight: 1.3 }}>product orchestrator</div>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={actionsRowStyle}>
        <button style={btnPrimary} onClick={onNewProject}>
          <Plus size={14} strokeWidth={2.25} />
          <span>{t('app.home.newProject')}</span>
        </button>
        <button style={btnSecondary} onClick={onOpenFolder}>
          <FolderOpen size={14} strokeWidth={2} />
          <span>{t('app.home.openExisting')}</span>
        </button>
      </div>

      {/* Projects section */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>{t('app.home.projects')}</div>

        {/* Scrollable grid */}
        <div style={gridWrapStyle}>
          <div style={gridStyle}>
            {recents.map((entry) => (
              <ProjectCard
                key={entry.projectDir}
                entry={entry}
                onOpenRecent={onOpenRecent}
                onOpenMenu={(en, anchor) => setMenu({ entry: en, anchor })}
                menuOpen={menu?.entry.projectDir === entry.projectDir}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>

      {/* T-PATCH-134: card action menu (⋯ / right-click) — single instance */}
      {menu && (
        <CardActionMenu
          anchor={menu.anchor}
          items={buildMenuItems(menu.entry)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* T-PATCH-134 (b): disk-delete strong-confirm modal */}
      {deleteTarget && (
        <ProjectDeleteConfirmModal
          slug={deleteTarget.slug}
          projectDir={deleteTarget.projectDir}
          onConfirm={() => handleDeleteFromDisk(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BASE: React.CSSProperties = {
  background: '#0F0F0F',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: '#F0F0F0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  userSelect: 'none',
  overflow: 'hidden',
}

const wrapCenter: React.CSSProperties = {
  ...BASE,
  justifyContent: 'center',
}

const wrapTop: React.CSSProperties = {
  ...BASE,
  justifyContent: 'flex-start',
}

const launcherHeaderStyle: React.CSSProperties = {
  paddingTop: 48,
  display: 'flex',
  justifyContent: 'center',
}

const actionsRowStyle: React.CSSProperties = {
  marginTop: 20,
  display: 'flex',
  flexDirection: 'row',
  gap: 8,
}

const sectionStyle: React.CSSProperties = {
  marginTop: 36,
  width: '100%',
  maxWidth: 960,
  padding: '0 32px',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 12,
}

const gridWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  // T-PATCH-214 #4: small top pad so the top card's hover lift (translateY -1px)
  // + 1px purple border isn't clipped by this scroll container's top edge.
  // paddingBottom kept for symmetry / bottom-card breathing room.
  paddingTop: 3,
  paddingBottom: 40,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 12,
}

function menuBtnStyle(visible: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: 'none',
    background: 'rgba(20,20,20,0.78)',
    color: '#C0C0C0',
    cursor: 'pointer',
    padding: 0,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
    transition: 'opacity 0.12s',
    fontFamily: 'inherit',
  }
}

const thumbStyle: React.CSSProperties = {
  height: 92,
  background: '#161616',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const cardBodyStyle: React.CSSProperties = {
  padding: '10px 12px 12px',
}

const slugStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const metaRowStyle: React.CSSProperties = {
  marginTop: 6,
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  alignItems: 'center',
}

const versionChipStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#B8B8B8',
  background: '#242424',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '1px 6px',
}

const phaseBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#A78BFA',
  background: 'rgba(139,92,246,0.12)',
  borderRadius: 4,
  padding: '1px 6px',
}

const footerStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  color: '#505050',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const btnGroupVertical: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 240,
}

const btnPrimary: React.CSSProperties = {
  background: '#8B5CF6',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const btnSecondary: React.CSSProperties = {
  background: '#242424',
  color: '#F0F0F0',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '10px 16px',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
