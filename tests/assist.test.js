import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MODEL_TIMEOUT_MS,
  getDefaultAssistSettings,
  getPublicAssistSettings,
  loadAssistSettings,
  normalizeAssistHistory,
  requestCodeAdvice,
  saveAssistSettings,
} from "../src/server/assist.js";

test("stores optional model settings locally without exposing the API key", async () => {
  const settingsFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-assist-")), "settings.json");

  await saveAssistSettings(
    {
      apiKey: "sk-local-test",
      baseUrl: "https://llm.example.test/v1",
      model: "coder-model",
    },
    settingsFile,
  );

  const loaded = await loadAssistSettings(settingsFile);
  const publicSettings = getPublicAssistSettings(loaded);

  assert.equal(loaded.apiKey, "sk-local-test");
  assert.equal(loaded.baseUrl, "https://llm.example.test/v1");
  assert.equal(loaded.model, "coder-model");
  assert.equal(publicSettings.configured, true);
  assert.equal(publicSettings.apiKey, undefined);
  assert.equal(publicSettings.baseUrl, "https://llm.example.test/v1");
  assert.equal(publicSettings.model, "coder-model");
});

test("requests lightweight code advice through an OpenAI-compatible chat endpoint", async () => {
  const calls = [];
  const result = await requestCodeAdvice({
    settings: {
      ...getDefaultAssistSettings(),
      apiKey: "sk-local-test",
      baseUrl: "https://llm.example.test/v1",
      model: "coder-model",
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "建议先检查边界条件。",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
    context: {
      language: "python",
      code: "print(nums[0])",
      question: "这段代码哪里可能错？",
      problemTitle: "Two Sum",
      stdin: "[2,7,11,15]\n9",
      expected: "[0,1]",
      stdout: "",
      stderr: "",
      status: "WA",
    },
  });

  assert.equal(result.message, "建议先检查边界条件。");
  assert.equal(result.model, "coder-model");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://llm.example.test/v1/chat/completions");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-local-test");

  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, "coder-model");
  assert.equal(
    payload.messages[0].content,
    "你是 ACMCoder 的编程练习助手。用户可能会闲聊、询问题目、请求代码建议或分析运行错误。不要声称已经修改源代码。",
  );
  assert.match(payload.messages[1].content, /print\(nums\[0\]\)/);
  assert.match(payload.messages[1].content, /这段代码哪里可能错/);
});

test("requires a configured API key before asking for model advice", async () => {
  await assert.rejects(
    () =>
      requestCodeAdvice({
        settings: getDefaultAssistSettings(),
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
        context: { language: "python", code: "print(1)" },
      }),
    /LLM API Key/,
  );
});

test("aborts a code-advice request after the configured timeout", async () => {
  let receivedSignal;

  await assert.rejects(
    () =>
      requestCodeAdvice({
        settings: {
          ...getDefaultAssistSettings(),
          apiKey: "sk-local-test",
          baseUrl: "https://llm.example.test/v1",
          model: "coder-model",
        },
        timeoutMs: 10,
        fetch: async (_url, options) =>
          new Promise((_resolve, reject) => {
            receivedSignal = options.signal;
            if (!receivedSignal) {
              reject(new Error("missing abort signal"));
              return;
            }
            receivedSignal.addEventListener("abort", () => reject(receivedSignal.reason), { once: true });
          }),
        context: { language: "python", code: "print(1)" },
      }),
    /timed out/i,
  );

  assert.ok(receivedSignal);
  assert.equal(receivedSignal.aborted, true);
});

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

test("preserves an earlier external cancellation when fetch rejects after the timeout", async () => {
  const external = new AbortController();
  const pending = requestCodeAdvice({
    settings: { ...getDefaultAssistSettings(), apiKey: "sk-local-test" },
    signal: external.signal,
    timeoutMs: 10,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        setTimeout(() => reject(new Error("fetch observed cancellation")), 20);
      }, { once: true });
    }),
    context: { question: "cancel" },
  });
  external.abort(new Error("用户先取消了模型请求。"));
  await assert.rejects(pending, /用户先取消/);
});
