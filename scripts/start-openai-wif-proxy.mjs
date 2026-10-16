import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

const config = {
  requestURL: process.env.ACTIONS_ID_TOKEN_REQUEST_URL,
  requestToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  identityProviderId: process.env.OPENAI_IDENTITY_PROVIDER_ID,
  serviceAccountId: process.env.OPENAI_SERVICE_ACCOUNT_ID,
  model: process.env.SCHEMA_REPAIR_MODEL,
  gatewayToken: randomBytes(32).toString("hex"),
};
if (Object.values(config).some((value) => !value)) {
  throw new Error("Missing federation configuration");
}
const child = spawn("sudo", [
  "-n",
  "env",
  "-i",
  process.execPath,
  process.argv[2],
], {
  detached: true,
  stdio: ["pipe", "pipe", "pipe"],
});
child.stdin.end(JSON.stringify(config));
let output = "";
let diagnostic = "";
child.stderr.on(
  "data",
  (chunk) => diagnostic += chunk.toString().slice(0, 500),
);
await new Promise(/** @param {(value: void) => void} resolve */ (resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Federation startup timed out"));
  }, 90_000);
  child.on("error", () => reject(new Error("Cannot start federation proxy")));
  child.on("exit", () => {
    clearTimeout(timeout);
    const safe = diagnostic.trim();
    if (
      /^(Unexpected OIDC claim: [a-z_]+|GitHub OIDC request failed \([0-9]+\)|OpenAI token exchange failed \([0-9]+\)|Federation initialization failed)$/
        .test(safe)
    ) console.error(safe);
    reject(
      new Error(
        "Federation startup failed; check the provider/service-account mapping",
      ),
    );
  });
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.includes("\n")) {
      clearTimeout(timeout);
      resolve();
    }
  });
});
const { port } = JSON.parse(output.trim());
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid proxy port");
}
// Only the random local gateway credential is passed to codex-action. Actual
// GitHub/OpenAI credentials remain in the root process's memory, not on disk.
console.log(`::add-mask::${config.gatewayToken}`);
appendFileSync(
  /** @type {string} */ (process.env.GITHUB_OUTPUT),
  `endpoint=http://127.0.0.1:${port}/v1/responses\ngateway-token=${config.gatewayToken}\n`,
);
child.stdout.destroy();
child.stderr.destroy();
child.unref();
console.log(
  "Federation configured; proxy will renew short-lived credentials automatically.",
);
