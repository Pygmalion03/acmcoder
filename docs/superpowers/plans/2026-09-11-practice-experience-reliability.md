# Practice Experience and Reinforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Practice workspace and add a local-first, one-action reinforcement round after AI learning or AC.

**Architecture:** Add a pure versioned practice-session module and a dependency-injected API client, then make the existing page consume those boundaries. Keep problem and accepted-progress authority on the server; keep the current and immediately previous learning rounds in bounded browser storage.

**Tech Stack:** Node.js 20+, ES modules, Node's built-in test runner, vanilla HTML/CSS/JavaScript, built-in `fetch`, Playwright CLI for browser acceptance, systemd-hosted WSL service.

**Spec:** `docs/superpowers/specs/2026-09-11-practice-experience-reliability-design.md`

## Global Constraints

- Mac is authoritative for source, Git, branches, commits, and diffs; do not edit source or run mutating Git commands in WSL.
- Flush the registered Mutagen session `acmcoder-v3` before every WSL test command.
- Run tests in `dev-wsl:/home/pygmalion/runs/002-acmcoder/v3` and restart `acmcoder-v3.service` after server changes.
- Keep Node.js `>=20` and do not add a runtime framework, database, cloud account, or third-party editor.
- Retain only the current round and immediately previous round per canonical problem slug and language.
- Retain at most 12 current AI transcript messages within a 24,000-character history budget.
- Use a 60,000ms default model timeout and expose cancellation.
- Retry `/api/run` once only after an explicit pre-execution 401; never automatically retry a network-uncertain mutation.
- Preserve existing daily recommendation-to-library, runner, progress, import/export, extension, and responsive behavior.
- Keep credentials, authorization headers, cookies, and environment values out of browser session state, logs, fixtures, and error text.

## File Structure

- Create `web/practice-session.js`: normalize, migrate, persist, and transition per-problem practice state.
- Create `tests/practice-session.test.js`: pure state, migration, bounded transcript, and reinforcement tests.
- Create `web/api-client.js`: JSON requests, connection errors, GET backoff, run-token renewal, and retry-delay state.
- Create `tests/api-client.test.js`: fetch-sequence tests without a browser or live service.
- Modify `src/server/assist.js`: bounded history, 60-second timeout, and external cancellation.
- Modify `src/server/server.js`: cheap health endpoint and request-abort propagation for AI.
- Modify `tests/assist.test.js` and `tests/server.test.js`: server behavior tests.
- Modify `web/view-state.js`: pure localized problem-identity model.
- Modify `tests/frontend-redesign.test.js`: semantic markup and integration contracts.
- Modify `web/index.html`: structured identity, connection state, visible statement workspace, transcript, and reinforcement controls.
- Modify `web/styles.css`: three-surface layout, independently scrolling editor/statement, transcript, connection, and reinforcement styles.
- Modify `web/icons.js`: add the connection-loss icon used by the global status.
- Modify `web/app.js`: consume the new modules and coordinate Practice behavior.
- Modify `README.md`: describe conversational AI and immediate reinforcement without overstating cloud persistence.

---

### Task 1: Versioned Practice Session Store

**Files:**
- Create: `web/practice-session.js`
- Create: `tests/practice-session.test.js`

**Interfaces:**
- Consumes: a Web Storage-compatible object with `getItem(key)` and `setItem(key, value)`.
- Produces: `practiceSessionKey(problemSlug, language) -> string`.
- Produces: `createPracticeSession(workspace?) -> PracticeSessionV2`.
- Produces: `loadPracticeSession(storage, { problemSlug, language, legacyKey }) -> PracticeSessionV2`.
- Produces: `savePracticeSession(storage, { problemSlug, language }, session) -> { saved: boolean, error?: Error }`.
- Produces: `updatePracticeWorkspace(session, workspace, options?) -> PracticeSessionV2`.
- Produces: `appendAiMessage(session, message) -> PracticeSessionV2`.
- Produces: `startReinforcement(session, { template, trigger, now }) -> PracticeSessionV2`.
- Produces: `restorePreviousRound(session) -> PracticeSessionV2`.
- Produces: `completeReinforcement(session, { now }) -> PracticeSessionV2`.

- [ ] **Step 1: Write failing state and migration tests**

Create `tests/practice-session.test.js` with a `Map`-backed storage double and these exact cases:

```js
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
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run:

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/practice-session.test.js'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/practice-session.js`.

- [ ] **Step 3: Implement the session state machine**

Implement immutable transitions in `web/practice-session.js`. Use this exact public shape and constants:

```js
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
```

Normalize parsed values back into this shape. Enforce alternating roles while allowing one trailing unanswered `user` message so cancellation can preserve the question. Trim only complete oldest `user`/`assistant` pairs until both the 12-message and 24,000-character limits hold; never leave an orphaned assistant message. Reject invalid roles or broken alternation in `appendAiMessage` with `TypeError`; storage parsing failures return a fresh session. `savePracticeSession` catches quota/storage errors and returns `{ saved: false, error }` instead of throwing.

`startReinforcement` must archive the current `code`, `lastResult`, and copied `ai.current`, then clear active stdin, expected, result, and transcript. `updatePracticeWorkspace` accepts `{ markReinforcementDirty = true }`; when active and marked dirty it sets `canRestore` to false. `restorePreviousRound` is a no-op unless an archived round exists and `canRestore` is true.

- [ ] **Step 4: Run the focused test and confirm all state transitions pass**

Run the Step 2 command again.

Expected: 8 tests PASS.

- [ ] **Step 5: Commit the session boundary**

```sh
git add web/practice-session.js tests/practice-session.test.js
git commit -m "feat: add versioned practice sessions"
```

---

### Task 2: Shared API Client and Safe Retry Rules

**Files:**
- Create: `web/api-client.js`
- Create: `tests/api-client.test.js`

**Interfaces:**
- Consumes: injected `fetchFn`, `wait`, and `onConnectionChange` functions.
- Produces: `ApiError` with `kind`, `status`, `method`, `url`, and `userMessage`.
- Produces: `createRetryBackoff({ minMs, maxMs }) -> { success(), fail(), current() }`.
- Produces: `createApiClient(options) -> { getJson(url, options?), clearRunToken(), health() }`.

- [ ] **Step 1: Write failing API-client tests**

Create `tests/api-client.test.js` with response helpers and four cases:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, createApiClient, createRetryBackoff } from "../web/api-client.js";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("refreshes a stale run token once after an explicit 401", async () => {
  const calls = [];
  const responses = [
    jsonResponse(200, { token: "old-token" }),
    jsonResponse(401, { error: "expired" }),
    jsonResponse(200, { token: "new-token" }),
    jsonResponse(200, { result: { status: "AC" } }),
  ];
  const client = createApiClient({
    fetchFn: async (url, options = {}) => {
      calls.push({ url, token: new Headers(options.headers).get("x-acmcoder-token") });
      return responses.shift();
    },
    wait: async () => {},
  });
  const body = await client.getJson("/api/run", { method: "POST", body: "{}" });
  assert.equal(body.result.status, "AC");
  assert.deepEqual(calls.map((call) => call.url), ["/api/session", "/api/run", "/api/session", "/api/run"]);
  assert.deepEqual(calls.filter((call) => call.url === "/api/run").map((call) => call.token), ["old-token", "new-token"]);
});

test("does not retry a network-uncertain POST", async () => {
  let calls = 0;
  const client = createApiClient({
    fetchFn: async () => { calls += 1; throw new TypeError("Failed to fetch"); },
    wait: async () => {},
  });
  await assert.rejects(
    () => client.getJson("/api/assist", { method: "POST", body: "{}" }),
    (error) => error instanceof ApiError && error.kind === "network" && /结果未知/.test(error.userMessage),
  );
  assert.equal(calls, 1);
});

test("retries an idempotent GET twice with bounded delays", async () => {
  let calls = 0;
  const waits = [];
  const client = createApiClient({
    fetchFn: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Failed to fetch");
      return jsonResponse(200, { status: "ok" });
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });
  assert.deepEqual(await client.getJson("/api/health"), { status: "ok" });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [250, 750]);
});

test("backs polling off to thirty seconds and resets after success", () => {
  const backoff = createRetryBackoff({ minMs: 2000, maxMs: 30000 });
  assert.equal(backoff.current(), 2000);
  assert.equal(backoff.fail(), 4000);
  assert.equal(backoff.fail(), 8000);
  assert.equal(backoff.fail(), 16000);
  assert.equal(backoff.fail(), 30000);
  assert.equal(backoff.success(), 2000);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/api-client.test.js'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/api-client.js`.

- [ ] **Step 3: Implement the dependency-injected client**

Use these public defaults in `web/api-client.js`:

```js
const GET_RETRY_DELAYS = [250, 750];

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, details);
  }
}

export function createRetryBackoff({ minMs = 2000, maxMs = 30000 } = {}) {
  let delay = minMs;
  return {
    current: () => delay,
    success: () => (delay = minMs),
    fail: () => (delay = Math.min(maxMs, delay * 2)),
  };
}
```

`createApiClient` keeps its run-token promise inside the factory. `getJson` must:

1. Normalize the method to uppercase.
2. Attach a token only for pathname `/api/run`.
3. Retry an explicit run 401 once after clearing and reacquiring the token.
4. Retry network exceptions only for GET, with delays `[250, 750]`.
5. Preserve a caller-provided `signal`.
6. Parse JSON errors and use the server's `error` field when present.
7. Convert aborts to `ApiError.kind === "cancelled"`.
8. Convert network errors for GET to “无法连接 ACMCoder 本地服务；请确认 WSL 已启动且本地隧道可用。”
9. Convert network errors for mutations to “请求结果未知，为避免重复提交未自动重试。请检查本地服务后手动重试。”
10. Call `onConnectionChange({ online: false, error })` on final network failure and `{ online: true }` after a later successful request.

- [ ] **Step 4: Run the focused test and confirm all retry rules pass**

Run the Step 2 command again.

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the API boundary**

```sh
git add web/api-client.js tests/api-client.test.js
git commit -m "feat: add resilient browser API client"
```

---

### Task 3: Conversational Assist and Health API

**Files:**
- Modify: `src/server/assist.js:6-149`
- Modify: `src/server/server.js:300-318,426-448`
- Modify: `tests/assist.test.js`
- Modify: `tests/server.test.js`

**Interfaces:**
- Consumes: `context.history` as completed alternating `user`/`assistant` pairs.
- Consumes: optional `requestCodeAdvice({ signal })` external AbortSignal.
- Produces: `normalizeAssistHistory(history) -> Array<{ role, content }>`.
- Produces: `GET /api/health -> { status: "ok" }`.

- [ ] **Step 1: Add failing history, timeout, cancellation, and health tests**

Extend `tests/assist.test.js` to import `DEFAULT_MODEL_TIMEOUT_MS` and `normalizeAssistHistory`. Add tests that assert:

```js
test("forwards bounded completed conversation pairs before the current snapshot", async () => {
  const calls = [];
  await requestCodeAdvice({
    settings: { ...getDefaultAssistSettings(), apiKey: "sk-local-test", baseUrl: "https://llm.example.test/v1" },
    fetch: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "next" } }] }), { status: 200 });
    },
    context: {
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "answer" },
      ],
      question: "follow up",
      language: "python",
      code: "print(1)",
    },
  });
  assert.deepEqual(calls[0].messages.slice(1, 3), [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
  ]);
  assert.match(calls[0].messages.at(-1).content, /follow up/);
});

test("rejects malformed conversation history", () => {
  assert.throws(() => normalizeAssistHistory([{ role: "system", content: "unsafe" }]), /history/i);
  assert.throws(() => normalizeAssistHistory([{ role: "assistant", content: "orphan" }]), /history/i);
});

test("uses sixty seconds as the default model timeout", () => {
  assert.equal(DEFAULT_MODEL_TIMEOUT_MS, 60000);
});

test("honors an external cancellation signal", async () => {
  const external = new AbortController();
  const pending = requestCodeAdvice({
    settings: { ...getDefaultAssistSettings(), apiKey: "sk-local-test" },
    signal: external.signal,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
    context: { question: "cancel" },
  });
  external.abort(new Error("用户已取消模型请求。"));
  await assert.rejects(pending, /用户已取消/);
});
```

Keep the existing explicit 10ms timeout test as the behavioral timer test, so the suite verifies both the default value and actual timeout cancellation without an eight-second wait.

Add a `tests/server.test.js` case:

```js
test("serves a cheap health response", async () => {
  const server = createAcmcoderServer();
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run focused server tests and verify the new assertions fail**

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/assist.test.js tests/server.test.js'
```

Expected: FAIL because the exports, history messages, external cancellation, and health route are absent.

- [ ] **Step 3: Implement bounded history and composed abort signals**

In `src/server/assist.js`:

```js
export const DEFAULT_MODEL_TIMEOUT_MS = 60000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARACTERS = 24000;

export function normalizeAssistHistory(history = []) {
  if (!Array.isArray(history) || history.length % 2 !== 0) {
    throw new Error("Assist history must contain completed user/assistant pairs.");
  }
  const pairs = [];
  for (let index = 0; index < history.length; index += 2) {
    const user = history[index];
    const assistant = history[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant" ||
        typeof user.content !== "string" || typeof assistant.content !== "string") {
      throw new Error("Assist history contains an invalid message pair.");
    }
    pairs.push([
      { role: "user", content: user.content.trim() },
      { role: "assistant", content: assistant.content.trim() },
    ]);
  }
  const kept = [];
  let characters = 0;
  for (const pair of pairs.reverse()) {
    const pairCharacters = pair[0].content.length + pair[1].content.length;
    if (kept.length + 2 > MAX_HISTORY_MESSAGES || characters + pairCharacters > MAX_HISTORY_CHARACTERS) break;
    kept.unshift(...pair);
    characters += pairCharacters;
  }
  return kept;
}
```

Build model messages as `[systemMessage, ...normalizeAssistHistory(context.history), currentSnapshotMessage]`. Compose `options.signal` with the timeout controller using `AbortSignal.any`, and keep the existing timeout-reason behavior.

- [ ] **Step 4: Add health and upstream cancellation to the server route**

Before other API routes in `src/server/server.js`, return `{ status: "ok" }` for `GET /api/health`.

For `POST /api/assist`, create an AbortController after reading the JSON body. Abort it on `request.aborted` or when the response closes before `writableEnded`, pass its signal into `requestCodeAdvice`, and remove listeners in `finally`. Do not send a second JSON response after the socket has closed.

- [ ] **Step 5: Run focused tests and confirm server behavior passes**

Run the Step 2 command again.

Expected: all assist and server tests PASS with no unhandled promise rejection.

- [ ] **Step 6: Commit the server behavior**

```sh
git add src/server/assist.js src/server/server.js tests/assist.test.js tests/server.test.js
git commit -m "feat: support conversational model assistance"
```

---

### Task 4: Direct Problem Statement, Semantic Identity, and Editor Scrolling

**Files:**
- Modify: `web/view-state.js`
- Modify: `web/index.html:115-180`
- Modify: `web/styles.css:593-985,1210-1400`
- Modify: `web/app.js:77-148,640-663,984-1030,1163-1180,1549-1595`
- Modify: `tests/frontend-redesign.test.js`

**Interfaces:**
- Produces: `problemIdentity(problem) -> { heading, difficulty, tags, progress }`.
- Preserves: existing Practice behavior-bearing IDs and mobile tab values.
- Produces: the textarea as the sole code scroll source.

- [ ] **Step 1: Add failing identity and markup tests**

Extend `tests/frontend-redesign.test.js`:

```js
test("builds a localized semantic problem identity", () => {
  assert.deepEqual(problemIdentity({
    frontendId: "206",
    title: "反转链表",
    difficulty: "easy",
    tags: ["链表", "递归"],
    progress: { acCount: 4 },
  }), {
    heading: "#206 反转链表",
    difficulty: "简单",
    tags: ["链表", "递归"],
    progress: "通过次数 4",
  });
});

test("practice markup exposes visible statement and semantic identity nodes", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  for (const id of ["problem-difficulty", "problem-tags", "problem-progress", "practice-workspace"]) {
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, id);
  }
  assert.match(html, /id="problem-inspector"[\s\S]*id="problem-description"/);
});

test("solution textarea is the bounded scroll source", () => {
  const css = fs.readFileSync("web/styles.css", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");
  assert.match(css, /#code\s*\{[\s\S]*overflow:\s*auto/);
  assert.doesNotMatch(script, /function autoSizeCodeEditor\(/);
  assert.match(script, /highlight\.parentElement\.scrollTop\s*=\s*elements\.code\.scrollTop/);
  assert.match(script, /lineNumbers\.scrollTop\s*=\s*elements\.code\.scrollTop/);
});
```

Add `problemIdentity` to the import list.

- [ ] **Step 2: Run the frontend test and verify it fails on the new contract**

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/frontend-redesign.test.js'
```

Expected: FAIL because `problemIdentity`, semantic nodes, and scroll CSS do not exist.

- [ ] **Step 3: Add the pure problem identity model**

In `web/view-state.js` export:

```js
export function problemIdentity(problem = {}) {
  const difficulty = { easy: "简单", medium: "中等", hard: "困难" }[String(problem.difficulty || "").toLowerCase()] || String(problem.difficulty || "");
  const title = String(problem.title || "选择一道题开始");
  const number = String(problem.frontendId || "").trim();
  const acCount = Math.max(0, Math.floor(Number(problem.progress?.acCount || 0)));
  return {
    heading: number ? `#${number} ${title}` : title,
    difficulty,
    tags: Array.isArray(problem.tags) ? problem.tags.map(String).filter(Boolean) : [],
    progress: `通过次数 ${acCount}`,
  };
}
```

- [ ] **Step 4: Restructure only the Practice markup**

In `web/index.html`:

- Keep `#problem-title` as the main heading and remove the metadata sentence from `#eyebrow`.
- Add `#problem-difficulty`, `#problem-tags`, and `#problem-progress` inside a wrapping `.problem-identity-meta`.
- Wrap `#problem-inspector` and `.practice-main` in `<div id="practice-workspace" class="practice-workspace">`.
- Keep the statement before the editor in DOM order.
- Keep all existing editor and utility IDs exactly once.

- [ ] **Step 5: Make the statement visible and the editor independently scrollable**

Apply these layout rules, adapting only border radii at shared edges:

```css
.practice-workspace {
  display: grid;
  grid-template-columns: minmax(280px, .55fr) minmax(0, 1.45fr);
  min-height: 560px;
  height: calc(100vh - 210px);
  max-height: 820px;
}

.problem-inspector {
  display: block;
  max-height: none;
  min-height: 0;
  overflow: auto;
}

.problem-inspector:not(.is-open) { display: none; }
.practice-workspace:has(.problem-inspector:not(.is-open)) { grid-template-columns: minmax(0, 1fr); }
.practice-main { min-height: 0; height: 100%; max-height: none; }
.code-editor, .code-scroll, #code { min-height: 0; height: 100%; }
#code { overflow: auto; }
```

At `max-width: 1279px`, make `.practice-workspace` a block layout, bound the open statement to `max-height: 240px`, and retain the existing editor/utility split. At `max-width: 759px`, keep mobile panel switching and let the active panel occupy `calc(100vh - 276px)`.

Remove `autoSizeCodeEditor` and its call from `syncHighlight`. Keep both scroll-axis overlay synchronization and line-number synchronization.

- [ ] **Step 6: Render identity and default statement visibility**

Import `problemIdentity` into `web/app.js`. Add element references for the three new nodes. Replace `formatEyebrow` use with a `renderProblemIdentity(problem)` function that sets text with `textContent` and creates tag spans with `document.createElement`.

Initialize `problemInspectorOpen` to true. When a problem is opened for Practice, call `setProblemInspectorOpen(true)` and activate the mobile `problem` tab. Starting reinforcement will override the mobile tab to `code` in Task 7.

- [ ] **Step 7: Run frontend tests and confirm the new layout contract passes**

Run the Step 2 command again.

Expected: all frontend redesign tests PASS.

- [ ] **Step 8: Commit the Practice presentation repair**

```sh
git add web/view-state.js web/index.html web/styles.css web/app.js tests/frontend-redesign.test.js
git commit -m "fix: make the practice workspace readable"
```

---

### Task 5: Integrate API Recovery and Connection Status

**Files:**
- Modify: `web/index.html:48-64`
- Modify: `web/styles.css:241-300`
- Modify: `web/app.js:1-410,1549-1740`
- Modify: `tests/frontend-redesign.test.js`

**Interfaces:**
- Consumes: `createApiClient` and `createRetryBackoff` from Task 2.
- Produces: one `getJson` binding used by all current app request paths.
- Produces: `#connection-status` and `#retry-connection` UI.

- [ ] **Step 1: Add failing integration-contract tests**

Add assertions that `web/app.js` imports `createApiClient`, no longer declares `sessionTokenPromise` or a local `getSessionToken`, and configures connection-state and visibility-aware polling. Assert `web/index.html` contains exactly one `connection-status` and `retry-connection` ID.

- [ ] **Step 2: Run the frontend test and verify the old request code fails the contract**

Run:

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/frontend-redesign.test.js tests/api-client.test.js'
```

Expected: FAIL on missing API-client integration and connection nodes.

- [ ] **Step 3: Add a compact reconnecting state to the global bar**

Add this semantic structure inside `.global-bar`:

```html
<div id="connection-status" class="connection-status" role="status" aria-live="polite" hidden>
  <span data-icon="wifi-off"></span>
  <span id="connection-message"></span>
  <button id="retry-connection" type="button">重试连接</button>
</div>
```

Add this missing `wifi-off` entry to `ICON_PATHS` in `web/icons.js`, and update the icon test to require it:

```js
"wifi-off": '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.8a10 10 0 0 1 3-2"/><path d="M16 10.8a10 10 0 0 1 3 2"/><path d="M2 8.8a15 15 0 0 1 2.2-1.6"/><path d="M19.8 7.2A15 15 0 0 1 22 8.8"/><path d="m2 2 20 20"/>',
```

Style the state as compact and non-modal so it never covers the editor.

- [ ] **Step 4: Replace local fetch helpers with the shared client**

At module initialization:

```js
const apiClient = createApiClient({
  onConnectionChange: ({ online, error }) => renderConnectionState(online, error),
});
const getJson = apiClient.getJson;
```

Delete the old `sessionTokenPromise`, `getSessionToken`, and local `getJson`. Existing call sites keep their current signature. `renderConnectionState` uses `error.userMessage`, hides the state after recovery, and never renders raw `error.message` for `kind === "network"`.

- [ ] **Step 5: Replace the fixed memory interval with visibility-aware backoff**

Implement `scheduleMemorySync` with one owned timer and `createRetryBackoff({ minMs: 2000, maxMs: 30000 })`. Skip network work while `document.hidden`; on success call `success()`, on failure call `fail()`, and reschedule with `current()`. On `visibilitychange` to visible, cancel the pending timer and run immediately.

The retry button calls `apiClient.health()`, then `loadDoctor()` and `syncMemoryPages({ force: true })`. It does not repeat an interrupted run, assist request, import, delete, or daily-plan mutation.

- [ ] **Step 6: Run focused tests and confirm recovery integration passes**

Run the Step 2 command again.

Expected: all API-client and frontend integration tests PASS.

- [ ] **Step 7: Commit browser recovery**

```sh
git add web/icons.js web/index.html web/styles.css web/app.js tests/frontend-redesign.test.js
git commit -m "fix: recover practice requests safely"
```

---

### Task 6: Persist and Render Per-Problem AI Conversations

**Files:**
- Modify: `web/index.html:157-180`
- Modify: `web/styles.css:885-985`
- Modify: `web/app.js:1-148,409-510,999-1080,1549-1735`
- Modify: `tests/frontend-redesign.test.js`

**Interfaces:**
- Consumes: Task 1 session load/save and transcript functions.
- Consumes: Task 2 caller-provided AbortSignal and Task 3 `history` request field.
- Produces: `renderAssistConversation(session)` and cancellable `askAssist()`.

- [ ] **Step 1: Add failing transcript and cancellation UI assertions**

Extend the frontend test to require exactly one each of `assist-transcript`, `assist-status`, and `cancel-assist`. Assert `web/app.js` imports Task 1 functions, posts `history`, owns an `AbortController`, checks both request id and problem slug before applying a response, and persists assistant messages.

- [ ] **Step 2: Run focused frontend and assist tests and verify integration is absent**

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/practice-session.test.js tests/assist.test.js tests/frontend-redesign.test.js'
```

Expected: FAIL on missing transcript markup and app integration.

- [ ] **Step 3: Replace the single-answer UI with a transcript**

Keep `#assist-question` and `#ask-assist`. Replace the answer `<pre>` with:

```html
<div id="assist-transcript" class="assist-transcript" aria-live="polite"></div>
<p id="assist-status" class="assist-status" aria-live="polite"></p>
<div class="assist-actions">
  <button id="ask-assist" type="button">询问模型</button>
  <button id="cancel-assist" type="button" hidden>取消</button>
  <button class="text-button" type="button" data-view-target="settings">模型设置</button>
</div>
```

Render transcript messages with DOM creation and `textContent`; never inject model text through `innerHTML`. Add distinct but restrained user and assistant message styles.

- [ ] **Step 4: Replace legacy workspace caching with Task 1 session storage**

Keep the old cache-key function only as `legacyKey` input for migration. Add `currentPracticeSession`, `loadCurrentPracticeSession`, `persistCurrentPracticeSession`, and `applyPracticeSession` helpers.

`saveWorkspaceCache` becomes a compatibility-named wrapper that updates code, stdin, expected, and lastResult in the versioned session. `restoreWorkspaceCache` loads Task 1 state, applies code/input/result, and renders the current transcript. If save returns `{ saved: false }`, show a non-blocking “本轮内容暂时无法保存到浏览器” warning and keep the in-memory state.

- [ ] **Step 5: Make `askAssist` conversational, cancellable, and stale-safe**

Before sending:

1. Capture `requestProblemSlug = state.selected.slug` and increment a numeric `assistRequestId`.
2. Copy `history = currentPracticeSession.ai.current` before appending the new user question.
3. Append and persist the user message, clear the textarea, and rerender.
4. Create `assistAbortController`, show Cancel, and post the current snapshot plus `history` and `question`.

After response, append the assistant message only when both the request id and selected slug still match. Cancellation displays “已取消本次 AI 请求。” in `#assist-status` and leaves the user question in the transcript for editing or resending. A second request aborts the first before replacing the controller.

- [ ] **Step 6: Run focused tests and confirm conversation behavior passes**

Run the Step 2 command again.

Expected: session, assist, and frontend tests PASS.

- [ ] **Step 7: Commit conversational Practice state**

```sh
git add web/index.html web/styles.css web/app.js tests/frontend-redesign.test.js
git commit -m "feat: preserve per-problem AI conversations"
```

---

### Task 7: One-Action Reinforcement Round

**Files:**
- Modify: `web/index.html:115-180`
- Modify: `web/styles.css:593-985`
- Modify: `web/app.js:77-148,409-510,874-1080,1549-1735`
- Modify: `tests/frontend-redesign.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `startReinforcement`, `restorePreviousRound`, and `completeReinforcement` from Task 1.
- Produces: `beginReinforcement(trigger)`, `renderReinforcementState(session)`, and `showPreviousRound()`.
- Preserves: recommendation-to-library action and normal AC counting.

- [ ] **Step 1: Add failing reinforcement integration assertions**

Require these IDs exactly once: `reinforcement-state`, `start-reinforcement-from-result`, `start-reinforcement-from-ai`, `view-previous-round`, `restore-previous-round`, `previous-round-dialog`, `previous-round-code`, and `previous-round-conversation`.

Assert the script exposes `beginReinforcement`, uses Task 1 transitions, passes `"accepted"` from the AC path and `"ai-assisted"` from the AI path, and activates the mobile code tab after starting reinforcement.

- [ ] **Step 2: Run focused tests and verify the feature controls are absent**

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/practice-session.test.js tests/frontend-redesign.test.js tests/server.test.js'
```

Expected: FAIL on missing reinforcement controls and app flow.

- [ ] **Step 3: Add contextual controls and the previous-round dialog**

Add a hidden `#reinforcement-state` near `#daily-session`. Add “再练一次” to the result panel and “我懂了，马上重练” to the AI panel; each remains hidden until its trigger is available. Add “查看上轮思路” and “恢复上一轮” to the reinforcement state.

Use a native `<dialog id="previous-round-dialog">` containing `<pre id="previous-round-code">` and `<div id="previous-round-conversation">`. Populate both with `textContent`/created nodes. Include a form-method dialog close button for keyboard and screen-reader behavior.

- [ ] **Step 4: Separate fetching an initial template from applying it**

Extract:

```js
async function initialTemplateForProblem(problem = state.selected, language = elements.language.value) {
  if (problem?.memorySource) return GENERIC_TEMPLATES[language] || "";
  const body = await getJson(`/api/templates/${problem.slug}/${language}`);
  return body.code;
}
```

Make `loadTemplate` call this helper and then apply the returned code. This lets reinforcement load successfully before archiving or clearing visible state.

- [ ] **Step 5: Implement the atomic reinforcement transition**

`beginReinforcement(trigger)` must:

1. Disable both start buttons.
2. Await `initialTemplateForProblem` before changing session or DOM.
3. Call `startReinforcement(currentPracticeSession, { template, trigger, now: new Date().toISOString() })`.
4. Persist the complete new session once.
5. Apply code, empty stdin/expected, IDLE result, and empty current transcript.
6. Render “巩固练习中”, show previous-round controls, select utility `test`, activate mobile `code`, and focus the editor.
7. Re-enable buttons in `finally`; if template loading failed, leave the original round unchanged and show the error.

Bind `restore-previous-round` only while `canRestore` is true. Code/input changes and the first run call `updatePracticeWorkspace` with dirty marking so restore disappears.

- [ ] **Step 6: Complete reinforcement only on a confirmed AC**

In the existing confirmed response branch of `runCode`, after applying server progress:

```js
if (body.result.status === "AC" && currentPracticeSession.reinforcement.status === "active") {
  currentPracticeSession = completeReinforcement(currentPracticeSession, { now: new Date().toISOString() });
  persistCurrentPracticeSession();
  renderReinforcementState(currentPracticeSession);
}
```

Do not complete or increment local progress on a network-uncertain error. Show the result trigger after every confirmed AC and the AI trigger after every successfully appended assistant response.

- [ ] **Step 7: Document the user-visible workflow**

Add a concise README section stating that AI conversations and one previous round stay in this browser, daily recommendations still join the local library, and “我懂了，马上重练”/“再练一次” start a clean same-problem reinforcement round.

- [ ] **Step 8: Run focused tests and confirm the reinforcement flow passes**

Run the Step 2 command again.

Expected: all focused tests PASS, including existing accepted-progress and recommendation action tests.

- [ ] **Step 9: Commit reinforcement**

```sh
git add web/index.html web/styles.css web/app.js tests/frontend-redesign.test.js README.md
git commit -m "feat: add immediate reinforcement practice"
```

---

### Task 8: Full WSL and Browser Acceptance

**Files:**
- Verify: all files changed by Tasks 1-7
- Update if evidence requires: `tests/practice-session.test.js`, `tests/api-client.test.js`, `tests/assist.test.js`, `tests/server.test.js`, `tests/frontend-redesign.test.js`

**Interfaces:**
- Consumes: the complete integrated Practice experience.
- Produces: verified WSL test output, service state, desktop/mobile browser evidence, and any narrow regression fixes.

- [ ] **Step 1: Flush synchronization and run the complete automated suite**

```sh
mutagen sync flush acmcoder-v3
mutagen sync list acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && npm test'
```

Expected: Mutagen reports both endpoints connected and all tests PASS.

- [ ] **Step 2: Restart the server and verify deployment state**

```sh
ssh dev-wsl 'sudo systemctl restart acmcoder-v3.service'
ssh dev-wsl 'systemctl status acmcoder-v3.service --no-pager'
curl -fsS --max-time 5 http://127.0.0.1:43117/api/health
```

Expected: service is `active (running)` and health returns `{ "status": "ok" }`. If sudo requires an interactive password, stop at this step and ask the user to run the exact restart command in their terminal; never request or enter their password.

- [ ] **Step 3: Verify desktop editor scrolling and direct statement display**

```sh
playwright-cli -s=acmcoder-practice open http://127.0.0.1:43117
playwright-cli -s=acmcoder-practice resize 1440 900
playwright-cli -s=acmcoder-practice click "[data-view-target='library']"
playwright-cli -s=acmcoder-practice click ".problem-item"
playwright-cli -s=acmcoder-practice run-code "async page => { const visible = await page.locator('#problem-inspector').isVisible(); if (!visible) throw new Error('statement hidden'); const code = Array.from({length: 120}, (_, i) => `print(${i + 1})`).join('\\n'); await page.locator('#code').fill(code); await page.locator('#code').evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); }); const state = await page.locator('#code').evaluate((element) => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight })); if (!(state.top > 0 && state.top >= state.max - 2)) throw new Error(JSON.stringify(state)); }"
```

Expected: statement is visible and textarea scroll reaches the final line.

- [ ] **Step 4: Verify mobile statement-first and editor scrolling**

```sh
playwright-cli -s=acmcoder-practice resize 390 844
playwright-cli -s=acmcoder-practice reload
playwright-cli -s=acmcoder-practice click "[data-view-target='library']"
playwright-cli -s=acmcoder-practice click ".problem-item"
playwright-cli -s=acmcoder-practice run-code "async page => { const selected = await page.locator('[data-mobile-practice-tab=problem]').getAttribute('aria-selected'); if (selected !== 'true') throw new Error('problem tab not selected'); await page.locator('[data-mobile-practice-tab=code]').click(); const code = Array.from({length: 120}, (_, i) => `print(${i + 1})`).join('\\n'); await page.locator('#code').fill(code); await page.locator('#code').evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); }); const aligned = await page.evaluate(() => ({ code: document.querySelector('#code').scrollTop, highlight: document.querySelector('#code-highlight').parentElement.scrollTop, lines: document.querySelector('#line-numbers').scrollTop })); if (!(aligned.code > 0 && aligned.code === aligned.highlight && aligned.code === aligned.lines)) throw new Error(JSON.stringify(aligned)); }"
```

Expected: Problem is initially selected; after moving to Code, all three scroll positions align.

- [ ] **Step 5: Verify local AI conversation and reinforcement with a deterministic test response**

Use Playwright routing to fulfill two deterministic `/api/assist` responses in the live browser; capture and assert the second posted payload contains the first completed pair. Do not read or print any configured model key. Ask two short questions, verify both turns remain after refresh, click “我懂了，马上重练”, and verify:

- code is the initial template;
- stdin, expected, result, and current transcript are empty;
- “巩固练习中” and “查看上轮思路” are visible;
- the dialog shows the previous code and both previous messages;
- the previous transcript is not included in the next model request according to the automated request-body test.

- [ ] **Step 6: Verify token renewal without duplicate execution**

Keep the browser page open, run once to establish a token, restart `acmcoder-v3.service`, and run again. Inspect browser requests:

```sh
playwright-cli -s=acmcoder-practice requests
```

Expected: the second action shows one rejected `/api/run` 401, one `/api/session` refresh, and one successful `/api/run`; the displayed accepted count increases only once for that action.

- [ ] **Step 7: Verify network-error translation and recovery without mutating retries**

Use browser routing to abort health and problem GETs temporarily, then remove the route:

```sh
playwright-cli -s=acmcoder-practice run-code "async page => { await page.route('**/api/health', (route) => route.abort()); }"
playwright-cli -s=acmcoder-practice click "#retry-connection"
playwright-cli -s=acmcoder-practice find "无法连接 ACMCoder 本地服务"
playwright-cli -s=acmcoder-practice run-code "async page => { await page.unroute('**/api/health'); }"
playwright-cli -s=acmcoder-practice click "#retry-connection"
```

Expected: Chinese connection guidance appears during failure and clears after recovery; editor content remains unchanged. Confirm `tests/api-client.test.js` still proves a network-uncertain POST is called exactly once.

- [ ] **Step 8: Capture final responsive evidence and inspect browser errors**

```sh
playwright-cli -s=acmcoder-practice resize 1440 900
playwright-cli -s=acmcoder-practice screenshot --filename=.playwright-cli/practice-desktop-final.png
playwright-cli -s=acmcoder-practice resize 390 844
playwright-cli -s=acmcoder-practice screenshot --filename=.playwright-cli/practice-mobile-final.png
playwright-cli -s=acmcoder-practice console error
playwright-cli -s=acmcoder-practice close
```

Expected: semantic identity, statement, editor, and utility surfaces remain readable; the console has no uncaught application error.

- [ ] **Step 9: Apply only evidence-driven regression fixes and rerun all checks**

If a test or browser assertion fails, use `superpowers:systematic-debugging`, add the smallest failing regression test, change only the responsible component, and repeat Steps 1-8. Do not bundle unrelated cleanup.

- [ ] **Step 10: Run final verification and commit any test-driven integration fixes**

```sh
git diff --check
git status --short --branch
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && npm test'
```

Expected: no whitespace errors, only intended files changed, and the complete suite PASS. If Step 9 created changes:

```sh
git add web src tests README.md
git commit -m "fix: close practice experience regressions"
```

Before claiming completion, invoke `superpowers:verification-before-completion` and verify the current Git diff, WSL test output, service status, and browser evidence from this run.
