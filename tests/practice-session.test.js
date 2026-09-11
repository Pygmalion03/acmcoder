import test from "node:test";
import assert from "node:assert/strict";

import {
  appendAiMessage,
  completeReinforcement,
  createPracticeSession,
  loadPracticeSession,
  practiceSessionKey,
  restorePreviousRound,
  savePracticeSession,
  startReinforcement,
  updatePracticeWorkspace,
} from "../web/practice-session.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("migrates the existing per-problem workspace cache", () => {
  const storage = memoryStorage({
    "acmcoder.web.problem.memory:two-sum.python": JSON.stringify({
      code: "print(1)", stdin: "1", expected: "1",
    }),
  });
  const session = loadPracticeSession(storage, {
    problemSlug: "memory:two-sum",
    language: "python",
    legacyKey: "acmcoder.web.problem.memory:two-sum.python",
  });
  assert.equal(session.version, 2);
  assert.equal(session.code, "print(1)");
  assert.equal(session.stdin, "1");
  assert.equal(session.expected, "1");
  assert.deepEqual(session.ai.current, []);
});

test("isolates persisted sessions by problem and language", () => {
  const storage = memoryStorage();
  savePracticeSession(storage, { problemSlug: "two-sum", language: "python" },
    updatePracticeWorkspace(createPracticeSession(), { code: "python-code" }));
  savePracticeSession(storage, { problemSlug: "two-sum", language: "cpp" },
    updatePracticeWorkspace(createPracticeSession(), { code: "cpp-code" }));
  assert.equal(loadPracticeSession(storage, { problemSlug: "two-sum", language: "python" }).code, "python-code");
  assert.equal(loadPracticeSession(storage, { problemSlug: "two-sum", language: "cpp" }).code, "cpp-code");
});

test("archives a learned round and starts clean reinforcement", () => {
  let session = createPracticeSession({ code: "learned", stdin: "sample", expected: "answer" });
  session = appendAiMessage(session, { role: "user", content: "给我一个提示", createdAt: "2026-09-11T01:00:00Z" });
  session = appendAiMessage(session, { role: "assistant", content: "先画链表", createdAt: "2026-09-11T01:00:01Z" });
  session = updatePracticeWorkspace(session, { lastResult: { status: "AC", message: "accepted", stdout: "", stderr: "", ranAt: "2026-09-11T01:00:02Z" } });
  const next = startReinforcement(session, { template: "initial", trigger: "accepted", now: "2026-09-11T01:01:00Z" });
  assert.equal(next.code, "initial");
  assert.equal(next.stdin, "");
  assert.equal(next.expected, "");
  assert.equal(next.lastResult, null);
  assert.deepEqual(next.ai.current, []);
  assert.equal(next.previousRound.code, "learned");
  assert.equal(next.previousRound.aiConversation.length, 2);
  assert.deepEqual(next.reinforcement, {
    status: "active", startedAt: "2026-09-11T01:01:00Z", completedAt: "", canRestore: true,
  });
});

test("restores the archived round before reinforcement changes", () => {
  const active = startReinforcement(createPracticeSession({ code: "learned" }), {
    template: "initial", trigger: "ai-assisted", now: "2026-09-11T01:01:00Z",
  });
  const restored = restorePreviousRound(active);
  assert.equal(restored.code, "learned");
  assert.equal(restored.previousRound, null);
  assert.equal(restored.reinforcement.status, "idle");
});

test("marks active reinforcement complete after AC", () => {
  const active = startReinforcement(createPracticeSession({ code: "learned" }), {
    template: "initial", trigger: "accepted", now: "2026-09-11T01:01:00Z",
  });
  const completed = completeReinforcement(active, { now: "2026-09-11T01:05:00Z" });
  assert.equal(completed.reinforcement.status, "completed");
  assert.equal(completed.reinforcement.completedAt, "2026-09-11T01:05:00Z");
  assert.equal(completed.reinforcement.canRestore, false);
});

test("keeps at most twelve valid AI messages and complete pairs", () => {
  let session = createPracticeSession();
  for (let index = 0; index < 8; index += 1) {
    session = appendAiMessage(session, { role: "user", content: `q${index}`, createdAt: String(index) });
    session = appendAiMessage(session, { role: "assistant", content: `a${index}`, createdAt: String(index) });
  }
  assert.equal(session.ai.current.length, 12);
  assert.equal(session.ai.current[0].role, "user");
  assert.equal(session.ai.current.at(-1).role, "assistant");
});

test("keeps a pending user question without orphaning an assistant message", () => {
  let session = createPracticeSession();
  session = appendAiMessage(session, { role: "user", content: "question", createdAt: "1" });
  assert.deepEqual(session.ai.current.map(({ role }) => role), ["user"]);
  assert.throws(
    () => appendAiMessage(session, { role: "user", content: "another", createdAt: "2" }),
    /alternat/i,
  );
});

test("trims oldest complete pairs to the character budget", () => {
  let session = createPracticeSession();
  for (let index = 0; index < 3; index += 1) {
    session = appendAiMessage(session, { role: "user", content: `q${index}${"x".repeat(5998)}`, createdAt: String(index) });
    session = appendAiMessage(session, { role: "assistant", content: `a${index}${"y".repeat(5998)}`, createdAt: String(index) });
  }
  assert.deepEqual(session.ai.current.map(({ content }) => content.slice(0, 2)), ["q1", "a1", "q2", "a2"]);
});
