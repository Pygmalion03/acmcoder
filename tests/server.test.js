import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { createAcmcoderServer, getServerHost } from "../src/server/server.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

async function requestWithHost(port, pathname, headers = {}, method = "GET", body = "") {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("unknown Host is rejected before session issuance or runner execution", async () => {
  let runs = 0;
  const server = createAcmcoderServer({ trustedHosts: [], runSubmission: async () => {
    runs += 1;
    return { status: "AC", message: "", stdout: "", stderr: "" };
  } });
  const port = await listen(server);
  try {
    for (const headers of [
      { host: "unknown.example.test" },
      { host: "localhost\\unknown.example.test" },
      { host: "unknown.example.test", origin: "http://unknown.example.test" },
      { host: "unknown.example.test", "x-forwarded-host": `127.0.0.1:${port}` },
      { host: "unknown.example.test", origin: "chrome-extension://acmcoder" },
    ]) {
      assert.equal((await requestWithHost(port, "/api/session", headers)).status, 403);
      assert.equal((await requestWithHost(port, "/api/run", {
        ...headers, "content-type": "application/json", "x-acmcoder-token": "invalid",
      }, "POST", JSON.stringify({ language: "python", code: "print(1)", runner: "local" }))).status, 403);
    }
    assert.equal(runs, 0);
  } finally { server.close(); }
});

test("local and explicitly trusted hostnames preserve same-origin and CLI requests", async () => {
  const server = createAcmcoderServer({ trustedHosts: [" Practice.Example.Test ", "*"] });
  const port = await listen(server);
  try {
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `practice.example.test:${port}`]) {
      assert.equal((await requestWithHost(port, "/api/session", { host })).status, 200);
      assert.equal((await requestWithHost(port, "/api/session", { host, origin: `http://${host}` })).status, 200);
    }
    assert.equal((await requestWithHost(port, "/api/session", { host: `127.0.0.1:${port}`, origin: "chrome-extension://acmcoder" })).status, 200);
    for (const host of [`sibling.example.test:${port}`, `evil.test:${port}`]) {
      assert.equal((await requestWithHost(port, "/api/session", { host })).status, 403);
    }
    assert.equal((await requestWithHost(port, "/api/session", { host: `localhost:${port}`, origin: "https://localhost:9999" })).status, 403);
    assert.equal((await requestWithHost(port, "/api/session", { host: `localhost:${port}`, origin: "file://localhost" })).status, 403);
  } finally { server.close(); }
});

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

function memoryPage(slug, overrides = {}) {
  return {
    source: "leetcode",
    url: `https://leetcode.cn/problems/${slug}/`,
    slug,
    frontendId: overrides.frontendId || "",
    title: overrides.title || slug,
    difficulty: overrides.difficulty || "easy",
    tags: overrides.tags || [],
    sample: overrides.sample || null,
    content: overrides.content || `content for ${slug}`,
    capturedAt: overrides.capturedAt || new Date().toISOString(),
  };
}

async function saveMemoryPage(port, page) {
  const response = await fetch(`http://127.0.0.1:${port}/api/memory/pages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(page),
  });

  assert.equal(response.status, 201);
}

async function getSessionToken(port, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, { headers });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.token, /^[A-Za-z0-9_-]{32,}$/);
  return body.token;
}

async function postRun(port, body, headers = {}) {
  const token = await getSessionToken(port);
  return fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acmcoder-token": token,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("serves problem metadata over the local API", async () => {
  const deletedProblemsFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-")), "deleted-problems.json");
  const server = createAcmcoderServer({ deletedProblemsFile });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/problems`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.problems.length, 5);
    assert.equal(body.problems[0].slug, "longest-substring-without-repeating-characters");
  } finally {
    server.close();
  }
});

test("serves one problem by slug", async () => {
  const deletedProblemsFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-")), "deleted-problems.json");
  const server = createAcmcoderServer({ deletedProblemsFile });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/problems/reverse-linked-list`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.problem.title, "反转链表");
  } finally {
    server.close();
  }
});

test("handles extension CORS preflight for memory mode", async () => {
  const server = createAcmcoderServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/memory/pages`, {
      method: "OPTIONS",
      headers: {
        origin: "chrome-extension://acmcoder",
        "access-control-request-method": "POST",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "chrome-extension://acmcoder");
    assert.equal(response.headers.get("vary"), "Origin");
  } finally {
    server.close();
  }
});

test("rejects untrusted browser origins before they can execute code", async () => {
  const calls = [];
  const server = createAcmcoderServer({
    runSubmission: async (options) => {
      calls.push(options);
      return { status: "UNKNOWN", message: "should not run", stdout: "", stderr: "" };
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: {
        origin: "https://malicious.example",
        "content-type": "text/plain",
      },
      body: JSON.stringify({ language: "python", code: "print('unsafe')", runner: "local" }),
    });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
  }
});

test("allows same-origin browser requests on a deployed hostname", async () => {
  const server = createAcmcoderServer({ trustedHosts: ["api.example.test"] });
  const port = await listen(server);

  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.get({
        hostname: "127.0.0.1",
        port,
        path: "/app.js",
        headers: {
          host: "api.example.test",
          origin: "https://api.example.test",
        },
      }, resolve);
      request.on("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"], /^text\/javascript/);
    response.resume();
  } finally {
    server.close();
  }
});

test("requires a server-issued session token before executing code", async () => {
  const calls = [];
  const server = createAcmcoderServer({
    runSubmission: async (options) => {
      calls.push(options);
      return { status: "UNKNOWN", message: "ran", stdout: "", stderr: "" };
    },
  });
  const port = await listen(server);

  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: "python", code: "print(1)", runner: "local" }),
    });
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);

    const allowed = await postRun(port, { language: "python", code: "print(1)", runner: "local" });
    assert.equal(allowed.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});

test("stores captured LeetCode page memory locally", async () => {
  const memoryFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-memory-")), "pages.jsonl");
  const currentMemoryFile = path.join(path.dirname(memoryFile), "current.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/memory/pages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "leetcode",
        url: "https://leetcode.cn/problems/two-sum/",
        slug: "two-sum",
        frontendId: "1",
        title: "两数之和",
        difficulty: "easy",
        tags: ["数组", "哈希表"],
        sample: {
          inputText: "4\n2 7 11 15\n9",
          outputText: "0 1",
        },
        content: "给定一个整数数组 nums 和一个整数 target",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.page.slug, "two-sum");

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/memory/pages?slug=two-sum`);
    const listBody = await listResponse.json();

    assert.equal(listBody.pages.length, 1);
    assert.equal(listBody.pages[0].title, "两数之和");

    const currentResponse = await fetch(`http://127.0.0.1:${port}/api/memory/current`);
    const currentBody = await currentResponse.json();

    assert.equal(currentBody.page.slug, "two-sum");
    assert.equal(currentBody.page.frontendId, "1");
    assert.deepEqual(currentBody.page.tags, ["数组", "哈希表"]);
    assert.equal(currentBody.page.difficulty, "easy");
    assert.equal(currentBody.page.sample.inputText, "4\n2 7 11 15\n9");
  } finally {
    server.close();
  }
});

test("exposes memory storage location for the extension sidebar", async () => {
  const memoryFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-memory-")), "pages.jsonl");
  const server = createAcmcoderServer({ memoryFile });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/memory/location`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.file, memoryFile);
  } finally {
    server.close();
  }
});

test("server binds to localhost by default and can be opened for Docker port publishing", () => {
  assert.equal(getServerHost({}), "127.0.0.1");
  assert.equal(getServerHost({ ACMCODER_HOST: "0.0.0.0" }), "0.0.0.0");
});

test("deletes selected memory pages in batch", async () => {
  const memoryFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-memory-")), "pages.jsonl");
  const currentMemoryFile = path.join(path.dirname(memoryFile), "current.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile });
  const port = await listen(server);

  try {
    await saveMemoryPage(port, memoryPage("alpha", { capturedAt: "2026-05-14T01:00:00.000Z" }));
    await saveMemoryPage(port, memoryPage("beta", { capturedAt: "2026-05-14T02:00:00.000Z" }));
    await saveMemoryPage(port, memoryPage("gamma", { capturedAt: "2026-05-14T03:00:00.000Z" }));

    const response = await fetch(`http://127.0.0.1:${port}/api/memory/pages`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ slugs: ["alpha", "gamma"] }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.deletedSlugs, ["alpha", "gamma"]);
    assert.equal(body.pages.length, 1);
    assert.equal(body.pages[0].slug, "beta");

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/memory/pages`);
    const listBody = await listResponse.json();
    assert.deepEqual(
      listBody.pages.map((page) => page.slug),
      ["beta"],
    );

    const currentResponse = await fetch(`http://127.0.0.1:${port}/api/memory/current`);
    const currentBody = await currentResponse.json();
    assert.equal(currentBody.page.slug, "beta");
  } finally {
    server.close();
  }
});

test("exports latest memory pages as downloadable json", async () => {
  const memoryFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-memory-")), "pages.jsonl");
  const currentMemoryFile = path.join(path.dirname(memoryFile), "current.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile });
  const port = await listen(server);

  try {
    await saveMemoryPage(port, memoryPage("alpha", { title: "older alpha", capturedAt: "2026-05-14T01:00:00.000Z" }));
    await saveMemoryPage(port, memoryPage("beta", { title: "beta", capturedAt: "2026-05-14T02:00:00.000Z" }));
    await saveMemoryPage(port, memoryPage("alpha", { title: "newer alpha", capturedAt: "2026-05-14T03:00:00.000Z" }));

    const response = await fetch(`http://127.0.0.1:${port}/api/memory/export?slugs=alpha`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") || "", /attachment/);
    assert.equal(body.format, "acmcoder-memory-v1");
    assert.equal(body.pages.length, 1);
    assert.equal(body.pages[0].slug, "alpha");
    assert.equal(body.pages[0].title, "newer alpha");
  } finally {
    server.close();
  }
});

test("deletes selected visible problems including seed and memory entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-"));
  const memoryFile = path.join(tempDir, "pages.jsonl");
  const currentMemoryFile = path.join(tempDir, "current.json");
  const deletedProblemsFile = path.join(tempDir, "deleted-problems.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile, deletedProblemsFile });
  const port = await listen(server);

  try {
    await saveMemoryPage(port, memoryPage("alpha", { capturedAt: "2026-05-14T01:00:00.000Z" }));

    const response = await fetch(`http://127.0.0.1:${port}/api/problems`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ slugs: ["reverse-linked-list", "memory:alpha"] }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.deletedSlugs, ["reverse-linked-list", "memory:alpha"]);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/problems`);
    const listBody = await listResponse.json();
    assert.equal(listBody.problems.some((problem) => problem.slug === "reverse-linked-list"), false);

    const memoryResponse = await fetch(`http://127.0.0.1:${port}/api/memory/pages`);
    const memoryBody = await memoryResponse.json();
    assert.equal(memoryBody.pages.length, 0);
  } finally {
    server.close();
  }
});

test("exports selected seed and memory problems as downloadable json", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-"));
  const memoryFile = path.join(tempDir, "pages.jsonl");
  const currentMemoryFile = path.join(tempDir, "current.json");
  const deletedProblemsFile = path.join(tempDir, "deleted-problems.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile, deletedProblemsFile });
  const port = await listen(server);

  try {
    await saveMemoryPage(port, memoryPage("alpha", { title: "alpha memory", capturedAt: "2026-05-14T01:00:00.000Z" }));

    const response = await fetch(`http://127.0.0.1:${port}/api/problems/export?slugs=reverse-linked-list,memory:alpha`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition") || "", /attachment/);
    assert.equal(body.format, "acmcoder-problems-v1");
    assert.deepEqual(
      body.problems.map((problem) => problem.slug),
      ["reverse-linked-list", "memory:alpha"],
    );
  } finally {
    server.close();
  }
});

test("imports exported problems by restoring hidden seeds and saving memory entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-"));
  const memoryFile = path.join(tempDir, "pages.jsonl");
  const currentMemoryFile = path.join(tempDir, "current.json");
  const deletedProblemsFile = path.join(tempDir, "deleted-problems.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile, deletedProblemsFile });
  const port = await listen(server);

  try {
    await fetch(`http://127.0.0.1:${port}/api/problems`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
        body: JSON.stringify({ slugs: ["reverse-linked-list"] }),
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/problems/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: "acmcoder-problems-v1",
        problems: [
          { source: "seed", slug: "reverse-linked-list" },
          {
            source: "memory",
            slug: "memory:alpha",
            frontendId: "9001",
            title: "alpha memory",
            difficulty: "medium",
            tags: ["array"],
            sample: { inputText: "1", outputText: "1" },
            leetcode: { slug: "alpha", url: "https://leetcode.cn/problems/alpha/" },
            description: "alpha content",
            rank: { updatedAt: "2026-05-14T01:00:00.000Z" },
          },
        ],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.importedCount, 2);
    assert.deepEqual(body.restoredSeedSlugs, ["reverse-linked-list"]);
    assert.deepEqual(body.importedMemorySlugs, ["alpha"]);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/problems`);
    const listBody = await listResponse.json();
    assert.equal(listBody.problems.some((problem) => problem.slug === "reverse-linked-list"), true);

    const memoryResponse = await fetch(`http://127.0.0.1:${port}/api/memory/pages?slug=alpha`);
    const memoryBody = await memoryResponse.json();
    assert.equal(memoryBody.pages.length, 1);
    assert.equal(memoryBody.pages[0].title, "alpha memory");
  } finally {
    server.close();
  }
});

test("imports legacy memory export json", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-problems-"));
  const memoryFile = path.join(tempDir, "pages.jsonl");
  const currentMemoryFile = path.join(tempDir, "current.json");
  const deletedProblemsFile = path.join(tempDir, "deleted-problems.json");
  const server = createAcmcoderServer({ memoryFile, currentMemoryFile, deletedProblemsFile });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/problems/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: "acmcoder-memory-v1",
        pages: [memoryPage("legacy", { title: "legacy memory" })],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.importedCount, 1);
    assert.deepEqual(body.importedMemorySlugs, ["legacy"]);
  } finally {
    server.close();
  }
});

test("records accepted progress through run API and exposes it to problems and memory pages", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-progress-"));
  const memoryFile = path.join(tempDir, "pages.jsonl");
  const currentMemoryFile = path.join(tempDir, "current.json");
  const deletedProblemsFile = path.join(tempDir, "deleted-problems.json");
  const progressFile = path.join(tempDir, "progress.json");
  const calls = [];
  const server = createAcmcoderServer({
    memoryFile,
    currentMemoryFile,
    deletedProblemsFile,
    progressFile,
    runSubmission: async (options) => {
      calls.push(options);
      return {
        status: "AC",
        message: "accepted",
        stdout: "",
        stderr: "",
      };
    },
  });
  const port = await listen(server);

  try {
    await saveMemoryPage(port, memoryPage("reverse-linked-list", { title: "reverse linked list memory" }));

    const firstRun = await postRun(port, {
      slug: "memory:reverse-linked-list",
      language: "python",
      code: "print(1)",
      stdin: "",
      expected: "",
      runner: "local",
    });
    const firstBody = await firstRun.json();

    const secondRun = await postRun(port, {
      slug: "reverse-linked-list",
      language: "python",
      code: "print(1)",
      stdin: "",
      expected: "",
      runner: "docker",
    });
    const secondBody = await secondRun.json();

    assert.equal(firstBody.progress.acCount, 1);
    assert.equal(secondBody.progress.acCount, 2);
    assert.deepEqual(
      calls.map((call) => call.runner),
      ["local", "docker"],
    );

    const problemsResponse = await fetch(`http://127.0.0.1:${port}/api/problems`);
    const problemsBody = await problemsResponse.json();
    assert.equal(problemsBody.problems.find((problem) => problem.slug === "reverse-linked-list").progress.acCount, 2);

    const memoryResponse = await fetch(`http://127.0.0.1:${port}/api/memory/pages?slug=reverse-linked-list`);
    const memoryBody = await memoryResponse.json();
    assert.equal(memoryBody.pages[0].progress.acCount, 2);
  } finally {
    server.close();
  }
});

test("exports and imports problem progress idempotently", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-progress-source-"));
  const sourceServer = createAcmcoderServer({
    memoryFile: path.join(sourceDir, "pages.jsonl"),
    currentMemoryFile: path.join(sourceDir, "current.json"),
    deletedProblemsFile: path.join(sourceDir, "deleted-problems.json"),
    progressFile: path.join(sourceDir, "progress.json"),
    runSubmission: async () => ({
      status: "AC",
      message: "accepted",
      stdout: "",
      stderr: "",
    }),
  });
  const sourcePort = await listen(sourceServer);
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-progress-target-"));
  const targetServer = createAcmcoderServer({
    memoryFile: path.join(targetDir, "pages.jsonl"),
    currentMemoryFile: path.join(targetDir, "current.json"),
    deletedProblemsFile: path.join(targetDir, "deleted-problems.json"),
    progressFile: path.join(targetDir, "progress.json"),
    runSubmission: async () => ({
      status: "AC",
      message: "accepted",
      stdout: "",
      stderr: "",
    }),
  });
  const targetPort = await listen(targetServer);

  try {
    for (let index = 0; index < 2; index += 1) {
      await postRun(sourcePort, { slug: "reverse-linked-list", language: "python", code: "print(1)", runner: "local" });
    }

    const exportResponse = await fetch(`http://127.0.0.1:${sourcePort}/api/problems/export?slugs=reverse-linked-list`);
    const exportBody = await exportResponse.json();
    assert.equal(exportBody.problems[0].progress.acCount, 2);

    for (let index = 0; index < 3; index += 1) {
      await postRun(targetPort, { slug: "reverse-linked-list", language: "python", code: "print(1)", runner: "local" });
    }

    const beforeImport = await fetch(`http://127.0.0.1:${targetPort}/api/problems`);
    const beforeImportBody = await beforeImport.json();
    assert.equal(beforeImportBody.problems.find((problem) => problem.slug === "reverse-linked-list").progress.acCount, 3);

    const lowerImport = await fetch(`http://127.0.0.1:${targetPort}/api/problems/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(exportBody),
    });
    const lowerBody = await lowerImport.json();
    assert.equal(lowerBody.importedProgressCount, 0);

    const afterLowerImport = await fetch(`http://127.0.0.1:${targetPort}/api/problems`);
    const afterLowerBody = await afterLowerImport.json();
    assert.equal(afterLowerBody.problems.find((problem) => problem.slug === "reverse-linked-list").progress.acCount, 3);

    exportBody.problems[0].progress.acCount = 5;
    const higherImport = await fetch(`http://127.0.0.1:${targetPort}/api/problems/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(exportBody),
    });
    const higherBody = await higherImport.json();
    assert.equal(higherBody.importedProgressCount, 1);

    const afterHigherImport = await fetch(`http://127.0.0.1:${targetPort}/api/problems`);
    const afterHigherBody = await afterHigherImport.json();
    assert.equal(afterHigherBody.problems.find((problem) => problem.slug === "reverse-linked-list").progress.acCount, 5);
  } finally {
    sourceServer.close();
    targetServer.close();
  }
});

test("passes runner mode from run API into the runner layer", async () => {
  const calls = [];
  const server = createAcmcoderServer({
    runSubmission: async (options) => {
      calls.push(options);
      return {
        status: "UNKNOWN",
        message: "captured",
        stdout: "",
        stderr: "",
      };
    },
  });
  const port = await listen(server);

  try {
    const response = await postRun(port, {
      language: "python",
      code: "print(1)",
      stdin: "",
      expected: "",
      runner: "docker",
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.result.message, "captured");
    assert.equal(calls[0].runner, "docker");
  } finally {
    server.close();
  }
});

test("stores assist settings and serves model advice through the local API", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-assist-server-"));
  const assistSettingsFile = path.join(tempDir, "settings.json");
  const calls = [];
  const server = createAcmcoderServer({
    assistSettingsFile,
    assistFetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "先补充空数组处理。" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  const port = await listen(server);

  try {
    const saveResponse = await fetch(`http://127.0.0.1:${port}/api/assist/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-local-test",
        baseUrl: "https://llm.example.test/v1",
        model: "coder-model",
      }),
    });
    const saveBody = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(saveBody.settings.configured, true);
    assert.equal(saveBody.settings.apiKey, undefined);

    const settingsResponse = await fetch(`http://127.0.0.1:${port}/api/assist/settings`);
    const settingsBody = await settingsResponse.json();
    assert.equal(settingsBody.settings.configured, true);
    assert.equal(settingsBody.settings.model, "coder-model");
    assert.equal(settingsBody.settings.apiKey, undefined);

    const adviceResponse = await fetch(`http://127.0.0.1:${port}/api/assist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        language: "python",
        code: "print(nums[0])",
        question: "怎么改？",
        status: "WA",
      }),
    });
    const adviceBody = await adviceResponse.json();

    assert.equal(adviceResponse.status, 200);
    assert.equal(adviceBody.message, "先补充空数组处理。");
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});
