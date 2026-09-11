import { hydrateIcons, iconMarkup } from "./icons.js";
import { createApiClient, createRetryBackoff } from "./api-client.js";
import { createStartupRecovery } from "./startup-recovery.js";
import {
  appendAiMessage,
  loadPracticeSession,
  practiceSessionKey,
  savePracticeSession,
  updatePracticeWorkspace,
} from "./practice-session.js";
import {
  canonicalProblemSlug,
  dailyPlanProgress,
  apiRunnerForUiMode,
  isStaleLeetCodeSampleCache,
  memoryPagesVersion,
  mergeMemoryProblems,
  nextCatalogSelection,
  normalizeUtilityTab,
  normalizeView,
  problemIdentity,
  sampleIoForProblem,
  uiRunnerForApiRecommendation,
} from "./view-state.js";

const state = {
  problems: [],
  selected: null,
  memoryPagesVersion: "",
  selectionMode: false,
  selectedProblemIds: new Set(),
  environment: null,
  runnerUserConfigured: false,
  dailyPlan: null,
  catalog: [],
  catalogSelectionMode: false,
  selectedCatalogSlugs: new Set(),
  activeView: "today",
  activeUtilityTab: "test",
  mobilePracticeTab: "code",
  problemInspectorOpen: true,
  mobileMoreOpen: false,
};

const CACHE_KEYS = {
  selected: "acmcoder.web.selected",
  language: "acmcoder.web.language",
  runner: "acmcoder.web.runner",
};

let currentPracticeSession = null;
let assistRequestId = 0;
let assistAbortController = null;

const GENERIC_TEMPLATES = {
  python: `import sys


def main():
    data = sys.stdin.read()
    # TODO: parse stdin and print the answer


if __name__ == "__main__":
    main()
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: read input and print the answer
    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // TODO: parse stdin and print the answer
    string line;
    getline(cin, line);
    return 0;
}
`,
};

const elements = {
  appViews: [...document.querySelectorAll("[data-view]")],
  viewTargets: [...document.querySelectorAll("[data-view-target]")],
  utilityTabs: [...document.querySelectorAll("[data-utility-tab]")],
  utilityPanels: [...document.querySelectorAll("[data-utility-panel]")],
  mobilePracticeTabs: [...document.querySelectorAll("[data-mobile-practice-tab]")],
  mobilePracticePanels: [...document.querySelectorAll("[data-mobile-practice-panel]")],
  mobileMoreToggle: document.querySelector("#mobile-more-toggle"),
  mobileMoreMenu: document.querySelector("#mobile-more-menu"),
  globalSearch: document.querySelector("#global-search"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionMessage: document.querySelector("#connection-message"),
  retryConnection: document.querySelector("#retry-connection"),
  currentDate: document.querySelector("#current-date"),
  libraryCount: document.querySelector("#library-count"),
  navRunnerHealth: document.querySelector("#nav-runner-health"),
  search: document.querySelector("#search"),
  list: document.querySelector("#problem-list"),
  selectProblems: document.querySelector("#select-problems"),
  deleteProblems: document.querySelector("#delete-problems"),
  exportProblems: document.querySelector("#export-problems"),
  importProblems: document.querySelector("#import-problems"),
  importFile: document.querySelector("#import-file"),
  title: document.querySelector("#problem-title"),
  eyebrow: document.querySelector("#eyebrow"),
  difficulty: document.querySelector("#problem-difficulty"),
  tags: document.querySelector("#problem-tags"),
  progress: document.querySelector("#problem-progress"),
  link: document.querySelector("#leetcode-link"),
  description: document.querySelector("#problem-description"),
  language: document.querySelector("#language"),
  runner: document.querySelector("#runner"),
  runnerHealth: document.querySelector("#runner-health"),
  loadTemplate: document.querySelector("#load-template"),
  run: document.querySelector("#run"),
  codeEditor: document.querySelector("#code-editor"),
  lineNumbers: document.querySelector("#line-numbers"),
  code: document.querySelector("#code"),
  highlight: document.querySelector("#code-highlight code"),
  stdin: document.querySelector("#stdin"),
  expected: document.querySelector("#expected"),
  sampleIo: document.querySelector("#sample-io"),
  sampleIoNote: document.querySelector("#sample-io-note"),
  clearExpected: document.querySelector("#clear-expected"),
  status: document.querySelector("#status"),
  message: document.querySelector("#message"),
  stdout: document.querySelector("#stdout"),
  stderr: document.querySelector("#stderr"),
  assistKey: document.querySelector("#assist-key"),
  assistBaseUrl: document.querySelector("#assist-base-url"),
  assistModel: document.querySelector("#assist-model"),
  saveAssistSettings: document.querySelector("#save-assist-settings"),
  assistQuestion: document.querySelector("#assist-question"),
  askAssist: document.querySelector("#ask-assist"),
  assistTranscript: document.querySelector("#assist-transcript"),
  assistStatus: document.querySelector("#assist-status"),
  cancelAssist: document.querySelector("#cancel-assist"),
  dailyCount: document.querySelector("#daily-count"),
  dailyDifficulty: document.querySelector("#daily-difficulty"),
  dailyTags: document.querySelector("#daily-tags"),
  generateDaily: document.querySelector("#generate-daily"),
  importCatalog: document.querySelector("#import-catalog"),
  catalogFile: document.querySelector("#catalog-file"),
  dailyStatus: document.querySelector("#daily-status"),
  dailyList: document.querySelector("#daily-list"),
  catalogImport: document.querySelector("#catalog-import"),
  catalogExport: document.querySelector("#catalog-export"),
  catalogSelect: document.querySelector("#catalog-select"),
  catalogSelectAll: document.querySelector("#catalog-select-all"),
  catalogDelete: document.querySelector("#catalog-delete"),
  catalogStatus: document.querySelector("#catalog-status"),
  catalogList: document.querySelector("#catalog-list"),
  settingsImportProblems: document.querySelector("#settings-import-problems"),
  settingsExportProblems: document.querySelector("#settings-export-problems"),
  dailyPlanSource: document.querySelector("#daily-plan-source"),
  dailyProgressCount: document.querySelector("#daily-progress-count"),
  dailyProgressBar: document.querySelector("#daily-progress-bar"),
  dailySession: document.querySelector("#daily-session"),
  problemInspector: document.querySelector("#problem-inspector"),
  toggleProblemInspector: document.querySelector("#toggle-problem-inspector"),
};

const keywords = {
  python: [
    "and",
    "as",
    "assert",
    "break",
    "class",
    "continue",
    "def",
    "elif",
    "else",
    "except",
    "False",
    "finally",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "None",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "True",
    "try",
    "while",
    "with",
  ],
  java: [
    "boolean",
    "break",
    "case",
    "catch",
    "class",
    "continue",
    "else",
    "false",
    "final",
    "for",
    "if",
    "import",
    "int",
    "long",
    "new",
    "private",
    "public",
    "return",
    "static",
    "String",
    "true",
    "void",
    "while",
  ],
  cpp: [
    "auto",
    "bool",
    "break",
    "case",
    "class",
    "const",
    "continue",
    "else",
    "false",
    "for",
    "if",
    "include",
    "int",
    "long",
    "namespace",
    "return",
    "string",
    "true",
    "using",
    "vector",
    "void",
    "while",
  ],
};

const types = new Set([
  "ArrayDeque",
  "BufferedReader",
  "Deque",
  "HashMap",
  "InputStreamReader",
  "Map",
  "Scanner",
  "System",
  "bits",
  "std",
  "sys",
]);

const BRACKET_PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}",
};

const CLOSING_BRACKETS = Object.fromEntries(Object.entries(BRACKET_PAIRS).map(([open, close]) => [close, open]));

function renderConnectionState(online, error) {
  if (online) {
    if (!startupRecovery.isReady()) {
      return;
    }
    elements.connectionStatus.hidden = true;
    elements.connectionMessage.textContent = "";
    return;
  }

  elements.connectionMessage.textContent = error?.userMessage || "本地服务暂时不可用，请重试连接。";
  elements.connectionStatus.hidden = false;
}

const apiClient = createApiClient({
  onConnectionChange: ({ online, error }) => renderConnectionState(online, error),
});
const getJson = apiClient.getJson;
const memorySyncBackoff = createRetryBackoff({ minMs: 2000, maxMs: 30000 });
let memorySyncTimer;
let applicationControlsWired = false;

function clearMemorySyncTimer() {
  if (memorySyncTimer !== undefined) {
    clearTimeout(memorySyncTimer);
    memorySyncTimer = undefined;
  }
}

async function runScheduledMemorySync() {
  if (document.hidden) {
    return;
  }

  try {
    await syncMemoryPages();
    memorySyncBackoff.success();
  } catch {
    memorySyncBackoff.fail();
  }
  scheduleMemorySync();
}

function scheduleMemorySync({ immediate = false } = {}) {
  clearMemorySyncTimer();
  if (document.hidden) {
    return;
  }
  if (immediate) {
    void runScheduledMemorySync();
    return;
  }

  memorySyncTimer = setTimeout(() => {
    memorySyncTimer = undefined;
    void runScheduledMemorySync();
  }, memorySyncBackoff.current());
}

async function retryConnection() {
  try {
    await startupRecovery.retry(async () => {
      await apiClient.health();
      await loadDoctor();
      await syncMemoryPages({ force: true });
      memorySyncBackoff.success();
      scheduleMemorySync();
    });
  } catch {
    // The shared API client has already rendered a safe connection message.
  }
}

function wireStartupControls() {
  hydrateIcons();
  elements.currentDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
  setActiveView("today");
  setUtilityTab("test");
  setMobilePracticeTab("code");
  setProblemInspectorOpen(true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearMemorySyncTimer();
      return;
    }
    scheduleMemorySync({ immediate: true });
  });
  elements.retryConnection.addEventListener("click", () => {
    retryConnection();
  });
  scheduleMemorySync();
}

function currentToolchainStatus() {
  return state.environment?.local?.[elements.language.value] || null;
}

function currentRunnerRecommendation() {
  return uiRunnerForApiRecommendation(
    state.environment?.recommendedRunnerByLanguage?.[elements.language.value] || "",
    state.environment?.deployment?.mode,
  );
}

function isDockerAppDeployment() {
  return state.environment?.deployment?.mode === "docker-app";
}

function runnerLabel(runner) {
  if (runner === "builtin") {
    return "内置环境";
  }
  if (runner === "docker") {
    return "Docker runner";
  }
  return "本机环境";
}

function setRunnerHealth(message, kind = "") {
  elements.runnerHealth.textContent = message;
  elements.runnerHealth.className = `runner-health ${kind}`.trim();
  elements.navRunnerHealth.textContent = message;
  elements.navRunnerHealth.className = `nav-health ${kind}`.trim();
}

function updateRunnerModeOptions() {
  const localOption = elements.runner.querySelector('option[value="local"]');
  const builtinOption = elements.runner.querySelector('option[value="builtin"]');
  const dockerOption = elements.runner.querySelector('option[value="docker"]');
  const dockerApp = isDockerAppDeployment();
  const localReady = Boolean(currentToolchainStatus()?.ready);

  if (localOption) {
    localOption.disabled = dockerApp || !localReady;
  }
  if (builtinOption) {
    builtinOption.disabled = !dockerApp || !localReady;
  }
  if (dockerOption) {
    dockerOption.disabled = dockerApp || !state.environment?.docker?.ready;
  }

  const currentOption = elements.runner.selectedOptions[0];
  if (!currentOption || currentOption.disabled) {
    const recommended = currentRunnerRecommendation();
    const recommendedOption = elements.runner.querySelector(`option[value="${recommended}"]`);
    const fallback = [...elements.runner.options].find((option) => !option.disabled);
    elements.runner.value = recommendedOption && !recommendedOption.disabled ? recommended : fallback?.value || "";
  }
}

function renderRunnerHealth() {
  if (!state.environment) {
    setRunnerHealth("尚未检测运行环境。");
    return;
  }

  const local = currentToolchainStatus();
  const docker = state.environment.docker;
  const runner = elements.runner.value;
  const recommendation = currentRunnerRecommendation();
  const suffix = recommendation && recommendation !== runner ? ` 推荐：${runnerLabel(recommendation)}。` : "";

  if (runner === "builtin") {
    const message = local?.ready
      ? `当前运行在 Docker app 容器中，${local.label} 已由内置环境提供；请使用“内置环境”运行代码。`
      : `当前运行在 Docker app 容器中，但内置环境缺少 ${local?.label || "当前语言"}。`;
    setRunnerHealth(message, local?.ready ? "ok" : "warn");
    return;
  }

  if (runner === "docker") {
    setRunnerHealth(docker.ready ? `Docker 可用。${docker.message}` : `Docker 不可用：${docker.message}`, docker.ready ? "ok" : "warn");
    return;
  }

  if (local?.ready) {
    setRunnerHealth(`${local.label} 本地环境可用。${suffix}`, "ok");
    return;
  }

  const missingCommands = local?.missingCommands?.join(", ") || "对应工具链";
  const dockerHint = docker?.ready ? "可以切换 Docker。" : "Docker 当前也不可用。";
  setRunnerHealth(`Local 缺少 ${missingCommands}；${dockerHint}${suffix}`, "warn");
}

function applyRecommendedRunnerIfNeeded() {
  if (state.runnerUserConfigured) {
    return;
  }

  const recommendedRunner = currentRunnerRecommendation();
  if (recommendedRunner && recommendedRunner !== elements.runner.value) {
    elements.runner.value = recommendedRunner;
  }
}

async function loadDoctor(options = {}) {
  try {
    state.environment = await getJson("/api/doctor");
    updateRunnerModeOptions();
    if (options.applyDefault) {
      applyRecommendedRunnerIfNeeded();
    }
    renderRunnerHealth();
  } catch (error) {
    setRunnerHealth(`环境检测失败：${error.message}`, "warn");
  }
}

function setAssistStatus(message, kind = "") {
  elements.assistStatus.textContent = message;
  elements.assistStatus.className = `assist-status ${kind}`.trim();
}

function renderAssistConversation(session = currentPracticeSession) {
  elements.assistTranscript.replaceChildren();
  for (const message of session?.ai?.current || []) {
    const messageNode = document.createElement("article");
    messageNode.className = `assist-message ${message.role}`;
    messageNode.textContent = message.content;
    elements.assistTranscript.appendChild(messageNode);
  }
}

function practiceSessionIdentity() {
  return {
    problemSlug: canonicalProblemSlug(state.selected),
    language: elements.language.value,
  };
}

function legacyWorkspaceCacheKey(problem = state.selected) {
  return problem ? `acmcoder.web.problem.${problem.slug}.${elements.language.value}` : "";
}

function storageItem(key) {
  try {
    return key ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function loadCurrentPracticeSession() {
  if (!state.selected) {
    currentPracticeSession = null;
    return null;
  }

  const identity = practiceSessionIdentity();
  currentPracticeSession = loadPracticeSession(localStorage, {
    ...identity,
    legacyKey: legacyWorkspaceCacheKey(),
  });
  return currentPracticeSession;
}

function persistCurrentPracticeSession() {
  if (!state.selected || !currentPracticeSession) {
    return { saved: true };
  }

  const result = savePracticeSession(localStorage, practiceSessionIdentity(), currentPracticeSession);
  if (!result.saved) {
    setAssistStatus("本轮内容暂时无法保存到浏览器", "error");
  }
  return result;
}

function applyPracticeSession(session) {
  currentPracticeSession = session;
  elements.code.value = session.code;
  elements.stdin.value = session.stdin;
  elements.expected.value = session.expected;
  if (session.lastResult) {
    setResult(session.lastResult);
  } else {
    setResult({ status: "IDLE", message: "", stdout: "", stderr: "" });
  }
  syncHighlight();
  renderAssistConversation(session);
}

async function loadAssistSettings() {
  const body = await getJson("/api/assist/settings");
  elements.assistBaseUrl.value = body.settings?.baseUrl || "";
  elements.assistModel.value = body.settings?.model || "";
  elements.assistKey.placeholder = body.settings?.configured
    ? "已保存；留空则保留当前 Key"
    : "只保存在本机 data/memory/settings.json";
}

async function saveAssistSettings() {
  const payload = {
    baseUrl: elements.assistBaseUrl.value,
    model: elements.assistModel.value,
  };
  const apiKey = elements.assistKey.value.trim();
  if (apiKey) {
    payload.apiKey = apiKey;
  }

  const body = await getJson("/api/assist/settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  elements.assistKey.value = "";
  elements.assistKey.placeholder = body.settings?.configured ? "已保存；留空则保留当前 Key" : "只保存在本机 data/memory/settings.json";
  setAssistStatus("模型设置已保存。", "ok");
}

function completedAssistHistory(session) {
  const messages = session?.ai?.current || [];
  const completeLength = messages.at(-1)?.role === "user" ? messages.length - 1 : messages.length;
  return messages.slice(0, completeLength).map(({ role, content }) => ({ role, content }));
}

function replacePendingUserQuestion(session) {
  if (session?.ai?.current?.at(-1)?.role !== "user") {
    return session;
  }
  return {
    ...session,
    ai: { ...session.ai, current: session.ai.current.slice(0, -1) },
  };
}

function isCurrentAssistRequest(requestId, requestProblemSlug) {
  return requestId === assistRequestId && requestProblemSlug === state.selected?.slug;
}

function cancelAssist() {
  assistAbortController?.abort();
}

function invalidateAssistRequest() {
  assistRequestId += 1;
  assistAbortController?.abort();
  assistAbortController = null;
  elements.askAssist.disabled = false;
  elements.cancelAssist.hidden = true;
}

async function askAssist() {
  const question = elements.assistQuestion.value.trim();
  if (!question || !state.selected) {
    setAssistStatus("请输入想问模型的问题。", "error");
    return;
  }

  assistAbortController?.abort();
  const requestProblemSlug = state.selected.slug;
  const requestId = ++assistRequestId;
  const session = currentPracticeSession || loadCurrentPracticeSession();
  const history = completedAssistHistory(session);
  currentPracticeSession = appendAiMessage(replacePendingUserQuestion(session), {
    role: "user",
    content: question,
    createdAt: new Date().toISOString(),
  });
  const userSave = persistCurrentPracticeSession();
  elements.assistQuestion.value = "";
  renderAssistConversation(currentPracticeSession);

  assistAbortController = new AbortController();
  elements.askAssist.disabled = true;
  elements.cancelAssist.hidden = false;
  if (userSave.saved) {
    setAssistStatus("正在请求模型...");
  }

  try {
    const body = await getJson("/api/assist", {
      method: "POST",
      signal: assistAbortController.signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        problemTitle: state.selected?.title,
        problemDescription: state.selected?.description,
        language: elements.language.value,
        code: elements.code.value,
        stdin: elements.stdin.value,
        expected: elements.expected.value,
        status: elements.status.textContent,
        stdout: elements.stdout.textContent,
        stderr: elements.stderr.textContent,
        history,
        question,
      }),
    });
    if (requestId !== assistRequestId || requestProblemSlug !== state.selected?.slug) {
      return;
    }
    currentPracticeSession = appendAiMessage(currentPracticeSession, {
      role: "assistant",
      content: body.message || "模型没有返回建议。",
      createdAt: new Date().toISOString(),
    });
    const assistantSave = persistCurrentPracticeSession();
    renderAssistConversation(currentPracticeSession);
    if (assistantSave.saved) {
      setAssistStatus("", "ok");
    }
  } catch (error) {
    if (!isCurrentAssistRequest(requestId, requestProblemSlug)) {
      return;
    }
    elements.assistQuestion.value = question;
    setAssistStatus(error?.kind === "cancelled" || assistAbortController?.signal.aborted ? "已取消本次 AI 请求。" : error.message, "error");
  } finally {
    if (isCurrentAssistRequest(requestId, requestProblemSlug)) {
      elements.askAssist.disabled = false;
      elements.cancelAssist.hidden = true;
      assistAbortController = null;
    }
  }
}

function saveWorkspaceCache() {
  if (!state.selected) return;

  try {
    localStorage.setItem(CACHE_KEYS.selected, state.selected.slug);
    localStorage.setItem(CACHE_KEYS.language, elements.language.value);
  } catch {
    setAssistStatus("本轮内容暂时无法保存到浏览器", "error");
  }
  currentPracticeSession = updatePracticeWorkspace(currentPracticeSession || loadCurrentPracticeSession(), {
    code: elements.code.value,
    stdin: elements.stdin.value,
    expected: elements.expected.value,
    lastResult: currentPracticeSession?.lastResult || null,
  });
  persistCurrentPracticeSession();
}

function restoreWorkspaceCache() {
  if (!state.selected) return false;

  const identity = practiceSessionIdentity();
  const hasSavedSession = Boolean(storageItem(practiceSessionKey(identity.problemSlug, identity.language)) || storageItem(legacyWorkspaceCacheKey()));
  const session = loadCurrentPracticeSession();
  if (hasSavedSession) {
    applyPracticeSession(session);
  } else {
    renderAssistConversation(session);
  }
  return hasSavedSession;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function classifyToken(token, language) {
  if (/^(\/\/|\/\*|#)/.test(token)) return "tok-comment";
  if (/^["']/.test(token)) return "tok-string";
  if (/^\d/.test(token)) return "tok-number";
  if (types.has(token)) return "tok-type";
  if (keywords[language]?.includes(token)) return "tok-keyword";
  return "";
}

function wrapHighlightedSegment(text, className, startIndex, bracketMatch) {
  if (!text) {
    return "";
  }

  let result = "";
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!bracketMatch.has(startIndex + index)) {
      continue;
    }

    if (index > cursor) {
      const chunk = escapeHtml(text.slice(cursor, index));
      result += className ? `<span class="${className}">${chunk}</span>` : chunk;
    }

    const classes = [className, "bracket-match"].filter(Boolean).join(" ");
    result += `<span class="${classes}">${escapeHtml(text[index])}</span>`;
    cursor = index + 1;
  }

  if (cursor < text.length) {
    const chunk = escapeHtml(text.slice(cursor));
    result += className ? `<span class="${className}">${chunk}</span>` : chunk;
  }

  return result;
}

function highlightCode(code, language, bracketMatch = new Set()) {
  const wordPattern = keywords[language]?.join("|") || "";
  const common = wordPattern ? `${wordPattern}|${[...types].join("|")}` : [...types].join("|");
  const expression =
    language === "python"
      ? new RegExp(`#.*|"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\b(?:${common})\\b|\\b\\d+(?:\\.\\d+)?\\b`, "g")
      : new RegExp(`//.*|/\\*[\\s\\S]*?\\*/|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\b(?:${common})\\b|\\b\\d+(?:\\.\\d+)?\\b`, "g");

  let result = "";
  let cursor = 0;
  for (const match of code.matchAll(expression)) {
    const token = match[0];
    const index = match.index;
    const className = classifyToken(token, language);
    result += wrapHighlightedSegment(code.slice(cursor, index), "", cursor, bracketMatch);
    result += wrapHighlightedSegment(token, className, index, bracketMatch);
    cursor = index + token.length;
  }
  result += wrapHighlightedSegment(code.slice(cursor), "", cursor, bracketMatch);
  return result || "\n";
}

function findSelectedBracketIndex(value, selectionStart, selectionEnd) {
  if (selectionEnd - selectionStart === 1 && (BRACKET_PAIRS[value[selectionStart]] || CLOSING_BRACKETS[value[selectionStart]])) {
    return selectionStart;
  }

  if (selectionStart !== selectionEnd) {
    return -1;
  }

  if (BRACKET_PAIRS[value[selectionStart]] || CLOSING_BRACKETS[value[selectionStart]]) {
    return selectionStart;
  }

  const previous = selectionStart - 1;
  if (previous >= 0 && (BRACKET_PAIRS[value[previous]] || CLOSING_BRACKETS[value[previous]])) {
    return previous;
  }

  return -1;
}

function findMatchingBracket(value, bracketIndex) {
  const bracket = value[bracketIndex];
  const closing = BRACKET_PAIRS[bracket];
  const opening = CLOSING_BRACKETS[bracket];

  if (closing) {
    let depth = 0;
    for (let index = bracketIndex; index < value.length; index += 1) {
      if (value[index] === bracket) depth += 1;
      if (value[index] === closing) depth -= 1;
      if (depth === 0) return index;
    }
  }

  if (opening) {
    let depth = 0;
    for (let index = bracketIndex; index >= 0; index -= 1) {
      if (value[index] === bracket) depth += 1;
      if (value[index] === opening) depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function getBracketMatch(value, selectionStart, selectionEnd) {
  const bracketIndex = findSelectedBracketIndex(value, selectionStart, selectionEnd);
  if (bracketIndex < 0) {
    return new Set();
  }

  const matchingIndex = findMatchingBracket(value, bracketIndex);
  return new Set(matchingIndex >= 0 ? [bracketIndex, matchingIndex] : [bracketIndex]);
}

function syncHighlight() {
  const bracketMatch = getBracketMatch(elements.code.value, elements.code.selectionStart, elements.code.selectionEnd);
  elements.highlight.innerHTML = highlightCode(elements.code.value, elements.language.value, bracketMatch);
  elements.highlight.parentElement.scrollTop = elements.code.scrollTop;
  elements.highlight.parentElement.scrollLeft = elements.code.scrollLeft;
  syncLineNumbers();
}

function syncLineNumbers() {
  const lineCount = Math.max(1, elements.code.value.split("\n").length);
  const nextValue = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
  if (elements.lineNumbers.textContent !== nextValue) {
    elements.lineNumbers.textContent = nextValue;
  }
  elements.lineNumbers.scrollTop = elements.code.scrollTop;
}

function replaceSelection(nextText, selectionOffset = nextText.length) {
  const start = elements.code.selectionStart;
  const end = elements.code.selectionEnd;
  const value = elements.code.value;
  elements.code.value = value.slice(0, start) + nextText + value.slice(end);
  const cursor = start + selectionOffset;
  elements.code.setSelectionRange(cursor, cursor);
  syncHighlight();
}

function indentSelection(outdent = false) {
  const value = elements.code.value;
  const start = elements.code.selectionStart;
  const end = elements.code.selectionEnd;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selected = value.slice(lineStart, end);
  const lines = selected.split("\n");
  const changed = lines
    .map((line) => {
      if (!outdent) return `    ${line}`;
      if (line.startsWith("    ")) return line.slice(4);
      if (line.startsWith("\t")) return line.slice(1);
      return line;
    })
    .join("\n");
  elements.code.value = value.slice(0, lineStart) + changed + value.slice(end);
  const delta = changed.length - selected.length;
  elements.code.setSelectionRange(Math.max(lineStart, start + (outdent ? Math.min(0, delta) : 4)), end + delta);
  syncHighlight();
}

function handleEditorKeydown(event) {
  const pairs = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
  };
  const closingPairs = {
    ")": "(",
    "]": "[",
    "}": "{",
    '"': '"',
    "'": "'",
  };
  const isPlainKey = !event.ctrlKey && !event.metaKey && !event.altKey;

  if (event.key === "Tab") {
    event.preventDefault();
    indentSelection(event.shiftKey);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const value = elements.code.value;
    const start = elements.code.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const line = value.slice(lineStart, start);
    const baseIndent = line.match(/^\s*/)[0];
    const extraIndent = /[{(:]\s*$/.test(line) ? "    " : "";
    const nextChar = value[start];

    if (nextChar === "}" && extraIndent) {
      replaceSelection(`\n${baseIndent}${extraIndent}\n${baseIndent}`, 1 + baseIndent.length + extraIndent.length);
    } else {
      replaceSelection(`\n${baseIndent}${extraIndent}`);
    }
    return;
  }

  if (
    closingPairs[event.key] &&
    isPlainKey &&
    elements.code.selectionStart === elements.code.selectionEnd &&
    elements.code.value[elements.code.selectionStart] === event.key
  ) {
    event.preventDefault();
    elements.code.setSelectionRange(elements.code.selectionStart + 1, elements.code.selectionStart + 1);
    syncHighlight();
    return;
  }

  if (pairs[event.key] && isPlainKey) {
    event.preventDefault();
    const start = elements.code.selectionStart;
    const end = elements.code.selectionEnd;
    const selected = elements.code.value.slice(start, end);
    replaceSelection(`${event.key}${selected}${pairs[event.key]}`, selected ? selected.length + 2 : 1);
  }
}

function handleEditorBeforeInput(event) {
  const closingPairs = {
    ")": "(",
    "]": "[",
    "}": "{",
    '"': '"',
    "'": "'",
  };

  if (
    event.inputType === "insertText" &&
    closingPairs[event.data] &&
    elements.code.selectionStart === elements.code.selectionEnd &&
    elements.code.value[elements.code.selectionStart] === event.data
  ) {
    event.preventDefault();
    elements.code.setSelectionRange(elements.code.selectionStart + 1, elements.code.selectionStart + 1);
    syncHighlight();
  }
}

function problemIdForProblem(problem) {
  return problem?.slug || "";
}

function progressKeyForSlug(slug) {
  return String(slug || "").replace(/^memory:/, "");
}

function getAcCount(problem) {
  const count = Number(problem.progress?.acCount || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function applyProgress(slug, progress) {
  if (!progress) {
    return;
  }

  const targetKey = progressKeyForSlug(slug || progress.slug);
  for (const problem of state.problems) {
    if (progressKeyForSlug(problem.slug) === targetKey) {
      problem.progress = progress;
    }
  }

  if (state.selected && progressKeyForSlug(state.selected.slug) === targetKey) {
    state.selected.progress = progress;
  }
}

function selectedProblemIdsOrAll() {
  if (state.selectedProblemIds.size > 0) {
    return [...state.selectedProblemIds];
  }
  return state.problems.map(problemIdForProblem);
}

function updateProblemActions() {
  const selectedCount = state.selectedProblemIds.size;
  elements.selectProblems.textContent = state.selectionMode ? "完成选择" : "选择题目";
  elements.exportProblems.disabled = state.problems.length === 0;
  elements.deleteProblems.hidden = !state.selectionMode;
  elements.deleteProblems.disabled = selectedCount === 0;
  elements.exportProblems.textContent = selectedCount > 0 ? `导出选中 (${selectedCount})` : "导出全部";
  elements.deleteProblems.textContent = selectedCount > 0 ? `删除选中 (${selectedCount})` : "删除选中";
}

function renderProblemList() {
  const query = elements.search.value.trim().toLowerCase();
  elements.list.innerHTML = "";

  const problems = state.problems.filter((problem) => {
    const haystack = [problem.slug, problem.frontendId, problem.title, problem.difficulty, ...problem.tags]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  for (const problem of problems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `problem-item${state.selected?.slug === problem.slug ? " active" : ""}`;
    button.innerHTML = `<strong>${formatProblemListTitle(problem)}</strong><span class="problem-meta">${problem.slug} · ${problem.difficulty}</span><span class="ac-count">AC ${getAcCount(problem)}</span>`;
    button.addEventListener("click", () => selectProblem(problem.slug));
    if (!state.selectionMode) {
      elements.list.appendChild(button);
      continue;
    }

    const problemId = problemIdForProblem(problem);
    const row = document.createElement("div");
    row.className = "problem-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "memory-select";
    checkbox.checked = state.selectedProblemIds.has(problemId);
    checkbox.setAttribute("aria-label", `选择 ${problem.title}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedProblemIds.add(problemId);
      } else {
        state.selectedProblemIds.delete(problemId);
      }
      updateProblemActions();
    });

    row.appendChild(checkbox);
    row.appendChild(button);
    elements.list.appendChild(row);
  }

  updateProblemActions();
}

async function loadTemplate(options = {}) {
  if (!state.selected) return;
  const persist = options.persist !== false;

  if (state.selected.memorySource) {
    elements.code.value = GENERIC_TEMPLATES[elements.language.value] || "";
    syncHighlight();
    if (persist) saveWorkspaceCache();
    return;
  }

  const language = elements.language.value;
  const body = await getJson(`/api/templates/${state.selected.slug}/${language}`);
  elements.code.value = body.code;
  syncHighlight();
  if (persist) saveWorkspaceCache();
}

function restoreSampleIo() {
  const sampleIo = sampleIoForProblem(state.selected);
  elements.stdin.value = sampleIo.inputText;
  elements.expected.value = sampleIo.outputText;
  elements.sampleIoNote.textContent = sampleIo.note;
  elements.sampleIo.disabled = Boolean(sampleIo.note);
  elements.sampleIo.textContent = sampleIo.note ? "样例仅供参考" : "载入题目样例";
}

function normalizeDifficulty(value) {
  const difficulty = String(value || "").toLowerCase();
  const difficultyMap = {
    "简单": "easy",
    "中等": "medium",
    "困难": "hard",
  };
  return difficultyMap[value] || difficulty;
}

function buildMemoryProblem(page) {
  const tags = Array.from(new Set((Array.isArray(page.tags) ? page.tags : []).filter(Boolean)));

  return {
    slug: `memory:${page.slug}`,
    memorySource: true,
    frontendId: page.frontendId || page.questionFrontendId || "",
    title: page.title || page.slug,
    difficulty: normalizeDifficulty(page.difficulty || ""),
    tags,
    sample: page.sample || null,
    rank: {
      source: "local-memory",
      frequency: 0,
      updatedAt: page.capturedAt,
    },
    leetcode: {
      slug: page.slug,
      url: page.url,
    },
    description: page.content,
    progress: page.progress || { acCount: 0 },
    cases: [],
  };
}

function latestMemoryPages(pages = []) {
  const latestBySlug = new Map();

  for (const page of pages) {
    if (!page?.slug) {
      continue;
    }

    const existing = latestBySlug.get(page.slug);
    const existingTime = Date.parse(existing?.capturedAt || 0);
    const nextTime = Date.parse(page.capturedAt || 0);
    if (!existing || nextTime >= existingTime) {
      latestBySlug.set(page.slug, page);
    }
  }

  return [...latestBySlug.values()].sort((a, b) => Date.parse(a.capturedAt || 0) - Date.parse(b.capturedAt || 0));
}

async function syncMemoryPages({ force = false } = {}) {
  const body = await getJson("/api/memory/pages");
  const pages = latestMemoryPages(body.pages || []);
  const version = memoryPagesVersion(pages);
  if (!force && version === state.memoryPagesVersion) {
    return false;
  }

  const memoryProblems = pages.map(buildMemoryProblem).reverse();
  state.problems = mergeMemoryProblems(state.problems, memoryProblems);
  state.memoryPagesVersion = version;

  const activeProblem = state.problems.find((problem) => problem.slug === state.selected?.slug);
  if (activeProblem?.memorySource) {
    state.selected = activeProblem;
    renderProblemIdentity(activeProblem);
    elements.link.href = activeProblem.leetcode.url;
    elements.description.textContent = activeProblem.description;
  }

  renderProblemList();
  updateLibraryCount();
  renderDailyProgress();
  renderDailySession();
  return true;
}

function renderProblemIdentity(problem) {
  const identity = problemIdentity(problem);
  elements.title.textContent = identity.heading;
  elements.difficulty.textContent = identity.difficulty;
  elements.progress.textContent = identity.progress;
  elements.tags.replaceChildren();
  for (const tag of identity.tags) {
    const tagNode = document.createElement("span");
    tagNode.className = "problem-tag";
    tagNode.textContent = tag;
    elements.tags.appendChild(tagNode);
  }
}

function formatProblemListTitle(problem) {
  return problem.frontendId ? `#${problem.frontendId} ${problem.title}` : problem.title;
}

async function selectProblem(slug, options = {}) {
  invalidateAssistRequest();
  const existing = state.problems.find((item) => item.slug === slug);
  const problem = existing?.memorySource ? existing : (await getJson(`/api/problems/${slug}`)).problem;
  state.selected = problem;
  applyProgress(problem.slug, problem.progress);

  renderProblemIdentity(problem);
  elements.link.href = problem.leetcode.url;
  elements.description.textContent = problem.description;

  restoreSampleIo();
  if (options.loadTemplate !== false) {
    await loadTemplate({ persist: false });
  }
  const restoredWorkspace = restoreWorkspaceCache();
  if (
    restoredWorkspace &&
    isStaleLeetCodeSampleCache(state.selected, {
      stdin: elements.stdin.value,
      expected: elements.expected.value,
    })
  ) {
    restoreSampleIo();
  }
  saveWorkspaceCache();
  renderProblemList();
  renderDailySession();
  if (options.openView !== false) {
    setActiveView("practice");
    setProblemInspectorOpen(true);
    setMobilePracticeTab("problem");
  }
}

function setResult(result) {
  elements.status.className = `status ${result.status}`;
  elements.status.textContent = result.status;
  elements.message.textContent = result.message || "";
  elements.stdout.textContent = result.stdout || "";
  elements.stderr.textContent = result.stderr || "";
  if (currentPracticeSession && state.selected) {
    currentPracticeSession = updatePracticeWorkspace(currentPracticeSession, {
      lastResult: result.status === "IDLE" ? null : { ...result },
    });
  }
}

async function runCode() {
  setUtilityTab("result");
  setMobilePracticeTab("result");
  elements.status.className = "status";
  elements.status.textContent = "RUNNING";
  elements.message.textContent = `Running ${runnerLabel(elements.runner.value)}...`;
  elements.stdout.textContent = "";
  elements.stderr.textContent = "";

  try {
    const body = await getJson("/api/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        slug: state.selected.slug,
        language: elements.language.value,
        runner: apiRunnerForUiMode(elements.runner.value),
        code: elements.code.value,
        stdin: elements.stdin.value,
        expected: elements.expected.value,
      }),
    });
    setResult(body.result);
    if (body.result.status === "AC" && body.progress) {
      applyProgress(state.selected.slug, body.progress);
      renderProblemList();
      renderProblemIdentity(state.selected);
      renderDailyProgress();
    }
    saveWorkspaceCache();
  } catch (error) {
    setResult({
      status: "ERROR",
      message: error.message,
      stdout: "",
      stderr: "",
    });
    saveWorkspaceCache();
  }
}

function cleanupProblemWorkspaceCache(slug) {
  for (const language of ["python", "java", "cpp"]) {
    localStorage.removeItem(`acmcoder.web.problem.${slug}.${language}`);
  }
}

function downloadJson(filename, body) {
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        resolve(JSON.parse(String(reader.result || "")));
      } catch (error) {
        reject(error);
      }
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read file.")));
    reader.readAsText(file, "utf-8");
  });
}

function setMobileMoreOpen(open) {
  state.mobileMoreOpen = Boolean(open);
  elements.mobileMoreMenu.hidden = !state.mobileMoreOpen;
  elements.mobileMoreToggle.setAttribute("aria-expanded", String(state.mobileMoreOpen));
}

function setActiveView(value, { focus = false } = {}) {
  const view = normalizeView(value);
  state.activeView = view;
  document.body.dataset.activeView = view;

  for (const panel of elements.appViews) {
    const active = panel.dataset.view === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
    if (active && focus) panel.focus({ preventScroll: true });
  }

  for (const target of elements.viewTargets) {
    const active = target.dataset.viewTarget === view;
    target.classList.toggle("is-active", active);
    if (target.closest("#app-navigation, #mobile-navigation")) {
      if (active) target.setAttribute("aria-current", "page");
      else target.removeAttribute("aria-current");
    }
  }

  setMobileMoreOpen(false);
}

function setUtilityTab(value) {
  const tab = normalizeUtilityTab(value);
  state.activeUtilityTab = tab;
  for (const button of elements.utilityTabs) {
    const active = button.dataset.utilityTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of elements.utilityPanels) {
    panel.hidden = panel.dataset.utilityPanel !== tab;
  }
}

function updateLibraryCount() {
  elements.libraryCount.textContent = String(state.problems.length);
}

function setMobilePracticeTab(value) {
  const tab = ["problem", "code", "result"].includes(value) ? value : "code";
  state.mobilePracticeTab = tab;
  for (const button of elements.mobilePracticeTabs) {
    const active = button.dataset.mobilePracticeTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of elements.mobilePracticePanels) {
    panel.classList.toggle("is-mobile-active", panel.dataset.mobilePracticePanel === tab);
  }
}

function setProblemInspectorOpen(open) {
  state.problemInspectorOpen = Boolean(open);
  elements.problemInspector.classList.toggle("is-open", state.problemInspectorOpen);
  elements.toggleProblemInspector.setAttribute("aria-expanded", String(state.problemInspectorOpen));
}

function renderDailyProgress() {
  const progress = dailyPlanProgress(state.dailyPlan, state.problems);
  elements.dailyProgressCount.textContent = `${progress.completed} / ${progress.total}`;
  elements.dailyProgressBar.style.width = `${progress.percent}%`;
  const track = elements.dailyProgressBar.closest('[role="progressbar"]');
  if (track) track.setAttribute("aria-valuenow", String(progress.percent));
}

function renderDailySession() {
  const slug = canonicalProblemSlug(state.selected);
  const items = Array.isArray(state.dailyPlan?.items) ? state.dailyPlan.items : [];
  const index = items.findIndex((item) => item.leetcodeSlug === slug);
  if (index < 0) {
    elements.dailySession.textContent = "自由练习 · 不计入今日计划队列";
    return;
  }
  elements.dailySession.textContent = `今日计划 ${index + 1} / ${items.length} · ${items[index].focus || items[index].reason || "高频题训练"}`;
}

function setDailyStatus(message, kind = "") {
  elements.dailyStatus.textContent = message;
  elements.dailyStatus.className = `daily-status ${kind}`.trim();
}

function dailyTagsFromInput() {
  return elements.dailyTags.value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDailyMeta(item) {
  return [
    item.difficulty,
    ...(Array.isArray(item.tags) ? item.tags : []),
    item.estimatedMinutes ? `${item.estimatedMinutes} min` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderDailyPlan(plan) {
  state.dailyPlan = plan;
  elements.dailyList.innerHTML = "";
  renderDailyProgress();
  renderDailySession();

  if (!plan?.items?.length) {
    setDailyStatus("还没有今日计划。导入推荐题库后点击生成。");
    elements.dailyPlanSource.textContent = "等待生成";
    return;
  }

  setDailyStatus(`${plan.theme} · ${plan.source === "ai" ? "AI 推荐" : "本地规则"}`);
  elements.dailyPlanSource.textContent = plan.source === "ai" ? "AI 个性化推荐" : "本地规则推荐";

  plan.items.forEach((item, index) => {
    const addedToPractice = Boolean(item.actions?.addedToPractice);
    const row = document.createElement("article");
    row.className = "daily-item";
    row.innerHTML = `
      <div class="daily-index">${index + 1}</div>
      <div class="daily-item-content">
        <div class="daily-item-head">
          <div>
            <h3>${escapeHtml(item.title || item.leetcodeSlug)}</h3>
            <p class="daily-item-meta">${escapeHtml(formatDailyMeta(item))}</p>
          </div>
          <span class="daily-focus">${escapeHtml(item.focus || "高频训练")}</span>
        </div>
        <p class="daily-item-reason">${escapeHtml(item.reason || item.focus || "")}</p>
        <div class="daily-item-actions">
          <a class="secondary-action" href="${escapeHtml(item.leetcodeUrl)}" target="_blank" rel="noreferrer" data-daily-action="open" data-slug="${escapeHtml(item.leetcodeSlug)}">${iconMarkup("external-link")}打开原题</a>
          <button class="primary-action" type="button" data-daily-action="${addedToPractice ? "practice" : "add_to_practice"}" data-slug="${escapeHtml(item.leetcodeSlug)}">${iconMarkup("code-2")}${addedToPractice ? "打开练习" : "加入并练习"}</button>
        </div>
      </div>
    `;
    elements.dailyList.appendChild(row);
  });
}

async function importRecommendationCatalog(file) {
  if (!file) {
    return;
  }

  const payload = await readJsonFile(file);
  const body = await getJson("/api/recommendation/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  state.selectedCatalogSlugs.clear();
  state.catalogSelectionMode = false;
  setDailyStatus(`已导入 ${body.importedCount || 0} 道推荐题。`, "ok");
  await loadRecommendationCatalog();
}

function selectedCatalogSlugsOrAll() {
  if (state.selectedCatalogSlugs.size > 0) {
    return [...state.selectedCatalogSlugs];
  }
  return state.catalog.map((entry) => entry.leetcodeSlug);
}

function updateCatalogActions() {
  const selectedCount = state.selectedCatalogSlugs.size;
  const allSelected = state.catalog.length > 0 && selectedCount === state.catalog.length;
  elements.catalogSelect.textContent = state.catalogSelectionMode ? "完成选择" : "选择题目";
  elements.catalogSelectAll.hidden = !state.catalogSelectionMode;
  elements.catalogSelectAll.disabled = state.catalog.length === 0;
  elements.catalogSelectAll.textContent = allSelected ? "取消全选" : "全选";
  elements.catalogDelete.hidden = !state.catalogSelectionMode;
  elements.catalogDelete.disabled = selectedCount === 0;
  elements.catalogDelete.innerHTML = `${iconMarkup("trash-2")}${selectedCount > 0 ? `删除选中 (${selectedCount})` : "删除选中"}`;
  elements.catalogExport.disabled = state.catalog.length === 0;
  elements.catalogExport.innerHTML = `${iconMarkup("download")}${selectedCount > 0 ? `导出选中 (${selectedCount})` : "导出全部"}`;
}

function toggleCatalogSelectAll() {
  state.selectedCatalogSlugs = new Set(nextCatalogSelection(state.catalog, state.selectedCatalogSlugs));
  renderRecommendationCatalog();
}

function renderRecommendationCatalog() {
  elements.catalogList.innerHTML = "";
  elements.catalogStatus.className = "catalog-status";
  const availableSlugs = new Set(state.catalog.map((entry) => entry.leetcodeSlug));
  state.selectedCatalogSlugs = new Set(
    [...state.selectedCatalogSlugs].filter((slug) => availableSlugs.has(slug)),
  );
  if (state.catalog.length === 0) {
    elements.catalogStatus.textContent = "推荐题库为空，请先导入题库文件。";
    updateCatalogActions();
    return;
  }

  elements.catalogStatus.textContent = `共 ${state.catalog.length} 道高频题，用于生成每日计划。`;
  for (const item of state.catalog) {
    const row = document.createElement("article");
    const selected = state.selectedCatalogSlugs.has(item.leetcodeSlug);
    row.className = `catalog-item${state.catalogSelectionMode ? " is-selecting" : ""}${selected ? " is-selected" : ""}`;
    const score = Math.round(Number(item.frequencyScore || 0) * 100);
    row.innerHTML = `
      <div class="catalog-rank">${Number.isFinite(item.sourceRank) && item.sourceRank < Number.MAX_SAFE_INTEGER ? `#${item.sourceRank}` : `${score}%`}</div>
      <div class="catalog-item-content">
        <h3>${escapeHtml(item.title || item.leetcodeSlug)}</h3>
        <p>${escapeHtml(formatDailyMeta(item))}</p>
      </div>
      <span class="catalog-source">${escapeHtml(item.source || "本地导入")}</span>
      <a class="icon-button" href="${escapeHtml(item.leetcodeUrl)}" target="_blank" rel="noreferrer" title="打开 LeetCode" aria-label="打开 LeetCode">${iconMarkup("external-link")}</a>
    `;
    if (state.catalogSelectionMode) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "memory-select catalog-select-box";
      checkbox.checked = selected;
      checkbox.setAttribute("aria-label", `选择 ${item.title || item.leetcodeSlug}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedCatalogSlugs.add(item.leetcodeSlug);
          row.classList.add("is-selected");
        } else {
          state.selectedCatalogSlugs.delete(item.leetcodeSlug);
          row.classList.remove("is-selected");
        }
        updateCatalogActions();
      });
      row.prepend(checkbox);
    }
    elements.catalogList.appendChild(row);
  }
  updateCatalogActions();
}

async function loadRecommendationCatalog() {
  const body = await getJson("/api/recommendation/catalog");
  state.catalog = Array.isArray(body.catalog?.entries) ? body.catalog.entries : [];
  renderRecommendationCatalog();
}

async function exportRecommendationCatalog() {
  const slugs = selectedCatalogSlugsOrAll();
  if (slugs.length === 0) {
    return;
  }

  const query = `?slugs=${encodeURIComponent(slugs.join(","))}`;
  const body = await getJson(`/api/recommendation/export${query}`);
  downloadJson(`acmcoder-recommendations-${new Date().toISOString().slice(0, 10)}.json`, body);
}

async function deleteSelectedCatalogEntries() {
  const slugs = [...state.selectedCatalogSlugs];
  if (slugs.length === 0 || !window.confirm(`删除选中的 ${slugs.length} 道推荐题目？`)) {
    return;
  }

  const body = await getJson("/api/recommendation/catalog", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs }),
  });
  state.catalog = Array.isArray(body.catalog?.entries) ? body.catalog.entries : [];
  state.selectedCatalogSlugs.clear();
  renderRecommendationCatalog();
  elements.catalogStatus.textContent = `已删除 ${body.deletedSlugs?.length || 0} 道推荐题。`;
}

async function loadTodayPlan() {
  const body = await getJson("/api/daily-plan/today");
  renderDailyPlan(body.plan);
}

async function generateDailyPlan() {
  elements.generateDaily.disabled = true;
  setDailyStatus("正在生成今日计划...");

  try {
    const body = await getJson("/api/daily-plan/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        count: Number(elements.dailyCount.value),
        difficultyPressure: elements.dailyDifficulty.value,
        targetTags: dailyTagsFromInput(),
      }),
    });
    renderDailyPlan(body.plan);
  } catch (error) {
    setDailyStatus(error.message, "error");
  } finally {
    elements.generateDaily.disabled = false;
  }
}

async function openPracticeForRecommendation(slug) {
  const problemSlug = `memory:${slug}`;
  let problem = state.problems.find((item) => item.slug === problemSlug);
  if (!problem) {
    await reloadProblems({ preserveView: true });
    problem = state.problems.find((item) => item.slug === problemSlug);
  }
  if (!problem) {
    throw new Error("这道题还没有加入我的题库。");
  }
  await selectProblem(problem.slug);
  setActiveView("practice");
}

async function recordDailyAction(slug, action) {
  if (!slug || !action) {
    return;
  }

  const apiAction = action === "practice" ? "add_to_practice" : action;
  const body = await getJson(`/api/daily-plan/items/${encodeURIComponent(slug)}/action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: apiAction }),
  });
  renderDailyPlan(body.plan);
  if (apiAction === "add_to_practice") {
    await reloadProblems({ preserveView: true });
    await openPracticeForRecommendation(slug);
  }
}

async function reloadProblems({ preserveView = false } = {}) {
  const body = await getJson("/api/problems");
  state.problems = body.problems;
  await syncMemoryPages({ force: true }).catch(() => false);

  if (!state.selected || !state.problems.some((problem) => problem.slug === state.selected.slug)) {
    const fallback = state.problems[0];
    if (fallback) {
      await selectProblem(fallback.slug, { openView: !preserveView });
    }
  }
}

async function importProblems(file) {
  if (!file) {
    return;
  }

  const payload = await readJsonFile(file);
  const body = await getJson("/api/problems/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  state.selectedProblemIds.clear();
  state.selectionMode = false;
  await reloadProblems();
  setResult({
    status: "IDLE",
    message: `已导入 ${body.importedCount || 0} 道题目。`,
    stdout: "",
    stderr: "",
  });
}

async function deleteSelectedProblems() {
  const slugs = [...state.selectedProblemIds];
  if (slugs.length === 0) {
    return;
  }

  if (!window.confirm(`删除选中的 ${slugs.length} 道记忆题目？`)) {
    return;
  }

  const body = await getJson("/api/problems", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ slugs }),
  });
  const deletedSlugs = new Set(body.deletedSlugs || []);
  const selectedWasDeleted = state.selected && deletedSlugs.has(problemIdForProblem(state.selected));

  for (const slug of deletedSlugs) {
    state.selectedProblemIds.delete(slug);
    cleanupProblemWorkspaceCache(slug);
  }

  state.problems = state.problems.filter((problem) => !deletedSlugs.has(problemIdForProblem(problem)));
  renderProblemList();
  setResult({
    status: "IDLE",
    message: `已删除 ${deletedSlugs.size} 道记忆题目。`,
    stdout: "",
    stderr: "",
  });

  elements.message.textContent = `已删除 ${deletedSlugs.size} 道题目。`;

  if (selectedWasDeleted) {
    const fallback = state.problems[0];
    if (fallback) {
      await selectProblem(fallback.slug);
    }
  }
}

async function exportProblems() {
  const slugs = selectedProblemIdsOrAll();
  if (slugs.length === 0) {
    return;
  }

  const query = slugs.length > 0 ? `?slugs=${encodeURIComponent(slugs.join(","))}` : "";
  const body = await getJson(`/api/problems/export${query}`);
  downloadJson(`acmcoder-problems-${new Date().toISOString().slice(0, 10)}.json`, body);
}

async function init() {
  const body = await getJson("/api/problems");
  state.problems = body.problems;
  updateLibraryCount();
  elements.language.value = localStorage.getItem(CACHE_KEYS.language) || elements.language.value;
  const savedRunner = localStorage.getItem(CACHE_KEYS.runner);
  state.runnerUserConfigured = Boolean(savedRunner);
  elements.runner.value = savedRunner || elements.runner.value;
  await loadDoctor({ applyDefault: true });
  await loadAssistSettings().catch((error) => {
    setAssistStatus(`模型设置读取失败：${error.message}`, "error");
  });
  if (!applicationControlsWired) {
  for (const target of elements.viewTargets) {
    target.addEventListener("click", () => setActiveView(target.dataset.viewTarget, { focus: true }));
  }
  for (const tab of elements.utilityTabs) {
    tab.addEventListener("click", () => setUtilityTab(tab.dataset.utilityTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const index = elements.utilityTabs.indexOf(tab);
      const next = elements.utilityTabs[(index + offset + elements.utilityTabs.length) % elements.utilityTabs.length];
      setUtilityTab(next.dataset.utilityTab);
      next.focus();
    });
  }
  for (const tab of elements.mobilePracticeTabs) {
    tab.addEventListener("click", () => setMobilePracticeTab(tab.dataset.mobilePracticeTab));
  }
  elements.toggleProblemInspector.addEventListener("click", () => {
    setProblemInspectorOpen(!state.problemInspectorOpen);
  });
  elements.mobileMoreToggle.addEventListener("click", () => setMobileMoreOpen(!state.mobileMoreOpen));
  elements.globalSearch.addEventListener("click", () => {
    setActiveView("library");
    elements.search.focus();
  });
  elements.search.addEventListener("input", renderProblemList);
  elements.selectProblems.addEventListener("click", () => {
    state.selectionMode = !state.selectionMode;
    if (!state.selectionMode) {
      state.selectedProblemIds.clear();
    }
    renderProblemList();
  });
  elements.deleteProblems.addEventListener("click", () => {
    deleteSelectedProblems().catch((error) => {
      setResult({ status: "ERROR", message: error.message, stdout: "", stderr: "" });
    });
  });
  elements.exportProblems.addEventListener("click", () => {
    exportProblems().catch((error) => {
      setResult({ status: "ERROR", message: error.message, stdout: "", stderr: "" });
    });
  });
  elements.importProblems.addEventListener("click", () => {
    elements.importFile.click();
  });
  elements.settingsImportProblems.addEventListener("click", () => elements.importFile.click());
  elements.settingsExportProblems.addEventListener("click", () => {
    exportProblems().catch((error) => {
      setResult({ status: "ERROR", message: error.message, stdout: "", stderr: "" });
    });
  });
  elements.importFile.addEventListener("change", () => {
    importProblems(elements.importFile.files?.[0])
      .catch((error) => {
        setResult({ status: "ERROR", message: error.message, stdout: "", stderr: "" });
      })
      .finally(() => {
        elements.importFile.value = "";
      });
  });
  elements.importCatalog.addEventListener("click", () => {
    elements.catalogFile.click();
  });
  elements.catalogImport.addEventListener("click", () => elements.catalogFile.click());
  elements.catalogExport.addEventListener("click", () => {
    exportRecommendationCatalog().catch((error) => {
      elements.catalogStatus.textContent = error.message;
      elements.catalogStatus.className = "catalog-status error";
    });
  });
  elements.catalogSelect.addEventListener("click", () => {
    state.catalogSelectionMode = !state.catalogSelectionMode;
    if (!state.catalogSelectionMode) {
      state.selectedCatalogSlugs.clear();
    }
    renderRecommendationCatalog();
  });
  elements.catalogSelectAll.addEventListener("click", toggleCatalogSelectAll);
  elements.catalogDelete.addEventListener("click", () => {
    deleteSelectedCatalogEntries().catch((error) => {
      elements.catalogStatus.textContent = error.message;
      elements.catalogStatus.className = "catalog-status error";
    });
  });
  elements.catalogFile.addEventListener("change", () => {
    importRecommendationCatalog(elements.catalogFile.files?.[0])
      .catch((error) => {
        setDailyStatus(error.message, "error");
      })
      .finally(() => {
        elements.catalogFile.value = "";
      });
  });
  elements.generateDaily.addEventListener("click", () => {
    generateDailyPlan();
  });
  elements.dailyList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-daily-action]");
    if (!target) {
      return;
    }
    const slug = target.getAttribute("data-slug");
    const action = target.getAttribute("data-daily-action");
    recordDailyAction(slug, action).catch((error) => setDailyStatus(error.message, "error"));
  });
  elements.language.addEventListener("change", async () => {
    invalidateAssistRequest();
    try {
      localStorage.setItem(CACHE_KEYS.language, elements.language.value);
    } catch {
      setAssistStatus("本轮内容暂时无法保存到浏览器", "error");
    }
    updateRunnerModeOptions();
    applyRecommendedRunnerIfNeeded();
    renderRunnerHealth();
    if (!restoreWorkspaceCache()) {
      await loadTemplate();
    }
  });
  elements.runner.addEventListener("change", () => {
    state.runnerUserConfigured = true;
    localStorage.setItem(CACHE_KEYS.runner, elements.runner.value);
    renderRunnerHealth();
  });
  elements.saveAssistSettings.addEventListener("click", () => {
    saveAssistSettings().catch((error) => setAssistStatus(error.message, "error"));
  });
  elements.askAssist.addEventListener("click", askAssist);
  elements.cancelAssist.addEventListener("click", cancelAssist);
  elements.loadTemplate.addEventListener("click", loadTemplate);
  elements.sampleIo.addEventListener("click", () => {
    restoreSampleIo();
    saveWorkspaceCache();
  });
  elements.clearExpected.addEventListener("click", () => {
    elements.expected.value = "";
    saveWorkspaceCache();
  });
  elements.run.addEventListener("click", runCode);
  elements.code.addEventListener("input", () => {
    syncHighlight();
    saveWorkspaceCache();
  });
  elements.code.addEventListener("scroll", syncHighlight);
  elements.code.addEventListener("select", syncHighlight);
  elements.code.addEventListener("click", syncHighlight);
  elements.code.addEventListener("keyup", syncHighlight);
  elements.code.addEventListener("beforeinput", handleEditorBeforeInput);
  elements.code.addEventListener("keydown", handleEditorKeydown);
  elements.stdin.addEventListener("input", saveWorkspaceCache);
  elements.expected.addEventListener("input", saveWorkspaceCache);
  applicationControlsWired = true;
  }
  if (!document.hidden) {
    await syncMemoryPages({ force: true }).catch(() => false);
  }
  await loadTodayPlan().catch(() => {
    renderDailyPlan(null);
  });
  await loadRecommendationCatalog().catch((error) => {
    elements.catalogStatus.textContent = `推荐题库读取失败：${error.message}`;
  });
  renderProblemList();
  updateLibraryCount();
  const cachedSelected = localStorage.getItem(CACHE_KEYS.selected);
  const fallback = state.problems.find((problem) => problem.slug === cachedSelected) || state.problems[0];
  if (fallback) {
    await selectProblem(fallback.slug, { openView: false });
  }
  setActiveView("today");
}

const startupRecovery = createStartupRecovery({
  wire: wireStartupControls,
  load: init,
  onReady: () => renderConnectionState(true),
});

startupRecovery.initialize().catch((error) => {
  elements.title.textContent = "启动失败";
  elements.message.textContent = error.message;
});
