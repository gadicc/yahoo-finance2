#!/usr/bin/env python3
"""Positive/negative kernel controls for the Workers-only loopback sandbox."""
import errno
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import uuid


def inside(root, scratch, host_namespace, inherited_fd):
    try:
        os.fstat(inherited_fd)
    except OSError as error:
        assert error.errno == errno.EBADF
    else:
        raise AssertionError("Writable inherited descriptor survived the sandbox")
    for key in ("CLOUDFLARE_API_TOKEN", "AWS_SECRET_ACCESS_KEY", "HTTP_PROXY", "FMC_PROBE"):
        assert key not in os.environ, key
    assert os.environ["FETCH_DEVEL"] == ""
    assert os.environ["FMC_CACHE_MODE"] == "replay"
    assert os.readlink("/proc/self/ns/net") != host_namespace
    assert [name for _, name in socket.if_nameindex()] == ["lo"]
    status = dict(line.split(":", 1) for line in pathlib.Path("/proc/self/status").read_text().splitlines() if ":" in line)
    assert all(int(status[key].strip(), 16) == 0 for key in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"))
    assert status["NoNewPrivs"].strip() == "1"
    denied = subprocess.run(["/usr/bin/ip", "link", "set", "lo", "down"], text=True, capture_output=True)
    assert denied.returncode != 0 and "Operation not permitted" in denied.stderr
    readonly = pathlib.Path(root) / (".yf-workers-readonly-probe-" + uuid.uuid4().hex)
    try:
        descriptor = os.open(readonly, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except OSError as error:
        assert error.errno == errno.EROFS
    else:
        os.close(descriptor)
        readonly.unlink()
        raise AssertionError("Repository was writable")
    writable = pathlib.Path(scratch) / "loopback-scratch-write"
    writable.write_text("scratch-only")
    assert writable.read_text() == "scratch-only"
    writable.unlink()
    private_socket = pathlib.Path(scratch) / "private-worker.sock"
    with socket.socket(socket.AF_UNIX) as listener, socket.socket(socket.AF_UNIX) as client:
        listener.bind(str(private_socket)); listener.listen(1)
        client.connect(str(private_socket)); client.sendall(b"private-unix")
        with listener.accept()[0] as connection:
            assert connection.recv(64) == b"private-unix"
            connection.sendall(b"private-reply")
        assert client.recv(64) == b"private-reply"
    private_socket.unlink()
    loopbacks = []
    for family, address in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        with socket.socket(family, socket.SOCK_STREAM) as listener:
            listener.bind((address, 0))
            listener.listen(1)
            listener.settimeout(5)
            port = listener.getsockname()[1]
            child_code = "import socket,sys; s=socket.socket(int(sys.argv[1])); s.connect((sys.argv[2],int(sys.argv[3]))); s.sendall(b'child-loopback'); assert s.recv(64)==b'parent-loopback'"
            child = subprocess.Popen([sys.executable, "-c", child_code, str(family), address, str(port)])
            try:
                with listener.accept()[0] as connection:
                    assert connection.recv(64) == b"child-loopback"
                    connection.sendall(b"parent-loopback")
                assert child.wait(timeout=5) == 0
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait()
            loopbacks.append(address)
    external = {}
    for family, address in ((socket.AF_INET, "192.0.2.1"), (socket.AF_INET6, "2001:db8::1")):
        with socket.socket(family, socket.SOCK_DGRAM) as connection:
            try:
                connection.connect((address, 443))
            except OSError as error:
                assert error.errno == errno.ENETUNREACH
                external[address] = errno.errorcode[error.errno]
            else:
                raise AssertionError("External route survived namespace isolation")
    print(json.dumps({"loopbackRoundTrips": loopbacks, "externalDenied": external,
                      "readOnlyRepository": True, "scratchWrites": True,
                      "inheritedFdClosed": True, "minimalEnvironment": True, "privateUnixRoundTrip": True,
                      "capabilitiesZero": True, "networkReconfigurationDenied": True,
                      "state": json.loads(os.environ["YF_WORKERS_SANDBOX_STATE"])}))


def inode_and_ipc_controls(root, scratch, helper):
    def launch(code, *arguments):
        return subprocess.run([sys.executable, str(helper), str(root), str(scratch), str(scratch),
                               "--", sys.executable, "-c", code, *map(str, arguments)],
                              text=True, capture_output=True, timeout=15)

    marker = scratch / "hardlink-workload-must-not-run"
    rejected = []
    with tempfile.TemporaryDirectory(prefix="yf-workers-host-boundary-") as outside_name:
        outside = pathlib.Path(outside_name)
        for kind in ("regular", "symlink", "fifo", "socket"):
            source = outside / kind
            listener = None
            if kind == "regular":
                source.write_text("outside-original")
            elif kind == "symlink":
                source.symlink_to(outside / "absent-target")
            elif kind == "fifo":
                os.mkfifo(source)
            else:
                listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                listener.bind(str(source))
            alias = scratch / ("outside-hardlink-" + kind)
            try:
                os.link(source, alias, follow_symlinks=False)
                result = launch("import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('ran'); pathlib.Path(sys.argv[2]).write_text('mutated')", marker, alias)
                assert result.returncode == 2 and "hardlink" in result.stderr, result.stderr
                assert not marker.exists()
                if kind == "regular":
                    assert source.read_text() == "outside-original"
                rejected.append(kind)
            finally:
                alias.unlink(missing_ok=True)
                if listener is not None:
                    listener.close()
        with tempfile.TemporaryDirectory(dir=scratch, prefix="internal-hardlinks-") as inner_name:
            first = pathlib.Path(inner_name) / "first"
            second = pathlib.Path(inner_name) / "second"
            first.write_text("inside-original")
            os.link(first, second)
            result = launch("import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('inside-updated'); assert pathlib.Path(sys.argv[2]).read_text()=='inside-updated'", first, second)
            assert result.returncode == 0, result.stderr
        # A private IP network namespace does not hide pathname AF_UNIX sockets
        # on the visible host filesystem. Exercise only our own disposable socket.
        socket_path = outside / "host-ipc.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(str(socket_path))
            listener.listen(1)
            listener.settimeout(.1)
            result = launch("import socket,sys,errno; s=socket.socket(socket.AF_UNIX);\ntry:s.connect(sys.argv[1])\nexcept OSError as e:assert e.errno==errno.ENOENT\nelse:raise AssertionError('host temporary socket visible')", socket_path)
            assert result.returncode == 0, result.stderr
            try:
                listener.accept()
            except socket.timeout:
                pass
            else:
                raise AssertionError("Masked host sentinel accepted a connection")
    return {"externalHardlinkClassesRejectedBeforeWorkload": rejected,
            "outsideRegularFileUnmodified": True, "whollyInternalHardlinksWritable": True,
            "ownHostTemporaryUnixSocketMasked": True,
            "hostIpcIsolationClaimed": False}


def main():
    if sys.argv[1:2] == ["--inside"]:
        inside(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]))
        return
    if len(sys.argv) != 3:
        raise RuntimeError("Usage: workers-loopback-probe.py ROOT SCRATCH")
    root = pathlib.Path(sys.argv[1]).resolve(strict=True)
    scratch = pathlib.Path(sys.argv[2]).resolve(strict=True)
    helper = pathlib.Path(__file__).with_name("workers-loopback.py").resolve()
    command = [sys.executable, str(helper), str(root), str(scratch), str(scratch), "--",
               sys.executable, str(pathlib.Path(__file__).resolve()), "--inside", str(root),
               str(scratch), os.readlink("/proc/self/ns/net")]
    inherited = scratch / "inherited-writable-fd"
    descriptor = os.open(inherited, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    environment = os.environ.copy()
    environment.update({"CLOUDFLARE_API_TOKEN": "probe-secret", "AWS_SECRET_ACCESS_KEY": "probe-secret",
                        "HTTP_PROXY": "http://192.0.2.1:9999", "FETCH_DEVEL": "recache", "FMC_PROBE": "capture"})
    try:
        positive = subprocess.run(command + [str(descriptor)], env=environment, pass_fds=(descriptor,),
                                  text=True, capture_output=True, timeout=30)
    finally:
        os.close(descriptor)
    assert positive.returncode == 0, positive.stderr
    assert inherited.read_bytes() == b""
    inherited.unlink()
    no_fallback = scratch / "must-not-run"
    workload = [sys.executable, "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('bypass')", str(no_fallback)]
    bare = [sys.executable, str(helper), str(root), str(scratch), str(scratch), "--", *workload]
    missing = subprocess.run(bare, env={"PATH": "/nonexistent"}, text=True, capture_output=True, timeout=10)
    assert missing.returncode == 2 and "requires" in missing.stderr
    overlap = subprocess.run([sys.executable, str(helper), str(root), str(root), str(root), "--", *workload],
                             text=True, capture_output=True, timeout=10)
    assert overlap.returncode == 2 and "non-overlapping" in overlap.stderr
    with tempfile.TemporaryDirectory(prefix="yf-workers-root-policy-") as policy_name:
        policy = pathlib.Path(policy_name)
        public = policy / "nonprivate"
        public.mkdir(mode=0o755)
        private = subprocess.run([sys.executable, str(helper), str(root), str(public), str(public), "--", *workload],
                                 text=True, capture_output=True, timeout=10)
        assert private.returncode == 2 and "private (mode 0700)" in private.stderr
        alias = policy / "scratch-alias"
        alias.symlink_to(scratch, target_is_directory=True)
        canonical = subprocess.run([sys.executable, str(helper), str(root), str(alias), str(scratch), "--", *workload],
                                   text=True, capture_output=True, timeout=10)
        assert canonical.returncode == 2 and "canonical" in canonical.stderr
    strict = subprocess.run([sys.executable, str(root / "scripts/testing/offline.py"), str(root), str(scratch), "--", *bare],
                            text=True, capture_output=True, timeout=15)
    assert strict.returncode == 2 and "Operation not permitted" in strict.stderr
    assert not no_fallback.exists()
    boundaries = inode_and_ipc_controls(root, scratch, helper)
    receipt = {"positive": json.loads(positive.stdout),
               "negative": {"missingPrerequisiteFailsClosed": missing.returncode,
                            "overlappingRootsRejected": overlap.returncode,
                            "nonPrivateScratchRejected": private.returncode,
                            "scratchSymlinkAliasRejected": canonical.returncode,
                            "strictOfflineGuardCannotBeWeakened": strict.returncode,
                            "workloadNeverRanOnFailure": True},
               "filesystemAndIpcBoundary": boundaries}
    (scratch / "loopback-probe.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
