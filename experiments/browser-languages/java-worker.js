importScripts('./browserfs.js');
BrowserFS.install(self);
// Doppio yields frequently through this Node primitive. A setTimeout shim
// incurs browser timer clamping and can turn javac into a minute-long load.
const immediateChannel = new MessageChannel();
const immediateJobs = new Map();
let immediateId = 0;
immediateChannel.port1.onmessage = ({ data: id }) => {
  const job = immediateJobs.get(id); immediateJobs.delete(id); job?.();
};
self.setImmediate = (callback, ...args) => {
  const id = ++immediateId; immediateJobs.set(id, () => callback(...args));
  immediateChannel.port2.postMessage(id); return id;
};
self.clearImmediate = (id) => immediateJobs.delete(id);
importScripts('./doppio.js');
importScripts('./quota.js');
const allocationQuota=installJavaAllocationQuota(self.DoppioJVM||self.Doppio,{onExceeded(){postMessage({type:'result',id:currentId,error:'Java 累计分配超过限制，已停止。',kind:'MemoryLimit'});self.close();}});
let fs, stdout = '', stderr = '', sequence = 0;
let ready;
let currentId;
let bootPaths;
let bootFiles;
const ioErrors = [];
self.onerror = (message, file, line, col, error) => {
  postMessage({ type: 'result', id: currentId, error: String(message), kind: 'StartupError', stack: error?.stack, ioErrors, bootPaths, bootFiles });
  return true;
};
const phase = (value) => postMessage({ type: 'phase', phase: value });
async function initialize() {
      const [listing, sizes] = await Promise.all(['listings.json', 'file-sizes.json'].map(async name => {
        const response = await fetch(new URL(name, location.href));
        if (!response.ok) throw new Error(`JCL metadata ${response.status}`);
        return response.json();
      }));
      const root = new BrowserFS.FileSystem.MountableFileSystem();
      const library = new BrowserFS.FileSystem.XmlHttpRequest(listing, new URL('./', location.href).href);
      // Avoid a HEAD request for every jar. The probe's static host does not
      // implement HEAD; sizes are derived from the pinned public JCL archive.
      const size = name => {
        const value = sizes[name.replace(/^\//, '')];
        if (value === undefined) throw new Error('Unknown JCL resource size');
        return value;
      };
      library._requestFileSizeSync = size;
      library._requestFileSizeAsync = (name, cb) => { try { cb(null, size(name)); } catch (error) { cb(error); } };
      root.mount('/tmp', new BrowserFS.FileSystem.InMemory());
      root.mount('/sys', library);
      BrowserFS.initialize(root);
      fs = BrowserFS.BFSRequire('fs');
      allocationQuota.protectFiles(fs);
      const read = fs.readFile.bind(fs);
      fs.readFile = (name, ...args) => {
        const cb = args.pop();
        read(name, ...args, (error, value) => {
          if (error && ioErrors.length < 8) ioErrors.push({ name, message: error.message });
          cb(error, value);
        });
      };
      process.stdout.on('data', (bytes) => { stdout += bytes.toString(); });
      process.stderr.on('data', (bytes) => { stderr += bytes.toString(); });
}
function newJVM(classpath) {
  const JVM = (self.DoppioJVM || self.Doppio).VM.JVM;
  bootPaths = JVM.getDefaultOptions('/sys').bootstrapClasspath;
  bootFiles = bootPaths.map(name => {
    try { const stat = fs.statSync(name); return { name, size: stat.size, isFile: stat.isFile() }; }
    catch (error) { return { name, error: error.message }; }
  });
  return new Promise((resolve, reject) => new JVM({ doppioHomePath: '/sys', classpath, intMode: true, responsiveness: 1000, properties: { 'file.encoding': 'UTF-8' } }, (error, vm) => {if(error)reject(error);else{allocationQuota.protect(vm);resolve(vm);}}));
}
function runClass(vm, name, args) { return new Promise((resolve) => vm.runClass(name, args, resolve)); }
onmessage = async ({ data }) => {
  currentId = data.id;
  const started = performance.now();
  try {
    phase('loading');
    await (ready ||= initialize());
    const directory = `/tmp/run${++sequence}`;
    fs.mkdirSync(directory);
    fs.writeFileSync(`${directory}/Main.java`, data.code, 'utf8');
    stdout = ''; stderr = '';
    phase('compiling');
    allocationQuota.begin(256*1024*1024);
    const compiler = await newJVM(['/sys/vendor/java_home/lib/tools.jar', directory]);
    phase('javac-running');
    const compileCode = await runClass(compiler, 'com.sun.tools.javac.Main', ['-encoding', 'UTF-8', '-d', directory, `${directory}/Main.java`]);
    if (compileCode !== 0) throw Object.assign(new Error('javac failed'), { name: 'CompileError', rawLog: stdout + stderr });
    stdout = ''; stderr = '';
    allocationQuota.begin(64*1024*1024);
    const vm = await newJVM([directory]);
    // Use a finite input buffer, rather than TTY input that waits indefinitely.
    let input = Buffer.from(data.stdin || '', 'utf8');
    process.stdin.read = (size) => {
      // Doppio's native stdin maps an empty buffer to EOF; null waits for a
      // future TTY readable event and would hang after finite ACM input.
      if (input.length === 0) return Buffer.alloc(0);
      const length = Math.min(size || input.length, input.length);
      const bytes = input.slice(0, length); input = input.slice(length); return bytes;
    };
    phase('executing');
    const exitCode = await runClass(vm, 'Main', []);
    postMessage({ type: 'result', id: data.id, stdout, stderr, exitCode, ms: performance.now() - started });
  } catch (error) {
    postMessage({ type: 'result', id: data.id, error: String(error.message || error), kind: error.name, rawLog: error.rawLog || stdout + stderr, ms: performance.now() - started });
  }
};
