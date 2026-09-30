import { runProcess } from "./process.js";

export const localRunner = {
  name: "local",

  resolveSourceFile({ sourceFile }) {
    return sourceFile;
  },

  resolveWorkdir({ workdir }) {
    return workdir;
  },

  async execute(commandSpec, options = {}) {
    return runProcess(commandSpec.command, commandSpec.args, {
      cwd: options.hostWorkdir,
      stdin: options.stdin,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
  },
};
