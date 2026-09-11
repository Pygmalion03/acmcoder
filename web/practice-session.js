export const PRACTICE_SESSION_VERSION = 2;
const MAX_AI_MESSAGES = 12;
const MAX_AI_CHARACTERS = 24000;

export function practiceSessionKey(problemSlug, language) {
  return `acmcoder.web.practice.v2.${String(problemSlug || "").trim()}.${String(language || "").trim()}`;
}

export function createPracticeSession(workspace = {}) {
  return {
    version: PRACTICE_SESSION_VERSION,
    code: typeof workspace.code === "string" ? workspace.code : "",
    stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
    expected: typeof workspace.expected === "string" ? workspace.expected : "",
    lastResult: workspace.lastResult && typeof workspace.lastResult === "object" ? { ...workspace.lastResult } : null,
    ai: { current: [] },
    previousRound: null,
    reinforcement: { status: "idle", startedAt: "", completedAt: "", canRestore: false },
  };
}

function copyMessage(message) { return { role: message.role, content: message.content, ...(message.createdAt === undefined ? {} : { createdAt: message.createdAt }) }; }

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const valid = [];
  for (const message of messages) {
    if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") continue;
    if (!valid.length && message.role === "assistant") continue;
    if (valid.length && valid.at(-1).role === message.role) continue;
    valid.push(copyMessage(message));
  }
  while (valid.length > MAX_AI_MESSAGES || valid.reduce((sum, item) => sum + item.content.length, 0) > MAX_AI_CHARACTERS) {
    if (valid.length >= 2 && valid[0].role === "user" && valid[1].role === "assistant") valid.splice(0, 2);
    else if (valid.length && valid[0].role === "assistant") valid.shift();
    else break;
  }
  if (valid.reduce((sum, item) => sum + item.content.length, 0) > MAX_AI_CHARACTERS && valid.at(-1)?.role === "user") valid.pop();
  return valid;
}

function normalizeSession(value) {
  const base = createPracticeSession(value || {});
  const source = value && typeof value === "object" ? value : {};
  const current = source.ai && Array.isArray(source.ai.current) ? normalizeMessages(source.ai.current) : [];
  const previous = source.previousRound && typeof source.previousRound === "object" ? {
    code: typeof source.previousRound.code === "string" ? source.previousRound.code : "",
    stdin: typeof source.previousRound.stdin === "string" ? source.previousRound.stdin : "",
    expected: typeof source.previousRound.expected === "string" ? source.previousRound.expected : "",
    lastResult: source.previousRound.lastResult && typeof source.previousRound.lastResult === "object" ? { ...source.previousRound.lastResult } : null,
    aiConversation: normalizeMessages(source.previousRound.aiConversation),
  } : null;
  const reinforcement = source.reinforcement && typeof source.reinforcement === "object" ? source.reinforcement : {};
  return {
    ...base,
    ai: { current },
    previousRound: previous,
    reinforcement: {
      status: ["idle", "active", "completed"].includes(reinforcement.status) ? reinforcement.status : "idle",
      startedAt: typeof reinforcement.startedAt === "string" ? reinforcement.startedAt : "",
      completedAt: typeof reinforcement.completedAt === "string" ? reinforcement.completedAt : "",
      canRestore: reinforcement.canRestore === true,
    },
  };
}

function parseStoredSession(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("stored practice session must be an object");
  }
  return parsed;
}

export function loadPracticeSessionWithMetadata(storage, { problemSlug, language, legacyKey } = {}) {
  try {
    const saved = storage.getItem(practiceSessionKey(problemSlug, language));
    if (saved !== null) return { session: normalizeSession(parseStoredSession(saved)), source: "session" };
    if (legacyKey) {
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) return { session: createPracticeSession(parseStoredSession(legacy)), source: "legacy" };
    }
  } catch {
    return { session: createPracticeSession(), source: "invalid" };
  }
  return { session: createPracticeSession(), source: "empty" };
}

export function loadPracticeSession(storage, options = {}) {
  return loadPracticeSessionWithMetadata(storage, options).session;
}

export function removePracticeSessions(storage, { problemSlug, languages = [] } = {}) {
  try {
    for (const language of languages) {
      storage.removeItem(practiceSessionKey(problemSlug, language));
    }
  } catch {
    // Browser storage cleanup is best-effort and must not block deletion.
  }
}

export function savePracticeSession(storage, { problemSlug, language }, session) {
  try { storage.setItem(practiceSessionKey(problemSlug, language), JSON.stringify(normalizeSession(session))); return { saved: true }; }
  catch (error) { return { saved: false, error }; }
}

export function updatePracticeWorkspace(session, workspace, { markReinforcementDirty = true } = {}) {
  const next = normalizeSession(session);
  for (const key of ["code", "stdin", "expected"]) if (typeof workspace?.[key] === "string") next[key] = workspace[key];
  if (workspace?.lastResult !== undefined) next.lastResult = workspace.lastResult && typeof workspace.lastResult === "object" ? { ...workspace.lastResult } : null;
  if (markReinforcementDirty && next.reinforcement.status === "active") next.reinforcement.canRestore = false;
  return next;
}

export function appendAiMessage(session, message) {
  if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") throw new TypeError("invalid AI message");
  const next = normalizeSession(session);
  if (next.ai.current.at(-1)?.role === message.role) throw new TypeError("AI messages must alternate roles");
  next.ai.current.push(copyMessage(message));
  next.ai.current = normalizeMessages(next.ai.current);
  return next;
}

export function startReinforcement(session, { template, trigger, now }) {
  const next = normalizeSession(session);
  next.previousRound = { code: next.code, stdin: next.stdin, expected: next.expected, lastResult: next.lastResult ? { ...next.lastResult } : null, aiConversation: next.ai.current.map(copyMessage) };
  next.code = typeof template === "string" ? template : "";
  next.stdin = ""; next.expected = ""; next.lastResult = null; next.ai = { current: [] };
  next.reinforcement = { status: "active", startedAt: now, completedAt: "", canRestore: true };
  return next;
}

export function restorePreviousRound(session) {
  const next = normalizeSession(session);
  if (!next.previousRound || !next.reinforcement.canRestore) return next;
  const round = next.previousRound;
  next.code = round.code; next.stdin = round.stdin; next.expected = round.expected; next.lastResult = round.lastResult ? { ...round.lastResult } : null;
  next.ai = { current: round.aiConversation.map(copyMessage) }; next.previousRound = null;
  next.reinforcement = { status: "idle", startedAt: "", completedAt: "", canRestore: false };
  return next;
}

export function completeReinforcement(session, { now }) {
  const next = normalizeSession(session);
  if (next.reinforcement.status === "active") {
    next.reinforcement.status = "completed"; next.reinforcement.completedAt = now; next.reinforcement.canRestore = false;
  }
  return next;
}
