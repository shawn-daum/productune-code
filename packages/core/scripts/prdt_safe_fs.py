"""prdt_safe_fs — symlink-safe writes for project-local state (T-848 slice S3 / T-906).

A repository can commit symlinks (and hard links) anywhere under `.prdt/`, and
anything that writes there from a hook or the statusline must never follow one.
This module is the ONE place the hook / statusline Python walks a directory
chain: it replaces the near-identical component-by-component O_NOFOLLOW walks
that lived in prdt-auto-open.sh's WORKER and statusline-prdt.sh (T-848 N1) and
adds the descriptor-relative writers they shared.

Contract
  * `open_dir(root, parts)` opens `root` (already physical — callers resolve it
    first) and then EVERY component with O_NOFOLLOW, relative to the previous
    descriptor. A link at any component raises OSError (ELOOP / ENOTDIR); it is
    never followed and never replaced.
  * The writers take that directory descriptor and a bare file NAME, never a
    path string, so there is no second walk to race.
  * An existing file keeps its mode; a new file gets `default_mode` exactly
    (fchmod, so the umask never changes it — T-848 N3).
  * A hard link (st_nlink > 1) or a non-regular file at the target is refused
    where the write would go THROUGH the inode (`write_inplace`, `open_lock`,
    `append_line`); `write_atomic` renames a new inode over the name, so a link
    there is replaced as an entry and its target is untouched.
  * Every refusal is an OSError; callers decide how to degrade (the hooks and
    the statusline skip the write silently, as before).

Stdlib only; mirrored beside statusline-prdt.sh (`bin/`) by install.sh and the
GUI bootstrap. Keep it free of prdt-specific names.
"""
import os
import stat

NOFOLLOW_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def open_dir(root, parts, create=False, mode=0o755):
    """fd of `root`/`parts...`, every component opened with O_NOFOLLOW."""
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts:
            if create:
                try:
                    os.mkdir(part, mode, dir_fd=fd)
                except FileExistsError:
                    pass
            nfd = os.open(part, NOFOLLOW_DIR, dir_fd=fd)
            os.close(fd)
            fd = nfd
        return fd
    except BaseException:
        os.close(fd)
        raise


def lstat(dfd, name):
    """lstat of `name` inside `dfd`, or None when absent / unreadable."""
    try:
        return os.stat(name, dir_fd=dfd, follow_symlinks=False)
    except OSError:
        return None


def is_plain_file(st):
    """Regular, single-link: safe to write THROUGH (an absent file is fine too)."""
    return st is None or (stat.S_ISREG(st.st_mode) and st.st_nlink == 1)


def _open_file(dfd, name, flags, default_mode):
    """Open `name` in `dfd` for writing without following a link: create it
    exclusively (fchmod to `default_mode`) or open the existing regular,
    single-link file untouched. The returned fd has passed fstat."""
    base = flags | os.O_NOFOLLOW
    try:
        fd = os.open(name, base | os.O_CREAT | os.O_EXCL, default_mode, dir_fd=dfd)
        os.fchmod(fd, default_mode)
        return fd
    except FileExistsError:
        pass
    fd = os.open(name, base, dir_fd=dfd)
    try:
        if not is_plain_file(os.fstat(fd)):
            raise OSError("not a plain single-link file: " + name)
    except BaseException:
        os.close(fd)
        raise
    return fd


def write_inplace(dfd, name, data, default_mode=0o644):
    """Truncate-and-write a small state flag in place (a lock peer or stamp).
    Truncation happens AFTER the fstat check, never at open."""
    fd = _open_file(dfd, name, os.O_WRONLY, default_mode)
    try:
        os.ftruncate(fd, 0)
        os.write(fd, data if isinstance(data, bytes) else data.encode())
    finally:
        os.close(fd)


def open_lock(dfd, name, default_mode=0o644):
    """fd of a lock file (create or reuse), O_RDWR, link-refusing."""
    return _open_file(dfd, name, os.O_RDWR, default_mode)


def write_atomic(dfd, name, data, default_mode=0o644):
    """Replace `name` with `data`: O_EXCL|O_NOFOLLOW temp inside `dfd`, then a
    rename inside the same directory. An existing regular file's mode is kept;
    anything else gets `default_mode`."""
    mode = default_mode
    st = lstat(dfd, name)
    if st is not None and stat.S_ISREG(st.st_mode):
        mode = stat.S_IMODE(st.st_mode)
    tmp = "%s.tmp%d" % (name, os.getpid())
    try:
        os.unlink(tmp, dir_fd=dfd)
    except FileNotFoundError:
        pass
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600, dir_fd=dfd)
    try:
        os.fchmod(fd, mode)
        os.write(fd, data if isinstance(data, bytes) else data.encode("utf-8"))
        os.close(fd)
        fd = None
        os.replace(tmp, name, src_dir_fd=dfd, dst_dir_fd=dfd)
    except BaseException:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(tmp, dir_fd=dfd)
        except OSError:
            pass
        raise


def append_line(root, parts, text, default_mode=0o600):
    """Append `text` to `root`/`parts...` (last part = file name): every
    directory component opened with O_NOFOLLOW, the leaf created exclusively or
    reused only when it is a regular single-link file. Missing directories are
    NOT created (the callers' directory already exists)."""
    dfd = open_dir(root, parts[:-1])
    try:
        fd = _open_file(dfd, parts[-1], os.O_WRONLY | os.O_APPEND, default_mode)
        try:
            os.write(fd, text.encode("utf-8"))
        finally:
            os.close(fd)
    finally:
        os.close(dfd)


# ── T-1134: self-reported machine-home writes ────────────────────────────────
# The test suite's real-home tripwire (packages/gui/tests/real-home-tripwire.cjs)
# fails a run on ANY drift of the machine home — except a drift whose writer
# reported it here first, from a process the tripwire can prove is outside its
# run. `note_home_write` is that report: one JSON line per write, appended to
# `<tool home>/run/external-writes.jsonl` (the tooling-owned `run/` directory,
# which the tripwire does not watch), BEFORE the write lands — so a report
# without a write is harmless and a write without a report fails closed.
#
# Each line carries the writer's pid, its start time, its full parent chain
# (complete = the chain reached pid 1) and `PRODUCTUNE_TRIPWIRE_RUN` when set.
# A writer inside a test run (any run id, or the run's root pid among its
# ancestors) never earns an exemption; such a writer is not reported at all
# when its run id is set, which costs nothing and changes no verdict.

EXTERNAL_WRITES_LOG = "external-writes.jsonl"
_EXTERNAL_WRITES_MAX = 1 << 20  # rotated to `.1` past 1 MiB
_PROC = None


def tool_home():
    """`$PRDT_HOME`, else `~/.prdt` — prdt_lanes.prdt_home() without pathlib."""
    return os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")


def _proc_identity():
    """(start, ancestors, complete) of this process, computed once per process."""
    global _PROC
    if _PROC is not None:
        return _PROC
    start, chain, complete = None, [], False
    try:
        import subprocess
        out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,lstart="], capture_output=True, text=True,
                             timeout=5, env={**os.environ, "LC_ALL": "C"}).stdout
        table = {}
        for ln in out.splitlines():
            parts = ln.split(None, 2)
            if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
                table[int(parts[0])] = (int(parts[1]), parts[2].strip())
        start = table.get(os.getpid(), (None, None))[1]
        cur, seen = os.getppid(), set()
        while cur not in seen:
            seen.add(cur)
            chain.append(cur)
            if cur <= 1:
                complete = True
                break
            if cur not in table:
                break
            cur = table[cur][0]
    except Exception:
        pass
    _PROC = (start, chain, complete)
    return _PROC


def note_home_write(path, home=None):
    """Report a coming write of `path` under the tool home (see the T-1134 block
    above). Silent no-op outside the tool home, inside its `run/`, or on any
    error — the report must never be what breaks a write."""
    try:
        import json
        import time
        base = os.path.realpath(home or tool_home())
        target = os.path.realpath(os.path.abspath(os.fspath(path)))
        run = os.path.join(base, "run")
        if not target.startswith(base + os.sep) or target == run or target.startswith(run + os.sep):
            return
        if os.environ.get("PRODUCTUNE_TRIPWIRE_RUN"):
            return  # a test run's own writer: never exempt, nothing to report
        start, chain, complete = _proc_identity()
        line = json.dumps({"ts": int(time.time() * 1000), "path": target, "pid": os.getpid(), "start": start,
                           "ancestors": chain, "complete": complete, "writer": "prdt"}) + "\n"
        os.makedirs(run, exist_ok=True)
        log = os.path.join(run, EXTERNAL_WRITES_LOG)
        try:
            if os.lstat(log).st_size > _EXTERNAL_WRITES_MAX:
                os.replace(log, log + ".1")
        except FileNotFoundError:
            pass
        fd = os.open(log, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            os.write(fd, line.encode("utf-8"))
        finally:
            os.close(fd)
    except Exception:
        pass
