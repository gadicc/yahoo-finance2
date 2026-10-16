#!/usr/bin/env python3
"""Linux replay guard. Never retry a test without the complete boundary."""
import ctypes
import errno
import os
import pathlib
import shutil
import sys


def fail(message):
    raise RuntimeError(message)


def seccomp_exec(command):
    # Independent of the network namespace, and inherited by every child.
    class ArgCmp(ctypes.Structure):
        _fields_ = [("arg", ctypes.c_uint), ("op", ctypes.c_uint),
                    ("datum_a", ctypes.c_uint64), ("datum_b", ctypes.c_uint64)]

    lib = ctypes.CDLL("libseccomp.so.2", use_errno=True)
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32,
                                         ctypes.c_int, ctypes.c_uint,
                                         ctypes.POINTER(ArgCmp)]
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    context = lib.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
    if not context:
        fail("seccomp initialization failed")
    try:
        socket = lib.seccomp_syscall_resolve_name(b"socket")
        if socket < 0:
            fail("seccomp cannot resolve socket syscall")
        for family in (2, 10):  # AF_INET, AF_INET6
            comparison = ArgCmp(0, 4, family, 0)  # SCMP_CMP_EQ
            if lib.seccomp_rule_add_array(context, 0x50000 | errno.EPERM,
                                         socket, 1, ctypes.byref(comparison)):
                fail("seccomp socket rule failed")
        # io_uring can issue network operations without socket(2).
        uring = lib.seccomp_syscall_resolve_name(b"io_uring_setup")
        if uring < 0:
            fail("seccomp cannot resolve io_uring_setup syscall")
        if lib.seccomp_rule_add_array(context, 0x50000 | errno.EPERM,
                                     uring, 0, None):
            fail("seccomp io_uring_setup rule failed")
        if lib.seccomp_load(context):
            fail("seccomp load failed")
    finally:
        lib.seccomp_release(context)
    os.execv(command[0], command)


def main():
    if sys.platform != "linux":
        fail("Offline replay requires Linux with Bubblewrap, Python 3 and libseccomp. Use a Linux/WSL environment; no unguarded fallback is available.")
    if len(sys.argv) > 1 and sys.argv[1] == "--seccomp-exec":
        if len(sys.argv) < 3:
            fail("Missing guarded command")
        seccomp_exec(sys.argv[2:])
    if len(sys.argv) < 5 or sys.argv[3] != "--":
        fail("Usage: offline.py ROOT SCRATCH -- COMMAND [ARGS...]")
    root = pathlib.Path(sys.argv[1]).resolve(strict=True)
    scratch = pathlib.Path(sys.argv[2]).resolve(strict=True)
    command = sys.argv[4:]
    if not root.is_dir() or not scratch.is_dir() or scratch == root or root in scratch.parents or scratch in root.parents:
        fail("Expected non-overlapping root and per-run scratch directories")
    # Only stdio is part of this launcher contract. A writable inherited file
    # descriptor would bypass mount permissions; discard it before Bubblewrap.
    # Do this only in the outer stage, never to Bubblewrap's internal fds.
    for value in os.listdir("/proc/self/fd"):
        descriptor = int(value)
        if descriptor >= 3:
            try:
                os.close(descriptor)
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise
    bwrap = shutil.which("bwrap")
    if not bwrap:
        fail("Bubblewrap (bwrap) is required for read-only fixtures and network isolation; no unguarded fallback is available")
    # Fail before launching bwrap when the independent syscall guard is absent.
    ctypes.CDLL("libseccomp.so.2", use_errno=True)
    environment = os.environ.copy()
    for key in tuple(environment):
        if key.startswith("FETCH_DEVEL") or key.startswith("FMC_"):
            environment.pop(key)
    environment["FETCH_DEVEL"] = ""
    environment["FMC_CACHE_MODE"] = "replay"
    arguments = [bwrap, "--die-with-parent", "--unshare-net", "--unshare-pid", "--new-session",
                 "--ro-bind", "/", "/", "--dev", "/dev",
                 "--proc", "/proc", "--ro-bind", str(root), str(root),
                 "--bind", str(scratch), str(scratch),
                 "--setenv", "TMPDIR", str(scratch), "--chdir", str(root)]
    arguments += [sys.executable, str(pathlib.Path(__file__).resolve()),
                  "--seccomp-exec", *command]
    os.execve(bwrap, arguments, environment)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f"Offline replay guard failed: {error}", file=sys.stderr)
        sys.exit(2)
