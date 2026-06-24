#!/usr/bin/env bash
# check-artifact-manifest.sh — docs/artifacts/<version>/ ↔ manifest.json 정합 lint.
#
# doctrine: designer/bookshelf/artifact-manifest-schema.md
#   FAIL 1 (unregistered) — manifest 에 없는 파일이 version 디렉토리에 존재
#                           ("user-gate 산출물만 artifacts 에" 룰의 기계적 단속)
#   FAIL 2 (dangling)     — manifest entry 의 path 에 실파일 없음
#
# Usage: scripts/ci/check-artifact-manifest.sh [projectDir]   (default: cwd)

set -euo pipefail

PROJECT_DIR="${1:-$PWD}"
BASE="$PROJECT_DIR/docs/artifacts"
FAIL=0

[ -d "$BASE" ] || { echo "no docs/artifacts — nothing to lint"; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }

for vdir in "$BASE"/*/; do
  [ -d "$vdir" ] || continue
  v="$(basename "$vdir")"
  manifest="$vdir/manifest.json"

  if [ ! -f "$manifest" ]; then
    # 파일이 하나라도 있으면 manifest 부재 = fail. archive/ 는 candidate(비등록)이므로
    # manifest-부재 판단에서도 제외 — flat dir 에만 파일이 있을 때 fail (T-PATCH-249/248).
    n="$(find "$vdir" -maxdepth 2 -type f ! -path '*/archive/*' ! -name '.*' | wc -l | tr -d ' ')"
    if [ "$n" -gt 0 ]; then
      echo "✗ $v: manifest.json missing ($n files unregistered)"
      FAIL=1
    fi
    continue
  fi

  # FAIL 1: unregistered files — flat dir 만 검사. 통합 archive 모델(T-PATCH-248):
  # archive/ = candidate(non-SoT, manifest-비등록)이므로 등록 검사에서 제외한다
  # (`-path '*/archive/*' -prune`). flat 의 "모든 파일 manifest 등록" 불변식은 유지 —
  # flat path 는 top-level 만 가능하므로 그 외 깊이의 파일은 flat-구조 위반까지 잡힘.
  while IFS= read -r f; do
    rel="${f#"$vdir"}"; rel="${rel#/}"
    if ! jq -e --arg p "$rel" '.entries[] | select(.path == $p)' "$manifest" >/dev/null 2>&1; then
      echo "✗ $v: unregistered file (manifest entry 없음 — 오배치이거나 entry 누락): $rel"
      FAIL=1
    fi
  done < <(find "$vdir" -type d -name archive -prune -o -type f ! -name 'manifest.json' ! -name '.*' -print)

  # FAIL 2: dangling entries
  while IFS= read -r p; do
    if [ ! -f "$vdir/$p" ]; then
      echo "✗ $v: dangling manifest entry (실파일 없음): $p"
      FAIL=1
    fi
  done < <(jq -r '.entries[].path' "$manifest" 2>/dev/null)
done

if [ "$FAIL" = "0" ]; then
  echo "✓ artifact manifests consistent"
fi
exit "$FAIL"
