import type { Tab } from '../../../store/workspace'
import MarkdownTab from './panes/MarkdownTab'
import VersionDetailTab from './panes/VersionDetailTab'
import TicketReviewTab from './panes/TicketReviewTab'
import PlaceholderTab from './panes/PlaceholderTab'
import SkillMatrixTab from './panes/SkillMatrixTab'
import PersonaDefTab from './panes/PersonaDefTab'
import ImageTab from './panes/ImageTab'
import BinaryTab from './panes/BinaryTab'

/**
 * Tab type dispatcher (10 type list per ticket; 11th `version-detail` added
 * because VersionDetailView is structured enough to need its own surface).
 * Wired this round: markdown, version-detail, ticket-review.
 * The remaining 8 types render PlaceholderTab until their sibling tickets land.
 */
interface Props {
  tab: Tab
}

export default function TabContent({ tab }: Props) {
  switch (tab.type) {
    case 'markdown':       return <MarkdownTab props={tab.props} />
    case 'version-detail': return <VersionDetailTab props={tab.props} />
    case 'ticket-review':  return <TicketReviewTab props={tab.props} />
    case 'persona-def':    return <PersonaDefTab props={tab.props} />
    case 'skill-matrix':   return <SkillMatrixTab props={tab.props} />
    case 'image':         return <ImageTab props={tab.props} />
    case 'binary':        return <BinaryTab props={tab.props} />
    case 'design-gate':
    case 'qa-result':
    case 'env-view':
    case 'preview':
    case 'terminal':
    case 'browser':
      return <PlaceholderTab type={tab.type} props={tab.props} />
    default:
      // Defensive — typescript exhaustiveness should prevent this.
      return <div style={errorWrap}>Unknown tab type: {String((tab as Tab).type)}</div>
  }
}

const errorWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#2A0808',
  color: '#E04040',
  fontSize: 13,
  fontFamily: 'monospace',
}
