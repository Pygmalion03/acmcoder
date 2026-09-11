import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("web UI exposes self-test output and reset wording", () => {
  const html = fs.readFileSync("web/index.html", "utf8");

  assert.match(html, /还原初始代码/);
  assert.match(html, /自测预期输出/);
  assert.match(html, /code-highlight/);
});

test("web UI uses a single problem description section", () => {
  const html = fs.readFileSync("web/index.html", "utf8");

  assert.match(html, /题目描述/);
  assert.doesNotMatch(html, /输入描述/);
  assert.doesNotMatch(html, /输出描述/);
  assert.doesNotMatch(html, /样例说明/);
});

test("web UI preserves LeetCode problem description line breaks", () => {
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(css, /#problem-description/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test("web app polls all memory metadata and persists workspace cache", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /syncMemoryPages/);
  assert.match(script, /api\/memory\/pages/);
  assert.doesNotMatch(script, /api\/memory\/current/);
  assert.match(script, /localStorage/);
  assert.match(script, /restoreWorkspaceCache/);
});

test("memory polling refreshes metadata without reselecting or reloading the workspace", () => {
  const script = fs.readFileSync("web/app.js", "utf8");
  const syncBody = script.match(/async function syncMemoryPages[\s\S]*?\n\}/)?.[0] || "";

  assert.match(syncBody, /memoryPagesVersion/);
  assert.match(syncBody, /mergeMemoryProblems/);
  assert.match(syncBody, /renderProblemList\(\)/);
  assert.match(syncBody, /updateLibraryCount\(\)/);
  assert.match(syncBody, /renderDailyProgress\(\)/);
  assert.match(syncBody, /renderDailySession\(\)/);
  assert.doesNotMatch(syncBody, /selectProblem\(/);
  assert.doesNotMatch(syncBody, /loadTemplate\(/);
});

test("web app preserves captured metadata and checks sample IO before loading it", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /frontendId:\s*page\.frontendId/);
  assert.match(script, /page\.difficulty/);
  assert.match(script, /Array\.isArray\(page\.tags\)/);
  assert.match(script, /sample:\s*page\.sample/);
  assert.match(script, /sampleIoForProblem\(state\.selected\)/);
});

test("web UI explains why LeetCode examples are not loaded as ACM input", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(html, /id="sample-io-note"[^>]*aria-live="polite"/);
  assert.match(css, /\.io-note/);
  assert.match(script, /sampleIoForProblem/);
  assert.match(script, /isStaleLeetCodeSampleCache/);
  assert.match(script, /sampleIoNote:\s*document\.querySelector\("#sample-io-note"\)/);
});

test("web app renders semantic identity from id difficulty and tags", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /problemIdentity/);
  assert.match(script, /function renderProblemIdentity\(/);
  assert.match(script, /elements\.title\.textContent\s*=\s*identity\.heading/);
  assert.match(script, /elements\.difficulty\.textContent\s*=\s*identity\.difficulty/);
  assert.match(script, /document\.createElement\("span"\)/);
  assert.match(script, /tagNode\.textContent\s*=\s*tag/);
  assert.doesNotMatch(script, /problem\.rank\.frequency/);
  assert.doesNotMatch(script, /frequency \$\{problem\.rank\.frequency\}/);
});

test("web editor renders line numbers next to code", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(html, /id="line-numbers"/);
  assert.match(css, /\.line-numbers/);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(css, /\.code-scroll\s*\{[\s\S]*height:\s*100%/);
  assert.match(css, /#code,\s*#code-highlight,\s*\.line-numbers\s*\{[\s\S]*height:\s*100%/);
  assert.match(css, /#code\s*\{[\s\S]*resize:\s*none/);
  assert.match(css, /#code-highlight\s*\{[\s\S]*color:\s*#d8dee9/);
  assert.match(css, /#code\s*\{[\s\S]*color:\s*transparent/);
  assert.match(css, /#code\s*\{[\s\S]*caret-color:\s*#f8fafc/);
  assert.match(css, /#code::selection\s*\{[\s\S]*color:\s*transparent/);
  assert.match(script, /lineNumbers:\s*document\.querySelector\("#line-numbers"\)/);
  assert.match(script, /syncLineNumbers/);
});

test("web editor keeps caret aligned with a bounded textarea scroller", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(html, /<textarea id="code"[^>]*wrap="off"/);
  assert.doesNotMatch(html, /<textarea id="code"[^>]*wrap="soft"/);
  assert.match(css, /\.bracket-match/);
  assert.match(css, /white-space:\s*pre/);
  assert.match(css, /overflow-wrap:\s*normal/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /#code-highlight\s*\{[\s\S]*padding:\s*0/);
  assert.match(css, /#code-highlight\s*\{[\s\S]*max-height:\s*none/);
  assert.match(css, /#code-highlight\s*\{[\s\S]*background:\s*transparent/);
  assert.match(css, /#code-highlight code\s*\{[\s\S]*min-width:\s*max-content/);
  assert.match(css, /#code-highlight code\s*\{[\s\S]*font:\s*inherit/);
  assert.match(css, /#code-highlight code\s*\{[\s\S]*white-space:\s*inherit/);
  assert.match(css, /\.code-editor\s*\{[\s\S]*resize:\s*none/);
  assert.match(script, /codeEditor:\s*document\.querySelector\("#code-editor"\)/);
  assert.match(script, /findMatchingBracket/);
  assert.match(script, /getBracketMatch/);
  assert.match(css, /#code\s*\{[\s\S]*overflow:\s*auto/);
  assert.doesNotMatch(script, /autoSizeCodeEditor/);
  assert.match(script, /addEventListener\("select", syncHighlight\)/);
  assert.match(script, /addEventListener\("keyup", syncHighlight\)/);
});

test("web UI exposes host, built-in, and Docker runner modes", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(html, /id="runner"/);
  assert.match(html, /<option value="local">本机环境<\/option>/);
  assert.match(html, /<option value="builtin">内置环境<\/option>/);
  assert.match(html, /<option value="docker">Docker runner<\/option>/);
  assert.match(script, /runner:\s*document\.querySelector\("#runner"\)/);
  assert.match(script, /runner:\s*apiRunnerForUiMode\(elements\.runner\.value\)/);
  assert.match(script, /acmcoder\.web\.runner/);
  assert.match(css, /\.status\.NO_RUNNER/);
});

test("web UI shows environment doctor status for runner modes", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(html, /id="runner-health"/);
  assert.match(script, /api\/doctor/);
  assert.match(script, /recommendedRunnerByLanguage/);
  assert.match(script, /renderRunnerHealth/);
  assert.match(script, /missingCommands/);
  assert.match(css, /\.runner-health/);
  assert.match(css, /\.runner-health\.warn/);
});

test("web UI explains Docker app uses its built-in environment", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /deployment\?\.mode === "docker-app"/);
  assert.match(script, /当前运行在 Docker app 容器中/);
  assert.match(script, /内置环境/);
  assert.match(script, /builtinOption\.disabled/);
  assert.match(script, /localOption\.disabled/);
  assert.match(script, /dockerOption\.disabled/);
});

test("web UI exposes lightweight optional model advice", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(html, /id="assist-key"/);
  assert.match(html, /id="assist-base-url"/);
  assert.match(html, /id="assist-model"/);
  assert.match(html, /id="save-assist-settings"/);
  assert.match(html, /id="assist-question"/);
  assert.match(html, /id="assist-question"[^>]*placeholder="请看一下我的代码，指出可能的问题和修改建议。"[^>]*><\/textarea>/);
  assert.doesNotMatch(html, /<textarea id="assist-question"[^>]*>请看一下我的代码/);
  assert.match(html, /id="ask-assist"/);
  assert.match(html, /id="assist-transcript"/);
  assert.match(html, /id="assist-status"/);
  assert.match(html, /id="cancel-assist"/);
  assert.match(script, /api\/assist\/settings/);
  assert.match(script, /api\/assist/);
  assert.match(script, /askAssist/);
  assert.match(script, /saveAssistSettings/);
  assert.match(script, /problemTitle:\s*state\.selected\?\.title/);
  assert.match(css, /\.assist-panel/);
  assert.match(css, /\.assist-transcript/);
});

test("web UI exposes daily planner controls", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(html, /id="daily-panel"/);
  assert.match(html, /id="daily-count"/);
  assert.match(html, /id="daily-difficulty"/);
  assert.match(html, /id="daily-tags"/);
  assert.match(html, /id="generate-daily"/);
  assert.match(html, /id="import-catalog"/);
  assert.match(html, /id="catalog-file"/);
  assert.match(html, /id="daily-list"/);
  assert.match(css, /\.daily-panel/);
  assert.match(css, /\.daily-item/);
  assert.match(script, /api\/daily-plan\/generate/);
  assert.match(script, /api\/recommendation\/import/);
  assert.match(script, /renderDailyPlan/);
});

test("web UI exposes problem selection, batch delete, and export controls", () => {
  const html = fs.readFileSync("web/index.html", "utf8");
  const script = fs.readFileSync("web/app.js", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.match(html, /id="select-problems"/);
  assert.match(html, /id="delete-problems"/);
  assert.match(html, /id="export-problems"/);
  assert.match(html, /id="import-problems"/);
  assert.match(html, /id="import-file"/);
  assert.match(script, /selectionMode:\s*false/);
  assert.match(script, /selectedProblemIds:\s*new Set\(\)/);
  assert.match(script, /api\/problems\/export/);
  assert.match(script, /api\/problems\/import/);
  assert.match(script, /api\/problems/);
  assert.match(script, /method:\s*"DELETE"/);
  assert.match(script, /method:\s*"POST"/);
  assert.match(script, /deleteSelectedProblems/);
  assert.match(script, /exportProblems/);
  assert.match(script, /importProblems/);
  assert.match(script, /FileReader/);
  assert.match(script, /problemIdForProblem/);
  assert.match(css, /\.memory-actions/);
  assert.match(css, /\.memory-select/);
  assert.match(css, /\.problem-item[\s\S]*color:\s*var\(--ink\)/);
});

test("web UI records accepted counts and highlights them", () => {
  const script = fs.readFileSync("web/app.js", "utf8");
  const css = fs.readFileSync("web/styles.css", "utf8");

  assert.doesNotMatch(script, /acmcoder\.web\.acCounts/);
  assert.doesNotMatch(script, /localStorage\.getItem\(CACHE_KEYS\.acCounts/);
  assert.match(script, /body\.result\.status === "AC"/);
  assert.match(script, /body\.progress/);
  assert.match(script, /problem\.progress/);
  assert.match(script, /getAcCount\(problem\)/);
  assert.match(script, /class="ac-count"/);
  assert.match(css, /\.ac-count/);
});

test("web editor skips over already inserted closing brackets", () => {
  const script = fs.readFileSync("web/app.js", "utf8");

  assert.match(script, /closingPairs/);
  assert.match(script, /handleEditorBeforeInput/);
  assert.match(script, /event\.inputType === "insertText"/);
  assert.match(script, /elements\.code\.value\[elements\.code\.selectionStart\] === event\.key/);
  assert.match(script, /elements\.code\.value\[elements\.code\.selectionStart\] === event\.data/);
  assert.match(script, /setSelectionRange\(elements\.code\.selectionStart \+ 1/);
  assert.match(script, /addEventListener\("beforeinput", handleEditorBeforeInput\)/);
});

test("web generic Java template is compact for narrow editor views", () => {
  const script = fs.readFileSync("web/app.js", "utf8");
  const javaTemplate = script.match(/java: `([\s\S]*?)`,\r?\n\s+cpp:/)?.[1] || "";

  assert.match(javaTemplate, /import java\.util\.Scanner/);
  assert.match(javaTemplate, /Scanner sc = new Scanner\(System\.in\)/);
  assert.doesNotMatch(javaTemplate, /BufferedReader/);
  assert.doesNotMatch(javaTemplate, /InputStreamReader/);
});
