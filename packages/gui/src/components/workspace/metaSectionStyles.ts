/**
 * metaSectionStyles — the settings-section chrome shared byte-identically by
 * MetaBackupSection and MetaMigrateSection (T-371 B2). Both mirror the
 * GeneralSettings section look; this is the single source so the two meta
 * sections cannot visually drift. Section-specific styles (inputs, chips,
 * confirm box, warn banner, …) stay in their own component.
 */

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-quaternary)',
  lineHeight: 1.6,
}

const successBanner: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--health-success)',
  background: 'var(--health-success-subtle)',
  border: '1px solid var(--health-success)',
  borderRadius: 4,
  padding: '6px 10px',
}

const errorBanner: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--health-error)', // §2.8 --health-error

  background: 'var(--health-error-subtle)',
  border: '1px solid var(--health-error)',
  borderRadius: 4,
  padding: '6px 10px',
}

export { sectionWrap, sectionTitle, description, successBanner, errorBanner }
