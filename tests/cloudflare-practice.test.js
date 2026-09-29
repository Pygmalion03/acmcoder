import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function practicePage() {
  const elements = new Map();
  const posted = [];
  const recorded = [];
  const listeners = new Map();
  let unique = 0;
  const frame = { postMessage: message => posted.push(message) };
  const element = () => ({
    value: '', textContent: '', className: '', hidden: false, disabled: false, href: '',
    children: [],
    addEventListener(type, handler) { this.handlers ??= {}; this.handlers[type] = handler; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    scrollIntoView() {}
  });
  const $ = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  $('python-sandbox').contentWindow = frame;
  const storage = new Map();
  const document = { getElementById: $, createElement: element };
  const window = { addEventListener: (type, handler) => listeners.set(type, handler) };
  const context = vm.createContext({ document, window, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  }, crypto: { randomUUID: () => `id-${++unique}` }, setTimeout: () => ++unique, clearTimeout() {} });
  vm.runInContext(readFileSync(new URL('../cloudflare/public/app.js', import.meta.url), 'utf8'), context);
  window.ACMCloud = { recordResult: (...args) => recorded.push(args), leavingProblem() {}, selectedProblem() {} };
  const nonce = vm.runInContext('nonce', context);
  const message = data => listeners.get('message')({ source: frame, origin: 'null', data: { ...data, nonce } });
  message({ kind: 'ready' });
  return { $, context, posted, recorded, message };
}

test('run all samples reports each result and records one complete round', () => {
  const page = practicePage();
  vm.runInContext("sample.demo = { title: 'Demo', description: '', code: 'print(1)', stdin: 'a', expected: '1', cases: [{ stdin: 'a', expected: '1' }, { stdin: 'b', expected: '2' }] }; loadProblem('demo')", page.context);
  page.$('run-all').handlers.click();
  const first = page.posted.filter(item => item.kind === 'run')[0];
  assert.equal(first.stdin, 'a');
  page.message({ kind: 'running', id: first.id });
  page.message({ kind: 'stdout', id: first.id, text: '1\n' });
  page.message({ kind: 'complete', id: first.id });
  const second = page.posted.filter(item => item.kind === 'run')[1];
  assert.equal(second.stdin, 'b');
  page.message({ kind: 'running', id: second.id });
  page.message({ kind: 'stdout', id: second.id, text: 'wrong\n' });
  page.message({ kind: 'complete', id: second.id });
  assert.equal(page.$('case-results').children.length, 2);
  assert.match(page.$('case-results').children[1].children[1].textContent, /期望：\n2/);
  assert.match(page.$('result').textContent, /1\/2 组通过/);
  assert.equal(page.recorded.length, 1);
  assert.equal(page.recorded[0][1], 'self_fail');
});

test('switching problems cancels the sample queue and ignores stale output', () => {
  const page = practicePage();
  vm.runInContext("sample.demo = { title: 'Demo', description: '', code: '', stdin: 'a', expected: '', cases: [{ stdin: 'a', expected: '' }, { stdin: 'b', expected: '' }] }; loadProblem('demo')", page.context);
  page.$('run-all').handlers.click();
  const first = page.posted.filter(item => item.kind === 'run')[0];
  vm.runInContext("loadProblem('free')", page.context);
  page.message({ kind: 'stdout', id: first.id, text: 'stale' });
  page.message({ kind: 'complete', id: first.id });
  assert.equal(page.$('case-results').children.length, 0);
  assert.equal(page.posted.filter(item => item.kind === 'run').length, 1);
  assert.equal(page.recorded.length, 0);
});
