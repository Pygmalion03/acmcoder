import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("repository includes a Docker app image for zero-local-toolchain users", () => {
  const dockerfile = fs.readFileSync("Dockerfile.app", "utf8");

  assert.match(dockerfile, /FROM\s+node/i);
  assert.match(dockerfile, /g\+\+/);
  assert.match(dockerfile, /openjdk/i);
  assert.match(dockerfile, /python3/);
  assert.match(dockerfile, /ACMCODER_HOST=0\.0\.0\.0/);
  assert.match(dockerfile, /ACMCODER_DEPLOYMENT_MODE=docker-app/);
  assert.match(dockerfile, /ACMCODER_BUNDLED_RECOMMENDATION_CATALOG_FILE=\/app\/bundled-data\/recommendation\/default-catalog\.json/);
  assert.match(dockerfile, /bin\/acmcoder\.js/);
});

test("docker compose exposes the web server and persists mutable data without hiding bundled problems", () => {
  const compose = fs.readFileSync("docker-compose.yml", "utf8");

  assert.match(compose, /Dockerfile\.app/);
  assert.match(compose, /127\.0\.0\.1:43117:43117/);
  assert.doesNotMatch(compose, /^\s*-\s*["']?43117:43117["']?\s*$/m);
  assert.match(compose, /\.\/data\/memory:\/app\/data\/memory/);
  assert.match(compose, /\.\/data\/recommendation:\/app\/data\/recommendation/);
  assert.doesNotMatch(compose, /\.\/data:\/app\/data/);
});

test("repository publishes prebuilt full-language app and runner images through GitHub Actions", () => {
  const workflow = fs.readFileSync(".github/workflows/publish-images.yml", "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /tags:\s*\n\s*-\s*["']v\*["']/);
  assert.match(workflow, /packages:\s*write/);
  assert.match(workflow, /ghcr\.io/);
  assert.match(workflow, /name:\s*app[\s\S]*dockerfile:\s*Dockerfile\.app/);
  assert.match(workflow, /name:\s*runner[\s\S]*dockerfile:\s*Dockerfile\b/);
  assert.match(workflow, /linux\/amd64,linux\/arm64/);
  assert.match(workflow, /verify:/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /smoke-app-image\.mjs/);
  assert.match(workflow, /\.ci-data\/memory:\/app\/data\/memory/);
  assert.match(workflow, /\.ci-data\/recommendation:\/app\/data\/recommendation/);
  assert.doesNotMatch(workflow, /\.ci-data:\/app\/data(?:\s|["'])/);
  const smoke = fs.readFileSync("scripts/smoke-app-image.mjs", "utf8");
  assert.match(smoke, /\/api\/problems/);
  assert.match(smoke, /reverse-linked-list/);
  assert.match(workflow, /needs:\s*verify/);
});

test("prebuilt compose pulls the full-language app image without local build", () => {
  const compose = fs.readFileSync("docker-compose.prebuilt.yml", "utf8");

  assert.match(compose, /ghcr\.io\/pygmalion03\/acmcoder-app:latest/);
  assert.match(compose, /127\.0\.0\.1:43117:43117/);
  assert.doesNotMatch(compose, /^\s*-\s*["']?43117:43117["']?\s*$/m);
  assert.match(compose, /\.\/data\/memory:\/app\/data\/memory/);
  assert.match(compose, /\.\/data\/recommendation:\/app\/data\/recommendation/);
  assert.doesNotMatch(compose, /\.\/data:\/app\/data/);
  assert.doesNotMatch(compose, /\bbuild:/);
});
