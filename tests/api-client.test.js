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
