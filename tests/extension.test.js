import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("edge extension manifest exposes a side panel on leetcode pages", () => {
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "workspace.html");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.host_permissions.includes("https://leetcode.cn/*"));
  assert.ok(manifest.host_permissions.includes("https://leetcode.com/*"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:43117/*"));
});

test("background opens the side panel directly from the extension icon and keeps it global", () => {
  const script = fs.readFileSync("extension/background.js", "utf8");

  assert.match(script, /isLeetCodeProblemUrl/);
  assert.match(script, /chrome\.action\.onClicked/);
  assert.match(script, /openAcmcoderForTab/);
  assert.match(script, /chrome\.sidePanel\.open\(\{\s*windowId/);
  assert.match(script, /setPanelBehavior/);
  assert.match(script, /openPanelOnActionClick:\s*true/);
  assert.match(script, /setDefaultSidePanelOpen/);
  assert.match(script, /enabled:\s*true/);
  assert.doesNotMatch(script, /enabled:\s*false/);
  assert.doesNotMatch(script, /openedTabs/);
  assert.doesNotMatch(script, /OPENED_TABS_KEY/);
  assert.doesNotMatch(script, /chrome\.tabs\.onActivated/);
  assert.match(script, /chrome\.runtime\.onInstalled\.addListener/);
  assert.match(script, /chrome\.runtime\.onStartup/);
  assert.doesNotMatch(script, /^configureSidePanelDefaults\(\);/m);
  assert.match(script, /ACMCODER_PANEL_OPENED/);
});

test("edge sidebar keeps only compact capture status plus the practice panel", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");

  assert.match(html, /id="memory-mode"/);
  assert.match(html, /LLM API Key/);
  assert.match(html, /id="save"/);
  assert.match(html, /practice-panel/);
  assert.match(html, /id="run-code"/);
  assert.match(html, /id="code"/);
  assert.match(html, /id="stdin"/);
  assert.match(html, /id="stdout"/);
  assert.doesNotMatch(html, /<textarea id="content"/);
  assert.doesNotMatch(html, /id="summary"/);
});

test("content script reads question metadata from leetcode", () => {
  const script = fs.readFileSync("extension/content-script.js", "utf8");

  assert.match(script, /ACMCODER_CAPTURE/);
  assert.match(script, /captureLeetCodeProblem/);
  assert.match(script, /fetchQuestionData/);
  assert.match(script, /LEETCODE_CN_ORIGIN/);
  assert.match(script, /\/graphql\//);
  assert.match(script, /topicTags/);
  assert.match(script, /translatedName/);
  assert.match(script, /双指针/);
  assert.match(script, /字符串/);
  assert.match(script, /动态规划/);
  assert.match(script, /extractFirstExample/);
});

test("sidebar injects the content script when message receiver is missing", () => {
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(script, /ensureContentScript/);
  assert.match(script, /chrome\.scripting\.executeScript/);
  assert.match(script, /Receiving end does not exist/);
});

test("sidebar caches the last captured problem", () => {
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(script, /lastPage/);
  assert.match(script, /loadCachedPage/);
  assert.match(script, /ACMCODER_PANEL_OPENED/);
});

test("sidebar can run code through the local runner", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");
  const css = fs.readFileSync("extension/sidebar.css", "utf8");
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(html, /id="runner"/);
  assert.match(html, /id="ac-count"/);
  assert.match(html, /<option value="local">本机环境<\/option>/);
  assert.match(html, /<option value="builtin">内置环境<\/option>/);
  assert.match(html, /<option value="docker">Docker runner<\/option>/);
  assert.match(script, /runCode/);
  assert.match(script, /api\/run/);
  assert.match(script, /api\/session/);
  assert.match(script, /x-acmcoder-token/);
  assert.match(script, /sidebarWorkspaceKey/);
  assert.match(script, /runner:\s*"acmcoder\.sidebar\.runner"/);
  assert.match(script, /runner:\s*document\.querySelector\("#runner"\)/);
  assert.match(script, /runner:\s*apiRunnerForUiMode\(elements\.runner\.value\)/);
  assert.match(script, /Running \$\{runnerLabel\(elements\.runner\.value\)\}/);
  assert.match(script, /body\.progress/);
  assert.match(script, /renderProgress/);
  assert.match(css, /\.ac-count/);
  assert.match(css, /\.run-status\.NO_RUNNER/);
});

test("sidebar shows runner environment status from the local doctor API", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");
  const css = fs.readFileSync("extension/sidebar.css", "utf8");
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(html, /id="runner-health"/);
  assert.match(script, /api\/doctor/);
  assert.match(script, /recommendedRunnerByLanguage/);
  assert.match(script, /renderRunnerHealth/);
  assert.match(script, /missingCommands/);
  assert.match(css, /\.runner-health/);
  assert.match(css, /\.runner-health\.warn/);
});

test("sidebar explains Docker app uses its built-in environment", () => {
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(script, /deployment\?\.mode === "docker-app"/);
  assert.match(script, /当前本地服务运行在 Docker app 容器中/);
  assert.match(script, /builtinOption\.disabled/);
  assert.match(script, /localOption\.disabled/);
  assert.match(script, /dockerOption\.disabled/);
});

test("sidebar exposes lightweight optional model advice through the local service", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");
  const css = fs.readFileSync("extension/sidebar.css", "utf8");
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(html, /id="assist-key"/);
  assert.match(html, /id="assist-base-url"/);
  assert.match(html, /id="assist-model"/);
  assert.match(html, /id="save-assist-settings"/);
  assert.match(html, /id="assist-question"/);
  assert.match(html, /id="assist-question"[^>]*placeholder="请看一下我的代码，指出可能的问题和修改建议。"[^>]*><\/textarea>/);
  assert.doesNotMatch(html, /<textarea id="assist-question"[^>]*>请看一下我的代码/);
  assert.match(html, /id="ask-assist"/);
  assert.match(html, /id="assist-answer"/);
  assert.match(script, /api\/assist\/settings/);
  assert.match(script, /api\/assist/);
  assert.match(script, /askAssist/);
  assert.match(script, /saveApiKey/);
  assert.match(css, /\.assist-panel/);
  assert.match(css, /\.assist-answer/);
});

test("sidebar editor renders line numbers next to code", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");
  const css = fs.readFileSync("extension/sidebar.css", "utf8");
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

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

test("sidebar editor keeps caret aligned by disabling soft wrapping", () => {
  const html = fs.readFileSync("extension/sidebar.html", "utf8");
  const css = fs.readFileSync("extension/sidebar.css", "utf8");
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

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
  assert.match(script, /autoSizeCodeEditor/);
  assert.match(script, /addEventListener\("select", syncHighlight\)/);
  assert.match(script, /addEventListener\("keyup", syncHighlight\)/);
});

test("sidebar editor skips over already inserted closing brackets", () => {
  const script = fs.readFileSync("extension/sidebar.js", "utf8");

  assert.match(script, /closingPairs/);
  assert.match(script, /handleEditorBeforeInput/);
  assert.match(script, /event\.inputType === "insertText"/);
  assert.match(script, /elements\.code\.value\[elements\.code\.selectionStart\] === event\.key/);
  assert.match(script, /elements\.code\.value\[elements\.code\.selectionStart\] === event\.data/);
  assert.match(script, /setSelectionRange\(elements\.code\.selectionStart \+ 1/);
  assert.match(script, /addEventListener\("beforeinput", handleEditorBeforeInput\)/);
});

test("sidebar generic Java template is compact for the narrow side panel", () => {
  const script = fs.readFileSync("extension/sidebar.js", "utf8");
  const javaTemplate = script.match(/java: `([\s\S]*?)`,\r?\n\s+cpp:/)?.[1] || "";

  assert.match(javaTemplate, /import java\.util\.Scanner/);
  assert.match(javaTemplate, /Scanner sc = new Scanner\(System\.in\)/);
  assert.doesNotMatch(javaTemplate, /BufferedReader/);
  assert.doesNotMatch(javaTemplate, /InputStreamReader/);
});
