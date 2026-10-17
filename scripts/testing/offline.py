#!/usr/bin/env python3
"""Linux replay guard. Never retry a test without the complete boundary."""
import ctypes
import errno
import os
import pathlib
import shutil
import runpy
import sys


def fail(message):
    raise RuntimeError(message)


def seccomp_exec(command, profile="strict"):
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
        def rule(name, comparisons):
            number = lib.seccomp_syscall_resolve_name(name.encode())
            if number < 0:
                fail("seccomp cannot resolve " + name)
            array = (ArgCmp * len(comparisons))(*comparisons)
            if lib.seccomp_rule_add_array(context, 0x50000 | errno.EPERM,
                                         number, len(comparisons), array):
                fail("seccomp " + name + " rule failed")
        def family(value):
            # Linux consumes an int, ignoring syscall-register high bits.
            return ArgCmp(0, 7, 0xffffffff, value)  # SCMP_CMP_MASKED_EQ
        for value in (2, 10, 40):  # AF_INET, AF_INET6, AF_VSOCK
            rule("socket", [family(value)])
            rule("socketpair", [family(value)])
        if profile == "strict":
            rule("socket", [family(1)])  # AF_UNIX
        # Bun 1.4.3 spawnSync demonstrably uses connected Unix STREAM|CLOEXEC
        # pairs. They cannot reconnect/sendto a pathname peer. Datagram pairs can.
        # Require STREAM and reject all low-int bits except NONBLOCK/CLOEXEC.
        for bit in range(32):
            if bit not in (0, 11, 19):
                rule("socketpair", [family(1), ArgCmp(1, 7, 1 << bit, 1 << bit)])
        rule("socketpair", [family(1), ArgCmp(1, 7, 1, 0)])
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
    arguments = sys.argv[1:]
    profile = "strict"
    if arguments[:1] == ["--profile"]:
        if len(arguments) < 2 or arguments[1] not in ("strict", "ipc"):
            fail("Unknown guard profile")
        profile = arguments[1]
        arguments = arguments[2:]
    if arguments[:1] == ["--seccomp-exec"]:
        if len(arguments) < 2:
            fail("Missing guarded command")
        seccomp_exec(arguments[1:], profile)
    if len(arguments) < 4 or arguments[2] != "--":
        fail("Usage: offline.py ROOT SCRATCH -- COMMAND [ARGS...]")
    root = pathlib.Path(arguments[0]).resolve(strict=True)
    scratch = pathlib.Path(arguments[1]).resolve(strict=True)
    command = arguments[3:]
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
    policy = runpy.run_path(str(pathlib.Path(__file__).with_name("sandbox.py")))
    mounts, inputs = policy["mount_arguments"](root, scratch, command,
                    owner=pathlib.Path(__file__).resolve().parents[2])
    environment["YF_GUARD_INPUT_ROOTS"] = inputs
    arguments = [bwrap, "--die-with-parent", "--unshare-net", "--unshare-pid", "--new-session", *mounts,
                 "--setenv", "TMPDIR", str(scratch), "--chdir", str(root)]
    arguments += [sys.executable, str(pathlib.Path(__file__).resolve()),
                  "--profile", profile, "--seccomp-exec", *command]
    os.execve(bwrap, arguments, environment)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f"Offline replay guard failed: {error}", file=sys.stderr)
        sys.exit(2)
