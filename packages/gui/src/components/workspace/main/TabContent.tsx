import type { RefObject, MutableRefObject } from 'react'
import type { Tab } from '../../../store/workspace'
import type { BrowserFindHandle } from './panes/BrowserTab'
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
import ArtifactJsonTab from './panes/ArtifactJsonTab'
import TicketDetailTab from './panes/TicketDetailTab'
import CodeSearchTab from './panes/CodeSearchTab'
import CodeTextViewer from './panes/CodeViewTab'
import DoctrineFileTabHost from './panes/DoctrineFileTabHost'
import HtmlViewer from './panes/HtmlViewer'
import ProjectEnvPane from './panes/ProjectEnvPane'
import CostArchiveTab from './panes/CostArchiveTab'
import BuildOutputTab from './panes/BuildOutputTab'

/**
 * Tab type dispatcher (10 type list per ticket; 11th `version-detail` added
 * because VersionDetailView is structured enough to need its own surface).
 * Wired this round: markdown, version-detail, ticket-review.
 * The remaining 8 types render PlaceholderTab until their sibling tickets land.
 */
interface Props {
  tab: Tab
  // T-PATCH-046: ref for find-in-page API (browser tab only)
  browserFindRef?: RefObject<BrowserFindHandle | null>
  // T-PATCH-067 R4: preview (HTML artifact) iframe find bridge
  previewFindQuery?: string
  previewFindNavRef?: MutableRefObject<((forward: boolean) => void) | null>
  onPreviewFindResult?: (info: { total: number; current: number }) => void
  // T-PATCH-094: JSON artifact in-tree find bridge
  jsonFindQuery?: string
  jsonFindNavRef?: MutableRefObject<((forward: boolean) => void) | null>
  onJsonFindResult?: (info: { total: number; current: number }) => void
}

export default function TabContent({ tab, browserFindRef, previewFindQuery, previewFindNavRef, onPreviewFindResult, jsonFindQuery, jsonFindNavRef, onJsonFindResult }: Props) {
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
    // unreachable — 의도적 비노출(T-PATCH-200): workflow-settings / mcp-servers /
    // hooks have no entry point (Settings nav + Team MCP row removed). Dispatch
    // arms kept so a future re-exposure needs only a nav change.
    case 'workflow-settings': return <WorkflowSettingsTab props={tab.props} />
    case 'mcp-servers':       return <McpServersTab props={tab.props} />
    case 'hooks':             return <HooksTab props={tab.props} />
    case 'browser':
      return <BrowserTab ref={browserFindRef ?? null} tabId={tab.id} props={tab.props} />
    case 'artifact-md':
      return <ArtifactMdTab props={tab.props} />
    case 'artifact-mermaid':
      return <ArtifactMermaidTab props={tab.props} />
    case 'artifact-json':
      // T-PATCH-094: route the shared FindBar into the JSON tree (key+value find,
      // auto-expand, CSS Custom Highlight) — same prop contract as 'preview'.
      return (
        <ArtifactJsonTab
          props={tab.props}
          findQuery={jsonFindQuery}
          findNavRef={jsonFindNavRef}
          onFindResult={onJsonFindResult}
        />
      )
    case 'ticket-detail':
      return <TicketDetailTab props={tab.props} />
    case 'code-search':
      return <CodeSearchTab props={tab.props} />
    case 'code-view':
      return <CodeTextViewer props={tab.props} />
    case 'doctrine-file':
      return <DoctrineFileTabHost tab={tab} />
    case 'project-env':
      return <ProjectEnvPane props={tab.props} />
    case 'cost-archive':
      return <CostArchiveTab props={tab.props} />
    case 'build-output':
      return <BuildOutputTab props={tab.props} />
    case 'preview':
      // Local .html/.htm (path + projectDir) → rendered Preview + raw-source
      // Edit/Save; http(s) `url` → BrowserTab/<webview>. (T-PATCH-032)
      // T-PATCH-067 R4: pass iframe find bridge props down.
      return (
        <HtmlViewer
          tabId={tab.id}
          props={tab.props}
          findQuery={previewFindQuery}
          findNavRef={previewFindNavRef}
          onFindResult={onPreviewFindResult}
        />
      )
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
