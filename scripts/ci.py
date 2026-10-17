#!/usr/bin/env python3
"""Maintained CI controls. Registry installation is separate from offline execution."""
import argparse
import ctypes
import errno
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MAX_COUNT = 2**53 - 1
HARNESS = (".npmrc", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "worker.ts", "worker.test.ts")
REQUIRED_SOURCES = {
    "bin/yahoo-finance.ts", "bin/yahoo-finance-mcp.ts", "scripts/test.ts",
    "scripts/schema-gen.ts", "scripts/typecheck.ts", "scripts/build_npm.ts",
    "scripts/workflow-policy.mjs", "src/index.ts", "src/createYahooFinance.ts",
    "src/lib/runtime-detect.ts", "src/mcp/http.ts", "src/mcp/server.ts",
    "src/modules/chart.ts", "src/modules/historical.ts", "src/modules/quote.ts",
    "src/modules/quoteSummary.ts", "tests/common.ts",
}


def run(command, *, cwd=ROOT, env=None):
    print("+ " + " ".join(map(str, command)), flush=True)
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


def regular(path):
    if path.is_symlink() or not path.is_file() or path.resolve() != path.absolute():
        raise ValueError(f"Expected canonical regular file: {path}")
    return path


def validate_lcov(root, path, required=None, *, merged_lines=False):
    root = root.resolve(strict=True)
    if required is None:
        # Pure type exports do not emit executable coverage. All runtime exports do.
        type_only = {"src/lib/moduleCommon.ts"}
        exports = json.loads((root / "deno.json").read_text())["exports"]
        required = REQUIRED_SOURCES | {value.removeprefix("./") for value in exports.values()} - type_only
    regular(path)
    records = path.read_text().split("end_of_record")
    if records.pop().strip():
        raise ValueError("LCOV has an unterminated record")
    sources = set()
    totals = {"lines": 0, "linesHit": 0, "functions": 0, "functionsHit": 0}
    for record in records:
        fields = record.strip().splitlines()
        source = [line[3:] for line in fields if line.startswith("SF:")]
        if len(source) != 1:
            raise ValueError("LCOV record must have one source")
        name = source[0]
        parts = name.split("/")
        if (not name or "\\" in name or any(part in ("", ".", "..") for part in parts)
                or Path(name).is_absolute() or name in sources):
            raise ValueError(f"LCOV source is duplicate or noncanonical: {name}")
        if (parts[0] not in ("src", "scripts", "tests", "bin") and name != "release.config.mjs"
                or any(part in ("node_modules", "fixtures", "results", "cloudflare") for part in parts)
                or name.endswith((".test.ts", ".schema.json"))):
            raise ValueError(f"Unexpected LCOV source: {name}")
        source_path = regular(root / name)
        lines = source_path.read_text().splitlines()
        seen_lines = set()
        functions = {}
        line_totals = {}
        for field in fields:
            if field.startswith("DA:"):
                match = re.fullmatch(r"DA:([1-9][0-9]*),([0-9]+)", field)
                if not match:
                    raise ValueError(f"Malformed line coverage: {field}")
                line, count = map(int, match.groups())
                if line > len(lines) or line in seen_lines or count > MAX_COUNT:
                    raise ValueError(f"Invalid/duplicate mapped line in {name}: {line}")
                seen_lines.add(line)
                totals["lines"] += 1
                totals["linesHit"] += int(count > 0)
            elif field.startswith(("LF:", "LH:")):
                key, count = field.split(":")
                if key in line_totals or not count.isascii() or not count.isdecimal() or int(count) > MAX_COUNT:
                    raise ValueError("Malformed line totals")
                line_totals[key] = int(count)
            elif field.startswith(("FNF:", "FNH:")):
                if merged_lines:
                    raise ValueError("Merged line coverage must not contain function fields")
                key, count = field.split(":")
                if key in functions or not count.isascii() or not count.isdecimal() or int(count) > MAX_COUNT:
                    raise ValueError("Malformed function totals")
                functions[key] = int(count)
            elif field != "TN:" and field != "SF:" + name:
                raise ValueError(f"Unexpected native Bun LCOV field: {field}")
        if not seen_lines or (not merged_lines and
                (set(functions) != {"FNF", "FNH"} or functions["FNH"] > functions["FNF"])):
            raise ValueError(f"Incomplete {'merged line' if merged_lines else 'native Bun'} coverage record: {name}")
        hits = sum(int(field.split(",")[1]) > 0 for field in fields if field.startswith("DA:"))
        if line_totals != {"LF": len(seen_lines), "LH": hits}:
            raise ValueError(f"Inconsistent line totals: {name}")
        if not merged_lines:
            totals["functions"] += functions["FNF"]
            totals["functionsHit"] += functions["FNH"]
        if any(count > MAX_COUNT for count in totals.values()):
            raise ValueError("LCOV total exceeds safe integer range")
        sources.add(name)
    if not sources or not required <= sources:
        raise ValueError(f"Incomplete full-suite coverage, missing: {sorted(required - sources)}")
    if merged_lines:
        totals.update(functions=None, functionsHit=None,
                      functionsUnavailable="Bun batch function identities are unavailable; aggregate function coverage cannot be reconstructed")
    return {"sources": len(sources), **totals, "branches": "not emitted by Bun 1.4.3"}


def merge_lcov(root, inputs, output):
    """Merge validated Bun line records; aggregate function identity is unavailable."""
    merged = {}
    for path in inputs:
        validate_lcov(root, Path(path), set())
        for raw in Path(path).read_text().split("end_of_record")[:-1]:
            fields = raw.strip().splitlines()
            name = next(field[3:] for field in fields if field.startswith("SF:"))
            lines = {int(field[3:].split(",")[0]): int(field.split(",")[1]) for field in fields if field.startswith("DA:")}
            totals = merged.setdefault(name, {})
            for line, count in lines.items():
                total = totals.get(line, 0) + count
                if total > MAX_COUNT:
                    raise ValueError("Merged LCOV count overflow")
                totals[line] = total
    if not merged:
        raise ValueError("No instrumented source coverage to merge")
    records = []
    for name, lines in sorted(merged.items()):
        records.extend(["TN:", "SF:" + name])
        records.extend(f"DA:{line},{count}" for line, count in sorted(lines.items()))
        records.extend([f"LF:{len(lines)}", f"LH:{sum(count > 0 for count in lines.values())}", "end_of_record"])
    with Path(output).open("x") as stream:
        stream.write("\n".join(records) + "\n")
    validate_lcov(root, Path(output), set(), merged_lines=True)


def guard_inside(root, scratch, host_namespace):
    if os.readlink("/proc/self/ns/net") == host_namespace:
        raise ValueError("Strict replay retained host network namespace")
    for family in (socket.AF_UNIX, socket.AF_INET, socket.AF_INET6, 40):
        try:
            socket.socket(family)
        except OSError as error:
            if error.errno != errno.EPERM:
                raise
        else:
            raise ValueError("Strict replay allowed a Unix/IP/VSOCK socket")
    lib = ctypes.CDLL(None, use_errno=True)
    # Linux io_uring_setup is syscall 425 on supported CI Linux x64.
    if lib.syscall(425, 1, 0) != -1 or ctypes.get_errno() != errno.EPERM:
        raise ValueError("Strict replay allowed io_uring_setup")
    for directory in (Path(root), Path(root) / "tests/fixtures/http"):
        try:
            descriptor = os.open(directory / ".yf-ci-write-probe", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except OSError as error:
            if error.errno != errno.EROFS:
                raise
        else:
            os.close(descriptor)
            raise ValueError("Strict replay allowed repository/fixture writes")
    sentinel = Path(scratch) / "strict-probe"
    sentinel.write_text("scratch-only")
    sentinel.unlink()
    if os.environ.get("FETCH_DEVEL") != "" or os.environ.get("FMC_CACHE_MODE") != "replay" or "FMC_PROBE" in os.environ:
        raise ValueError("Strict replay inherited live/capture controls")
    # A child must inherit the independent syscall and mount boundaries.
    run([sys.executable, "-c", "import socket,errno;\ntry: socket.socket()\nexcept OSError as e: assert e.errno==errno.EPERM\nelse: raise AssertionError('child IP socket allowed')"])
    print("Strict offline kernel controls passed", flush=True)


def strict(scratch, command):
    return [sys.executable, ROOT / "scripts/testing/offline.py", ROOT, scratch, "--", *command]


def guard():
    with tempfile.TemporaryDirectory(prefix="yf-ci-guard-") as value:
        scratch = Path(value).resolve()
        environment = {**os.environ, "FETCH_DEVEL": "recache", "FMC_CACHE_MODE": "auto", "FMC_PROBE": "clear-me"}
        run(strict(scratch, [sys.executable, Path(__file__).resolve(), "--guard-inside", ROOT, scratch, os.readlink("/proc/self/ns/net")]), env=environment)


def stage_harness(root, scratch):
    destination = scratch / "tests/cloudflare"
    destination.mkdir(parents=True)
    for name in HARNESS:
        shutil.copyfile(regular(root / "tests/cloudflare" / name), destination / name)
    return destination


def workers(bun, node, npm):
    bun, node, npm = [regular(Path(value).absolute()) for value in (bun, node, npm)]
    for command, expected in (([bun, "--version"], "1.4.3"), ([node, "--version"], "v24.21.0"), ([node, npm, "--version"], "10.9.9")):
        actual = subprocess.check_output(list(map(str, command)), text=True).strip()
        if actual != expected:
            raise ValueError(f"Unexpected tool version: {actual}, expected {expected}")
    # tempfile supplies owner-only mode 0700 and cleanup on failure. No checkout output.
    with tempfile.TemporaryDirectory(prefix="yf-ci-workers-") as value:
        scratch = Path(value).resolve()
        run(strict(scratch, [bun, "scripts/build_npm.ts", "--out-dir", scratch / "npm"]))
        harness = stage_harness(ROOT, scratch)
        environment = {**os.environ, "PATH": str(node.parent) + ":/usr/bin:/bin"}
        # Registry-enabled installation uses the independent lock and normal hooks.
        run([node, npm, "ci", "--foreground-scripts"], cwd=harness, env=environment)
        installed = harness / "node_modules/yahoo-finance2"
        if installed.is_symlink() or not installed.is_dir():
            raise ValueError("Workers require a real installed package, not a repository link")
        run(strict(scratch, [node, harness / "node_modules/typescript/bin/tsc", "-p", harness / "tsconfig.json"]))
        run([sys.executable, ROOT / "scripts/testing/workers-loopback-probe.py", ROOT, scratch])
        run([sys.executable, ROOT / "scripts/testing/workers-loopback.py", ROOT, scratch, harness, "--", node, npm, "test", "--", "--reporter=verbose"])


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--guard-inside":
        guard_inside(*sys.argv[2:])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="mode", required=True)
    commands.add_parser("guard")
    commands.add_parser("coverage")
    merge = commands.add_parser("merge-coverage")
    merge.add_argument("root", type=Path)
    merge.add_argument("output", type=Path)
    merge.add_argument("inputs", nargs="+", type=Path)
    worker = commands.add_parser("workers")
    for tool in ("bun", "node", "npm"):
        worker.add_argument("--" + tool, required=True)
    args = parser.parse_args()
    if args.mode == "guard":
        guard()
    elif args.mode == "merge-coverage":
        merge_lcov(args.root, args.inputs, args.output)
    elif args.mode == "coverage":
        print(json.dumps(validate_lcov(ROOT, ROOT / "coverage/lcov.info", merged_lines=True), sort_keys=True))
    else:
        workers(args.bun, args.node, args.npm)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"CI control failed: {error}", file=sys.stderr)
        sys.exit(1)
