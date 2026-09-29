import { InputError } from './problem.js';
import { defaultCatalog } from './default-catalog.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const recommendationId = slug => `rec_${slug}`;
export const recommendationSlug = id => /^rec_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id.slice(4) : '';
export const defaultSettings = Object.freeze({ dailyCount: 3, difficultyPressure: 'standard', cooldownDays: 3, targetTags: [] });
const pressureWeights = {
  conservative: { easy: 14, medium: 8, hard: -8 },
  standard: { easy: 8, medium: 12, hard: 6 },
  intensive: { easy: 4, medium: 10, hard: 14 }
};

export function normalizeCatalog(payload) {
  const entries = Array.isArray(payload) ? payload : payload?.entries;
  if (!Array.isArray(entries) || entries.length > 200) throw new InputError('推荐题库须包含至多 200 道题。');
  const seen = new Set();
  return entries.map((raw, index) => {
    const slug = String(raw?.leetcodeSlug || raw?.slug || '').trim();
    if (!slugPattern.test(slug) || slug.length > 76 || seen.has(slug)) throw new InputError(`第 ${index + 1} 道推荐题的 slug 无效或重复。`);
    seen.add(slug);
    const url = `https://leetcode.cn/problems/${slug}/`;
    if (raw.leetcodeUrl && raw.leetcodeUrl !== url) throw new InputError(`第 ${index + 1} 道推荐题必须使用对应的力扣中文站链接。`);
    const title = String(raw.title || '').trim();
    if (!title || title.length > 160) throw new InputError(`第 ${index + 1} 道推荐题标题无效。`);
    const difficulty = String(raw.difficulty || '').toLowerCase();
    if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new InputError(`第 ${index + 1} 道推荐题难度无效。`);
    if (!Array.isArray(raw.tags) || raw.tags.length > 12 || raw.tags.some(tag => typeof tag !== 'string' || tag.length > 32)) throw new InputError(`第 ${index + 1} 道推荐题标签无效。`);
    const rank = Number(raw.sourceRank);
    const frequency = Number(raw.frequencyScore);
    return {
      leetcodeSlug: slug, title, leetcodeUrl: url, difficulty,
      tags: [...new Set(raw.tags.map(tag => tag.trim()).filter(Boolean))],
      sourceRank: Number.isSafeInteger(rank) && rank >= 0 ? rank : index + 1,
      frequencyScore: Number.isFinite(frequency) ? Math.max(0, Math.min(1, frequency)) : 0,
      source: String(raw.source || '').slice(0, 80)
    };
  });
}

export function catalogFor(settings) {
  return settings?.recommendationCatalog ? normalizeCatalog(settings.recommendationCatalog) : normalizeCatalog(defaultCatalog);
}

export function normalizePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('计划偏好无效。');
  const dailyCount = Number(input.dailyCount);
  const cooldownDays = Number(input.cooldownDays ?? 3);
  if (!Number.isInteger(dailyCount) || dailyCount < 1 || dailyCount > 5) throw new InputError('每日题数须为 1–5。');
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 30) throw new InputError('冷却天数须为 0–30。');
  if (!Object.hasOwn(pressureWeights, input.difficultyPressure)) throw new InputError('难度偏好无效。');
  if (!Array.isArray(input.targetTags) || input.targetTags.length > 12 || input.targetTags.some(tag => typeof tag !== 'string' || tag.length > 32)) throw new InputError('目标标签无效。');
  return { dailyCount, difficultyPressure: input.difficultyPressure, cooldownDays, targetTags: [...new Set(input.targetTags.map(tag => tag.trim()).filter(Boolean))] };
}

export function preferencesFor(settings) {
  try { return normalizePreferences({ ...defaultSettings, ...settings?.planner }); }
  catch { return { ...defaultSettings }; }
}

export async function readSettings(db, userId) {
  const row = await db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').bind(userId).first();
  if (!row) return {};
  try { const data = JSON.parse(row.settings_json); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
  catch { return {}; }
}

export async function writeSettings(db, userId, settings, time) {
  const serialized = JSON.stringify(settings);
  if (serialized.length > 250000) throw new InputError('设置与推荐题库过大，请减少条目。', 413);
  await db.prepare('INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at').bind(userId, serialized, time).run();
}

export async function patchSetting(db, userId, path, value, time) {
  const serialized = JSON.stringify(value);
  if (serialized.length > 250000) throw new InputError('设置与推荐题库过大，请减少条目。', 413);
  await db.prepare("INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, json_set('{}', ?, json(?)), ?) ON CONFLICT(user_id) DO UPDATE SET settings_json = json_set(user_settings.settings_json, ?, json(?)), updated_at = excluded.updated_at")
    .bind(userId, path, serialized, time, path, serialized).run();
}

export function scoreRecommendations(entries, settings, progress, owned, date) {
  const preferences = preferencesFor(settings);
  const targetTags = new Set(preferences.targetTags.map(tag => tag.toLowerCase()));
  const items = settings.recommendationItems || {};
  const progressByUrl = new Map(progress.map(row => [row.source_url, row]));
  const ownedUrls = new Set(owned.map(row => row.source_url));
  const today = Date.parse(date);
  return entries.flatMap(entry => {
    const item = items[entry.leetcodeSlug] || {};
    if (item.masteredAt && !item.wantPracticeAgain) return [];
    let score = entry.frequencyScore * 100 + (pressureWeights[preferences.difficultyPressure][entry.difficulty] || 0);
    score += entry.tags.filter(tag => targetTags.has(tag.toLowerCase())).length * 16;
    const practice = progressByUrl.get(entry.leetcodeUrl);
    if (!practice) score += 12;
    else {
      score -= practice.successes * 8;
      const days = (today - practice.last_practiced_at * 1000) / 86400000;
      score += days < preferences.cooldownDays ? -40 : 12;
    }
    if (item.wantPracticeAgain) score += 18;
    if (item.skippedAt) score -= 10;
    return [{ ...entry, score, added: ownedUrls.has(entry.leetcodeUrl), actions: item }];
  }).sort((a, b) => b.score - a.score || a.sourceRank - b.sourceRank || a.leetcodeSlug.localeCompare(b.leetcodeSlug));
}

export async function rankedRecommendations(db, userId, settings, date) {
  const [progress, owned] = await Promise.all([
    db.prepare('SELECT p.source_url, r.successes, r.last_practiced_at FROM practice_progress r JOIN personal_problems p ON p.id = r.problem_id AND p.user_id = r.user_id WHERE r.user_id = ?').bind(userId).all(),
    db.prepare('SELECT source_url FROM personal_problems WHERE user_id = ? AND source_url <> ?').bind(userId, '').all()
  ]);
  return scoreRecommendations(catalogFor(settings), settings, progress.results, owned.results, date);
}

export async function validRecommendationId(db, userId, id) {
  const slug = recommendationSlug(id);
  if (!slug) return false;
  return catalogFor(await readSettings(db, userId)).some(entry => entry.leetcodeSlug === slug);
}
