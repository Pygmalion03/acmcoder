import { spawn } from "node:child_process";

import { decodeProcessOutput } from "./encoding.js";

export const DEFAULT_TIMEOUT_MS = 3000;

export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      signal: options.signal,
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    const buildResult = (extra = {}) => ({
      code: null,
      stdout: decodeProcessOutput(stdoutChunks),
      stderr: decodeProcessOutput(stderrChunks),
      timedOut: false,
      ...extra,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve(buildResult({ timedOut: true }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buildResult({
        stderr: error.message,
        failedToStart: error.name !== 'AbortError',
        cancelled: error.name === 'AbortError',
      }));
    });

    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buildResult({
        code,
        timedOut: false,
      }));
    });

    child.stdin.end(options.stdin ?? "");
  });
}
