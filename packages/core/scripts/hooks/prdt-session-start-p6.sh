#!/usr/bin/env bash
# prdt — discipline injection, one PART SLOT (T-577). The SoT is prdt-session-start.sh.
# One hook command = one additionalContext = one persistence check (a string over
# 10,000 chars is persisted to a file and arrives as a 2,000-char preview —
# measured, Claude Code 2.1.260), so a discipline set larger than one budget needs
# one registered command per part. Every slot execs the SoT with the part number
# read from its own file name; a slot past the last part the plan needs prints
# nothing. All p<k>.sh files are byte-identical on purpose — the number lives in
# the name, and the test pins the parity.
n="${0##*-p}"; n="${n%.sh}"
exec "$(cd "$(dirname "$0")" && pwd)/prdt-session-start.sh" --part "$n"
