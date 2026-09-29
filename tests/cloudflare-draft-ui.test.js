import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function element() {
  return {
    value: '', textContent: '', hidden: true, checked: false,
    addEventListener() {}, replaceChildren() {}, append() {}, add() {},
    scrollIntoView() {}, reset() {}, querySelector() { return element(); }
  };
}

test('edits made while cloud draft GET is pending never overwrite the remote draft', async () => {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const storage = new Map();
  const requests = [];
  let resolveDraft;
  const response = data => ({ ok: true, status: 200, json: async () => data });
  const fetch = (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    if (url === '/api/auth/session') return Promise.resolve(response({ user: { id: 'user-a', login: 'a' } }));
    if (url === '/api/problems') return Promise.resolve(response({ problems: [] }));
    if (url === '/api/progress') return Promise.resolve(response({ progress: [] }));
    if (url === '/api/plans/today') return Promise.resolve(response({ plan: [] }));
    if (url === '/api/drafts/sum') return new Promise(resolve => { resolveDraft = value => resolve(response(value)); });
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({
    $, fetch, Option: function Option(label, value) { return { label, value }; },
    document: { createElement: element, addEventListener() {} }, window: { addEventListener() {} },
    sample: { sum: { title: 'Sum' }, free: { title: 'Free' } },
    problem: 'sum', fields: ['code', 'stdin', 'expected'],
    draftScope: 'guest', draftKey: id => `draft:${id}`,
    guestDraftKey: id => `guest:${id}`, saveDraft() {}, loadProblem() {},
    lastProblemKey: () => 'last-problem',
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true
  });
  vm.runInContext(readFileSync(new URL('../cloudflare/public/account.js', import.meta.url), 'utf8'), context);
  for (let i = 0; i < 10 && !resolveDraft; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolveDraft, 'function', JSON.stringify({ requests, accountState: $('account-state').textContent }));
  $('code').value = 'edited while loading';
  storage.set('draft:sum', JSON.stringify({ code: 'edited while loading', stdin: '', expected: '' }));
  vm.runInContext("cloudDraftChanged('sum')", context);
  assert.equal(requests.some(item => item.method === 'PUT'), false);
  resolveDraft({ draft: { code: 'remote', stdin: '', expected: '', version: 3 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal($('code').value, 'edited while loading');
  assert.equal(vm.runInContext('cloudConflict.remote.code', context), 'remote');
  assert.equal(requests.some(item => item.method === 'PUT'), false);
});

test('a stale tab binds draft writes to its original account and keeps its local copy on account switch', async () => {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const storage = new Map();
  const requests = [];
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', expected: options.headers?.['x-acm-expected-user'] });
    if (url === '/api/auth/session') return response({ user: { id: 'user-a', login: 'a' } });
    if (url === '/api/problems') return response({ problems: [] });
    if (url === '/api/progress') return response({ progress: [] });
    if (url === '/api/plans/today') return response({ plan: [] });
    if (url === '/api/drafts/sum' && !options.method) return response({ draft: null });
    if (url === '/api/drafts/sum' && options.method === 'PUT') return response({ error: 'Account changed', code: 'account_changed' }, 409);
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = vm.createContext({
    $, fetch, Option: function Option(label, value) { return { label, value }; },
    document: { createElement: element, addEventListener() {} }, window: { addEventListener() {} },
    sample: { sum: { title: 'Sum' }, free: { title: 'Free' } },
    problem: 'sum', fields: ['code', 'stdin', 'expected'],
    draftScope: 'guest', draftKey: id => `draft:${id}`,
    guestDraftKey: id => `guest:${id}`, saveDraft() {}, loadProblem() {},
    lastProblemKey: () => 'last-problem',
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true
  });
  vm.runInContext(readFileSync(new URL('../cloudflare/public/account.js', import.meta.url), 'utf8'), context);
  for (let i = 0; i < 10 && !vm.runInContext("cloudDraftReady.has('sum')", context); i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext("cloudDraftReady.has('sum')", context), true);
  storage.set('draft:sum', JSON.stringify({ code: 'private A work', stdin: '', expected: '' }));
  vm.runInContext("cloudDraftChanged('sum')", context);
  await vm.runInContext("cloudSaveDraft('sum')", context);
  const put = requests.find(item => item.method === 'PUT');
  assert.equal(put.expected, 'user-a');
  assert.equal(vm.runInContext('cloudSessionInvalid', context), true);
  assert.equal(JSON.parse(storage.get('draft:sum')).code, 'private A work');
  await vm.runInContext("cloudSaveDraft('sum')", context);
  assert.equal(requests.filter(item => item.method === 'PUT').length, 1);
});
