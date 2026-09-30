import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.ACMCODER_SMOKE_URL || "http://127.0.0.1:43117";

async function fetchJson(pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json();
  assert.equal(response.ok, true, `${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function waitForDoctor() {
  let lastError;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson("/api/doctor");
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw lastError || new Error("ACMCoder did not become ready.");
}

const doctor = await waitForDoctor();
assert.equal(doctor.deployment.mode, "docker-app");

for (const language of ["java", "cpp", "python"]) {
  assert.equal(doctor.local[language].ready, true, `${language} toolchain is not ready`);
}

const recommendation = await fetchJson("/api/recommendation/catalog");
assert.ok(recommendation.catalog.entries.length > 0, "bundled recommendation catalog is empty");

const problems = await fetchJson("/api/problems");
assert.ok(problems.problems.some((problem) => problem.slug === "reverse-linked-list"), "bundled seed problems are missing");

const { token } = await fetchJson("/api/session");
const metadata=await fetchJson('/version.json');
assert.equal(metadata.target,'local-web');
if(process.env.ACMCODER_BUILD_COMMIT)assert.equal(metadata.commit,process.env.ACMCODER_BUILD_COMMIT);
assert.deepEqual(metadata.languages,['python','cpp','java']);
assert.match(await fetch(baseUrl).then(r=>r.text()),/workspace\.js/);
const rpc=(method,args)=>fetchJson('/api/unified/store',{method:'POST',headers:{'content-type':'application/json','x-acmcoder-token':token},body:JSON.stringify({namespace:'local-guest',method,args})}).then(body=>body.result);
const id='image-smoke-problem';
await rpc('putRecord',[{kind:'problem',id,payload:{title:'容器持久化自测',statement:'读取两个整数并输出和。'}}]);
await rpc('saveDraft',[{problemId:id,language:'python',code:'print(sum(map(int,input().split())))',stdin:'10 32\n',expected:'42\n',mode:'normal'}]);
assert.equal((await rpc('getDraft',[{problemId:id,language:'python'}])).stdin,'10 32\n');
assert.ok((await rpc('exportBackup',[])).records.some(record=>record.kind==='draft'&&record.problemId===id));
const cases = [
  {
    language: "java",
    code: 'public class Main { public static void main(String[] args) { System.out.println("smoke"); } }',
  },
  {
    language: "cpp",
    code: '#include <iostream>\nint main() { std::cout << "smoke\\n"; }',
  },
  {
    language: "python",
    code: 'print("smoke")',
  },
];

for (const testCase of cases) {
  const body = await fetchJson("/api/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acmcoder-token": token,
    },
    body: JSON.stringify({
      ...testCase,
      expected: "smoke\n",
      runner: "local",
      timeoutMs: 10000,
    }),
  });
  assert.equal(body.result.status, "AC", `${testCase.language} smoke failed: ${JSON.stringify(body.result)}`);
}

console.log("ACMCoder app image smoke passed: unified UI, source version, durable draft API, Java, C++, Python.");
