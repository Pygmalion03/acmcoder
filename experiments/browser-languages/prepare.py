#!/usr/bin/env python3
"""Download probe dependencies into an ignored WSL directory; never into Git.

Run from WSL with a target under dist/local-web/language-probe. Native tools
below build only the tiny memfs adapter, never the submitted user program.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

CPP_SHA = 'df1180d80184733c6a01599f76b92b4001d20f87'
ROOT = Path(__file__).resolve().parent
CACHE = Path('/tmp/acmcoder-browser-language-assets')
EXPECTED_SHA256 = {
    'clang22': '3f3da7691ecc5d02d7f056ba849eed408fcf494656ad65b5756ba285e59d30a5',
    'lld22': '4d88d4faa2bbe22dfb099bf28d8c5884fb3e90462acca4057dbb96746ce99ac4',
    'sysroot22.tar': 'd991c621cdf9b4640c2cd4aa21abb08491c2ae6ef9917cac5c6065553604bcec',
    'wasi-sdk-33.deb': '419004876a792bb6effa5579200e7ef61842c887d23d11ddbf845c3f4938223e',
    'cpp-shared.js': '27585644f3d8f6a77de392ad98e17b9c195118262a8fa8a3b1e254964d267e4e',
    'cpp-compiler-bridge.js': '33f5dfc3b0663f3bd748e0b48266bda0f5062201c21f6b31e4622e219ac341c1',
    'cpp-error-parser.js': 'bb86b456ab519bf50b9dff5e05f199487ad1dc2715dcad29288651acf9144b48',
    'cpp-memfs-memfs.c': '31751123b5def9dddec49b9e627747bc41fe28f42510ca1f2c4c791ff0236522',
    'cpp-memfs-stb_sprintf.h': '2f985eb41aae52d1853fe4f90693bb899305d734e04ecad9346356037873d3f7',
    'browserfs-1.4.3.tgz': '9ea8d32be9b14b868631fee2cad5de3baa0e095a6af243644382396abe7d179c',
    'doppiojvm-0.5.0.tgz': '62ce4d126c934a899487d12c2bb19175e9ce3cba5ee02d67a00fe8ee158d6ff2',
    'doppio-jcl-v3.2.tar.gz': 'bee079d16b8631ff56d3bdc66b4d03e0ecbf9ee46baeef9b041c0bc497f25c34',
}


def download(name, url):
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / name
    if not target.exists():
        temporary = target.with_suffix(target.suffix + '.part')
        total = 0
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as out:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 512 * 1024 * 1024:
                    raise ValueError('Probe dependency exceeds download bound')
                out.write(chunk)
        temporary.replace(target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256[name]:
        raise ValueError(f'Pinned probe dependency checksum changed: {name}')
    print(json.dumps({'dependency': name, 'bytes': target.stat().st_size, 'sha256': digest}), flush=True)
    return target


def cpp(target):
    directory = target / 'cpp'
    directory.mkdir(parents=True, exist_ok=True)
    base = 'https://github.com/cppstudio-io/wasm-clang-runtime/releases/download/v0.1.0/'
    jobs = [(name, base + name) for name in ['clang22', 'lld22', 'sysroot22.tar']]
    jobs += [('wasi-sdk-33.deb', 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-33/wasi-sdk-33.0-x86_64-linux.deb')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda pair: download(*pair), jobs))
    for source in paths[:3]:
        shutil.copy2(source, directory / source.name)
    sdk = CACHE / 'wasi-sdk-33'
    if not (sdk / 'opt/wasi-sdk/bin/clang').exists():
        subprocess.run(['dpkg-deb', '-x', str(paths[3]), str(sdk)], check=True)
    native = sdk / 'opt/wasi-sdk'
    # The candidate release substitutes a teaching-only iostream. Test one
    # bounded correction using the SAME wasi-sdk version already required.
    standard_header = native / 'share/wasi-sysroot/include/wasm32-wasip1/noeh/c++/v1/iostream'
    with tarfile.open(paths[2]) as original, tarfile.open(directory / 'sysroot22-standard.tar', 'w') as out:
        for item in original:
            if item.name == 'include/wasm32-wasip1/noeh/c++/v1/iostream':
                item.size = standard_header.stat().st_size
                with standard_header.open('rb') as contents:
                    out.addfile(item, contents)
            else:
                out.addfile(item, original.extractfile(item) if item.isfile() else None)
    source = CACHE / 'cpp-source'
    source.mkdir(exist_ok=True)
    for name in ['shared.js', 'compiler-bridge.js', 'error-parser.js', 'memfs/memfs.c', 'memfs/stb_sprintf.h']:
        file = download('cpp-' + name.replace('/', '-'), 'https://raw.githubusercontent.com/cppstudio-io/wasm-clang-runtime/' + CPP_SHA + '/src/' + name)
        shutil.copy2(file, source / Path(name).name)
    clang = str(native / 'bin/clang')
    for name, extra in [('memfs.c', ['-Wall', '-Wextra', '-Wno-unused-parameter']), ('stb_sprintf.h', ['-DSTB_SPRINTF_IMPLEMENTATION', '-x', 'c'])]:
        subprocess.run([clang, '--target=wasm32-wasip1', '-O2', *extra, '-c', '-o', str(source / (name + '.o')), str(source / name)], check=True)
    subprocess.run([str(native / 'bin/wasm-ld'), '-L' + str(native / 'share/wasi-sysroot/lib/wasm32-wasip1'), '--no-entry', '--export-dynamic', '--allow-undefined', '--initial-memory=4194304', '-o', str(directory / 'memfs'), str(source / 'memfs.c.o'), str(source / 'stb_sprintf.h.o'), '-lc'], check=True)
    for name in ['shared.js', 'compiler-bridge.js', 'error-parser.js']:
        shutil.copy2(source / name, directory / name)
    shared = directory / 'shared.js'
    text = shared.read_text()
    old = 'result[name] = obj[name].bind(obj);'
    if text.count(old) != 1:
        raise ValueError('Upstream WASI import binding changed')
    shared.write_text(text.replace(old, 'result[name] = (...args) => obj[name](...args);') + '\nexport default API;\n')
    shutil.copy2(ROOT / 'cpp-worker.js', directory / 'worker.js')
    # Fixed classic-worker bundle, loaded as bytes into an opaque-origin
    # sandbox. It does not use eval, dynamic import or runtime network access.
    parts = []
    for name in ['shared.js', 'error-parser.js', 'compiler-bridge.js', 'worker.js']:
        text = (directory / name).read_text()
        text = re.sub(r'^import .*?;\n', '', text, flags=re.MULTILINE)
        text = text.replace('export default API;', '')
        text = re.sub(r'^export ', '', text, flags=re.MULTILINE)
        text = text.replace('new URL(name, import.meta.url)', 'name')
        parts.append(text)
    (directory / 'isolated-worker.js').write_text('\n'.join(parts))


def java(target):
    directory = target / 'java'
    directory.mkdir(parents=True, exist_ok=True)
    packages = [('doppiojvm-0.5.0.tgz', 'https://registry.npmjs.org/doppiojvm/-/doppiojvm-0.5.0.tgz'), ('browserfs-1.4.3.tgz', 'https://registry.npmjs.org/browserfs/-/browserfs-1.4.3.tgz'), ('doppio-jcl-v3.2.tar.gz', 'https://github.com/plasma-umass/doppio_jcl/releases/download/v3.2/java_home.tar.gz')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        paths = list(pool.map(lambda pair: download(*pair), packages))
    for path, member, name in [(paths[0], 'package/dist/release/doppio.js', 'doppio.js'), (paths[0], 'package/dist/doppio.jar', 'doppio.jar'), (paths[1], 'package/dist/browserfs.min.js', 'browserfs.js')]:
        with tarfile.open(path) as archive:
            (directory / name).write_bytes(archive.extractfile(member).read())
    home = directory / 'vendor'
    home.mkdir(exist_ok=True)
    with tarfile.open(paths[2]) as archive:
        for item in archive:
            # Reject links and traversal; this is a public dependency archive.
            relative = Path(item.name)
            if relative.is_absolute() or '..' in relative.parts or not relative.parts or relative.parts[0] != 'java_home':
                raise ValueError('Unexpected JCL archive path')
            if item.isfile():
                file = home / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(archive.extractfile(item).read())
    lib = home / 'java_home/lib'
    shutil.copy2(directory / 'doppio.jar', lib / 'doppio.jar')
    listing = {}
    sizes = {}
    for file in home.rglob('*'):
        if file.is_file():
            sizes[str(file.relative_to(directory))] = file.stat().st_size
            current = listing
            for part in file.relative_to(directory).parts[:-1]:
                current = current.setdefault(part, {})
            current[file.name] = None
    (directory / 'listings.json').write_text(json.dumps(listing))
    (directory / 'file-sizes.json').write_text(json.dumps(sizes))
    shutil.copy2(ROOT / 'java-worker.js', directory / 'worker.js')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('target', type=Path)
    parser.add_argument('--language', choices=['cpp', 'java', 'all'], default='all')
    args = parser.parse_args()
    target = args.target.resolve()
    if target.parts[-3:] != ('dist', 'local-web', 'language-probe'):
        raise ValueError('Use the isolated, ignored language-probe output directory')
    target.mkdir(parents=True, exist_ok=True)
    for name in ['probe.html', 'probe.js', 'isolated-bridge.html', 'isolated-bridge.js']:
        shutil.copy2(ROOT / name, target / name)
    bridge = (ROOT / 'isolated-bridge.html').read_text().replace('/* BRIDGE_SOURCE */', (ROOT / 'isolated-bridge.js').read_text())
    (target / 'isolated-bridge.html').write_text(bridge)
    if args.language in ['cpp', 'all']:
        cpp(target)
    if args.language in ['java', 'all']:
        java(target)
    print('Prepared browser-language probe dependencies; not a product build.', flush=True)
