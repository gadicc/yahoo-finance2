#!/usr/bin/env python3
"""Sequential offline benchmark. Install dependencies separately before running.
Example: python3 tests/migration/benchmark.py --deno-root /path/to/baseline
  --vitest-root /path/to/vitest --node-root /path/to/node --bun-root /path/to/bun
"""
import argparse, hashlib, json, os, pathlib, platform, statistics, subprocess, sys, time
p = argparse.ArgumentParser()
for candidate in ("deno", "vitest", "node", "bun"): p.add_argument("--"+candidate+"-root", required=True)
p.add_argument("--output", default=".migration-results")
p.add_argument("--samples", type=int, default=5)
p.add_argument("--candidates", nargs="+", default=["deno","vitest","node","bun"])
p.add_argument("--modes", nargs="+", default=["full","focused","coverage","typecheck"])
args=p.parse_args()
if args.samples < 5: p.error("at least five measured samples required")
roots={c:pathlib.Path(getattr(args,c+"_root")).resolve() for c in ("deno","vitest","node","bun")}
output=pathlib.Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
node=os.environ.get("YF_EXPERIMENT_NODE","node")
env={**os.environ,"FETCH_DEVEL":"","FMC_CACHE_MODE":"replay","DENO_JOBS":"4","YF_EXPERIMENT_NODE":node}
offline=roots["vitest"] / "tests/migration/offline.py"
versions={c:subprocess.check_output([node if c=="node" else c,"--version"],text=True).strip() for c in ("node","deno","bun")}
versions["vitest"]=json.loads((roots["vitest"] / "node_modules/vitest/package.json").read_text())["version"]
def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/"tests/fixtures/http").rglob("*")) if p.is_file()}
for candidate, root in roots.items():
 if candidate != "deno":
  subprocess.run([sys.executable,"tests/migration/prepare.py"],cwd=root,stdout=subprocess.DEVNULL,check=True)
  subprocess.run([sys.executable,str(offline),node,"tests/migration/guard-probe.mjs"],cwd=root,env=env,check=True)
before={c:hashes(r) for c,r in roots.items()}
if len({json.dumps(v,sort_keys=True) for v in before.values()}) != 1: raise RuntimeError("fixtures differ between candidates")
result={"versions":versions,"platform":platform.platform(),"workers":4,"samples":args.samples,"warmups":1,"results":{},"fixtureFiles":len(before["deno"]),"roots":{k:str(v) for k,v in roots.items()},"memory":"not measured: prior process-tree high-water RSS not comparable", "watch":"not measured", "coldStart":"first-run after install not measured; each matrix cell has one unmeasured warmup"}
for mode in args.modes:
 for candidate,root in roots.items():
  if candidate not in args.candidates: continue
  if candidate=="deno":
   command=[sys.executable,str(offline),"deno","test","--no-prompt","--cached-only","-P=test","--parallel","--ignore=tests/cloudflare","--deny-net","--deny-write"]
   if mode != "typecheck":command.append("--no-check")
   else: command=[sys.executable,str(offline),"deno","check","--cached-only", *sorted(str(p.relative_to(root)) for d in ("src","tests","scripts") for p in (root/d).rglob("*.test.ts") if "tests/cloudflare/" not in str(p.relative_to(root)))]
   if mode=="focused":command.append("src/modules/quote.test.ts")
   if mode=="coverage":command.append("--coverage="+str(output/"deno-coverage"))
  else:
   command=[sys.executable,"tests/migration/run.py"]
   if mode!="full":command.append({"focused":"--focus","coverage":"--coverage","typecheck":"--typecheck","typecheck-incremental":"--typecheck-incremental"}[mode])
  values=[];statuses=[]
  for i in range(args.samples+1):
   with (output/f"{candidate}-{mode}-{i}.log").open("w") as log:
    start=time.perf_counter();proc=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT);elapsed=time.perf_counter()-start
   statuses.append(proc.returncode)
   if i:values.append(elapsed)
   if proc.returncode:break
  result["results"][candidate+"-"+mode]={"command":command,"seconds":values,"exitCodes":statuses,"medianSeconds":statistics.median(values) if values else None,"minSeconds":min(values) if values else None,"maxSeconds":max(values) if values else None}
  (output/"results.json").write_text(json.dumps(result,indent=2)+"\n")
  print(candidate,mode,result["results"][candidate+"-"+mode]["medianSeconds"],statuses,flush=True)
result["fixtureHashesUnchanged"]={c:hashes(root)==before[c] for c,root in roots.items()}
(output/"results.json").write_text(json.dumps(result,indent=2)+"\n")
if not all(result["fixtureHashesUnchanged"].values()):raise RuntimeError("fixture content changed")

if any(code for cell in result["results"].values() for code in cell["exitCodes"]): raise SystemExit("benchmark cells failed; see results.json")
