import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUNNER, getRunner, normalizeRunner } from "../src/runner/runners.js";
import { localRunner } from "../src/runner/local-runner.js";
import { runSubmission } from "../src/runner/run.js";

test("defaults to local runner when no runner is provided", () => {
  assert.equal(DEFAULT_RUNNER, "local");
  assert.equal(normalizeRunner(undefined), "local");
  assert.equal(normalizeRunner(""), "local");
});

test("accepts local and docker runner names", () => {
  assert.equal(normalizeRunner("local"), "local");
  assert.equal(normalizeRunner("docker"), "docker");
  assert.equal(getRunner("local").name, "local");
  assert.equal(getRunner("docker").name, "docker");
});

test("rejects unsupported runner names with a clear error", () => {
  assert.throws(() => normalizeRunner("podman"), /Unsupported runner: podman/);
});

for (const language of ["python", "cpp"]) {
  test(`${language} submission reports output exhaustion during execution or compilation`, async t => {
    const controller = new AbortController();
    const execute = t.mock.method(localRunner, "execute", async (_command, options) => {
      assert.equal(options.maxOutputBytes, 32768);
      assert.equal(options.signal, controller.signal);
      return { code: null, stdout: "limited", stderr: "diagnostic", outputLimitExceeded: true };
    });
    const result = await runSubmission({ language, code: "test", signal: controller.signal });
    assert.equal(result.status, "OLE");
    assert.match(result.message, /32 KiB/);
    assert.equal(result.stdout, "limited");
    assert.equal(result.stderr, "diagnostic");
    assert.equal(execute.mock.callCount(), 1);
  });
}
