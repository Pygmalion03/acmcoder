export const RECORD_KINDS = ['problem', 'draft', 'attempt', 'run', 'review', 'plan', 'progress', 'settings', 'conversation'];
export const LANGUAGES = ['python', 'cpp', 'java'];
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('INVALID_RECORD'); };
export const recordBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function assertNoCredentials(value) {
  if (!object(value) && !Array.isArray(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|cookie)$/i.test(key)) throw new Error('CREDENTIAL_IN_RECORD');
    assertNoCredentials(item);
  }
}
export function validateRecord(input) {
  if (!object(input) || !RECORD_KINDS.includes(input.kind) || !ID.test(input.id || '')) invalid();
  const revision = input.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) invalid();
  if (input.problemId !== undefined && !ID.test(input.problemId)) invalid();
  if (input.language !== undefined && !LANGUAGES.includes(input.language)) invalid();
  const payload = structuredClone(input.payload);
  if (!object(payload) || recordBytes(payload) > 1024 * 1024) invalid();
  const text = (key, max) => { if (typeof payload[key] !== 'string' || payload[key].length > max) invalid(); };
  if (input.kind === 'problem') {
    text('title', 160); if (!payload.title.trim()) invalid();
    payload.statement ??= ''; text('statement', 100000);
    payload.sourceUrl ??= ''; payload.sourceKind ??= 'manual'; payload.tags ??= []; payload.rawSamples ??= []; payload.cases ??= []; payload.archivedAt ??= null;
    if (typeof payload.sourceUrl !== 'string' || payload.sourceUrl.length > 2000) invalid();
    if (payload.sourceUrl && !/^https?:\/\//.test(payload.sourceUrl)) invalid();
    if (![payload.tags,payload.rawSamples,payload.cases].every(Array.isArray) || payload.cases.length > 50) invalid();
    for (const item of payload.cases) if (!object(item) || typeof item.stdin !== 'string' || typeof item.expected !== 'string') invalid();
  }
  if (['draft','attempt'].includes(input.kind)) {
    if (!input.problemId || !input.language) invalid();
    text('code', 200000); text('stdin', 200000); text('expected', 200000);
    if (input.kind === 'draft' && !['normal','rewrite'].includes(payload.mode)) invalid();
    if (input.kind === 'attempt' && !['before-rewrite','completed-rewrite','imported'].includes(payload.reason)) invalid();
    if (payload.previousAttemptId != null && !ID.test(payload.previousAttemptId)) invalid();
  }
  if (['run','review','progress'].includes(input.kind) && !input.problemId) invalid();
  if (input.kind === 'settings') assertNoCredentials(payload);
  if (input.kind === 'conversation' && (!Array.isArray(payload.messages) || payload.messages.some(m => !object(m) || !['user','assistant'].includes(m.role) || typeof m.content !== 'string'))) invalid();
  return { kind: input.kind, id: input.id, ...(input.problemId ? { problemId: input.problemId } : {}), ...(input.language ? { language: input.language } : {}), revision, updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(), payload };
}

export function validateMutation(input) {
  if (!object(input) || !ID.test(input.mutationId || '') || !RECORD_KINDS.includes(input.kind) || !ID.test(input.id || '') || !['put','delete'].includes(input.op) || !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) throw new Error('INVALID_MUTATION');
  if (input.op === 'delete') return { mutationId: input.mutationId, kind: input.kind, id: input.id, op: input.op, baseRevision: input.baseRevision };
  const record = validateRecord({ ...input, revision: input.baseRevision, updatedAt: 0 });
  const { revision, updatedAt, ...fields } = record;
  return { mutationId: input.mutationId, op: input.op, baseRevision: input.baseRevision, ...fields };
}
