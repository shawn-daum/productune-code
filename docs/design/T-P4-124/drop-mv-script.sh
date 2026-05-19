#!/usr/bin/env bash
# T-P4-124 — Skill drop mv script
#
# Generated: 2026-05-19 by pdt-designer
# Drops 40 skills from ~/.claude/skills/ to ~/.claude/skills/.archived-skills/
# Hidden parent dir → T-P4-122 SkillMatrixTab dedup filter auto-excludes.
# Non-destructive: mv preserves files; reversible via mv-back.
#
# Source: docs/design/T-P4-124/plan.md §5.1 + user OQ decisions (2026-05-19)
# Designer was a subagent without Bash; this script is the executable deliverable
# for PO/user shell execution.
#
# Run from anywhere:  bash docs/design/T-P4-124/drop-mv-script.sh
# Dry-run preview:    DRY_RUN=1 bash docs/design/T-P4-124/drop-mv-script.sh

set -euo pipefail

SKILLS_ROOT="${HOME}/.claude/skills"
ARCHIVE_ROOT="${SKILLS_ROOT}/.archived-skills"

# ── Drop list — 40 entries, paths relative to SKILLS_ROOT ─────────────────────

DROPS=(
  # mattpocock — 13 drops
  # OQ-G deprecated (4)
  "mattpocock/skills/deprecated/design-an-interface"
  "mattpocock/skills/deprecated/qa"
  "mattpocock/skills/deprecated/request-refactor-plan"
  "mattpocock/skills/deprecated/ubiquitous-language"
  # OQ-H in-progress (4)
  "mattpocock/skills/in-progress/review"
  "mattpocock/skills/in-progress/writing-beats"
  "mattpocock/skills/in-progress/writing-fragments"
  "mattpocock/skills/in-progress/writing-shape"
  # OQ-I misc — drop 2 (keep git-guardrails-claude-code + setup-pre-commit)
  "mattpocock/skills/misc/migrate-to-shoehorn"
  "mattpocock/skills/misc/scaffold-exercises"
  # OQ-F personal (2)
  "mattpocock/skills/personal/edit-article"
  "mattpocock/skills/personal/obsidian-vault"
  # OQ-A PRD authoring — drop both (1 here, phuryn create-prd below)
  "mattpocock/skills/engineering/to-prd"

  # phuryn — 27 drops
  # OQ-A PRD authoring
  "phuryn/pm-execution/skills/create-prd"
  # OQ-J pm-execution residuals (6 drop, keep wwas)
  "phuryn/pm-execution/skills/brainstorm-okrs"
  "phuryn/pm-execution/skills/dummy-dataset"
  "phuryn/pm-execution/skills/sprint-plan"
  "phuryn/pm-execution/skills/stakeholder-map"
  "phuryn/pm-execution/skills/summarize-meeting"
  "phuryn/pm-execution/skills/user-stories"
  # OQ-C strategy frameworks — drop 9 (keep product-vision, value-proposition, lean-canvas)
  "phuryn/pm-product-strategy/skills/ansoff-matrix"
  "phuryn/pm-product-strategy/skills/business-model"
  "phuryn/pm-product-strategy/skills/monetization-strategy"
  "phuryn/pm-product-strategy/skills/pestle-analysis"
  "phuryn/pm-product-strategy/skills/porters-five-forces"
  "phuryn/pm-product-strategy/skills/pricing-strategy"
  "phuryn/pm-product-strategy/skills/product-strategy"
  "phuryn/pm-product-strategy/skills/startup-canvas"
  "phuryn/pm-product-strategy/skills/swot-analysis"
  # OQ-D GTM — drop 4 (keep ideal-customer-profile, gtm-strategy)
  "phuryn/pm-go-to-market/skills/beachhead-segment"
  "phuryn/pm-go-to-market/skills/competitive-battlecard"
  "phuryn/pm-go-to-market/skills/growth-loops"
  "phuryn/pm-go-to-market/skills/gtm-motions"
  # OQ-E marketing — drop 3 (keep north-star-metric, value-prop-statements)
  "phuryn/pm-marketing-growth/skills/marketing-ideas"
  "phuryn/pm-marketing-growth/skills/positioning-ideas"
  "phuryn/pm-marketing-growth/skills/product-name"
  # OQ-F admin (4)
  "phuryn/pm-toolkit/skills/draft-nda"
  "phuryn/pm-toolkit/skills/grammar-check"
  "phuryn/pm-toolkit/skills/privacy-policy"
  "phuryn/pm-toolkit/skills/review-resume"
)

# ── Execution ─────────────────────────────────────────────────────────────────

DRY_RUN="${DRY_RUN:-0}"
moved=0
missing=0
skipped=0

mkdir -p "${ARCHIVE_ROOT}"

for rel in "${DROPS[@]}"; do
  src="${SKILLS_ROOT}/${rel}"
  dst="${ARCHIVE_ROOT}/${rel}"

  if [[ ! -d "${src}" ]]; then
    if [[ -d "${dst}" ]]; then
      echo "  skip (already archived): ${rel}"
      skipped=$((skipped+1))
    else
      echo "  MISSING: ${rel}  (not at src nor dst — investigate)"
      missing=$((missing+1))
    fi
    continue
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "  [dry-run] mv ${src}  →  ${dst}"
  else
    mkdir -p "$(dirname "${dst}")"
    mv "${src}" "${dst}"
    echo "  moved: ${rel}"
  fi
  moved=$((moved+1))
done

echo ""
echo "T-P4-124 mv summary:"
echo "  total entries  : ${#DROPS[@]}"
echo "  moved          : ${moved}"
echo "  already-archived (skip): ${skipped}"
echo "  missing (not found)    : ${missing}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo ""
  echo "[dry-run mode] No filesystem changes made. Re-run without DRY_RUN=1 to execute."
fi

# ── Reverse / restore note ────────────────────────────────────────────────────
# To restore a single skill:
#   mv ~/.claude/skills/.archived-skills/<rel-path>/ ~/.claude/skills/<rel-path>/
# To restore all 40:
#   bash docs/design/T-P4-124/drop-mv-script.sh --restore   # (not implemented;
#   manually iterate DROPS in reverse direction if needed.)
