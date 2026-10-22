#!/usr/bin/env node
// prdt cloud test result condenser (T-1126): one vitest JSON report → the
// machine-readable verdict `prdt test cloud` reads (counts + failing
// file / name / message + per-file seconds `file_s`). The cloud runner
// (prdt-cloud-test.sh) and the Mac's mac-only run both pass through this one
// file, so every half of a merged verdict has the same shape.
//
// Usage: node prdt-cloud-condense.mjs <vitest.json> <path-prefix-to-strip> [key=value]…
//   key=value pairs are copied into the output as strings (an empty value is dropped).
import fs from 'node:fs'

const MAX_MESSAGE = 1500
const MAX_FAILURES = 400
const [, , file, prefix = '', ...pairs] = process.argv

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
// T-1211: the same rules as redact() in prdt-cloud-test.sh (per line) — a credential value
// never reaches the pushed result.json, whatever field carries it.
const redact = (s) => String(s)
  .replace(/(:\/\/)[^/@\s]*@/g, '$1***@')
  .replace(/(gh[opusr]_|github_pat_|glpat-)[A-Za-z0-9_]+/g, '$1***')
  .replace(/([Aa]uthorization|AUTHORIZATION)([:=]\s*).*/g, '$1$2***')
  .replace(/([Bb]earer|[Bb]asic)\s+[A-Za-z0-9._~+/=-]+/g, '$1 ***')
const clip = (s) => {
  const t = redact(String(s ?? '').replace(ANSI, ''))
  return t.length > MAX_MESSAGE ? t.slice(0, MAX_MESSAGE) + '…' : t
}
const rel = (p) => (prefix && String(p).startsWith(prefix) ? String(p).slice(prefix.length) : String(p))

const out = {}
for (const kv of pairs) {
  const i = kv.indexOf('=')
  if (i > 0 && kv.slice(i + 1) !== '') out[kv.slice(0, i)] = redact(kv.slice(i + 1))
}

let report = null
try {
  report = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (e) {
  if (!out.status || out.status === 'ok') {
    out.status = 'error'
    out.reason = `no readable vitest JSON report (${e.code || e.name})`
  }
}

if (report) {
  const failures = []
  const failedFiles = []
  const fileS = {}
  for (const tr of report.testResults || []) {
    const f = rel(tr.name)
    // per-file wall seconds: the Mac balances the next run's shards by these
    if (Number.isFinite(tr.startTime) && Number.isFinite(tr.endTime)) fileS[f] = Math.round((tr.endTime - tr.startTime) / 100) / 10
    else fileS[f] = null
    const failedAsserts = (tr.assertionResults || []).filter((a) => a.status === 'failed')
    if (tr.status === 'failed') failedFiles.push(f)
    for (const a of failedAsserts) {
      failures.push({ file: f, name: a.fullName || a.title || '', message: clip((a.failureMessages || []).join('\n')) })
    }
    if (tr.status === 'failed' && failedAsserts.length === 0) {
      failures.push({ file: f, name: '(file)', message: clip(tr.message || 'the file failed outside any test') })
    }
  }
  out.total = report.numTotalTests ?? 0
  out.passed = report.numPassedTests ?? 0
  out.failed = report.numFailedTests ?? 0
  out.skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0)
  out.files = (report.testResults || []).length
  out.failed_files = failedFiles.length
  out.file_s = fileS
  out.failures = failures.slice(0, MAX_FAILURES)
  if (failures.length > MAX_FAILURES) out.failures_dropped = failures.length - MAX_FAILURES
  if (!out.status) out.status = 'ok'
}
process.stdout.write(JSON.stringify(out) + '\n')
