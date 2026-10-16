#!/usr/bin/env python3
"""Linux offline launcher: deny IPv4/IPv6 socket creation, inherit to children.
Installation is separate. No test command is ever retried without this filter.
"""
import ctypes, errno, os, sys
class ArgCmp(ctypes.Structure):
    _fields_ = [("arg", ctypes.c_uint), ("op", ctypes.c_uint),
                ("datum_a", ctypes.c_uint64), ("datum_b", ctypes.c_uint64)]
lib = ctypes.CDLL("libseccomp.so.2", use_errno=True)
lib.seccomp_init.restype = ctypes.c_void_p
lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32,
    ctypes.c_int, ctypes.c_uint, ctypes.POINTER(ArgCmp)]
lib.seccomp_load.argtypes = [ctypes.c_void_p]
ctx = lib.seccomp_init(0x7fff0000)
if not ctx: raise RuntimeError("seccomp initialization failed")
for family in (2, 10):
    comparison = ArgCmp(0, 4, family, 0) # SCMP_CMP_EQ
    result = lib.seccomp_rule_add_array(ctx, 0x50000 | errno.EPERM,
        lib.seccomp_syscall_resolve_name(b"socket"), 1, ctypes.byref(comparison))
    if result: raise RuntimeError(f"seccomp socket rule failed: {result}")
if lib.seccomp_load(ctx): raise RuntimeError("seccomp load failed")
os.environ["FETCH_DEVEL"] = ""
os.environ["FMC_CACHE_MODE"] = "replay"
os.execvp(sys.argv[1], sys.argv[1:])
