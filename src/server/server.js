import fs from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createUnifiedApi } from './unified-api.js';
import {createChatTransport} from '../../shared/ai.js';
import {validateAIRequest} from '../../cloudflare/lib/ai-relay.js';
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findProblem, loadProblems, projectRoot, resolveProjectPath } from "../core/problems.js";
import { generateCandidates } from "./candidate-generator.js";
import {
  getDefaultAssistSettingsFile,
  getPublicAssistSettings,
  loadAssistSettings,
  requestCodeAdvice,
  saveAssistSettings,
} from "./assist.js";
import {
  generateDailyPlan,
  getDefaultDailyPlanFile,
  loadDailyPlan,
  updateDailyPlanItemAction,
} from "./daily-plan.js";
import { createEnvironmentReport } from "./doctor.js";
import {
  deleteProblems,
  exportProblems,
  filterVisibleProblems,
  getDefaultDeletedProblemsFile,
  importProblems,
  loadDeletedProblemSlugs,
} from "./problem-actions.js";
import { runSubmission as defaultRunSubmission } from "../runner/run.js";
import {
  getDefaultCurrentMemoryFile,
  getDefaultMemoryFile,
  deleteMemoryPages,
  exportMemoryPages,
  loadCurrentMemoryPage,
  loadMemoryPages,
  saveMemoryPage,
} from "./memory.js";
import { fetchLeetCodeQuestionPage } from "./leetcode-question.js";
import {
  buildPracticeProfile,
  getDefaultPlannerProfileFile,
  loadPlannerProfile,
  updatePlannerAction,
} from "./planner-profile.js";
import {
  getDefaultProgressFile,
  loadProgressItems,
  progressForSlug,
  recordAcceptedProgress,
  withPageProgress,
  withProblemProgress,
} from "./progress.js";
import {
  deleteRecommendationCatalogEntries,
  exportRecommendationCatalog,
  getDefaultRecommendationCatalogFile,
  importRecommendationCatalog,
  loadRecommendationCatalog,
} from "./recommendation-catalog.js";
import { checkDockerRunner as defaultCheckDockerRunner } from "../runner/docker-runner.js";
import { checkToolchain as defaultCheckToolchain, listLanguages as defaultListLanguages } from "../runner/toolchains.js";

const DEFAULT_PORT = 43117;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const extensionOriginPattern = /^(?:chrome|edge)-extension:\/\/[a-z0-9_-]+$/i;
const localHostnames = ["localhost", "127.0.0.1", "[::1]"];

function parseRequestHost(host) {
  const value = String(host || "").trim();
  if (!value || /[\s\\\/@?#]/.test(value)) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return parsed.hostname ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTrustedHostname(value) {
  const raw = String(value || "").trim();
  if (!raw || /[\s\\\/@?#*]/.test(raw)) return null;
  if (raw.includes(":") && !/^\[[0-9a-f:]+\]$/i.test(raw)) return null;
  const parsed = parseRequestHost(raw);
  return parsed && !parsed.port ? parsed.hostname.toLowerCase() : null;
}

function requestOrigin(request) {
  return String(request.headers.origin || "").trim();
}

function isTrustedBrowserOrigin(request) {
  const origin = requestOrigin(request);
  if (!origin) {
    return true;
  }
  if (extensionOriginPattern.test(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const requestHost = String(request.headers.host || "").toLowerCase();
    return ["http:", "https:"].includes(parsed.protocol)
      && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash
      && parsed.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function applyCorsHeaders(request, response) {
  const origin = requestOrigin(request);
  response.setHeader("vary", "Origin");
  if (!origin) {
    return;
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,x-acmcoder-token");
}

function hasValidSessionToken(request, expectedToken) {
  const providedToken = String(request.headers["x-acmcoder-token"] || "");
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sendJson(response, status, payload) {
  if (response.writableEnded || response.destroyed) {
    return;
  }
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendJsonDownload(response, filename, payload) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(response) {
  response.writeHead(204);
  response.end();
}

async function readJsonBody(request,maxBytes=64*1024*1024) {
  const chunks=[];let size=0;
  for await (const chunk of request) {
    size+=chunk.length;if(size>maxBytes)throw new Error('Request body is too large.');chunks.push(chunk);
  }
  const body=Buffer.concat(chunks).toString('utf8');
  try{return body ? JSON.parse(body) : {};}catch{throw new Error('Invalid JSON request.');}
}

async function serializeProblem(problem, includeCaseText = false) {
  if (!includeCaseText) {
    return problem;
  }

  const cases = await Promise.all(
    problem.cases.map(async (testCase) => ({
      ...testCase,
      inputText: await fs.readFile(resolveProjectPath(testCase.input), "utf8"),
      outputText: await fs.readFile(resolveProjectPath(testCase.output), "utf8"),
    })),
  );

  return {
    ...problem,
    cases,
  };
}

async function serializeProblemsWithProgress(problems, progressFile) {
  const progressItems = await loadProgressItems(progressFile);
  return problems.map((problem) => withProblemProgress(problem, progressItems));
}

async function serializePagesWithProgress(pages, progressFile) {
  const progressItems = await loadProgressItems(progressFile);
  return pages.map((page) => withPageProgress(page, progressItems));
}

async function readTemplate(slug, language) {
  const extensionByLanguage = {
    java: "java",
    cpp: "cpp",
    python: "py",
  };
  const extension = extensionByLanguage[language];

  if (!extension) {
    throw new Error(`Unsupported template language: ${language}`);
  }

  const fileName = language === "java" ? "Main.java" : language === "cpp" ? "main.cpp" : "main.py";
  return fs.readFile(path.join(projectRoot, "problems", slug, "templates", fileName), "utf8");
}

function localDateString(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 10);
}

function todayDate(value) {
  const date = String(value || "").trim();
  return date ? date.slice(0, 10) : localDateString();
}

function hasCompleteStatement(page) {
  const content = String(page?.content || "").trim();
  return Boolean(content) && !content.startsWith("Open the LeetCode link for the full statement.");
}

async function resolvePracticePage(item, { memoryFile, fetchLeetCodePage }) {
  const pages = await loadMemoryPages({ slug: item.leetcodeSlug }, memoryFile);
  const latestPage = pages.at(-1);
  const cachedPage = [...pages].reverse().find(hasCompleteStatement);

  if (cachedPage) {
    return {
      page:
        latestPage === cachedPage
          ? cachedPage
          : {
              ...cachedPage,
              capturedAt: new Date().toISOString(),
            },
      shouldSave: latestPage !== cachedPage,
    };
  }

  const page = await fetchLeetCodePage(item.leetcodeSlug, item.leetcodeUrl);
  if (!hasCompleteStatement(page)) {
    throw new Error(`无法获取 ${item.title || item.leetcodeSlug} 的完整题面，请打开原题后重试。`);
  }

  return { page, shouldSave: true };
}

async function buildDailyPlannerInputs({ recommendationCatalogFile, plannerProfileFile, progressFile, options = {} }) {
  const catalog = await loadRecommendationCatalog(recommendationCatalogFile);
  const profile = await loadPlannerProfile(plannerProfileFile);
  const progressItems = await loadProgressItems(progressFile);
  const requestSettings = {
    ...profile.settings,
    dailyCount: options.count || profile.settings.dailyCount,
    difficultyPressure: options.difficultyPressure || profile.settings.difficultyPressure,
    targetTags: Array.isArray(options.targetTags) ? options.targetTags : profile.settings.targetTags,
  };
  const practiceProfile = buildPracticeProfile({
    profile: {
      ...profile,
      settings: requestSettings,
    },
    progressItems,
  });
  const candidates = generateCandidates({
    catalogEntries: catalog.entries,
    practiceProfile,
    today: todayDate(options.date),
  });

  return {
    catalog,
    profile,
    practiceProfile,
    candidates,
  };
}

async function serveStatic(requestUrl, response) {
  let builtRoot=null;
  try{await fs.access(path.join(projectRoot,'dist/local-web/version.json'));builtRoot=path.join(projectRoot,'dist/local-web');}catch{}
  if(requestUrl.pathname.startsWith('/shared/')){
    const root=builtRoot?path.join(builtRoot,'shared'):path.join(projectRoot,'shared'),file=path.resolve(root,requestUrl.pathname.slice(8));
    if(!file.startsWith(root+path.sep)){sendJson(response,403,{error:'Forbidden'});return;}
    try{const bytes=await fs.readFile(file);response.writeHead(200,{'content-type':contentTypes[path.extname(file)]||'application/octet-stream'});response.end(bytes);}catch{sendJson(response,404,{error:'Not found'});}return;
  }
  const requestedPath = builtRoot?(requestUrl.pathname==='/'?'/index.html':requestUrl.pathname):requestUrl.pathname === "/" ? "/workspace.html" : requestUrl.pathname==='/legacy.html'?'/index.html':requestUrl.pathname;
  const webRoot = builtRoot||path.join(projectRoot, "web");
  const filePath = path.normalize(path.join(webRoot, requestedPath));

  if (!filePath.startsWith(webRoot+path.sep)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = contentTypes[path.extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": contentType });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createAcmcoderServer(options = {}) {
  const configuredHosts = options.trustedHosts ?? String(process.env.ACMCODER_TRUSTED_HOSTS || "").split(",");
  const trustedHostnames = new Set([...localHostnames, ...configuredHosts]
    .map(normalizeTrustedHostname).filter(Boolean));
  const memoryFile = options.memoryFile || getDefaultMemoryFile();
  const currentMemoryFile = options.currentMemoryFile || getDefaultCurrentMemoryFile();
  const deletedProblemsFile = options.deletedProblemsFile || getDefaultDeletedProblemsFile();
  const progressFile = options.progressFile || getDefaultProgressFile();
  const assistSettingsFile = options.assistSettingsFile || getDefaultAssistSettingsFile();
  const recommendationCatalogFile = options.recommendationCatalogFile || getDefaultRecommendationCatalogFile();
  const plannerProfileFile = options.plannerProfileFile || getDefaultPlannerProfileFile();
  const dailyPlanFile = options.dailyPlanFile || getDefaultDailyPlanFile();
  const runSubmission = options.runSubmission || defaultRunSubmission;
  const assistFetch = options.assistFetch || globalThis.fetch;
  const fetchLeetCodePage =
    options.fetchLeetCodePage ||
    ((slug, url) => fetchLeetCodeQuestionPage(slug, url, { fetch: options.leetcodeFetch || globalThis.fetch }));
  const listLanguages = options.listLanguages || defaultListLanguages;
  const checkToolchain = options.checkToolchain || defaultCheckToolchain;
  const checkDockerRunner = options.checkDockerRunner || defaultCheckDockerRunner;
  const sessionToken = options.sessionToken || randomBytes(32).toString("base64url");
  const activeRuns=new Map();
  const unified=createUnifiedApi({dataDir:options.unifiedDataDir||process.env.ACMCODER_UNIFIED_DATA_DIR||path.join(projectRoot,'data/unified'),credentialDir:options.credentialDir||process.env.ACMCODER_CREDENTIAL_DIR,memoryFile,progressFile,cloudFetch:options.cloudFetch});

  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");

    try {
      const host = parseRequestHost(request.headers.host);
      if (!host || !trustedHostnames.has(host.hostname.toLowerCase())) {
        sendJson(response, 403, { error: "Host is not allowed." });
        return;
      }
      if (!isTrustedBrowserOrigin(request)) {
        sendJson(response, 403, { error: "Browser origin is not allowed." });
        return;
      }

      applyCorsHeaders(request, response);

      if (request.method === "OPTIONS") {
        sendNoContent(response);
        return;
      }

      const unifiedMatch=requestUrl.pathname.match(/^\/api\/unified\/(session|connect|poll|cancel|disconnect|sync|store)$/);
      if(unifiedMatch){
        const operation=unifiedMatch[1];
        if(operation!=='session'&&(request.method!=='POST'||!hasValidSessionToken(request,sessionToken))){sendJson(response,401,{error:'A valid ACMCoder session token is required.'});return;}
        try{sendJson(response,200,{result:await unified.handle(operation,request.method==='POST'?await readJsonBody(request):{})});}
        catch(error){sendJson(response,error.code==='account_changed'?409:400,{error:error.message,code:error.code});}return;
      }
      if(request.method==='POST'&&requestUrl.pathname==='/api/unified-ai/chat'){
        if(!hasValidSessionToken(request,sessionToken)){sendJson(response,401,{error:'A valid ACMCoder session token is required.'});return;}
        const controller=new AbortController(),cancel=()=>{if(!response.writableEnded)controller.abort();};response.once('close',cancel);
        const timeout=setTimeout(()=>controller.abort(),60000);
        try{
          const data=await readJsonBody(request,120000),input=validateAIRequest(data,{allowLoopback:data.allowLoopback===true});
          const result=await createChatTransport({fetch:assistFetch,allowLoopback:data.allowLoopback===true})({...input,signal:controller.signal});sendJson(response,200,result);
        }catch(error){sendJson(response,400,{error:error.message});}
        finally{clearTimeout(timeout);response.removeListener('close',cancel);}return;
      }
      if(request.method==='POST'&&requestUrl.pathname==='/api/import/fetch'){
        if(!hasValidSessionToken(request,sessionToken)){sendJson(response,401,{error:'A valid ACMCoder session token is required.'});return;}
        const {url:source}=await readJsonBody(request),url=new URL(source);
        const match=/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
        if(url.protocol!=='https:'||!['leetcode.cn','leetcode.com'].includes(url.hostname)||!match||url.username||url.password||url.port||url.search){sendJson(response,400,{error:'请填写公开 LeetCode 题目链接。'});return;}
        const page=await fetchLeetCodePage(match[1],url.href);sendJson(response,200,{title:page.title,statement:page.content,rawSamples:page.sample?[`输入：${page.sample.inputText}\n输出：${page.sample.outputText}`]:[],sourceUrl:url.href});return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/session") {
        sendJson(response, 200, { token: sessionToken });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/recommendation/catalog") {
        const catalog = await loadRecommendationCatalog(recommendationCatalogFile);
        sendJson(response, 200, { catalog });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/recommendation/export") {
        const slugs = (requestUrl.searchParams.get("slugs") || "").split(",");
        const body = await exportRecommendationCatalog({ slugs }, recommendationCatalogFile);
        sendJsonDownload(response, `acmcoder-recommendations-${new Date().toISOString().slice(0, 10)}.json`, body);
        return;
      }

      if (request.method === "DELETE" && requestUrl.pathname === "/api/recommendation/catalog") {
        const body = await readJsonBody(request);
        const result = await deleteRecommendationCatalogEntries({ slugs: body.slugs || [] }, recommendationCatalogFile);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/recommendation/import") {
        const body = await readJsonBody(request);
        const result = await importRecommendationCatalog(body, recommendationCatalogFile);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/recommendation/sync-codetop") {
        sendJson(response, 501, { error: "CodeTop sync is not available in this MVP. Import a recommendation JSON file instead." });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/daily-plan/today") {
        const date = todayDate(requestUrl.searchParams.get("date"));
        const plan = await loadDailyPlan(date, dailyPlanFile);
        sendJson(response, 200, { plan });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/daily-plan/generate") {
        const body = await readJsonBody(request);
        const date = todayDate(body.date);
        const { candidates, practiceProfile } = await buildDailyPlannerInputs({
          recommendationCatalogFile,
          plannerProfileFile,
          progressFile,
          options: body,
        });
        const settings = await loadAssistSettings(assistSettingsFile);
        const plan = await generateDailyPlan({
          candidates,
          date,
          count: body.count || practiceProfile.settings.dailyCount,
          planFile: dailyPlanFile,
          settings,
          fetch: assistFetch,
        });
        sendJson(response, 200, { plan, candidateCount: candidates.length });
        return;
      }

      const dailyPlanActionMatch = requestUrl.pathname.match(/^\/api\/daily-plan\/items\/([^/]+)\/action$/);
      if (request.method === "POST" && dailyPlanActionMatch) {
        const slug = decodeURIComponent(dailyPlanActionMatch[1]);
        const body = await readJsonBody(request);
        const date = todayDate(body.date);
        const action = String(body.action || "");

        if (action === "add_to_practice") {
          const currentPlan = await loadDailyPlan(date, dailyPlanFile);
          const item = currentPlan?.items?.find((entry) => entry.leetcodeSlug === slug);
          if (!item) {
            throw new Error(`今日计划中没有题目 ${slug}。`);
          }

          const resolved = await resolvePracticePage(item, { memoryFile, fetchLeetCodePage });
          if (resolved.shouldSave) {
            await saveMemoryPage(resolved.page, memoryFile, currentMemoryFile);
          }
        }

        await updateDailyPlanItemAction({ planFile: dailyPlanFile, date, slug, action });
        await updatePlannerAction(slug, action, plannerProfileFile);
        const plan = await loadDailyPlan(date, dailyPlanFile);
        sendJson(response, 200, { plan });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/problems") {
        const deletedSlugs = await loadDeletedProblemSlugs(deletedProblemsFile);
        const problems = await serializeProblemsWithProgress(filterVisibleProblems(loadProblems(), deletedSlugs), progressFile);
        sendJson(response, 200, { problems });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/doctor") {
        const report = await createEnvironmentReport({
          listLanguages,
          checkToolchain,
          checkDockerRunner,
        });
        sendJson(response, 200, report);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/assist/settings") {
        const settings = await loadAssistSettings(assistSettingsFile);
        sendJson(response, 200, { settings: getPublicAssistSettings(settings) });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/assist/settings") {
        const body = await readJsonBody(request);
        const settings = await saveAssistSettings(body, assistSettingsFile);
        sendJson(response, 200, { settings: getPublicAssistSettings(settings) });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/assist") {
        const body = await readJsonBody(request);
        const controller = new AbortController();
        const abortRequest = () => controller.abort(new Error("Client cancelled model request."));
        const abortClosedResponse = () => {
          if (!response.writableEnded) {
            abortRequest();
          }
        };
        request.once("aborted", abortRequest);
        response.once("close", abortClosedResponse);
        try {
          const settings = await loadAssistSettings(assistSettingsFile);
          const advice = await requestCodeAdvice({
            settings,
            fetch: assistFetch,
            signal: controller.signal,
            context: body,
          });
          sendJson(response, 200, advice);
        } finally {
          request.removeListener("aborted", abortRequest);
          response.removeListener("close", abortClosedResponse);
        }
        return;
      }

      if (request.method === "DELETE" && requestUrl.pathname === "/api/problems") {
        const body = await readJsonBody(request);
        const result = await deleteProblems({
          slugs: body.slugs || [],
          problems: loadProblems(),
          memoryFile,
          currentMemoryFile,
          deletedProblemsFile,
          progressFile,
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/problems/import") {
        const body = await readJsonBody(request);
        const result = await importProblems({
          payload: body,
          problems: loadProblems(),
          memoryFile,
          currentMemoryFile,
          deletedProblemsFile,
          progressFile,
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/problems/export") {
        const slugs = (requestUrl.searchParams.get("slugs") || "").split(",");
        const body = await exportProblems({
          slugs,
          problems: loadProblems(),
          memoryFile,
          deletedProblemsFile,
          progressFile,
        });
        sendJsonDownload(response, `acmcoder-problems-${new Date().toISOString().slice(0, 10)}.json`, body);
        return;
      }

      const problemMatch = requestUrl.pathname.match(/^\/api\/problems\/([^/]+)$/);
      if (request.method === "GET" && problemMatch) {
        const slug = decodeURIComponent(problemMatch[1]);
        const deletedSlugs = await loadDeletedProblemSlugs(deletedProblemsFile);
        if (deletedSlugs.has(slug)) {
          throw new Error(`Unknown problem: ${slug}`);
        }
        const problem = await serializeProblem(findProblem(slug), true);
        const progressItems = await loadProgressItems(progressFile);
        sendJson(response, 200, { problem: withProblemProgress(problem, progressItems) });
        return;
      }

      const templateMatch = requestUrl.pathname.match(/^\/api\/templates\/([^/]+)\/([^/]+)$/);
      if (request.method === "GET" && templateMatch) {
        const code = await readTemplate(decodeURIComponent(templateMatch[1]), decodeURIComponent(templateMatch[2]));
        sendJson(response, 200, { code });
        return;
      }

      if(request.method==='POST'&&requestUrl.pathname==='/api/run/cancel'){
        if(!hasValidSessionToken(request,sessionToken)){sendJson(response,401,{error:'A valid ACMCoder session token is required.'});return;}
        const {id}=await readJsonBody(request);activeRuns.get(id)?.abort();sendJson(response,200,{ok:true});return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/run") {
        if (!hasValidSessionToken(request, sessionToken)) {
          sendJson(response, 401, { error: "A valid ACMCoder session token is required." });
          return;
        }

        const body = await readJsonBody(request);
        const controller=new AbortController();const id=typeof body.id==='string'?body.id:crypto.randomUUID();
        if(activeRuns.has(id)){sendJson(response,409,{error:'This run is already active.'});return;}activeRuns.set(id,controller);
        response.once('close',()=>{if(!response.writableEnded)controller.abort();});
        let result;
        try{result = await runSubmission({
          language: body.language,
          code: body.code,
          stdin: body.stdin,
          expected: body.expected,
          timeoutMs: body.timeoutMs,
          runner: body.runner,
          signal:controller.signal,
        });}finally{activeRuns.delete(id);}
        const progress =
          result.status === "AC"
            ? await recordAcceptedProgress(body.slug, progressFile)
            : progressForSlug(body.slug, await loadProgressItems(progressFile));
        sendJson(response, 200, { result, progress });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/memory/pages") {
        const pages = await loadMemoryPages({ slug: requestUrl.searchParams.get("slug") }, memoryFile);
        sendJson(response, 200, { pages: await serializePagesWithProgress(pages, progressFile) });
        return;
      }

      if (request.method === "DELETE" && requestUrl.pathname === "/api/memory/pages") {
        const body = await readJsonBody(request);
        const result = await deleteMemoryPages({ slugs: body.slugs || [] }, memoryFile, currentMemoryFile);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/memory/export") {
        const slugs = (requestUrl.searchParams.get("slugs") || "").split(",");
        const body = await exportMemoryPages({ slugs }, memoryFile);
        body.pages = await serializePagesWithProgress(body.pages, progressFile);
        sendJsonDownload(response, `acmcoder-memory-${new Date().toISOString().slice(0, 10)}.json`, body);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/memory/location") {
        sendJson(response, 200, { file: memoryFile });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/memory/current") {
        const page = await loadCurrentMemoryPage(currentMemoryFile);
        const pages = page ? await serializePagesWithProgress([page], progressFile) : [];
        sendJson(response, 200, { page: pages[0] || null });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/memory/pages") {
        const body = await readJsonBody(request);
        const page = await saveMemoryPage(body, memoryFile, currentMemoryFile);
        const pages = await serializePagesWithProgress([page], progressFile);
        sendJson(response, 201, { page: pages[0] });
        return;
      }

      if (request.method === "GET") {
        await serveStatic(requestUrl, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });
}

export function getServerHost(env = process.env) {
  return env.ACMCODER_HOST?.trim() || "127.0.0.1";
}

export function startServer(port = DEFAULT_PORT, host = getServerHost()) {
  const server = createAcmcoderServer();
  server.listen(port, host, () => {
    console.log(`ACMCoder is running at http://${host}:${port}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer(Number(process.env.PORT || DEFAULT_PORT), getServerHost(process.env));
}
