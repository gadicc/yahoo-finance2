# Ubuntu CI AppArmor user namespace exception

The actual Tests smoke on commit `eabb702` passed exact tool selection and normal
frozen installation, then both Tests and Workers failed inside Bubblewrap with
`loopback: Failed RTM_NEWADDR: Operation not permitted`.
[Run 38904432143](https://github.com/gadicc/yahoo-finance2/actions/runs/38904432143)
is the before evidence. Ubuntu 24.04 enables an AppArmor restriction that can
allow unprivileged user namespace creation while denying subsequent namespace
capability use. This matches the failure; the reviewed remote retry must prove
the diagnosis and remedy rather than assuming them from a local Linux result.

`scripts/ci_apparmor.py` is a **disposable GitHub-hosted Ubuntu 24.04 CI-only
provisioner**. It refuses root callers, other hosts/distributions, inactive
AppArmor, a disabled default restriction, pre-existing profile lineage and
operators with effective/permitted host capabilities. Root-owned canonical
Bubblewrap, parser, utilities, ABI file and protected ancestor modes are checked.
Setuid/setgid or file-capability-bearing Bubblewrap binaries are refused.
No workstation instructions, sysctl writes, AppArmor service reloads, persistent
`/etc` profiles, or unguarded test alternatives are provided.

## Effective scope

The one profile is named `yahoo_finance2_ci_bwrap`, attaches exactly to the
root-owned `/usr/bin/bwrap` binary and uses AppArmor ABI 4.0. Ubuntu documents
`flags=(unconfined) { userns, }` as a supported per-executable namespace exception.
**This profile does not confine workloads.** It permits that executable's
profile lineage, including its inherited descendants, to use user namespaces
without Ubuntu's default unconfined namespace-capability denial. It does not
create host credentials or grant capabilities in the host user namespace.
Other already attached executable profiles may still impose their own rules;
postflight requires the actual expected label rather than assuming inheritance.

This is a deliberate increase in the namespace kernel surface available to
Bubblewrap and its descendants on a short-lived runner. The project's actual
boundaries remain the unchanged strict read-only mounts, isolated namespaces,
inherited AF_INET/AF_INET6 and io_uring seccomp denial, or the separate Workers
loopback namespace followed by zero capabilities/no_new_privs. Pathname Unix
socket visibility and trusted-code/operator limitations remain documented in
[WORKERS.md](WORKERS.md). CI tests already run as the ordinary runner operator;
this change does not turn their environment into a hostile-code sandbox.

The upstream `bwrap-userns-restrict` profile strips **all** child capabilities.
That blocks Workers' temporary namespace-local NET_ADMIN/SETPCAP setup. A proposed
child profile allowing only those two capabilities was also rejected: nested
Bubblewrap guards need namespace-construction capabilities, and inherited
AppArmor stacking cannot relax that child restriction under no_new_privs.
The maintained suite intentionally launches nested guards. No nested test is
skipped or retried without enforcement to accommodate this exception.

## Fixed privilege boundary and lifetime

The provisioner itself and every test/probe run as the ordinary operator.
Python isolated mode and a minimal subprocess environment avoid repository
module search and inherited loader/configuration settings. Only fixed system
utilities run through noninteractive sudo. No repository Python/shell code,
test command, caller-selected executable or arbitrary profile path runs as root.

The reviewed profile bytes have a pinned SHA-256 in the provisioner. A fresh
`/run/yahoo-finance2-ci-apparmor` directory is created atomically as root, mode
0700; an existing path or loaded bwrap-related profile fails without replacement.
Loaded names are only a conservative extra check: they cannot identify a
differently named wildcard attachment. The actual executable label check below
is mandatory before any privileged operation and again before `--add`.
Root `install` copies only the fixed source into a fixed 0600 root-owned regular
file. Root metadata and SHA-256 are checked **after** the copy before parsing,
so a changed source cannot become a different privileged policy. The fixed
root-owned parser uses `/dev/null` configuration and no cache. `--add` loads only
this new profile; there is no `--replace` or broad profile reload. The profile
contains no optional local includes or directory attachment globs.

A setup failure removes only this newly loaded profile using the verified
root-owned input and removes only its fixed staging file/directory. A failed
kernel removal preserves the input for diagnosis and leaves the job failed.
Pre-existing/conflicting profiles and paths are not removed. On success the
profile stays available for the remaining tests (or Copilot's setup session)
and disappears with the disposable runner; no boot-persistent policy is written.

## Executable attachment collision control

A profile named `sandbox_tools` can attach `/usr/bin/bw*`. Its independent name
would evade a name substring check, while a new exact `/usr/bin/bwrap` attachment
could supersede it. Both independent reviewers demonstrated this accepted P2
against the original frozen candidate. The original archive and receipt remain
preserved as before evidence; the revised loader refuses the effective label.

The ordinary-user probe starts only the fixed `/usr/bin/bwrap --args FD`, holding
its argument pipe empty with the writer open. Bubblewrap 0.9.0 reads that pipe
to EOF during argument parsing, before namespace construction. Because
`acquire_privs` precedes parsing, the binary must have no setuid/setgid/file
capabilities, and the actual child's real/effective/saved/filesystem identities
and effective/permitted/ambient capability sets must still match an ordinary
operator with no capabilities. User, mount, network, PID, IPC, UTS and cgroup
namespace identities must match its caller.

A live pidfd, exact executable path/device/inode, original command line and
process start identity are checked before reading `/proc/PID/attr/current`.
Only the literal `unconfined` label is accepted. Two live observations must
agree; the binary is rechecked before release. The transient state where exec
has published its executable but procfs still has an empty argument image is
waited on within the deadline, without sampling a pre-exec label. Wrong,
unknown, unreadable or exited observations fail closed. Only then does the probe
write `--version` plus NUL and EOF, requiring a bounded zero exit and an exact
version-shaped response. No namespace or workload command is ever supplied.

Failures kill and reap the pinned child and close descriptors. If an existing
profile denies signals, an empty EOF supplies no command and makes the reviewed
binary exit with usage before namespace setup; cleanup is still reported as a
failure, and no policy is added. Timeouts, unavailable pidfds, malformed output
and failed cleanup cannot proceed to privileged staging. This is probe cleanup,
not an unguarded test retry.

The observation is repeated immediately before adding the policy to detect an
attachment that appeared during staging. This is not an atomic kernel policy
lock: the disposable single-job runner contract excludes concurrent privileged
AppArmor writers or binary replacement. It does not claim to defend against a
host administrator changing policy between the final observation and the add.

## Before and after controls

Before loading, the helper records the default restriction values, operator
identity, label and exact Bubblewrap hash. An unrelated Python sibling uses
fixed ctypes calls, records its label/capabilities and exercises user/network
namespace construction and, if both succeed, NET_ADMIN on its **own new**
loopback namespace. It never changes the host network. It must remain an
unconfined ordinary user with a concrete EPERM/EACCES denial. The same sibling
control and the exact global restriction values must match after loading.
Bare `unshare` execution is not used as a substitute for this capability test.

The existing strict kernel probe and full Workers loopback kernel controls run
before and after. Before failures may trigger provisioning only for the observed
Bubblewrap permission error. Other failures stop setup. If both existing guards
already pass, no profile is loaded. After provisioning, both controls must pass,
as must a nested strict guard and a Workers leaf label/capability control.
Actual child labels and capability sets are printed. Workers must still have
zero effective/permitted/bounding/inheritable/ambient capabilities and
no_new_privs before the workload. Every nested strict leaf repeats actual socket,
io_uring, mount and scratch checks. A postflight failure rolls back; there is no
fallback or weaker retry. Composite and copied Copilot setup remain identical.

## Nested postflight environment check

Run [38909741201](https://github.com/gadicc/yahoo-finance2/actions/runs/38909741201)
on `9028959` loaded the profile and passed strict and Workers controls, expected
profile labels and the unrelated-process restriction comparison. Its nested
leaf then failed because the helper launched the replay oracle using the minimal
system-utility environment, erasing the guard's actual replay markers. Both jobs
failed and rolled back the profile as designed.

The internal strict leaf now calls the trusted `guard_inside` oracle in its
existing guarded process. It checks the environment actually inherited from the
inner guard and still runs the oracle's child inheritance control. It supplies
no replacement marker values. Missing or unsafe markers remain failures; the
minimal environment for system utilities and sudo is unchanged. The
[focused fix receipt](results/i01-apparmor-leaf-fix.json) records the exact old
failure, fixed nested branch and injected missing/unsafe marker controls. Local
proof models only the unavailable AppArmor label and its adapter reentry path;
actual AppArmor postflight success still requires a reviewed remote retry.

## Proof status

The [preparation receipt](results/i01-apparmor-preparation.json) binds this
isolated candidate to its exact committed base, its exact file hashes, the failed remote
run, parser and synthetic control evidence. Local tests model fixed privileged
operations; they never execute sudo or load kernel policy. Ubuntu AppArmor
4.0.1 parser compilation uses `--skip-kernel-load --skip-cache` and does not
modify the workstation. The local kernel reports AppArmor disabled, so no local
result establishes effective AppArmor labels, descendant inheritance, capability
mediation, preserved default denial or successful enforcement on Ubuntu.

Independent Sol and Astra review must precede a commit and remote retry. Only
the reviewed remote run can supply the after evidence: unchanged restrictions,
unrelated sibling denial, expected profile labels, nested guards, strict replay
and actual Workers tests. Until then this is a prepared remedy, not a successful
Ubuntu CI claim. K02/native integration and other migration acceptance gates
remain separate.

The exact Ubuntu `bubblewrap 0.9.0-1ubuntu0.3` binary also completed the
argument-pipe protocol locally with only its unavailable AppArmor label modeled.
That proves protocol behavior, not real AppArmor attachment enforcement. The
receipt records package/source hashes and keeps the failed candidate evidence.

Primary references verified 2026-10-16:
[Ubuntu 24.04 namespace restrictions and per-executable profile](https://documentation.ubuntu.com/release-notes/24.04/),
[Ubuntu AppArmor architecture and enforcement](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/),
[AppArmor 4.0.1 bwrap profile and child stacking](https://gitlab.com/apparmor/apparmor/-/blob/v4.0.1/profiles/apparmor/profiles/extras/bwrap-userns-restrict),
[current upstream bwrap profile](https://gitlab.com/apparmor/apparmor/-/blob/master/profiles/apparmor/profiles/extras/bwrap-userns-restrict),
[AppArmor 4 parser options](https://gitlab.com/apparmor/apparmor/-/blob/v4.0.1/parser/apparmor_parser.pod),
[profile mode and execution semantics](https://gitlab.com/apparmor/apparmor/-/blob/v4.0.1/parser/apparmor.d.pod),
[Bubblewrap 0.9.0 argument and namespace ordering](https://github.com/containers/bubblewrap/blob/v0.9.0/bubblewrap.c),
[Bubblewrap EOF argument loading](https://github.com/containers/bubblewrap/blob/v0.9.0/utils.c),
[Linux pidfds](https://man7.org/linux/man-pages/man2/pidfd_open.2.html).
