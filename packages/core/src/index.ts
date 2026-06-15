export {
  initProject,
  bootstrapClaudeSettings,
  bootstrapUserGlobalDoctrine,
  bootstrapPersonaMemory,
  latestSchemaV,
  FALLBACK_LATEST_SCHEMA_V,
  findAncestorProductuneRoot,
  ANCESTOR_WALK_MAX_DEPTH,
} from './init'
export type { ProjectConfig, InitOptions, SurfaceConfig, AncestorRootResult } from './init'

export { startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo } from './github'
export type { DeviceCodeResponse, GitHubCredentials } from './github'

export {
  loadSettings,
  saveSettings,
  getUiLanguage,
  setUiLanguage,
  settingsFileExists,
  getVercelToken,
  setVercelToken,
  markVercelTokenValidated,
  getNotificationSettings,
  setNotificationSettings,
  getCloseToTray,
  setCloseToTray,
  getLaunchAtLogin,
  setLaunchAtLogin,
  getZoomFactor,
  setZoomFactor,
  getStatusBarVisible,
  setStatusBarVisible,
} from './settings/ui-settings'
export type { UiLanguage, UiSettings, IntegrationsSettings, NotificationSettings } from './settings/ui-settings'

export {
  loadRules,
  saveRules,
  getDefault,
  getProtectedBranches,
  readGitRules,
  writeGitRules,
  resetGitRules,
  bootstrapGitRules,
} from './git-workflow/rules'
export type { GitRules, GitRulesSource, GitRulesReadResult, AutosaveTriggers } from './git-workflow/rules'

export {
  createWorktree,
  stashAndCreate,
  commitAndCreate,
  worktreeExists,
  worktreeCleanup,
} from './git-workflow/worktree'
export type { WorktreeCreateResult, WorktreeErrorReason, CreateWorktreeArgs } from './git-workflow/worktree'

export {
  buildBranchName,
  resolveBranchConflict,
} from './git-workflow/branchNamer'
export type { BranchNameArgs } from './git-workflow/branchNamer'

export {
  installPrePushHook,
  isPrePushHookInstalled,
} from './git-workflow/hooks'

export {
  triggerAutosave,
  detectChange,
  processTicketFileChange,
  getSnapshot,
  setSnapshot,
} from './git-workflow/autosave'
export type {
  AutosaveChangeReason,
  AutosaveSkipReason,
  AutosaveCommitResult,
  AutosaveSkipResult,
  AutosaveResult,
  DetectChangeResult,
} from './git-workflow/autosave'

export {
  createDeployment,
  getDeploymentState,
  cancelDeployment,
} from './deploy/vercel'
export type { DeploymentState, DeploymentResult, CreateDeploymentOptions } from './deploy/vercel'

export {
  checkDeployReadiness,
  dismissDeployTrigger,
} from './deploy/po-trigger'
export type { TicketRef, DeployReadinessResult } from './deploy/po-trigger'

export {
  streamLogs,
  isVercelCliInstalled,
} from './deploy/vercel-cli'
export type { LogChunk, LogStreamHandle, LogStreamError } from './deploy/vercel-cli'

export {
  appendPendingPromotion,
  listPendingPromotions,
  resolvePendingPromotion,
  autoDropStale,
  markSurfaced,
  listAllPromotions,
} from './state/pending-promotions'
export type {
  PendingPromotion,
  PromotionScope,
  PromotionKind,
  PromotionTier,
  PromotionStatus,
} from './state/pending-promotions'

export {
  naturalizeCommit,
  naturalizeMilestone,
  naturalizeChangeReason,
} from './history/naturalize'
export type { NaturalizedCommit, TicketFrontmatter } from './history/naturalize'

export {
  scanGitHistory,
  groupByTicket,
} from './git-workflow/history'
export type { HistoryEntry } from './git-workflow/history'

export {
  fetchVercelDeploys,
  resolveVercelToken,
  clearDeployEventCache,
} from './history/deploy-events'
export type { DeployEvent } from './history/deploy-events'

export {
  checkVocabulary,
  assertVocabulary,
  lintLocaleObject,
  lintVocabulary,
  FORBIDDEN_PATTERNS,
} from './lint/vocabulary'
export type { VocabViolation, VocabIssue } from './lint/vocabulary'

// ── T-P4-022 3rd PR ───────────────────────────────────────────────────────────

export {
  createDeployPR,
  checkPRMergeability,
  classifyConflict,
  PrCreateError,
} from './deploy/pr-create'
export type {
  PrCreateErrorReason,
  CreateDeployPROptions,
  CreateDeployPRResult,
  PersonaActivityEntry,
} from './deploy/pr-create'

export {
  squashMergePR,
  triggerVercelDeployAfterMerge,
  PrMergeError,
} from './deploy/pr-merge'
export type {
  PrMergeErrorReason,
  SquashMergePROptions,
  SquashMergePRResult,
  TriggerVercelDeployOptions,
} from './deploy/pr-merge'

export {
  markPoTurnStart,
  markPoTurnEnd,
  isPoTurnActive,
  assertNotPoTurn,
  assertUserInitiated,
} from './lint/po-deploy-guard'
