#!/usr/bin/env python3
"""CI-only AppArmor userns exception; never run repository code as root.

The profile is an executable/descendant userns exception, not a sandbox.
Bubblewrap, seccomp and the Workers zero-capability leaf remain the boundaries.
"""
import ctypes
import errno
import fcntl
import hashlib
import json
import os
import re
import select
import signal
from pathlib import Path
import stat
import socket
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
PROFILE_NAME = "yahoo_finance2_ci_bwrap"
PROFILE_SOURCE = ROOT / "scripts/testing/ci-bwrap.apparmor"
PROFILE_SHA256 = "ccc99e3142a37ecb8374dfaf5edeef08272355641c1b51921348e1663036cb96"
STAGE = Path("/run/yahoo-finance2-ci-apparmor")
STAGED_PROFILE = STAGE / "bwrap.profile"
PARSER = Path("/usr/sbin/apparmor_parser")
RESTRICTIONS = (
    Path("/proc/sys/kernel/apparmor_restrict_unprivileged_userns"),
    Path("/proc/sys/kernel/apparmor_restrict_unprivileged_unconfined"),
)
ENV = {"PATH": "/usr/bin:/usr/sbin:/bin:/sbin", "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def label():
    return Path("/proc/self/attr/current").read_text().strip()


def capabilities():
    return {key: value.strip() for key, value in
            (line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines() if ":" in line)
            if key.startswith("Cap") or key == "NoNewPrivs"}


def trusted(path, *, directory=False):
    """Root-owned canonical input/tool with no writable ancestor or symlink alias."""
    path = Path(path)
    require(path.is_absolute() and path.resolve(strict=True) == path, f"Noncanonical trusted path: {path}")
    for ancestor in (path, *path.parents):
        metadata = ancestor.lstat()
        require(not stat.S_ISLNK(metadata.st_mode) and metadata.st_uid == 0 and not metadata.st_mode & 0o022,
                f"Trusted path is not protected by root ownership/mode: {ancestor}")
    metadata = path.stat()
    require(stat.S_ISDIR(metadata.st_mode) if directory else stat.S_ISREG(metadata.st_mode), f"Unexpected trusted path type: {path}")
    return path


def execute(command, *, check=True):
    result = subprocess.run(list(map(str, command)), env=ENV, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {command[0]}\n{result.stdout}")
    return result


def restrictions():
    return {str(path): path.read_text().strip() for path in RESTRICTIONS if path.exists()}


BWRAP = Path("/usr/bin/bwrap")
ATTACHMENT_TIMEOUT = 3.0
NAMESPACES = ("user", "mnt", "net", "pid", "ipc", "uts", "cgroup")


def _plain_binary():
    binary = trusted(BWRAP)
    metadata = binary.stat()
    require(not metadata.st_mode & (stat.S_ISUID | stat.S_ISGID), "Bwrap attachment probe refuses setuid/setgid binaries")
    try:
        file_caps = os.getxattr(binary, "security.capability")
    except OSError as error:
        require(error.errno == errno.ENODATA, "Cannot establish absence of bwrap file capabilities")
        file_caps = b""
    require(not file_caps, "Bwrap attachment probe refuses file capabilities")
    return metadata.st_dev, metadata.st_ino


def _process_label(pid):
    return Path(f"/proc/{pid}/attr/current").read_text().strip()


def _live_process(process, pidfd):
    poller = select.poll()
    poller.register(pidfd, select.POLLIN | select.POLLHUP | select.POLLERR)
    require(not poller.poll(0) and process.poll() is None, "Bwrap attachment probe exited before observation completed")


class _ExecImagePending(RuntimeError):
    pass


def _attachment_snapshot(process, pidfd, expected_inode, namespaces, read_fd):
    _live_process(process, pidfd)
    proc = Path(f"/proc/{process.pid}")
    require(os.readlink(proc / "exe") == str(BWRAP), "Bwrap attachment probe executable path changed")
    executable = (proc / "exe").stat()
    require((executable.st_dev, executable.st_ino) == expected_inode, "Bwrap attachment probe executable inode changed")
    command = (proc / "cmdline").read_bytes().split(b"\0")
    # exec can publish exe before procfs has published the new argv bounds.
    # No label is read from this transient empty-image observation.
    if command == [b""]:
        raise _ExecImagePending("Bwrap exec argument image is not ready")
    require(command == [os.fsencode(BWRAP), b"--args", str(read_fd).encode(), b""], "Bwrap attachment probe arguments changed")
    fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
    require(len(fields) > 19 and fields[0] not in ("Z", "X"), "Bwrap attachment probe is not a live process")
    status = dict(line.split(":", 1) for line in (proc / "status").read_text().splitlines() if ":" in line)
    require({"Uid", "Gid", "CapEff", "CapPrm", "CapAmb"} <= status.keys(), "Incomplete bwrap attachment process status")
    require(list(map(int, status["Uid"].split())) == [os.getuid()] * 4
            and list(map(int, status["Gid"].split())) == [os.getgid()] * 4, "Bwrap attachment probe gained credentials")
    require(all(int(status[key].strip(), 16) == 0 for key in ("CapEff", "CapPrm", "CapAmb")), "Bwrap attachment probe gained capabilities")
    observed_ns = {name: os.readlink(proc / "ns" / name) for name in NAMESPACES}
    require(observed_ns == namespaces, "Bwrap attachment probe started namespace setup")
    current = _process_label(process.pid)
    _live_process(process, pidfd)
    require(current == "unconfined", f"Bwrap already has an executable attachment; refusing to supersede it: {current}")
    return {"pid": process.pid, "startTime": fields[19], "label": current, "namespaces": observed_ns,
            "uid": status["Uid"].split(), "gid": status["Gid"].split(),
            "capabilities": {key: status[key].strip() for key in ("CapEff", "CapPrm", "CapAmb")}}



def _ready_attachment_snapshot(process, pidfd, expected_inode, namespaces, read_fd, deadline):
    while True:
        try:
            return _attachment_snapshot(process, pidfd, expected_inode, namespaces, read_fd)
        except _ExecImagePending:
            remaining = deadline - time.monotonic()
            require(remaining > 0, "Bwrap executable image observation timed out")
            time.sleep(min(0.001, remaining))


def probe_bwrap_attachment():
    """Observe the actual executable while --args blocks, before any namespaces.

    Only --version is released after identity/label checks. No privileged utility
    runs here. PID readiness, all pipes and the child are closed/reaped on failure.
    """
    require(hasattr(os, "pidfd_open") and hasattr(signal, "pidfd_send_signal"), "A live pidfd is required for attachment observation")
    expected_inode = _plain_binary()
    namespaces = {name: os.readlink(Path("/proc/self/ns") / name) for name in NAMESPACES}
    deadline = time.monotonic() + ATTACHMENT_TIMEOUT
    read_fd, write_fd = os.pipe2(os.O_CLOEXEC)
    child = None
    pidfd = None
    try:
        child = subprocess.Popen([str(BWRAP), "--args", str(read_fd)], pass_fds=(read_fd,),
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV)
        # Popen reports exec failure before returning. /proc exe and pidfd below
        # additionally prove the actual still-live image; no label is sampled
        # from a pre-exec Python child or a recycled/exited numeric PID.
        pidfd = os.pidfd_open(child.pid)
        os.close(read_fd)
        observed_read_fd = read_fd
        read_fd = None
        first = _ready_attachment_snapshot(child, pidfd, expected_inode, namespaces, observed_read_fd, deadline)
        second = _ready_attachment_snapshot(child, pidfd, expected_inode, namespaces, observed_read_fd, deadline)
        require(first == second and _plain_binary() == expected_inode, "Bwrap attachment observation changed while arguments were withheld")
        remaining = deadline - time.monotonic()
        require(remaining > 0, "Bwrap attachment observation timed out")
        # Empty pipe plus open writer prevents parsing from reaching namespace
        # setup. This is the only data ever supplied, after both label samples.
        require(os.write(write_fd, b"--version\0") == 10, "Incomplete bwrap version release")
        os.close(write_fd)
        write_fd = None
        output, errors = child.communicate(timeout=remaining)
        require(child.returncode == 0 and not errors and re.fullmatch(rb"bubblewrap [0-9]+(?:\.[0-9]+)+\n", output),
                "Bwrap attachment probe did not complete its bounded version handshake")
        return {**first, "version": output.decode().strip(), "namespaceSetup": False}
    finally:
        original_error = sys.exc_info()[1]
        cleanup_error = None
        try:
            if child is not None and child.poll() is None:
                try:
                    if pidfd is None:
                        child.kill()  # Our own unreaped direct child if pidfd_open failed.
                    else:
                        signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except OSError as error:
                    cleanup_error = error
                    # A pre-existing profile can deny signals too. Empty EOF
                    # contains no command: reviewed bwrap exits with usage before
                    # namespace setup. This is failed-probe cleanup, not a retry.
                    if write_fd is not None:
                        os.close(write_fd)
                        write_fd = None
                try:
                    child.wait(timeout=ATTACHMENT_TIMEOUT)
                except subprocess.SubprocessError as error:
                    cleanup_error = error
        finally:
            for descriptor in (read_fd, write_fd, pidfd):
                if descriptor is not None:
                    os.close(descriptor)
            if child is not None:
                for stream in (child.stdout, child.stderr):
                    if stream is not None:
                        stream.close()
        require(cleanup_error is None, f"Bwrap attachment child cleanup failed after {original_error}: {cleanup_error}")


def startup(environment=None):
    environment = os.environ if environment is None else environment
    require(sys.platform == "linux" and os.getuid() != 0 and os.geteuid() == os.getuid(), "Run as the ordinary CI operator on Linux")
    require(environment.get("GITHUB_ACTIONS") == "true" and environment.get("RUNNER_ENVIRONMENT") == "github-hosted"
            and environment.get("RUNNER_OS") == "Linux" and environment.get("ImageOS") == "ubuntu24",
            "This provisioner is only for disposable GitHub-hosted Ubuntu 24.04 jobs")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    require(release.get("ID", "").strip('"') == "ubuntu" and release.get("VERSION_ID", "").strip('"') == "24.04", "Unexpected runner distribution")
    require(Path("/sys/module/apparmor/parameters/enabled").read_text().strip() == "Y", "AppArmor must be active for this remedy")
    require(label() == "unconfined", "Provisioning must start outside any bwrap/profile descendant")
    require(int(capabilities()["CapEff"], 16) == 0 and int(capabilities()["CapPrm"], 16) == 0, "CI operator must have no effective or permitted host capabilities")
    require(restrictions().get(str(RESTRICTIONS[0])) == "1", "Default userns restriction must stay enabled")
    for path in ("/usr/bin/bwrap", "/usr/bin/sudo", "/usr/bin/mkdir", "/usr/bin/install", "/usr/bin/stat",
                 "/usr/bin/sha256sum", "/usr/bin/cat", "/usr/bin/rm", "/usr/bin/rmdir", str(PARSER),
                 "/etc/apparmor.d/abi/4.0"):
        trusted(path)
    trusted("/run", directory=True)
    require(PROFILE_SOURCE.resolve(strict=True) == PROFILE_SOURCE and PROFILE_SOURCE.is_file(), "Profile source must be a canonical regular file")
    require(hashlib.sha256(PROFILE_SOURCE.read_bytes()).hexdigest() == PROFILE_SHA256, "Profile source digest differs from the reviewed policy")
    version = execute([PARSER, "--config-file", "/dev/null", "--version"]).stdout
    require("AppArmor parser version 4." in version, "This remedy requires the reviewed Ubuntu AppArmor 4 parser family")
    names = execute([PARSER, "--config-file", "/dev/null", "--skip-kernel-load", "--skip-cache", "--names", PROFILE_SOURCE]).stdout.strip()
    require(names == PROFILE_NAME, "Profile must define exactly the reviewed namespaced profile")
    attachment = probe_bwrap_attachment()
    return {"operatorUid": os.getuid(), "label": label(), "restrictions": restrictions(), "parser": version.strip(), "bwrapAttachment": attachment,
            "bwrapSha256": hashlib.sha256(Path("/usr/bin/bwrap").read_bytes()).hexdigest()}


class ProfileLoader:
    """All privileged argv are fixed utilities and fixed root-owned destinations."""
    def __init__(self):
        self.created = False
        self.verified = False
        self.load_attempted = False

    def sudo(self, command):
        return execute(["/usr/bin/sudo", "--non-interactive", "--", *command])

    def profiles(self):
        return self.sudo(["/usr/bin/cat", "/sys/kernel/security/apparmor/profiles"]).stdout.splitlines()

    def begin(self):
        # Names alone cannot identify wildcard executable attachments. Observe
        # the actual binary first, before even a privileged inventory read.
        probe_bwrap_attachment()
        # The name inventory is only an additional conservative collision check.
        require(not any("bwrap" in line.lower() for line in self.profiles()), "An existing bwrap-related profile is loaded; refusing a conflicting attachment")
        require(not STAGE.exists() and not STAGE.is_symlink(), "CI root staging path already exists")
        self.sudo(["/usr/bin/mkdir", "--mode=0700", "--", str(STAGE)])
        self.created = True
        metadata = STAGE.lstat()
        require(metadata.st_uid == 0 and stat.S_ISDIR(metadata.st_mode) and stat.S_IMODE(metadata.st_mode) == 0o700, "Root staging directory is not private and root-owned")
        self.sudo(["/usr/bin/install", "--no-target-directory", "--owner=0", "--group=0", "--mode=0600", "--", str(PROFILE_SOURCE), str(STAGED_PROFILE)])
        metadata = self.sudo(["/usr/bin/stat", "--printf=%F:%u:%g:%a", "--", str(STAGED_PROFILE)]).stdout
        require(metadata == "regular file:0:0:600", "Staged profile metadata is not root-owned regular 0600")
        digest = self.sudo(["/usr/bin/sha256sum", "--", str(STAGED_PROFILE)]).stdout.strip()
        require(digest == f"{PROFILE_SHA256}  {STAGED_PROFILE}", "Staged profile digest changed; nothing will be loaded")
        self.verified = True
        # Recheck immediately before adding: policy must still be unconfined
        # after staging. Concurrent privileged policy writers are outside this
        # single-job ephemeral-host contract; this is not an atomic policy lock.
        probe_bwrap_attachment()
        self.load_attempted = True
        # --add never replaces an existing policy; no policy service reload/cache.
        self.sudo([str(PARSER), "--config-file", "/dev/null", "--add", "--skip-cache", str(STAGED_PROFILE)])
        require(any(line.startswith(PROFILE_NAME + " (") for line in self.profiles()), "Expected profile did not appear after loading")

    def rollback(self):
        if not self.created:
            return
        # A parser error could occur after a partial load. Remove only our new
        # name, using the immutable verified input. Preserve it if removal fails.
        if self.load_attempted and any(line.startswith(PROFILE_NAME + " (") for line in self.profiles()):
            require(self.verified, "Cannot remove a profile with unverified policy input")
            self.sudo([str(PARSER), "--config-file", "/dev/null", "--remove", "--skip-cache", str(STAGED_PROFILE)])
        self.sudo(["/usr/bin/rm", "--force", "--", str(STAGED_PROFILE)])
        self.sudo(["/usr/bin/rmdir", "--", str(STAGE)])


def default_probe():
    """Unrelated Python sibling; never touches the host network configuration."""
    initial = {"label": label(), "uid": os.getuid(), "gid": os.getgid(), "capabilities": capabilities()}
    require(initial["label"] == "unconfined" and initial["uid"] != 0, "Default probe must be an unrelated ordinary-user sibling")
    require(all(int(initial["capabilities"][key], 16) == 0 for key in ("CapEff", "CapPrm")), "Default probe must start without host capabilities")
    libc = ctypes.CDLL(None, use_errno=True)
    libc.unshare.argtypes = [ctypes.c_int]
    for stage, flags in (("user namespace", 0x10000000), ("network namespace", 0x40000000)):
        if libc.unshare(flags):
            error = ctypes.get_errno()
            require(error in (errno.EPERM, errno.EACCES), f"Unexpected default restriction error: {error}")
            print(json.dumps({**initial, "denialLabel": label(), "denialCapabilities": capabilities(), "deniedStage": stage, "errno": errno.errorcode[error]}, sort_keys=True))
            return
    # Stay in this process: exec of an unmapped UID can itself discard namespace
    # capabilities and would make an unrelated denial look like AppArmor proof.
    # Neither operation below can alter an interface in the host namespace.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as control:
            flags = struct.unpack_from("H", fcntl.ioctl(control, 0x8913, struct.pack("16sH14x", b"lo", 0)), 16)[0]
            fcntl.ioctl(control, 0x8914, struct.pack("16sH14x", b"lo", flags | 1))
    except OSError as error:
        require(error.errno in (errno.EPERM, errno.EACCES), f"Unexpected private NET_ADMIN error: {error}")
        print(json.dumps({**initial, "denialLabel": label(), "denialCapabilities": capabilities(), "deniedStage": "namespace NET_ADMIN", "errno": errno.errorcode[error.errno]}, sort_keys=True))
        return
    raise RuntimeError("Unrelated process gained namespace NET_ADMIN; the default restriction control failed")


def sibling():
    result = execute([sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--default-probe"])
    return json.loads(result.stdout)


def assert_profile_label():
    current = label()
    require(current.startswith(PROFILE_NAME + " ("), f"Bwrap child lost the expected profile lineage: {current}")
    print(json.dumps({"label": current, "capabilities": capabilities(), "networkNamespace": os.readlink("/proc/self/ns/net")}, sort_keys=True), flush=True)


def inside(mode, root, scratch, host_namespace):
    assert_profile_label()
    require(os.readlink("/proc/self/ns/net") != host_namespace, "Guard retained its caller's network namespace")
    if mode == "--nested-probe":
        return execute([sys.executable, "-I", "-B", str(Path(root) / "scripts/testing/offline.py"), root, scratch, "--",
                        sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--strict-leaf", root, scratch,
                        os.readlink("/proc/self/ns/net")])
    if mode == "--strict-leaf":
        return execute([sys.executable, "-I", "-B", str(Path(root) / "scripts/ci.py"), "--guard-inside", root, scratch, host_namespace])
    require(mode == "--workers-leaf", "Unknown internal probe")
    status = capabilities()
    require(all(int(status[key], 16) == 0 for key in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"))
            and status["NoNewPrivs"] == "1", "Workers leaf regained capabilities")
    return None


def controls(scratch, *, after=False):
    workers_scratch = scratch / ("after-workers" if after else "before-workers")
    workers_scratch.mkdir(mode=0o700)
    commands = [
        [sys.executable, "-I", "-B", str(ROOT / "scripts/ci.py"), "guard"],
        [sys.executable, "-I", "-B", str(ROOT / "scripts/testing/workers-loopback-probe.py"), str(ROOT), str(workers_scratch)],
    ]
    if after:
        nested_scratch = scratch / "nested"
        leaf_scratch = scratch / "workers-leaf"
        nested_scratch.mkdir(mode=0o700)
        leaf_scratch.mkdir(mode=0o700)
        commands.extend([
            [sys.executable, "-I", "-B", str(ROOT / "scripts/testing/offline.py"), str(ROOT), str(nested_scratch), "--",
             sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--nested-probe", str(ROOT), str(nested_scratch), os.readlink("/proc/self/ns/net")],
            [sys.executable, "-I", "-B", str(ROOT / "scripts/testing/workers-loopback.py"), str(ROOT), str(leaf_scratch), str(leaf_scratch), "--",
             sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--workers-leaf", str(ROOT), str(leaf_scratch), os.readlink("/proc/self/ns/net")],
        ])
    return [{"command": command, "code": result.returncode, "output": result.stdout}
            for command in commands for result in (execute(command, check=False),)]


def provision():
    state = startup()
    before_sibling = sibling()
    loader = ProfileLoader()
    with tempfile.TemporaryDirectory(prefix="yf-ci-apparmor-") as value:
        scratch = Path(value).resolve()
        before = controls(scratch)
        print(json.dumps({"stage": "before", "state": state, "unrelatedProcess": before_sibling, "controls": before}, sort_keys=True), flush=True)
        if all(result["code"] == 0 for result in before):
            print("Existing runner controls pass; no AppArmor profile was loaded", flush=True)
            return
        for result in before:
            require(result["code"] == 0 or "bwrap:" in result["output"] and "Operation not permitted" in result["output"],
                    "Preflight failed for a reason outside the observed bwrap permission failure")
        try:
            loader.begin()
            after = controls(scratch, after=True)
            after_sibling = sibling()
            require(restrictions() == state["restrictions"], "Global userns restriction changed")
            require(before_sibling == after_sibling, "Unrelated process restriction changed")
            print(json.dumps({"stage": "after", "profile": PROFILE_NAME, "unrelatedProcess": after_sibling,
                              "restrictions": restrictions(), "controls": after}, sort_keys=True), flush=True)
            require(all(result["code"] == 0 for result in after), "Post-profile strict, Workers, nested or label controls failed")
        except BaseException:
            loader.rollback()
            raise
        print("CI-only profile retained for this disposable runner; kernel controls passed as the ordinary operator", flush=True)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--default-probe"]:
            default_probe()
        elif len(sys.argv) == 5 and sys.argv[1] in ("--nested-probe", "--strict-leaf", "--workers-leaf"):
            result = inside(*sys.argv[1:])
            if result is not None:
                print(result.stdout, end="", flush=True)
        else:
            require(len(sys.argv) == 1, "This CI-only provisioner accepts no public arguments")
            provision()
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError) as error:
        print(f"CI AppArmor preflight failed: {error}", file=sys.stderr)
        sys.exit(1)
