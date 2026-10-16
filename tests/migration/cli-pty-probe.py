#!/usr/bin/env python3
"""Linux source CLI PTY/pipe control; run through the offline launcher.

python3 tests/migration/offline.py python3 tests/migration/cli-pty-probe.py /absolute/path/to/bun
"""
import errno
import json
import os
import pathlib
import pty
import re
import select
import subprocess
import sys
import tempfile
import time

root = pathlib.Path(__file__).resolve().parents[2]
bun = sys.argv[1]
with tempfile.TemporaryDirectory(prefix="yf-cli-pty-", dir=os.environ.get("TMPDIR")) as directory:
    driver = pathlib.Path(directory) / "driver.mjs"
    driver.write_text(
        "import {mainCli} from "
        + json.dumps((root / "bin/yahoo-finance.ts").as_uri())
        + ';process.exitCode=await mainCli(["quote","AAPL"],'
        + '{createClient:()=>({quote:()=>({tty:!!process.stdout.isTTY,symbol:"PTY-CONTROL"})})});'
    )
    environment = os.environ.copy()
    environment.pop("HOME", None)
    pipe = subprocess.run(
        [bun, str(driver)], cwd=directory, env=environment,
        capture_output=True, text=True, timeout=8,
    )
    assert pipe.returncode == 0
    assert json.loads(pipe.stdout) == {"tty": False, "symbol": "PTY-CONTROL"}
    assert pipe.stderr == ""

    master, slave = pty.openpty()
    child = None
    try:
        try:
            child = subprocess.Popen(
                [bun, str(driver)], cwd=directory, env=environment,
                stdin=subprocess.DEVNULL, stdout=slave, stderr=subprocess.PIPE,
            )
        finally:
            os.close(slave)
        output = b""
        deadline = time.monotonic() + 8
        while True:
            if time.monotonic() > deadline:
                raise RuntimeError("PTY child timed out")
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                output += chunk
            elif child.poll() is not None:
                break
        status = child.wait(timeout=5)
        stderr = child.stderr.read().decode()
        text = re.sub(r"\x1b\[[0-9;]*m", "", output.decode())
        assert status == 0 and stderr == ""
        assert re.search(r"tty:\s*true", text) and "PTY-CONTROL" in text
        print(json.dumps({
            "pipeExitCode": pipe.returncode,
            "pipeJSON": json.loads(pipe.stdout),
            "ptyExitCode": status,
            "ptyDetectedByDefaultBridge": True,
            "ptyUsesInspection": True,
            "stderrEmpty": True,
            "scope": "Linux PTY under inherited seccomp; controlled fakeclient, no Yahoo",
        }))
    finally:
        os.close(master)
        if child is not None and child.poll() is None:
            child.kill()
            child.wait()
