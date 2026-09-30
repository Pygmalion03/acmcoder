// Node VM preflight of the published browser bundle, NOT browser acceptance.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = path.resolve(process.argv[2]);
const context = vm.createContext({ console, setTimeout, clearTimeout, setImmediate, clearImmediate, process, Buffer, Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, require, module: { exports: {} }, exports: {} });
context.global = context;
vm.runInContext(fs.readFileSync(path.join(directory, 'java/browserfs.js'), 'utf8'), context);
const bfs = context.module.exports;
context.BrowserFS = bfs;
const bfsRequire = bfs.BFSRequire;
// Jar class loaders instantiate BrowserFS's FS even while the root classpath
// lives on disk in this Node-only preflight. Preserve that constructor.
const diskFS = { ...fs, FS: bfsRequire('fs').FS };
bfs.BFSRequire = (name) => name === 'fs' ? diskFS : ['path', 'process', 'buffer'].includes(name) ? require(name) : bfsRequire(name);
context.module = { exports: {} }; context.exports = context.module.exports;
context.require = (name) => name === 'browserfs' ? bfs : require(name);
vm.runInContext(fs.readFileSync(path.join(directory, 'java/doppio.js'), 'utf8'), context);
const JVM = context.module.exports.VM.JVM;
const home = path.join(directory, 'java/vendor/java_home');
const tmp = '/tmp/acmcoder-doppio-preflight';
fs.mkdirSync(tmp, { recursive: true });
const newJVM = () => new Promise((resolve, reject) => new JVM({ doppioHomePath: tmp, javaHomePath: home, bootstrapClasspath: JVM.getJDKInfo().classpath.map(name => path.join(home, name)), classpath: [tmp], tmpDir: tmp, intMode: true, responsiveness: 1000, properties: { 'file.encoding': 'UTF-8' } }, (err, jvm) => err ? reject(err) : resolve(jvm)));
const runClass = (jvm, name, args) => new Promise(resolve => jvm.runClass(name, args, resolve));
const originalWrite = process.stdout.write.bind(process.stdout);
let output = '';
process.stdout.write = (chunk, ...args) => { output += chunk.toString(); return originalWrite(chunk, ...args); };
const report = (value) => originalWrite(JSON.stringify({ environment: 'Node VM of browser bundle; not browser', ...value }) + '\n');
const timer = setTimeout(() => { report({ error: 'deadline-120s' }); process.exit(2); }, 120000);
(async () => {
  const started = performance.now();
  const source = 'import java.util.*; public class Main {public static void main(String[] a){int[] n={7,2,9,3};Arrays.sort(n);Map<String,Integer> m=new HashMap<>();m.put("结果",n[0]+n[3]);System.out.println("结果 "+m.get("结果"));try{byte[] b=new byte[80*1024*1024];b[0]=1;b[b.length-1]=2;System.out.println("UNBOUNDED "+b.length);}catch(OutOfMemoryError e){System.out.println("BOUNDED");}}}';
  fs.writeFileSync(path.join(tmp, 'Main.java'), source);
  const compiler = await newJVM();
  const compileStart = performance.now();
  const compileExit = await runClass(compiler, 'com.sun.tools.javac.Main', ['-encoding', 'UTF-8', '-d', tmp, path.join(tmp, 'Main.java')]);
  report({ phase: 'compiled', compileExit, compileMs: performance.now() - compileStart, ms: performance.now() - started });
  if (compileExit !== 0) return;
  output = '';
  const runtime = await newJVM();
  const exitCode = await runClass(runtime, 'Main', []);
  report({ phase: 'executed', exitCode, stdout: output, ms: performance.now() - started });
})().catch(error => { report({ error: error.message || String(error), stack: error.stack }); process.exitCode = 1; }).finally(() => clearTimeout(timer));
