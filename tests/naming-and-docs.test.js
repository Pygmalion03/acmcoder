import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {extensionVersion} from "../scripts/release-version.mjs";

test("package and CLI use acmcoder naming", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));

  assert.equal(pkg.name, "acmcoder");
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/);
  assert.equal(manifest.version, extensionVersion(pkg.version));
  assert.equal(manifest.version_name,pkg.version);
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
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const readme = fs.readFileSync("README.md", "utf8");
  const deployment = fs.readFileSync("docs/deployment.md", "utf8");
  const upgrade = fs.readFileSync("docs/upgrade.md", "utf8");
  const compose = fs.readFileSync("docker-compose.prebuilt.yml", "utf8");
  const workflow = fs.readFileSync(".github/workflows/publish-images.yml", "utf8");

  assert.match(readme, /github\.com\/Pygmalion03\/acmcoder\.git/);
  assert.ok(readme.includes(`releases/tag/v${version}`));
  assert.match(readme, /node scripts\/build-clients\.mjs local-web/);
  assert.match(readme, /docker-compose\.prebuilt\.yml -f docker-compose\.release\.yml/);
  assert.ok(deployment.includes(`ghcr.io/pygmalion03/acmcoder-app:v${version}`));
  const releaseNotes = fs.readFileSync(`docs/releases/v${version}.md`, "utf8");
  assert.ok(releaseNotes.includes(`ACMCoder v${version}`));
  assert.match(readme, /docs\/upgrade\.md/);
  for(const directory of ['data/unified/','data/memory/','data/recommendation/'])assert.ok(upgrade.includes(directory));
  assert.match(upgrade, /升级前的数据副本/);
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
  assert.match(combined, /dist\/extension\//);
});
