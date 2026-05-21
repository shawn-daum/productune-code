import { ipcMain } from 'electron'
import path from 'path'
import { readClaudeSettings } from './mcp'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HookRow {
  eventType: string
  matcher: string | null
  commandBasename: string
  commandFull: string
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('hooks:list', (): HookRow[] => {
    const settings = readClaudeSettings()
    const hooks: Record<string, any[]> = settings.hooks ?? {}
    const rows: HookRow[] = []

    for (const [eventType, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const matcher: string | null = entry.matcher ?? null
        const hookItems: any[] = Array.isArray(entry.hooks) ? entry.hooks : []
        for (const hookItem of hookItems) {
          const commandFull: string = hookItem.command ?? ''
          rows.push({
            eventType,
            matcher,
            commandBasename: path.basename(commandFull) || commandFull,
            commandFull,
          })
        }
      }
    }

    return rows
  })
}
