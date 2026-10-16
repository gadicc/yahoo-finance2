import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { spawnSync } from "node:child_process";
import createFetchCache from "fetch-mock-cache/runtimes/node.js";
import MemoryStore from "fetch-mock-cache/stores/memory.js";
assert.equal(process.env.FMC_CACHE_MODE, "replay");
assert.equal(process.env.FETCH_DEVEL, "");
// Bun1.4.2 maps a kernel socket EPERM to ECONNREFUSED. The recorded strace
// proves both families and child exec still receive EPERM at the syscall layer.
const deniedCode = globalThis.Bun ? "ECONNREFUSED" : "EPERM";
let networkCalls = 0;
const cache = createFetchCache({
  Store: MemoryStore,
  fetch: () => {
    networkCalls++;
    return Promise.reject(new Error("must never reach network fallback"));
  },
});
cache.once({ id: "migration-intentionally-missing" });
await assert.rejects(
  cache("https://example.invalid/missing"),
  /replay|cache|fixture/i,
);
assert.equal(networkCalls, 0);
// A raw child socket check prevents Bun's errno remapping from making an
// unguarded closed-port ECONNREFUSED look like successful network denial.
const raw = spawnSync("python3", [
  "-c",
  `import errno, socket
for family in (socket.AF_INET, socket.AF_INET6):
 try:
  connection = socket.socket(family)
 except OSError as error:
  assert error.errno == errno.EPERM, error
 else:
  connection.close()
  raise RuntimeError("socket filter absent")
`,
]);
assert.equal(raw.status, 0, raw.stderr.toString());
for (const host of ["127.0.0.1", "::1"]) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 9 });
    socket.on("connect", () => {
      socket.destroy();
      reject(new Error("network guard failed"));
    });
    socket.on("error", (error) => {
      try {
        assert.equal(error.code, deniedCode);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
// The syscall filter must also survive child process exec.
const child = spawnSync(process.execPath, [
  "-e",
  `require('node:net').connect({host:'127.0.0.1',port:9}).on('error',e=>process.exit(e.code===${
    JSON.stringify(deniedCode)
  }?0:1))`,
]);
assert.equal(child.status, 0);
assert.throws(
  () =>
    fs.writeFileSync(
      "tests/fixtures/http/.migration-write-probe",
      "guard failed",
    ),
  /EACCES|EPERM|EROFS/,
);
console.log(
  JSON.stringify({
    replayMissRejected: true,
    fallbackCalls: networkCalls,
    socketDenied: true,
    rawSocketFilterVerified: true,
    observedSocketError: deniedCode,
    ipv6SocketDenied: true,
    childSocketDenied: true,
    fixtureWriteDenied: true,
  }),
);
