"""Synthetic CI failures stay local; actual kernel controls use `ci.py guard`."""
from pathlib import Path
import json
import hashlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import ci


def report(name="src/example.ts", line=1, count=1):
    return f"TN:\nSF:{name}\nFNF:1\nFNH:1\nDA:{line},{count}\nLF:1\nLH:{int(count > 0)}\nend_of_record\n"


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "src").mkdir()
        (self.root / "src/example.ts").write_text("export const value = 1;\n")
        self.path = self.root / "lcov.info"
        self.path.write_text(report())

    def validate(self):
        return ci.validate_lcov(self.root, self.path, {"src/example.ts"})

    def test_native_totals_and_zero_hits(self):
        self.assertEqual(self.validate()["sources"], 1)
        self.path.write_text(report(count=0))
        self.assertEqual(self.validate()["linesHit"], 0)

    def test_empty_partial_duplicate_and_malformed_reports_fail(self):
        for data in ("", report().replace("end_of_record", ""), report() * 2,
                     report().replace("FNH:1", "FNH:2"), report().replace("LH:1", "LH:0"),
                     report(line=2), report().replace("DA:1,1", "DA:1,1\nDA:1,1"),
                     report().replace("DA:1,1", "DA:0,-1"),
                     report().replace("FNF:1\n", ""), report().replace("FNH:1\n", ""),
                     report().replace("FNF:1", "FNF:1\nFNF:1"),
                     report(count=9007199254740992),
                     report().replace("FNF:1", "FNF:9007199254740992"),
                     report().replace("LF:1", "LF:9007199254740992")):
            with self.subTest(data=data):
                self.path.write_text(data)
                with self.assertRaises(ValueError):
                    self.validate()

    def test_unsafe_generated_test_experiment_and_missing_paths_fail(self):
        for name in ("/etc/passwd", "../src/example.ts", "src/./example.ts", "src//example.ts",
                     "src\\example.ts", "npm/index.js", "tests/migration/results/old.ts",
                     "src/example.test.ts", "tests/cloudflare/worker.ts", "src/missing.ts"):
            self.path.write_text(report(name))
            with self.subTest(name=name), self.assertRaises((ValueError, OSError)):
                self.validate()

    def test_default_inventory_requires_public_runtime_enums(self):
        # Exercise the default export-derived inventory, not the explicit-set
        # override used by the focused parser controls above.
        (self.root / "src/example.ts").unlink()
        exports = json.loads((ci.ROOT / "deno.json").read_text())["exports"]
        (self.root / "deno.json").write_text(json.dumps({"exports": exports}))
        names = ci.REQUIRED_SOURCES | {value.removeprefix("./") for value in exports.values()}
        for name in names:
            source = self.root / name
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text("export const value = 1;\n")
        (self.root / "scripts").mkdir(exist_ok=True)
        (self.root / "scripts/coverage-policy.json").write_text(json.dumps({
            "typeOnly": {"src/lib/moduleCommon.ts": {
                "sha256": hashlib.sha256((self.root / "src/lib/moduleCommon.ts").read_bytes()).hexdigest(),
                "reason": "Synthetic type-only inventory exception",
            }}, "externalControls": {},
        }))
        omitted = {"src/lib/moduleCommon.ts", "src/modules/quoteSummary-iface.ts"}
        complete = "".join(report(name) for name in sorted(names - omitted))
        self.path.write_text(complete)
        with self.assertRaisesRegex(ValueError, "quoteSummary-iface\\.ts"):
            ci.validate_lcov(self.root, self.path)
        # Four runtime enums must be present; the truly type-only module need
        # not emit a record for the complete default inventory to pass.
        self.path.write_text(complete + report("src/modules/quoteSummary-iface.ts"))
        self.assertEqual(ci.validate_lcov(self.root, self.path)["sources"], len(names) - 1)
        self.path.write_text(complete.replace("FNF:1\nFNH:1\n", ""))
        with self.assertRaisesRegex(ValueError, "quoteSummary-iface\\.ts"):
            ci.validate_lcov(self.root, self.path, merged_lines=True)
        self.path.write_text(self.path.read_text() + report("src/modules/quoteSummary-iface.ts").replace("FNF:1\nFNH:1\n", ""))
        self.assertEqual(ci.validate_lcov(self.root, self.path, merged_lines=True)["sources"], len(names) - 1)

    def test_missing_expected_source_and_symlink_alias_fail(self):
        with self.assertRaises(ValueError):
            ci.validate_lcov(self.root, self.path, {"src/other.ts"})
        (self.root / "src/alias.ts").symlink_to("example.ts")
        self.path.write_text(report("src/alias.ts"))
        with self.assertRaises(ValueError):
            self.validate()
        self.path.unlink()
        self.path.symlink_to(self.root / "src/example.ts")
        with self.assertRaises(ValueError):
            self.validate()


class CoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ("src", "bin", "scripts"):
            (self.root / name).mkdir()
        (self.root / "src/example.ts").write_text("export const value = 1;\n")
        (self.root / "deno.json").write_text(json.dumps({"exports": {".": "./src/example.ts"}}))
        self.path = self.root / "lcov.info"
        self.path.write_text(report().replace("FNF:1\nFNH:1\n", ""))
        self.policy = {"typeOnly": {}, "externalControls": {}}
        self.save()

    def save(self):
        (self.root / "scripts/coverage-policy.json").write_text(json.dumps(self.policy))

    def test_new_unimported_runtime_sources_fail_complete_coverage(self):
        with patch.object(ci, "REQUIRED_SOURCES", set()):
            self.assertEqual(ci.validate_lcov(self.root, self.path, merged_lines=True)["sources"], 1)
            for name in ("src/unimported.ts", "src/unimported.mts", "src/unimported.cts", "src/unimported.tsx", "src/unimported.jsx", "bin/unimported.cjs", "bin/unimported.ts", "scripts/unimported.mjs", "release.config.mjs"):
                with self.subTest(name=name):
                    (self.root / name).write_text("export const untested = 1;\n")
                    with self.assertRaisesRegex(ValueError, "Incomplete full-suite coverage"):
                        ci.validate_lcov(self.root, self.path, merged_lines=True)
                    (self.root / name).unlink()

    def test_type_only_exceptions_bind_exact_bytes_and_external_controls_cannot_hide_production(self):
        source = self.root / "src/types.ts"
        source.write_text("export interface Shape { value: string }\n")
        self.policy["typeOnly"]["src/types.ts"] = {
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "reason": "No runtime emission",
        }
        self.save()
        self.assertEqual(ci.coverage_sources(self.root)[0], {"src/example.ts"})
        source.write_text("export const runtime = 1;\n")
        with self.assertRaisesRegex(ValueError, "needs review"):
            ci.coverage_sources(self.root)
        self.policy["typeOnly"] = {}
        for name in ("src/example.ts", "bin/entry.ts"):
            (self.root / name).write_text("export const value = 1;\n")
            self.policy["externalControls"] = {name: "would conceal shipped code"}
            self.save()
            with self.assertRaisesRegex(ValueError, "Invalid external"):
                ci.coverage_sources(self.root)

    def test_external_controls_are_explicit_existing_paths_with_nonempty_reasons(self):
        (self.root / "scripts/child.py").write_text("print('controlled child')\n")
        self.policy["externalControls"] = {"scripts/child.py": "Python subprocess control, not Bun-instrumented"}
        self.save()
        required, qualifications = ci.coverage_sources(self.root)
        self.assertEqual(required, {"src/example.ts"})
        self.assertEqual(qualifications, self.policy)
        for entries in ({"scripts/missing.py": "stale"}, {"scripts/child.py": " "}):
            self.policy["externalControls"] = entries
            self.save()
            with self.assertRaises(ValueError):
                ci.coverage_sources(self.root)

    def test_source_symlinks_fail_and_type_declarations_and_tests_are_not_runtime_sources(self):
        (self.root / "src/linked.ts").symlink_to("example.ts")
        with self.assertRaisesRegex(ValueError, "symlink alias"):
            ci.coverage_sources(self.root)
        (self.root / "src/linked.ts").unlink()
        for name in ("src/types.d.ts", "src/example.test.ts", "scripts/ci_test.py"):
            (self.root / name).write_text("test or type-only declaration")
        self.assertEqual(ci.coverage_sources(self.root)[0], {"src/example.ts"})


    def test_nested_and_root_directory_aliases_cannot_hide_unimported_sources(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "unimported.ts").write_text("export const hidden = 1;\n")
        nested = self.root / "src/linked-directory"
        nested.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink alias"):
            ci.coverage_sources(self.root)
        nested.unlink()
        (self.root / "src").rename(self.root / "original-src")
        (self.root / "src").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "directory must not be an alias"):
            ci.coverage_sources(self.root)


class CoverageMergeTests(unittest.TestCase):
    def test_union_disjoint_lines_without_fabricated_function_totals(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value);(root/'src').mkdir();(root/'src/a.ts').write_text('one\ntwo\n')
            (root/'src/b.ts').write_text('three\n')
            first=root/'first';second=root/'second';output=root/'merged'
            # Actual Bun batch function pairs differ because identities are not
            # exported. Neither these totals nor equal-cardinality profiles can
            # reconstruct the union's function count or percentage.
            for left,right in (((7,4),(13,12)),((17,11),(8,0)),((2,1),(2,1))):
                with self.subTest(left=left,right=right):
                    first.write_text(report('src/a.ts',1,2).replace('FNF:1',f'FNF:{left[0]}').replace('FNH:1',f'FNH:{left[1]}'))
                    second.write_text(report('src/a.ts',1,3).replace('FNF:1',f'FNF:{right[0]}').replace('FNH:1',f'FNH:{right[1]}') + report('src/b.ts',1,4))
                    ci.merge_lcov(root,[first,second],output)
                    data=output.read_text()
                    self.assertIn('DA:1,5',data)
                    self.assertEqual(data.count('SF:src/a.ts'),1)
                    self.assertNotIn('FN',data)
                    summary=ci.validate_lcov(root,output,{'src/a.ts','src/b.ts'},merged_lines=True)
                    self.assertEqual(summary['sources'],2)
                    self.assertIsNone(summary['functions'])
                    self.assertIsNone(summary['functionsHit'])
                    self.assertIn('identities',summary['functionsUnavailable'])
                    with self.assertRaises(ValueError):ci.validate_lcov(root,output,{'src/a.ts'})
                    output.unlink()
            first.write_text(report('src/a.ts',1,0).replace('FNH:1','FNH:0'))
            second.write_text(report('src/a.ts',2,1))
            ci.merge_lcov(root,[first,second],output)
            self.assertIn('DA:1,0\nDA:2,1\nLF:2\nLH:1',output.read_text())

    def test_merged_line_mode_rejects_any_function_fields_and_missing_sources(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value);(root/'src').mkdir();(root/'src/example.ts').write_text('one\n')
            output=root/'merged'
            lines=report().replace('FNF:1\nFNH:1\n','')
            for fields in ('FNF:1\n','FNH:1\n','FNF:1\nFNH:1\n','FN:1,fn\n','FNDA:1,fn\n'):
                output.write_text(lines.replace('DA:',fields+'DA:'))
                with self.subTest(fields=fields),self.assertRaises(ValueError):
                    ci.validate_lcov(root,output,{'src/example.ts'},merged_lines=True)
            output.write_text(lines)
            with self.assertRaises(ValueError):ci.validate_lcov(root,output,{'src/missing.ts'},merged_lines=True)

    def test_invalid_partial_reports_never_produce_merged_output(self):
        for invalid in (report()*2,report().replace('end_of_record',''),report().replace('FNH:1','FNH:2'),report().replace('FNF:1\n',''),report().replace('FNH:1\n',''),report().replace('DA:1,1','DA:1,1\nDA:1,2'),report('../src/a.ts'),report().replace('DA:1,1','DA:1,9007199254740992'),report().replace('FNF:1','FNF:9007199254740992')):
            with self.subTest(invalid=invalid),tempfile.TemporaryDirectory() as value:
                root=Path(value);(root/'src').mkdir();(root/'src/example.ts').write_text('one\n')
                first=root/'first';second=root/'second';output=root/'merged'
                first.write_text(report());second.write_text(invalid)
                with self.assertRaises((ValueError,OSError)):ci.merge_lcov(root,[first,second],output)
                self.assertFalse(output.exists())

    def test_safe_counts_that_overflow_when_summed_fail(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value);(root/'src').mkdir();(root/'src/example.ts').write_text('one\n')
            first=root/'first';second=root/'second';output=root/'merged'
            first.write_text(report(count=9007199254740991));second.write_text(report(count=1))
            with self.assertRaises(ValueError):ci.merge_lcov(root,[first,second],output)
            self.assertFalse(output.exists())


class CoverageCombineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ("src", "bin", "scripts"):
            (self.root / name).mkdir()
        self.names = ci.REQUIRED_SOURCES | {"src/example.ts", "scripts/testing/native.ts", "scripts/native-platform.ts", "src/lib/runtimeGlobal.ts"}
        for name in self.names:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("export const example = 1;\n")
        (self.root / "deno.json").write_text(json.dumps({"exports": {".": "./src/example.ts"}}))
        (self.root / "scripts/coverage-policy.json").write_text(json.dumps({"typeOnly": {}, "externalControls": {}}))
        self.strict = self.root / "strict"
        self.native = [self.root / ("proof-" + phase) / "lcov.info" for phase in ("install", "replay", "package")]
        self.output = self.root / "combined"
        self.strict_data = "".join(report(name, count=0).replace("FNF:1\nFNH:1\n", "") for name in sorted(self.names))
        self.strict.write_text(self.strict_data)
        for index, path in enumerate(self.native):
            path.parent.mkdir()
            path.write_text(report("scripts/native-platform.ts", count=index+1) + report("src/lib/runtime-detect.ts"))
        (self.root / ".bun-version").write_text("1.4.3\n")
        (self.root / "bun.lock").write_text("frozen lock")
        (self.root / "package.json").write_text("frozen manifest")
        (self.root / "tests/package").mkdir(parents=True)
        (self.root / "tests/package/native-platform.spec.ts").write_text("// explicit proof wrapper\n")
        self.context = {"sha": "1" * 40, "runId": "123", "attempt": "1"}
        self.summary_path = self.root / "native-summary.json"
        self.summary = {
            "status": "passed", "platform": "linux", "bun": "1.4.3", "github": self.context.copy(),
            "phases": {"install": "passed", "replay": "passed", "package": "passed"},
            "proofSourcesUnchanged": True, "fixtureBytesUnchanged": True, "lockUnchanged": True, "manifestUnchanged": True,
            "fixtureBefore": "a" * 64, "fixtureAfter": "a" * 64,
            "lockSha256": hashlib.sha256((self.root / "bun.lock").read_bytes()).hexdigest(),
            "manifestSha256": hashlib.sha256((self.root / "package.json").read_bytes()).hexdigest(),
            "proofSourceSha256": {name: hashlib.sha256((self.root / name).read_bytes()).hexdigest()
                for name in ("scripts/native-platform.ts", "scripts/testing/native.ts", "src/lib/runtime-detect.ts", "src/lib/runtimeGlobal.ts", "tests/package/native-platform.spec.ts")},
        }
        self.seal_reports()
        self.save_summary()

    def seal_reports(self):
        self.summary["coverageReports"] = {phase: {"path": f"proof-{phase}/lcov.info", "bytes": len(path.read_bytes()), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for phase, path in zip(("install", "replay", "package"), self.native)}

    def save_summary(self):
        self.summary_path.write_text(json.dumps(self.summary))

    def combine(self, native=None):
        return ci.combine_coverage(self.root, self.strict, self.native if native is None else native, self.output,
                                   summary_path=self.summary_path, expected_context=self.context)

    def test_real_raw_and_merged_inputs_union_lines_without_invented_functions(self):
        result = self.combine()
        self.assertEqual(result["sources"], len(self.names))
        self.assertEqual(result["linesHit"], 2)
        self.assertIsNone(result["functions"])
        self.assertNotIn("FN", self.output.read_text())
        self.assertIn("SF:src/lib/runtime-detect.ts\nDA:1,3", self.output.read_text())

    def test_native_hits_cannot_rescue_missing_or_malformed_strict_coverage(self):
        for data in ("", self.strict_data.replace(report("scripts/native-platform.ts", count=0).replace("FNF:1\nFNH:1\n", ""), ""), self.strict_data.replace("DA:1,0", "DA:1,-1", 1)):
            self.strict.write_text(data)
            with self.subTest(data=data[:80]), self.assertRaises(ValueError):
                self.combine()
            self.assertFalse(self.output.exists())

    def test_invalid_native_raw_reports_and_duplicate_input_roles_fail_before_publication(self):
        for data in (report(), report("scripts/native-platform.ts").replace("FNF:1\n", ""), report("scripts/native-platform.ts").replace("FNH:1", "FNH:2"), report("../outside.ts")):
            self.native[0].write_text(data)
            self.seal_reports()
            self.save_summary()
            with self.subTest(data=data[:80]), self.assertRaises((ValueError, OSError)):
                self.combine()
            self.assertFalse(self.output.exists())
        for paths in ([self.strict, self.native[1]], [self.native[1], self.native[1]], [self.native[1]]):
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                self.combine(paths)


    def test_stale_or_failed_native_provenance_cannot_contribute_hits(self):
        original = json.loads(json.dumps(self.summary))
        changes = [
            {"status": "failed"}, {"platform": "darwin"}, {"bun": "1.4.2"},
            {"phases": {"install": "passed", "replay": "passed"}},
            {"github": {**self.context, "sha": "2" * 40}},
            {"github": {**self.context, "runId": "124"}},
            {"github": {**self.context, "attempt": "2"}},
            {"proofSourceSha256": {}}, {"lockSha256": "wrong"},
            {"fixtureBytesUnchanged": False}, {"fixtureAfter": "b" * 64},
        ]
        for change in changes:
            self.summary = {**original, **change}
            self.save_summary()
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.combine()
            self.assertFalse(self.output.exists())
        self.summary = original
        self.save_summary()
        (self.root / "src/lib/runtime-detect.ts").write_text("changed since execution\n")
        with self.assertRaisesRegex(ValueError, "source identity"):
            self.combine()
        self.assertFalse(self.output.exists())

    def test_spec_records_missing_phase_and_format_substitution_fail(self):
        self.native[0].write_text(report("scripts/native-platform.ts") + report("tests/package/native-platform.spec.ts"))
        self.seal_reports()
        self.save_summary()
        with self.assertRaisesRegex(ValueError, "Unexpected LCOV source"):
            self.combine()
        self.native[0].unlink()
        with self.assertRaises((ValueError, OSError)):
            self.combine()
        self.assertFalse(self.output.exists())


    def test_stale_substituted_roles_and_unattested_source_records_are_rejected(self):
        original = self.native[0].read_bytes()
        self.native[0].write_bytes(self.native[1].read_bytes())
        with self.assertRaisesRegex(ValueError, "bytes/role"):
            self.combine()
        self.native[0].write_bytes(original)
        self.summary["coverageReports"]["install"]["path"] = "proof-package/lcov.info"
        self.save_summary()
        with self.assertRaisesRegex(ValueError, "bytes/role"):
            self.combine()
        self.native[0].write_text(report("scripts/native-platform.ts") + report())
        self.seal_reports()
        self.save_summary()
        with self.assertRaisesRegex(ValueError, "outside its measured proof closure"):
            self.combine()
        self.assertFalse(self.output.exists())


class StagingTests(unittest.TestCase):
    def test_only_canonical_harness_allowlist_is_copied(self):
        with tempfile.TemporaryDirectory() as value:
            root, scratch = Path(value) / "root", Path(value) / "scratch"
            harness = root / "tests/cloudflare"
            harness.mkdir(parents=True)
            scratch.mkdir(mode=0o700)
            for name in ci.HARNESS:
                (harness / name).write_text(name)
            (harness / ".env").write_text("must not copy")
            destination = ci.stage_harness(root, scratch)
            self.assertEqual(set(path.name for path in destination.iterdir()), set(ci.HARNESS))
            self.assertTrue((destination / ".npmrc").is_file())
            (harness / "worker.ts").unlink()
            (harness / "worker.ts").symlink_to("worker.test.ts")
            with self.assertRaises(ValueError):
                ci.stage_harness(root, Path(value) / "other")

    def test_failed_build_stops_before_install_or_runtime(self):
        with tempfile.TemporaryDirectory() as value:
            tool = Path(value) / "tool"
            tool.write_text("placeholder")
            created = []
            temporary_directory = tempfile.TemporaryDirectory

            def temporary(**kwargs):
                directory = temporary_directory(**kwargs)
                created.append(Path(directory.name))
                return directory

            with patch.object(ci.tempfile, "TemporaryDirectory", side_effect=temporary), patch.object(ci.subprocess, "check_output", side_effect=["1.4.3", "v24.21.0", "10.9.9"]), patch.object(ci, "run", side_effect=subprocess.CalledProcessError(1, "build")) as call:
                with self.assertRaises(subprocess.CalledProcessError):
                    ci.workers(str(tool), str(tool), str(tool))
                self.assertEqual(call.call_count, 1)
                self.assertIn(ci.ROOT / "scripts/testing/offline.py", call.call_args.args[0])
                self.assertEqual(len(created), 1)
                self.assertFalse(created[0].exists())

    def test_wrong_npm_pin_fails_before_any_workload(self):
        with tempfile.TemporaryDirectory() as value:
            tool = Path(value) / "tool"
            tool.write_text("placeholder")
            with patch.object(ci.subprocess, "check_output", side_effect=["1.4.3", "v24.21.0", "11.0.0"]), patch.object(ci, "run") as call:
                with self.assertRaises(ValueError):
                    ci.workers(str(tool), str(tool), str(tool))
                call.assert_not_called()


class WorkflowTests(unittest.TestCase):
    def test_copilot_setup_copy_matches_composite_steps(self):
        action = (ci.ROOT / ".github/actions/setup/action.yml").read_text()
        workflow = (ci.ROOT / ".github/workflows/copilot-setup-steps.yml").read_text()
        steps = action[action.index("    - name: Setup Node tool host"):].strip()
        copied = "\n".join(line[2:] if line.startswith("  ") else line for line in workflow[workflow.index("      - name: Setup Node tool host"):].splitlines()).strip()
        self.assertEqual(copied, steps)

    def test_maintained_gates_and_upload_fail_closed(self):
        workflow = (ci.ROOT / ".github/workflows/tests.yaml").read_text()
        for gate in ("format:check", "lint", "typecheck", "typecheck:negative", "schema:check", "test:coverage"):
            self.assertIn("run: bun run " + gate, workflow)
        self.assertNotIn("deno ", workflow)
        self.assertNotIn("pull_request_target", workflow)
        self.assertNotIn("continue-on-error", workflow)
        self.assertIn("branches: [dev]", workflow)
        self.assertIn("types: [opened, synchronize, reopened, ready_for_review]", workflow)
        self.assertIn("group: tests-${{ github.workflow }}-${{ github.event_name }}-", workflow)
        self.assertIn("files: coverage/combined-lcov.info\n          disable_search: true", workflow)
        self.assertIn("fail_ci_if_error: true", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        tests, upload = workflow.split("  codecov:", 1)
        self.assertNotIn("id-token: write", tests)
        self.assertIn("needs: coverage", upload)
        coverage_job = tests.split("  coverage:", 1)[1]
        self.assertIn("needs: [tests, native-platforms]", coverage_job)
        self.assertIn("combine-coverage --strict", coverage_job)
        self.assertNotIn("run:", upload.split("  cloudflare-workers:", 1)[0])
        native = (ci.ROOT / ".github/workflows/native-platforms.yaml").read_text()
        self.assertIn("proof-replay", native)
        self.assertIn("proof-package", native)
        self.assertIn("if: runner.os == 'Linux'", native)
        self.assertIn("./tests/package/native-platform.spec.ts", native)
        self.assertIn("head.repo.full_name == github.repository", upload)
        self.assertIn("github.actor != 'dependabot[bot]'", upload)
        release = (ci.ROOT / ".github/workflows/release.yaml").read_text()
        self.assertIn("needs: [branch-policy, tests]", release)
        self.assertIn("group: release-${{ github.ref }}", release)
        self.assertIn("cancel-in-progress: false", release)


if __name__ == "__main__":
    unittest.main()
