import type { Tab } from '../../../store/workspace'
import MarkdownTab from './panes/MarkdownTab'
import VersionDetailTab from './panes/VersionDetailTab'
import TicketReviewTab from './panes/TicketReviewTab'
import PlaceholderTab from './panes/PlaceholderTab'
import SkillMatrixTab from './panes/SkillMatrixTab'
import PersonaDefTab from './panes/PersonaDefTab'
import ImageTab from './panes/ImageTab'
import VersionHistoryTab from './panes/VersionHistoryTab'
import DeployTab from './panes/DeployTab'
import GeneralSettingsTab from './panes/GeneralSettingsTab'
import WorkflowSettingsTab from './panes/WorkflowSettingsTab'
import McpServersTab from './panes/McpServersTab'
import HooksTab from './panes/HooksTab'
import BrowserTab from './panes/BrowserTab'
import ArtifactMdTab from './panes/ArtifactMdTab'
import ArtifactMermaidTab from './panes/ArtifactMermaidTab'
import TicketDetailTab from './panes/TicketDetailTab'
import CodeSearchTab from './panes/CodeSearchTab'
import CodeTextViewer from './panes/CodeViewTab'
import DoctrineFileTabHost from './panes/DoctrineFileTabHost'
import HtmlViewer from './panes/HtmlViewer'

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
    case 'version-history': return <VersionHistoryTab />
    case 'deploy':            return <DeployTab props={tab.props} />
    case 'general-settings':  return <GeneralSettingsTab props={tab.props} />
    case 'workflow-settings': return <WorkflowSettingsTab props={tab.props} />
    case 'mcp-servers':       return <McpServersTab props={tab.props} />
    case 'hooks':             return <HooksTab props={tab.props} />
    case 'browser':
      return <BrowserTab tabId={tab.id} props={tab.props} />
    case 'artifact-md':
      return <ArtifactMdTab props={tab.props} />
    case 'artifact-mermaid':
      return <ArtifactMermaidTab props={tab.props} />
    case 'ticket-detail':
      return <TicketDetailTab props={tab.props} />
    case 'code-search':
      return <CodeSearchTab props={tab.props} />
    case 'code-view':
      return <CodeTextViewer props={tab.props} />
    case 'doctrine-file':
      return <DoctrineFileTabHost tab={tab} />
    case 'preview':
      // Local .html/.htm (path + projectDir) → rendered Preview + raw-source
      // Edit/Save; http(s) `url` → BrowserTab/<webview>. (T-PATCH-032)
      return <HtmlViewer tabId={tab.id} props={tab.props} />
    case 'design-gate':
    case 'qa-result':
    case 'env-view':
    case 'terminal':
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
