export { initProject, bootstrapClaudeSettings } from './init'
export type { ProjectConfig, InitOptions } from './init'

export { startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo } from './github'
export type { DeviceCodeResponse, GitHubCredentials } from './github'

export {
  loadSettings,
  saveSettings,
  getUiLanguage,
  setUiLanguage,
  settingsFileExists,
} from './settings/ui-settings'
export type { UiLanguage, UiSettings } from './settings/ui-settings'

export {
  loadRules,
  saveRules,
  getDefault,
  getProtectedBranches,
} from './git-workflow/rules'
export type { GitRules } from './git-workflow/rules'
