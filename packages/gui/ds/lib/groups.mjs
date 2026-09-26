// ds/lib/groups.mjs — token name → display group, per T-659 Outcome §생성 명세
// section ②: "접두어별 묶음(bg · text · border · icon · accent/brand · persona ·
// prdt-stage · stage · status · health · code)".

export const COLOR_GROUP_ORDER = [
  'bg',
  'text',
  'border',
  'icon',
  'accent',
  'persona',
  'prdt-stage',
  'stage',
  'status',
  'health',
  'code',
]

export const COLOR_GROUP_LABELS = {
  bg: 'Background',
  text: 'Text',
  border: 'Border',
  icon: 'Icon',
  accent: 'Accent / Brand',
  persona: 'Persona',
  'prdt-stage': 'prdt Stage',
  stage: 'Stage (legacy)',
  status: 'Status',
  health: 'Health',
  code: 'Code / JSON',
}

/**
 * A token's display group, given its bare name (no leading `--`). Returns
 * null for a name that belongs to a non-color section (font/space/radius/
 * shadow) or to the legacy-alias section instead.
 */
export function colorGroupOf(name) {
  if (name === 'accent' || name.startsWith('accent-') || name.startsWith('brand-')) return 'accent'
  if (name.startsWith('bg-')) return 'bg'
  if (name.startsWith('text-')) return 'text'
  if (name.startsWith('border-')) return 'border'
  if (name.startsWith('icon-')) return 'icon'
  if (name.startsWith('persona-')) return 'persona'
  if (name.startsWith('prdt-stage-')) return 'prdt-stage'
  if (name.startsWith('stage-')) return 'stage'
  if (name.startsWith('status-')) return 'status'
  if (name.startsWith('health-')) return 'health'
  if (name.startsWith('code-')) return 'code'
  return null
}

export function isFontToken(name) {
  return name === 'font-family' || name === 'font-mono'
}

export function isRadiusToken(name) {
  return name.startsWith('radius-')
}

export function isSpaceToken(name) {
  return name.startsWith('space-')
}

export function isShadowToken(name) {
  return name.startsWith('shadow-')
}
