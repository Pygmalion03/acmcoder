import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

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

test("a broken successful response body retries GET but never reports online", async () => {
  let calls = 0;
  const changes = [];
  const client = createApiClient({
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => { throw new TypeError("body terminated"); } };
    },
    wait: async () => {},
    onConnectionChange: (change) => changes.push(change),
  });
  await assert.rejects(() => client.getJson("/api/health"), (error) => error.kind === "network");
  assert.equal(calls, 3);
  assert.equal(changes.some((change) => change.online === true), false);
});

test("a broken POST response body has unknown outcome and is not retried", async () => {
  let calls = 0;
  const client = createApiClient({
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => { throw new TypeError("body terminated"); } };
    },
  });
  await assert.rejects(() => client.getJson("/api/assist", { method: "POST", body: "{}" }),
    (error) => error.kind === "network" && /结果未知/.test(error.userMessage));
  assert.equal(calls, 1);
});

test("invalid successful JSON is a protocol error and aborted bodies are cancelled", async () => {
  const invalid = createApiClient({ fetchFn: async () => new Response("not json", { status: 200 }) });
  await assert.rejects(() => invalid.getJson("/api/health"), (error) => error.kind === "protocol");
  let calls = 0;
  const aborted = createApiClient({ fetchFn: async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => { throw new DOMException("aborted", "AbortError"); } };
  } });
  await assert.rejects(() => aborted.getJson("/api/health"), (error) => error.kind === "cancelled");
  assert.equal(calls, 1);
});

test("a malformed 401 body still permits one run-token renewal", async () => {
  let sessionCalls = 0;
  let runCalls = 0;
  const client = createApiClient({ fetchFn: async (url) => {
    if (url === "/api/session") return jsonResponse(200, { token: `token-${++sessionCalls}` });
    runCalls += 1;
    return runCalls === 1 ? new Response("bad json", { status: 401 }) : jsonResponse(200, { result: { status: "AC" } });
  } });
  assert.equal((await client.getJson("/api/run", { method: "POST", body: "{}" })).result.status, "AC");
  assert.equal(sessionCalls, 2);
  assert.equal(runCalls, 2);
});

test("an invalid session token is not cached across run attempts", async () => {
  let sessions = 0;
  let runs = 0;
  const client = createApiClient({ fetchFn: async (url) => {
    if (url === "/api/session") return jsonResponse(200, { token: ++sessions === 1 ? "" : "valid" });
    runs += 1;
    return jsonResponse(200, { result: { status: "AC" } });
  } });
  await assert.rejects(() => client.getJson("/api/run", { method: "POST" }), (error) => error.kind === "protocol");
  assert.equal((await client.getJson("/api/run", { method: "POST" })).result.status, "AC");
  assert.equal(sessions, 2);
  assert.equal(runs, 1);
});

test("an actual response terminated after 200 headers keeps POST outcome unknown", async () => {
  let calls = 0;
  const receivedStatuses = [];
  const server = http.createServer((_request, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"result":');
    setTimeout(() => response.destroy(), 10);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const client = createApiClient({ fetchFn: async (url, options) => {
      const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
      receivedStatuses.push(response.status);
      return response;
    } });
    await assert.rejects(() => client.getJson("/api/assist", { method: "POST", body: "{}" }),
      (error) => error.kind === "network" && /结果未知/.test(error.userMessage));
    assert.equal(calls, 1);
    assert.deepEqual(receivedStatuses, [200]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
