# cua VM harness — live-verify operating notes

QA/PO operating manual for live-verifying a built `.dmg` inside the cua (lume) macOS VM.
Referenced by Deploy-phase live-verify tickets (T-PATCH-220 / 221 / 231). Working doc —
append lessons as the harness teaches them. Plain markdown, no frontmatter (like `fail-patterns.md`).

The VM is driven by the `cua-vm` MCP tools (`run_command`, `screenshot`, `left_click`,
`open_target`, `type_text`, …). The VM itself is a `lume` guest, `macOS` arm64, user `lume`.

## 0. Viewing the VM screen (human eyes / VNC)

The VM runs **headless** (`lume run cua --no-display`), so there is no window by default.
lume exposes a **VNC endpoint** per boot. To open it from the host:

```sh
lume ls                                   # read the `vnc` column, e.g. vnc://:mike-seven-sun-wolf@127.0.0.1:57747
open "vnc://:<password>@127.0.0.1:<port>" # macOS Screen Sharing.app opens vnc:// URLs
```

- Format: `vnc://:<password>@127.0.0.1:<port>` — empty username, password before `@`.
- **Port + password rotate every VM boot** — never hardcode; always re-read `lume ls`.
- This is how a human gets "VNC 눈확인" for timing-sensitive checks (e.g. T-221 label
  transitions) that cua screenshot capture keeps missing.
- The MCP agent can drive + screenshot without VNC; VNC is for the *human* to watch/interact
  (e.g. completing an OAuth login that needs the user's own credentials).

## 1. Install build == verification target (load-bearing)

Always verify the VM's installed app is byte-identical to the freshly built artifact —
otherwise you verify a stale build. Compare the asar hash, not just the version string
(version stays `0.5.0` across rebuilds):

```sh
# host
shasum -a 256 packages/gui/release/mac-arm64/productune.app/Contents/Resources/app.asar
# VM (must match)
shasum -a 256 /Applications/productune.app/Contents/Resources/app.asar
```

## 2. Getting the dmg into the VM (no shared folder)

The VM has no shared dir (only `Macintosh HD`). Host is the gateway `192.168.64.1`.
Serve from the host, curl from the guest, verify sha parity:

```sh
# host, in release/
shasum -a 256 productune-0.5.0-arm64.dmg
python3 -m http.server 8899 --bind 192.168.64.1
# VM
curl -sS -o ~/Downloads/pdt.dmg http://192.168.64.1:8899/productune-0.5.0-arm64.dmg
shasum -a 256 ~/Downloads/pdt.dmg     # must equal host
# install
hdiutil attach ~/Downloads/pdt.dmg -nobrowse -readonly -mountpoint /tmp/m
rm -rf /Applications/productune.app && cp -R /tmp/m/productune.app /Applications/
hdiutil detach /tmp/m
xattr -dr com.apple.quarantine /Applications/productune.app   # curl downloads aren't quarantined, but be safe
```

## 3. `claude` CLI: PATH gotcha (don't false-conclude "not installed")

`which claude` in an MCP `run_command` shell **fails even when claude is installed**, because
the non-interactive shell PATH omits `~/.local/bin`. This is exactly the T-PATCH-218 issue the
app's `checkClaude` works around (PATH-augmented spawn). The binary lives at
`~/.local/bin/claude` → symlink into `~/.local/share/claude/versions/<v>`.

```sh
PATH="$HOME/.local/bin:$PATH" command -v claude && PATH="$HOME/.local/bin:$PATH" claude --version
```

So "installed · not authed" in onboarding Step 2 is **correct** when the binary exists but no
creds — not a false positive.

## 4. claude auth on the VM (keychain) — the 401 artifact

`checkClaude` reports `authed` only when valid creds exist. macOS claude stores the OAuth token
in the **keychain** (`Claude Code-credentials`); absence → `not authed`. A *stale* keychain token
makes PO turns die with `claude exited code 1` + **0-byte stderr** but `result.is_error / API 401`
in stream-json — this is a **harness artifact, not a product bug** (root cause of the long
T-PATCH-230 / 221 / 231 hunts). Always confirm fresh keychain auth before blaming the product.

- Authenticate via the wizard **Connect** button → spawns `claude auth login` → opens claude.ai
  login in the VM's Safari → the human completes OAuth over VNC (needs the user's own account).
- To deliberately reproduce a **401** (T-231 verify): remove/expire the keychain creds, then run a
  PO turn → health-smoke should classify `auth` and surface the actionable banner.

## 5. Re-triggering the app-level onboarding wizard (T-220)

The engine-login wizard (`App.tsx`) shows only when `~/.productune/productune.env` is missing
**or** `settings.json` has no language pref. To re-test onboarding, back up and remove env:

```sh
mkdir -p ~/.productune/_bk && cp ~/.productune/productune.env ~/.productune/settings.json ~/.productune/_bk/
rm -f ~/.productune/productune.env      # next launch → wizard from Step 0
```

- Step 2 `needLogin` state shows **Connect + Recheck**; `needInstall` state shows only **Install
  guide** (no Recheck button) — re-detection there happens via window focus or Back→Next re-mount.
- Restore the backed-up files when done.

## 6. cua operation tips (fragile — verify against current layout)

- Dismiss obscuring macOS notification banners: `killall NotificationCenter`.
- `osascript` / System Events triggers a TCC Automation prompt that steals focus — avoid; use
  `cua-vm` clicks/`run_command` instead.
- Composer/input focus and titlebar coordinates drift between layouts/builds — re-screenshot and
  locate before clicking; don't reuse old pixel coords blindly.
