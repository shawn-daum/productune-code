#!/usr/bin/env python3
"""prdt URL handler — T-1191: the viewer env card's 「텍스트 편집기로 열기」.

Called by the `prdt-open.app` applet (prdt-url-scheme.sh) with one URL:

    prdt://open-env?root=<project root>&file=<env file name>[&line=<line>]

Threat model: ANY web page can hand the browser a `prdt://` URL. So the URL
names no path. It names a project root, a release line and a file NAME, and
the path is rebuilt here from that project's own `.prdt/config.json`, the
same code-folder rule the viewer uses (packages/viewer/lib/env-status.mjs
homeEnvDir · lineEnvDir). Opened only when ALL hold:
  - scheme `prdt`, host `open-env`, no path/fragment, only the keys root ·
    file · line, each at most once;
  - root is absolute, canonical (its realpath, no symlink in it), a prdt
    project (`.prdt/po-state.json` a regular file) AND recorded by our own
    tooling (a line of $PRDT_HOME/run/open-roots, written by the viewer
    generator) — a planted dir with a po-state.json is not a project here;
  - file matches `.env` / `.env.<suffix>` ([A-Za-z0-9_.-]), no separator;
  - the file in that code folder is a regular file, not a symlink.
Anything else is refused and logged; the file's bytes are never read here —
`open -t` hands it to the user's default text editor on their own screen.

`--check <url>` prints the resolved path (or refuses) without opening: the test
seam, and a way to see what a link would open.
"""
import json
import os
import re
import stat
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlsplit

ENV_NAME_RE = re.compile(r"\A\.env(\.[A-Za-z0-9_.-]+)?\Z")
LINE_RE = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")
LOG_CAP = 256 * 1024


class Refused(Exception):
    pass


def _home():
    env = os.environ.get("PRDT_HOME")
    if env:
        return env
    # installed at $PRDT_HOME/bin/ — LaunchServices starts the applet without PRDT_HOME
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _recorded_roots():
    """Roots our tooling recorded: $PRDT_HOME/run/open-roots, a regular file (a symlink there is refused)."""
    path = os.path.join(_home(), "run", "open-roots")
    if not _regular(path):
        return set()
    try:
        with open(path, encoding="utf-8") as f:
            return {ln for ln in f.read().split("\n") if ln}
    except (OSError, ValueError):
        return set()


def _log(verdict, reason, url):
    try:
        run = os.path.join(_home(), "run")
        os.makedirs(run, exist_ok=True)
        path = os.path.join(run, "open-url.log")
        try:
            if os.path.getsize(path) > LOG_CAP:
                os.replace(path, path + ".1")
        except OSError:
            pass
        rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "verdict": verdict, "reason": reason, "url": url[:300]}
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=True) + "\n")
    except OSError:
        pass


def _regular(p):
    try:
        return stat.S_ISREG(os.lstat(p).st_mode)
    except OSError:
        return False


def _code_dir(root, cfg, line):
    """Relative code folder — mirrors env-status.mjs homeEnvDir (no line) / lineEnvDir (line)."""
    if not line:
        code = cfg.get("code") if isinstance(cfg, dict) else None
        d = code.get("dir") if isinstance(code, dict) else None
        rel = "code"
        if isinstance(d, str) and d.strip() and not os.path.isabs(d.strip()) \
                and ".." not in re.split(r"[/\\]+", d.strip()):
            rel = d.strip()
        return rel if os.path.isdir(os.path.join(root, rel)) else "."
    entries = cfg.get("products", cfg.get("lines")) if isinstance(cfg, dict) else None
    if not isinstance(entries, list):
        return None
    for e in entries:
        if isinstance(e, dict) and e.get("name") == line:
            code = e.get("code")
            d = code.get("dir") if isinstance(code, dict) else None
            if isinstance(d, str) and d.strip() and not os.path.isabs(d.strip()):
                return d.strip()
            return None
    return None


def resolve(url):
    if not isinstance(url, str) or len(url) > 4096 or "\x00" in url:
        raise Refused("not a prdt link")
    parts = urlsplit(url)
    if parts.scheme != "prdt" or parts.netloc != "open-env" or parts.path not in ("", "/") or parts.fragment:
        raise Refused("not a prdt://open-env link")
    try:
        q = parse_qs(parts.query, keep_blank_values=True, strict_parsing=True)
    except ValueError:
        raise Refused("malformed query")
    if set(q) - {"root", "file", "line"} or "root" not in q or "file" not in q or any(len(v) != 1 for v in q.values()):
        raise Refused("query keys must be root · file · line, once each")
    root, name, line = q["root"][0], q["file"][0], q.get("line", [""])[0]
    if "\x00" in root + name + line:
        raise Refused("NUL in a field")
    if not os.path.isabs(root) or os.path.realpath(root) != root:
        raise Refused("root is not a canonical absolute path")
    if root not in _recorded_roots():
        raise Refused("root was not recorded by prdt tooling")
    if not _regular(os.path.join(root, ".prdt", "po-state.json")):
        raise Refused("root is not a prdt project")
    if line and not LINE_RE.match(line):
        raise Refused("bad line name")
    if not ENV_NAME_RE.match(name) or ".." in name:
        raise Refused("file is not an env file name")
    cfg = {}
    cfg_path = os.path.join(root, ".prdt", "config.json")
    if _regular(cfg_path):
        try:
            with open(cfg_path, encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            cfg = {}
    rel = _code_dir(root, cfg, line)
    if rel is None:
        raise Refused("no code folder for that line")
    target = os.path.join(os.path.realpath(os.path.join(root, rel)), name)
    if not _regular(target):
        raise Refused("env file missing, or not a regular file")
    return target


def main(argv):
    check = bool(argv) and argv[0] == "--check"
    args = argv[1:] if check else argv
    if len(args) != 1:
        print("usage: prdt_open_url.py [--check] <prdt://open-env?...>", file=sys.stderr)
        return 2
    url = args[0]
    try:
        target = resolve(url)
    except Refused as e:
        _log("refused", str(e), url)
        print(f"prdt-open: refused — {e}", file=sys.stderr)
        return 1
    if check:
        print(target)
        return 0
    _log("opened", "", url)
    return subprocess.call(["/usr/bin/open", "-t", target])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
