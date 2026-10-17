"""Provisioning tests model fixed root operations; they never invoke sudo."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import signal
import fcntl
import shutil
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ci_apparmor", Path(__file__).with_name("ci_apparmor.py"))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


def result(output="", code=0):
    return subprocess.CompletedProcess([], code, output)


class Model:
    def __init__(self, stage, *, fail=None, initial=None):
        self.stage = stage
        self.fail = fail
        self.loaded = False
        self.calls = []
        self.initial = [] if initial is None else initial

    def sudo(self, command):
        self.calls.append(command)
        operation = Path(command[0]).name
        if operation == "cat":
            names = self.initial + ([ci.PROFILE_NAME + " (unconfined)"] if self.loaded else [])
            return result("\n".join(names))
        if operation == "mkdir":
            self.stage.mkdir(mode=0o700)
        elif operation == "install":
            if self.fail == "install":
                raise RuntimeError("copy failed")
            shutil.copyfile(ci.PROFILE_SOURCE, ci.STAGED_PROFILE)
        elif operation == "stat":
            return result("symbolic link:0:0:600" if self.fail == "metadata" else "regular file:0:0:600")
        elif operation == "sha256sum":
            digest = "0" * 64 if self.fail == "digest" else hashlib.sha256(ci.STAGED_PROFILE.read_bytes()).hexdigest()
            return result(f"{digest}  {ci.STAGED_PROFILE}\n")
        elif operation == "apparmor_parser":
            if "--add" in command:
                self.loaded = True
                if self.fail == "partial load":
                    raise RuntimeError("parser reported a partial load")
            else:
                assert "--remove" in command
                if self.fail == "remove":
                    raise RuntimeError("removal failed")
                self.loaded = False
        elif operation == "rm":
            ci.STAGED_PROFILE.unlink(missing_ok=True)
        elif operation == "rmdir":
            self.stage.rmdir()
        else:
            raise AssertionError(f"Unexpected privileged utility: {command}")
        return result()


class ProfileTests(unittest.TestCase):
    def test_reviewed_profile_has_one_exact_attachment_and_digest(self):
        policy = ci.PROFILE_SOURCE.read_text()
        self.assertEqual(hashlib.sha256(policy.encode()).hexdigest(), ci.PROFILE_SHA256)
        self.assertEqual(policy.count("profile "), 1)
        self.assertIn(f"profile {ci.PROFILE_NAME} /usr/bin/bwrap flags=(unconfined)", policy)
        self.assertIn("abi <abi/4.0>,", policy)
        self.assertNotIn("deny capability", policy)
        self.assertNotIn("include", policy)
        self.assertEqual(policy.count("userns,"), 1)

    def test_non_hosted_or_root_execution_rejects_before_any_command(self):
        with patch.object(ci.os, "getuid", return_value=1000), patch.object(ci.os, "geteuid", return_value=1000), patch.object(ci, "execute") as execute:
            with self.assertRaisesRegex(RuntimeError, "disposable GitHub-hosted"):
                ci.startup({})
            execute.assert_not_called()
        with patch.object(ci.os, "getuid", return_value=0), patch.object(ci, "execute") as execute:
            with self.assertRaisesRegex(RuntimeError, "ordinary CI operator"):
                ci.startup({"GITHUB_ACTIONS": "true"})
            execute.assert_not_called()

    def test_trusted_inputs_reject_writable_ownership_or_symlink_aliases(self):
        with tempfile.TemporaryDirectory() as value:
            path = Path(value) / "tool"
            path.write_text("not a root-owned executable")
            with self.assertRaisesRegex(RuntimeError, "root ownership"):
                ci.trusted(path)
            alias = Path(value) / "alias"
            alias.symlink_to(path)
            with self.assertRaisesRegex(RuntimeError, "Noncanonical"):
                ci.trusted(alias)


class StrictLeafEnvironmentTests(unittest.TestCase):
    def test_leaf_observes_environment_without_reset_or_fabricated_controls(self):
        cases = [
            {"FETCH_DEVEL": "", "FMC_CACHE_MODE": "replay"},
            {},
            {"FETCH_DEVEL": "recache", "FMC_CACHE_MODE": "auto", "FMC_PROBE": "unsafe"},
        ]
        for environment in cases:
            observed = []
            control = SimpleNamespace(guard_inside=lambda *args: observed.append((args, dict(os.environ))))
            loader = SimpleNamespace(exec_module=lambda module: None)
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True), patch.object(ci, "assert_profile_label"), patch.object(ci.os, "readlink", return_value="net:guest"), patch.object(ci.importlib.util, "spec_from_file_location", return_value=SimpleNamespace(loader=loader)), patch.object(ci.importlib.util, "module_from_spec", return_value=control), patch.object(ci, "execute") as execute:
                self.assertIsNone(ci.inside("--strict-leaf", "/trusted", "/scratch", "net:host"))
                self.assertEqual(observed, [(("/trusted", "/scratch", "net:host"), environment)])
                execute.assert_not_called()

    def test_system_utility_execution_keeps_its_minimal_environment(self):
        with patch.dict(os.environ, {"FETCH_DEVEL": "recache", "FMC_CACHE_MODE": "auto", "SECRET_SENTINEL": "private"}), patch.object(ci.subprocess, "run", return_value=result()) as run:
            ci.execute(["/usr/bin/true"])
            self.assertEqual(run.call_args.kwargs["env"], ci.ENV)
            self.assertNotIn("FETCH_DEVEL", run.call_args.kwargs["env"])
            self.assertNotIn("SECRET_SENTINEL", run.call_args.kwargs["env"])


class AttachmentProbeTests(unittest.TestCase):
    def real_probe(self, current="unconfined"):
        # Actual rootless bwrap/pipe/pidfd/proc protocol; only the unavailable
        # local AppArmor label and root-mapped ownership are modeled. No load.
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_process_label", return_value=current):
            return ci.probe_bwrap_attachment()

    def test_real_protocol_releases_only_version_after_two_live_samples(self):
        observed = []
        original = ci._attachment_snapshot
        write = os.write

        def snapshot(*args):
            value = original(*args)
            observed.append("sample")
            return value

        def release(fd, data):
            self.assertEqual(observed, ["sample", "sample"])
            self.assertEqual(data, b"--version\0")
            observed.append("release")
            return write(fd, data)

        with patch.object(ci, "_attachment_snapshot", side_effect=snapshot), patch.object(ci.os, "write", side_effect=release):
            proof = self.real_probe()
        self.assertEqual(observed, ["sample", "sample", "release"])
        self.assertEqual(proof["label"], "unconfined")
        self.assertFalse(proof["namespaceSetup"])
        self.assertTrue(proof["version"].startswith("bubblewrap "))
        with self.assertRaises(ProcessLookupError):
            os.kill(proof["pid"], 0)

    def test_differently_named_wildcard_labels_are_rejected_and_child_reaped(self):
        for current in ("sandbox_tools (enforce)", "preexisting_container_tool (enforce)", "odd_name (unconfined)"):
            with self.subTest(label=current), patch.object(ci.os, "write") as release:
                before = set(os.listdir("/proc/self/fd"))
                with self.assertRaisesRegex(RuntimeError, "already has an executable attachment"):
                    self.real_probe(current)
                release.assert_not_called()
                self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_denied_unknown_label_identity_exit_and_timeout_fail_closed(self):
        scenarios = [
            ("label denied", patch.object(ci, "_process_label", side_effect=PermissionError("denied"))),
            ("label unknown", patch.object(ci, "_process_label", return_value="")),
            ("identity", patch.object(ci, "_attachment_snapshot", side_effect=RuntimeError("executable inode changed"))),
            ("early exit", patch.object(ci, "_live_process", side_effect=RuntimeError("exited"))),
        ]
        for name, failure in scenarios:
            with self.subTest(failure=name), patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci.os, "write") as release, failure:
                before = set(os.listdir("/proc/self/fd"))
                with self.assertRaises((OSError, RuntimeError)):
                    ci.probe_bwrap_attachment()
                release.assert_not_called()
                self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_transient_exec_image_is_bounded_and_never_releases_arguments(self):
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_attachment_snapshot", side_effect=ci._ExecImagePending("not ready")), patch.object(ci.time, "monotonic", side_effect=[0, 4]), patch.object(ci.os, "write") as release:
            with self.assertRaisesRegex(RuntimeError, "image observation timed out"):
                ci.probe_bwrap_attachment()
            release.assert_not_called()

    def test_denied_signal_sends_no_arguments_reaps_and_keeps_probe_failed(self):
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_process_label", return_value="sandbox_tools (enforce)"), patch.object(ci.signal, "pidfd_send_signal", side_effect=PermissionError("signal denied")), patch.object(ci.os, "write") as release:
            before = set(os.listdir("/proc/self/fd"))
            with self.assertRaisesRegex(RuntimeError, "cleanup failed.*signal denied"):
                ci.probe_bwrap_attachment()
            release.assert_not_called()
            self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_missing_pidfd_fails_closed_and_reaps_the_direct_child(self):
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci.os, "pidfd_open", side_effect=OSError(ci.errno.ENOSYS, "unsupported")), patch.object(ci.os, "write") as release:
            before = set(os.listdir("/proc/self/fd"))
            with self.assertRaises(OSError):
                ci.probe_bwrap_attachment()
            release.assert_not_called()
            self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_transient_empty_image_can_become_ready_without_sampling_a_wrong_label(self):
        value = {"label": "unconfined", "startTime": "stable"}
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_attachment_snapshot", side_effect=[ci._ExecImagePending("not ready"), value, value]) as snapshot:
            proof = ci.probe_bwrap_attachment()
            self.assertEqual(snapshot.call_count, 3)
            self.assertEqual(proof["startTime"], "stable")

    def test_total_observation_deadline_precedes_argument_release(self):
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_attachment_snapshot", return_value={"label": "unconfined"}), patch.object(ci.time, "monotonic", side_effect=[0, 4]), patch.object(ci.os, "write") as release:
            with self.assertRaisesRegex(RuntimeError, "observation timed out"):
                ci.probe_bwrap_attachment()
            release.assert_not_called()

    def test_changed_observation_rejects_before_argument_release(self):
        with patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_attachment_snapshot", side_effect=[{"startTime": "1"}, {"startTime": "2"}]), patch.object(ci.os, "write") as release:
            with self.assertRaisesRegex(RuntimeError, "observation changed"):
                ci.probe_bwrap_attachment()
            release.assert_not_called()

    def test_version_timeout_and_malformed_response_reap_child(self):
        for failure in (subprocess.TimeoutExpired("bwrap", 3), (b"unexpected\n", b"")):
            with self.subTest(failure=failure), patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_process_label", return_value="unconfined"), patch.object(ci.subprocess.Popen, "communicate", side_effect=failure if isinstance(failure, Exception) else None, return_value=failure if isinstance(failure, tuple) else None):
                before = set(os.listdir("/proc/self/fd"))
                with self.assertRaises((RuntimeError, subprocess.TimeoutExpired)):
                    ci.probe_bwrap_attachment()
                self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_privileged_binary_metadata_is_rejected_before_spawn(self):
        metadata = SimpleNamespace(st_mode=stat.S_IFREG | 0o4755)
        with patch.object(ci, "trusted", return_value=unittest.mock.Mock(stat=lambda: metadata)), patch.object(ci.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(RuntimeError, "setuid/setgid"):
                ci.probe_bwrap_attachment()
            spawn.assert_not_called()
        with patch.object(ci, "trusted", return_value=ci.BWRAP), patch.object(ci.os, "getxattr", return_value=b"file capabilities"), patch.object(ci.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(RuntimeError, "file capabilities"):
                ci.probe_bwrap_attachment()
            spawn.assert_not_called()


class DefaultProbeTests(unittest.TestCase):
    def test_default_probe_uses_fixed_ctypes_before_any_child_exec(self):
        library = SimpleNamespace(unshare=unittest.mock.Mock(return_value=-1))
        with patch.object(ci, "label", return_value="unconfined"), patch.object(ci.os, "getuid", return_value=1000), patch.object(ci.os, "getgid", return_value=1000), patch.object(ci, "capabilities", return_value={"CapEff": "0", "CapPrm": "0"}), patch.object(ci.ctypes, "CDLL", return_value=library), patch.object(ci.ctypes, "get_errno", return_value=ci.errno.EPERM), patch.object(ci, "execute") as execute:
            ci.default_probe()
            library.unshare.assert_called_once_with(0x10000000)
            execute.assert_not_called()

    def test_unrestricted_private_net_admin_fails_the_negative_control(self):
        library = SimpleNamespace(unshare=unittest.mock.Mock(return_value=0))
        packed = ci.struct.pack("16sH14x", b"lo", 0)
        with patch.object(ci, "label", return_value="unconfined"), patch.object(ci.os, "getuid", return_value=1000), patch.object(ci.os, "getgid", return_value=1000), patch.object(ci, "capabilities", return_value={"CapEff": "0", "CapPrm": "0"}), patch.object(ci.ctypes, "CDLL", return_value=library), patch.object(ci.socket, "socket"), patch.object(ci.fcntl, "ioctl", return_value=packed), patch.object(ci, "execute") as execute:
            with self.assertRaisesRegex(RuntimeError, "gained namespace NET_ADMIN"):
                ci.default_probe()
            self.assertEqual(library.unshare.call_count, 2)
            execute.assert_not_called()

    def test_postflight_requires_our_actual_profile_label(self):
        for current in ("unconfined", "unrelated (enforce)"):
            with self.subTest(label=current), patch.object(ci, "label", return_value=current):
                with self.assertRaisesRegex(RuntimeError, "lost the expected profile lineage"):
                    ci.assert_profile_label()


class LoaderTests(unittest.TestCase):
    def model(self, directory, **kwargs):
        stage = Path(directory) / "root-stage"
        model = Model(stage, **kwargs)
        original = Path.lstat

        def metadata(path):
            if path == stage and path.exists():
                return SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
            return original(path)

        return model, [patch.object(ci, "STAGE", stage), patch.object(ci, "STAGED_PROFILE", stage / "bwrap.profile"),
                       patch.object(ci.ProfileLoader, "sudo", side_effect=model.sudo), patch.object(Path, "lstat", metadata),
                       patch.object(ci, "probe_bwrap_attachment", return_value={"label": "unconfined"})]

    def test_success_uses_only_fixed_utilities_and_keeps_verified_policy(self):
        with tempfile.TemporaryDirectory() as value:
            model, patches = self.model(value)
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                loader = ci.ProfileLoader()
                loader.begin()
                self.assertTrue(loader.verified and model.loaded)
                self.assertTrue(ci.STAGED_PROFILE.is_file())
                add = next(command for command in model.calls if "--add" in command)
                self.assertNotIn("--replace", add)
                self.assertIn("--config-file", add)
                self.assertIn("/dev/null", add)
                self.assertIn("--skip-cache", add)
                self.assertFalse(any(str(ci.ROOT) in argument for argument in add))
                loader.rollback()
                self.assertFalse(model.loaded or model.stage.exists())

    def test_copy_metadata_digest_and_partial_load_failures_roll_back_only_own_policy(self):
        for failure in ("install", "metadata", "digest", "partial load"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as value:
                model, patches = self.model(value, fail=failure, initial=["unrelated (enforce)"])
                with patches[0], patches[1], patches[2], patches[3], patches[4]:
                    loader = ci.ProfileLoader()
                    with self.assertRaises(RuntimeError):
                        loader.begin()
                    loader.rollback()
                    self.assertFalse(model.loaded or model.stage.exists())
                    add = any("--add" in command for command in model.calls)
                    self.assertEqual(add, failure == "partial load")
                    for command in model.calls:
                        self.assertNotIn("--replace", command)
                        self.assertNotIn("unrelated", command)

    def test_existing_profiles_and_staging_paths_are_not_replaced_or_removed(self):
        for conflict in ("loaded profile", "staging path"):
            with self.subTest(conflict=conflict), tempfile.TemporaryDirectory() as value:
                model, patches = self.model(value, initial=["bwrap (enforce)"] if conflict == "loaded profile" else [])
                if conflict == "staging path":
                    model.stage.mkdir()
                with patches[0], patches[1], patches[2], patches[3], patches[4]:
                    loader = ci.ProfileLoader()
                    with self.assertRaises(RuntimeError):
                        loader.begin()
                    loader.rollback()
                    self.assertTrue(all(Path(command[0]).name == "cat" for command in model.calls))

    def test_named_wildcard_attachment_never_reaches_a_privileged_operation(self):
        for current in ("sandbox_tools (enforce)", "preexisting_container_tool (enforce)"):
            with self.subTest(label=current), patch.object(ci, "trusted", side_effect=lambda path: path), patch.object(ci, "_process_label", return_value=current), patch.object(ci.ProfileLoader, "sudo") as sudo:
                loader = ci.ProfileLoader()
                with self.assertRaisesRegex(RuntimeError, "already has an executable attachment"):
                    loader.begin()
                loader.rollback()
                sudo.assert_not_called()

    def test_new_attachment_during_staging_stops_add_and_cleans_only_staging(self):
        with tempfile.TemporaryDirectory() as value:
            model, patches = self.model(value)
            with patches[0], patches[1], patches[2], patches[3], patches[4] as probe:
                probe.side_effect = [{"label": "unconfined"}, RuntimeError("attachment changed during staging")]
                loader = ci.ProfileLoader()
                with self.assertRaisesRegex(RuntimeError, "attachment changed"):
                    loader.begin()
                loader.rollback()
                self.assertFalse(model.loaded or model.stage.exists())
                self.assertFalse(any("--add" in command for command in model.calls))

    def test_failed_removal_preserves_verified_root_input_for_diagnosis(self):
        with tempfile.TemporaryDirectory() as value:
            model, patches = self.model(value, fail="remove")
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                loader = ci.ProfileLoader()
                loader.begin()
                with self.assertRaisesRegex(RuntimeError, "removal failed"):
                    loader.rollback()
                self.assertTrue(model.loaded and ci.STAGED_PROFILE.is_file())
                self.assertFalse(any(Path(command[0]).name == "rm" for command in model.calls))


class OrchestrationTests(unittest.TestCase):
    def fixtures(self):
        state = {"restrictions": {str(ci.RESTRICTIONS[0]): "1"}}
        sibling = {"label": "unconfined", "deniedStage": "network namespace", "errno": "EPERM"}
        failed = [{"code": 1, "output": "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted"}]
        passed = [{"code": 0, "output": "kernel controls passed"}]
        return state, sibling, failed, passed

    def test_success_runs_before_and_after_controls_as_ordinary_operator(self):
        state, sibling, failed, passed = self.fixtures()
        with patch.object(ci, "startup", return_value=state), patch.object(ci, "sibling", return_value=sibling) as siblings, patch.object(ci, "controls", side_effect=[failed, passed]) as controls, patch.object(ci, "restrictions", return_value=state["restrictions"]), patch.object(ci, "ProfileLoader") as loader:
            ci.provision()
            loader.return_value.begin.assert_called_once()
            loader.return_value.rollback.assert_not_called()
            self.assertEqual(siblings.call_count, 2)
            self.assertEqual(controls.call_args_list[1].kwargs, {"after": True})

    def test_postflight_control_failure_or_changed_global_or_sibling_state_rolls_back(self):
        for failure in ("kernel", "global", "sibling"):
            with self.subTest(failure=failure):
                state, sibling, failed, passed = self.fixtures()
                after = failed if failure == "kernel" else passed
                restriction = {} if failure == "global" else state["restrictions"]
                siblings = [sibling, {} if failure == "sibling" else sibling]
                with patch.object(ci, "startup", return_value=state), patch.object(ci, "sibling", side_effect=siblings), patch.object(ci, "controls", side_effect=[failed, after]), patch.object(ci, "restrictions", return_value=restriction), patch.object(ci, "ProfileLoader") as loader:
                    with self.assertRaises(RuntimeError):
                        ci.provision()
                    loader.return_value.rollback.assert_called_once()

    def test_already_working_runner_or_unrelated_failure_never_loads_profile(self):
        state, sibling, failed, passed = self.fixtures()
        for before in (passed, [{"code": 1, "output": "unrelated error"}]):
            with patch.object(ci, "startup", return_value=state), patch.object(ci, "sibling", return_value=sibling), patch.object(ci, "controls", return_value=before), patch.object(ci, "ProfileLoader") as loader:
                if before == passed:
                    ci.provision()
                else:
                    with self.assertRaises(RuntimeError):
                        ci.provision()
                loader.return_value.begin.assert_not_called()

    def test_controls_use_distinct_private_scratch_and_never_retry_unguarded(self):
        with tempfile.TemporaryDirectory() as value, patch.object(ci, "execute", return_value=result()) as execute:
            root = Path(value)
            before = ci.controls(root)
            after = ci.controls(root, after=True)
            self.assertEqual((len(before), len(after)), (2, 4))
            self.assertNotEqual(before[1]["command"][-1], after[1]["command"][-1])
            self.assertIn("offline.py", " ".join(after[2]["command"]))
            outer = after[2]["command"]
            position = outer.index("--profile")
            self.assertEqual(outer[position:position + 2], ["--profile", "ipc"])
            self.assertIn("--nested-probe", outer)
            self.assertNotIn("--profile", before[0]["command"])
            source = (ci.ROOT / "scripts/ci_apparmor.py").read_text()
            inner = source.split('if mode == "--nested-probe":', 1)[1].split('if mode == "--strict-leaf":', 1)[0]
            self.assertNotIn('"--profile", "ipc"', inner)
            self.assertIn('"--strict-leaf"', inner)
            self.assertIn("workers-loopback.py", " ".join(after[3]["command"]))
            for directory in root.iterdir():
                self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
            self.assertEqual(execute.call_count, 6)


if __name__ == "__main__":
    unittest.main()
