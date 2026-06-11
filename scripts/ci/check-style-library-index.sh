#!/usr/bin/env bash
# check-style-library-index.sh — designer bookshelf style-library ↔ index.md 정합 lint.
#
# doctrine: designer/bookshelf/phase2-3-ticket-sequence.md S1 (T-PATCH-122)
#   FAIL 1 (bad-labels)   — index 엔트리의 4축 무드 라벨 누락/오타
#                           (light|dark · minimal|rich · playful|serious · editorial|chrome)
#   FAIL 2 (dangling)     — index 가 가리키는 <slug>.md 실파일 없음
#   FAIL 3 (unlisted)     — 라이브러리 .md 파일이 index 에 미등재
#
# Usage: scripts/ci/check-style-library-index.sh [coreDoctrineDir]
#        (default: packages/core/doctrine — repo SoT)

set -euo pipefail

DOCTRINE_DIR="${1:-packages/core/doctrine}"
LIB="$DOCTRINE_DIR/persona/designer/bookshelf/style-library"

[ -d "$LIB" ] || { echo "no style-library — nothing to lint"; exit 0; }
[ -f "$LIB/index.md" ] || { echo "FAIL style-library/index.md missing" >&2; exit 1; }

python3 - "$LIB" <<'PYEOF'
import os, re, sys

lib = sys.argv[1]
AXES = [{'light','dark'}, {'minimal','rich'}, {'playful','serious'}, {'editorial','chrome'}]
fails, listed = [], set()

for i, line in enumerate(open(os.path.join(lib, 'index.md'), encoding='utf-8'), 1):
    m = re.match(r'^- \*\*(.+?)\*\* \(`(.+?)\.md`\)', line)
    if not m:
        continue
    name, slug = m.group(1), m.group(2)
    listed.add(slug)
    if not os.path.isfile(os.path.join(lib, slug + '.md')):
        fails.append(f'index:{i} dangling — `{slug}.md` not in library')
    lm = re.search(r'· `([^`]+)`\s*$', line)
    if not lm:
        fails.append(f'index:{i} bad-labels — {name}: no label block')
        continue
    labels = [t.strip() for t in lm.group(1).split('·')]
    if len(labels) != 4 or any(l not in AXES[j] for j, l in enumerate(labels)):
        fails.append(f'index:{i} bad-labels — {name}: `{lm.group(1)}`')

for f in sorted(os.listdir(lib)):
    if f.endswith('.md') and f != 'index.md' and f[:-3] not in listed:
        fails.append(f'unlisted — {f} not in index.md')

if fails:
    print(f'check-style-library-index: {len(fails)} FAIL')
    for f in fails:
        print('  FAIL ' + f)
    sys.exit(1)
print(f'check-style-library-index: OK ({len(listed)} entries)')
PYEOF
