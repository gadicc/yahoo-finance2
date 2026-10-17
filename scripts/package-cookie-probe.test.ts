import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectIt as test } from "../tests/helpers/runner.ts";
import { buildNpm } from "./build_npm.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

// A separate Node controller means an unhandled stream error cannot kill the
// test supervisor before it checks and, on regression, rescues the owned child.
test("native MCP probes reject real EPIPE and stream errors while closing owned children and all streams", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-cookie-pipe-"));
  const ownedPids: number[] = [];
  const failures: unknown[] = [];
  try {
    const consumer = join(scratch, "consumer");
    const modules = join(consumer, "node_modules");
    mkdirSync(modules, { recursive: true });
    const installed = join(modules, "yahoo-finance2");
    buildNpm({ outDir: installed });
    for (const name of readdirSync(join(root, "node_modules"))) {
      if (name === ".bin") continue;
      symlinkSync(join(root, "node_modules", name), join(modules, name), "dir");
    }
    mkdirSync(join(modules, ".bin"));
    const npm = realpathSync(join(root, "node_modules/.bin/npm"));
    const built = JSON.parse(
      readFileSync(join(installed, "package.json"), "utf8"),
    );
    for (const [name, target] of Object.entries(built.bin))
      symlinkSync(join(installed, String(target)), join(modules, ".bin", name));
    for (const name of [
      "package-native-cli.mjs",
      "package-cookie-probe.mjs",
      "package-cookie-fetch.mjs",
      "native-mcp-frames.mjs",
    ])
      cpSync(join(root, "tests/package", name), join(consumer, name));
    const pkg = JSON.parse(
      readFileSync(join(installed, "package.json"), "utf8"),
    );
    const childFile = join(scratch, "close-input.mjs");
    writeFileSync(
      childFile,
      `import fs from 'node:fs';
fs.writeFileSync(process.env.PROBE_PID,String(process.pid));
process.stdin.on('error',()=>{});
process.stdin.once('data',(chunk)=>{
 const request=JSON.parse(chunk.toString().split('\\n')[0]);
 if(request.method!=='initialize')throw new Error('Expected actual initialize');
 fs.writeFileSync(process.env.PROBE_INITIALIZED,'accepted');
 process.stdin.pause();
 if(process.env.PROBE_MODE==='EPIPE')fs.closeSync(0);
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{serverInfo:{version:${JSON.stringify(pkg.version)}}}})+'\\n');
});
setInterval(()=>{},1000);
`,
    );
    const controller = join(scratch, "controller.mjs");
    writeFileSync(
      controller,
      `import cp from 'node:child_process';
import{syncBuiltinESMExports}from'node:module';
const spawn=cp.spawn;let owned;let closed=false;
cp.spawn=function(executable,args,options){
 if(!args.includes('--stdio'))return spawn(executable,args,options);
 owned=spawn(executable,[process.env.PROBE_CHILD],options);
 owned.once('close',()=>{closed=true});
 if(process.env.PROBE_MODE!=='EPIPE')owned.stdout.once('data',()=>{
  const stream=owned[process.env.PROBE_MODE];
  stream.emit('error',Object.assign(new Error('controlled '+process.env.PROBE_MODE+' failure'),{code:'PROBE_STREAM_ERROR'}));
 });
 return owned;
};syncBuiltinESMExports();

const env={...process.env};for(const key of Object.keys(env))if(/^(HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|NODE_OPTIONS|BUN_OPTIONS)$/i.test(key))delete env[key];
try{
 if(process.env.PROBE_TARGET==='native'){
  process.argv=[process.execPath,process.env.PROBE_NATIVE,process.execPath,process.execPath,process.env.PROBE_NPM,process.env.PROBE_BUN,process.env.PROBE_PRELOAD,'node','full'];
  await import(process.env.PROBE_NATIVE_URL);
 }else{
  const{probeCookies}=await import(process.env.PROBE_MODULE);
  await probeCookies({root:process.env.PROBE_ROOT,installed:process.env.PROBE_INSTALLED,runtime:process.execPath,runtimeKind:'node',env,preload:process.env.PROBE_PRELOAD});
 }
 console.log(JSON.stringify({unexpectedSuccess:true}));
}catch(error){
 console.log(JSON.stringify({code:error.code,message:error.message,closed,streamsDestroyed:owned?[owned.stdin,owned.stdout,owned.stderr].map(stream=>stream.destroyed):[]}));
}
`,
    );
    for (const [target, mode] of [
      ["cookie", "EPIPE"],
      ["cookie", "stdout"],
      ["cookie", "stderr"],
      ["native", "EPIPE"],
    ]) {
      const directory = join(scratch, `${target}-${mode}`);
      mkdirSync(directory);
      const pidFile = join(directory, "child.pid");
      const initialized = join(directory, "initialized");
      const controllerResult = spawnSync("node", [controller], {
        cwd: scratch,
        env: {
          ...process.env,
          PROBE_MODE: mode,
          PROBE_TARGET: target,
          PROBE_NATIVE: join(consumer, "package-native-cli.mjs"),
          PROBE_NATIVE_URL: pathToFileURL(
            join(consumer, "package-native-cli.mjs"),
          ).href,
          PROBE_NPM: npm,
          PROBE_BUN: process.execPath,
          PROBE_CHILD: childFile,
          PROBE_PID: pidFile,
          PROBE_INITIALIZED: initialized,
          PROBE_MODULE: pathToFileURL(
            join(root, "tests/package/package-cookie-probe.mjs"),
          ).href,
          PROBE_ROOT: directory,
          PROBE_INSTALLED: installed,
          PROBE_PRELOAD: join(
            root,
            "scripts/testing/native-platform-preload.mjs",
          ),
        },
        encoding: "utf8",
        timeout: 20000,
      });
      // Read the private PID before assertions, retaining supervisor ownership
      // even when the controller crashes or fails its protocol assertions.
      const pid = Number(readFileSync(pidFile, "utf8"));
      assert(Number.isSafeInteger(pid) && pid > 1);
      ownedPids.push(pid);
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
        else throw error;
      }
      if (!alive) ownedPids.pop();
      assert.ifError(controllerResult.error);
      assert.equal(controllerResult.status, 0, controllerResult.stderr);
      assert.equal(readFileSync(initialized, "utf8"), "accepted");
      const report = JSON.parse(controllerResult.stdout);
      assert.equal(
        report.code,
        mode === "EPIPE" ? "EPIPE" : "PROBE_STREAM_ERROR",
      );
      assert.equal(report.closed, true);
      assert.deepEqual(report.streamsDestroyed, [true, true, true]);
      assert.equal(
        alive,
        false,
        "Probe left its owned child alive; supervisor must rescue it",
      );
    }
  } catch (error) {
    failures.push(error);
  } finally {
    for (const pid of ownedPids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH")
          failures.push(error);
      }
    }
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length)
    throw new AggregateError(
      failures,
      "Cookie-probe control or supervisor cleanup failed",
    );
}, 60000);
