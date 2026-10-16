import { nativeEnvironment } from "./native.ts";

// Install before test imports. Test-controlled fetch stubs remain writable.
const environment = nativeEnvironment(process.env, process.env.TMPDIR ?? "");
for (const key of Object.keys(process.env)) {
  const upper = key.toUpperCase();
  if (upper.startsWith("FETCH_DEVEL") || upper.startsWith("FMC_")) {
    delete process.env[key];
  }
}
process.env.FETCH_DEVEL = environment.FETCH_DEVEL;
process.env.FMC_CACHE_MODE = environment.FMC_CACHE_MODE;
Object.defineProperty(globalThis, Symbol.for("yahoo-finance2.native-replay"), {
  value: true,
});
Object.defineProperty(
  globalThis,
  Symbol.for("yahoo-finance2.capture-session"),
  {
    value: undefined,
  },
);
globalThis.fetch = () => {
  throw new Error(
    "Native replay forbids ordinary network fetch; use a cached fixture or controlled test stub",
  );
};
