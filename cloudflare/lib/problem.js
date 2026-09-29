const MAX_TITLE = 160;
const MAX_STATEMENT = 30000;
const MAX_CASE = 16000;
const MAX_URL = 2048;

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateSourceUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > MAX_URL) throw new InputError('来源链接过长。');
  let url;
  try { url = new URL(value); } catch { throw new InputError('来源链接不是有效 URL。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new InputError('来源链接必须是 HTTPS，且不能包含账户信息。');
  url.hash = '';
  return url.href;
}

function string(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new InputError(`${name}无效或超长。`);
  return value;
}

export function normalizeProblem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('题目格式无效。');
  const title = string(input.title, '标题', MAX_TITLE, true).trim();
  const statement = string(input.statement ?? '', '题面', MAX_STATEMENT);
  const sourceUrl = validateSourceUrl(input.sourceUrl ?? '');
  const sourceKind = input.sourceKind ?? (sourceUrl && !statement ? 'link' : 'manual');
  if (!['link', 'manual', 'json', 'fetched'].includes(sourceKind)) throw new InputError('来源类型无效。');
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 12 || tags.some(tag => typeof tag !== 'string' || tag.length > 32)) throw new InputError('标签格式无效。');
  const rawSamples = input.rawSamples ?? [];
  if (!Array.isArray(rawSamples) || rawSamples.length > 8 || rawSamples.some(s => typeof s !== 'string' || s.length > MAX_CASE)) throw new InputError('原始样例格式无效。');
  const cases = input.cases ?? [];
  if (!Array.isArray(cases) || cases.length > 8 || cases.some(c => !c || typeof c !== 'object' || typeof c.stdin !== 'string' || typeof c.expected !== 'string' || c.stdin.length > MAX_CASE || c.expected.length > MAX_CASE)) throw new InputError('ACM 样例格式无效。');
  return { title, statement, sourceUrl, sourceKind, tags: [...new Set(tags.map(x => x.trim()).filter(Boolean))], rawSamples, cases: cases.map(c => ({ stdin: c.stdin, expected: c.expected })), favorite: input.favorite === true };
}

export function convertSimpleSample(raw, kind) {
  if (typeof raw !== 'string' || raw.length > MAX_CASE) throw new InputError('原始样例过长。');
  if (kind === 'raw') return { stdin: raw, expected: '' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new InputError('此转换需要有效 JSON。'); }
  if (kind === 'array') {
    if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'number' && typeof x !== 'string')) throw new InputError('仅支持一维数字或字符串数组。');
    return { stdin: `${parsed.length}\n${parsed.join(' ')}\n`, expected: '' };
  }
  if (kind === 'matrix') {
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(row => Array.isArray(row) && row.length === parsed[0].length && row.every(x => typeof x === 'number'))) throw new InputError('仅支持规则数字矩阵。');
    return { stdin: `${parsed.length} ${parsed[0].length}\n${parsed.map(row => row.join(' ')).join('\n')}\n`, expected: '' };
  }
  if (kind === 'string') {
    if (typeof parsed !== 'string') throw new InputError('仅支持 JSON 字符串。');
    return { stdin: `${parsed}\n`, expected: '' };
  }
  throw new InputError('不支持自动转换该格式；请手动填写 stdin。');
}

export function problemFromRow(row) {
  return { id: row.id, title: row.title, statement: row.statement, sourceUrl: row.source_url, sourceKind: row.source_kind, tags: JSON.parse(row.tags_json), rawSamples: JSON.parse(row.raw_samples_json), cases: JSON.parse(row.cases_json), favorite: !!row.favorite, createdAt: row.created_at, updatedAt: row.updated_at };
}
