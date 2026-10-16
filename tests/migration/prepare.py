#!/usr/bin/env python3
"""Make disposable worktree fixtures read-only and fingerprint their contents."""
import hashlib, json, pathlib
root = pathlib.Path("tests/fixtures/http")
result = {}
for path in sorted(root.rglob("*")):
    if path.is_file():
        result[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
        path.chmod(0o444)
    elif path.is_dir(): path.chmod(0o555)
root.chmod(0o555)
print(json.dumps(result, sort_keys=True))
