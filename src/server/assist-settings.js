import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';

const pending = new Map();

export function assistCredentialFile(settingsFile, {credentialDir} = {}) {
  const directory = credentialDir || path.join(os.homedir(), '.local/share/acmcoder/credentials');
  const id = createHash('sha256').update(path.resolve(settingsFile)).digest('hex').slice(0, 24);
  return path.join(directory, `legacy-assist-${id}.json`);
}

export function serializeAssistSettings(settingsFile, work) {
  const id = path.resolve(settingsFile);
  const previous = pending.get(id) || Promise.resolve();
  const result = previous.catch(() => {}).then(work);
  pending.set(id, result);
  result.finally(() => { if (pending.get(id) === result) pending.delete(id); }).catch(() => {});
  return result;
}

async function readJson(file) {
  let raw;
  try { raw = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('无法读取 AI 配置；原文件已保留。'); }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error('AI 配置格式无效；原文件已保留。'); }
}

async function writePrivate(file, value) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
    const parent = await fs.open(directory, 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  } finally { await fs.rm(temporary, {force: true}); }
}

export async function readAssistSettings(settingsFile, credentialFile, normalize) {
  const saved = await readJson(settingsFile) || {};
  const credential = await readJson(credentialFile);
  if (credential && (credential.version !== 1 || !credential.settings ||
      typeof credential.settings.apiKey !== 'string')) {
    throw new Error('AI 凭据格式无效；原文件已保留。');
  }
  // The credential commit is authoritative, including after an interrupted migration.
  const settings = normalize(credential ? credential.settings : saved);
  if (!credential && !Object.hasOwn(saved, 'apiKey')) return settings;
  const {apiKey: _removed, ...metadata} = saved;
  const clean = {...metadata, baseUrl: settings.baseUrl, model: settings.model};
  try {
    if (!credential) await writePrivate(credentialFile, {version: 1, settings});
    if (Object.hasOwn(saved, 'apiKey') || saved.baseUrl !== settings.baseUrl || saved.model !== settings.model) {
      await writePrivate(settingsFile, clean);
    }
  } catch { throw new Error('AI 凭据迁移未完成；原配置保留，可重试。'); }
  return settings;
}

export async function writeAssistSettings(settingsFile, credentialFile, settings) {
  try {
    // Commit all fields together before updating the non-secret compatibility file.
    await writePrivate(credentialFile, {version: 1, settings});
    await writePrivate(settingsFile, {baseUrl: settings.baseUrl, model: settings.model});
  } catch { throw new Error('AI 配置保存未完成；已提交的凭据保留，可重试。'); }
}
