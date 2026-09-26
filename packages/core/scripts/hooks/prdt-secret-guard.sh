#!/usr/bin/env bash
# prdt — credential guard (T-677 slices S2a + S2a-fix + S2b + S2b-fix + S2b-perf
# + script-fix).
# Registered (S3, hook-manifest.json) as PreToolUse, matcher `Read|Bash`;
# exercised directly by test/scripts/secret-guard-hook.test.ts spawning it.
#
# WHY (T-677): repeated real incidents — a worker cats/heads/seds a `.env*`
# file to check whether a key is set, and the value rides onto the screen and
# into the session transcript. contracts.md §Secrets bars any credential
# VALUE, in any environment, `.env.local` included — the actual gap was that
# there was no VALUE-FREE way to check "is the key set" until T-677 S1 landed
# `prdt env check <file> [KEY]` (packages/core/scripts/prdt `cmd_env`, exit
# 0/1/2/3, never a character of the value). This hook is the enforcement half:
# deny the print, name the probe.
#
# SHAPE (S2b-perf): two stages, two languages, on purpose.
#   bash  — the fork-0 MISS path (pre-filter `case` on the raw payload), the
#           single jq field extraction on a hit, the tool-name gate, the FIXED
#           deny text and the PreToolUse output shape. Nothing here walks a
#           command string character by character anymore.
#   perl  — the whole JUDGMENT (heredoc stripping · `$(...)`/backtick
#           extraction · segment split · tokenize · unquote · target match ·
#           per-command rules), one process per hit, fed the subject string on
#           stdin, answering the single word `deny` on stdout or nothing.
#           WHY perl and not "faster bash": bash 3.2 cannot scan a large string
#           in linear time AT ALL — `${s:i:1}` re-measures the whole string on
#           every call (strlen, O(n)), so any per-character loop is O(n^2) even
#           with zero string accumulation. The S2b-fix run-slicing rewrite
#           removed the `cur+="$c"` copies and STILL measured 21.3s / 21.5s on
#           a 60KB `node -e` / `git commit -m` argument and 1.31s on 1000 file
#           arguments (this machine, 2026-09-24, /bin/bash 3.2.57) — the
#           remaining cost was the indexing itself. perl is on every macOS box
#           (/usr/bin/perl, Apple-shipped) and virtually every Linux box
#           (perl-base is Essential on Debian/Ubuntu; /usr/bin/perl on RHEL
#           family), needs no module beyond `strict`, and runs the same
#           per-character algorithms — ported line for line, same function
#           names, same order — in single-digit milliseconds at 60KB. The
#           judgment's MEANING is unchanged: every allow/deny row in the test
#           file gives the identical verdict.
#
# SCOPE, this file's full history to date:
#   S2a       hook skeleton (fork-0 pre-filter → jq field extraction) ·
#             `is_target` (anchored basename, `.example`-suffix exception per
#             T-684) · Read judgment · Bash segment splitting on `;` `&&` `||`
#             `|` `(` `)` · "simple printer" judgment (cat/head/tail/sed/awk/
#             less/more/bat/nl/grep + a target argument anywhere → deny, NO
#             flag exemptions yet) · full unquoting of a path token before the
#             target-basename check · redirect-destination exclusion · the
#             fixed deny text.
#   S2a-fix   (QA grill S2a, T-677 Outcome §S2a fix) heredoc-body stripping
#             (H1) kept linear (H2) · a segment led by a shell reserved word /
#             grouping token still judges the command it introduces (M1) · a
#             path token with quotes anywhere in it, not only wrapping the
#             whole token (M3).
#   S2b       `grep -q/-l/-c/--quiet/--silent/--files-with-matches/
#             --files-without-match/--count` flag exemption · the first
#             non-flag arg of grep/sed/awk treated as its pattern/script and
#             excluded from target judgment unless `-e`/`-f`/`--regexp=` is
#             present · `sed -i`/`--in-place` exemption (writing, not
#             printing) · glob-token literals (`.env*`) judged as targets ·
#             `source`/`.`-then-echo chain detection · the `prdt env check`
#             self-exemption · splitting on a literal newline, `$(...)`, and
#             backticks · wrapper commands (`sudo`/`command`/`time`/`nice`/
#             `env`/`exec`/`nohup`/`timeout N`/`stdbuf`) skip their OWN
#             flags/values (M2) · case-insensitive basename match (M5, APFS)
#             · a bare `&` no longer glues onto the preceding word (L1).
#   S2b-fix   (QA grill S2b, T-677 Outcome §S2b fix) grep's flag-exemption
#             fallback never letter-matches a long option (`--color=never`
#             no longer exempts on the "c") · `-L` joins the exempt letters ·
#             `egrep`/`fgrep`/`rg` share grep's judgment · sed's in-place
#             exemption generalized to any short cluster containing `i` ·
#             `timeout -s/-k` and `stdbuf -i/-o/-e` consume their value token
#             · `watch`/`script` join the wrappers · backslash-newline (a real
#             line continuation) dropped entirely · `read`/`mapfile`/
#             `readarray`/`done < target`, `eval STRING`, `bash|sh|zsh -c
#             STRING` judged · `$(<file)` rewritten to a synthetic `cat <file>`
#             · `is_target` stopped forking `tr` per argument.
#   S2b-perf  (QA grill S2b HIGH, second half: linear time on EVERY hit path)
#             the judgment moved from bash to one perl process per hit — see
#             SHAPE above. Measured before → after (this machine, 2026-09-24,
#             wall time of one hook run, /bin/bash 3.2.57 + /usr/bin/perl
#             5.34): 60KB `node -e … process.env` 21.32s → see T-677 Outcome
#             §S2b perf · 60KB `git commit -m … .env` 21.47s → same · 1000
#             file arguments 1.31s → same. Miss path untouched (fork 0).
#   script-fix (QA regrill, 2026-09-24, PO-reproduced `script -q /dev/null
#             cat .env.local` → ALLOW on the tree) `script` was, until this
#             fix, treated by the command-word skip loop like every other
#             WRAPPER — skip only ITS OWN flags/values, then judge whatever
#             token is left as the command word. That is wrong for script(1):
#             the BSD form `script [-aeFkpqr] [-t time] [file [command
#             ...]]` puts a log FILE positional first, so the old code judged
#             the FILE token as the command and never reached the real
#             command after it (`script /dev/null cat .env.local`, `script -q
#             /dev/null cat .env.local` both silently allowed). The GNU
#             (util-linux) `-c COMMAND` form fared no better — its value was
#             consumed as an ordinary flag value and thrown away, never
#             queued for judgment the way `bash -c STRING` already is
#             (`script -c 'cat .env.local' /dev/null` allowed). Fixed: script
#             gets its own branch — `-c`'s value is queued into the same
#             @SUBST pipeline as `bash -c`/`eval`; otherwise, when a FILE
#             positional is followed by more tokens, only the FILE is
#             skipped and the remainder re-enters the ordinary command-word
#             scan (so `cat .env.local` is judged as its own command); a bare
#             `script`/`script FILE` with nothing after it judges nothing (an
#             interactive session, correctly allowed).
#
# ACCEPTED LIMITATIONS (not fixed, by design — read before treating any of
# these as an oversight):
#   - DELIBERATE EVASION CLASS (QA grill S2b, named explicitly as a class the
#     PO accepted rather than asked fixed): an ARITHMETIC `<<` (e.g.
#     `$(( 1 << 2 ))`) is indistinguishable, to `strip_heredocs`'s plain
#     substring scan, from a real heredoc operator — it can misidentify where
#     a "body" starts/ends around one · a `<<`-shaped substring living inside
#     an already-open multi-line QUOTED string can likewise confuse the
#     line-based tag match · file-descriptor redirects/dup tricks (`3< file`,
#     `cmd >&3` where fd 3 was opened elsewhere, `exec 3< .env.local` followed
#     by reads from `&3`) move the target file's bytes around without ever
#     naming it again in a form this hook's redirect handling recognizes ·
#     ANSI-C quoted strings (`$'\x2eenv'` etc.) let bash construct a literal
#     target substring at RUNTIME from bytes that never spell it out in the
#     command string this hook actually sees. All of these require a shell
#     parser this hook deliberately is not (fork-0 on a miss is the whole
#     point) to close — accepted, not silently shipped.
#   - PRE-FILTER QUOTE-SPLICE (M4-adjacent, found while building S2b): the
#     pre-filter (below) matches RAW, UNDECODED JSON bytes for perf (see its
#     own comment). A real shell word can quote-splice mid-identifier —
#     `cat .en"v".loc"al"` is a valid, real `.env.local` once bash (or this
#     hook's own `strip_quotes`) unquotes it — and `strip_quotes`/`tokenize`
#     handle that correctly (locked by a regression test). But when the
#     harness serializes that command into the tool-call JSON, a literal `"`
#     becomes `\"`, which lands INSIDE the substring "env" in the raw bytes
#     (`.en\"v\"`) and breaks the pre-filter's contiguous-substring match
#     before jq ever runs — the call is silently allowed. Every other quoting
#     shape tested (quotes OUTSIDE the target substring — wrapping the whole
#     token, a path segment, etc.) survives the pre-filter fine, because the
#     escaped quote then lands OUTSIDE "env"/"pem"/"key"/"p12"/
#     "credentials.json". Fixing this properly means unescaping the WHOLE raw
#     payload before the pre-filter can trust a substring miss — i.e. paying
#     a fork on every call, not just hits — which throws away the exact
#     property (557/thousands of calls are hits, T-677 Outcome §5) this
#     design was built to keep. Surfaced to the PO as `unresolved`.
#   - `-e`/`-f`/`--regexp=` DISABLE the pattern-position skip (so the normal
#     first-positional-is-a-pattern assumption stops applying) but this does
#     NOT separately exclude the flag's OWN attached value token from
#     judgment (e.g. `grep -e '.env.local' file` denies on the `-e` value
#     itself, not just on `file`) — over-denial, the same safe direction used
#     throughout this hook, not under-denial.
#   - `$(...)`/backtick extraction does simple paren/backtick nesting by
#     character count; it does not itself track quoting INSIDE the extracted
#     substitution text (that text is then re-processed by the full pipeline,
#     including its own quote-aware tokenize, so a target inside it is still
#     judged correctly — only the outer boundary-finding is naive). A
#     substitution containing a literal unbalanced paren inside its own
#     quotes could mis-locate the boundary; no such case is in this ticket's
#     matrix.
#
# PRE-FILTER (fork-0 on a miss): a raw substring `case` on the WHOLE undecoded
# payload, deliberately broader than `is_target` (it also fires on `prdt.env`,
# `environment.env`, `.envrc` — anything with the substring at all) because its
# only job is "worth forking at all", and `is_target` below re-checks
# precisely. Measured (this machine, bash+read only, no fork): ~5.6ms median on
# a miss. A hit forks `jq` once for exactly three fields — measured ~10.6ms —
# then perl once for the judgment; hits are the minority (557 of thousands of
# real tool calls sampled, T-677 Outcome §5).
#
# ASSUMPTION (QA grill S2a L2): this match is against the RAW JSON bytes, never
# jq-decoded, so it assumes the payload's `.` (in a real target substring, e.g.
# `.env`) is never `.`-escaped — a harness that emitted `tool_input` with
# `.` in place of a literal `.` would sail past this case untouched. Not
# fixed here: no tool-call payload this hook has ever seen encodes an ordinary
# printable ASCII character that way (JSON never requires it), so the grill
# marked this an accepted, effectively unreachable gap rather than a live one.
# The QUOTE-splice gap above is the same class of assumption, but reachable —
# see ACCEPTED LIMITATIONS.
#
# TRUST: nothing from the payload is ever echoed back. The deny text is FIXED —
# no interpolation of `tool_input.command`, `file_path`, or any token — so a
# forged or drift-shaped command string cannot ride out through the reason a
# model reads. `tool_input.description` (a model-authored label, not data the
# harness itself vouches for) is never inspected by the judgment either. The
# perl stage can only ever say the one word `deny`; anything else it prints
# (or fails to print) is an allow.
#
# FAIL-OPEN: jq missing from PATH, perl missing from PATH AND from
# /usr/bin/perl, malformed JSON, `tool_input` not the expected shape, or the
# perl stage dying for any reason all fall through to silent `exit 0`, same
# direction as every other prdt hook (install.sh dies without jq; a hook must
# not). perl's stderr is discarded so a warning can never leak as hook noise.

set +e

# Byte semantics: JSON structure and every value this hook shape-matches is
# ASCII, and a wide-char locale measurably taxes every `${VAR%%pattern}` cut
# (prdt-call-governor.sh: 121ms vs 1ms on a 28KB payload, ko_KR.UTF-8 vs C).
# Set before the first expansion.
LC_ALL=C

# Drain stdin with the builtin, no fork (same measured rationale as the other
# PreToolUse hooks: the fork costs more than the syscalls it saves, and
# `read -d ''` still drains to EOF so the harness never sees an EPIPE).
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# ── pre-filter: fork nothing on a miss ────────────────────────────────────────
# `nocasematch` (S2b, M5 fix): this machine's default filesystem (APFS) is
# case-insensitive, so a command reading `.ENV.LOCAL` reads the same file as
# `.env.local` — a case-SENSITIVE substring match here would exit 0 (miss)
# before jq or `is_target` (which does its own case-fold) ever ran, silently
# skipping the whole hook for an upper/mixed-case spelling. Built-in shopt, no
# fork — restored immediately after so every later `case` in this file (tool
# names) stays case-SENSITIVE as intended.
shopt -s nocasematch
case "$EV" in
  *.env*|*.pem*|*.key*|*.p12*|*credentials.json*) _hit=1 ;;
  *) _hit=0 ;;
esac
shopt -u nocasematch
[ "$_hit" -eq 1 ] || exit 0

# ── field extraction: jq, exactly three fields, fail-open on anything odd ───
# One jq invocation, `\x1e` (a byte that cannot appear in a jq string output
# unescaped and never appears in a real tool payload) joins the three fields so
# a single fork yields all of them. A `tool_input` that is missing, null, or
# not an object index-null's to empty string under `//` for the two leaves; a
# `tool_input` that is some OTHER scalar (a string, a number) makes `.file_path`
# / `.command` a jq runtime error, which aborts the WHOLE `-j` expression before
# it prints anything — $FIELDS stays empty, same fail-open exit below.
FIELDS="$(printf '%s' "$EV" | jq -j \
  '(.tool_name // "") + "\u001e" + ((.tool_input.file_path // "") | if type=="string" then . else "" end) + "\u001e" + ((.tool_input.command // "") | if type=="string" then . else "" end)' \
  2>/dev/null)"
[ -n "$FIELDS" ] || exit 0

TOOL_NAME="${FIELDS%%$'\x1e'*}"
_REST="${FIELDS#*$'\x1e'}"
FILE_PATH="${_REST%%$'\x1e'*}"
CMD="${_REST#*$'\x1e'}"

# Registration is `Read|Bash`; a direct standalone invocation (as this hook's
# own test suite does, and as a mis-registration would) can hand this anything
# — stay silent on everything else, per contracts §Secrets fail-open direction.
case "$TOOL_NAME" in
  Read) SUBJECT="$FILE_PATH" ;;
  Bash) SUBJECT="$CMD" ;;
  *) exit 0 ;;
esac

DENY_MSG='[prdt secret guard] Denied: this call would print the contents of a credential file (.env / .env.* / *.pem / *.key / credentials.json / *.p12) onto the screen and into the session record (T-677). Check a key without seeing it: `prdt env check <file> [KEY]` — presence and length only. Load it for a command: `set -a; . <file>; set +a; <cmd>`. Writing, ls/stat/test -f, grep -q/-l/-c are never denied.'

deny_and_exit() {
  jq -n --arg m "$DENY_MSG" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$m}}' \
    2>/dev/null
  exit 0
}

# ── the judgment (perl) ───────────────────────────────────────────────────────
# One bash single-quoted literal, so nothing below is expanded by bash and the
# program is handed to perl byte-for-byte via `-e`. CONSEQUENCE: the perl text
# may not contain a single-quote character anywhere (code OR comments) — a
# quote character in perl is spelled "\x27" (single) and q(") (double).
#
# Invocation contract (bottom of this file): argv[1] = tool name (`Read` or
# `Bash`), stdin = the subject string (file_path for Read, command for Bash),
# raw bytes, no trailing newline added. Output: exactly `deny` for a denial,
# nothing for an allow. `-C0` pins perl to byte semantics regardless of a
# `PERL_UNICODE` in the ambient env (an EMPTY `PERL_UNICODE` means `-CSDL`,
# so clearing the variable would be the wrong fix). No module is loaded but
# `strict` (core, always present).
#
# Every function below is the S2a..S2b-fix bash function of the same name,
# ported statement for statement — the comments that explain WHY each rule
# exists travel with it. Where bash and perl semantics could differ (glob
# `*` vs regex, `${x##*/}` vs a regex, nocasematch vs `lc`, substring
# clamping past the end) the port spells out the bash behavior it matches.
PRDT_JUDGE='
use strict;
binmode STDIN; binmode STDOUT;

my $SQ = "\x27";
my $DQ = q(");

# is_target(b): anchored basename judgment. `b` must already be the caller
# best-effort basename (quote-stripped, last `/`-segment). Anchored, not a bare
# suffix match, because "ends with `.env`" also catches `~/.prdt/prdt.env`
# (read by prdt-session-start.sh and 40+ core tests) and the GUI legacy
# `productune.env` — neither is a credential file. `.envrc` / `environment.env`
# / `.environment` are non-matches for the same reason: none of them starts
# with the literal `.env.` this checks, nor equals `.env` outright.
#
# `.example`-suffix exception is DELIBERATELY WIDER than the Acceptance literal
# `.env.example` — T-684 answer (2026-09-24, quoted in the ticket Acceptance
# addition): a real `.env.local.example` exists on this machine (paepyeong
# project), so the exception is "basename ends in `.example`", checked FIRST so
# it wins over every other branch (a name can be both `.env.`-prefixed and
# `.example`-suffixed at once).
#
# Case-folds (M5, S2b; APFS is case-insensitive: `.ENV.LOCAL` IS `.env.local`)
# the way bash `shopt -s nocasematch` under LC_ALL=C did: ASCII only. perl `lc`
# on a byte string with no `use locale` / `unicode_strings` is exactly that.
#
# GLOB-TOKEN LITERALS (S2b): a Bash argument can itself be an UNEXPANDED glob
# — `cat .env*` never lets the shell expand `.env*`, this hook only ever sees
# the literal four characters, but the shell that eventually runs it WILL
# expand it, and the expansion is a real target. `.env.*` / `*.pem` / `*.key`
# / `*.p12` already self-match the anchored patterns below (`.env.*` starts
# with `.env.`, `*.pem` ends with `.pem`), so only `.env*` (no dot before the
# star) needs its own arm — same as the bash case-glob version.
sub is_target {
  my $b = lc(shift);
  return 0 if $b =~ /\.example\z/;
  return 1 if $b eq ".env";
  return 1 if $b =~ /\A\.env\./;
  return 1 if $b eq ".env*";
  return 1 if $b =~ /\.(?:pem|key|p12)\z/;
  return 1 if $b eq "credentials.json";
  return 0;
}

# bash `${x##*/}`: drop the longest prefix ending in `/` — everything up to and
# including the LAST slash, newlines included (bash glob `*` crosses them).
sub basename { my $x = shift; $x =~ s{\A.*/}{}s; return $x }

# A redirect-destination operator token as `tokenize` emits it: the NEXT token
# is a destination (or fd), never an argument to judge.
sub is_redir_out { my $t = shift; return ($t eq ">" || $t eq ">>" || $t eq "&>" || $t =~ /\A[0-9]>>?\z/) ? 1 : 0 }

# strip_quotes(t): fully unquote one token — QUOTES ANYWHERE IN THE TOKEN (M3
# grill: a token like `./".env.local"` is quoted only from the 2nd character
# on, so a whole-token check misses it and the trailing quote rides into the
# basename, which then fails the `.env.*` anchor outright). Walks the token
# once, dropping every quote character that is acting as a quote (tracking
# single- vs double-quote state) while copying everything else through; a `\`
# outside quotes, or a `\"`/`\\`/`\$`/backslash-backtick inside double quotes,
# drops the backslash and keeps the escaped character — a single-quoted body
# never treats `\` specially, matching real shell unquoting.
#
# L3 (QA grill S2b LOW): a real shell line continuation — an unquoted (or
# double-quoted) `\` directly followed by a literal newline byte — is removed
# ENTIRELY (both bytes vanish, joining the next line with no separator), never
# "escapes the newline into the token" the way every other `\X` pair keeps
# `X`. Before that fix `cat \` + newline + `.env.local` kept the newline BYTE
# in front of `.env.local`, so the anchored `.env.*` check no longer matched
# at position 0 and the read silently allowed.
sub strip_quotes {
  my $t = shift;
  my $n = length $t;
  my ($i, $q, $out) = (0, "", "");
  while ($i < $n) {
    my $c = substr($t, $i, 1);
    if ($q ne "") {
      if ($c eq $q) { $q = ""; $i++; next }
      if ($q eq $DQ && $c eq "\\") {
        my $nc = substr($t, $i + 1, 1);
        if ($nc eq $DQ || $nc eq "\\" || $nc eq "\$" || $nc eq "`") { $out .= $nc; $i += 2; next }
        if ($nc eq "\n") { $i += 2; next }
      }
      $out .= $c; $i++; next;
    }
    if ($c eq $SQ || $c eq $DQ) { $q = $c; $i++; next }
    if ($c eq "\\") {
      my $nc = substr($t, $i + 1, 1);
      $out .= $nc unless $nc eq "\n";
      $i += 2; next;
    }
    $out .= $c; $i++;
  }
  return $out;
}

# split_bash(s): split a command string into simple-command segments on
# unquoted `;` `&&` `||` `|` `(` `)` and (S2b) a literal newline — a
# heredoc-free multi-line Bash tool_input (`source .env.local\necho $K`) is
# still one string with real newline bytes once jq decodes it, and each
# physical line is its own simple command exactly like a `;`-separated one.
# NOT split here: `$(...)` / backticks — those are pulled out by
# `extract_substitutions` BEFORE this ever runs, and judged independently. A
# segment is always an exact contiguous slice of `s` (nothing here drops or
# transforms a character within a segment, only decides where one ends).
# Inside quotes a backslash is NOT special here (only the matching quote
# closes) — same as the bash version, whose per-token `strip_quotes` is the
# one place escapes are resolved.
sub split_bash {
  my $s = shift;
  my $n = length $s;
  my ($i, $q, $start) = (0, "", 0);
  my @seg;
  while ($i < $n) {
    my $c = substr($s, $i, 1);
    if ($q ne "") { $q = "" if $c eq $q; $i++; next }
    if ($c eq $SQ || $c eq $DQ) { $q = $c; $i++; next }
    if ($c eq "\\") { $i += 2; next }
    if ($c eq ";" || $c eq "(" || $c eq ")" || $c eq "\n") {
      push @seg, substr($s, $start, $i - $start); $i++; $start = $i; next;
    }
    if ($c eq "&") {
      if (substr($s, $i, 2) eq "&&") { push @seg, substr($s, $start, $i - $start); $i += 2; $start = $i }
      else { $i++ }
      next;
    }
    if ($c eq "|") {
      push @seg, substr($s, $start, $i - $start);
      $i += (substr($s, $i, 2) eq "||") ? 2 : 1;
      $start = $i; next;
    }
    $i++;
  }
  push @seg, ($start <= $n ? substr($s, $start) : "");
  return @seg;
}

# tokenize(s): one segment into words + redirect-operator tokens (`>` `>>`
# `N>` `N>>` `&>` `<`) and (S2b) a standalone job-control `&`, quote-aware.
# Whitespace — space/tab/CR/LF — is a word separator outside quotes. A token
# raw text is always an exact contiguous slice of `s` (quoting/escaping is
# preserved verbatim here; only `strip_quotes` later resolves it).
#
# L1 (S2b): a bare `&` with NO preceding space (`cat .env&`) used to glue onto
# the previous word, so the token became the literal 5 chars `.env&`, which
# fails the EXACT `.env` match and the `.env.*` prefix match alike — silently
# ALLOWED a real read of `.env`. `&` (job control) is a shell operator exactly
# like `<`/`>`; it ends the current word the same way they do, whether or not
# whitespace preceded it.
sub tokenize {
  my $s = shift;
  my $n = length $s;
  my ($i, $q, $inword, $ts) = (0, "", 0, 0);
  my @tok;
  while ($i < $n) {
    my $c = substr($s, $i, 1);
    if ($q ne "") { $q = "" if $c eq $q; $i++; next }
    if ($c eq " " || $c eq "\t" || $c eq "\n" || $c eq "\r") {
      if ($inword) { push @tok, substr($s, $ts, $i - $ts); $inword = 0 }
      $i++; next;
    }
    if ($c eq $SQ || $c eq $DQ) {
      if (!$inword) { $ts = $i; $inword = 1 }
      $q = $c; $i++; next;
    }
    if ($c eq "\\") {
      if (!$inword) { $ts = $i; $inword = 1 }
      $i += 2; next;
    }
    if ($c eq ">") {
      if ($inword) { push @tok, substr($s, $ts, $i - $ts); $inword = 0 }
      if (substr($s, $i, 2) eq ">>") { push @tok, ">>"; $i += 2 } else { push @tok, ">"; $i++ }
      next;
    }
    if ($c eq "<") {
      if ($inword) { push @tok, substr($s, $ts, $i - $ts); $inword = 0 }
      push @tok, "<"; $i++; next;
    }
    if ($c eq "&") {
      if ($inword) { push @tok, substr($s, $ts, $i - $ts); $inword = 0 }
      if (substr($s, $i, 2) eq "&>") { push @tok, "&>"; $i += 2 } else { push @tok, "&"; $i++ }
      next;
    }
    if ($c =~ /\A[0-9]\z/) {
      if (!$inword && substr($s, $i + 1, 1) eq ">") {
        if (substr($s, $i + 2, 1) eq ">") { push @tok, "$c>>"; $i += 3 } else { push @tok, "$c>"; $i += 2 }
      } else {
        if (!$inword) { $ts = $i; $inword = 1 }
        $i++;
      }
      next;
    }
    if (!$inword) { $ts = $i; $inword = 1 }
    $i++;
  }
  push @tok, substr($s, $ts) if $inword;
  return @tok;
}

# strip_heredocs(s): drop heredoc bodies BEFORE any segment splitting or
# tokenizing ever sees them (H1 grill: `cat > README.md <<EOF` with
# `.env.local` in the body was judged DENY because the body words landed in
# the same segment as `cat` and got read as its arguments — a heredoc body is
# literal stdin data, never a command-line argument, whatever it spells).
# Walks physical lines once: an unquoted `<<`/`<<-` (not `<<<`, a here-STRING
# with no body) opens a heredoc; its tag may be bare or quoted (quoting the
# tag only gates the body own variable expansion, never the terminator match,
# so it is quote-stripped before comparison) — every following line is
# DROPPED up to and including the first line equal to the tag (leading tabs
# stripped first when the operator was `<<-`). A heredoc tag matching a
# target-shaped string, e.g. `cat <<.env.local`, still over-denies —
# accepted, over-denial is the safe direction.
#
# Line model matches the bash `while IFS= read -r line` over a here-string:
# split on newline keeping a trailing empty field when `s` ends in a newline
# (perl split with a -1 limit), and an empty `s` yields no lines at all.
sub strip_heredocs {
  my $s = shift;
  my @lines = ($s eq "") ? () : split(/\n/, $s, -1);
  my $nl = @lines;
  my ($li, @out) = (0);
  while ($li < $nl) {
    my $line = $lines[$li];
    my $n = length $line;
    my ($i, $q, $found, $strip_tabs, $tag) = (0, "", 0, 0, "");
    while ($i < $n) {
      my $c = substr($line, $i, 1);
      if ($q ne "") { $q = "" if $c eq $q; $i++; next }
      if ($c eq $SQ || $c eq $DQ) { $q = $c; $i++; next }
      if ($c eq "\\") { $i += 2; next }
      if ($c eq "<") {
        if (substr($line, $i, 3) eq "<<<") { $i += 3; next }
        if (substr($line, $i, 2) eq "<<") {
          my $rest = substr($line, $i + 2);
          if (substr($rest, 0, 1) eq "-") { $strip_tabs = 1; $rest = substr($rest, 1) }
          $rest =~ s/\A[ \t]+//;
          my $f = substr($rest, 0, 1);
          if ($f eq $DQ) { $tag = substr($rest, 1); $tag =~ s/".*\z//s }
          elsif ($f eq $SQ) { $tag = substr($rest, 1); $tag =~ s/\x27.*\z//s }
          else { ($tag) = $rest =~ /\A([^ \t\n\r\f\x0b]*)/ }
          $found = 1 if $tag ne "";
          $i = $n; next;
        }
        $i++; next;
      }
      $i++;
    }
    push @out, $line;
    $li++;
    if ($found) {
      while ($li < $nl) {
        my $cmp = $lines[$li];
        $cmp =~ s/\A\t+// if $strip_tabs;
        $li++;
        last if $cmp eq $tag;
      }
    }
  }
  return join("\n", @out);
}

# extract_substitutions(s): pull `$(...)` and backtick command substitutions
# out of the command BEFORE segment-splitting, and queue their INNER text as
# its own independent command string — `eval "$(grep ^KC_S3_ .env.local)"`
# (the accepted-false-positive row, T-677 Outcome §5) is denied because the
# extracted inner text is then judged by the exact same pipeline as any
# top-level command, and `grep` with no exemption flag + a real target
# argument denies on its own.
#
# Real bash: `$(...)`/backticks are STILL substituted inside double quotes
# (only single quotes make them inert) — so this tracks quote state and skips
# extraction ONLY while single-quoted; double-quote state still triggers it
# (with `\"`/`\\` handled first so an escaped quote does not prematurely
# close). The outer string gets a single space in place of the whole
# substitution (never left empty — a `cat""` next to it must not become a
# run-on word) so it keeps parsing as an ordinary, harmless token.
# Paren/backtick matching is a simple counter, not itself quote-aware inside
# the substitution (ACCEPTED LIMITATIONS, header).
#
# `$(<file)` (QA grill S2b MEDIUM): bash builtin fast-read form equivalent to
# `$(cat file)` WITHOUT running `cat` — nothing in the PRINTERS set would see
# a bare filename as its own "command", so the inner text is rewritten into a
# synthetic `cat <file>` before queuing and gets the printer judgment `cat`
# already gets. (bash ERE `.` crosses newlines: perl /s.)
#
# Runs on the heredoc-stripped text, never the raw command.
sub extract_substitutions {
  my $s = shift;
  my $n = length $s;
  my ($i, $q, $rs, $out) = (0, "", 0, "");
  my @subs;
  while ($i < $n) {
    my $c = substr($s, $i, 1);
    if ($q eq $SQ) { $q = "" if $c eq $SQ; $i++; next }
    if ($q eq $DQ && $c eq "\\") { $i += 2; next }
    if ($q eq $DQ && $c eq $DQ) { $q = ""; $i++; next }
    if ($q eq "" && ($c eq $SQ || $c eq $DQ)) { $q = $c; $i++; next }
    if ($q eq "" && $c eq "\\") { $i += 2; next }
    if ($c eq "\$" && substr($s, $i + 1, 1) eq "(") {
      $out .= substr($s, $rs, $i - $rs) if $i > $rs;
      my $depth = 1;
      my $ss = $i + 2;
      $i += 2;
      while ($i < $n && $depth > 0) {
        my $d = substr($s, $i, 1);
        $depth++ if $d eq "(";
        $depth-- if $d eq ")";
        $i++;
      }
      my $len = $i - $ss - 1;
      my $inner = $len > 0 ? substr($s, $ss, $len) : "";
      if ($inner =~ /\A[ \t\n\r\f\x0b]*<(.*)\z/s) { push @subs, "cat $1" } else { push @subs, $inner }
      $out .= " ";
      $rs = $i;
      next;
    }
    if ($c eq "`") {
      $out .= substr($s, $rs, $i - $rs) if $i > $rs;
      my $ss = $i + 1;
      $i++;
      while ($i < $n && substr($s, $i, 1) ne "`") { $i++ }
      push @subs, substr($s, $ss, $i - $ss);
      $i++;
      $out .= " ";
      $rs = $i;
      next;
    }
    $i++;
  }
  $out .= substr($s, $rs) if $rs < $n;
  return ($out, @subs);
}

# "simple printer" set — no flag/argument-position exemption, any of these
# plus a target argument anywhere → deny. grep/sed/awk (and egrep/fgrep/rg,
# S2b-fix) are handled SEPARATELY (%PATTERN) because they alone get a flag
# exemption and/or a pattern-position argument exclusion. WRAPPERS are the
# commands the command-word scan sees THROUGH (M2), each consuming ITS OWN
# flags (and, where the flag takes a value, that value too) before the scan
# resumes looking for the real command word.
my %PRINTERS = map { $_ => 1 } qw(cat head tail less more bat nl);
my %PATTERN  = map { $_ => 1 } qw(grep egrep fgrep rg sed awk);
my %WRAPPERS = map { $_ => 1 } qw(sudo command time nice env exec nohup timeout stdbuf watch script);

my @SUBST;
sub deny { print "deny"; exit 0 }

# judge_command(s): the full Bash-argument pipeline over ONE command string —
# called once for the (post-substitution-extraction) outer command, and once
# more per extracted `$(...)`/backtick/eval/`-c` inner text. `$sourced` is
# local to each call — it never chains ACROSS an outer command and an
# unrelated substitution, only within the same one.
sub judge_command {
  my $cmdstr = shift;
  my $sourced = 0;
  for my $seg (split_bash($cmdstr)) {
    my @T = tokenize($seg);
    my $ntok = @T;
    my $idx = 0;
    # Skip leading `VAR=val` assignments, a leading shell reserved word /
    # grouping token (M1), and wrapper commands together with their OWN
    # flags/values (M2) — so the token left at $idx is the actual program,
    # never its env prefix, its wrapper, or the keyword that introduced this
    # segment. `{`/`}` cover a group command and a `name() { … }` function
    # body alike — `(`/`)` already split the `name()` header off as its own
    # (empty, harmless) segments in split_bash, so the body segment here
    # always starts with `{`.
    while ($idx < $ntok) {
      my $t = $T[$idx];
      if ($t =~ /\A[A-Za-z_][A-Za-z0-9_]*=/) { $idx++; next }
      if ($t eq "then" || $t eq "do" || $t eq "else" || $t eq "elif" || $t eq "if"
          || $t eq "until" || $t eq "while" || $t eq "!" || $t eq "{") { $idx++; next }
      if ($WRAPPERS{$t}) {
        my ($w, $widx) = ($t, $idx);
        $idx++;
        if ($w eq "sudo") {
          while ($idx < $ntok && $T[$idx] =~ /\A-/) {
            my $f = $T[$idx];
            $idx += ($f eq "-u" || $f eq "-g" || $f eq "-p" || $f eq "-h" || $f eq "-U") ? 2 : 1;
          }
        } elsif ($w eq "nice") {
          while ($idx < $ntok && $T[$idx] =~ /\A-/) { $idx += ($T[$idx] eq "-n") ? 2 : 1 }
        } elsif ($w eq "timeout") {
          # `-s`/`--signal` and `-k`/`--kill-after` each take a value token of
          # their own — `timeout -s KILL 5 cat .env.local` used to land on
          # `KILL`, stop the flag-skip there, eat it as "the duration", and
          # never reach `cat`. The duration itself is always exactly one more
          # token, consumed unconditionally.
          while ($idx < $ntok && $T[$idx] =~ /\A-/) {
            my $f = $T[$idx];
            $idx += ($f eq "-s" || $f eq "--signal" || $f eq "-k" || $f eq "--kill-after") ? 2 : 1;
          }
          $idx++ if $idx < $ntok;
        } elsif ($w eq "stdbuf") {
          # `-i`/`-o`/`-e` each take a buffering-mode value (`stdbuf -o L`).
          while ($idx < $ntok && $T[$idx] =~ /\A-/) {
            my $f = $T[$idx];
            $idx += ($f eq "-i" || $f eq "-o" || $f eq "-e") ? 2 : 1;
          }
        } elsif ($w eq "watch") {
          while ($idx < $ntok && $T[$idx] =~ /\A-/) { $idx += ($T[$idx] eq "-n") ? 2 : 1 }
        } elsif ($w eq "script") {
          # script(1) is NOT shaped like the other wrappers: the BSD form
          # syntax is `script [-aeFkpqr] [-t time] [file [command ...]]` —
          # after its OWN flags, the remaining tokens are POSITIONAL (an
          # optional log FILE, then an optional COMMAND to actually run),
          # never another flag/value pair to skip. The GNU (util-linux) form
          # `-c COMMAND` instead re-parses its value as a brand-new command
          # string exactly like `bash -c` does above (QA regrill,
          # 2026-09-24, T-677: `script -c` PLUS-quoted-command PLUS
          # `/dev/null`, and the BSD `script -q /dev/null cat .env.local`
          # form, both silently ALLOWED before this fix — the `-c` value was
          # skipped as an ordinary flag value and PO-reproduced, and the BSD
          # command tokens were never reached because the old code treated
          # the first REMAINING token as the command word, which is the log
          # FILE, not `cat`).
          my $c_val;
          while ($idx < $ntok && $T[$idx] =~ /\A-/) {
            my $f = $T[$idx];
            if ($f eq "-c") { $idx++; $c_val = $T[$idx] if $idx < $ntok; $idx++ }
            elsif ($f eq "-t") { $idx += 2 }
            else { $idx++ }
          }
          if (defined $c_val) {
            # The `-c` value is a full command STRING (`bash -c` shape) —
            # queue it for independent judgment; anything left in this
            # segment after it (the log file, if given) is not a command
            # and is never itself scanned as one.
            my $sq = strip_quotes($c_val);
            push @SUBST, $sq if $sq ne "";
            $idx = $ntok;
          } elsif ($idx + 1 < $ntok) {
            # A FILE positional is present AND at least one more token
            # follows it — that remainder is the real COMMAND
            # (`script /dev/null cat .env.local`). Skip only the file; the
            # outer skip-loop re-classifies from the next token exactly as
            # if it opened this segment, so `cat .env.local` gets the
            # ordinary printer judgment.
            $idx++;
          } else {
            # Nothing left, or exactly one token left (the file alone, no
            # command — `script out.log`, an interactive session with
            # nothing to judge).
            $idx = $ntok;
          }
        } else {
          while ($idx < $ntok && $T[$idx] =~ /\A-/) { $idx++ }
        }
        # A wrapper with NOTHING left after its own flags/values (a bare
        # `env`, `timeout 5` with no trailing command) is not really wrapping
        # anything — the wrapper name itself is the effective command word
        # (M2 round 2: a bare `env` at the end of a `source`-then chain is
        # exactly the risky introspection case below, `set -a; . ./.env.local;
        # set +a; env`). Revert to the wrapper token and fall out of the
        # skip-loop (not `next`, which would re-enter and re-skip it).
        if ($idx >= $ntok) { $idx = $widx; last }
        next;
      }
      last;
    }
    next if $idx >= $ntok;

    my $cmdbase = basename(strip_quotes($T[$idx]));

    # source/`.`-then-echo (S2b): sourcing a target is itself ALLOWED (the
    # loader idiom, `set -a; . <file>; set +a; <cmd>`, is the deny message
    # own suggested workaround, and 63/63 real loader calls sampled were this
    # shape, T-677 Outcome §5) — but once it has happened, a LATER simple
    # command in the same overall Bash call that dumps the shell variables
    # (rather than using them inside a real program args) reaches the same
    # value onto the screen one step removed. Scans this segment OWN remaining
    # tokens for a target, same redirect handling as the printer scan below.
    if ($cmdbase eq "source" || $cmdbase eq ".") {
      my $jj = $idx + 1;
      while ($jj < $ntok) {
        my $tok = $T[$jj];
        if (is_redir_out($tok)) { $jj += 2; next }
        if ($tok eq "<") { $jj++; next }
        $sourced = 1 if is_target(basename(strip_quotes($tok)));
        $jj++;
      }
      next;
    }

    if ($sourced) {
      if ($cmdbase eq "echo" || $cmdbase eq "printf") {
        my $hit = 0;
        for my $jj ($idx + 1 .. $ntok - 1) { $hit = 1 if index($T[$jj], "\$") >= 0 }
        deny() if $hit;
      } elsif ($cmdbase eq "env" || $cmdbase eq "printenv" || $cmdbase eq "typeset") {
        deny();
      } elsif ($cmdbase eq "compgen") {
        deny() if $idx + 1 < $ntok && $T[$idx + 1] eq "-v";
      } elsif ($cmdbase eq "export" || $cmdbase eq "declare") {
        deny() if $ntok - $idx - 1 == 0;
        for my $jj ($idx + 1 .. $ntok - 1) { deny() if $T[$jj] eq "-p" }
      } elsif ($cmdbase eq "set") {
        deny() if $ntok - $idx - 1 == 0;
      }
    }

    # probe self-exemption (S2b): `prdt env check <file> [KEY]` (or a full
    # path to `prdt`, basename-matched like everywhere else) is the value-free
    # replacement this whole hook points to in its own deny text — its own
    # arguments (a target file, a bare KEY name) must never be judged. Not
    # strictly load-bearing today (`prdt` is in neither command set) but kept
    # explicit, matching the ticket design, and future-proof against either
    # set ever growing to include a colliding name.
    if ($cmdbase eq "prdt" && $idx + 2 < $ntok && $T[$idx + 1] eq "env" && $T[$idx + 2] eq "check") { next }

    # read/mapfile/readarray/done with `< target` (QA grill S2b MEDIUM): none
    # of these are printers, so a target fed to them via stdin redirection was
    # never judged — `read line < .env.local` and `while read line; do …;
    # done < .env.local` (the redirect lands on the loop-closing `done`, its
    # own simple command in this segment split) both hand the file bytes to a
    # shell builtin the same way `cat < file` hands them to a real printer.
    if ($cmdbase eq "read" || $cmdbase eq "mapfile" || $cmdbase eq "readarray" || $cmdbase eq "done") {
      my $jj = $idx + 1;
      while ($jj < $ntok) {
        my $tok = $T[$jj];
        if (is_redir_out($tok)) { $jj += 2; next }
        if ($tok eq "<") {
          $jj++;
          deny() if $jj < $ntok && is_target(basename(strip_quotes($T[$jj])));
          next;
        }
        $jj++;
      }
      next;
    }

    # eval STRING (QA grill S2b MEDIUM): `eval` re-parses its OWN arguments,
    # joined with a single space, as a brand-new command — a plain `eval "cat
    # .env.local"` (no substitution at all) fell straight through unjudged.
    # Queuing the joined, unquoted argument text as its own command string
    # (same @SUBST queue, processed by the index-based loop at the bottom)
    # reuses the exact judgment pipeline rather than duplicating it.
    if ($cmdbase eq "eval") {
      my $jj = $idx + 1;
      my $parts = "";
      while ($jj < $ntok) {
        my $tok = $T[$jj];
        if (is_redir_out($tok)) { $jj += 2; next }
        if ($tok eq "<") { $jj++; next }
        my $sq = strip_quotes($tok);
        $parts = ($parts eq "") ? $sq : "$parts $sq";
        $jj++;
      }
      push @SUBST, $parts if $parts ne "";
      next;
    }

    # bash|sh|zsh -c STRING (QA grill S2b MEDIUM): a sub-shell invoked with
    # `-c` re-parses its STRING argument as a brand-new command exactly like
    # `eval`. Only the EXACT `-c` token is recognized (a combined short-flag
    # form like `-lc` is an accepted gap) — the token immediately after it is
    # the string, queued the same way. Falls through afterwards (the shell
    # name itself is in neither command set).
    if ($cmdbase =~ /\A(?:bash|sh|zsh|dash|ksh)\z/) {
      my $jj = $idx + 1;
      while ($jj < $ntok) {
        if ($T[$jj] eq "-c") {
          $jj++;
          if ($jj < $ntok) { my $sq = strip_quotes($T[$jj]); push @SUBST, $sq if $sq ne "" }
          last;
        }
        $jj++;
      }
    }

    if ($PATTERN{$cmdbase}) {
      # grep/sed/awk: flag exemption + pattern-position exclusion. Two passes
      # over the remaining tokens (skipping redirect-destination tokens
      # exactly like the simple scan below): pass 1 classifies every
      # non-redirect token as a flag or a candidate (a bare, non-flag word)
      # and determines (a) whether an EXEMPTION flag makes the whole call
      # allowed outright (grep -q/-l/-L/-c family; sed -i/--in-place, writing
      # rather than printing) and (b) whether an EXPLICIT pattern flag
      # (-e/-f/--regexp=; awk: -f only) is present, which means there is no
      # assumed inline pattern/script to skip. Pass 2 walks the collected
      # candidates in order and judges every one EXCEPT the first, UNLESS
      # explicit was seen (then all of them are judged) — `grep ".env.local"
      # .gitignore` allows because the pattern itself is shaped like a target
      # but is candidate #1 and no -e/-f was given; `grep -l TOKEN .env*`
      # allows outright on the -l exemption before any candidate is looked at.
      #
      # A long option (`--…`) is NEVER letter-matched (QA grill S2b HIGH:
      # `--color=never` used to exempt on the "c" in "color") — it either
      # matches one of the named exemptions/explicit-pattern forms exactly, or
      # matches nothing at all. Only a genuine short-option CLUSTER is still
      # letter-matched. sed: any short cluster containing `i` (`-Ei`/`-ri`)
      # is in-place (QA grill S2b LOW), long options likewise never
      # letter-matched.
      my ($exempt, $explicit) = (0, 0);
      my @cand;
      my $jj = $idx + 1;
      while ($jj < $ntok) {
        my $tok = $T[$jj];
        if (is_redir_out($tok)) { $jj += 2; next }
        if ($tok eq "<") { $jj++; next }
        my $v = strip_quotes($tok);
        if ($v =~ /\A-/) {
          if ($cmdbase eq "grep" || $cmdbase eq "egrep" || $cmdbase eq "fgrep" || $cmdbase eq "rg") {
            if ($v =~ /\A(?:--quiet|--silent|--files-with-matches|--files-without-match|--count)\z/) { $exempt = 1 }
            elsif ($v =~ /\A--regexp=/) { $explicit = 1 }
            elsif ($v =~ /\A--/) { }
            elsif ($v eq "-e" || $v eq "-f") { $explicit = 1 }
            elsif ($v =~ /[qlLc]/) { $exempt = 1 }
          } elsif ($cmdbase eq "sed") {
            if ($v eq "--in-place" || $v =~ /\A--in-place=/) { $exempt = 1 }
            elsif ($v =~ /\A--/) { }
            elsif ($v eq "-e" || $v eq "-f") { $explicit = 1 }
            elsif ($v =~ /i/) { $exempt = 1 }
          } elsif ($cmdbase eq "awk") {
            $explicit = 1 if $v eq "-f";
          }
        } else {
          push @cand, $v;
        }
        $jj++;
      }
      if (!$exempt) {
        my $start_cand = $explicit ? 0 : 1;
        for my $ci (0 .. $#cand) {
          next if $ci < $start_cand;
          deny() if is_target(basename($cand[$ci]));
        }
      }
    } elsif ($PRINTERS{$cmdbase}) {
      # simple printer: every non-redirect-destination argument is judged, no
      # flag/position exemption (S2a behavior, unchanged).
      my $jj = $idx + 1;
      while ($jj < $ntok) {
        my $tok = $T[$jj];
        if (is_redir_out($tok)) { $jj += 2; next }
        if ($tok eq "<") { $jj++; next }
        deny() if is_target(basename(strip_quotes($tok)));
        $jj++;
      }
    }
  }
}

my $tool = defined $ARGV[0] ? $ARGV[0] : "";
my $in;
{ local $/; $in = <STDIN>; }
$in = "" unless defined $in;

if ($tool eq "Read") {
  deny() if is_target(basename($in));
  exit 0;
}
if ($tool eq "Bash") {
  my ($outer, @subs) = extract_substitutions(strip_heredocs($in));
  @SUBST = @subs;
  judge_command($outer);
  # Index-based, not `for … in @SUBST`: eval / bash -c handling inside
  # judge_command can itself append to @SUBST while a queued segment is being
  # judged (an eval string that is itself `eval "…"`, or a `$(...)` nested
  # inside a queued `bash -c` string). Re-reading the length every iteration
  # picks up newly queued entries; the queue is finite because each level of
  # nesting must be spelled out somewhere in the ORIGINAL finite command
  # string, so this always terminates.
  my $qi = 0;
  while ($qi < @SUBST) { judge_command($SUBST[$qi]); $qi++ }
  exit 0;
}
exit 0;
'

# ── run the judgment ──────────────────────────────────────────────────────────
# `command -v` is a builtin (no fork). /usr/bin/perl is the fallback because a
# hook can run under a stripped PATH (this hook's own test isolates PATH to
# `<jq dir>:/bin` to prove `tr` is not needed) while Apple ships perl there on
# every macOS and every mainstream Linux puts it there too; neither found →
# fail open, silent. The subject travels on stdin (never argv: Linux caps one
# argv string at 128KB, and a heredoc-carrying Bash command can exceed that)
# via the printf builtin, so no temp file is involved. Only the exact word
# `deny` denies — a perl crash, a warning, a missing interpreter (`command
# not found` on stderr, discarded) or an empty answer are all an allow.
PERL="$(command -v perl 2>/dev/null)"
if [ -z "$PERL" ]; then
  if [ -x /usr/bin/perl ]; then PERL=/usr/bin/perl; else exit 0; fi
fi
VERDICT="$(printf '%s' "$SUBJECT" | "$PERL" -C0 -e "$PRDT_JUDGE" -- "$TOOL_NAME" 2>/dev/null)"
[ "$VERDICT" = "deny" ] && deny_and_exit

exit 0
