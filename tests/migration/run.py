#!/usr/bin/env python3
"""Discover the complete test inventory; shell globs never select the workload."""
import argparse, os, pathlib, subprocess, sys
parser = argparse.ArgumentParser()
parser.add_argument("--focus", action="store_true")
parser.add_argument("--coverage", action="store_true")
parser.add_argument("--typecheck", action="store_true")
parser.add_argument("--typecheck-incremental", action="store_true")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[2]
os.chdir(root)
candidate = 'node'
node = os.environ.get("YF_EXPERIMENT_NODE", "node")
files = sorted(str(p) for directory in ("src", "tests", "scripts")
  for p in pathlib.Path(directory).rglob("*.test.ts")
  if not str(p).startswith("tests/cloudflare/"))
if args.focus: files = ["src/modules/quote.test.ts"]
if args.typecheck or args.typecheck_incremental:
 command = [node, "node_modules/typescript/bin/tsc", "-p", "tsconfig.migration.json"]
 if args.typecheck_incremental:
  pathlib.Path(".migration-results").mkdir(exist_ok=True)
  command += ["--incremental", "--tsBuildInfoFile", ".migration-results/typecheck.tsbuildinfo"]
elif candidate == "vitest": command = [node, "node_modules/vitest/vitest.mjs", "run", "--reporter=dot", *(["--coverage"] if args.coverage else []), *files]
elif candidate == "node": command = [node, "--import", "tsx", "--test", "--test-concurrency=4", "--test-reporter=tap", *(["--experimental-test-coverage"] if args.coverage else []), *files]
else: command = ["bun", "test", "--parallel=4", "--dots", *(["--coverage"] if args.coverage else []), *files]
raise SystemExit(subprocess.call([sys.executable, "tests/migration/offline.py", *command]))
