export const APP_VIEWS = Object.freeze(["today", "practice", "library", "catalog", "settings"]);
export const UTILITY_TABS = Object.freeze(["test", "result", "assist"]);

export function normalizeView(value) {
  return APP_VIEWS.includes(value) ? value : "today";
}

export function normalizeUtilityTab(value) {
  return UTILITY_TABS.includes(value) ? value : "test";
}

export function problemIdentity(problem = {}) {
  const difficulty = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
  }[String(problem.difficulty || "").toLowerCase()] || String(problem.difficulty || "");
  const title = String(problem.title || "选择一道题开始");
  const number = String(problem.frontendId || "").trim();
  const acCount = Math.max(0, Math.floor(Number(problem.progress?.acCount || 0)));

  return {
    heading: number ? `#${number} ${title}` : title,
    difficulty,
    tags: Array.isArray(problem.tags) ? problem.tags.map(String).filter(Boolean) : [],
    progress: `通过次数 ${acCount}`,
  };
}

export function apiRunnerForUiMode(mode) {
  return mode === "docker" ? "docker" : "local";
}

export function uiRunnerForApiRecommendation(recommendation, deploymentMode) {
  if (recommendation === "docker") {
    return "docker";
  }
  if (recommendation === "local") {
    return deploymentMode === "docker-app" ? "builtin" : "local";
  }
  return "";
}

export function canonicalProblemSlug(problem) {
  const slug = problem?.leetcode?.slug ?? problem?.slug ?? "";
  return typeof slug === "string" ? slug.replace(/^memory:/, "") : "";
}

export function nextCatalogSelection(catalog = [], selectedSlugs = new Set()) {
  const slugs = (Array.isArray(catalog) ? catalog : [])
    .map((entry) => String(entry?.leetcodeSlug || "").trim())
    .filter(Boolean);
  const allSelected = slugs.length > 0 && slugs.every((slug) => selectedSlugs.has(slug));
  return allSelected ? [] : slugs;
}

export function memoryPagesVersion(pages = []) {
  const signatures = (Array.isArray(pages) ? pages : [])
    .filter((page) => page?.slug)
    .map((page) => {
      const acCount = Number(page?.progress?.acCount || 0);
      return [
        String(page.slug),
        String(page.capturedAt || ""),
        Number.isFinite(acCount) && acCount > 0 ? acCount : 0,
      ];
    })
    .sort(([slugA], [slugB]) => slugA.localeCompare(slugB));

  return JSON.stringify(signatures);
}

export function mergeMemoryProblems(existingProblems = [], memoryProblems = []) {
  const seeds = (Array.isArray(existingProblems) ? existingProblems : []).filter(
    (problem) => !problem?.memorySource,
  );
  return [...(Array.isArray(memoryProblems) ? memoryProblems : []), ...seeds];
}

export function sampleIoForProblem(problem) {
  if (problem?.memorySource) {
    return {
      inputText: "",
      outputText: "",
      note: "LeetCode 示例不是 ACM 标准输入，请按程序的读取顺序填写测试数据。",
    };
  }

  const sample = problem?.sample;
  if (sample && (typeof sample.inputText === "string" || typeof sample.outputText === "string")) {
    return {
      inputText: sample.inputText || "",
      outputText: sample.outputText || "",
      note: "",
    };
  }

  const firstCase = problem?.cases?.[0];
  return {
    inputText: firstCase?.inputText || "",
    outputText: firstCase?.outputText || "",
    note: "",
  };
}

export function isStaleLeetCodeSampleCache(problem, workspace) {
  const sample = problem?.sample;
  if (!problem?.memorySource || !sample || !workspace) {
    return false;
  }

  return workspace.stdin === (sample.inputText || "") && workspace.expected === (sample.outputText || "");
}

export function localDateForTimestamp(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyPlanProgress(plan, problems = []) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const acceptedSlugs = new Set(
    (Array.isArray(problems) ? problems : [])
      .filter((problem) => localDateForTimestamp(problem?.progress?.lastAcceptedAt) === plan?.date)
      .map(canonicalProblemSlug)
      .filter(Boolean),
  );
  const completed = items.filter((item) => acceptedSlugs.has(item?.leetcodeSlug)).length;
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, percent };
}
