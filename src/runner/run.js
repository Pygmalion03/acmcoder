import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { compareOutput } from "../core/output.js";
import { findProblem, resolveProjectPath } from "../core/problems.js";
import { DEFAULT_TIMEOUT_MS } from "./process.js";
import { getRunner } from "./runners.js";
import { getToolchain } from "./toolchains.js";

async function prepareSource({ toolchain, file, code, workdir }) {
  const sourceFile = path.join(workdir, toolchain.entryFile);

  if (code !== undefined) {
    await fs.writeFile(sourceFile, String(code), "utf8");
    return sourceFile;
  }

  if (!file) {
    throw new Error("A source file or code string is required.");
  }

  await fs.copyFile(path.resolve(file), sourceFile);
  return sourceFile;
}

export async function runSubmission(options) {
  const toolchain = getToolchain(options.language);
  const runner = getRunner(options.runner);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "acmcoder-"));

  try {
    const sourceFile = await prepareSource({
      toolchain,
      file: options.file,
      code: options.code,
      workdir,
    });
    const executionSourceFile = runner.resolveSourceFile({ sourceFile, workdir, toolchain });
    const executionWorkdir = runner.resolveWorkdir({ sourceFile, workdir, toolchain });

    if (toolchain.compile) {
      const compileCommand = toolchain.compile({ sourceFile: executionSourceFile, workdir: executionWorkdir });
      const compileResult = await runner.execute(compileCommand, {
        hostWorkdir: workdir,
        stdin: "",
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: options.signal,
      });

      if(compileResult.cancelled)return {status:'CANCELLED',stdout:compileResult.stdout,stderr:''};

      if (compileResult.runnerUnavailable) {
        return {
          status: "NO_RUNNER",
          message: compileResult.message,
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
        };
      }

      if (compileResult.failedToStart) {
        return {
          status: "NO_TOOLCHAIN",
          message: `Cannot start ${compileCommand.command}. Is the toolchain installed?`,
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
        };
      }

      if (compileResult.timedOut) {
        return {
          status: "TLE",
          message: "Compilation timed out.",
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
        };
      }

      if (compileResult.code !== 0) {
        return {
          status: "CE",
          message: "Compilation failed.",
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
        };
      }
    }

    const runCommand = toolchain.run({ sourceFile: executionSourceFile, workdir: executionWorkdir });
    const runResult = await runner.execute(runCommand, {
      hostWorkdir: workdir,
      stdin: options.stdin ?? "",
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: options.signal,
    });

    if(runResult.cancelled)return {status:'CANCELLED',stdout:runResult.stdout,stderr:''};

    if (runResult.runnerUnavailable) {
      return {
        status: "NO_RUNNER",
        message: runResult.message,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    }

    if (runResult.failedToStart) {
      return {
        status: "NO_TOOLCHAIN",
        message: `Cannot start ${runCommand.command}. Is the toolchain installed?`,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    }

    if (runResult.timedOut) {
      return {
        status: "TLE",
        message: "Execution timed out.",
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    }

    if (runResult.code !== 0) {
      return {
        status: "RE",
        message: `Runtime error. Exit code: ${runResult.code}`,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    }

    if (options.expected !== undefined && options.expected !== null && String(options.expected).length > 0) {
      const comparison = compareOutput(runResult.stdout, options.expected);
      return {
        ...comparison,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    }

    return {
      status: "UNKNOWN",
      message: "Finished without expected output.",
      stdout: runResult.stdout,
      stderr: runResult.stderr,
    };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

export async function runProblemCases({ slug, language, file, code, runner, timeoutMs }) {
  const problem = findProblem(slug);
  const results = [];

  for (const [index, testCase] of problem.cases.entries()) {
    const stdin = await fs.readFile(resolveProjectPath(testCase.input), "utf8");
    const expected = await fs.readFile(resolveProjectPath(testCase.output), "utf8");
    const result = await runSubmission({
      language,
      file,
      code,
      stdin,
      expected,
      runner,
      timeoutMs,
    });

    results.push({
      index: index + 1,
      name: testCase.name,
      ...result,
    });
  }

  return results;
}
