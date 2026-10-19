#!/usr/bin/env bash
# prdt-url-scheme.sh install|uninstall — T-1191: the `prdt://` URL scheme that
# opens a viewer env card's file in the macOS default text editor.
#
# TextEdit registers no URL scheme, so prdt registers its own: a tiny
# AppleScript applet ($PRDT_HOME/apps/prdt-open.app, built by `osacompile` —
# no compiler, no signed app download) whose only handler passes the URL to
# $PRDT_HOME/bin/prdt_open_url.py, which refuses anything but an env file in a
# prdt project's code folder (threat model: that file's docstring).
#
# LaunchServices is machine-wide state: the applet is registered (`lsregister`)
# ONLY when PRDT_HOME is the login user's own ~/.prdt (passwd home, not $HOME) —
# a sandboxed install (tests, a relocated mirror, a GUI booted with HOME=sandbox)
# builds the applet and never registers it. Non-macOS: nothing to do.
set -euo pipefail
say() { printf '%s\n' "$*"; }
CMD="${1:-}"
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
APP="$PRDT_HOME/apps/prdt-open.app"
case "$CMD" in install|uninstall) ;; *) say "usage: prdt-url-scheme.sh install|uninstall" >&2; exit 2 ;; esac
if [ "$(uname -s)" != Darwin ]; then
  say "url scheme: skipped (not macOS)"
  exit 0
fi
LSREGISTER="$(command -v lsregister 2>/dev/null || echo /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister)"
OWN_PRDT="$(python3 -c 'import os,pwd; print(os.path.realpath(os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".prdt")))')"
HERE_PRDT="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$PRDT_HOME")"
REGISTER=false
[ "$HERE_PRDT" = "$OWN_PRDT" ] && REGISTER=true

if [ "$CMD" = uninstall ]; then
  if [ -d "$APP" ]; then
    [ "$REGISTER" = true ] && "$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
    rm -rf "$APP"
  fi
  rmdir "$PRDT_HOME/apps" 2>/dev/null || true
  say "url scheme: prdt:// handler removed"
  exit 0
fi

HANDLER="$PRDT_HOME/bin/prdt_open_url.py"
[ -f "$HANDLER" ] || { say "url scheme: NOT installed — $HANDLER missing" >&2; exit 1; }
PY="$(command -v python3)"
# AppleScript string literal: escape backslash and double quote.
as_str() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
mkdir -p "$PRDT_HOME/apps"
WORK="$(mktemp -d "$PRDT_HOME/apps/.build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
cat > "$WORK/open.applescript" <<EOF
on open location theURL
	do shell script quoted form of "$(as_str "$PY")" & " " & quoted form of "$(as_str "$HANDLER")" & " " & quoted form of theURL
end open location
on run
end run
EOF
osacompile -o "$WORK/prdt-open.app" "$WORK/open.applescript"
PLIST="$WORK/prdt-open.app/Contents/Info.plist"
PB=/usr/libexec/PlistBuddy
"$PB" -c "Set :CFBundleIdentifier dev.prdt.open" "$PLIST" 2>/dev/null || "$PB" -c "Add :CFBundleIdentifier string dev.prdt.open" "$PLIST"
"$PB" -c "Delete :CFBundleURLTypes" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :CFBundleURLTypes array" "$PLIST"
"$PB" -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
"$PB" -c "Add :CFBundleURLTypes:0:CFBundleURLName string prdt env file" "$PLIST"
"$PB" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
"$PB" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string prdt" "$PLIST"
"$PB" -c "Delete :LSUIElement" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :LSUIElement bool true" "$PLIST"
# Info.plist changed after osacompile sealed the bundle — re-seal ad hoc so it launches.
codesign --force --sign - "$WORK/prdt-open.app" >/dev/null 2>&1
if [ -d "$APP" ]; then
  [ "$REGISTER" = true ] && "$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
  rm -rf "$APP"
fi
mv "$WORK/prdt-open.app" "$APP"
if [ "$REGISTER" = true ]; then
  "$LSREGISTER" -f "$APP"
  say "url scheme: prdt:// registered ($APP)"
else
  say "url scheme: applet built, NOT registered (PRDT_HOME=$PRDT_HOME is not the login user's ~/.prdt)"
fi
