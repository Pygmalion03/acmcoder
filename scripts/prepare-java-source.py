#!/usr/bin/env python3
"""Preserve the exact public OpenJDK sources and Ubuntu patch used by JCL v3.2."""
import hashlib
from pathlib import Path
import re
import io
import sys
import tarfile
import urllib.request

cache=Path('/tmp/acmcoder-browser-language-assets')
cache.mkdir(parents=True,exist_ok=True)
base='https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/openjdk-8/8u72-b05-1ubuntu1/'
name='openjdk-8_8u72-b05-1ubuntu1.dsc'
target=cache/name
if not target.exists():
    with urllib.request.urlopen(base+name,timeout=60) as response:target.write_bytes(response.read())
dsc=target.read_bytes()
if hashlib.sha256(dsc).hexdigest()!='1875ca31464ae128071a40bae8083ad375350540ec686ccf30f77ee2066745c2':raise ValueError('OpenJDK distribution manifest checksum mismatch')
checks=dsc.decode().split('Checksums-Sha256:\n',1)[1].split('\nFiles:',1)[0]
files=[]
for digest,size,name in re.findall(r'^ ([a-f0-9]{64}) (\d+) (\S+)$',checks,re.M):
    if name not in ['openjdk-8_8u72-b05.orig.tar.gz','openjdk-8_8u72-b05-1ubuntu1.diff.gz']:raise ValueError('Unexpected OpenJDK source file')
    target=cache/name
    if not target.exists():
        temporary=target.with_suffix(target.suffix+'.part')
        with urllib.request.urlopen(base+name,timeout=60) as response,temporary.open('wb') as output:
            while chunk:=response.read(1024*1024):output.write(chunk)
        temporary.replace(target)
    if target.stat().st_size!=int(size) or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise ValueError('OpenJDK source checksum mismatch')
    files.append({'name':name,'bytes':int(size),'sha256':digest})
if len(files)!=2:raise ValueError('Missing corresponding source or distribution patch')
(cache/'openjdk-8_8u72-b05-1ubuntu1.dsc').write_bytes(dsc)
print(files,flush=True)
if len(sys.argv)>1:
    destination=Path(sys.argv[1]);destination.mkdir(parents=True,exist_ok=True)
    with tarfile.open(cache/'openjdk-8_8u72-b05.orig.tar.gz') as archive:
        with tarfile.open(fileobj=io.BytesIO(archive.extractfile('openjdk-8-8u72-b05/root.tar.xz').read())) as root:
            for source,name in [('LICENSE','OpenJDK-GPL-Classpath.txt'),('THIRD_PARTY_README','OpenJDK-THIRD-PARTY.txt')]:
                (destination/name).write_bytes(root.extractfile('jdk8u-jdk8u72-b05/'+source).read())
    for package,name in [('doppiojvm-0.5.0.tgz','Doppio-MIT.txt'),('browserfs-1.4.3.tgz','BrowserFS-MIT.txt')]:
        with tarfile.open(cache/package) as archive:(destination/name).write_bytes(archive.extractfile('package/LICENSE').read())
    with tarfile.open(cache/'doppio-jcl-v3.2.tar.gz') as archive:(destination/'JCL-THIRD-PARTY.txt').write_bytes(archive.extractfile('java_home/THIRD_PARTY_README').read())
