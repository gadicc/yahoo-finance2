#!/usr/bin/env python3
"""Workers-only Linux sandbox: isolated loopback, read-only host, scratch writes.

Ordinary replay must continue using offline.py. This helper permits local sockets
inside a new network namespace for Miniflare/workerd; it never uses host IP networking.
This is for trusted workloads: visible host pathname Unix sockets are reachable.
The operator must keep the private scratch tree free of concurrent mutations.
"""
import errno
import fcntl
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import struct
import stat
import sys


def fail(message):
    raise RuntimeError(message)


def close_inherited_descriptors():
    for value in os.listdir("/proc/self/fd"):
        descriptor = int(value)
        if descriptor >= 3:
            try:
                os.close(descriptor)
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise


def namespace():
    return os.readlink("/proc/self/ns/net")


def network_state(host_namespace):
    if namespace() == host_namespace:
        fail("Workers sandbox must not use the host network namespace")
    interfaces = [name for _, name in socket.if_nameindex()]
    if interfaces != ["lo"]:
        fail("Workers sandbox must contain only the loopback interface")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as control:
        flags = struct.unpack_from("H", fcntl.ioctl(control, 0x8913, struct.pack("16sH14x", b"lo", 0)), 16)[0]
    if not flags & 1:
        fail("Workers sandbox loopback interface is down")
    ipv4 = pathlib.Path("/proc/net/route").read_text().splitlines()[1:]
    for route in ipv4:
        fields = route.split()
        if fields and (fields[0] != "lo" or
                       (not int(fields[3], 16) & 0x200 and
                        (int(fields[1], 16) & 0xff != 127 or fields[7] == "00000000"))):
            fail("Workers sandbox contains a non-loopback or usable default IPv4 route")
    ipv6 = pathlib.Path("/proc/net/ipv6_route")
    if ipv6.exists():
        for route in ipv6.read_text().splitlines():
            fields = route.split()
            # Fresh Linux namespaces include unreachable ::/0 RTF_REJECT entries.
            # Those cannot carry traffic; the only usable IPv6 route may be ::1/128.
            if fields and (fields[-1] != "lo" or
                           (not int(fields[8], 16) & 0x200 and
                            (fields[0] != "0" * 31 + "1" or fields[1] != "80"))):
                fail("Workers sandbox contains a non-loopback or usable default IPv6 route")
    external = {}
    for family, address, label in (
        (socket.AF_INET, ("192.0.2.1", 443), "ipv4"),
        (socket.AF_INET6, ("2001:db8::1", 443), "ipv6"),
    ):
        try:
            with socket.socket(family, socket.SOCK_DGRAM) as connection:
                connection.connect(address)
        except OSError as error:
            if error.errno not in (errno.ENETUNREACH, errno.EAFNOSUPPORT):
                raise
            external[label] = errno.errorcode[error.errno]
        else:
            fail("Workers sandbox has an external network route")
    return {"namespace": namespace(), "interfaces": interfaces, "external": external}


def mount_state(root, scratch, cwd):
    mounts = {}
    for line in pathlib.Path("/proc/self/mountinfo").read_text().splitlines():
        fields = line.split()
        mountpoint = re.sub(r"\\([0-7]{3})", lambda value: chr(int(value[1], 8)), fields[4])
        mounts[mountpoint] = set(fields[5].split(","))
    if "ro" not in mounts.get("/", set()) or "ro" not in mounts.get(root, set()):
        fail("Workers sandbox host and repository mounts must be read-only")
    if "rw" not in mounts.get(scratch, set()) or str(pathlib.Path.cwd()) != cwd:
        fail("Workers sandbox scratch mount/cwd is invalid")
    return {"hostReadOnly": True, "repositoryReadOnly": True, "scratchWritable": True}


def capabilities_dropped():
    status = {}
    for line in pathlib.Path("/proc/self/status").read_text().splitlines():
        key, _, value = line.partition(":")
        if key.startswith("Cap") or key == "NoNewPrivs":
            status[key] = value.strip()
    for key in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"):
        if int(status[key], 16):
            fail("Workers workload must have no capabilities")
    if status.get("NoNewPrivs") != "1":
        fail("Workers workload must have no_new_privs enabled")
    return status


def validate_scratch_inodes(scratch):
    """Reject preexisting hardlinks whose other directory entries are outside scratch.

    Count every nondirectory inode class, including symlinks, without following
    directory symlinks. This is a trusted-operator preflight, not a transaction
    against concurrent hostile filesystem changes.
    """
    metadata = scratch.stat()
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o700:
        fail("Workers scratch must be owned by the invoking user and private (mode 0700)")
    inodes = {}
    pending = [scratch]
    while pending:
        with os.scandir(pending.pop()) as entries:
            for entry in entries:
                metadata = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(metadata.st_mode):
                    pending.append(pathlib.Path(entry.path))
                    continue
                key = (metadata.st_dev, metadata.st_ino)
                previous = inodes.get(key)
                if previous is None:
                    inodes[key] = [1, metadata.st_nlink]
                else:
                    if previous[1] != metadata.st_nlink:
                        fail("Workers scratch inode links changed during preflight")
                    previous[0] += 1
    if any(count != links for count, links in inodes.values()):
        fail("Workers scratch contains a hardlink with directory entries outside scratch")


def main():
    if sys.platform != "linux":
        fail("Workers loopback sandbox requires Linux, Bubblewrap, ip and setpriv; no host-network fallback is available")
    arguments = sys.argv[1:]
    if arguments and arguments[0] in ("--setup", "--verify"):
        stage, host_namespace, root, scratch, cwd, separator, *command = arguments
        if separator != "--" or not command:
            fail("Invalid internal Workers sandbox arguments")
        if stage == "--setup":
            if namespace() == host_namespace or [name for _, name in socket.if_nameindex()] != ["lo"]:
                fail("Cannot configure loopback outside a new isolated network namespace")
            subprocess.run(["/usr/bin/ip", "link", "set", "lo", "up"], check=True)
            network_state(host_namespace)
            # setpriv clears bounding/inheritable/ambient sets before a fresh exec.
            # NET_ADMIN and SETPCAP exist only for setup in this new user namespace.
            os.execv("/usr/bin/setpriv", ["/usr/bin/setpriv", "--bounding-set=-all",
                     "--inh-caps=-all", "--ambient-caps=-all", "--no-new-privs", "--",
                     sys.executable, str(pathlib.Path(__file__).resolve()), "--verify",
                     host_namespace, root, scratch, cwd, "--", *command])
        capabilities_dropped()
        state = network_state(host_namespace)
        state["mounts"] = mount_state(root, scratch, cwd)
        close_inherited_descriptors()
        # The state is deliberately small and contains no environment/credential data.
        os.environ["YF_WORKERS_SANDBOX_STATE"] = json.dumps(state, separators=(",", ":"))
        os.execv(command[0], command)
    if len(arguments) < 5 or arguments[3] != "--":
        fail("Usage: workers-loopback.py ROOT SCRATCH CWD -- ABSOLUTE_COMMAND [ARGS...]")
    root_arg, scratch_arg, cwd_arg, _, *command = arguments
    root = pathlib.Path(root_arg).resolve(strict=True)
    scratch = pathlib.Path(scratch_arg).resolve(strict=True)
    cwd = pathlib.Path(cwd_arg).resolve(strict=True)
    if not root.is_dir() or not scratch.is_dir() or not cwd.is_dir():
        fail("Expected existing root, scratch and working directories")
    if scratch == root or root in scratch.parents or scratch in root.parents:
        fail("Expected non-overlapping repository and scratch directories")
    if pathlib.Path(scratch_arg).absolute() != scratch:
        fail("Workers scratch path must be canonical, without symlink aliases")
    if cwd != scratch and scratch not in cwd.parents:
        fail("Workers working directory must be inside scratch")
    if not pathlib.Path(command[0]).is_absolute() or not pathlib.Path(command[0]).is_file():
        fail("Workers command must be an existing absolute executable path")
    required = {name: shutil.which(name) for name in ("bwrap", "ip", "setpriv")}
    if any(value is None for value in required.values()):
        fail("Workers sandbox requires Bubblewrap, ip and setpriv; no host-network fallback is available")
    if any(str(pathlib.Path(value).resolve()) != "/usr/bin/" + name for name, value in required.items()):
        fail("Workers sandbox requires the reviewed /usr/bin/bwrap, /usr/bin/ip and /usr/bin/setpriv tools")
    for name in ("home", "tmp", "config", "cache", "data", "empty-run"):
        directory = scratch / ("sandbox-" + name)
        directory.mkdir(exist_ok=True)
        if directory.is_symlink() or directory.resolve() != directory:
            fail("Workers sandbox state directories must not be symlinks")
    validate_scratch_inodes(scratch)
    environment = {
        "PATH": str(pathlib.Path(command[0]).parent) + ":/usr/bin:/bin",
        "HOME": str(scratch / "sandbox-home"),
        "TMPDIR": str(scratch / "sandbox-tmp"),
        "XDG_CONFIG_HOME": str(scratch / "sandbox-config"),
        "XDG_CACHE_HOME": str(scratch / "sandbox-cache"),
        "XDG_DATA_HOME": str(scratch / "sandbox-data"),
        "CI": "1", "NO_COLOR": "1", "TZ": "UTC", "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "CLOUDFLARE_TELEMETRY_DISABLED": "1", "WRANGLER_SEND_METRICS": "false",
        "FETCH_DEVEL": "", "FMC_CACHE_MODE": "replay",
    }
    host_namespace = namespace()
    close_inherited_descriptors()
    script = str(pathlib.Path(__file__).resolve())
    sandbox = [required["bwrap"], "--die-with-parent", "--unshare-user", "--uid", "0", "--gid", "0", "--unshare-net",
               "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--new-session",
               "--cap-add", "CAP_NET_ADMIN", "--cap-add", "CAP_SETPCAP",
               "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc",
               "--ro-bind", str(root), str(root), "--bind", str(scratch), str(scratch),
               "--ro-bind", str(scratch / "sandbox-empty-run"), "/run", "--chdir", str(cwd),
               sys.executable, script, "--setup", host_namespace, str(root), str(scratch), str(cwd),
               "--", *command]
    os.execve(required["bwrap"], sandbox, environment)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f"Workers loopback sandbox failed: {error}", file=sys.stderr)
        sys.exit(2)
