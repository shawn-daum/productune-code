export const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '44px 1fr 28px',
  flex: 1,
  minHeight: 0,
  background: 'var(--bg-surface-base)',
  color: 'var(--text-primary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  overflow: 'hidden',
}

export const breadcrumbArea: React.CSSProperties = {
  gridArea: 'breadcrumb',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

export const sidebarResizeArea: React.CSSProperties = {
  gridArea: 'sidebarResize',
  overflow: 'hidden',
}

export const chatResizeArea: React.CSSProperties = {
  gridArea: 'chatResize',
  overflow: 'hidden',
}

export const artifactToastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 36,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--bg-surface-onlayer)',
  border: '1px solid var(--border-hover)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  fontSize: 12,
  padding: '8px 16px',
  zIndex: 9999,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}
