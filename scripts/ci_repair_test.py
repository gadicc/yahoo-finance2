"""Offline workflow/boundary regressions. Privileged setup and model calls never run."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ci_repair", Path(__file__).with_name("ci_repair.py"))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class Repository:
    def __init__(self, directory):
        self.root = Path(directory)
        self.root.mkdir()
        self.git("init", "--quiet")
        self.put("deno.json", '{}\n')
        self.legacy = self.commit()
        for name in ("scripts/test.ts", "scripts/schema-gen.ts", "scripts/typecheck.ts", "scripts/schema-repair.ts", "scripts/ci_repair.py", "scripts/testing/offline.py", "biome.json",
                     "scripts/docs.ts", "scripts/docs/inputs.ts", "scripts/docs/worker.ts", "scripts/docs/model.ts",
                     "scripts/docs/diagnostics-baseline.json", "scripts/docs/parser-compatibility.json", "tsconfig.library.json"):
            self.put(name, "trusted input\n")
        self.put("package.json", '{"packageManager":"bun@1.4.3","scripts":{"postinstall":"touch CANDIDATE_HOOK_MUST_NOT_RUN"}}\n')
        self.put(".bun-version", "1.4.3\n")
        self.put("bun.lock", "trusted lock\n")
        self.put(".gitignore", "/node_modules\n/candidate\n")
        self.put("tests/fixtures/http/quote-example.json", '{"old":true}\n')
        self.base = self.commit()
        (self.root / "node_modules").mkdir()

    def put(self, name, content):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return target

    def git(self, *arguments):
        return subprocess.check_output(["/usr/bin/git", *arguments], cwd=self.root, env=ci.clean_environment(), text=True, stderr=subprocess.DEVNULL)

    def commit(self):
        self.git("add", ".")
        self.git("-c", "user.name=Offline Control", "-c", "user.email=control@example.invalid", "commit", "--quiet", "-m", "test input")
        sha = self.git("rev-parse", "HEAD").strip()
        self.git("update-ref", "refs/remotes/origin/dev", sha)
        return sha


class PreparationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.repository = Repository(Path(temporary.name) / "trusted")
        self.root = self.repository.root
        self.documentation_paths = []
        discovery = patch.object(ci, "documentation_configurations", side_effect=lambda root: self.documentation_paths)
        discovery.start(); self.addCleanup(discovery.stop)
        for name, value in (("ROOT", self.root), ("CANDIDATE", self.root / "candidate")):
            context = patch.object(ci, name, value)
            context.start(); self.addCleanup(context.stop)

    def test_exact_closure_prepares_without_candidate_lifecycle(self):
        ci.prepare(self.repository.base)
        self.assertEqual((ci.CANDIDATE / "node_modules").resolve(), ci.CANDIDATE / "node_modules")
        self.assertFalse((ci.CANDIDATE / "node_modules").is_symlink())
        self.assertFalse((ci.CANDIDATE / "CANDIDATE_HOOK_MUST_NOT_RUN").exists())
        self.assertEqual(ci.git("status", "--porcelain", cwd=ci.CANDIDATE), "")

    def test_legacy_or_changed_tooling_refuses_before_worktree_or_hooks(self):
        for base in (self.repository.legacy,):
            with self.assertRaisesRegex(RuntimeError, "Incompatible repair base"):
                ci.prepare(base)
            self.assertFalse(ci.CANDIDATE.exists())
        self.repository.put("scripts/test.ts", "changed tool\n")
        changed = self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base"):
            ci.prepare(self.repository.base)
        self.assertFalse(ci.CANDIDATE.exists())
        self.assertNotEqual(changed, self.repository.base)

    def test_nested_documentation_config_blob_presence_and_local_edits_are_bound(self):
        for name in ("config/compiler/deep.jsonc", "config/docs/base.json"):
            self.repository.put(name, '{"compilerOptions":{}}\n')
        self.documentation_paths[:] = ["tsconfig.library.json", "config/compiler/deep.jsonc", "config/docs/base.json"]
        base = self.repository.commit()
        self.assertGreater(ci.compatible(base), 0)
        self.repository.put("config/compiler/deep.jsonc", '{"compilerOptions":{"strict":false}}\n')
        with self.assertRaisesRegex(RuntimeError, "configuration has local edits"):
            ci.compatible(base)
        self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base documentation configuration"):
            ci.compatible(base)
        self.repository.git("reset", "--hard", "--quiet", base)
        self.repository.put("config/docs/new.jsonc", '{}\n')
        self.documentation_paths.append("config/docs/new.jsonc")
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base documentation configuration"):
            ci.compatible(base)
        self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base documentation configuration"):
            ci.compatible(base)

    def test_nested_documentation_config_modes_are_bound(self):
        path = self.repository.put("config/compiler/base.jsonc", '{}\n')
        self.documentation_paths[:] = ["tsconfig.library.json", "config/compiler/base.jsonc"]
        base = self.repository.commit()
        path.chmod(0o755)
        self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base documentation configuration"):
            ci.compatible(base)

    def test_optional_tsdoc_presence_and_drift_are_incompatible(self):
        self.repository.put("tsdoc.json", '{"extends":[]}\n')
        present = self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base"):
            ci.compatible(self.repository.base)
        self.repository.put("tsdoc.json", '{"extends":[],"noStandardTags":true}\n')
        self.repository.commit()
        with self.assertRaisesRegex(RuntimeError, "Incompatible repair base"):
            ci.compatible(present)

    def test_local_trusted_tool_edit_is_not_authorized_by_matching_commit(self):
        self.repository.put("scripts/schema-repair.ts", "uncommitted guard replacement\n")
        with self.assertRaisesRegex(RuntimeError, "local edits"):
            ci.prepare(self.repository.base)
        self.assertFalse(ci.CANDIDATE.exists())

    def test_fixture_only_drift_is_preserved_and_protected_inputs_rejected(self):
        path = self.repository.put("tests/fixtures/http/quote-example.json", '{"observed":true}\n')
        drift = self.repository.commit()
        ci.prepare(drift, drift, "7")
        self.assertEqual((ci.CANDIDATE / path.relative_to(self.root)).read_bytes(), path.read_bytes())

    def test_invalid_sha_or_issue_never_creates_candidate(self):
        for base, drift, issue in (("dev", self.repository.base, "7"), (self.repository.base, "main", "7"), (self.repository.base, self.repository.base, "0")):
            with self.subTest(base=base, drift=drift, issue=issue), self.assertRaises(RuntimeError):
                ci.prepare(base, drift, issue)
            self.assertFalse(ci.CANDIDATE.exists())

    def test_protected_or_unrelated_drift_is_rejected(self):
        for name in ("tests/fixtures/http/quote.static.json", "tests/fixtures/http/quote.fake.json", "tests/fixtures/http/getCrumb-geo-gb-test.json", "README.md"):
            self.repository.put(name, '{}\n')
            drift = self.repository.commit()
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "unprotected"):
                ci.prepare(drift, drift, "7")
            self.assertFalse(ci.CANDIDATE.exists())

    def test_changed_recorded_fixture_tree_is_rejected(self):
        self.repository.put("tests/fixtures/http/quote-example.json", '{"drift":1}\n')
        drift = self.repository.commit()
        self.repository.put("tests/fixtures/http/quote-example.json", '{"drift":2}\n')
        base = self.repository.commit()
        with self.assertRaises(RuntimeError):
            ci.prepare(base, drift, "7")
        self.assertFalse(ci.CANDIDATE.exists())

    def test_git_environment_disables_hostile_fsmonitor_and_inherited_config(self):
        marker = self.root / "HOOK_EXECUTED"
        hook = self.repository.put(".git/monitor", f"#!/bin/sh\ntouch {marker}\n")
        hook.chmod(0o755)
        self.repository.git("config", "core.fsmonitor", str(hook))
        with patch.dict(os.environ, {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "core.fsmonitor", "GIT_CONFIG_VALUE_0": str(hook), "GIT_EXTERNAL_DIFF": str(hook)}):
            ci.git("diff", "--name-only")
        self.assertFalse(marker.exists())

    def test_staged_bytes_must_match_validated_regular_unprotected_fixture(self):
        self.repository.put("tests/fixtures/http/quote-example.json", '{"new":true}\n')
        self.repository.git("add", "tests/fixtures/http/quote-example.json")
        ci.check_staged_fixtures()
        self.repository.put("tests/fixtures/http/quote-example.json", '{"changedAfterValidation":true}\n')
        with self.assertRaisesRegex(RuntimeError, "Staged fixture differs"):
            ci.check_staged_fixtures()

    def test_dependency_copy_preserves_relative_links_without_shared_inodes(self):
        graph = self.root / "node_modules"
        (graph / "package").mkdir()
        source = graph / "package/tool.js";source.write_text("trusted package bytes")
        (graph / "tool").symlink_to("package/tool.js")
        ci.prepare(self.repository.base)
        copied = ci.CANDIDATE / "node_modules/package/tool.js"
        self.assertEqual(copied.read_bytes(), source.read_bytes())
        self.assertNotEqual(copied.stat().st_ino, source.stat().st_ino)
        self.assertEqual(copied.stat().st_nlink, 1)
        self.assertEqual(os.readlink(ci.CANDIDATE / "node_modules/tool"), "package/tool.js")
        copied.write_text("candidate-only mutation")
        self.assertEqual(source.read_text(), "trusted package bytes")
        with self.assertRaisesRegex(RuntimeError, "differ"):
            ci.validate_candidate(self.repository.base)

    def test_dependency_external_links_are_refused_before_copy(self):
        graph = self.root / "node_modules"
        (graph / "escape").symlink_to(self.root / "package.json")
        with self.assertRaisesRegex(RuntimeError, "inside the frozen graph"):
            ci.prepare(self.repository.base)
        self.assertFalse((ci.CANDIDATE / "node_modules").exists())

    def test_staged_and_unstaged_renames_reject_source_endpoints(self):
        for source in ("tests/fixtures/http/quote.static.json", "tests/fixtures/http/quote.fake.json", "tests/fixtures/http/getCrumb-geo-gb-test.json", "outside.json", "tests/fixtures/http/ordinary.json"):
            self.repository.put(source, '{"source":true}\n')
            self.repository.commit()
            destination = "tests/fixtures/http/new.json"
            for staged in (False, True):
                if staged:
                    self.repository.git("mv", source, destination)
                    self.assertIn("R100", self.repository.git("diff", "--cached", "--find-renames=100%", "--name-status"))
                else:
                    (self.root / source).rename(self.root / destination)
                with self.subTest(source=source, staged=staged):
                    with self.assertRaisesRegex(RuntimeError, "additions/modifications only"):
                        ci.working_fixture_paths()
                    with self.assertRaisesRegex(RuntimeError, "additions/modifications only"):
                        ci.check_staged_fixtures()
                self.repository.git("reset", "--hard", "--quiet", "HEAD")
                self.repository.git("clean", "-f", "-q", "--", destination)

    def test_removal_type_and_masked_staged_mode_changes_fail(self):
        source = "tests/fixtures/http/quote-example.json"
        for change in ("remove", "type", "mode"):
            path = self.root / source
            if change == "remove":
                path.unlink()
            elif change == "type":
                path.unlink();path.symlink_to(self.root / "package.json")
            else:
                path.chmod(0o755)
            self.repository.git("add", "--", source)
            if change == "mode":
                path.chmod(0o644)  # Current mode must not mask the staged mode.
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, "forbidden|mode changes"):
                ci.check_staged_fixtures()
            self.repository.git("reset", "--hard", "--quiet", "HEAD")

    def test_ordinary_modified_added_and_duplicate_content_additions_pass(self):
        source = self.root / "tests/fixtures/http/quote-example.json"
        original = source.read_bytes()
        modified = self.repository.put("tests/fixtures/http/modified.json", '{"previous":true}\n')
        self.repository.commit()
        self.repository.put("tests/fixtures/http/duplicate.json", original.decode())
        self.repository.put("tests/fixtures/http/added.json", '{"new":true}\n')
        modified.write_text('{"modified":true}\n')
        self.assertEqual(len(ci.working_fixture_paths()), 3)
        self.repository.git("add", "tests/fixtures/http")
        ci.check_staged_fixtures()
        self.assertEqual((self.root / "tests/fixtures/http/duplicate.json").read_bytes(), original)
        self.assertEqual(source.read_bytes(), original)

    def test_staged_and_working_path_sets_must_match(self):
        self.repository.put("tests/fixtures/http/staged.json", '{}\n')
        self.repository.git("add", "tests/fixtures/http/staged.json")
        self.repository.put("tests/fixtures/http/unstaged.json", '{}\n')
        with self.assertRaisesRegex(RuntimeError, "Staged fixture paths differ"):
            ci.check_staged_fixtures()

    def test_nul_inventory_refuses_unusual_paths_and_git_failures(self):
        for path in ("tests/fixtures/http/space name.json", "tests/fixtures/http/line\nname.json"):
            target = self.repository.put(path, '{}\n')
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError, "protected or unrelated"):
                ci.working_fixture_paths()
            target.unlink()
        with patch.object(ci, "run", return_value=subprocess.CompletedProcess([], 1, "must-not-be-an-empty-inventory")):
            with self.assertRaisesRegex(RuntimeError, "Trusted Git operation failed"):
                ci.working_fixture_paths()
        with self.assertRaisesRegex(RuntimeError, "NUL terminated"):
            ci._nul_records("unterminated")

    def test_reported_non_add_modify_staged_statuses_are_never_accepted(self):
        for status in ("R100", "C100", "D", "T", "U"):
            raw = ":100644 100644 " + "0"*40 + " " + "1"*40 + " " + status + "\0tests/fixtures/http/new.json\0"
            with self.subTest(status=status), patch.object(ci, "git", return_value=raw):
                with self.assertRaisesRegex(RuntimeError, "additions/modifications only"):
                    ci._staged_fixture_paths()

    def test_staged_protected_or_unrelated_files_fail(self):
        self.repository.put("tests/fixtures/http/getCrumb-geo-gb-new.json", '{}\n')
        self.repository.git("add", "tests/fixtures/http/getCrumb-geo-gb-new.json")
        with self.assertRaisesRegex(RuntimeError, "protected or unrelated"):
            ci.check_staged_fixtures()


class BoundaryTests(unittest.TestCase):
    def test_environment_excludes_credentials_loaders_and_inherited_capture_settings(self):
        with patch.dict(os.environ, {"GH_TOKEN": "private", "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "private", "NODE_OPTIONS": "--import evil", "BUN_OPTIONS": "evil", "LD_PRELOAD": "evil", "FETCH_DEVEL": "recache", "FMC_CACHE_MODE": "auto"}):
            env = ci.clean_environment(Path("/private"))
        self.assertFalse({"GH_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "NODE_OPTIONS", "BUN_OPTIONS", "LD_PRELOAD", "FETCH_DEVEL", "FMC_CACHE_MODE"} & env.keys())
        self.assertEqual(env["GIT_CONFIG_GLOBAL"], "/dev/null")

    def test_guard_keeps_host_candidate_and_git_readonly_and_limits_writable_mounts(self):
        with tempfile.TemporaryDirectory() as value:
            parent = Path(value); candidate = parent / "candidate"; scratch = parent / "scratch"
            (candidate / "src/modules").mkdir(parents=True); scratch.mkdir(mode=0o700)
            with patch.object(ci, "runtimes", return_value=(Path("/trusted/bun"), Path("/trusted/node"), ci.clean_environment())), patch.object(ci, "run", return_value=subprocess.CompletedProcess([], 0, "")) as execute:
                ci.guarded(candidate, scratch, ["/trusted/bun", "--no-env-file", "/trusted/tool.ts"], writable_modules=True)
            args = list(map(str, execute.call_args.args[0]))
            binds = [args[index + 1:index + 3] for index, value in enumerate(args) if value == "--bind"]
            self.assertEqual(binds, [[str(scratch)] * 2, [str(candidate / "src/modules")] * 2])
            self.assertIn("--unshare-net", args); self.assertIn("--unshare-pid", args)
            self.assertIn("--seccomp-exec", args)
            self.assertEqual(execute.call_args.kwargs["environment"]["FMC_CACHE_MODE"], "replay")
            self.assertNotIn("--share-net", args)

    def test_documentation_discovery_uses_only_the_guarded_trusted_collector(self):
        with tempfile.TemporaryDirectory() as value:
            root = Path(value)
            paths = ["tsconfig.library.json", "config/deep.jsonc"]
            with patch.object(ci, "runtimes", return_value=(Path("/trusted/bun"), Path("/trusted/node"), {})), patch.object(ci, "guarded", return_value=subprocess.CompletedProcess([], 0, json.dumps(paths))) as execute:
                self.assertEqual(ci.documentation_configurations(root), paths)
            candidate, scratch, command = execute.call_args.args
            self.assertEqual(candidate, root)
            self.assertFalse(scratch.exists())
            self.assertEqual(command[:3], [Path("/trusted/bun"), "--no-env-file", "--eval"])
            self.assertEqual(command[-2], (ci.ROOT / "scripts/docs/inputs.ts").as_uri())
            self.assertEqual(command[-1], root)

    def test_nonprivate_or_overlapping_guard_scratch_fails_before_command(self):
        with tempfile.TemporaryDirectory() as value:
            candidate = Path(value); scratch = candidate / "scratch"; scratch.mkdir(mode=0o700)
            with patch.object(ci, "run") as execute:
                with self.assertRaisesRegex(RuntimeError, "overlap"):
                    ci.guarded(candidate, scratch, ["false"])
                execute.assert_not_called()

    def test_symlinks_and_outside_hardlinks_are_not_inputs(self):
        with tempfile.TemporaryDirectory() as value:
            root = Path(value); source = root / "source"; source.write_text("data")
            alias = root / "alias"; alias.symlink_to(source)
            with self.assertRaises(RuntimeError):ci.regular(alias)
            alias.unlink();os.link(source, alias)
            with self.assertRaises(RuntimeError):ci.regular(source)


class RegenerationTests(unittest.TestCase):
    def stage(self):
        temporary = tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        root = Path(temporary.name); candidate = root / "candidate";scratch = root / "scratch";trusted = root / "trusted"
        for name in ("src/modules/example.ts", "src/modules/example.schema.json", "src/lib/options/options.schema.json"):
            target = candidate / name;target.parent.mkdir(parents=True, exist_ok=True);target.write_text('{}\n')
        scratch.mkdir(mode=0o700);(trusted / "scripts").mkdir(parents=True);(trusted / "node_modules").mkdir()
        (candidate / "node_modules").mkdir()
        (trusted / "deno.json").write_text('{}\n')
        return candidate,scratch,trusted

    def test_full_schema_closure_promotes_only_existing_module_outputs(self):
        candidate,scratch,trusted = self.stage()
        def generate(*args, **kwargs):
            self.assertEqual(args[2][-2:], ["--force", "--verbose"])
            (kwargs["cwd"] / "src/modules/example.schema.json").write_text('{"observed":true}\n')
            return subprocess.CompletedProcess([],0,"")
        with patch.object(ci, "ROOT", trusted), patch.object(ci, "guarded", side_effect=generate):
            result=ci.regenerate(candidate,scratch,Path("/trusted/bun"))
        self.assertEqual(len(result["regeneratedOutputs"]),2)
        self.assertEqual(result["changedModuleSchemas"],["src/modules/example.schema.json"])
        self.assertEqual((candidate / "src/lib/options/options.schema.json").read_text(),'{}\n')

    def test_nonmodule_consumer_change_or_source_mutation_blocks_before_promotion(self):
        for forbidden in ("src/lib/options/options.schema.json", "src/modules/example.ts"):
            candidate,scratch,trusted = self.stage()
            def generate(*args,**kwargs):
                (kwargs["cwd"] / "src/modules/example.schema.json").write_text('{"observed":true}\n')
                (kwargs["cwd"] / forbidden).write_text('{"changed":true}\n')
                return subprocess.CompletedProcess([],0,"")
            with self.subTest(path=forbidden), patch.object(ci,"ROOT",trusted), patch.object(ci,"guarded",side_effect=generate):
                with self.assertRaisesRegex(RuntimeError,"non-module output or source"):
                    ci.regenerate(candidate,scratch,Path("/trusted/bun"))
            self.assertEqual((candidate / "src/modules/example.schema.json").read_text(),'{}\n')


class VerificationFailureTests(unittest.TestCase):
    def test_every_failed_gate_keeps_artifact_and_ready_output_absent_and_cleans_scratch(self):
        gates = ("apply", "format", "lint", "typecheck.ts", "docs.ts", "test.ts", "bundle")
        for failure in gates:
            with self.subTest(gate=failure), tempfile.TemporaryDirectory() as value:
                parent = Path(value); output = parent / "verified.json"; github_output = parent / "github-output"; calls = []; scratches = []
                def guarded(candidate, scratch, command, **kwargs):
                    calls.append(list(map(str, command)));scratches.append(scratch)
                    gate = command[3] if len(command) > 3 and Path(command[2]).name in {"schema-repair.ts", "biome"} else Path(command[2]).name
                    if gate == failure:
                        raise RuntimeError("controlled gate failure")
                    return subprocess.CompletedProcess([],0,json.dumps({"ready":True,"summary":"Review evidence","evidence":[]}))
                with patch.object(ci,"compatible"),patch.object(ci,"validate_candidate"),patch.object(ci,"runtimes",return_value=(Path("/trusted/bun"),Path("/trusted/node"),ci.clean_environment())),patch.object(ci,"guarded",side_effect=guarded),patch.object(ci,"regenerate",return_value={}),patch.object(ci,"git",return_value=""),patch.dict(os.environ,{"GITHUB_OUTPUT":str(github_output)},clear=True):
                    with self.assertRaisesRegex(RuntimeError,"controlled gate failure"):
                        ci.verify("a"*40,'{}',output)
                self.assertFalse(output.exists());self.assertFalse(github_output.exists())
                self.assertTrue(scratches);self.assertTrue(all(not path.exists() for path in scratches))
                self.assertFalse(any("restore" in call for call in calls))

    def test_blocked_proposal_preserves_manual_evidence_without_regeneration(self):
        with tempfile.TemporaryDirectory() as value:
            parent=Path(value);summary=parent/"summary";output=parent/"verified.json"
            blocked={"ready":False,"summary":"Manual runtime repair needed","evidence":["Observed non-type drift"]}
            with patch.object(ci,"compatible"),patch.object(ci,"validate_candidate"),patch.object(ci,"runtimes",return_value=(Path("/trusted/bun"),Path("/trusted/node"),ci.clean_environment())),patch.object(ci,"guarded",return_value=subprocess.CompletedProcess([],0,json.dumps(blocked))),patch.object(ci,"regenerate") as regenerate,patch.dict(os.environ,{"GITHUB_STEP_SUMMARY":str(summary)},clear=True):
                with self.assertRaisesRegex(RuntimeError,"manual repair"):
                    ci.verify("a"*40,'{}',output)
                regenerate.assert_not_called()
            self.assertIn("Manual runtime repair needed",summary.read_text())
            self.assertIn("Observed non-type drift",summary.read_text())
            self.assertFalse(output.exists())


class GuardedDocumentationIntegrationTests(unittest.TestCase):
    def test_real_guarded_allowed_repair_needs_documentation_before_artifact_and_ready(self):
        checkout = ci.ROOT
        with tempfile.TemporaryDirectory(prefix="yf-repair-docs-control-") as value:
            parent = Path(value)
            repository = Repository(parent / "trusted")
            trusted = repository.root
            shutil.copytree(checkout / "scripts", trusted / "scripts", dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("*.test.ts", "*_test.py", "__pycache__"))
            for name in ("package.json", "bun.lock", ".bun-version", "biome.json", "tsconfig.base.json"):
                shutil.copyfile(checkout / name, trusted / name)
            shutil.copytree(checkout / "node_modules", trusted / "node_modules", dirs_exist_ok=True, symlinks=True)
            metadata = json.loads((checkout / "deno.json").read_text())
            metadata["exports"] = {".": "./src/modules/example.ts"}
            repository.put("deno.json", json.dumps(metadata))
            repository.put("config/compiler/base.jsonc", '// Supported nested JSONC configuration.\n{"extends":"../../tsconfig.base.json",}\n')
            repository.put("tsconfig.library.json", json.dumps({"extends":"./config/compiler/base.jsonc", "include":["src/**/*.ts", "bin/**/*.ts"], "exclude":["src/**/*.test.ts"]}))
            repository.put("tsconfig.tools.json", json.dumps({"extends":"./tsconfig.base.json", "compilerOptions":{"allowJs":True,"checkJs":True}, "include":["src/modules/example.ts"]}))
            repository.put("config/docs/tags.json", '{}\n')
            repository.put("tsdoc.json", '{"extends":["./config/docs/tags.json"]}\n')
            original = ("// @yf-schema\n/** Fields in the synthetic successful response. */\n"
                        "export interface Result {\n  /** Numeric count in the synthetic response. */\n  count: number;\n}\n")
            repository.put("src/modules/example.ts", original)
            repository.put("src/modules/example.schema.json", '{}\n')
            repository.put("src/example.test.ts", 'import { test, expect } from "bun:test"; test("synthetic response", () => { expect({count:1, observedLabel:"synthetic"}.observedLabel).toBe("synthetic"); });\n')
            for name in ("yahoo-finance", "yahoo-finance-mcp"):
                repository.put(f"bin/{name}.ts", 'export {};\n')
            base = repository.commit()
            candidate = parent / "candidate"
            output = parent / "verified.json"
            github_output = parent / "github-output"
            with patch.object(ci, "ROOT", trusted), patch.object(ci, "CANDIDATE", candidate), patch.dict(os.environ, {"GITHUB_OUTPUT":str(github_output), "GITHUB_STEP_SUMMARY":str(parent / "github-summary")}):
                discovered = ci.documentation_configurations(trusted)
                self.assertEqual(set(discovered), {"tsconfig.library.json", "tsconfig.base.json", "config/compiler/base.jsonc", "tsdoc.json", "config/docs/tags.json"})
                child = trusted / "config/compiler/base.jsonc"
                before = child.read_bytes()
                child.write_bytes(before + b"\n// Local drift must be rejected.\n")
                with self.assertRaisesRegex(RuntimeError, "configuration has local edits"):
                    ci.compatible(base)
                child.write_bytes(before)
                # Optional TSDoc presence participates in compatibility. The
                # ordinary passing control uses the checkout's no-tsdoc setup;
                # TypeDoc currently rejects tsdoc block-tag override warnings.
                (trusted / "tsdoc.json").unlink()
                without_tsdoc = repository.commit()
                with self.assertRaisesRegex(RuntimeError, "Incompatible repair base"):
                    ci.compatible(base)
                base = without_tsdoc
                ci.prepare(base)
                github_output.unlink()  # prepare's base output is distinct from readiness.
                actual_guard = ci.guarded
                calls = []
                scratches = []
                def observe(*args, **kwargs):
                    calls.append(list(map(str, args[2])))
                    scratches.append(args[1])
                    return actual_guard(*args, **kwargs)
                def proposal(documented):
                    comment = "  /** Label string in the synthetic successful response. */\n" if documented else ""
                    return json.dumps({"status":"repair", "summary":"Model the label string observed in a successful synthetic response.", "evidence":["Disposable synthetic response; no Yahoo request."], "edits":[{"path":"src/modules/example.ts", "before":"  count: number;\n", "after":"  count: number;\n" + comment + "  observedLabel: string;\n"}]})
                with patch.object(ci, "guarded", side_effect=observe):
                    with self.assertRaisesRegex(RuntimeError, "New documentation diagnostics") as failure:
                        ci.verify(base, proposal(False), output)
                self.assertIn("observedLabel", str(failure.exception))
                self.assertIn("observedLabel: string", (candidate / "src/modules/example.ts").read_text())
                self.assertFalse(output.exists())
                self.assertFalse(github_output.exists())
                self.assertTrue(any(Path(command[2]).name == "docs.ts" and command[3:] == ["lint"] for command in calls if len(command) > 3))
                self.assertFalse(any("bundle" in command for command in calls))
                ci.git("reset", "--hard", "--quiet", base, cwd=candidate)
                calls.clear()
                with patch.object(ci, "guarded", side_effect=observe):
                    ci.verify(base, proposal(True), output)
                self.assertTrue(output.exists())
                self.assertEqual(github_output.read_text(), "ready=true\n")
                artifact = json.loads(output.read_text())
                self.assertEqual({file["path"] for file in artifact["files"]}, {"src/modules/example.ts", "src/modules/example.schema.json"})
                docs = next(index for index, command in enumerate(calls) if len(command) > 3 and Path(command[2]).name == "docs.ts")
                bundle = next(index for index, command in enumerate(calls) if "bundle" in command)
                self.assertLess(docs, bundle)
                self.assertTrue(scratches)
                self.assertTrue(all(not path.exists() for path in scratches))


class ActionAndWorkflowTests(unittest.TestCase):
    def test_exact_action_transformation_and_all_drift_fail_closed(self):
        prefix=b'name: Synthetic pinned action\n'; step=ci.CODEX_STEP_START+b'      run: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0\n'; suffix=ci.CODEX_STEP_END+b'      run: retained-drop-sudo\n'
        original=prefix+step+suffix;expected=prefix+suffix
        with tempfile.TemporaryDirectory() as value:
            root=Path(value);path=root/'.trusted-codex-action/action.yml';path.parent.mkdir();path.write_bytes(original)
            def git(*args,**kwargs):return ci.CODEX_SHA+'\n' if args[0]=='rev-parse' else ''
            with patch.object(ci,'ROOT',root),patch.object(ci,'git',side_effect=git),patch.object(ci,'CODEX_ORIGINAL',hashlib.sha256(original).hexdigest()),patch.object(ci,'CODEX_ADAPTED',hashlib.sha256(expected).hexdigest()):
                ci.adapt_codex(path)
                self.assertEqual(path.read_bytes(),expected)
                with self.assertRaisesRegex(RuntimeError,'differs'):
                    ci.adapt_codex(path)
                self.assertEqual(path.read_bytes(),expected)
            path.write_bytes(original)
            with patch.object(ci,'ROOT',root),patch.object(ci,'git',side_effect=git):
                with self.assertRaisesRegex(RuntimeError,'differs'):
                    ci.adapt_codex(path)
            self.assertEqual(path.read_bytes(),original)

    def test_compatibility_includes_adjacent_tests_nested_git_config_and_root_executable_config(self):
        for path in ("src/modules/quote.test.ts", "src/lib/options/options.test.ts", "src/modules/.gitattributes", "tests/support/.gitignore", "release.config.mjs", "bun.lock"):
            self.assertTrue(ci.closure(path), path)
        for path in ("tests/fixtures/http/quote.json", "tests/migration/results/receipt.json", "docs/schema-repair.md", "src/modules/quote.ts"):
            self.assertFalse(ci.closure(path), path)

    def test_workflow_keeps_triggers_authority_artifact_and_live_opt_in(self):
        workflow=(ci.ROOT/'.github/workflows/recache-yahoo-fixtures.yaml').read_text()
        for expected in ('cron: "37 3 * * *"','group: yahoo-fixtures-recache-dev','cancel-in-progress: false','node scripts/workflow-policy.mjs recache','FETCH_DEVEL: recache','scripts/recache-tests.ts --live','safety-strategy: drop-sudo','sandbox: workspace-write','name: verified-schema-repair','if-no-files-found: error','ref: ${{ github.workflow_sha }}','--force-with-lease="refs/heads/$branch:"','SCHEMA_REPAIR_ENABLED'):
            self.assertIn(expected,workflow)
        self.assertNotIn('deno ',workflow);self.assertNotIn('setup-deno',workflow)
        self.assertNotIn('pull_request_target',workflow)
        self.assertIn('python3 -I -B scripts/ci_repair.py check-staged-fixtures',workflow)
        self.assertIn('uses: ./.trusted-codex-action',workflow)
        verifier=workflow.split('  verify-repair:\n',1)[1].split('  publish-repair:\n',1)[0]
        self.assertNotIn('id-token:',verifier);self.assertNotIn('GH_TOKEN',verifier)
        self.assertIn('contents: read',verifier)
