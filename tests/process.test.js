import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runProcess } from "../src/runner/process.js";

test("caps combined stdout and stderr and recovers for the next process", async () => {
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write('o'.repeat(2048));process.stderr.write('e'.repeat(2048));setInterval(()=>{},1000)"], { maxOutputBytes: 3072 });
  assert.equal(result.outputLimitExceeded, true);
  assert.equal(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 3072);
  assert.equal(result.timedOut, false);
  const next = await runProcess(process.execPath, ["-e", "process.stdout.write('ready')"]);
  assert.equal(next.code, 0);
  assert.equal(next.stdout, "ready");
});

test("generic tool commands keep output beyond the submission limit", async () => {
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(65536))"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.length, 65536);
});

test("an already cancelled process never starts", async () => {
  const result = await runProcess("command-that-does-not-exist", [], { signal: AbortSignal.abort() });
  assert.equal(result.cancelled, true);
  assert.equal(result.failedToStart, undefined);
});

for (const reason of ["cancel", "timeout"]) {
  test(`${reason} stops a process and its child before returning`, { skip: process.platform === "win32" }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-process-test-"));
    const marker = path.join(directory, "child.json");
    const controller = new AbortController();
    const childCode = "setInterval(()=>{},1000)";
    const parentCode = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'});fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,child:child.pid}));setInterval(()=>{},1000);`;
    let pids;
    try {
      const running = runProcess(process.execPath, ["-e", parentCode], { signal: controller.signal, timeoutMs: reason === "timeout" ? 1000 : 5000 });
      for (let attempt = 0; attempt < 100; attempt++) {
        try { pids = JSON.parse(await fs.readFile(marker, "utf8")); break; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(pids, "the child process started");
      if (reason === "cancel") controller.abort();
      const result = await running;
      assert.equal(result[reason === "cancel" ? "cancelled" : "timedOut"], true);
      for (const pid of [pids.pid, pids.child]) {
        // Linux can retain an exited orphan briefly as a zombie until PID 1
        // reaps it; zombies cannot execute or retain open output pipes.
        if (process.platform === "linux") {
          let state = "";
          try { state = await fs.readFile(`/proc/${pid}/stat`, "utf8"); }
          catch (error) { if (error.code !== "ENOENT") throw error; }
          assert.ok(!state || /^\d+ \(.+\) Z /.test(state), `process ${pid} is not running`);
        } else {
          assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
        }
      }
    } finally {
      controller.abort();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
