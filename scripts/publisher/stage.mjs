/** Publisher-only JSR staging. This module never invokes Deno or a registry. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";

const origin = "https://github.com/gadicc/yahoo-finance2.git";
const ownership = "yahoo-finance2/publisher-stage-v1";
export const hashFile = (/** @type {string} */ file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

/** Ignore inherited repository/config/replacement overrides for local provenance work. */
function gitEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  );
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
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
      env: gitEnvironment(),
      shell: false,
      timeout: 60000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** @param {string} version */
export function validateVersion(version) {
  assert(typeof version === "string", "Publisher version is required");
  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  assert(
    match && !match[4]?.split(".").some((part) => /^0\d+$/.test(part)),
    "Publisher version must be a semantic version",
  );
  return version;
}

/** @param {string} root @param {string} file */
function regular(root, file) {
  const name = relative(root, file);
  assert(
    name && !isAbsolute(name) && name !== ".." && !name.startsWith(`..${sep}`),
    "Publisher input escapes checkout",
  );
  assert(
    realpathSync(file) === file &&
      lstatSync(file).isFile() &&
      !lstatSync(file).isSymbolicLink(),
    "Publisher inputs must be canonical regular files",
  );
  return name.split(sep).join("/");
}

/** Build the public source/type closure and exact direct npm import map. @param {string} directory */
export function stagePlan(directory) {
  const root = realpathSync(directory);
  for (const name of ["deno.json", "package.json", "bun.lock"])
    regular(root, join(root, name));
  const metadata = JSON.parse(readFileSync(join(root, "deno.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert(
    manifest.private === true && manifest.packageManager === "bun@1.4.3",
    "Publisher requires private Bun root",
  );
  const parsed = ts.parseConfigFileTextToJson(
    "bun.lock",
    readFileSync(join(root, "bun.lock"), "utf8"),
  );
  assert(!parsed.error, "Malformed authoritative Bun lock");
  const direct = parsed.config.workspaces?.[""];
  assert(direct, "Missing locked root graph");
  /** @type {Record<string,string>} */
  const imports = {};
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    assert(
      typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version),
      "Runtime dependencies must be exact pins",
    );
    assert.equal(
      direct.dependencies?.[name],
      version,
      "Root dependency/lock disagreement",
    );
    imports[name] = `npm:${name}@${version}`;
  }
  const types = manifest.devDependencies["@types/json-schema"];
  assert(
    /^\d+\.\d+\.\d+$/.test(types) &&
      direct.devDependencies?.["@types/json-schema"] === types,
    "Public JSON-schema type pin must match Bun lock",
  );
  imports["json-schema"] = `npm:@types/json-schema@${types}`;
  assert.equal(metadata.name, "@gadicc/yahoo-finance2");
  assert(metadata.exports && typeof metadata.exports === "object");
  /** @type {Set<string>} */
  const files = new Set();
  /** @param {string} file */
  const visit = (file) => {
    const name = regular(root, file);
    if (name === "deno.json") return; // Replaced by versioned public metadata.
    assert(
      /^src\/[^\0]+\.(?:ts|json)$/.test(name) &&
        !name.endsWith(".test.ts") &&
        !name
          .split("/")
          .some(
            (part) =>
              part.startsWith(".") ||
              ["tests", "fixtures", "node_modules"].includes(part),
          ),
      `Unexpected publisher source: ${name}`,
    );
    if (files.has(name)) return;
    files.add(name);
    if (!name.endsWith(".ts")) return;
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const preprocessed = ts.preProcessFile(text, true, true);
    assert(
      preprocessed.referencedFiles.length === 0 &&
        preprocessed.typeReferenceDirectives.length === 0 &&
        preprocessed.libReferenceDirectives.length === 0,
      "Unsupported publisher triple-slash reference",
    );
    // Inspect only actual comments at parsed token boundaries, never strings,
    // templates or regular expressions containing directive-looking text.
    /** @type {Map<number,ts.CommentRange>} */
    const comments = new Map();
    const collect = (/** @type {ts.Node} */ node) => {
      for (const range of [
        ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
        ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
      ])
        comments.set(range.pos, range);
      for (const child of node.getChildren(source)) collect(child);
    };
    collect(source);
    // Deno's reference grammar requires this contiguous literal marker.
    // Refuse it in every real comment without mirroring Rust whitespace or
    // comment-kind/prefix rules; ordinary triple-slash prose stays supported.
    for (const range of comments.values())
      assert(
        !/<reference/iu.test(text.slice(range.pos, range.end)),
        "Unsupported publisher triple-slash reference or reference-bearing comment",
      );
    /** @type {Set<number>} */
    const consumedHints = new Set();
    const specifiers = preprocessed.importedFiles.map((item) => item.fileName);
    const inspect = (/** @type {ts.Node} */ node) => {
      if (ts.isImportDeclaration(node)) {
        const hints = (ts.getLeadingCommentRanges(text, node.pos) ?? []).filter(
          (range) =>
            /@(?:deno-types|ts-types)\b/iu.test(
              text.slice(range.pos, range.end),
            ),
        );
        assert(hints.length <= 1, "Contradictory publisher type hints");
        for (const range of hints) {
          const comment = text.slice(range.pos, range.end);
          const match = comment.match(
            /^\/\/\s*@deno-types\s*=\s*["']([^"']+)["']\s*$/,
          );
          assert(match, "Malformed publisher type hint");
          const hint = match[1];
          assert(ts.isStringLiteral(node.moduleSpecifier));
          const runtime = node.moduleSpecifier.text;
          const dependency = hint.startsWith("@")
            ? hint.split("/").slice(0, 2).join("/")
            : hint.split("/")[0];
          assert(
            imports[dependency] &&
              !/[\\:#?]/.test(hint) &&
              !hint.split("/").some((part) => part === "." || part === "..") &&
              (hint === runtime || hint === runtime.replace(/\.js$/, "")),
            `Unapproved or contradictory publisher type hint: ${hint}`,
          );
          consumedHints.add(range.pos);
          specifiers.push(hint);
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      )
        assert(
          node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]),
          "Computed import is outside publisher closure",
        );
      ts.forEachChild(node, inspect);
    };
    inspect(source);
    for (const range of comments.values())
      assert(
        !/@(?:deno-types|ts-types)\b/iu.test(
          text.slice(range.pos, range.end),
        ) || consumedHints.has(range.pos),
        "Unsupported publisher type hint outside import declaration",
      );
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
      else if (!specifier.startsWith("node:")) {
        const dependency = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        assert(
          imports[specifier] || imports[dependency],
          `Undeclared publisher dependency: ${specifier}`,
        );
        if (!imports[specifier])
          imports[specifier] =
            imports[dependency] + specifier.slice(dependency.length);
      }
    }
  };
  for (const [key, file] of Object.entries(metadata.exports)) {
    assert(
      (key === "." || key.startsWith("./")) &&
        typeof file === "string" &&
        file.startsWith("./src/"),
      "Invalid public export",
    );
    visit(resolve(root, file));
  }
  assert(files.size > 0, "Empty JSR closure");
  for (const name of ["LICENSE", "README.md"]) {
    regular(root, join(root, name));
    files.add(name);
  }
  const published = [...files].sort();
  return {
    root,
    metadata: {
      name: metadata.name,
      version: validateVersion(metadata.version),
      exports: metadata.exports,
      imports,
      nodeModulesDir: "auto",
      lock: { path: "./deno.lock", frozen: false },
      publish: { include: ["deno.json", ...published] },
    },
    files: published,
  };
}

/** Private root-preserving Git clone with no hardlinked objects or source files. @param {string} root @param {string} [temporary] */
export function createJsrStage(root, temporary = tmpdir()) {
  const plan = stagePlan(root);
  const head = git(plan.root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  assert(
    /^[a-f0-9]{40}$/.test(head),
    "Publisher requires a real source commit",
  );
  // Compare raw bytes to original commit objects, never clean-filter/autocrlf
  // output or replacement trees. Include all root metadata inputs.
  for (const name of [...plan.files, "deno.json", "package.json", "bun.lock"]) {
    const actual = git(plan.root, [
      "hash-object",
      "--no-filters",
      join(plan.root, name),
    ]);
    assert.equal(
      actual,
      git(plan.root, ["rev-parse", `${head}:${name}`]),
      `Uncommitted publisher input: ${name}`,
    );
  }
  const owner = realpathSync(
    mkdtempSync(join(realpathSync(temporary), "yf-publisher-stage-")),
  );
  const token = randomUUID();
  const ownerFile = join(owner, "owner.json");
  writeFileSync(ownerFile, JSON.stringify({ owner: ownership, token }), {
    mode: 0o600,
    flag: "wx",
  });
  const stage = join(owner, "jsr");
  try {
    const clone = spawnSync(
      "git",
      [
        "--no-replace-objects",
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "clone",
        "--no-hardlinks",
        "--no-checkout",
        "--local",
        plan.root,
        stage,
      ],
      { encoding: "utf8", env: gitEnvironment(), shell: false, timeout: 60000 },
    );
    assert.ifError(clone.error);
    assert.equal(clone.status, 0, clone.stderr);
    git(stage, ["update-ref", "HEAD", head]);
    git(stage, ["remote", "set-url", "origin", origin]);
    for (const name of plan.files) {
      const target = join(stage, name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(plan.root, name), target);
      assert.equal(
        git(stage, ["hash-object", "--no-filters", target]),
        git(stage, ["rev-parse", `${head}:${name}`]),
        `Publisher input changed while staging: ${name}`,
      );
    }
    writeFileSync(
      join(stage, "deno.json"),
      `${JSON.stringify(plan.metadata, null, 2)}\n`,
    );
    /** @type {Record<string,string>} */
    const sourceHashes = Object.fromEntries(
      plan.files.map((name) => [name, hashFile(join(stage, name))]),
    );
    return {
      owner,
      ownerFile,
      token,
      stage,
      head,
      metadata: plan.metadata,
      sourceHashes,
    };
  } catch (error) {
    rmSync(owner, { recursive: true, force: true });
    throw error;
  }
}

/** @param {ReturnType<typeof createJsrStage>} state */
export function verifyStage(state) {
  assert.equal(realpathSync(state.owner), state.owner);
  assert.equal(realpathSync(state.stage), state.stage);
  regular(state.owner, state.ownerFile);
  regular(state.stage, join(state.stage, "deno.json"));
  assert.deepEqual(JSON.parse(readFileSync(state.ownerFile, "utf8")), {
    owner: ownership,
    token: state.token,
  });
  assert(
    !existsSync(join(state.stage, "package.json")),
    "JSR stage must not become a Node project",
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(state.stage, "deno.json"), "utf8")),
    state.metadata,
  );
  for (const [name, expected] of Object.entries(state.sourceHashes)) {
    regular(state.stage, join(state.stage, name));
    assert.equal(
      hashFile(join(state.stage, name)),
      expected,
      `Changed publisher source: ${name}`,
    );
  }
  assert.equal(git(state.stage, ["rev-parse", "HEAD"]), state.head);
  assert.equal(git(state.stage, ["remote", "get-url", "origin"]), origin);
}

/** @param {ReturnType<typeof createJsrStage>} state */
export function removeStage(state) {
  verifyStage(state);
  rmSync(state.owner, { recursive: true });
}
