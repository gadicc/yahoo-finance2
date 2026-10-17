#!/usr/bin/env python3
"""Trusted recache/repair CI coordination. Never run candidate lifecycle hooks."""
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent.parent
CANDIDATE = ROOT.with_name(ROOT.name + "-schema-repair-candidate")
CODEX_SHA = "bdf19a4a223ec2549a3e2274a0cf61556bc07675"
CODEX_ORIGINAL = "448852e9e59565440bf25174b54bbf661bd66102be295af2e526fa09eaaf3bd7"
CODEX_ADAPTED = "766147ff38ef6eedcc8f934193b52f00784afbf8db703eb609962e55af0c5e0c"
CODEX_STEP_START = b"    - name: Enable Linux user namespaces for bubblewrap\n"
CODEX_STEP_END = b"    - name: Drop sudo privilege, if appropriate\n"
SHA = re.compile(r"[0-9a-f]{40}\Z")
MODULE_SCHEMA = re.compile(r"src/modules/[A-Za-z][A-Za-z0-9-]*\.schema\.json\Z")
FIXTURE = re.compile(r"tests/fixtures/http/[A-Za-z0-9_.^=-]+\.json\Z")
GIT_OVERRIDES = {"core.hooksPath": "/dev/null", "core.fsmonitor": "false", "core.attributesFile": "/dev/null", "diff.external": "/usr/bin/false", "core.pager": "cat"}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def regular(path):
    path = Path(path)
    metadata = path.lstat()
    require(path.resolve(strict=True) == path.absolute() and stat.S_ISREG(metadata.st_mode)
            and metadata.st_nlink == 1, "Expected canonical regular input without aliases")
    return path


def clean_environment(scratch=None):
    # No inherited tokens, Git config, loader hooks, dotenv or proxy settings.
    environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
                   "PYTHONDONTWRITEBYTECODE": "1", "GIT_CONFIG_NOSYSTEM": "1",
                   "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_CONFIG_GLOBAL": "/dev/null",
                   "GIT_ATTR_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0",
                   "GIT_CONFIG_COUNT": str(len(GIT_OVERRIDES))}
    for index, (key, value) in enumerate(GIT_OVERRIDES.items()):
        environment[f"GIT_CONFIG_KEY_{index}"] = key
        environment[f"GIT_CONFIG_VALUE_{index}"] = value
    if scratch is not None:
        environment.update(HOME=str(scratch), TMPDIR=str(scratch))
    return environment


def run(command, *, cwd=None, environment=None, check=True, timeout=900):
    child = subprocess.run(list(map(str, command)), cwd=ROOT if cwd is None else cwd, env=environment or clean_environment(),
                           text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, close_fds=True)
    if check and child.returncode:
        raise RuntimeError(f"Trusted CI command failed: {Path(command[0]).name}\n{child.stdout}")
    return child


def git(*arguments, cwd=None, check=True):
    # Fixed system executable and fixed config overrides also govern Git children
    # spawned by the trusted TS CLI. Never forward repository Git stderr.
    child = run(["/usr/bin/git", *arguments], cwd=cwd, check=False, timeout=60)
    require(not check or child.returncode == 0, "Trusted Git operation failed")
    return child.stdout if check else child


def closure(path):
    """Exact executable/config closure, excluding only non-executable evidence."""
    name = Path(path).name
    if name in {".gitattributes", ".gitignore", ".npmrc", ".editorconfig", "bunfig.toml", ".bunfig.toml"}:
        return True
    if path.endswith((".test.ts", ".test.mts", ".test.cts", ".test.js", ".test.mjs", ".test.cjs")) and not path.startswith(("tests/fixtures/", "tests/migration/results/")):
        return True
    if path.startswith("scripts/"):
        return True
    if path.startswith("tests/") and not path.startswith(("tests/fixtures/", "tests/migration/results/")):
        return Path(path).suffix in {".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".py", ".json"}
    return "/" not in path and (name in {"bun.lock", ".bun-version"}
                                or Path(path).suffix in {".json", ".jsonc", ".toml", ".yaml", ".yml", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"}
                                or name.startswith(".env"))


def tree(revision, *, cwd=ROOT):
    entries = git("ls-tree", "-r", "-z", revision, cwd=cwd).split("\0")
    result = {}
    for entry in filter(None, entries):
        metadata, path = entry.split("\t", 1)
        mode, kind, digest = metadata.split()
        result[path] = (mode, kind, digest)
    return result


def compatible(base, *, root=None):
    root = ROOT if root is None else root
    require(SHA.fullmatch(base), "Expected full repair base SHA")
    trusted = tree("HEAD", cwd=root)
    proposed = tree(base, cwd=root)
    required = {"package.json", "bun.lock", ".bun-version", "scripts/test.ts", "scripts/schema-gen.ts",
                "scripts/typecheck.ts", "scripts/schema-repair.ts", "scripts/ci_repair.py", "scripts/testing/offline.py", "biome.json",
                "scripts/docs.ts", "scripts/docs/inputs.ts", "scripts/docs/worker.ts", "scripts/docs/model.ts",
                "scripts/docs/diagnostics-baseline.json", "scripts/docs/parser-compatibility.json", "tsconfig.library.json"}
    left = {path: data for path, data in trusted.items() if closure(path)}
    right = {path: data for path, data in proposed.items() if closure(path)}
    require(required <= left.keys() and left == right,
            "Incompatible repair base: select a trusted dev commit with the workflow's exact Bun lockfile, tooling, test support and compiler/Biome configuration; historical Deno bases are not bootstrapped")
    for path, (mode, kind, digest) in left.items():
        require(kind == "blob" and mode in {"100644", "100755"}, "Executable/config closure must contain regular tracked files")
        data = regular(root / path).read_bytes()
        observed = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        require(observed == digest, "Trusted workflow executable/config closure has local edits")
    # The trusted collector parses supported local JSON/JSONC extends with the
    # same TypeScript/Node rules as docs lint. Unchanged parent configuration
    # bytes bind the reference graph; all discovered children must match too.
    configurations = documentation_configurations(root)
    for path in configurations:
        require(path in trusted and trusted[path] == proposed.get(path),
                "Incompatible repair base documentation configuration")
        mode, kind, digest = trusted[path]
        require(kind == "blob" and mode in {"100644", "100755"},
                "Documentation configuration must be a regular tracked file")
        data = regular(root / path).read_bytes()
        observed = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        require(observed == digest, "Trusted documentation configuration has local edits")
    pin = (root / ".bun-version").read_text().strip()
    manifest = json.loads((root / "package.json").read_text())
    require(re.fullmatch(r"\d+\.\d+\.\d+", pin) and manifest.get("packageManager") == f"bun@{pin}", "Invalid exact Bun metadata")
    return len(left.keys() | set(configurations))



def documentation_configurations(root):
    """Discover configuration only through the guarded, already checked trusted tool."""
    bun, _, _ = runtimes()
    collector = ROOT / "scripts/docs/inputs.ts"
    script = ("const { inputSnapshot } = await import(process.argv[1]);"
              "console.log(JSON.stringify(inputSnapshot(process.argv[2]).inventory.configurations.map(item => item.path)));")
    with tempfile.TemporaryDirectory(prefix="yf-repair-docs-inputs-") as value:
        scratch = Path(value).resolve()
        child = guarded(root, scratch, [bun, "--no-env-file", "--eval", script, collector.as_uri(), root])
    paths = json.loads(child.stdout)
    require(isinstance(paths, list) and paths and all(isinstance(path, str) for path in paths)
            and len(paths) == len(set(paths)),
            "Invalid trusted documentation configuration inventory")
    for path in paths:
        require(isinstance(path, str) and not Path(path).is_absolute()
                and ".." not in Path(path).parts and Path(path).suffix in {".json", ".jsonc"},
                "Invalid trusted documentation configuration path")
    return paths


def dependency_snapshot(directory, *, private=False):
    directory = Path(directory).resolve(strict=True)
    result = {}
    for current, directories, files in os.walk(directory, followlinks=False):
        for name in sorted(directories + files):
            path = Path(current) / name
            metadata = path.lstat()
            key = str(path.relative_to(directory))
            mode = stat.S_IMODE(metadata.st_mode)
            if path.is_symlink():
                target = os.readlink(path)
                resolved = path.resolve(strict=True)
                require(not Path(target).is_absolute() and (resolved == directory or directory in resolved.parents),
                        "Dependency links must remain relative and inside the frozen graph")
                result[key] = ("link", mode, target)
            elif path.is_file():
                require(not private or metadata.st_nlink == 1, "Candidate dependencies must not share writable inodes")
                result[key] = ("file", mode, hashlib.sha256(path.read_bytes()).hexdigest())
            else:
                require(path.is_dir(), "Unsupported dependency filesystem entry")
                result[key] = ("directory", mode)
    return result


def copy_dependencies(destination):
    source = (ROOT / "node_modules").resolve(strict=True)
    expected = dependency_snapshot(source)
    shutil.copytree(source, destination, symlinks=True)
    require(dependency_snapshot(destination, private=True) == expected,
            "Candidate dependency copy differs from the trusted frozen graph")


def prepare(base, drift=None, issue=None):
    require(SHA.fullmatch(base), "Expected full repair base SHA")
    git("merge-base", "--is-ancestor", base, "origin/dev")
    if drift is not None:
        require(SHA.fullmatch(drift) and re.fullmatch(r"[1-9][0-9]*", issue or ""), "Expected full drift SHA and positive issue number")
        git("merge-base", "--is-ancestor", drift, base)
        require(len(git("rev-list", "--parents", "-n", "1", drift).split()) == 2, "Recorded drift must have exactly one parent")
        paths = list(filter(None, git("diff-tree", "--no-commit-id", "--name-only", "-r", "-z", drift).split("\0")))
        require(paths and all(FIXTURE.fullmatch(path) and not path.endswith((".static.json", ".fake.json"))
                              and not Path(path).name.startswith("getCrumb-geo-") for path in paths), "Recorded drift must change only unprotected flat HTTP fixtures")
        git("diff", "--exit-code", drift, base, "--", "tests/fixtures/http")
    count = compatible(base)
    require(not CANDIDATE.exists() and not CANDIDATE.is_symlink(), "Candidate already exists; use a fresh job")
    # Never resolve/install the candidate graph or execute its lifecycle scripts.
    git("-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", str(CANDIDATE), base)
    copy_dependencies(CANDIDATE / "node_modules")
    print(f"Compatible base: {count} exact executable/config inputs; no candidate installation")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as stream:
            stream.write(f"base={base}\n")
            if issue is not None:
                stream.write(f"issue={issue}\n")


def runtimes():
    bun = Path(shutil.which("bun") or "").resolve(strict=True)
    node = Path(shutil.which("node") or "").resolve(strict=True)
    require(bun.is_file() and node.is_file(), "Select the pinned Bun and Node tool host")
    require(run([bun, "--version"]).stdout.strip() == (ROOT / ".bun-version").read_text().strip(), "Incorrect Bun binary")
    require(run([node, "--version"]).stdout.strip() == "v24.21.0", "Incorrect Node tool host")
    environment = clean_environment()
    environment["PATH"] = f"{bun.parent}:{node.parent}:/usr/bin:/bin"
    require(Path(shutil.which("git", path=environment["PATH"]) or "").resolve() == Path("/usr/bin/git"), "Tool PATH must select canonical system Git")
    require(Path(shutil.which("bwrap", path=environment["PATH"]) or "").resolve() == Path("/usr/bin/bwrap"), "Tool PATH must select canonical distro Bubblewrap")
    return bun, node, environment


def guarded(candidate, scratch, command, *, writable_modules=False, cwd=None):
    candidate = Path(candidate); scratch = Path(scratch)
    require(candidate.resolve(strict=True) == candidate and scratch.resolve(strict=True) == scratch,
            "Guard roots must be canonical")
    require(candidate != scratch and candidate not in scratch.parents and scratch not in candidate.parents,
            "Guard roots must not overlap")
    require(ROOT != scratch and ROOT not in scratch.parents and scratch not in ROOT.parents,
            "Guard scratch must not overlap the trusted workflow checkout")
    require(stat.S_IMODE(scratch.stat().st_mode) == 0o700 and scratch.stat().st_uid == os.getuid(), "Guard scratch must be private and operator-owned")
    bun, node, environment = runtimes()
    environment.update(HOME=str(scratch), TMPDIR=str(scratch))
    # This new launcher establishes replay-only markers in its allowlisted
    # environment; inherited capture variables are absent, not forwarded.
    environment.update(FETCH_DEVEL="", FMC_CACHE_MODE="replay")
    policy = runpy.run_path(str(ROOT / "scripts/testing/sandbox.py"))
    mounts, inputs = policy["mount_arguments"](candidate, scratch, command, owner=ROOT,
                                               tools=(bun, node))
    environment["YF_GUARD_INPUT_ROOTS"] = inputs
    arguments = ["/usr/bin/bwrap", "--die-with-parent", "--unshare-net", "--unshare-pid", "--new-session", *mounts]
    if writable_modules:
        modules = candidate / "src/modules"
        require(modules.resolve(strict=True) == modules and modules.is_dir(), "Module directory must be canonical")
        source_snapshot(modules)  # A writable alias must not mutate an outside inode.
        arguments.extend(["--bind", str(modules), str(modules)])
    arguments.extend(["--chdir", str(cwd or candidate), sys.executable, "-I", "-B", str(ROOT / "scripts/testing/offline.py"), "--seccomp-exec", *map(str, command)])
    return run(arguments, environment=environment)


def source_snapshot(directory):
    result = {}
    for path in sorted(Path(directory).rglob("*")):
        if path.is_dir():
            require(not path.is_symlink(), "Source directories must not be aliases")
        else:
            result[str(path.relative_to(directory))] = hashlib.sha256(regular(path).read_bytes()).hexdigest()
    return result


def regenerate(candidate, scratch, bun):
    stage = scratch / "schema-stage"
    stage.mkdir(mode=0o700)
    source_snapshot(candidate / "src")  # Reject aliases before copying.
    shutil.copytree(candidate / "src", stage / "src")
    # Production types import this retained metadata; it is never executed.
    shutil.copyfile(regular(ROOT / "deno.json"), stage / "deno.json")
    (stage / "scripts").symlink_to(ROOT / "scripts", target_is_directory=True)
    (stage / "node_modules").symlink_to((candidate / "node_modules").resolve(strict=True), target_is_directory=True)
    before = source_snapshot(stage / "src")
    child = guarded(candidate, scratch, [bun, "--no-env-file", ROOT / "scripts/schema-gen.ts", "--force", "--verbose"], cwd=stage)
    print(child.stdout, end="", flush=True)
    after = source_snapshot(stage / "src")
    require(before.keys() == after.keys(), "Schema generation added or removed source paths")
    changed = ["src/" + path for path in before if before[path] != after[path]]
    require(all(MODULE_SCHEMA.fullmatch(path) for path in changed),
            "Full schema generation changed a non-module output or source; manual repair is required")
    # The generator evaluated every marked consumer, including src/lib/options.
    outputs = sorted(path for path in before if path.endswith(".schema.json"))
    require(outputs, "No schema output closure found")
    for name in changed:
        source = regular(stage / name)
        target = regular(candidate / name)
        json.loads(source.read_text())
        temporary = target.with_name(target.name + "." + uuid.uuid4().hex + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, stat.S_IMODE(target.stat().st_mode))
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(source.read_bytes())
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
    return {"regeneratedOutputs": ["src/" + name for name in outputs], "changedModuleSchemas": changed}


def validate_candidate(base):
    require(CANDIDATE.resolve(strict=True) == CANDIDATE and CANDIDATE.is_dir(), "Expected prepared canonical candidate")
    require(git("rev-parse", "HEAD", cwd=CANDIDATE).strip() == base, "Candidate HEAD differs from the validated base")
    dependencies = CANDIDATE / "node_modules"
    require(dependencies.is_dir() and not dependencies.is_symlink() and dependencies.resolve(strict=True) == dependencies,
            "Candidate dependencies must be a canonical real private copy")
    require(dependency_snapshot(dependencies, private=True) == dependency_snapshot(ROOT / "node_modules"),
            "Candidate dependencies differ from the trusted frozen graph")


def replay_candidate(candidate, scratch, bun):
    # Only the already checked trusted controller runs outside the extra repair
    # guard. Its inventory/native support imports contain no candidate code.
    # Normal runTests establishes the complete strict child boundary before imports.
    _, _, environment = runtimes()
    environment.update(HOME=str(scratch), TMPDIR=str(scratch))
    script = ("const { runTests, parseArguments } = await import(process.argv[1]);"
              "process.exitCode = await runTests(parseArguments([]), process.argv[2]);")
    return run([bun, "--no-env-file", "--eval", script, (ROOT / "scripts/test.ts").as_uri(), candidate],
               cwd=ROOT, environment=environment)


def verify(base, proposal, output):
    compatible(base)
    validate_candidate(base)
    require(len(proposal.encode()) <= 256 * 1024, "Proposal exceeds 256 KiB")
    require(not Path(output).exists() and not Path(output).is_symlink(), "Verified output already exists")
    bun, _, _ = runtimes()
    with tempfile.TemporaryDirectory(prefix="yf-repair-verify-") as value:
        scratch = Path(value).resolve()
        proposed = scratch / "proposal.json"
        proposed.write_text(proposal)
        applied = guarded(CANDIDATE, scratch, [bun, "--no-env-file", ROOT / "scripts/schema-repair.ts", "apply", base, proposed], writable_modules=True)
        data = json.loads(applied.stdout)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as stream:
                stream.write(data["summary"] + "\n\n" + "\n".join("- " + item for item in data["evidence"]) + "\n")
        require(data.get("ready") is True, "Schema drift needs manual repair; proposal is blocked")
        closure_result = regenerate(CANDIDATE, scratch, bun)
        for command in ([bun, "--no-env-file", ROOT / "node_modules/@biomejs/biome/bin/biome", "format", "src/modules"],
                        [bun, "--no-env-file", ROOT / "node_modules/@biomejs/biome/bin/biome", "lint", "src/modules"],
                        [bun, "--no-env-file", CANDIDATE / "scripts/typecheck.ts"],
                        [bun, "--no-env-file", CANDIDATE / "scripts/docs.ts", "lint"]):
            child = guarded(CANDIDATE, scratch, command)
            print(child.stdout, end="", flush=True)
        replayed = replay_candidate(CANDIDATE, scratch, bun)
        print(replayed.stdout, end="", flush=True)
        git("diff", "--check", cwd=CANDIDATE)
        bundle = scratch / "verified-repair.json"
        guarded(CANDIDATE, scratch, [bun, "--no-env-file", ROOT / "scripts/schema-repair.ts", "bundle", base, proposed, bundle])
        raw = regular(bundle).read_bytes()
        require(len(raw) <= 2 * 1024 * 1024, "Verified bundle exceeds 2 MiB")
        destination = Path(output)
        require(destination.parent.resolve(strict=True) == destination.parent.absolute(), "Verified output parent must be canonical")
        with destination.open("xb") as stream:
            stream.write(raw)
        print(json.dumps(closure_result), flush=True)
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
                stream.write("ready=true\n")


def restore(base, bundle):
    compatible(base)
    validate_candidate(base)
    raw = regular(bundle).read_bytes()
    require(len(raw) <= 2 * 1024 * 1024, "Verified bundle exceeds 2 MiB")
    bun, _, _ = runtimes()
    with tempfile.TemporaryDirectory(prefix="yf-repair-restore-") as value:
        scratch = Path(value).resolve()
        artifact = scratch / "verified-repair.json"
        artifact.write_bytes(raw)
        guarded(CANDIDATE, scratch, [bun, "--no-env-file", ROOT / "scripts/schema-repair.ts", "restore", base, artifact], writable_modules=True)
    print("Verified artifact restored with trusted AST policy; no candidate code executed")


def adapt_codex(path):
    require(Path(shutil.which("bwrap") or "").resolve() == Path("/usr/bin/bwrap"), "Codex must select canonical distro Bubblewrap")
    path = regular(path)
    require(path == ROOT / ".trusted-codex-action/action.yml", "Only the fixed trusted action path can be adapted")
    require(git("rev-parse", "HEAD", cwd=path.parent).strip() == CODEX_SHA, "Wrong upstream Codex action commit")
    require(not git("status", "--porcelain", "--untracked-files=all", cwd=path.parent), "Pinned action checkout has local changes")
    original = path.read_bytes()
    require(hashlib.sha256(original).hexdigest() == CODEX_ORIGINAL, "Pinned upstream action.yml differs; review the upgrade")
    require(original.count(CODEX_STEP_START) == original.count(CODEX_STEP_END) == 1, "Expected one exact namespace setup step")
    start = original.index(CODEX_STEP_START)
    end = original.index(CODEX_STEP_END, start)
    updated = original[:start] + original[end:]
    require(hashlib.sha256(updated).hexdigest() == CODEX_ADAPTED, "Unexpected action transformation; review the upgrade")
    require(b"sysctl -w" not in updated and b"kernel.apparmor_restrict_unprivileged_userns=0" not in updated,
            "Unexpected global policy mutation remains")
    path.write_bytes(updated)
    print(json.dumps({"upstream": CODEX_SHA, "originalSha256": CODEX_ORIGINAL,
                      "adaptedSha256": hashlib.sha256(updated).hexdigest(), "removed": "Enable Linux user namespaces for bubblewrap"}))



def validate_recaches(log, fixtures):
    log = regular(log)
    require(all(FIXTURE.fullmatch(path) and not path.endswith((".static.json", ".fake.json"))
                and not Path(path).name.startswith("getCrumb-geo-") for path in fixtures), "Unsafe recache validation path")
    for path in fixtures:
        regular(ROOT / path)
    bun, _, _ = runtimes()
    with tempfile.TemporaryDirectory(prefix="yf-recache-validation-") as value:
        scratch = Path(value).resolve()
        child = guarded(ROOT, scratch, [bun, "--no-env-file", ROOT / "scripts/check-recache-rate-limits.ts", log, *fixtures])
        print(child.stdout, end="", flush=True)


def _nul_records(output):
    if not output:
        return []
    require(output.endswith("\0"), "Git change inventory must be NUL terminated")
    return output[:-1].split("\0")


def _ordinary_fixture(path):
    return bool(FIXTURE.fullmatch(path) and not path.endswith((".static.json", ".fake.json"))
                and not Path(path).name.startswith("getCrumb-geo-"))


def _staged_fixture_paths(*, allow_empty=False):
    # No path filter: a removal outside fixtures must not disappear behind its
    # ordinary destination. Disable rename/copy folding so both endpoints remain.
    records = _nul_records(git("diff", "--cached", "--raw", "--no-abbrev", "--no-renames", "-z", "--"))
    require(len(records) % 2 == 0, "Malformed staged change inventory")
    paths = []
    for metadata, path in zip(records[::2], records[1::2]):
        fields = metadata[1:].split() if metadata.startswith(":") else []
        require(len(fields) == 5, "Malformed staged change metadata")
        old_mode, new_mode, _, _, status = fields
        require(status in {"A", "M"}, "Staged recache permits additions/modifications only; removals, renames, copies and type changes are forbidden")
        require(_ordinary_fixture(path), "Staged recache paths include protected or unrelated files")
        require(new_mode == "100644" and old_mode == ("000000" if status == "A" else "100644"),
                "Staged fixture must remain regular 0644 without mode changes")
        paths.append(path)
    require((paths or allow_empty) and len(paths) == len(set(paths)), "Expected unique staged fixture additions/modifications")
    return paths


def working_fixture_paths():
    # Checked Git exit status and NUL records avoid shell quoting, dropped
    # rename sources and process-substitution failures. All paths are inspected.
    records = _nul_records(git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"))
    paths = []
    for record in records:
        require(len(record) >= 4 and record[2] == " ", "Malformed working change inventory")
        status, path = record[:2], record[3:]
        require(status in {"??", "A ", "AM", " A", " M", "M ", "MM"},
                "Working recache permits additions/modifications only; removals, renames, copies, type changes and conflicts are forbidden")
        require(_ordinary_fixture(path), "Working recache paths include protected or unrelated files")
        target = regular(ROOT / path)
        require(not target.stat().st_mode & 0o111, "Working fixture must remain regular 0644 without executable mode changes")
        paths.append(path)
    require(len(paths) == len(set(paths)), "Expected unique working fixture paths")
    # Also detect staged mode/type/removal changes masked by current file bytes.
    _staged_fixture_paths(allow_empty=True)
    return sorted(paths)


def check_staged_fixtures():
    working = working_fixture_paths()
    paths = _staged_fixture_paths()
    require(set(paths) == set(working), "Staged fixture paths differ from validated working paths")
    for path in paths:
        content = regular(ROOT / path).read_bytes()
        blob = subprocess.run(["/usr/bin/git", "show", ":" + path], cwd=ROOT, env=clean_environment(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True).stdout
        require(blob == content, "Staged fixture differs from validated working bytes")
    print(f"Validated {len(paths)} staged fixture paths and exact bytes")


def main(arguments):
    if len(arguments) in (2, 4) and arguments[0] == "prepare":
        prepare(*arguments[1:])
    elif len(arguments) == 3 and arguments[0] == "verify":
        verify(arguments[1], os.environ.get("PROPOSAL", ""), Path(arguments[2]))
    elif len(arguments) == 3 and arguments[0] == "restore":
        restore(arguments[1], Path(arguments[2]))
    elif arguments == ["adapt-codex"]:
        adapt_codex(ROOT / ".trusted-codex-action/action.yml")
    elif len(arguments) >= 2 and arguments[0] == "validate-recache":
        validate_recaches(arguments[1], arguments[2:])
    elif arguments == ["inventory-fixtures"]:
        sys.stdout.write("".join(path + "\0" for path in working_fixture_paths()))
    elif arguments == ["check-staged-fixtures"]:
        check_staged_fixtures()
    else:
        raise RuntimeError("Expected prepare BASE [DRIFT ISSUE], verify BASE OUTPUT, restore BASE ARTIFACT, adapt-codex, inventory-fixtures or check-staged-fixtures")


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Repair CI failed: {error}", file=sys.stderr)
        sys.exit(1)
