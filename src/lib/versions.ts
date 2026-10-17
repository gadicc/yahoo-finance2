import pkg from "../../deno.json" with { type: "json" };

let latestVersion: string | null = null;
export async function getLatestVersion(): Promise<string> {
  if (latestVersion) return latestVersion;

  const response = await fetch(
    `https://registry.npmjs.org/yahoo-finance2/latest`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch latest version");
  }

  const latestPkgJson = await response.json();
  latestVersion = latestPkgJson.version as string;

  return latestVersion;
}

interface VersionCheckResult {
  current: string;
  latest: string;
  isLatest: boolean;
}

let versionCheckResult: null | VersionCheckResult = null;
export async function versionCheck() {
  if (versionCheckResult) return versionCheckResult;

  const latestVersion = await getLatestVersion();

  versionCheckResult = {
    current: pkg.version,
    latest: latestVersion,
    isLatest: latestVersion === pkg.version,
  };
  return versionCheckResult;
}

export function _clearCache() {
  latestVersion = null;
  versionCheckResult = null;
}
