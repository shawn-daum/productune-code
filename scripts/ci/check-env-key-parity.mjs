#!/usr/bin/env node
// scripts/ci/check-env-key-parity.mjs
//
// Env-file key parity check for T-021 (C1 fresh-install CI smoke), check (c).
//
// Both install.sh AND bootstrap-doctrine.sh write into the SAME env file
// (~/.productune/productune.env). They must agree on the key used to seed the
// PO engine selector. The deferred_candidate `v0.5-fresh-install-ci-smoke`
// records a real fresh-install bug where the two seeders disagreed
// (lowercase `engine=` from bootstrap-doctrine vs `MY_PO_ENGINE=` from
// install.sh), so a fresh teammate machine ended up with two engine keys, one
// of which downstream code ignored.
//
// This check statically scans both files for lines that WRITE an engine-related
// key into the env file (printf '<KEY>=...'), collects those keys, and fails if
// the set of engine-seed keys is not identical across the two files.
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
const BOOTSTRAP = resolve(
  REPO_ROOT,
  'packages/core/scripts/lib/bootstrap-doctrine.sh',
);

// Keys that select / mark the PO engine. If a seeder writes ANY of these into
// the env file, the parity check requires the OTHER seeder (if it also seeds an
// engine key) to use the same key. Add aliases here as the schema evolves.
const ENGINE_KEY_ALIASES = ['MY_PO_ENGINE', 'engine', 'ENGINE', 'PO_ENGINE'];

function fail(msg) {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exitCode = 1;
}

function extractSeededEngineKeys(file) {
  if (!existsSync(file)) {
    fail(`source file not found: ${file}`);
    return new Set();
  }
  const text = readFileSync(file, 'utf8');
  const keys = new Set();
  // Match a literal `<alias>=claude` being WRITTEN into the env file, e.g.:
  //   printf 'engine=claude\n' > "$_env_dest"
  //   printf 'MY_PO_ENGINE=claude\n' >> "$PO_ENV_FILE"
  //   sed -i.bak -E 's|^MY_PO_ENGINE=.*|MY_PO_ENGINE=claude|' "$PO_ENV_FILE"
  // We must NOT match human-facing log lines such as:
  //   say "PO env ready: $PO_ENV_FILE (engine=claude, repo=$ROOT)"
  // so a write context is required: the line is a printf/echo/sed seed, not a
  // say/warn/die/log statement.
  const LOG_PREFIX = /^(say|warn|die|echo|printf '\\033|printf "\\033)/;
  const isWriteContext = (line) =>
    // printf/echo that redirects to a file ( > or >> )
    (/^(printf|echo)\b/.test(line) && /(^|[^>])>>?\s*["$]/.test(line)) ||
    // sed in-place seed
    /^sed\b.*-i/.test(line);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue; // skip comments
    if (LOG_PREFIX.test(line)) continue; // skip human-facing log lines
    if (!isWriteContext(line)) continue; // only env-write lines count
    for (const alias of ENGINE_KEY_ALIASES) {
      const re = new RegExp(`\\b${alias}=claude\\b`);
      if (re.test(line)) keys.add(alias);
    }
  }
  return keys;
}

const installKeys = extractSeededEngineKeys(INSTALL);
const bootstrapKeys = extractSeededEngineKeys(BOOTSTRAP);

process.stdout.write(
  `[check-env-key-parity] install.sh engine-seed keys:        ${[...installKeys].join(', ') || '(none)'}\n`,
);
process.stdout.write(
  `[check-env-key-parity] bootstrap-doctrine.sh engine-seed keys: ${[...bootstrapKeys].join(', ') || '(none)'}\n`,
);

// Both files seed the same env file. If BOTH seed an engine key, the keys must
// match exactly. If only one seeds it, that is fine (single source of truth).
if (installKeys.size > 0 && bootstrapKeys.size > 0) {
  const same =
    installKeys.size === bootstrapKeys.size &&
    [...installKeys].every((k) => bootstrapKeys.has(k));
  if (!same) {
    fail(
      `env engine-seed key drift between install.sh and bootstrap-doctrine.sh — ` +
        `install.sh uses {${[...installKeys].join(', ')}} but ` +
        `bootstrap-doctrine.sh uses {${[...bootstrapKeys].join(', ')}}. ` +
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
