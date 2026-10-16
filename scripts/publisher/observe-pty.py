"""Explicit Linux publisher-only stdout PTY observation, with bounded cleanup."""
import errno
import json
import os
import pty
import selectors
import signal
import subprocess
import sys
import time


def main():
    if len(sys.argv) != 4 or sys.argv[1] != "--publisher-rehearsal":
        raise ValueError("Explicit publisher boundary, Deno binary and script required")
    if not sys.platform.startswith("linux"):
        raise ValueError("This publisher PTY control is Linux-only")
    master, slave = pty.openpty()
    child = None
    data = bytearray()
    try:
        child = subprocess.Popen(
            [sys.argv[2], "run", "--cached-only", "--deny-net", "--allow-env", sys.argv[3]],
            stdin=subprocess.DEVNULL, stdout=slave, stderr=subprocess.PIPE,
            start_new_session=True,
        )
        os.close(slave)
        slave = None
        os.set_blocking(master, False)
        with selectors.DefaultSelector() as selector:
            selector.register(master, selectors.EVENT_READ)
            deadline = time.monotonic() + 15
            while True:
                if time.monotonic() >= deadline:
                    raise TimeoutError("Publisher PTY observation deadline exceeded")
                if selector.select(0.05):
                    try:
                        chunk = os.read(master, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        break
                    if not chunk:
                        break
                    data.extend(chunk)
                    if len(data) > 1024 * 1024:
                        raise ValueError("Publisher PTY observation output exceeded bound")
                elif child.poll() is not None:
                    break
        _, stderr = child.communicate(timeout=2)
        if child.returncode != 0:
            raise RuntimeError(f"Deno PTY observation exited {child.returncode}: {stderr.decode('utf8')}")
        result = json.loads(data.decode("utf8").strip())
        if result.get("terminal") is not True or result.get("runtime") != "deno":
            raise ValueError("Missing actual Deno PTY observation")
        print(json.dumps(result))
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=2)
        if slave is not None:
            os.close(slave)
        os.close(master)


if __name__ == "__main__":
    main()
