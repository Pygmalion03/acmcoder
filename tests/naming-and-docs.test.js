import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("package and CLI use acmcoder naming", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));

  assert.equal(pkg.name, "acmcoder");
  assert.equal(pkg.version, "3.0.3");
  assert.equal(manifest.version, "3.0.3");
  assert.equal(pkg.bin.acmcoder, "./bin/acmcoder.js");
  assert.equal(pkg.scripts.cli, "node bin/acmcoder.js");
  assert.ok(fs.existsSync("bin/acmcoder.js"));
  assert.ok(!fs.existsSync("bin/accoder.js"));
});

test("repository declares platform-independent line ending rules", () => {
  assert.ok(fs.existsSync(".gitattributes"));
  const attributes = fs.readFileSync(".gitattributes", "utf8");

  assert.match(attributes, /^\* text=auto$/m);
  assert.match(attributes, /^\*\.js text eol=lf$/m);
  assert.match(attributes, /^\*\.json text eol=lf$/m);
  assert.match(attributes, /^\*\.md text eol=lf$/m);
});

test("documentation points users to the acmcoder repo and packages", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const deployment = fs.readFileSync("docs/deployment.md", "utf8");
  const compose = fs.readFileSync("docker-compose.prebuilt.yml", "utf8");
  const workflow = fs.readFileSync(".github/workflows/publish-images.yml", "utf8");

  assert.match(readme, /github\.com\/Pygmalion03\/acmcoder\.git/);
  assert.match(readme, /ghcr\.io\/pygmalion03\/acmcoder-app:latest/);
  assert.match(readme, /ghcr\.io\/pygmalion03\/acmcoder-runner:latest/);
  assert.match(readme, /ghcr\.io\/pygmalion03\/acmcoder-app:v3\.0\.3/);
  assert.match(deployment, /ghcr\.io\/pygmalion03\/acmcoder-app:v3\.0\.3/);
  assert.match(readme, /源码分支[^\n]*`v3`/);
  assert.match(readme, /1\s*(?:至|–|-)\s*5\s*道题/);
  assert.match(readme, /GET\s+\/api\/session/);
  assert.match(readme, /X-ACMCoder-Token/i);
  assert.match(compose, /ghcr\.io\/pygmalion03\/acmcoder-app:latest/);
  assert.match(workflow, /acmcoder-\$\{\{ matrix\.name \}\}/);
  assert.doesNotMatch(readme, /github\.com\/Pygmalion03\/accoder/);
  assert.doesNotMatch(readme, /v2\.2\.4/);
  assert.doesNotMatch(deployment, /v2\.2\.4/);
  assert.doesNotMatch(compose, /accoder-/);
  assert.doesNotMatch(workflow, /accoder-/);
});

test("browser extension install docs cover Edge and Chrome manual loading", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const extensionDoc = fs.readFileSync("docs/edge-extension.md", "utf8");
  const combined = `${readme}\n${extensionDoc}`;

  assert.match(combined, /edge:\/\/extensions\//);
  assert.match(combined, /chrome:\/\/extensions\//);
  assert.match(combined, /Developer mode/i);
  assert.match(combined, /Load unpacked/i);
  assert.match(combined, /extension\//);
  assert.match(readme, /浏览器插件侧栏/);
  assert.match(readme, /## 安装浏览器插件/);
  assert.match(readme, /## 另一台设备怎么更新/);
  assert.match(extensionDoc, /浏览器插件是 ACMCoder 面向 LeetCode 日常练习的主要入口之一/);
});
