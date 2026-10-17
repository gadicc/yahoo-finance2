"""Real synthetic IPC controls; no host service or Yahoo endpoint is contacted."""
import errno
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import runpy
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
GUARD = ROOT / 'scripts/testing/offline.py'
POLICY = runpy.run_path(str(GUARD.with_name('sandbox.py')))


class GuardTests(unittest.TestCase):
    def test_restore_metadata_cannot_resurrect_masked_roots_or_ancestors(self):
        with tempfile.TemporaryDirectory() as value:
            parent = Path(value); root = parent / 'root'; scratch = parent / 'scratch'
            root.mkdir(); scratch.mkdir()
            for encoded in ('not-json', '{}', '[1]', '["relative"]', '["/tmp"]', '["/var"]', '["/run"]', '["/"]', json.dumps([str(root / '..' / 'root')])):
                with self.subTest(encoded=encoded), patch.dict(os.environ, {'YF_GUARD_INPUT_ROOTS': encoded}):
                    with self.assertRaises((RuntimeError, ValueError)):
                        POLICY['mount_arguments'](root, scratch, ['/usr/bin/true'], owner=ROOT)

    def test_strict_low_int_socket_rules_stream_pairs_and_connected_fd_closure(self):
        with tempfile.TemporaryDirectory() as value:
            parent = Path(value); root = parent / 'root'; scratch = parent / 'scratch'
            root.mkdir(); scratch.mkdir(mode=0o700)
            target = root / 'own-sentinel.sock'
            listener = socket.socket(socket.AF_UNIX)
            self.addCleanup(listener.close)
            listener.bind(str(target)); listener.listen(1); listener.settimeout(.1)
            first, second = socket.socketpair()
            self.addCleanup(first.close); self.addCleanup(second.close)
            descriptor = fcntl.fcntl(first.fileno(), fcntl.F_DUPFD_CLOEXEC, 128)
            code = r'''
import ctypes,errno,os,socket,subprocess,sys
lib=ctypes.CDLL(None,use_errno=True)
sec=ctypes.CDLL('libseccomp.so.2'); sec.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p]
number=lambda name:sec.seccomp_syscall_resolve_name(name.encode())
def syscall(name,*args):
 ctypes.set_errno(0)
 result=lib.syscall(ctypes.c_long(number(name)),*(ctypes.c_ulonglong(value) for value in args))
 return result,ctypes.get_errno()
for high in (0,1<<32,1<<63):
 for family in (1,2,10,40):
  assert syscall('socket',high|family,1,0)==(-1,errno.EPERM),(high,family)
 for family in (2,10,40):
  assert syscall('socketpair',high|family,1,0,0)==(-1,errno.EPERM)
 for kind in (2,5,2|(1<<32)):
  assert syscall('socketpair',high|1,kind,0,0)==(-1,errno.EPERM),(high,kind)
assert syscall('io_uring_setup',1,0)==(-1,errno.EPERM)
a,b=socket.socketpair(socket.AF_UNIX,socket.SOCK_STREAM|socket.SOCK_CLOEXEC)
a.send(b'private-pair'); assert b.recv(64)==b'private-pair'
for operation in (lambda:a.connect(sys.argv[1]),lambda:a.sendto(b'retarget',sys.argv[1])):
 try: operation()
 except OSError as error: assert error.errno in (errno.EISCONN,errno.EINVAL,errno.EOPNOTSUPP),error
 else: raise AssertionError('stream pair retargeted')
try:os.fstat(int(sys.argv[2]))
except OSError as error:assert error.errno==errno.EBADF
else:raise AssertionError('connected inherited FD survived')
if len(sys.argv)==3:subprocess.run([sys.executable,'-c',"import socket,errno;\ntry:socket.socket(socket.AF_UNIX)\nexcept OSError as e:assert e.errno==errno.EPERM\nelse:raise AssertionError('child Unix socket allowed')"],check=True)
print('STRICT_IPC_DENIED')
'''
            try:
                result = subprocess.run(['/usr/bin/python3', GUARD, root, scratch, '--', '/usr/bin/python3', '-c', code, target, str(descriptor)], pass_fds=(descriptor,), text=True, capture_output=True, timeout=20)
            finally:
                os.close(descriptor)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('STRICT_IPC_DENIED', result.stdout)
            with self.assertRaises(socket.timeout): listener.accept()

    def test_repair_guard_uses_strict_ipc_and_closes_inherited_descriptors(self):
        spec = importlib.util.spec_from_file_location('repair_guard', ROOT / 'scripts/ci_repair.py')
        repair = importlib.util.module_from_spec(spec); spec.loader.exec_module(repair)
        with tempfile.TemporaryDirectory() as value:
            parent=Path(value); root=parent/'candidate'; scratch=parent/'scratch'
            root.mkdir(); scratch.mkdir(mode=0o700)
            first,second=socket.socketpair()
            self.addCleanup(first.close); self.addCleanup(second.close)
            descriptor=fcntl.fcntl(first.fileno(),fcntl.F_DUPFD_CLOEXEC,128)
            os.set_inheritable(descriptor,True)
            code="import os,socket,errno;\ntry:os.fstat("+str(descriptor)+")\nexcept OSError as e:assert e.errno==errno.EBADF\nelse:raise AssertionError('inherited IPC FD')\nfor family in (socket.AF_UNIX,socket.AF_INET,socket.AF_INET6,40):\n try:socket.socket(family)\n except OSError as e:assert e.errno==errno.EPERM\n else:raise AssertionError('repair IPC allowed')"
            try: repair.guarded(root,scratch,['/usr/bin/python3','-c',code])
            finally:os.close(descriptor)

    def test_nested_tmp_restores_owning_checkout_and_both_runtime_files(self):
        with tempfile.TemporaryDirectory() as value:
            parent=Path(value); owner=parent/'owning-checkout'; root=parent/'selected'; scratch=parent/'scratch'
            root.mkdir(); scratch.mkdir(mode=0o700)
            helper=owner/'scripts/testing';helper.mkdir(parents=True)
            for name in ('offline.py','sandbox.py'):shutil.copyfile(GUARD.with_name(name),helper/name)
            (owner/'imported.ts').write_text('export const value = 42;\n')
            bun=parent/'bun/bin/bun';node=parent/'node/bin/node'
            bun.parent.mkdir(parents=True);node.parent.mkdir(parents=True)
            shutil.copyfile(shutil.which('bun'),bun);shutil.copyfile(shutil.which('node'),node)
            bun.chmod(0o755);node.chmod(0o755)
            code=f"import {{spawnSync}} from 'node:child_process'; import {{mkdtempSync}} from 'node:fs'; import {{join}} from 'node:path'; const m=await import({json.dumps((owner/'imported.ts').as_uri())}); if(m.value!==42)throw Error('owning checkout missing'); const nested=mkdtempSync(join(process.env.TMPDIR,'nested-')); const r=spawnSync('/usr/bin/python3',[{json.dumps(str(helper/'offline.py'))},{json.dumps(str(root))},nested,'--',{json.dumps(str(node))},'-e','console.log(42)'],{{encoding:'utf8'}});if(r.status!==0||r.stdout.trim()!=='42')throw Error(r.stderr);console.log('NESTED_TOOLS_RESTORED');"
            environment={**os.environ,'PATH':f'{bun.parent}:{node.parent}:/usr/bin:/bin'}
            environment.pop('YF_GUARD_INPUT_ROOTS',None)
            result=subprocess.run(['/usr/bin/python3',helper/'offline.py','--profile','ipc',root,scratch,'--',bun,'--no-env-file','-e',code],env=environment,text=True,capture_output=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('NESTED_TOOLS_RESTORED',result.stdout)

    def test_workers_tmp_owning_checkout_runtime_and_separate_package_closure(self):
        with tempfile.TemporaryDirectory() as value:
            parent=Path(value);owner=parent/'owning';root=parent/'root';scratch=parent/'scratch'
            root.mkdir();scratch.mkdir(mode=0o700)
            helpers=owner/'scripts/testing';helpers.mkdir(parents=True)
            for name in ('workers-loopback.py','sandbox.py'):shutil.copyfile(GUARD.with_name(name),helpers/name)
            node=parent/'runtime/bin/node';node.parent.mkdir(parents=True)
            shutil.copyfile(shutil.which('node'),node);node.chmod(0o755)
            package=parent/'separate-npm';(package/'bin').mkdir(parents=True)
            (package/'package.json').write_text('{"name":"npm","type":"module"}')
            (package/'relative.js').write_text('export const value = 42;')
            entry=package/'bin/npm-cli.js';entry.write_text('import {value} from "../relative.js";if(value!==42)throw Error("missing package closure");console.log("WORKERS_PACKAGE_RESTORED");')
            environment={**os.environ,'PATH':f'{node.parent}:/usr/bin:/bin'}
            environment.pop('YF_GUARD_INPUT_ROOTS',None)
            result=subprocess.run(['/usr/bin/python3',helpers/'workers-loopback.py',root,scratch,scratch,'--',node,entry],env=environment,text=True,capture_output=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('WORKERS_PACKAGE_RESTORED',result.stdout)

    def test_ipc_outer_strict_inner_equivalent_postprofile_kernel_control(self):
        with tempfile.TemporaryDirectory() as value:
            scratch=Path(value)
            code="import subprocess,sys,os;subprocess.run([sys.executable,"+repr(str(GUARD))+","+repr(str(ROOT))+","+repr(str(scratch))+",'--',sys.executable,"+repr(str(ROOT/'scripts/ci.py'))+",'--guard-inside',"+repr(str(ROOT))+","+repr(str(scratch))+",os.readlink('/proc/self/ns/net')],check=True)"
            result=subprocess.run(['/usr/bin/python3',GUARD,'--profile','ipc',ROOT,scratch,'--','/usr/bin/python3','-c',code],text=True,capture_output=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('Strict offline kernel controls passed',result.stdout)
