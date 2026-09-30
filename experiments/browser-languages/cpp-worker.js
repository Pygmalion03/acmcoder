import API from './shared.js';
import { createClangApi, CLANG22_CONFIG, compileLinkRunResult } from './compiler-bridge.js';

let bundle;
let sequence = 0;
let downloaded = 0;
let currentPhase = 'loading';
let resources;
let boundary;
const phase = (value) => { currentPhase = value; postMessage({ type: 'phase', phase: value }); };
async function readBuffer(name) {
  if (resources) {
    if (!resources.has(name)) throw new Error('Unapproved runtime resource');
    return resources.get(name);
  }
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error(`Resource ${name}: ${response.status}`);
  const value = await response.arrayBuffer();
  downloaded += value.byteLength;
  return value;
}

async function initialize() {
  phase('loading');
  bundle = createClangApi({
    APIClass: API, readBuffer,
    compileStreaming: async (name) => WebAssembly.compile(await readBuffer(name)),
    hostWrite: () => {}, showTiming: false,
    config: { ...CLANG22_CONFIG, sysroot: 'sysroot22-standard.tar', lldFlags: ['--export-dynamic', '--max-memory=67108864'] },
  });
  await bundle.api.ready;
  // Narrow probe adapter fixes upstream Latin-1 stdin and split UTF-8 writes.
  const fs = bundle.api.memfs;
  fs.setStdinStr = (text) => { fs.stdinBytes = new TextEncoder().encode(text); fs.stdinStrPos = 0; };
  fs.host_read = function(fd, iovs, count, nread) {
    if (fd !== 0) return 8;
    this.hostMem_.check();
    let size = 0;
    for (let i = 0; i < count; i++, iovs += 8) {
      const destination = this.hostMem_.read32(iovs);
      const length = this.hostMem_.read32(iovs + 4);
      const available = Math.min(length, this.stdinBytes.length - this.stdinStrPos);
      this.hostMem_.write(destination, this.stdinBytes.subarray(this.stdinStrPos, this.stdinStrPos + available));
      this.stdinStrPos += available;
      size += available;
      if (available < length) break;
    }
    this.hostMem_.write32(nread, size);
    return 0;
  };
  fs.host_write = function(fd, iovs, count, nwritten) {
    this.hostMem_.check();
    let size = 0;
    let text = '';
    const decoder = this.decoders[fd] ||= new TextDecoder();
    for (let i = 0; i < count; i++, iovs += 8) {
      const source = this.hostMem_.read32(iovs);
      const length = this.hostMem_.read32(iovs + 4);
      text += decoder.decode(this.hostMem_.u8.subarray(source, source + length), { stream: true });
      size += length;
    }
    this.hostMem_.write32(nwritten, size);
    this.hostWrite(text);
    return 0;
  };
  // prepare.py changes the import binding to resolve current methods, allowing
  // these narrow I/O fixes without discarding/reloading the populated sysroot.
  fs.decoders = {};
  // Expose exact execution start for a bounded infinite-loop cancellation.
  const originalRun = bundle.api.run.bind(bundle.api);
  bundle.api.run = async (module, ...args) => {
    phase(args[0].endsWith('.wasm') ? 'executing' : args[0] === 'clang' ? 'compiling' : 'linking');
    fs.decoders = {};
    return originalRun(module, ...args);
  };
}

onmessage = async ({ data }) => {
  const start = performance.now();
  try {
    if (data.resources) resources = new Map(data.resources.map(item => [item.name, item.bytes]));
    if (data.isolationCheck && !boundary) {
      let networkBlocked = false, indexedDBBlocked = false;
      try { await fetch(new URL('/api/capabilities', data.parentUrl), { credentials: 'omit' }); } catch { networkBlocked = true; }
      try { indexedDB.open('acmcoder-language-boundary-probe'); } catch { indexedDBBlocked = true; }
      boundary = { opaqueOrigin: location.origin === 'null', networkBlocked, indexedDBBlocked, noExtensionAPI: !self.chrome?.runtime?.id };
    }
    if (!bundle) await initialize();
    const id = ++sequence;
    phase('compiling');
    const result = await compileLinkRunResult(bundle, { input: `main${id}.cc`, contents: data.code, obj: `main${id}.o`, wasm: `main${id}.wasm`, stdin: data.stdin || '' });
    postMessage({ type: 'result', id: data.id, ...result, boundary, ms: performance.now() - start, downloaded });
  } catch (error) {
    postMessage({ type: 'result', id: data.id, error: error.message, kind: error.name, phase: currentPhase, diagnostics: error.diagnostics, rawLog: error.rawLog || bundle?.log.text.slice(-12000), ms: performance.now() - start, downloaded });
  }
};
