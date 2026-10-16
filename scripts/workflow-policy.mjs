import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import releaseConfig from "../release.config.mjs";

const maintenancePattern = "+([0-9])?(.{+([0-9]),x}).x";
const maintenanceBranch = /^[0-9]+(?:\.(?:[0-9]+|x))?\.x$/;

function isLiteralBranchName(name) {
  return typeof name === "string" && name.length > 0 && name !== "@" &&
    !/[~^:?*\\[\]{}()!]/u.test(name) &&
    [...name].every((char) =>
      char.charCodeAt(0) > 0x20 && char.charCodeAt(0) !== 0x7f
    ) &&
    !name.includes("..") && !name.includes("//") &&
    !name.endsWith(".") &&
    name.split("/").every((part) =>
      part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock")
    );
}

/**
 * Accept full branch refs only. Release names come from semantic-release's
 * config; the one supported glob is its existing maintenance-branch pattern.
 * Any unsupported config entry invalidates the whole release allowlist.
 *
 * @param {unknown} kind
 * @param {unknown} ref
 * @param {unknown} branches
 * @returns {boolean}
 */
export function isAllowedWorkflowRef(
  kind,
  ref,
  branches = releaseConfig.branches,
) {
  if (typeof ref !== "string" || !ref.startsWith("refs/heads/")) return false;
  const branch = ref.slice("refs/heads/".length);
  if (kind === "recache") return branch === "dev";
  if (kind !== "release" || !isLiteralBranchName(branch)) return false;
  if (!Array.isArray(branches) || branches.length === 0) return false;

  const names = branches.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.hasOwn(entry, "name") ? entry.name : undefined;
    }
    return undefined;
  });
  if (
    names.some((name) =>
      name !== maintenancePattern && !isLiteralBranchName(name)
    )
  ) return false;

  return names.some((name) =>
    name === maintenancePattern
      ? maintenanceBranch.test(branch)
      : name === branch
  );
}

function run() {
  if (
    process.argv.length !== 3 ||
    !isAllowedWorkflowRef(process.argv[2], process.env.GITHUB_REF)
  ) {
    console.error(
      "::error::Workflow policy rejected this workflow kind or ref.",
    );
    process.exitCode = 1;
    return;
  }
  try {
    if (!process.env.GITHUB_OUTPUT) throw new Error();
    appendFileSync(process.env.GITHUB_OUTPUT, "allowed=true\n");
  } catch {
    console.error(
      "::error::Workflow policy could not write its GitHub output.",
    );
    process.exitCode = 1;
  }
}

// Deno tests import the predicate without accessing Node argv or environment.
if (
  typeof Deno === "undefined" && process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) run();
