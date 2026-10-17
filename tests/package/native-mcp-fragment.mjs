// Test adapter: fragment actual installed MCP stdout without changing its bytes.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const original = childProcess.spawn;
let fragmented = 0;
let fragmentedCookie = 0;
childProcess.spawn = new Proxy(original, {
  apply(target, context, args) {
    const child = Reflect.apply(target, context, args);
    assert(child instanceof childProcess.ChildProcess);
    if (Array.isArray(args[1]) && args[1].includes("--stdio")) {
      const cookieProbe = args[1][args[1].indexOf("--tools") + 1] === "quote";
      const stdout = child.stdout;
      assert(stdout, "MCP stdout must be piped");
      const emit = stdout.emit;
      let pending = true;
      let waiting = false;
      let ended = false;
      let held = Buffer.alloc(0);
      stdout.emit = new Proxy(emit, {
        apply(target, context, values) {
          const [event, ...chunks] = values;
          if (pending && event === "end") {
            ended = true;
            return true;
          }
          if (pending && event === "data") {
            held = Buffer.concat([held, Buffer.from(chunks[0])]);
            const newline = held.indexOf(10);
            if (!waiting && newline !== -1) {
              waiting = true;
              const frame = held.subarray(0, newline + 1);
              held = held.subarray(newline + 1);
              const at = Math.floor(frame.length / 2);
              assert(at > 0, "Need an actual splittable MCP response");
              console.error("NATIVE_MCP_FRAGMENT", frame.length, at);
              emit.call(stdout, "data", frame.subarray(0, at));
              setTimeout(() => {
                emit.call(stdout, "data", frame.subarray(at));
                if (held.length) emit.call(stdout, "data", held);
                pending = false;
                if (cookieProbe) fragmentedCookie++;
                else fragmented++;
                if (ended) emit.call(stdout, "end");
              }, 100);
            }
            return true;
          }
          return Reflect.apply(target, context, values);
        },
      });
    }
    return child;
  },
});
syncBuiltinESMExports();
process.once("exit", (code) => {
  if (code === 0) {
    assert.equal(fragmented, process.platform === "win32" ? 2 : 3);
    assert.equal(fragmentedCookie, 1);
  }
});
