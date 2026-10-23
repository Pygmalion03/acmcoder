import { spawn } from "node:child_process";

import { decodeProcessOutput } from "./encoding.js";

export const DEFAULT_TIMEOUT_MS = 3000;
export const SUBMISSION_OUTPUT_LIMIT_BYTES = 32 * 1024;

export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? Infinity;

  return new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve({ code: null, stdout: "", stderr: "", timedOut: false, cancelled: true });
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let stopped = null;
    let outputBytes = 0;

    const buildResult = (extra = {}) => ({
      code: null,
      stdout: decodeProcessOutput(stdoutChunks),
      stderr: decodeProcessOutput(stderrChunks),
      timedOut: false,
      ...extra,
    });

    function stop(reason) {
      if (settled || stopped) return;
      stopped = reason;
      if (!child.pid) return;
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => child.kill("SIGKILL"));
        killer.once("close", code => { if (code !== 0) child.kill("SIGKILL"); });
      } else {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if (error.code !== "ESRCH") child.kill("SIGKILL"); }
      }
    }
    const abort = () => stop({ cancelled: true });
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop({ timedOut: true }), timeoutMs);

    function capture(chunks, chunk) {
      if (stopped) return;
      const remaining = maxOutputBytes - outputBytes;
      const kept = remaining >= chunk.length ? chunk : chunk.subarray(0, Math.max(0, remaining));
      if (kept.length) chunks.push(kept);
      outputBytes += kept.length;
      if (chunk.length > remaining) stop({ outputLimitExceeded: true });
    }

    child.stdout.on("data", (chunk) => {
      capture(stdoutChunks, chunk);
    });

    child.stderr.on("data", (chunk) => {
      capture(stderrChunks, chunk);
    });

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      resolve(buildResult({
        stderr: error.message,
        failedToStart: true,
      }));
    });

    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      resolve(buildResult({
        code,
        ...stopped,
      }));
    });

    // A stopped process may close stdin before a pending write finishes.
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin ?? "");
  });
}
