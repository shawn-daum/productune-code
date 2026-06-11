#!/usr/bin/env bash
# check-ticket-frontmatter.sh — docs/tickets/v*/T-*.md frontmatter 필수 필드 lint.
#
# doctrine: designer/bookshelf/ticket-schema.md · po/bookshelf/lifecycle/ticket-ops.md
#   FAIL 1 (no-phase)   — `phase:` 누락 또는 비정수 (statusline/GUI 카운트가 이 필드에
#                         의존 — T-PATCH-118: 27건 drift 가 statusline (0/0) 의 원인)
#   FAIL 2 (no-status)  — `status:` 누락 또는 비-enum 값
#   FAIL 3 (no-close)   — frontmatter 닫는 `---` 가 4096B 안에 없음 (statusline 파서 한계)
#
# Usage: scripts/ci/check-ticket-frontmatter.sh [projectDir]   (default: cwd)

set -euo pipefail

PROJECT_DIR="${1:-$PWD}"
BASE="$PROJECT_DIR/docs/tickets"

[ -d "$BASE" ] || { echo "no docs/tickets — nothing to lint"; exit 0; }

python3 - "$BASE" <<'PYEOF'
import os, re, sys

base = sys.argv[1]
STATUSES = {'todo','in-progress','review','user-verify','done','blocked','abandoned'}
fails = []

for vdir in sorted(os.listdir(base)):
    vpath = os.path.join(base, vdir)
    if not os.path.isdir(vpath):
        continue
    for fname in sorted(os.listdir(vpath)):
        if not fname.endswith('.md') or not fname.startswith('T-'):
            continue
        rel = os.path.join('docs/tickets', vdir, fname)
        with open(os.path.join(vpath, fname), errors='replace') as fh:
            head = fh.read(4096)
        if not head.startswith('---'):
            fails.append((rel, 'no-frontmatter'))
            continue
        end = head.find('\n---', 3)
        if end < 0:
            fails.append((rel, 'no-close (frontmatter > 4096B or unterminated)'))
            continue
        fm = head[3:end]
        pm = re.search(r'^phase:\s*["\']?(\d+)', fm, re.M)
        sm = re.search(r'^status:\s*(\S+)', fm, re.M)
        if not pm:
            fails.append((rel, 'no-phase (missing or non-int `phase:`)'))
        if not sm:
            fails.append((rel, 'no-status'))
        elif sm.group(1) not in STATUSES:
            fails.append((rel, f'bad-status `{sm.group(1)}`'))

if fails:
    print(f'check-ticket-frontmatter: {len(fails)} FAIL')
    for rel, why in fails:
        print(f'  FAIL {rel} — {why}')
    sys.exit(1)
print('check-ticket-frontmatter: OK')
PYEOF
