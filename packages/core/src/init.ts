import fs from 'fs'
import path from 'path'

export interface ProjectConfig {
  slug: string
  mode: 'planner' | 'developer'
  created_at: string
  version: string
}

export interface InitOptions {
  slug: string
  mode: 'planner' | 'developer'
  projectDir: string
}

export function initProject(opts: InitOptions): ProjectConfig {
  const dotDir = path.join(opts.projectDir, '.productune')
  const configPath = path.join(dotDir, 'config.json')

  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true })
  }

  let existing: Partial<ProjectConfig> = {}
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      // corrupt config — start fresh
    }
  }

  const config: ProjectConfig = {
    slug: existing.slug ?? opts.slug,
    mode: opts.mode,
    created_at: existing.created_at ?? new Date().toISOString(),
    version: '0.4.0',
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  return config
}
