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
#   - the Claude account: `.oauthAccount.emailAddress` / `.fullName` of
#     `$CLAUDE_CONFIG_DIR/.claude.json`, else `$HOME/.claude.json`, parsed by
#     jq (a real JSON parser — nesting cannot hide a key). A file that exists
#     but does not parse is skipped silently (git identity still applies);
#   - git: `git config --get-regexp ^user.(email|name)$`, effective for the
#     event's `cwd` (falls back to $HOME when cwd is gone).
#   A name counts only when it has at least two words and 5+ characters — a
#   single word ("Shawn", "fixture") would flag ordinary text. Emails match
#   case-insensitively, also with `@` spelled `%40`.
#
# THE RULE (deny ⇔ identity AND an outbound shape, in the SAME unit):
#   WebFetch / WebSearch   identity in `url` / `query`, raw or URL-decoded
#                          (`%XX`, `+` as space) → deny. The tool IS outbound.
#   Write / Edit /         the NEW text holds the identity AND a request marker
#   MultiEdit /            → deny, unless the target is a prose doc (.md
#   NotebookEdit           .markdown .mdx .txt .rst .adoc .asciidoc .org): in
#                          prose a `curl …` install snippet is documentation,
#                          so markers count only in code / script files (any
#                          other extension, or none).
#   Bash                   the unit is one PIPELINE (members joined by `|`);
#                          `;` `&&` `||` `&` and newlines start a new unit.
#                          deny ⇔ some member is outbound AND the identity is in
#                          the unit: in a member's text, in a file the unit
#                          runs / attaches / pipes, or in a variable assigned
#                          earlier in the same call from an identity value.
#     outbound member  a network program — curl wget nc ncat netcat telnet
#                      socat http/https (httpie) xh; `gh api`; `gh issue|pr|
#                      release|gist` with a body/title/field flag; `git` that is
#                      NOT a local subcommand, or carries `-c http.*` or a URL —
#                      or a request marker in its text (User-Agent, urlopen,
#                      urllib, requests., httpx, aiohttp, http.client, fetch(,
#                      axios, XMLHttpRequest, Invoke-WebRequest/RestMethod,
#                      curl/wget inside a `-c` string), or a script it runs that
#                      holds a marker or an http(s) URL. A bare URL in an
#                      ordinary command (`echo … https://…`, `grep https://`) is
#                      NOT outbound: echo/grep send nothing.
#                      A local writer (cat/echo/printf/tee) redirecting into a
#                      prose doc is never outbound — same extension rule as
#                      Write.
#     files followed   interpreter operands (python*/node/bun/deno/tsx/ts-node/
#                      ruby/perl/php/bash/sh/zsh/source/./osascript), a program
#                      word that is a path (`./run.sh`); for a network program
#                      its attached files — `@f` / `-d@f` / `--data=@f` /
#                      `-F k=@f` / `-T f` / `--upload-file` / `-K` / `--config`
#                      / `--post-file` / `--body-file` / `--input` / `< f`;
#                      and, when a unit is outbound, the file operands of every
#                      other member (`cat f | curl -d @- …`). Files inside a
#                      `$(…)` (`$(cat f)`) count too. Paths resolve against the
#                      event cwd, following a `cd DIR`.
#     identity refs    `user.email`, `user.name`, `emailAddress`,
#                      `oauthAccount` count as identity ONLY inside a command
#                      substitution (`$(git config user.email)`) — the bare word
#                      in a grep/jq argument is just text.
#     not flagged      a LOCAL git subcommand (commit log config add status diff
#                      show tag branch … — commit `--author`, Co-Authored-By in
#                      a `-F -` heredoc); a unit with no outbound member.
#
# RESIDUAL BYPASS SHAPES (accepted, not closed — this is a seatbelt against the
# helpful-worker mistake, not a sandbox against an adversary):
#   - request code with no marker word written by Write/Edit (e.g. a raw socket
#     or an unusual HTTP library) — still caught when run directly, since a run
#     script with an http(s) URL is outbound.
#   - any encoding of the address (base64, hex, string concatenation `"a"+"@b"`,
#     ANSI-C `$'\x40'`).
#   - an env var or file set in one Bash call and used in a LATER call (inside
#     ONE call, variable hand-off and piped files are followed).
#   - file indirection the rule does not follow: a module the script imports, a
#     config file it opens, `python -m`, `npx tsx`, `make`, a test runner.
#   - MCP / connector tools (Atlassian, Figma, Drive …) — not in the matcher:
#     they already act as the user's authenticated account, so the service has
#     the identity; judging their bodies would flag legitimate assign/mention.
#   - ssh/scp/rsync arguments, and an identity this machine does not record.
#
# TRUST: nothing from the payload or the identity is ever echoed back. The deny
# text is assembled from FIXED words only (which field: command / file /
# file content / URL or query; which identity: email / name). The perl stage
# prints one of those fixed codes or nothing; anything else is an allow.
#
# FAIL-OPEN: jq or perl missing, malformed JSON, no identity knowable, or any
# perl failure → silent exit 0, same direction as every other prdt hook.
#
# PRE-FILTER (fork-0 on a miss): a `case` on the raw payload — only an event
# that carries an `@`/`%40`, a request marker, a network program, an
# interpreter-ish word, a path run (`./`), or is a WebFetch/WebSearch call
# forks jq + perl. Its words must not overlap the payload's own keys or tool
# names (`*bash*` would hit every Bash event, `*agent*` every worker event).

set +e
LC_ALL=C

IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

shopt -s nocasematch
case "$EV" in
  *WebFetch*|*WebSearch*|*@*|*%40*|*user-agent*|*curl*|*wget*|*http*|*url*|*request*|*fetch*|*axios*|*python*|*node*|*bun*|*deno*|*tsx*|*ruby*|*perl*|*php*|*sh\ *|*gh\ *|*nc\ *|*ncat*|*netcat*|*telnet*|*socat*|*xh\ *|*source*|*./*|*osascript*|*user.email*|*user.name*|*emailaddress*|*oauthaccount*) _hit=1 ;;
  *) _hit=0 ;;
esac
shopt -u nocasematch
[ "$_hit" -eq 1 ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0
PERL="$(command -v perl 2>/dev/null)"
[ -n "$PERL" ] || { [ -x /usr/bin/perl ] && PERL=/usr/bin/perl; }
[ -n "$PERL" ] || exit 0

# tool_name \x1e cwd \x1e target path (write tools) \x1e the outbound/new text.
FIELDS="$(printf '%s' "$EV" | jq -j '
  def s: if type=="string" then . else "" end;
  (.tool_name|s) as $t | (.tool_input // {}) as $i |
  if ($i|type) != "object" then empty else
  $t + "\u001e" + (.cwd|s) + "\u001e" + (($i.file_path // $i.notebook_path // "")|s) + "\u001e" + (
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
_REST="${_REST#*$'\x1e'}"
TARGET_PATH="${_REST%%$'\x1e'*}"
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

my ($tool, $cwd, $target) = @ARGV;
$cwd = "" unless defined $cwd;
$target = "" unless defined $target;
local $/; my $subject = <STDIN>; $subject = "" unless defined $subject;

# ── identity, read fresh ────────────────────────────────────────────────────
my (@emails, @names);
sub add_email { my $e = lc(shift // ""); $e =~ s/\A\s+|\s+\z//g; push @emails, $e if $e =~ /\A[^\s\@]+\@[^\s\@]+\.[^\s\@]+\z/ && length($e) >= 6 }
sub add_name  { my $n = shift // ""; $n =~ s/\A\s+|\s+\z//g; push @names, $n if $n =~ /\S\s+\S/ && length($n) >= 5 }

my $cfgdir = $ENV{CLAUDE_CONFIG_DIR} // "";
my $cj = ($cfgdir ne "" && -f "$cfgdir/.claude.json") ? "$cfgdir/.claude.json" : (($ENV{HOME} // "") . "/.claude.json");
if (-f $cj) {
  # jq parses the whole document; a parse failure prints nothing (stderr is
  # /dev/null) and the git identity below still applies.
  if (open(my $j, "-|", "jq", "-r", "(.oauthAccount // {}) | if type == \"object\" then ((.emailAddress // \"\") | tostring), ((.fullName // \"\") | tostring) else empty end", $cj)) {
    my @v = split /\n/, (<$j> // "");
    close $j;
    add_email($v[0]) if defined $v[0];
    add_name($v[1])  if defined $v[1];
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
  my $t = shift;
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
  return "";
}

my $MARK = qr/user-agent|\bcurl\b|\bwget\b|urlopen|urllib|\brequests\.|\bhttpx\b|aiohttp|http\.client|\bfetch\s*\(|\baxios\b|XMLHttpRequest|Invoke-(?:WebRequest|RestMethod)/i;
my $URL  = qr{https?://}i;
my $REF  = qr/\buser\.(?:email|name)\b|emailAddress|oauthAccount/i;
my $PROSE = qr/\.(?:md|markdown|mdx|txt|rst|adoc|asciidoc|org)\z/i;

sub verdict { print "$_[0] $_[1]"; exit 0 }

if ($tool eq "WebFetch" || $tool eq "WebSearch") {
  my $w = ident_in($subject);
  if (!$w) {
    my $d = $subject;
    for (1 .. 3) { (my $n = $d) =~ s/\+/ /g; $n =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge; last if $n eq $d; $d = $n }
    $w = ident_in($d);
  }
  verdict("url", $w) if $w;
  exit 0;
}

if ($tool ne "Bash") {
  exit 0 if $target =~ $PROSE;
  my $w = ident_in($subject);
  verdict("file", $w) if $w && $subject =~ $MARK;
  exit 0;
}

# ── Bash: members (simple commands) with a pipe-to-next flag ────────────────
# Quote-aware split on | ; & && || and newline. A heredoc body is glued onto
# the member that OPENED it, so `git commit -F - <<EOF … EOF && curl …` keeps
# the body with git. `&` inside a redirect (`2>&1`, `&>`) is not a separator.
my $cmd = $subject;
$cmd =~ s/\\\n//g;
my @mem; my $cur = ""; my $q = ""; my @tags;
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
      push @tags, [$1, $dash, scalar(@mem)] if $rest =~ /\A\s*["\x27]?([A-Za-z0-9_.-]+)/;
      $cur .= "<<"; $i++; next;
    }
    if ($c eq "|") {
      if (substr($line, $i + 1, 1) eq "|") { push @mem, { t => $cur, pipe => 0 }; $i++ }
      else { push @mem, { t => $cur, pipe => 1 }; $i++ if substr($line, $i + 1, 1) eq "&" }
      $cur = ""; next;
    }
    if ($c eq "&" && (($i > 0 && substr($line, $i - 1, 1) =~ /[<>]/) || substr($line, $i + 1, 1) eq ">")) { $cur .= $c; next }
    if ($c eq ";" || $c eq "&") {
      push @mem, { t => $cur, pipe => 0 }; $cur = "";
      $i++ if substr($line, $i + 1, 1) eq $c;
      next;
    }
    $cur .= $c;
  }
  if ($q ne "") { $cur .= "\n"; next }
  if ($cur =~ /\S/) { push @mem, { t => $cur, pipe => 0 } }
  $cur = "";
  while (@tags) {
    my ($tag, $dash, $idx) = @{ shift @tags };
    my $body = "";
    while (++$li < @lines) {
      my $b = $lines[$li];
      my $cmp = $b;
      $cmp =~ s/\A\t+// if $dash;
      last if $cmp eq $tag;
      $body .= "\n" . $b;
    }
    $idx = $#mem if $idx > $#mem;
    $mem[$idx]{t} .= $body if $idx >= 0;
  }
}
push @mem, { t => $cur, pipe => 0 } if $cur =~ /\S/;

sub unq { my $t = shift; $t =~ s/\A["\x27]|["\x27]\z//g; return $t }
sub words { my $s = shift; my @w; while ($s =~ /("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27|[^\s"\x27]+)+/g) { push @w, $& } return @w }
sub substs {
  my $s = shift; my @o;
  while ($s =~ /\$\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g) { push @o, $1 }
  while ($s =~ /`([^`]*)`/g) { push @o, $1 }
  return @o;
}

my %INTERP = map { $_ => 1 } qw(node bun deno tsx ts-node ruby perl php bash sh zsh source . osascript);
my %WRAP   = map { $_ => 1 } qw(sudo env command time nice nohup exec timeout stdbuf);
my %DECL   = map { $_ => 1 } qw(export declare local readonly typeset);
my %NET    = map { $_ => 1 } qw(curl wget nc ncat netcat telnet socat http https xh);
my %WRITER = map { $_ => 1 } qw(cat echo printf tee);
my %LOCAL_GIT = map { $_ => 1 } qw(commit log config add status diff show tag branch rev-parse checkout switch reset restore stash merge rebase cherry-pick revert blame shortlog init mv rm grep worktree notes describe ls-files ls-tree cat-file for-each-ref reflog show-ref symbolic-ref update-ref format-patch apply am bisect clean gc mailmap var check-ignore);
my %FILE_FLAG = map { $_ => 1 } qw(-T --upload-file -K --config --post-file --body-file --input);
my $dir = ($cwd ne "" && -d $cwd) ? $cwd : "";
my %taint;

sub resolve { my $p = shift; return $p if $p =~ m{\A/}; return "" if $dir eq ""; return "$dir/$p" }
sub slurp {
  my $p = resolve(shift);
  return "" unless $p ne "" && -f $p && -s $p <= 1024 * 1024;
  open(my $fh, "<", $p) or return ""; binmode $fh; my $x = <$fh>; close $fh;
  return defined $x ? $x : "";
}
sub is_file { my $p = resolve(shift); return ($p ne "" && -f $p) ? 1 : 0 }

# identity carried by a piece of command text: literal, a ref inside a
# command substitution, a tainted variable, or a file read inside `$(…)`.
sub text_ident {
  my $t = shift;
  my $w = ident_in($t);
  return $w if $w;
  for my $s (substs($t)) {
    return "email" if $s =~ $REF;
    for my $a (map { unq($_) } words($s)) {
      next if $a =~ /\A-/;
      my $a2 = $a; $a2 =~ s/\A<//;
      if ($a2 ne "" && is_file($a2)) { my $x = ident_in(slurp($a2)); return $x if $x }
    }
  }
  for my $v (keys %taint) { return $taint{$v} if $t =~ /\$\{?\Q$v\E(?![A-Za-z0-9_])/ }
  return "";
}

# the raw value text of `NAME=…` in a member: a `$(…)` (balanced), a quoted
# string, or a bare word — the word splitter alone cuts `$(a b)` apart.
sub assign_value {
  my ($seg, $name) = @_;
  return undef unless $seg =~ /(?:\A|[\s;])\Q$name\E=/g;
  my $p = pos($seg); my $rest = substr($seg, $p);
  if ($rest =~ /\A(\$\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))/) { return $1 }
  if ($rest =~ /\A("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27)/) { return $1 }
  return $rest =~ /\A(\S*)/ ? $1 : "";
}

# group members into pipeline units
my @units; my @u;
for my $m (@mem) { push @u, $m; if (!$m->{pipe}) { push @units, [@u]; @u = () } }
push @units, [@u] if @u;

for my $unit (@units) {
  my ($out, $ident, $where) = (0, "", "command");
  my @pipe_files;
  for my $m (@$unit) {
    my $seg = $m->{t};
    my @w = map { unq($_) } words($seg);
    my $k = 0; my @assign;
    while ($k < @w) {
      if ($w[$k] =~ /\A([A-Za-z_][A-Za-z0-9_]*)=(.*)\z/s) { push @assign, [$1, $2]; $k++; next }
      if ($DECL{$w[$k]}) { $k++; next }
      if ($w[$k] =~ /\A(?:then|do|else|if|while|until|!|\{|\(|\))\z/) { $k++; next }
      if ($WRAP{$w[$k]}) {
        my $wr = $w[$k]; $k++;
        $k++ while $k < @w && ($w[$k] =~ /\A-/ || $w[$k] =~ /\A[A-Za-z_][A-Za-z0-9_]*=/);
        $k++ if $wr eq "timeout" && $k < @w;
        next;
      }
      last;
    }
    # variable taint (assignment values are judged with the taint so far)
    for my $a (@assign) { my $x = text_ident(assign_value($seg, $a->[0]) // $a->[1]); $taint{$a->[0]} = $x if $x }
    my $prog = $k < @w ? $w[$k] : "";
    (my $base = $prog) =~ s{\A.*/}{};
    my @args = @w[$k + 1 .. $#w];

    if ($base eq "cd" && @args) {
      my $d = $args[0];
      my $r = $d =~ m{\A/} ? $d : ($dir ne "" ? "$dir/$d" : "");
      $dir = $r if $r ne "" && -d $r;
      next;
    }

    my $m_out = 0;
    if ($base eq "git") {
      my ($j, $net, $sub) = (0, 0, "");
      while ($j < @args) {
        my $a = $args[$j];
        if ($a eq "-C") { $j += 2; next }
        if ($a eq "-c") { $net = 1 if ($args[$j + 1] // "") =~ /\Ahttp\.|extraheader/i; $j += 2; next }
        if ($a =~ /\A-/) { $j++; next }
        $sub = $a; last;
      }
      my $has_url = grep { m{://} || /\A[^\s\@]+\@[^\s:]+:/ } @args;
      next if $LOCAL_GIT{$sub} && !$net && !$has_url;
      $m_out = 1 if $net || $has_url || $sub =~ /\A(?:push|fetch|pull|clone|ls-remote|remote|submodule|send-email|request-pull|archive)\z/;
    } elsif ($base eq "gh") {
      my $sub = $args[0] // "";
      if ($sub eq "api") { $m_out = 1 }
      elsif ($sub =~ /\A(?:issue|pr|release|gist|discussion)\z/) {
        $m_out = 1 if grep { /\A(?:--body|-b|--body-file|-F|--title|-t|--field|-f|--raw-field|--notes|-n)(?:=|\z)/ } @args;
      }
    } elsif ($NET{$base}) {
      $m_out = 1;
    }

    # text markers — except a local writer redirecting into a prose doc
    my $prose_write = 0;
    if ($WRITER{$base}) {
      my @tg = ($seg =~ />>?\s*["\x27]?([^\s"\x27;|&<>]+)/g);
      push @tg, grep { !/\A-/ } @args if $base eq "tee";
      $prose_write = 1 if grep { $_ =~ $PROSE } @tg;
    }
    $m_out = 1 if !$prose_write && $seg =~ $MARK;

    my $id = text_ident($seg);
    if ($id && !$ident) { $ident = $id; $where = "command" }

    # files: run (scripts), attached (network program), operands (pipe)
    my @run;
    if ($INTERP{$base} || $base =~ /\Apython[0-9.]*\z/) { push @run, grep { !/\A-/ } @args }
    elsif ($prog =~ m{/} && $prog !~ /[\$`]/) { push @run, $prog }
    for my $f (@run) {
      my $x = slurp($f); next if $x eq "";
      $m_out = 1 if $x =~ $MARK || $x =~ $URL;
      my $fi = ident_in($x);
      if ($fi && !$ident) { $ident = $fi; $where = "script" }
    }
    if ($m_out || $base eq "curl" || $base eq "wget" || $base eq "gh") {
      for (my $j = 0; $j < @args; $j++) {
        my $a = $args[$j];
        if    ($a =~ /\A-[A-Za-z]*\@(.+)\z/)   { push @pipe_files, $1 }
        elsif ($a =~ /=\@([^;,]+)/)            { push @pipe_files, $1 }
        elsif ($a =~ /\A\@(.+)\z/)             { push @pipe_files, $1 }
        elsif ($FILE_FLAG{$a})                 { push @pipe_files, $args[$j + 1] if defined $args[$j + 1] }
        elsif ($a =~ /\A--(?:upload-file|config|post-file|body-file|input)=(.+)\z/) { push @pipe_files, $1 }
      }
    }
    # operand files and `<` targets of every member (used when the unit is outbound)
    for (my $j = 0; $j < @args; $j++) {
      my $a = $args[$j];
      if ($a eq "<") { push @pipe_files, $args[$j + 1] if defined $args[$j + 1]; next }
      if ($a =~ /\A<(.+)\z/) { push @pipe_files, $1; next }
      push @pipe_files, $a if !$NET{$base} && $a !~ /\A-/ && $a ne "";
    }
    $out ||= $m_out;
  }
  next unless $out;
  if (!$ident) {
    for my $f (@pipe_files) {
      next if $f eq "-" || !is_file($f);
      my $fi = ident_in(slurp($f));
      if ($fi) { $ident = $fi; $where = "script"; last }
    }
  }
  verdict($where, $ident) if $ident;
}
exit 0;
PERL_EOF

OUT="$(printf '%s' "$SUBJECT" | "$PERL" -C0 -e "$PRDT_JUDGE" "$TOOL_NAME" "$EV_CWD" "$TARGET_PATH" 2>/dev/null)"
[ -n "$OUT" ] || exit 0

case "${OUT%% *}" in
  command) WHERE='this command' ;;
  script)  WHERE='a script or data file this command runs or sends' ;;
  file)    WHERE='this file content (request code)' ;;
  url)     WHERE='this URL or query' ;;
  *) exit 0 ;;
esac
case "${OUT#* }" in
  email) WHAT='email address' ;;
  name)  WHAT='full name' ;;
  *) exit 0 ;;
esac

MSG="[prdt identity guard] Denied: ${WHERE} would send the user's ${WHAT} (as recorded in the Claude account or git config) in an outbound request (T-976). The value is not repeated here. Use a project/product User-Agent with no personal contact, e.g. <project>/<version> (+<project repo URL>). An API that requires contact info: return needs_info to the PO, never fill in the user's identity. Local git commands and requests without the identity are never denied."

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$MSG"
exit 0
