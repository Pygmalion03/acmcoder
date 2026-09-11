const GET_RETRY_DELAYS = [250, 750];

const GET_NETWORK_MESSAGE = "无法连接 ACMCoder 本地服务；请确认 WSL 已启动且本地隧道可用。";
const MUTATION_NETWORK_MESSAGE = "请求结果未知，为避免重复提交未自动重试。请检查本地服务后手动重试。";

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, details);
  }
}

export function createRetryBackoff({ minMs = 2000, maxMs = 30000 } = {}) {
  let delay = minMs;
  return {
    current: () => delay,
    success: () => (delay = minMs),
    fail: () => (delay = Math.min(maxMs, delay * 2)),
  };
}

function isAbortError(error, signal) {
  return signal?.aborted || error?.name === "AbortError";
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === "NetworkError";
}

export function createApiClient({
  fetchFn = globalThis.fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onConnectionChange = () => {},
} = {}) {
  let runTokenPromise;

  const clearRunToken = () => {
    runTokenPromise = undefined;
  };

  async function requestSession(options = {}) {
    const response = await fetchFn("/api/session", {
      method: "GET",
      ...options,
      headers: new Headers(options.headers),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(body.error || `请求失败（${response.status}）`, {
        kind: "http",
        status: response.status,
        method: "GET",
        url: "/api/session",
        userMessage: body.error || `请求失败（${response.status}）`,
      });
    }
    return body.token;
  }

  function getRunToken(options = {}) {
    if (!runTokenPromise) {
      runTokenPromise = requestSession(options).catch((error) => {
        runTokenPromise = undefined;
        throw error;
      });
    }
    return runTokenPromise;
  }

  async function getJson(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const pathname = new URL(url, "http://acmcoder.local").pathname;
    const requestOptions = { ...options, method };
    const callerSignal = options.signal;
    let refreshed = false;
    let networkAttempt = 0;

    while (true) {
      try {
        const headers = new Headers(options.headers);
        if (pathname === "/api/run") {
          headers.set("x-acmcoder-token", await getRunToken({ signal: callerSignal }));
        }
        requestOptions.headers = headers;
        const response = await fetchFn(url, requestOptions);
        const body = await response.json().catch(() => ({}));

        if (response.status === 401 && pathname === "/api/run" && !refreshed) {
          refreshed = true;
          clearRunToken();
          continue;
        }

        if (!response.ok) {
          const message = body.error || `请求失败（${response.status}）`;
          throw new ApiError(message, {
            kind: "http",
            status: response.status,
            method,
            url,
            userMessage: message,
          });
        }

        onConnectionChange({ online: true });
        return body;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isAbortError(error, callerSignal)) {
          throw new ApiError("请求已取消", {
            kind: "cancelled",
            status: undefined,
            method,
            url,
            userMessage: "请求已取消",
            cause: error,
          });
        }
        if (isNetworkError(error) && method === "GET" && networkAttempt < GET_RETRY_DELAYS.length) {
          await wait(GET_RETRY_DELAYS[networkAttempt]);
          networkAttempt += 1;
          continue;
        }
        if (isNetworkError(error)) {
          const userMessage = method === "GET" ? GET_NETWORK_MESSAGE : MUTATION_NETWORK_MESSAGE;
          const apiError = new ApiError(userMessage, {
            kind: "network",
            status: undefined,
            method,
            url,
            userMessage,
            cause: error,
          });
          onConnectionChange({ online: false, error: apiError });
          throw apiError;
        }
        throw error;
      }
    }
  }

  return {
    getJson,
    clearRunToken,
    health: () => getJson("/api/health"),
  };
}
