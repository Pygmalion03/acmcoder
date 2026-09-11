import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import {
  APP_VIEWS,
  UTILITY_TABS,
  apiRunnerForUiMode,
  canonicalProblemSlug,
  dailyPlanProgress,
  isStaleLeetCodeSampleCache,
  memoryPagesVersion,
  mergeMemoryProblems,
  nextCatalogSelection,
  normalizeUtilityTab,
  normalizeView,
  problemIdentity,
  sampleIoForProblem,
  uiRunnerForApiRecommendation,
} from "../web/view-state.js";
import { iconMarkup } from "../web/icons.js";
import { createStartupRecovery } from "../web/startup-recovery.js";

function loadAppForStartupPollingRace() {
  const source = fs.readFileSync("web/app.js", "utf8")
    .replace(/^import \{[^}]+\} from "\.\/(?:icons|api-client|startup-recovery|practice-session)\.js";\n/gm, "")
    .replace(/^import \{[\s\S]*?\} from "\.\/view-state\.js";\n/, "");
  const nodes = new Map();
  const timers = [];
  const makeNode = () => ({
    classList: { toggle() {} },
    dataset: {},
    hidden: true,
    style: {},
    value: "",
    addEventListener() {},
    append() {},
    appendChild() {},
    closest() { return null; },
    focus() {},
    querySelector() { return null; },
    removeAttribute() {},
    replaceChildren() {},
    setAttribute() {},
  });
  const document = {
    body: { dataset: {} },
    hidden: false,
    addEventListener() {},
    createElement: makeNode,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, makeNode());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
  };
  let onConnectionChange;
  const context = {
    Date,
    Intl,
    console,
    document,
    createApiClient: ({ onConnectionChange: handler }) => {
      onConnectionChange = handler;
      return {
        getJson: async (url) => {
          if (url === "/api/problems") {
            onConnectionChange({ online: false, error: { kind: "network", userMessage: "offline" } });
            throw new Error("offline");
          }
          if (url === "/api/memory/pages") {
            onConnectionChange({ online: true });
            return { pages: [] };
          }
          return {};
        },
        health: async () => ({}),
      };
    },
    createRetryBackoff: () => ({ current: () => 2000, fail() {}, success() {} }),
    createStartupRecovery,
    hydrateIcons() {},
    iconMarkup: () => "",
    canonicalProblemSlug: () => "",
    dailyPlanProgress: () => ({ completed: 0, total: 0, percent: 0 }),
    apiRunnerForUiMode: (value) => value,
    isStaleLeetCodeSampleCache: () => false,
    memoryPagesVersion: () => "",
    mergeMemoryProblems: (problems) => problems,
    nextCatalogSelection: () => [],
    normalizeUtilityTab: (value) => value,
    normalizeView: (value) => value,
    problemIdentity: () => ({}),
    sampleIoForProblem: () => ({}),
    uiRunnerForApiRecommendation: () => "",
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
  };

  vm.runInNewContext(source, context, { filename: "web/app.js" });
  return { nodes, timers };
}

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

function loadAppForDeferredTemplateTransitions() {
  const source = `${fs.readFileSync("web/app.js", "utf8")
    .replace(/^import \{[^}]+\} from "\.\/(?:icons|api-client|startup-recovery|practice-session)\.js";\n/gm, "")
    .replace(/^import \{[\s\S]*?\} from "\.\/view-state\.js";\n/, "")}
globalThis.__templateApp = { state, elements, selectProblem };
`;
  const nodes = new Map();
  const savedSessions = [];
  const templateRequests = new Map();
  const makeNode = () => {
    const listeners = new Map();
    return {
      classList: { add() {}, remove() {}, toggle() {} },
      children: [],
      dataset: {},
      hidden: false,
      parentElement: { scrollTop: 0, scrollLeft: 0 },
      scrollLeft: 0,
      scrollTop: 0,
      selectionEnd: 0,
      selectionStart: 0,
      options: [],
      selectedOptions: [],
      style: {},
      textContent: "",
      value: "",
      addEventListener(type, handler) {
        listeners.set(type, [...(listeners.get(type) || []), handler]);
      },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      closest() { return null; },
      dispatch(type) { for (const handler of listeners.get(type) || []) handler({ target: this }); },
      focus() {},
      querySelector() { return null; },
      remove() {},
      removeAttribute() {},
      replaceChildren(...children) { this.children = children; },
      setAttribute() {},
    };
  };
  const document = {
    body: { dataset: {}, appendChild() {} },
    hidden: false,
    addEventListener() {},
    createElement: makeNode,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, makeNode());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const localValues = new Map();
  const localStorage = {
    getItem(key) { return localValues.get(key) || null; },
    setItem(key, value) { localValues.set(key, String(value)); },
    removeItem(key) { localValues.delete(key); },
  };
  const problem = (slug) => ({
    slug,
    title: slug,
    description: `${slug} description`,
    difficulty: "easy",
    tags: [],
    leetcode: { url: `https://leetcode.test/${slug}`, slug },
    progress: { acCount: 0 },
    cases: [],
  });
  const getJson = (url) => {
    if (url === "/api/problems") return Promise.resolve({ problems: [] });
    if (url === "/api/memory/pages") return Promise.resolve({ pages: [] });
    if (url.startsWith("/api/problems/")) return Promise.resolve({ problem: problem(url.split("/").at(-1)) });
    if (url.startsWith("/api/templates/")) {
      return new Promise((resolve) => templateRequests.set(url, resolve));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const context = {
    AbortController,
    Date,
    Intl,
    URL,
    Blob,
    console,
    document,
    localStorage,
    setTimeout() { return 1; },
    clearTimeout() {},
    createApiClient: () => ({ getJson, health: async () => ({}) }),
    createRetryBackoff: () => ({ current: () => 2000, fail() {}, success() {} }),
    createStartupRecovery: ({ wire, load, onReady }) => ({
      initialize: async () => { wire(); await load(); onReady(); },
      isReady: () => true,
      retry: async () => {},
    }),
    hydrateIcons() {},
    iconMarkup: () => "",
    appendAiMessage: (session, message) => ({ ...session, ai: { current: [...session.ai.current, message] } }),
    loadPracticeSessionWithMetadata: () => ({
      source: "empty",
      session: { code: "", stdin: "", expected: "", lastResult: null, ai: { current: [] } },
    }),
    removePracticeSessions() {},
    savePracticeSession: (_storage, identity, session) => {
      savedSessions.push({ identity: { ...identity }, code: session.code });
      return { saved: true };
    },
    updatePracticeWorkspace: (session, update) => ({ ...session, ...update }),
    canonicalProblemSlug: (value) => String(value?.leetcode?.slug || value?.slug || "").replace(/^memory:/, ""),
    dailyPlanProgress: () => ({ completed: 0, total: 0, percent: 0 }),
    apiRunnerForUiMode: (value) => value,
    isStaleLeetCodeSampleCache: () => false,
    memoryPagesVersion: () => "",
    mergeMemoryProblems: (problems) => problems,
    nextCatalogSelection: () => [],
    normalizeUtilityTab: (value) => value,
    normalizeView: (value) => value,
    problemIdentity: (value) => ({ heading: value.title, difficulty: "", tags: [], progress: "" }),
    sampleIoForProblem: () => ({ inputText: "", outputText: "", note: "" }),
    uiRunnerForApiRecommendation: () => "local",
  };
  vm.runInNewContext(source, context, { filename: "web/app.js" });
  return {
    app: context.__templateApp,
    nodes,
    resolveTemplate(url, code) { templateRequests.get(url)?.({ code }); },
    savedSessions,
  };
}

test("defines and normalizes application views and utility tabs", () => {
  assert.deepEqual(APP_VIEWS, ["today", "practice", "library", "catalog", "settings"]);
  assert.deepEqual(UTILITY_TABS, ["test", "result", "assist"]);
  assert.equal(normalizeView("catalog"), "catalog");
  assert.equal(normalizeView("unknown"), "today");
  assert.equal(normalizeUtilityTab("assist"), "assist");
  assert.equal(normalizeUtilityTab("unknown"), "test");
});

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

test("mobile problem tab does not retain the hidden editor workspace height", () => {
  const css = fs.readFileSync("web/styles.css", "utf8");
  const mobileCss = css.match(/@media \(max-width: 759px\) \{([\s\S]*)$/)?.[1] || "";

  assert.match(mobileCss, /\.practice-main\s*\{[^}]*min-height:\s*0/);
});

test("maps the three visible runner modes to the existing runner API", () => {
  assert.equal(apiRunnerForUiMode("local"), "local");
  assert.equal(apiRunnerForUiMode("builtin"), "local");
  assert.equal(apiRunnerForUiMode("docker"), "docker");
  assert.equal(uiRunnerForApiRecommendation("local", "host"), "local");
  assert.equal(uiRunnerForApiRecommendation("local", "docker-app"), "builtin");
  assert.equal(uiRunnerForApiRecommendation("docker", "host"), "docker");
});

test("canonicalizes problem slugs and prefers LeetCode metadata", () => {
  assert.equal(
    canonicalProblemSlug({ slug: "memory:lru-cache", leetcode: { slug: "memory:two-sum" } }),
    "two-sum",
  );
  assert.equal(canonicalProblemSlug({ slug: "memory:lru-cache" }), "lru-cache");
  assert.equal(canonicalProblemSlug(null), "");
});

test("calculates accepted progress for the plan date", () => {
  const plan = {
    date: "2026-07-10",
    items: [
      { leetcodeSlug: "two-sum" },
      { leetcodeSlug: "lru-cache" },
      { leetcodeSlug: "merge-k-sorted-lists" },
    ],
  };
  const problems = [
    {
      slug: "memory:two-sum",
      progress: { lastAcceptedAt: "2026-07-10T08:30:00+08:00" },
    },
    {
      slug: "memory:lru-cache",
      progress: { lastAcceptedAt: "2026-07-09T22:00:00+08:00" },
    },
  ];

  assert.deepEqual(dailyPlanProgress(plan, problems), { completed: 1, total: 3, percent: 33 });
  assert.deepEqual(dailyPlanProgress(null), { completed: 0, total: 0, percent: 0 });
});

test("toggles select all for recommendation catalog entries", () => {
  const catalog = [{ leetcodeSlug: "two-sum" }, { leetcodeSlug: "lru-cache" }];

  assert.deepEqual(nextCatalogSelection(catalog, new Set()), ["two-sum", "lru-cache"]);
  assert.deepEqual(nextCatalogSelection(catalog, new Set(["two-sum"])), ["two-sum", "lru-cache"]);
  assert.deepEqual(nextCatalogSelection(catalog, new Set(["two-sum", "lru-cache"])), []);
  assert.deepEqual(nextCatalogSelection([], new Set()), []);
});

test("versions memory pages by slug capture time and accepted count", () => {
  const pages = [
    { slug: "two-sum", capturedAt: "2026-07-11T10:00:00Z", progress: { acCount: 0 } },
    { slug: "lru-cache", capturedAt: "2026-07-11T11:00:00Z", progress: { acCount: 2 } },
  ];
  const reordered = [pages[1], pages[0]];
  const acceptedAgain = [pages[0], { ...pages[1], progress: { acCount: 3 } }];
  const recaptured = [{ ...pages[0], capturedAt: "2026-07-11T12:00:00Z" }, pages[1]];

  assert.equal(memoryPagesVersion(pages), memoryPagesVersion(reordered));
  assert.notEqual(memoryPagesVersion(pages), memoryPagesVersion(acceptedAgain));
  assert.notEqual(memoryPagesVersion(pages), memoryPagesVersion(recaptured));
});

test("replaces the memory slice while preserving seed problems", () => {
  const seed = { slug: "a-plus-b", source: "seed" };
  const oldMemory = { slug: "memory:old", memorySource: true };
  const nextMemory = [{ slug: "memory:two-sum", memorySource: true }];

  assert.deepEqual(mergeMemoryProblems([oldMemory, seed], nextMemory), [...nextMemory, seed]);
});

test("does not treat a captured LeetCode example as executable ACM input", () => {
  const problem = {
    memorySource: true,
    sample: { inputText: "nums = [2,7,11,15], target = 9", outputText: "[0,1]" },
  };

  assert.deepEqual(sampleIoForProblem(problem), {
    inputText: "",
    outputText: "",
    note: "LeetCode 示例不是 ACM 标准输入，请按程序的读取顺序填写测试数据。",
  });
});

test("restores the first ACM case for a seed problem", () => {
  const problem = {
    source: "seed",
    cases: [{ inputText: "4\n2 7 11 15\n9", outputText: "0 1" }],
  };

  assert.deepEqual(sampleIoForProblem(problem), {
    inputText: "4\n2 7 11 15\n9",
    outputText: "0 1",
    note: "",
  });
});

test("only discards an old cache that exactly matches the LeetCode example", () => {
  const problem = {
    memorySource: true,
    sample: { inputText: "nums = [2,7,11,15], target = 9", outputText: "[0,1]" },
  };

  assert.equal(
    isStaleLeetCodeSampleCache(problem, {
      stdin: "nums = [2,7,11,15], target = 9",
      expected: "[0,1]",
    }),
    true,
  );
  assert.equal(
    isStaleLeetCodeSampleCache(problem, {
      stdin: "4\n2 7 11 15\n9",
      expected: "0 1",
    }),
    false,
  );
});

test("web UI has no runtime CDN or font URL dependencies", () => {
  const html = fs.readFileSync("web/index.html", "utf8");

  assert.doesNotMatch(html, /https?:\/\/(?:unpkg|cdn|fonts\.)/i);
});

test("web UI exposes the semantic application shell and every view target", () => {
  const html = fs.readFileSync("web/index.html", "utf8");

  assert.match(html, /id="app-navigation"/);
  assert.match(html, /data-nav-group="smart-practice"/);
  assert.match(html, /data-nav-group="workspace"/);
  assert.match(html, /data-nav-group="system"/);
  assert.match(html, /aria-live="polite"/);

  for (const view of APP_VIEWS) {
    assert.match(html, new RegExp(`id="view-${view}"`));
    assert.match(html, new RegExp(`data-view-target="${view}"`));
  }
});

test("web UI preserves each behavior-bearing element ID exactly once", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const ids = [
    "search",
    "problem-list",
    "select-problems",
    "delete-problems",
    "export-problems",
    "import-problems",
    "import-file",
    "problem-title",
    "eyebrow",
    "leetcode-link",
    "problem-description",
    "language",
    "runner",
    "runner-health",
    "load-template",
    "run",
    "code-editor",
    "line-numbers",
    "code-highlight",
    "code",
    "stdin",
    "expected",
    "sample-io",
    "sample-io-note",
    "clear-expected",
    "status",
    "message",
    "stdout",
    "stderr",
    "assist-key",
    "assist-base-url",
    "assist-model",
    "save-assist-settings",
    "assist-question",
    "ask-assist",
    "assist-transcript",
    "assist-status",
    "cancel-assist",
    "daily-count",
    "daily-difficulty",
    "daily-tags",
    "generate-daily",
    "import-catalog",
    "catalog-file",
    "daily-status",
    "daily-list",
    "catalog-import",
    "catalog-export",
    "catalog-select",
    "catalog-select-all",
    "catalog-delete",
    "catalog-status",
    "catalog-list",
  ];

  for (const id of ids) {
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, id);
  }
});

test("practice UI persists a cancellable per-problem AI conversation", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  for (const id of ["assist-transcript", "assist-status", "cancel-assist"]) {
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, id);
  }
  assert.match(html, /id="assist-transcript"[^>]*aria-live="polite"/);
  assert.match(html, /id="assist-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="cancel-assist"[^>]*hidden/);

  assert.match(script, /from "\.\/practice-session\.js"/);
  for (const name of ["appendAiMessage", "loadPracticeSessionWithMetadata", "savePracticeSession", "updatePracticeWorkspace"]) {
    assert.match(script, new RegExp(`\\b${name}\\b`), name);
  }
  assert.match(script, /function renderAssistConversation\(/);
  const renderConversation = script.match(/function renderAssistConversation\([\s\S]*?\n}\n\nfunction/);
  assert.ok(renderConversation);
  assert.match(renderConversation[0], /document\.createElement\(/);
  assert.match(renderConversation[0], /\.textContent\s*=/);
  assert.doesNotMatch(renderConversation[0], /\.innerHTML\s*=/);
  assert.match(script, /history,/);
  assert.match(script, /new AbortController\(\)/);
  assert.match(script, /requestId !== assistRequestId \|\| requestProblemSlug !== state\.selected\?\.slug/);
  assert.match(script, /appendAiMessage\([\s\S]*role:\s*"assistant"/);
  assert.match(script, /已取消本次 AI 请求。/);
  assert.match(script, /function cancelAssist\(/);
  assert.match(script, /function loadCurrentPracticeSession\(/);
  assert.match(script, /function persistCurrentPracticeSession\(/);
  assert.match(script, /function applyPracticeSession\(/);
});

test("practice UI starts and completes an immediate reinforcement round", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  for (const id of [
    "reinforcement-state",
    "start-reinforcement-from-result",
    "start-reinforcement-from-ai",
    "view-previous-round",
    "restore-previous-round",
    "previous-round-dialog",
    "previous-round-code",
    "previous-round-conversation",
  ]) {
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, id);
  }

  assert.match(html, /<dialog id="previous-round-dialog"/);
  assert.match(html, /<form method="dialog">/);
  assert.match(script, /\bstartReinforcement\b/);
  assert.match(script, /\brestorePreviousRound\b/);
  assert.match(script, /\bcompleteReinforcement\b/);
  assert.match(script, /async function beginReinforcement\(trigger\)/);
  assert.match(script, /function renderReinforcementState\(/);
  assert.match(script, /function showPreviousRound\(\)/);
  assert.match(script, /beginReinforcement\("accepted"\)/);
  assert.match(script, /beginReinforcement\("ai-assisted"\)/);
  assert.match(script, /setMobilePracticeTab\("code"\)/);
  assert.match(script, /body\.result\.status === "AC"[\s\S]*completeReinforcement\(/);
});

test("practice changes bind persistence to a captured session identity", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /let currentPracticeSessionIdentity = null;/);
  assert.match(script, /function beginPracticeContextChange\(/);
  assert.match(script, /const contextId = beginPracticeContextChange\(\);/);
  assert.match(script, /if \(!isCurrentPracticeContext\(contextId\)\) \{\s*return;\s*\}/);
  assert.match(script, /savePracticeSession\(localStorage, currentPracticeSessionIdentity, currentPracticeSession\)/);
});

test("an older problem template cannot overwrite the newer editor or transcript", async () => {
  const { app, nodes, resolveTemplate, savedSessions } = loadAppForDeferredTemplateTransitions();
  await flushPromises();
  nodes.get("#language").value = "python";
  nodes.get("#code").value = "old editor";
  nodes.get("#assist-transcript").appendChild({ textContent: "old transcript" });

  const oldSelection = app.selectProblem("old-problem");
  await flushPromises();
  const newSelection = app.selectProblem("new-problem");
  await flushPromises();

  assert.equal(nodes.get("#code").value, "");
  assert.equal(nodes.get("#assist-transcript").children.length, 0);

  resolveTemplate("/api/templates/new-problem/python", "new template");
  await newSelection;
  resolveTemplate("/api/templates/old-problem/python", "old template");
  await oldSelection;

  assert.equal(nodes.get("#code").value, "new template");
  assert.deepEqual(savedSessions.at(-1), {
    identity: { problemSlug: "new-problem", language: "python" },
    code: "new template",
  });
});

test("a delayed Java template cannot persist after a newer C++ language switch", async () => {
  const { app, nodes, resolveTemplate, savedSessions } = loadAppForDeferredTemplateTransitions();
  await flushPromises();
  nodes.get("#language").value = "python";
  const initialSelection = app.selectProblem("language-problem");
  await flushPromises();
  resolveTemplate("/api/templates/language-problem/python", "python template");
  await initialSelection;

  nodes.get("#language").value = "java";
  nodes.get("#language").dispatch("change");
  await flushPromises();
  nodes.get("#language").value = "cpp";
  nodes.get("#language").dispatch("change");
  await flushPromises();

  resolveTemplate("/api/templates/language-problem/cpp", "cpp template");
  await flushPromises();
  resolveTemplate("/api/templates/language-problem/java", "java template");
  await flushPromises();

  assert.equal(nodes.get("#code").value, "cpp template");
  assert.deepEqual(savedSessions.at(-1), {
    identity: { problemSlug: "language-problem", language: "cpp" },
    code: "cpp template",
  });
});

test("local icon markup exposes the required Lucide icons", () => {
  const iconNames = [
    "home",
    "sparkles",
    "code-2",
    "library-big",
    "settings",
    "search",
    "external-link",
    "play",
    "upload",
    "download",
    "trash-2",
    "wifi-off",
  ];

  for (const name of iconNames) {
    assert.match(iconMarkup(name), /^<svg\b/, name);
  }
  assert.equal(iconMarkup("missing"), "");
});

test("web app wires the five-view workspace and utility tabs", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /import \{ hydrateIcons, iconMarkup \} from "\.\/icons\.js"/);
  assert.match(script, /import \{[\s\S]*normalizeUtilityTab[\s\S]*normalizeView[\s\S]*\} from "\.\/view-state\.js"/);
  assert.match(script, /activeView:\s*"today"/);
  assert.match(script, /activeUtilityTab:\s*"test"/);
  assert.match(script, /function setActiveView\(/);
  assert.match(script, /function setUtilityTab\(/);
  assert.match(script, /function setMobileMoreOpen\(/);
  assert.match(script, /function updateLibraryCount\(/);
});

test("web app delegates request recovery to the shared client and exposes compact connection recovery", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /import \{ createApiClient, createRetryBackoff \} from "\.\/api-client\.js"/);
  assert.doesNotMatch(script, /sessionTokenPromise/);
  assert.doesNotMatch(script, /function getSessionToken\(/);
  assert.match(script, /const getJson = apiClient\.getJson/);
  assert.match(script, /function renderConnectionState\(online, error\)/);
  assert.match(script, /error\?\.userMessage/);
  assert.match(script, /createRetryBackoff\(\{ minMs: 2000, maxMs: 30000 \}\)/);
  assert.match(script, /document\.hidden/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /apiClient\.health\(\)/);
  assert.match(script, /syncMemoryPages\(\{ force: true \}\)/);
  assert.doesNotMatch(script, /setInterval\(/);

  for (const id of ["connection-status", "retry-connection"]) {
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, id);
  }
  assert.match(html, /id="connection-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="retry-connection"[^>]*type="button"/);
});

test("retries a failed startup after recovery while wiring controls only once", async () => {
  const events = [];
  let attempts = 0;
  const startup = createStartupRecovery({
    wire: () => events.push("wire"),
    load: async () => {
      attempts += 1;
      events.push(`load:${attempts}`);
      if (attempts === 1) {
        throw new Error("offline");
      }
    },
  });

  await assert.rejects(() => startup.initialize(), /offline/);
  assert.equal(startup.isReady(), false);
  await startup.retry(async () => events.push("recover"));

  assert.deepEqual(events, ["wire", "load:1", "recover", "load:2"]);
  assert.equal(startup.isReady(), true);
});

test("app keeps recovery visible when polling succeeds before startup completes", async () => {
  const { nodes, timers } = loadAppForStartupPollingRace();
  const status = nodes.get("#connection-status");

  await flushPromises();
  assert.equal(status.hidden, false);
  assert.equal(timers.length, 1);

  timers[0]();
  await flushPromises();

  assert.equal(status.hidden, false);
});

test("web app keeps catalog and settings actions connected to existing local flows", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /settingsImportProblems/);
  assert.match(script, /settingsExportProblems/);
  assert.match(script, /catalogImport/);
  assert.match(script, /globalSearch/);
  assert.match(script, /api\/recommendation\/catalog/);
  assert.match(script, /function updateCatalogActions\(/);
  assert.match(script, /function toggleCatalogSelectAll\(/);
  assert.match(script, /async function exportRecommendationCatalog\(/);
  assert.match(script, /async function deleteSelectedCatalogEntries\(/);
  assert.match(script, /nextCatalogSelection/);
  assert.match(html, /placeholder="数组、动态规划、图"/);
  assert.doesNotMatch(html, /只读高频题池/);
  assert.match(script, /reloadProblems\(\{ preserveView = false \} = \{\}\)/);
});

test("today view reports accepted progress and opens recommendations in practice", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  for (const count of [1, 2, 3, 4, 5]) {
    assert.match(html, new RegExp(`<option value="${count}"(?: selected)?>${count} 题</option>`));
  }
  assert.match(script, /dailyPlanProgress/);
  assert.match(script, /function renderDailyProgress\(/);
  assert.match(script, /function openPracticeForRecommendation\(/);
  assert.match(script, /打开原题/);
  assert.match(script, /加入并练习/);
  assert.match(script, /memory:\$\{slug\}/);
  assert.match(script, /const apiAction = action === "practice" \? "add_to_practice" : action/);
  assert.match(script, /body: JSON\.stringify\(\{ action: apiAction \}\)/);
  assert.match(script, /setActiveView\("practice"\)/);
});

test("practice view exposes session context, result switching, and mobile panels", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /const getJson = apiClient\.getJson/);
  assert.match(script, /function renderDailySession\(/);
  assert.match(script, /function setMobilePracticeTab\(/);
  assert.match(script, /function setProblemInspectorOpen\(/);
  assert.match(script, /setUtilityTab\("result"\)/);
  assert.match(script, /data-mobile-practice-tab/);
});

test("visual system uses restrained glass surfaces and an opaque coding workspace", () => {
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(css, /--page-backing:\s*#cbd9d4/);
  assert.match(css, /--glass-surface:\s*rgba\(245,\s*249,\s*247,\s*\.68\)/);
  assert.match(css, /--editor:\s*#0d1113/);
  assert.match(css, /\.app-nav\s*\{[\s\S]*backdrop-filter:\s*blur\(/);
  assert.match(css, /\.editor-pane\s*\{[\s\S]*background:\s*var\(--editor\)/);
  assert.match(css, /@supports not \(backdrop-filter:/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient\(/);
});

test("visual system provides compact tablet and mobile navigation layouts", () => {
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(css, /@media \(max-width:\s*1179px\)/);
  assert.match(css, /@media \(max-width:\s*759px\)/);
  assert.match(css, /\.catalog-view \.view-heading\s*\{\s*flex-direction: column;/);
  assert.match(css, /\.mobile-nav/);
  assert.match(css, /\.mobile-practice-tabs/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
