import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createAcmcoderServer} from '../src/server/server.js';
import {assistCredentialFile} from '../src/server/assist-settings.js';
import {loadAssistSettings, saveAssistSettings, getPublicAssistSettings} from '../src/server/assist.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acmcoder-key-upgrade-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const settingsFile = path.join(root, 'learning/settings.json');
  const options = {credentialDir: path.join(root, 'credentials')};
  const credentialFile = assistCredentialFile(settingsFile, options);
  await fs.mkdir(path.dirname(settingsFile), {recursive: true});
  return {settingsFile, credentialFile, options};
}

test('migrates a legacy key into a durable private credential file, retaining provider settings', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  const old = {apiKey: 'synthetic-upgrade-key', baseUrl: 'https://example.test/v1', model: 'old-model', extra: 'preserve'};
  await fs.writeFile(settingsFile, JSON.stringify(old));
  assert.equal((await loadAssistSettings(settingsFile, {}, options)).apiKey, old.apiKey);
  const clean = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  assert.deepEqual(clean, {baseUrl: old.baseUrl, model: old.model, extra: old.extra});
  assert.equal((await fs.stat(credentialFile)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(credentialFile))).mode & 0o777, 0o700);
  assert.deepEqual(await loadAssistSettings(settingsFile, {}, options), {apiKey: old.apiKey, baseUrl: old.baseUrl, model: old.model});
  assert.equal(getPublicAssistSettings(await loadAssistSettings(settingsFile, {}, options)).apiKey, undefined);
});

test('failed credential persistence leaves the original key file untouched and can be retried', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  const raw = JSON.stringify({apiKey: 'synthetic-original-key', model: 'unchanged'});
  await fs.writeFile(settingsFile, raw);
  await fs.writeFile(options.credentialDir, 'not a directory');
  await assert.rejects(loadAssistSettings(settingsFile, {}, options), /原文件已保留|原配置保留/);
  assert.equal(await fs.readFile(settingsFile, 'utf8'), raw);
  await fs.rm(options.credentialDir);
  assert.equal((await loadAssistSettings(settingsFile, {}, options)).apiKey, 'synthetic-original-key');
  assert.ok(await fs.stat(credentialFile));
});

test('interruption after the credential commit does not restore the old key or provider settings', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  await fs.writeFile(settingsFile, JSON.stringify({apiKey: 'synthetic-old-key', model: 'old'}));
  // A committed credential and an uncleaned original are the on-disk crash state.
  await fs.mkdir(options.credentialDir, {mode: 0o700});
  const next = {apiKey: 'synthetic-new-key', model: 'new', baseUrl: 'https://new.example.test/v1'};
  await fs.writeFile(credentialFile, JSON.stringify({version: 1, settings: next}), {mode: 0o600});
  assert.deepEqual(await loadAssistSettings(settingsFile, {}, options), next);
  assert.deepEqual(JSON.parse(await fs.readFile(settingsFile, 'utf8')), {model: next.model, baseUrl: next.baseUrl});
  assert.deepEqual(await loadAssistSettings(settingsFile, {}, options), next);
});

test('failure replacing the legacy file retains it and retries the already committed migration', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  const raw = JSON.stringify({apiKey: 'synthetic-retry-key', model: 'retry-model'});
  await fs.writeFile(settingsFile, raw);
  const rename = fs.rename;
  const fault = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === settingsFile) throw new Error('injected rename failure');
    return rename(from, to);
  });
  await assert.rejects(loadAssistSettings(settingsFile, {}, options), /原配置保留/);
  assert.equal(await fs.readFile(settingsFile, 'utf8'), raw);
  assert.equal(JSON.parse(await fs.readFile(credentialFile, 'utf8')).settings.apiKey, 'synthetic-retry-key');
  fault.mock.restore();
  assert.equal((await loadAssistSettings(settingsFile, {}, options)).apiKey, 'synthetic-retry-key');
  assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(settingsFile, 'utf8')), 'apiKey'), false);
  assert.deepEqual(await fs.readdir(path.dirname(settingsFile)), ['settings.json']);
});

test('serialized partial saves retain the key, clearing persists despite environment fallback', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  const env = {ACMCODER_LLM_API_KEY: 'synthetic-environment-key'};
  await saveAssistSettings({apiKey: 'synthetic-saved-key'}, settingsFile, env, options);
  await Promise.all([
    saveAssistSettings({model: 'changed-model'}, settingsFile, env, options),
    saveAssistSettings({baseUrl: 'https://changed.example.test/v1'}, settingsFile, env, options),
  ]);
  const saved = await loadAssistSettings(settingsFile, env, options);
  assert.equal(saved.model, 'changed-model');
  assert.equal(saved.baseUrl, 'https://changed.example.test/v1');
  assert.equal(saved.apiKey, 'synthetic-saved-key');
  assert.equal((await fs.readFile(settingsFile, 'utf8')).includes('synthetic-'), false);
  await saveAssistSettings({apiKey: ''}, settingsFile, env, options);
  assert.equal((await loadAssistSettings(settingsFile, env, options)).apiKey, '');
  assert.equal(JSON.parse(await fs.readFile(credentialFile, 'utf8')).settings.apiKey, '');
});

test('invalid settings and credentials never include their content in errors or overwrite originals', async t => {
  const {settingsFile, credentialFile, options} = await fixture(t);
  const raw = '{"apiKey":"synthetic-private-broken"';
  await fs.writeFile(settingsFile, raw);
  await assert.rejects(loadAssistSettings(settingsFile, {}, options), error => !error.message.includes('synthetic-private-broken'));
  assert.equal(await fs.readFile(settingsFile, 'utf8'), raw);
  await fs.writeFile(settingsFile, '{"model":"intact"}');
  await fs.mkdir(options.credentialDir);
  await fs.writeFile(credentialFile, '{"apiKey":"synthetic-private-broken"}');
  await assert.rejects(loadAssistSettings(settingsFile, {}, options), /凭据格式无效/);
  assert.equal(await fs.readFile(settingsFile, 'utf8'), '{"model":"intact"}');
});

test('a restarted local server uses the migrated key in a real HTTP provider request without returning it', async t => {
  const {settingsFile, options} = await fixture(t);
  let calls = 0;
  const provider = http.createServer(async (request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer synthetic-http-upgrade-key');
    let raw = ''; for await (const chunk of request) raw += chunk;
    assert.equal(JSON.parse(raw).model, 'fixture-http-model');
    calls++;
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({choices: [{message: {content: '迁移配置仍可问答。'}}]}));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => provider.close(resolve)));
  const baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  await fs.writeFile(settingsFile, JSON.stringify({apiKey: 'synthetic-http-upgrade-key', baseUrl, model: 'fixture-http-model'}));
  for (let restart = 0; restart < 2; restart++) {
    const server = createAcmcoderServer({assistSettingsFile: settingsFile, credentialDir: options.credentialDir});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const settings = await (await fetch(`${url}/api/assist/settings`)).json();
      assert.equal(settings.settings.configured, true);
      assert.equal(JSON.stringify(settings).includes('synthetic-http-upgrade-key'), false);
      const response = await fetch(`${url}/api/assist`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question: '升级后配置是否还在？'})});
      assert.equal(response.status, 200);
      assert.equal((await response.json()).message, '迁移配置仍可问答。');
      assert.equal((await fs.readFile(settingsFile, 'utf8')).includes('synthetic-http-upgrade-key'), false);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
  assert.equal(calls, 2);
});
