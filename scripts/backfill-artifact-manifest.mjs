#!/usr/bin/env node
/**
 * backfill-artifact-manifest.mjs — docs/artifacts/<version>/manifest.json 백필.
 *
 * 결정 보드 #7 (2026-06-10): artifacts 폴더의 매직-파일명 주소 체계를 manifest 로
 * 대체. 이 스크립트는 기존 산출물을 스캔해 초기 manifest 를 생성한다 (멱등 —
 * 이미 manifest 에 있는 path 는 보존하고 새 파일만 추가).
 *
 * Usage: node scripts/backfill-artifact-manifest.mjs [projectDir]
 *
 * Heuristics (backfill only — 신규 엔트리는 persona 가 정확값으로 emit):
 *   ticket : filename 의 T-… prefix
 *   kind   : 파일명 키워드 (mockup/wireframe/design-system/PRD/spec) → 없으면 doc
 *   status : archive/ 하위 = archived, 그 외 = approved (과거 user-gate 통과분)
 *   lang   : ko (user-gate 산출물 기본 — 필요 시 수동 수정)
 */
import fs from 'node:fs'
import path from 'node:path'

const projectDir = path.resolve(process.argv[2] ?? '.')
const artifactsBase = path.join(projectDir, 'docs', 'artifacts')
const SCHEMA_V = 1

function inferTicket(name) {
  const m = name.match(/^(T-[A-Z0-9]*-?\d+)/i)
  return m ? m[1] : null
}

function inferKind(name) {
  const n = name.toLowerCase()
  if (/^prd\.(html|md)$/.test(n) || n.includes('prd-view')) return 'prd-view'
  if (n.includes('design-system')) return 'design-system'
  if (n.includes('wireframe')) return 'wireframe'
  if (n.includes('mockup')) return 'mockup'
  if (n.includes('spec')) return 'spec'
  return 'doc'
}

function scanVersionDir(versionDir) {
  const entries = []
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'manifest.json' || e.name.startsWith('.')) continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        // archive/ 만 1단계 허용 (doctrine: flat + archive/)
        if (prefix === '' && e.name === 'archive') walk(abs, 'archive/')
        continue
      }
      const relInVersion = prefix + e.name
      entries.push({
        path: relInVersion,
        ticket: inferTicket(e.name),
        kind: inferKind(e.name),
        status: prefix === 'archive/' ? 'archived' : 'approved',
        lang: 'ko',
        added_at: fs.statSync(abs).mtime.toISOString(),
        backfilled: true,
      })
    }
  }
  walk(versionDir, '')
  return entries
}

if (!fs.existsSync(artifactsBase)) {
  console.error(`no docs/artifacts under ${projectDir}`)
  process.exit(1)
}

for (const sub of fs.readdirSync(artifactsBase, { withFileTypes: true })) {
  if (!sub.isDirectory()) continue
  const versionDir = path.join(artifactsBase, sub.name)
  const manifestPath = path.join(versionDir, 'manifest.json')

  let manifest = { schema_v: SCHEMA_V, version: sub.name, entries: [] }
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { /* rebuild */ }
    manifest.entries ??= []
  }

  const known = new Set(manifest.entries.map((e) => e.path))
  const scanned = scanVersionDir(versionDir)
  const added = scanned.filter((e) => !known.has(e.path))
  manifest.entries.push(...added)
  manifest.entries.sort((a, b) => a.path.localeCompare(b.path))

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`${sub.name}: +${added.length} entries (total ${manifest.entries.length}) → ${path.relative(projectDir, manifestPath)}`)
}
