#!/usr/bin/env python3
"""Prove the options overload assertions are checked rather than transpiled."""
import os, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parents[2];os.chdir(root)
source=root/"src/modules/options.type.test.ts"
negative=source.with_name("options.migration-negative.type.test.ts")
if negative.exists():raise RuntimeError("negative control file already exists")
try:
 negative.write_text(source.read_text().replace("@ts-expect-error", "@removed-expect-error"))
 result=subprocess.run([sys.executable,"tests/migration/offline.py",os.environ.get("YF_EXPERIMENT_NODE","node"),"node_modules/typescript/bin/tsc","-p","tsconfig.migration.json"],capture_output=True,text=True)
 print(result.stdout,result.stderr,sep="")
 if result.returncode==0 or "options.migration-negative.type.test.ts" not in result.stdout or "TS2322" not in result.stdout:
  raise RuntimeError("options overload negative control did not produce its expected assignment errors")
 print("PASS: removing options overload error directives produces TypeScript assignment errors")
finally:negative.unlink(missing_ok=True)
