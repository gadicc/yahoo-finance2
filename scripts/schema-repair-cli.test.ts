import { spawnSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";

const cli = fileURLToPath(new URL("./schema-repair.ts", import.meta.url));
const sourcePath = "src/modules/example.ts";
const schemaPath = "src/modules/example.schema.json";
const original = `// @yf-schema
export type Field = "old" | "other" | "old";
export interface Result { count: number; }
throw new Error("PROPOSED_SOURCE_EVALUATED");
`;
const repaired = original.replace('"other"', '"other" | "observed"');
const oldSchema = '{"type":"object"}\n';
const newSchema =
  '{"type":"object","properties":{"count":{"type":"number"}}}\n';
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function workspace() {
  const scratch = mkdtempSync(join(tmpdir(), "yf-repair-cli-"));
  const root = join(scratch, "repository");
  mkdirSync(root);
  const put = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const git = (...args: string[]) => {
    const child = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: gitEnvironment,
    });
    if (child.error || child.status !== 0)
      throw new Error("Test Git setup failed");
    return child.stdout;
  };
  put(sourcePath, original);
  put(schemaPath, oldSchema);
  put("README.md", "Unrelated tracked file.\n");
  put(
    "src/modules/markerless.ts",
    "export interface Other { value: string; }\n",
  );
  put("src/modules/markerless.schema.json", oldSchema);
  git("init", "--quiet");
  git("config", "core.filemode", "true");
  git("add", ".");
  git(
    "-c",
    "user.name=Schema Repair Test",
    "-c",
    "user.email=repair@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "base",
  );
  const base = git("rev-parse", "HEAD").trim();
  const proposal = join(scratch, "proposal.json");
  const bundle = join(scratch, "bundle.json");
  writeFileSync(
    proposal,
    JSON.stringify({
      status: "repair",
      summary: "An observed literal extends the existing union.",
      evidence: ["Synthetic successful response; no live Yahoo request."],
      edits: [
        { path: sourcePath, before: '"other"', after: '"other" | "observed"' },
      ],
    }),
  );
  const files = [
    { path: sourcePath, content: repaired },
    { path: schemaPath, content: newSchema },
  ];
  const writeBundle = (value: unknown = { base, files }) => {
    writeFileSync(bundle, JSON.stringify(value));
    return bundle;
  };
  return {
    scratch,
    root,
    base,
    proposal,
    bundle,
    files,
    put,
    git,
    writeBundle,
    run(
      args: string[],
      options: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        runtime?: string;
        entry?: string;
      } = {},
    ) {
      const child = spawnSync(
        options.runtime ?? process.execPath,
        [options.entry ?? cli, ...args],
        {
          cwd: options.cwd ?? root,
          encoding: "utf8",
          timeout: 15_000,
          env: { ...gitEnvironment, ...options.env },
        },
      );
      if (child.error) throw child.error;
      return {
        code: child.status,
        output: child.stdout + child.stderr,
        stdout: child.stdout,
      };
    },
    read(path: string) {
      return readFileSync(join(root, path), "utf8");
    },
    [Symbol.dispose]() {
      rmSync(scratch, { recursive: true, force: true });
    },
  };
}

function nodeRuntime() {
  // Source Node execution is an additional compatibility proof when an explicit
  // stable Node host is selected; ordinary regressions require only pinned Bun.
  return process.env.YF_TYPECHECK_NODE;
}

test("schema repair CLI performs real Git apply, bundle and restore without evaluating source", () => {
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    using space = workspace();
    const applied = space.run(["apply", space.base, space.proposal], {
      runtime,
    });
    expect(applied.code, applied.output).toBe(0);
    expect(JSON.parse(applied.stdout).ready).toBe(true);
    expect(space.read(sourcePath)).toBe(repaired);
    expect(space.read(schemaPath)).toBe(oldSchema);
    space.put(schemaPath, newSchema);
    const bundled = space.run(
      ["bundle", space.base, space.proposal, space.bundle],
      { runtime },
    );
    expect(bundled.code, bundled.output).toBe(0);
    const bundle = JSON.parse(readFileSync(space.bundle, "utf8"));
    expect(bundle.base).toBe(space.base);
    expect(
      bundle.files.map((file: { path: string }) => file.path).sort(),
    ).toEqual([schemaPath, sourcePath].sort());
    expect(bundle.summary).toContain("observed literal");
    space.git("reset", "--hard", "--quiet", space.base);
    const restored = space.run(["restore", space.base, space.bundle], {
      runtime,
    });
    expect(restored.code, restored.output).toBe(0);
    expect(space.read(sourcePath)).toBe(repaired);
    expect(space.read(schemaPath)).toBe(newSchema);
    const repeated = space.run(["restore", space.base, space.bundle], {
      runtime,
    });
    expect(repeated.code, repeated.output).toBe(0);
    expect(
      space.git("diff", "--name-only", space.base).trim().split("\n").sort(),
    ).toEqual([schemaPath, sourcePath].sort());
  }
}, 30_000);

test("schema repair imports safely and reports blocked proposals without writes", () => {
  using space = workspace();
  const driver = join(space.scratch, "import.mjs");
  writeFileSync(
    driver,
    `import ${JSON.stringify(new URL("./schema-repair.ts", import.meta.url).href)};console.log('SAFE_IMPORT');`,
  );
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    const imported = spawnSync(runtime, [driver], {
      cwd: space.root,
      encoding: "utf8",
      env: gitEnvironment,
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe("SAFE_IMPORT");
  }
  writeFileSync(
    space.proposal,
    JSON.stringify({
      status: "blocked",
      summary: "Manual review needed.",
      evidence: [],
      edits: [],
    }),
  );
  const blocked = space.run(["apply", space.base, space.proposal]);
  expect(blocked.code, blocked.output).toBe(0);
  expect(JSON.parse(blocked.stdout).ready).toBe(false);
  expect(space.git("status", "--porcelain")).toBe("");
});

test("schema repair CLI rejects invalid commands, commits, arity and unsafe proposed changes", () => {
  using space = workspace();
  for (const args of [
    [],
    ["unknown", space.base, space.proposal],
    ["apply", space.base],
    ["apply", space.base, space.proposal, "extra"],
    ["bundle", space.base, space.proposal],
    ["apply", space.base.slice(0, 8), space.proposal],
    ["apply", "0".repeat(40), space.proposal],
    ["apply", space.git("rev-parse", "HEAD^{tree}").trim(), space.proposal],
  ])
    expect(space.run(args).code, JSON.stringify(args)).toBe(1);
  const nested = space.run(["apply", space.base, space.proposal], {
    cwd: join(space.root, "src"),
  });
  expect(nested.code).toBe(1);
  expect(nested.output).toContain("repository root");
  for (const edit of [
    { path: "../escape.ts", before: '"other"', after: '"other" | "new"' },
    { path: sourcePath, before: "throw new Error", after: "console.log" },
    {
      path: sourcePath,
      before: '"old" | "other" | "old"',
      after: '"other" | "old" | "old" | "new"',
    },
  ]) {
    writeFileSync(
      space.proposal,
      JSON.stringify({
        status: "repair",
        summary: "invalid",
        evidence: [],
        edits: [edit],
      }),
    );
    expect(space.run(["apply", space.base, space.proposal]).code).toBe(1);
    expect(space.read(sourcePath)).toBe(original);
  }
  expect(space.git("status", "--porcelain")).toBe("");
}, 30_000);

test("schema repair bundle rejects unrelated, untracked, added, deleted, renamed and mode changes", () => {
  const mutations = [
    (s: ReturnType<typeof workspace>) => s.put("untracked.txt", "untracked"),
    (s: ReturnType<typeof workspace>) => s.put("README.md", "changed"),
    (s: ReturnType<typeof workspace>) => {
      s.put("src/modules/new.ts", original);
      s.git("add", "src/modules/new.ts");
    },
    (s: ReturnType<typeof workspace>) => unlinkSync(join(s.root, schemaPath)),
    (s: ReturnType<typeof workspace>) =>
      renameSync(
        join(s.root, schemaPath),
        join(s.root, "src/modules/renamed.schema.json"),
      ),
    (s: ReturnType<typeof workspace>) =>
      chmodSync(join(s.root, sourcePath), 0o755),
    (s: ReturnType<typeof workspace>) => {
      s.git("update-index", "--chmod=+x", sourcePath);
      chmodSync(join(s.root, sourcePath), 0o644);
    },
  ];
  for (const mutate of mutations) {
    using space = workspace();
    space.put(sourcePath, repaired);
    space.put(schemaPath, newSchema);
    mutate(space);
    const rejected = space.run([
      "bundle",
      space.base,
      space.proposal,
      space.bundle,
    ]);
    expect(rejected.code, rejected.output).toBe(1);
    expect(readdirSync(space.scratch)).not.toContain("bundle.json");
  }
}, 30_000);

test("schema repair apply rejects source modes and all file aliases before writing", () => {
  for (const kind of [
    "mode",
    "symlink",
    "hardlink",
    "parent-symlink",
  ] as const) {
    using space = workspace();
    const target = join(space.root, sourcePath);
    const external = join(space.scratch, "external.ts");
    if (kind === "mode") chmodSync(target, 0o755);
    if (kind === "symlink") {
      writeFileSync(external, original);
      unlinkSync(target);
      symlinkSync(external, target);
    }
    if (kind === "hardlink") linkSync(target, external);
    if (kind === "parent-symlink") {
      const externalDirectory = join(space.scratch, "external-modules");
      renameSync(join(space.root, "src/modules"), externalDirectory);
      symlinkSync(externalDirectory, join(space.root, "src/modules"), "dir");
    }
    const rejected = space.run(["apply", space.base, space.proposal]);
    expect(rejected.code, `${kind}: ${rejected.output}`).toBe(1);
    expect(space.read(sourcePath)).toBe(original);
    if (kind === "symlink" || kind === "hardlink") {
      expect(readFileSync(external, "utf8")).toBe(original);
    }
  }
});

test("schema repair restore validates every bundle entry and pending state before its first write", () => {
  const mutations = [
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({ base: s.base, files: [...s.files, s.files[0]] }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({
        base: s.base,
        files: [
          { path: sourcePath, content: repaired },
          { path: schemaPath, content: "bad JSON" },
        ],
      }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({
        base: s.base,
        files: [
          { path: sourcePath, content: repaired },
          { path: "src/modules/markerless.schema.json", content: newSchema },
        ],
      }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({ base: s.base, files: [s.files[0]] }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({ base: s.base, files: [s.files[1]] }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({
        base: s.base,
        files: [s.files[0], { path: "README.md", content: newSchema }],
      }),
    (s: ReturnType<typeof workspace>) =>
      s.writeBundle({ base: "0".repeat(40), files: s.files }),
    (s: ReturnType<typeof workspace>) => {
      writeFileSync(s.bundle, " ".repeat(2 * 1024 * 1024 + 1));
    },
    (s: ReturnType<typeof workspace>) => s.put("untracked.txt", "preexisting"),
    (s: ReturnType<typeof workspace>) => s.put("README.md", "preexisting"),
    (s: ReturnType<typeof workspace>) =>
      chmodSync(join(s.root, schemaPath), 0o755),
    (s: ReturnType<typeof workspace>) =>
      linkSync(join(s.root, schemaPath), join(s.scratch, "schema-alias.json")),
    (s: ReturnType<typeof workspace>) => {
      writeFileSync(join(s.scratch, "external.json"), oldSchema);
      unlinkSync(join(s.root, schemaPath));
      symlinkSync(join(s.scratch, "external.json"), join(s.root, schemaPath));
    },
    (s: ReturnType<typeof workspace>) => {
      renameSync(
        join(s.root, "src/modules"),
        join(s.scratch, "external-modules"),
      );
      symlinkSync(
        join(s.scratch, "external-modules"),
        join(s.root, "src/modules"),
        "dir",
      );
    },
  ];
  for (const mutate of mutations) {
    using space = workspace();
    space.writeBundle();
    mutate(space);
    const before = space.git("status", "--porcelain");
    const rejected = space.run(["restore", space.base, space.bundle]);
    expect(rejected.code, rejected.output).toBe(1);
    expect(space.read(sourcePath)).toBe(original);
    expect(space.read(schemaPath)).toBe(oldSchema);
    expect(space.git("status", "--porcelain")).toBe(before);
  }
}, 30_000);

test("schema repair apply and restore preserve local edits in listed targets", () => {
  for (const command of ["apply", "restore"] as const) {
    for (const target of command === "apply"
      ? [sourcePath]
      : [sourcePath, schemaPath]) {
      using space = workspace();
      const local =
        target === sourcePath
          ? original.replace("count: number", "count: 1 | 2")
          : '{"type":"object","title":"Local schema work"}\n';
      space.put(target, local);
      space.writeBundle();
      const rejected = space.run([
        command,
        space.base,
        command === "apply" ? space.proposal : space.bundle,
      ]);
      expect(rejected.code, rejected.output).toBe(1);
      expect(rejected.output).toContain("target has local edits");
      expect(space.read(target)).toBe(local);
      expect(space.read(target === sourcePath ? schemaPath : sourcePath)).toBe(
        target === sourcePath ? oldSchema : original,
      );
    }
  }
});

test("schema repair bundle refuses output aliases without truncating their targets", () => {
  for (const kind of [
    "symlink",
    "hardlink",
    "parent-symlink",
    "dangling",
  ] as const) {
    using space = workspace();
    space.put(sourcePath, repaired);
    space.put(schemaPath, newSchema);
    const external = join(space.scratch, "preserved.json");
    writeFileSync(external, "PRESERVED");
    let output = space.bundle;
    if (kind === "symlink") symlinkSync(external, output);
    if (kind === "hardlink") linkSync(external, output);
    if (kind === "dangling")
      symlinkSync(join(space.scratch, "missing.json"), output);
    if (kind === "parent-symlink") {
      mkdirSync(join(space.scratch, "real-output"));
      symlinkSync(
        join(space.scratch, "real-output"),
        join(space.scratch, "linked-output"),
        "dir",
      );
      output = join(space.scratch, "linked-output/bundle.json");
    }
    const rejected = space.run(["bundle", space.base, space.proposal, output]);
    expect(rejected.code, `${kind}: ${rejected.output}`).toBe(1);
    expect(readFileSync(external, "utf8")).toBe("PRESERVED");
    expect(space.read(sourcePath)).toBe(repaired);
    expect(space.read(schemaPath)).toBe(newSchema);
  }
});

test("schema repair Git failures use a fixed diagnostic without forwarding stderr", () => {
  using space = workspace();
  const tools = join(space.scratch, "tools");
  mkdirSync(tools);
  const fakeGit = join(tools, "git");
  writeFileSync(
    fakeGit,
    "#!/bin/sh\nprintf 'DO_NOT_EXPOSE_GIT_STDERR\\n' >&2\nexit 7\n",
  );
  chmodSync(fakeGit, 0o755);
  const rejected = space.run(["apply", space.base, space.proposal], {
    env: { PATH: tools },
  });
  expect(rejected.code).toBe(1);
  expect(rejected.output.trim()).toBe("Git operation failed");
  expect(space.read(sourcePath)).toBe(original);
});

test("schema repair CLI never echoes malformed JSON payloads in diagnostics", () => {
  using space = workspace();
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    for (const command of ["apply", "bundle", "restore"]) {
      writeFileSync(space.proposal, "DO_NOT_EXPOSE_JSON_PAYLOAD");
      const args = [command, space.base, space.proposal];
      if (command === "bundle") args.push(space.bundle);
      const rejected = space.run(args, { runtime });
      expect(rejected.code).toBe(1);
      expect(rejected.output.trim()).toBe("Input is not valid JSON");
      expect(rejected.output).not.toContain("DO_NOT_EXPOSE");
    }
    space.writeBundle({
      base: space.base,
      files: [
        space.files[0],
        { path: schemaPath, content: "DO_NOT_EXPOSE_JSON_PAYLOAD" },
      ],
    });
    const rejected = space.run(["restore", space.base, space.bundle], {
      runtime,
    });
    expect(rejected.code).toBe(1);
    expect(rejected.output.trim()).toBe("Input is not valid JSON");
    expect(space.read(sourcePath)).toBe(original);
    expect(space.read(schemaPath)).toBe(oldSchema);
  }
});

test("schema repair follows executable symlinks on Bun and Node while imports stay quiet", () => {
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    using space = workspace();
    const entry = join(space.scratch, "linked-schema-repair.ts");
    symlinkSync(cli, entry);
    const invalid = space.run([], { runtime, entry });
    expect(invalid.code, invalid.output).toBe(1);
    expect(invalid.output.trim()).toBe("Expected apply, bundle, or restore");
    const applied = space.run(["apply", space.base, space.proposal], {
      runtime,
      entry,
    });
    expect(applied.code, applied.output).toBe(0);
    expect(JSON.parse(applied.stdout).ready).toBe(true);
    expect(space.read(sourcePath)).toBe(repaired);
    expect(space.read(schemaPath)).toBe(oldSchema);
    space.git("reset", "--hard", "--quiet", space.base);
    const driver = join(space.scratch, "import-symlink.mjs");
    writeFileSync(
      driver,
      `import ${JSON.stringify(pathToFileURL(entry).href)};console.log('SAFE_SYMLINK_IMPORT');`,
    );
    const imported = spawnSync(runtime, [driver], {
      cwd: space.root,
      encoding: "utf8",
      env: gitEnvironment,
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe("SAFE_SYMLINK_IMPORT");
    expect(imported.stderr).toBe("");
    expect(space.git("status", "--porcelain")).toBe("");
  }
});

test("schema repair refuses masked staged content before apply, bundle and restore", () => {
  for (const command of ["apply", "bundle", "restore"] as const) {
    for (const target of ["README.md", sourcePath, schemaPath]) {
      using space = workspace();
      const baseContent = space.read(target);
      const stagedContent =
        target === sourcePath
          ? original.replace("count: number", "count: 42")
          : target === schemaPath
            ? '{"title":"STAGED_LOCAL_SCHEMA"}\n'
            : "STAGED_LOCAL_README\n";
      space.put(target, stagedContent);
      space.git("add", "--", target);
      // A clean-looking worktree path must not hide different index content.
      space.put(target, baseContent);
      if (command === "bundle") {
        space.put(sourcePath, repaired);
        space.put(schemaPath, newSchema);
      }
      space.writeBundle();
      const metadata = () =>
        [sourcePath, schemaPath].map((path) => {
          const stat = lstatSync(join(space.root, path));
          return {
            path,
            content: space.read(path),
            mode: stat.mode,
            ino: stat.ino,
            nlink: stat.nlink,
          };
        });
      const before = metadata();
      const indexTree = space.git("write-tree");
      const status = space.git("status", "--porcelain");
      const args = [
        command,
        space.base,
        command === "restore" ? space.bundle : space.proposal,
      ];
      if (command === "bundle")
        args.push(join(space.scratch, "rejected-bundle.json"));
      const rejected = space.run(args);
      expect(rejected.code, `${command}/${target}: ${rejected.output}`).toBe(1);
      expect(rejected.output.trim()).toBe("Staged changes are forbidden");
      expect(metadata()).toEqual(before);
      expect(space.git("write-tree")).toBe(indexTree);
      expect(space.git("status", "--porcelain")).toBe(status);
      expect(readdirSync(space.scratch)).not.toContain("rejected-bundle.json");
    }
  }
});

test("schema repair restore rejects hidden target flags before writing on Bun and Node", () => {
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
      using space = workspace();
      space.writeBundle();
      space.git("update-index", flag, "--", sourcePath, schemaPath);
      const flags = space.git("ls-files", "-v", "-z");
      const indexTree = space.git("write-tree");
      const status = space.git("status", "--porcelain");
      const rejected = space.run(["restore", space.base, space.bundle], {
        runtime,
      });
      expect(rejected.code, `${runtime}/${flag}: ${rejected.output}`).toBe(1);
      expect(rejected.output.trim()).toBe(
        "Index must not use assume-unchanged or skip-worktree flags",
      );
      expect(space.read(sourcePath)).toBe(original);
      expect(space.read(schemaPath)).toBe(oldSchema);
      expect(space.git("ls-files", "-v", "-z")).toBe(flags);
      expect(space.git("write-tree")).toBe(indexTree);
      expect(space.git("status", "--porcelain")).toBe(status);
    }
  }
}, 30_000);

test("schema repair refuses hidden unrelated edits without changing bytes or index flags", () => {
  for (const runtime of [process.execPath, nodeRuntime()].filter(
    (value): value is string => !!value,
  )) {
    for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
      for (const command of ["apply", "bundle", "restore"] as const) {
        using space = workspace();
        space.git("update-index", flag, "--", "README.md");
        space.put("README.md", "Hidden unrelated local work.\n");
        if (command === "bundle") {
          space.put(sourcePath, repaired);
          space.put(schemaPath, newSchema);
        }
        space.writeBundle();
        const metadata = () =>
          [sourcePath, schemaPath, "README.md"].map((path) => {
            const stat = lstatSync(join(space.root, path));
            return {
              path,
              content: space.read(path),
              mode: stat.mode,
              ino: stat.ino,
              nlink: stat.nlink,
            };
          });
        const before = metadata();
        const flags = space.git("ls-files", "-v", "-z");
        const indexTree = space.git("write-tree");
        const status = space.git("status", "--porcelain");
        // The unrelated README edit is genuinely hidden from Git's inventory.
        expect(space.git("diff", "--name-only", space.base)).not.toContain(
          "README.md",
        );
        const args = [
          command,
          space.base,
          command === "restore" ? space.bundle : space.proposal,
        ];
        if (command === "bundle")
          args.push(join(space.scratch, "rejected-bundle.json"));
        const rejected = space.run(args, { runtime });
        expect(
          rejected.code,
          `${runtime}/${flag}/${command}: ${rejected.output}`,
        ).toBe(1);
        expect(rejected.output.trim()).toBe(
          "Index must not use assume-unchanged or skip-worktree flags",
        );
        expect(metadata()).toEqual(before);
        expect(space.git("ls-files", "-v", "-z")).toBe(flags);
        expect(space.git("write-tree")).toBe(indexTree);
        expect(space.git("status", "--porcelain")).toBe(status);
        expect(readdirSync(space.scratch)).not.toContain(
          "rejected-bundle.json",
        );
      }
    }
  }
}, 30_000);
