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
