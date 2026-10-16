#!/usr/bin/env python3
"""Measure three persistent touch-to-summary reruns of queue.test.ts.
No content changes; terminate the entire watcher process group after each runtime.
"""
import argparse, json, os, pathlib, re, selectors, signal, statistics, subprocess, sys, time
p=argparse.ArgumentParser()
for c in ("deno","vitest","node","bun"):p.add_argument("--"+c+"-root",required=True)
p.add_argument("--output",default=".migration-results/watch")
p.add_argument("--candidates", nargs="+", default=["deno","vitest","node","bun"])
p.add_argument("--content-change", action="store_true")
a=p.parse_args();out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
roots={c:pathlib.Path(getattr(a,c+"_root")).resolve() for c in ("deno","vitest","node","bun")}
node=os.environ.get("YF_EXPERIMENT_NODE","node");offline=roots["vitest"]/"tests/migration/offline.py"
commands={
"deno":["deno","test","--no-prompt","--cached-only","--no-check","-P=test","--deny-net","--deny-write","--watch","--no-clear-screen","src/lib/queue.test.ts"],
"vitest":[node,"node_modules/vitest/vitest.mjs","watch","src/lib/queue.test.ts","--reporter=default","--no-clearScreen"],
"node":[node,"--import","tsx","--test","--watch","--test-reporter=tap","src/lib/queue.test.ts"],
"bun":["bun","test","--watch","src/lib/queue.test.ts"]}
patterns={"deno":r"ok \| 1 passed", "vitest":r"Duration\s", "node":r"# duration_ms", "bun":r"Ran 5 tests"}
result={}
for c,root in roots.items():
 if c not in a.candidates:continue
 command=[sys.executable,str(offline),*commands[c]]
 proc=subprocess.Popen(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,env={**os.environ,"NO_COLOR":"1","DENO_JOBS":"4"})
 target=root/"src/lib/queue.test.ts";original=target.read_bytes();stat=target.stat();log=bytearray();selector=selectors.DefaultSelector();selector.register(proc.stdout,selectors.EVENT_READ)
 def summary(timeout=30):
  buffer="";deadline=time.monotonic()+timeout
  while time.monotonic()<deadline:
   if proc.poll() is not None: raise RuntimeError(f"watcher exited {proc.returncode}")
   for key,_ in selector.select(0.1):
    chunk=os.read(key.fd,65536)
    if not chunk:continue
    log.extend(chunk);buffer+=chunk.decode(errors="replace")
    buffer=re.sub(r"\x1b\[[0-9;]*[a-zA-Z]","",buffer)
    if re.search(patterns[c],buffer):
     success={"deno":r"0 failed", "vitest":r"Tests\s+5 passed", "node":r"# fail 0", "bun":r"0 fail"}[c]
     if not re.search(success,buffer):raise RuntimeError("completed watch run lacks the successful five-test summary")
     return
  raise RuntimeError("no recognized completed-run summary within30s")
 try:
  summary();samples=[]
  # Watcher file subscriptions settle after initial completion.
  time.sleep(0.3)
  for i in range(3):
   start=time.perf_counter();
   if a.content_change:target.write_bytes(original+b"\n"*(i+1))
   else:os.utime(target,None)
   summary();samples.append(time.perf_counter()-start);time.sleep(0.2)
  result[c]={"seconds":samples,"medianSeconds":statistics.median(samples),"status":"passed","trigger":"whitespace-only content change" if a.content_change else "mtime only","command":command}
 except Exception as error:result[c]={"status":"unavailable","error":str(error),"command":command}
 finally:
  os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
  if target.read_bytes()!=original:target.write_bytes(original)
  os.utime(target,ns=(stat.st_atime_ns,stat.st_mtime_ns));selector.close();(out/f"{c}.log").write_bytes(log)
 (out/"results.json").write_text(json.dumps(result,indent=2)+"\n")
 print(c,result[c],flush=True)
