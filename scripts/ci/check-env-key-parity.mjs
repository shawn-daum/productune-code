#!/usr/bin/env node
// scripts/ci/check-env-key-parity.mjs
//
// Env-file key parity check for T-021 (C1 fresh-install CI smoke), check (c).
//
// Two writers seed the same file (~/.productune/productune.env) with the PO
// engine key:
//
//   1. packages/core/scripts/install.sh        — shell writer (printf / sed)
//   2. packages/core/scripts/lib/init-project.mjs — JS writer (fs.writeFileSync)
//
// Both must agree on the key used. A drift between them (e.g. one using
// `MY_PO_ENGINE=` while the other uses `engine=`) means a fresh teammate
// machine ends up with two engine keys, one of which downstream code ignores.
//
// NOTE: bootstrap-doctrine.sh was deleted in T-PATCH-117. This script no
// longer references it.
//
// This check statically scans both files for lines that WRITE an engine-related
// key into the env file, collects those keys, and fails if the set of
// engine-seed keys is not identical across the two files.
//
// It deliberately stays static (no install run) so it is fast and deterministic.
//
// Exit 0 = parity OK. Exit 1 = drift detected (or files missing).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const INSTALL = resolve(REPO_ROOT, 'packages/core/scripts/install.sh');
const INIT_PROJECT = resolve(
  REPO_ROOT,
  'packages/core/scripts/lib/init-project.mjs',
);

// Keys that select / mark the PO engine. If a seeder writes ANY of these into
// the env file, the parity check requires the OTHER seeder (if it also seeds an
// engine key) to use the same key. Add aliases here as the schema evolves.
const ENGINE_KEY_ALIASES = ['MY_PO_ENGINE', 'engine', 'ENGINE', 'PO_ENGINE'];

function fail(msg) {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exitCode = 1;
}

// ── Shell writer extractor (install.sh) ──────────────────────────────────────
//
// Matches lines that WRITE an engine key into the env file via:
//   printf 'MY_PO_ENGINE=claude\n' >> "$PO_ENV_FILE"
//   sed -i.bak -E 's|^MY_PO_ENGINE=.*|MY_PO_ENGINE=claude|' "$PO_ENV_FILE"
//
// Excludes human-facing log / say / warn / die calls.
function extractShellSeededEngineKeys(file) {
  if (!existsSync(file)) {
    fail(`source file not found: ${file}`);
    return new Set();
  }
  const text = readFileSync(file, 'utf8');
  const keys = new Set();
  const LOG_PREFIX = /^(say|warn|die|echo|printf '\\033|printf "\\033)/;
  const isWriteContext = (line) =>
    // printf/echo that redirects to a file ( > or >> )
    (/^(printf|echo)\b/.test(line) && /(^|[^>])>>?\s*["$]/.test(line)) ||
    // sed in-place seed
    /^sed\b.*-i/.test(line);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue;
    if (LOG_PREFIX.test(line)) continue;
    if (!isWriteContext(line)) continue;
    for (const alias of ENGINE_KEY_ALIASES) {
      const re = new RegExp(`\\b${alias}=claude\\b`);
      if (re.test(line)) keys.add(alias);
    }
  }
  return keys;
}

// ── JS writer extractor (init-project.mjs) ───────────────────────────────────
//
// Matches lines that WRITE an engine key into the env file via Node fs calls:
//   fs.writeFileSync(envDest, 'MY_PO_ENGINE=claude\n')
//   fs.appendFileSync(envDest, 'MY_PO_ENGINE=claude\n')
//
// Excludes comment lines and string literals that appear only in log output
// (i.e. lines that are process.stderr.write / console.log / template strings
// not feeding an fs call on the same line).
function extractJsSeededEngineKeys(file) {
  if (!existsSync(file)) {
    fail(`source file not found: ${file}`);
    return new Set();
  }
  const text = readFileSync(file, 'utf8');
  const keys = new Set();
  // A JS env-write line: fs.writeFileSync / fs.appendFileSync with an engine key
  // value in the same statement, or a string literal assigned / passed as
  // content that contains `<KEY>=claude`.
  const isFsWriteContext = (line) =>
    /\bfs\.(writeFileSync|appendFileSync)\b/.test(line) ||
    // object-literal / template string write helpers that include the key value
    /\bwrite(File|Sync|Stream)\b/.test(line);
  // Exclude log/stderr/console lines that happen to mention the key
  const isLogLine = (line) =>
    /\b(console\.(log|error|warn|info)|process\.stderr\.write|process\.stdout\.write)\b/.test(line);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('//') || line.startsWith('*')) continue;
    if (isLogLine(line)) continue;
    if (!isFsWriteContext(line)) continue;
    for (const alias of ENGINE_KEY_ALIASES) {
      const re = new RegExp(`\\b${alias}=claude\\b`);
      if (re.test(line)) keys.add(alias);
    }
  }
  return keys;
}

const installKeys = extractShellSeededEngineKeys(INSTALL);
const initProjectKeys = extractJsSeededEngineKeys(INIT_PROJECT);

process.stdout.write(
  `[check-env-key-parity] install.sh engine-seed keys:        ${[...installKeys].join(', ') || '(none)'}\n`,
);
process.stdout.write(
  `[check-env-key-parity] init-project.mjs engine-seed keys: ${[...initProjectKeys].join(', ') || '(none)'}\n`,
);

// Both files seed the same env file. If BOTH seed an engine key, the keys must
// match exactly. If only one seeds it, that is fine (single source of truth).
if (installKeys.size > 0 && initProjectKeys.size > 0) {
  const same =
    installKeys.size === initProjectKeys.size &&
    [...installKeys].every((k) => initProjectKeys.has(k));
  if (!same) {
    fail(
      `env engine-seed key drift between install.sh and init-project.mjs — ` +
        `install.sh uses {${[...installKeys].join(', ')}} but ` +
        `init-project.mjs uses {${[...initProjectKeys].join(', ')}}. ` +
        `Both write ~/.productune/productune.env; they must seed the SAME engine key.`,
    );
  }
}

if (process.exitCode === 1) {
  process.stderr.write(
    '\n[check-env-key-parity] FAIL — reconcile the engine-seed key in both seeders.\n',
  );
} else {
  process.stdout.write('[check-env-key-parity] OK — engine-seed key parity holds.\n');
}
