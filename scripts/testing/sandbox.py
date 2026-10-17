"""Shared mount construction for trusted Linux test/repair/capture launchers."""
import json
import os
from pathlib import Path
import shutil
import sys

MASKS = (Path('/run'), Path('/tmp'), Path('/var/tmp'))


def mount_arguments(root, scratch, command, *, owner, tools=()):
    """Mask common host IPC directories; restore explicit complete input closures.

    This is not a pathname socket allowlist. Unix-enabled trusted workloads can
    still reach sockets elsewhere on the read-only host or supplied input roots.
    """
    root, scratch, owner = [Path(value).resolve(strict=True) for value in (root, scratch, owner)]
    inputs = {root, owner, Path(sys.executable).resolve(strict=True)}
    inputs.update(Path(value).resolve(strict=True) for value in tools)
    # Carry the exact owning checkout and explicitly supplied package closures
    # through nested guards. Never restore a PATH directory or a whole temp root.
    encoded = os.environ.get('YF_GUARD_INPUT_ROOTS', '[]')
    if len(encoded) > 65536:
        raise RuntimeError('Explicit guard input closure is too large')
    inherited = json.loads(encoded)
    if not isinstance(inherited, list) or len(inherited) > 64 or not all(isinstance(value, str) for value in inherited):
        raise RuntimeError('Invalid explicit guard input closure')
    for value in inherited:
        entry = Path(value)
        if not entry.is_absolute() or str(entry.resolve(strict=True)) != value or not (entry.is_dir() or entry.is_file()):
            raise RuntimeError('Guard input closure must contain canonical regular inputs')
        inputs.add(entry)
    aliases = {}
    for name in ('bun', 'node', 'python3', 'git', 'bwrap', 'ip', 'setpriv'):
        value = shutil.which(name)
        if value:
            lexical = Path(value).absolute()
            canonical = lexical.resolve(strict=True)
            inputs.add(canonical)
            if lexical != canonical:
                aliases[lexical] = canonical
    for argument in command:
        path = Path(argument)
        if path.is_absolute() and path.is_file():
            canonical = path.resolve(strict=True)
            inputs.add(canonical)
            if path != canonical:
                aliases[path] = canonical
    if any(value == mask or value in mask.parents for value in inputs | {scratch} for mask in MASKS):
        raise RuntimeError('Guard cannot restore a whole host runtime/temporary root')
    inputs = {value for value in inputs if value.is_dir() or not any(directory.is_dir() and directory in value.parents for directory in inputs)}
    arguments = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc']
    for mask in MASKS:
        arguments.extend(['--tmpfs', str(mask)])
    # Parent-first binds retain the more specific read/write scratch mount last.
    for value in sorted(inputs, key=lambda value: (len(value.parts), str(value))):
        arguments.extend(['--ro-bind', str(value), str(value)])
    for lexical, canonical in sorted(aliases.items(), key=lambda item: str(item[0])):
        if any(mask in lexical.parents for mask in MASKS) and not any(value == lexical or value in lexical.parents for value in inputs if value.is_dir()):
            arguments.extend(['--ro-bind', str(canonical), str(lexical)])
    arguments.extend(['--bind', str(scratch), str(scratch)])
    for mask in MASKS:
        arguments.extend(['--remount-ro', str(mask)])
    return arguments, json.dumps(sorted(map(str, inputs)), separators=(',', ':'))
