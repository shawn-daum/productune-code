export const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '44px 1fr 28px',
  flex: 1,
  minHeight: 0,
  background: '#0F0F0F',
  color: '#F0F0F0',
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
  background: '#1E1E1E',
  border: '1px solid #3A3A3A',
  borderRadius: 6,
  color: '#C8C8CC',
  fontSize: 12,
  padding: '8px 16px',
  zIndex: 9999,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}
