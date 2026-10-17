import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { brokerFetch } from "./broker.ts";
import { installCaptureSession, type CaptureSession } from "./session.ts";

// Invoked explicitly by the capture supervisor, after the unchanged guard has
// cleared inherited FETCH_DEVEL/FMC settings and denied all IP sockets.
const path = process.env.YF_CAPTURE_SESSION;
delete process.env.YF_CAPTURE_SESSION;
if (!path) throw new Error("Missing private capture session configuration");
const config = JSON.parse(readFileSync(path, "utf8")) as CaptureSession & {
  socket: string;
  token: string;
};
if (
  !["recache", "nocache", "geo-record", "geo-replay"].includes(config.mode) ||
  !Number.isFinite(config.interval) ||
  config.interval < 0 ||
  typeof config.fixtureRoot !== "string" ||
  realpathSync(config.fixtureRoot) !== resolve(config.fixtureRoot) ||
  !statSync(config.fixtureRoot).isDirectory() ||
  typeof config.socket !== "string" ||
  !/^[a-f0-9]{64}$/.test(config.token) ||
  (config.mode.startsWith("geo-") &&
    !/^[a-z]{2}-\d{8}(?:-[a-z0-9]+)*$/.test(config.profile ?? ""))
)
  throw new Error("Invalid private capture session configuration");
for (const key of Object.keys(process.env)) {
  if (key.startsWith("FETCH_DEVEL") || key.startsWith("FMC_"))
    delete process.env[key];
}
process.env.FMC_CACHE_MODE = config.mode === "geo-replay" ? "replay" : "auto";
process.env.FETCH_DEVEL = ["recache", "nocache"].includes(config.mode)
  ? config.mode
  : "";
process.env.FETCH_DEVEL_RECACHE_INTERVAL = String(config.interval);
process.env.FETCH_DEVEL_RECACHE_CONCURRENCY = "1";
if (config.profile) {
  process.env.FETCH_DEVEL_GETCRUMB_PROFILE = config.profile;
  process.env.FETCH_DEVEL_GETCRUMB_MODE =
    config.mode === "geo-record" ? "record" : "replay";
}
installCaptureSession({
  fixtureRoot: config.fixtureRoot,
  mode: config.mode,
  interval: config.interval,
  profile: config.profile,
});
globalThis.fetch =
  config.mode === "geo-replay"
    ? () => Promise.reject(new Error("Profile replay forbids network fetch"))
    : brokerFetch(config.socket, config.token);
