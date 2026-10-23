import { runProcess } from "./process.js";
import { projectRoot } from "../core/problems.js";
import { randomUUID } from "node:crypto";

export const DOCKER_IMAGE = "acmcoder-runner:local";
export const DOCKER_WORKDIR = "/workspace";

export function getDockerImage(env = process.env) {
  const image = env?.ACMCODER_DOCKER_IMAGE?.trim();
  return image || DOCKER_IMAGE;
}

export function dockerBuildCommand(image = getDockerImage()) {
  return `docker build -t ${image} .`;
}

export function buildDockerImageArgs(image = getDockerImage()) {
  return ["build", "-t", image, "."];
}

export function isDockerAutoBuildEnabled(env = process.env) {
  return String(env?.ACMCODER_DOCKER_AUTO_BUILD ?? "1") !== "0";
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeContainerPath(value) {
  return String(value).replace(/\\/g, "/");
}

export function buildShellCommand(commandSpec) {
  return [commandSpec.command, ...commandSpec.args].map(normalizeContainerPath).map(shellQuote).join(" ");
}

export function buildDockerArgs({ hostWorkdir, commandSpec, image = getDockerImage(), containerName }) {
  return [
    "run",
    "--rm",
    ...(containerName ? ["--name", containerName] : []),
    "-i",
    "--network",
    "none",
    "--cpus",
    "1",
    "--memory",
    "256m",
    "--pids-limit",
    "128",
    "-v",
    `${hostWorkdir}:${DOCKER_WORKDIR}`,
    "-w",
    DOCKER_WORKDIR,
    image,
    "bash",
    "-lc",
    buildShellCommand(commandSpec),
  ];
}

export function classifyDockerUnavailable(result, image = getDockerImage()) {
  if (result.failedToStart) {
    return {
      status: "NO_RUNNER",
      message: "Docker CLI is not available. Install Docker Desktop and make sure the docker command is on PATH.",
    };
  }

  const stderr = result.stderr || "";

  if (/Cannot connect to the Docker daemon|docker daemon is not running|error during connect|failed to connect to the docker API/i.test(stderr)) {
    return {
      status: "NO_RUNNER",
      message: "Docker daemon is not running. Start Docker Desktop and try again.",
    };
  }

  if (/Unable to find image|No such image|pull access denied|repository does not exist/i.test(stderr)) {
    return {
      status: "NO_RUNNER",
      message: `Docker runner image is missing. Run: ${dockerBuildCommand(image)}`,
    };
  }

  if (result.code === 125) {
    return {
      status: "NO_RUNNER",
      message: `Docker runner failed to start. Check Docker Desktop and the ${image} image.`,
    };
  }

  return null;
}

export function interpretDockerDoctorResult({ image = getDockerImage(), dockerResult, imageResult, env = process.env }) {
  const dockerUnavailable = classifyDockerUnavailable(dockerResult, image);
  if (dockerUnavailable) {
    return {
      ready: false,
      image,
      message: dockerUnavailable.message,
    };
  }

  if (dockerResult.code !== 0) {
    return {
      ready: false,
      image,
      message: dockerResult.stderr || "Docker runner is unavailable.",
    };
  }

  const imageUnavailable = classifyDockerUnavailable(
    imageResult || {
      code: 1,
      stderr: `No such image: ${image}`,
    },
    image,
  );

  if (imageUnavailable || imageResult.code !== 0) {
    if (isDockerAutoBuildEnabled(env)) {
      return {
        ready: true,
        image,
        message: `Docker daemon ready; image ${image} will be built automatically on first Docker run.`,
      };
    }

    return {
      ready: false,
      image,
      message: imageUnavailable?.message || `Docker runner image is missing. Run: ${dockerBuildCommand(image)}`,
    };
  }

  return {
    ready: true,
    image,
    message: `Docker daemon ready; image ${image} is available.`,
  };
}

function dockerUnavailableResult(unavailable, result = {}) {
  return {
    ...result,
    ...unavailable,
    runnerUnavailable: true,
  };
}

export async function ensureDockerImage(options = {}) {
  const image = options.image || getDockerImage(options.env);
  const runProcessFn = options.runProcess || runProcess;
  const imageResult = await runProcessFn("docker", ["image", "inspect", image], {
    timeoutMs: options.imageCheckTimeoutMs ?? 5000,
    signal: options.signal,
  });
  if (imageResult.cancelled) return { ready: false, image, result: imageResult };
  const imageUnavailable = classifyDockerUnavailable(imageResult, image);

  if (!imageUnavailable && imageResult.code === 0) {
    return { ready: true, built: false, image };
  }

  if (imageUnavailable && !/image is missing/i.test(imageUnavailable.message)) {
    return {
      ready: false,
      image,
      result: dockerUnavailableResult(imageUnavailable, imageResult),
    };
  }

  if (!isDockerAutoBuildEnabled(options.env)) {
    return {
      ready: false,
      image,
      result: dockerUnavailableResult(
        imageUnavailable || {
          status: "NO_RUNNER",
          message: `Docker runner image is missing. Run: ${dockerBuildCommand(image)}`,
        },
        imageResult,
      ),
    };
  }

  const buildResult = await runProcessFn("docker", buildDockerImageArgs(image), {
    cwd: options.cwd || projectRoot,
    timeoutMs: options.buildTimeoutMs ?? 120000,
    signal: options.signal,
  });
  if (buildResult.cancelled) return { ready: false, image, result: buildResult };
  const buildUnavailable = classifyDockerUnavailable(buildResult, image);

  if (buildUnavailable) {
    return {
      ready: false,
      image,
      result: dockerUnavailableResult(buildUnavailable, buildResult),
    };
  }

  if (buildResult.timedOut || buildResult.code !== 0) {
    return {
      ready: false,
      image,
      result: {
        ...buildResult,
        status: "NO_RUNNER",
        message: `Docker runner image build failed. Run manually to inspect the error: ${dockerBuildCommand(image)}`,
        runnerUnavailable: true,
      },
    };
  }

  return { ready: true, built: true, image };
}

export async function checkDockerRunner(options = {}) {
  const image = options.image || getDockerImage(options.env);
  const timeoutMs = options.timeoutMs ?? 5000;
  const dockerResult = await runProcess("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs });

  if (dockerResult.failedToStart || dockerResult.code !== 0) {
    return interpretDockerDoctorResult({ image, dockerResult, imageResult: null, env: options.env });
  }

  const imageResult = await runProcess("docker", ["image", "inspect", image], { timeoutMs });
  return interpretDockerDoctorResult({ image, dockerResult, imageResult, env: options.env });
}

export const dockerRunner = {
  name: "docker",

  resolveSourceFile({ toolchain }) {
    return `${DOCKER_WORKDIR}/${toolchain.entryFile}`;
  },

  resolveWorkdir() {
    return DOCKER_WORKDIR;
  },

  async execute(commandSpec, options = {}) {
    const image = options.image || getDockerImage(options.env);
    const runProcessFn = options.runProcess || runProcess;
    const imageReady = await ensureDockerImage({
      image,
      env: options.env,
      runProcess: runProcessFn,
      imageCheckTimeoutMs: options.imageCheckTimeoutMs,
      buildTimeoutMs: options.buildTimeoutMs,
      cwd: options.cwd,
      signal: options.signal,
    });

    if (!imageReady.ready) {
      return imageReady.result;
    }

    if (options.signal?.aborted) return { code: null, stdout: "", stderr: "", cancelled: true };
    const containerName = `acmcoder-run-${randomUUID()}`;
    const dockerArgs = buildDockerArgs({
      hostWorkdir: options.hostWorkdir,
      commandSpec,
      image,
      containerName,
    });
    // Finish the bounded creation request before honoring cancellation. Killing
    // `docker run` during creation can otherwise leave a container appearing
    // after the cleanup request has already reported "No such container".
    dockerArgs[0] = "create";
    dockerArgs.splice(dockerArgs.indexOf("--rm"), 1);
    const created = await runProcessFn("docker", dockerArgs, { timeoutMs: 5000 });
    let result = created;
    try {
      if (created.code === 0) {
        result = options.signal?.aborted
          ? { code: null, stdout: "", stderr: "", cancelled: true }
          : await runProcessFn("docker", ["start", "--attach", "--interactive", containerName], {
            stdin: options.stdin,
            timeoutMs: options.timeoutMs,
            maxOutputBytes: options.maxOutputBytes,
            signal: options.signal,
          });
      }
    } finally {
      if (created.code === 0 || result.cancelled || result.timedOut || result.outputLimitExceeded) {
        const cleanup = await runProcessFn("docker", ["rm", "--force", containerName], { timeoutMs: 5000 });
        if (cleanup.code !== 0 && !/No such container/i.test(cleanup.stderr || "")) {
          throw new Error("The run stopped, but Docker container cleanup failed. Check Docker before running again.");
        }
      }
    }
    if (result.cancelled || result.timedOut || result.outputLimitExceeded) return result;
    const unavailable = classifyDockerUnavailable(result, image);

    return unavailable ? dockerUnavailableResult(unavailable, result) : result;
  },
};
