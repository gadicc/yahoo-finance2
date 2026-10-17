// Trusted native probes use injected fetch; this is not a socket sandbox.
for (const name of Object.keys(process.env)) {
  if (/^(?:FMC_|FETCH_DEVEL)/i.test(name)) delete process.env[name];
}
globalThis.fetch = () => {
  throw new Error("Native platform probe requires controlled fetch");
};
