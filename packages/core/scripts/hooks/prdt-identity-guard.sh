#!/usr/bin/env bash
# prdt — user-identity guard (T-976). PreToolUse, matcher
# `Bash|WebFetch|WebSearch|Write|Edit|MultiEdit|NotebookEdit`
# (hook-manifest.json); exercised directly by
# test/scripts/identity-guard-hook.test.ts spawning it.
#
# WHY: naro-proto workers put the user's email into outbound User-Agent
# headers twice (naro T-289, 2026-10-01: 154 research requests; T-342,
# 2026-10-06: 14 Wikimedia Commons lookups). The harness hands every agent the
# user's email, APIs ask for a contact in the User-Agent, and a worker fills it
# in to be helpful. A dispatch naming the project User-Agent did not stop it.
# This hook denies the call that would send the identity, or the script that
# would, before it runs.
#
# HOW THE GUARD KNOWS THE IDENTITY — read fresh on every judged call, never
# copied anywhere (no cache, no new file):
#   - the Claude account: `oauthAccount.emailAddress` / `.fullName` in
#     `$CLAUDE_CONFIG_DIR/.claude.json`, else `$HOME/.claude.json` (the file the
#     harness already keeps; the same address it injects into agent context);
#   - git: `git config --get user.email` / `user.name`, effective for the
#     event's `cwd` (falls back to $HOME when cwd is gone).
#   A name counts only when it has at least two words and 5+ characters — a
#   single word ("Shawn", "fixture") would flag ordinary text. Emails match
#   case-insensitively, also with `@` spelled `%40`.
#
# THE RULE (deny ⇔ identity AND an outbound shape):
#   WebFetch / WebSearch   identity anywhere in `url` / `query` → deny (the
#                          tool IS the outbound request).
#   Write / Edit /         the NEW text (content / new_string / every
#   MultiEdit /            edits[].new_string / new_source) holds the identity
#   NotebookEdit           AND a request marker → deny. The script is caught as
#                          it is written, so `npm run`/`pnpm test` indirection
#                          later never matters. Bare URLs are NOT a file marker
#                          (a README with a maintainer line and a link passes).
#   Bash                   identity in the command — outside any simple
#                          command whose program is `git` — or in a script file
#                          the command runs, AND a request marker (bare
#                          http(s):// URLs included) in the command or that
#                          file → deny. "Runs" = the operand files of an
#                          interpreter (python*/node/bun/deno/tsx/ts-node/ruby/
#                          perl/php/bash/sh/zsh/source/./osascript), a program
#                          word that is itself a path (`./run.sh`), and curl's
#                          `@file` arguments; relative paths resolve against
#                          the event cwd, following a leading `cd DIR`.
#                          Inside the command a run-time lookup of the identity
#                          (`git config user.email`, `user.name`,
#                          `emailAddress`, `oauthAccount`) counts as identity.
#   Not flagged, by rule:  a `git …` simple command (commit `--author`,
#                          `Co-Authored-By` in a `-F -` heredoc, `config
#                          user.email`, `log --author`); any command with no
#                          request marker (echo/grep/wc of the address, a local
#                          script that only prints it). Request markers:
#                          User-Agent, curl, wget, urlopen, urllib, requests.,
#                          httpx, aiohttp, http.client, fetch(, axios,
#                          XMLHttpRequest, Invoke-WebRequest/RestMethod.
#
# RESIDUAL BYPASS SHAPES (accepted, not closed — this is a seatbelt against the
# helpful-worker mistake, not a sandbox against an adversary):
#   - env var / file set in one Bash call and used in a LATER call (`export
#     UA=…` then `curl -A "$UA"`); inside ONE call it is caught.
#   - any encoding of the address (base64, hex, string concatenation `"a"+"@b"`,
#     ANSI-C `$'\x40'`).
#   - file indirection the rule does not follow: a module the script imports, a
#     config/JSON file it opens, `python -m pkg`, `npx tsx x.ts`, `make`, a
#     test runner; a script WRITTEN before this hook existed and run through one
#     of those.
#   - MCP / connector tools (Atlassian, Figma, Drive …) — not in the matcher:
#     they already act as the user's authenticated account, so the service has
#     the identity; judging their bodies would flag legitimate assign/mention.
#   - an identity this machine does not record (another address of the user's).
#
# TRUST: nothing from the payload or the identity is ever echoed back. The deny
# text is assembled from FIXED words only (which field: command / script file /
# file content / URL or query; which identity: email / name). The perl stage
# prints one of those fixed codes or nothing; anything else is an allow.
#
# FAIL-OPEN: jq or perl missing, malformed JSON, no identity knowable, or any
# perl failure → silent exit 0, same direction as every other prdt hook.
#
# PRE-FILTER (fork-0 on a miss): a `case` on the raw payload — only an event
# that carries an `@`/`%40`, a request marker, an interpreter-ish word, a path
# run (`./`), or is a WebFetch/WebSearch call forks jq + perl. Name-only
# matches need a marker (or WebFetch/WebSearch) to deny, so `@` alone is not
# the whole filter.

set +e
LC_ALL=C

IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

shopt -s nocasematch
case "$EV" in
  *WebFetch*|*WebSearch*|*@*|*%40*|*user-agent*|*curl*|*wget*|*http*|*url*|*request*|*fetch*|*axios*|*python*|*node*|*bun*|*deno*|*tsx*|*ts-node*|*ruby*|*perl*|*php*|*sh\ *|*source*|*./*|*osascript*|*user.email*|*user.name*|*emailaddress*|*oauthaccount*) _hit=1 ;;
  *) _hit=0 ;;
esac
shopt -u nocasematch
[ "$_hit" -eq 1 ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0
PERL="$(command -v perl 2>/dev/null)"
[ -n "$PERL" ] || { [ -x /usr/bin/perl ] && PERL=/usr/bin/perl; }
[ -n "$PERL" ] || exit 0

# tool_name \x1e cwd \x1e the outbound/new text for that tool.
FIELDS="$(printf '%s' "$EV" | jq -j '
  def s: if type=="string" then . else "" end;
  (.tool_name|s) as $t | (.tool_input // {}) as $i |
  if ($i|type) != "object" then empty else
  $t + "\u001e" + (.cwd|s) + "\u001e" + (
    if   $t=="Bash"         then ($i.command|s)
    elif $t=="WebFetch"     then ($i.url|s)
    elif $t=="WebSearch"    then ($i.query|s)
    elif $t=="Write"        then ($i.content|s)
    elif $t=="Edit"         then ($i.new_string|s)
    elif $t=="MultiEdit"    then ([($i.edits // [])[]? | (.new_string|s)] | join("\n"))
    elif $t=="NotebookEdit" then ($i.new_source|s)
    else "" end)
  end' 2>/dev/null)"
[ -n "$FIELDS" ] || exit 0

TOOL_NAME="${FIELDS%%$'\x1e'*}"
_REST="${FIELDS#*$'\x1e'}"
EV_CWD="${_REST%%$'\x1e'*}"
SUBJECT="${_REST#*$'\x1e'}"

case "$TOOL_NAME" in
  Bash|WebFetch|WebSearch|Write|Edit|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac
[ -n "$SUBJECT" ] || exit 0

read -r -d '' PRDT_JUDGE <<'PERL_EOF'
use strict;
binmode STDIN; binmode STDOUT;
open(STDERR, ">", "/dev/null");

my ($tool, $cwd) = @ARGV;
$cwd = "" unless defined $cwd;
local $/; my $subject = <STDIN>; $subject = "" unless defined $subject;

# ── identity, read fresh ────────────────────────────────────────────────────
my (@emails, @names);
sub add_email { my $e = lc(shift // ""); $e =~ s/\A\s+|\s+\z//g; push @emails, $e if $e =~ /\A[^\s\@]+\@[^\s\@]+\.[^\s\@]+\z/ && length($e) >= 6 }
sub add_name  { my $n = shift // ""; $n =~ s/\A\s+|\s+\z//g; push @names, $n if $n =~ /\S\s+\S/ && length($n) >= 5 }

my $cfgdir = $ENV{CLAUDE_CONFIG_DIR} // "";
my $cj = ($cfgdir ne "" && -f "$cfgdir/.claude.json") ? "$cfgdir/.claude.json" : (($ENV{HOME} // "") . "/.claude.json");
if (-f $cj && -s $cj < 64 * 1024 * 1024 && open(my $fh, "<", $cj)) {
  binmode $fh; my $j = <$fh>; close $fh;
  if ($j =~ /"oauthAccount"\s*:\s*\{(.*?)\}/s) {
    my $o = $1;
    add_email($1) if $o =~ /"emailAddress"\s*:\s*"([^"\\]*)"/;
    add_name($1)  if $o =~ /"fullName"\s*:\s*"([^"\\]*)"/;
  }
}
my $gdir = ($cwd ne "" && -d $cwd) ? $cwd : ($ENV{HOME} // "/");
if (open(my $g, "-|", "git", "-C", $gdir, "config", "--get-regexp", "^user[.](email|name)\$")) {
  my $out = <$g>; close $g; $out = "" unless defined $out;
  for my $ln (split /\n/, $out) {
    if    ($ln =~ /\Auser\.email\s+(.*)\z/i) { add_email($1) }
    elsif ($ln =~ /\Auser\.name\s+(.*)\z/i)  { add_name($1) }
  }
}
exit 0 unless @emails || @names;

# which identity a text holds: "email", "name", or ""
sub ident_in {
  my ($t, $with_refs) = @_;
  my $l = lc $t;
  for my $e (@emails) {
    return "email" if index($l, $e) >= 0;
    (my $enc = $e) =~ s/\@/%40/;
    return "email" if index($l, $enc) >= 0;
  }
  for my $n (@names) {
    my $re = join("\\s+", map { quotemeta } split(/\s+/, $n));
    return "name" if $t =~ /(?<![A-Za-z0-9])$re(?![A-Za-z0-9])/i;
  }
  return "email" if $with_refs && $t =~ /\buser\.(?:email|name)\b|emailAddress|oauthAccount/i;
  return "";
}

my $MARK = qr/user-agent|\bcurl\b|\bwget\b|urlopen|urllib|\brequests\.|\bhttpx\b|aiohttp|http\.client|\bfetch\s*\(|\baxios\b|XMLHttpRequest|Invoke-(?:WebRequest|RestMethod)/i;
my $URL  = qr{https?://}i;

sub verdict { print "$_[0] $_[1]"; exit 0 }

if ($tool eq "WebFetch" || $tool eq "WebSearch") {
  my $w = ident_in($subject, 0);
  verdict("url", $w) if $w;
  exit 0;
}

if ($tool ne "Bash") {
  my $w = ident_in($subject, 0);
  verdict("file", $w) if $w && $subject =~ $MARK;
  exit 0;
}

# ── Bash ────────────────────────────────────────────────────────────────────
# Segments: quote-aware split on ; && || | & and newline; a heredoc body is
# glued onto the segment that opened it, so `git commit -F - <<EOF … EOF` stays
# one git segment and `cat > x.py <<EOF … EOF` one cat segment.
my $cmd = $subject;
$cmd =~ s/\\\n//g;
my @segs; my $cur = ""; my $q = ""; my @tags;
my @lines = split(/\n/, $cmd, -1);
for (my $li = 0; $li < @lines; $li++) {
  my $line = $lines[$li];
  my $n = length $line;
  for (my $i = 0; $i < $n; $i++) {
    my $c = substr($line, $i, 1);
    if ($q ne "") { $q = "" if $c eq $q; $cur .= $c; next }
    if ($c eq "\x27" || $c eq "\"") { $q = $c; $cur .= $c; next }
    if ($c eq "\\") { $cur .= substr($line, $i, 2); $i++; next }
    if ($c eq "<" && substr($line, $i, 2) eq "<<" && substr($line, $i, 3) ne "<<<") {
      my $rest = substr($line, $i + 2);
      my $dash = ($rest =~ s/\A-//) ? 1 : 0;
      if ($rest =~ /\A\s*["\x27]?([A-Za-z0-9_.-]+)/) { push @tags, [$1, $dash] }
      $cur .= "<<"; $i++; next;
    }
    if ($c eq ";" || $c eq "|" || $c eq "&") {
      push @segs, $cur; $cur = "";
      $i++ if substr($line, $i + 1, 1) eq $c;
      next;
    }
    $cur .= $c;
  }
  if ($q ne "") { $cur .= "\n"; next }
  while (@tags) {
    my ($tag, $dash) = @{ shift @tags };
    while (++$li < @lines) {
      my $b = $lines[$li];
      my $cmp = $b;
      $cmp =~ s/\A\t+// if $dash;
      last if $cmp eq $tag;
      $cur .= "\n" . $b;
    }
  }
  push @segs, $cur; $cur = "";
}
push @segs, $cur if $cur ne "";

sub unq { my $t = shift; $t =~ s/\A["\x27]|["\x27]\z//g; return $t }
sub words { my $s = shift; my @w; while ($s =~ /("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27|[^\s"\x27]+)+/g) { push @w, $& } return @w }

my %INTERP = map { $_ => 1 } qw(node bun deno tsx ts-node ruby perl php bash sh zsh source . osascript);
my %WRAP   = map { $_ => 1 } qw(sudo env command time nice nohup exec timeout stdbuf);
my $ident_text = "";
my $mark_text = $cmd;
my $file_ident = "";
my $dir = ($cwd ne "" && -d $cwd) ? $cwd : "";

sub resolve { my $p = shift; return $p if $p =~ m{\A/}; return "" if $dir eq ""; return "$dir/$p" }
sub slurp {
  my $p = resolve(shift);
  return "" unless $p ne "" && -f $p && -s $p <= 1024 * 1024;
  open(my $fh, "<", $p) or return ""; binmode $fh; my $x = <$fh>; close $fh;
  return defined $x ? $x : "";
}
sub take_file {
  my $x = slurp(shift);
  return if $x eq "";
  $mark_text .= "\n" . $x;
  my $w = ident_in($x, 0);
  $file_ident ||= $w;
}

for my $seg (@segs) {
  my @w = map { unq($_) } words($seg);
  my $k = 0;
  while ($k < @w) {
    if ($w[$k] =~ /\A[A-Za-z_][A-Za-z0-9_]*=/) { $k++; next }
    if ($w[$k] =~ /\A(?:then|do|else|if|while|until|!|\{|\(|\))\z/) { $k++; next }
    if ($WRAP{$w[$k]}) {
      my $wr = $w[$k]; $k++;
      $k++ while $k < @w && ($w[$k] =~ /\A-/ || $w[$k] =~ /\A[A-Za-z_][A-Za-z0-9_]*=/);
      $k++ if $wr eq "timeout" && $k < @w;
      next;
    }
    last;
  }
  my $prog = $k < @w ? $w[$k] : "";
  (my $base = $prog) =~ s{\A.*/}{};
  if ($base eq "git") { next }
  if ($base eq "cd" && $k + 1 < @w) {
    my $d = $w[$k + 1];
    my $r = $d =~ m{\A/} ? $d : ($dir ne "" ? "$dir/$d" : "");
    $dir = $r if $r ne "" && -d $r;
    next;
  }
  $ident_text .= "\n" . $seg;
  if ($INTERP{$base} || $base =~ /\Apython[0-9.]*\z/) {
    for my $a (@w[$k + 1 .. $#w]) { take_file($a) unless $a =~ /\A-/ }
  } elsif ($prog =~ m{/} && $prog !~ /[\$`]/) {
    take_file($prog);
  }
  if ($base eq "curl") {
    for my $a (@w[$k + 1 .. $#w]) { take_file($1) if $a =~ /\A\@(.+)\z/ }
  }
}

my $w = ident_in($ident_text, 1);
my $where = "command";
if (!$w && $file_ident) { $w = $file_ident; $where = "script" }
exit 0 unless $w;
verdict($where, $w) if $mark_text =~ $MARK || $mark_text =~ $URL;
exit 0;
PERL_EOF

OUT="$(printf '%s' "$SUBJECT" | "$PERL" -C0 -e "$PRDT_JUDGE" "$TOOL_NAME" "$EV_CWD" 2>/dev/null)"
[ -n "$OUT" ] || exit 0

case "${OUT%% *}" in
  command) WHERE='this command' ;;
  script)  WHERE='a script file this command runs' ;;
  file)    WHERE='this file content (request code)' ;;
  url)     WHERE='this URL or query' ;;
  *) exit 0 ;;
esac
case "${OUT#* }" in
  email) WHAT='email address' ;;
  name)  WHAT='full name' ;;
  *) exit 0 ;;
esac

MSG="[prdt identity guard] Denied: ${WHERE} would send the user's ${WHAT} (as recorded in the Claude account or git config) in an outbound request (T-976). The value is not repeated here. Use a project/product User-Agent with no personal contact, e.g. <project>/<version> (+<project repo URL>). An API that requires contact info: return needs_info to the PO, never fill in the user's identity. git commands and requests without the identity are never denied."

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$MSG"
exit 0
