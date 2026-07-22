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
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.6,
}

const successBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#34D399',
  background: '#0D2A1E',
  border: '1px solid #164F35',
  borderRadius: 4,
  padding: '6px 10px',
}

const errorBanner: React.CSSProperties = {
  fontSize: 11,
  color: '#EF4444', // §2.8 --health-error

  background: '#2A1010',
  border: '1px solid #4A1A1A',
  borderRadius: 4,
  padding: '6px 10px',
}

export { sectionWrap, sectionTitle, description, successBanner, errorBanner }
