import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repositoryUrl = "https://github.com/gadicc/yahoo-finance2";
export type SourceProvenance = {
  sourceDigest: string;
} & (
  | { kind: "commit"; commit: string; repository: string }
  | { kind: "omitted"; reason: string; observedCommit?: string }
);

function sources(root: string, directory = "src"): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const entry of readdirSync(join(root, directory), {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(directory, entry.name);
    if (entry.isDirectory())
      for (const [key, value] of sources(root, file)) result.set(key, value);
    else if (entry.isFile())
      result.set(file.replaceAll("\\", "/"), readFileSync(join(root, file)));
    else
      throw new Error(
        `Refusing source provenance for a link or special file: ${file}`,
      );
  }
  return result;
}

/** Read-only Git calls ignore replacement objects, repository overrides and optional locks. */
function git(root: string, ...args: string[]): string | undefined {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const result = spawnSync(
    "git",
    [
      "--no-replace-objects",
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-C",
      root,
      ...args,
    ],
    {
      encoding: "utf8",
      env,
      shell: false,
      timeout: 1000,
      killSignal: "SIGKILL",
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  return !result.error && result.status === 0 ? result.stdout : undefined;
}

/** A commit URL is justified only by exact source bytes in the intended checkout. */
export function sourceProvenance(root: string): SourceProvenance {
  const actual = sources(root);
  const sourceDigest = createHash("sha256")
    .update(
      JSON.stringify(
        [...actual].map(([file, bytes]) => [
          file,
          createHash("sha256").update(bytes).digest("hex"),
        ]),
      ),
    )
    .digest("hex");
  const omitted = (
    reason: string,
    observedCommit?: string,
  ): SourceProvenance => ({
    kind: "omitted",
    reason,
    sourceDigest,
    ...(observedCommit ? { observedCommit } : {}),
  });
  // An archive nested in some other checkout must never inherit that checkout's HEAD.
  try {
    if (lstatSync(join(root, ".git")).isSymbolicLink())
      return omitted("linked-checkout-metadata");
  } catch {
    return omitted("no-checkout-metadata");
  }
  const top = git(root, "rev-parse", "--show-toplevel")?.trim();
  if (!top || realpathSync(top) !== realpathSync(root))
    return omitted("checkout-root-unavailable");
  const commit = git(root, "rev-parse", "--verify", "HEAD^{commit}")?.trim();
  if (!commit || !/^[a-f0-9]{40}$/.test(commit))
    return omitted("commit-identity-unavailable");
  const remote = git(root, "config", "--get", "remote.origin.url")?.trim();
  const recognizedRemote =
    remote &&
    [
      /^https:\/\/github\.com\/gadicc\/yahoo-finance2(?:\.git)?\/?$/i,
      /^git@github\.com:gadicc\/yahoo-finance2(?:\.git)?$/i,
      /^ssh:\/\/git@github\.com(?::22)?\/gadicc\/yahoo-finance2(?:\.git)?\/?$/i,
    ].some((pattern) => pattern.test(remote));
  if (!recognizedRemote)
    return omitted("unrecognized-source-repository", commit);
  const tree = git(root, "ls-tree", "-rz", commit, "--", "src");
  if (tree === undefined) return omitted("source-tree-unavailable", commit);
  const expected = new Map<string, string>();
  for (const row of tree.split("\0").filter(Boolean)) {
    const tab = row.indexOf("\t"),
      header = row.slice(0, tab).split(" "),
      file = row.slice(tab + 1);
    if (
      tab < 0 ||
      !["100644", "100755"].includes(header[0] ?? "") ||
      header[1] !== "blob" ||
      !/^[a-f0-9]{40}$/.test(header[2] ?? "")
    ) {
      return omitted("unsupported-source-tree-entry", commit);
    }
    expected.set(file, header[2] ?? "");
  }
  if (actual.size !== expected.size)
    return omitted("source-differs-from-commit", commit);
  for (const [file, bytes] of actual) {
    const blob = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (expected.get(file) !== blob)
      return omitted("source-differs-from-commit", commit);
  }
  return { kind: "commit", commit, repository: repositoryUrl, sourceDigest };
}

export function sourceUrl(
  provenance: SourceProvenance,
  root: string,
  file: string,
  line: number,
): string | undefined {
  const path = relative(root, resolve(file)).replaceAll("\\", "/");
  if (
    provenance.kind !== "commit" ||
    !path.startsWith("src/") ||
    !Number.isSafeInteger(line) ||
    line < 1
  )
    return undefined;
  return `${provenance.repository}/blob/${provenance.commit}/${path.split("/").map(encodeURIComponent).join("/")}#L${line}`;
}
