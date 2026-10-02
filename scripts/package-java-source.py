#!/usr/bin/env python3
"""Package only verified public corresponding Java sources, never user data."""
import hashlib
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

root=Path(__file__).resolve().parent.parent
cache=Path('/tmp/acmcoder-browser-language-assets')
subprocess.run([sys.executable,str(root/'scripts/prepare-java-source.py')],check=True)
builder=cache/'doppio-jcl-source-18cce8f.tar.gz'
if not builder.exists():
    with urllib.request.urlopen('https://codeload.github.com/plasma-umass/doppio_jcl/tar.gz/18cce8f823ad5a6d623d1a2549883812531ea71a',timeout=60) as response:builder.write_bytes(response.read())
expected={
    builder.name:'f7e6d9a2a6b1c0918fd8ce748296aabfb87261c033772d7c961557d3c7090afc',
    'doppiojvm-0.5.0.tgz':'62ce4d126c934a899487d12c2bb19175e9ce3cba5ee02d67a00fe8ee158d6ff2',
    'browserfs-1.4.3.tgz':'9ea8d32be9b14b868631fee2cad5de3baa0e095a6af243644382396abe7d179c',
    'openjdk-8_8u72-b05.orig.tar.gz':'ba8018db32084d6be91111a23c89758d0d59f5bd5684168d04b9e2c7d225e3fc',
    'openjdk-8_8u72-b05-1ubuntu1.diff.gz':'c07dd4a3f04339e3666adae459c9cc80d7845a74e38c47a20ef7566ec152a445',
    'openjdk-8_8u72-b05-1ubuntu1.dsc':'1875ca31464ae128071a40bae8083ad375350540ec686ccf30f77ee2066745c2',
}
destination=Path(sys.argv[1]);destination.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_STORED) as archive:
    for name,digest in expected.items():
        data=(cache/name).read_bytes()
        if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Corresponding source checksum mismatch: '+name)
        archive.writestr(zipfile.ZipInfo(name,(1980,1,1,0,0,0)),data)
    archive.writestr(zipfile.ZipInfo('README.md',(1980,1,1,0,0,0)),(root/'third_party/java/README.md').read_bytes())
print('Verified public Java corresponding source package prepared.',flush=True)
