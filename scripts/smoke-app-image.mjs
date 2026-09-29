import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.ACMCODER_SMOKE_URL || "http://127.0.0.1:43117";

async function fetchJson(pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json();
  assert.equal(response.ok, true, `${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function waitForDoctor() {
  let lastError;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson("/api/doctor");
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw lastError || new Error("ACMCoder did not become ready.");
}

const doctor = await waitForDoctor();
assert.equal(doctor.deployment.mode, "docker-app");

for (const language of ["java", "cpp", "python"]) {
  assert.equal(doctor.local[language].ready, true, `${language} toolchain is not ready`);
}

const recommendation = await fetchJson("/api/recommendation/catalog");
assert.ok(recommendation.catalog.entries.length > 0, "bundled recommendation catalog is empty");

const problems = await fetchJson("/api/problems");
assert.ok(problems.problems.some((problem) => problem.slug === "reverse-linked-list"), "bundled seed problems are missing");

const { token } = await fetchJson("/api/session");
const cases = [
  {
    language: "java",
    code: 'public class Main { public static void main(String[] args) { System.out.println("smoke"); } }',
  },
  {
    language: "cpp",
    code: '#include <iostream>\nint main() { std::cout << "smoke\\n"; }',
  },
  {
    language: "python",
    code: 'print("smoke")',
  },
];

for (const testCase of cases) {
  const body = await fetchJson("/api/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acmcoder-token": token,
    },
    body: JSON.stringify({
      ...testCase,
      expected: "smoke\n",
      runner: "local",
      timeoutMs: 10000,
    }),
  });
  assert.equal(body.result.status, "AC", `${testCase.language} smoke failed: ${JSON.stringify(body.result)}`);
}

console.log("ACMCoder app image smoke test passed for Java, C++, and Python.");
