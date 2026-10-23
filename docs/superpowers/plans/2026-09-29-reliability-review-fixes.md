# ACMCoder 最新版本审查问题修复计划

> 2026-09-29 范围更新：用户已明确授权子 agent 发布、部署到 NAS 并更新 Cloudflare 网站。下文“不发布/不改 Q4”的限制仅描述最初修复阶段，已被该授权覆盖。v3.0.4 已发布（提交 `e2a4542`，Actions `36524069722`），并完成 NAS 部署及 Access 登录后公网验收：容器版本 3.0.4、健康，三语言实机 smoke 通过；公网 Python 运行 AC，app.js 哈希与发布源码一致。部署记录位于相邻 `003-nas-cloudflare-stack/deployments/acmcoder/upgrade-v3.0.4.md`。下文未完成的 WSL 常驻开发服务重启与生产 NAS 部署是不同事项。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户指定由一个 `gpt-6-sol`、`high` 子代理执行整份计划；不要再派生实现或审查代理。

**Goal:** 修复本次已复现的五个问题，使草稿保存、运行结果、重练和网络错误处理符合已有可靠性设计，再完成有证据的验收。

**Architecture:** 沿用现有原生 JS 前端、纯状态模块和 Node HTTP 服务。对选题加载采用准备后提交，对运行和 AI 使用独立生命周期标识，不把会被编辑替换的 session 对象引用当成轮次。服务器只信任本机及显式配置的部署主机。

**Tech Stack:** JavaScript ES modules、Node >=20、node:test、原生浏览器 API、Playwright、WSL2、Mutagen。

**Spec:** `docs/superpowers/specs/2026-09-11-practice-experience-reliability-design.md`；本计划是该设计的缺陷修复补充，不是完整重写。

## Global Constraints

- 基线：`8f066c04f04fc529839b670c10cc8d6dc4976712`，当前 `v3` 领先远端 20 个提交。保留这些提交和现有 `.serena/`、`AGENTS.md` 未跟踪文件。
- Mac 源码目录：`/Users/pygmalion/Documents/Codex/Projects/002-acmcoder`。只在 Mac 编辑；不在 WSL 做 Git 或源文件修改。
- 清单映射：SSH `dev-wsl`，运行目录 `/home/pygmalion/runs/002-acmcoder/v3`，Mutagen `acmcoder-v3`，现有服务 `acmcoder-v3.service`，访问 `http://127.0.0.1:43117`。
- 复用现有工作区与运行映射；此次只有一个写入者，不另建 worktree，不创建另一条同步会话。
- 单测、服务、编译和执行均在 WSL。Mac 可使用已有浏览器自动化运行时，经现有隧道访问 WSL。
- 不新增运行依赖，不做框架迁移、编辑器重构、全站 UI 改版或版本发布。
- 不读真实密钥、`.env` 或设置文件；不调用真实付费模型；不改正式题库、计划和 AC 进度。浏览器使用全新临时上下文；运行探针将 slug 改为 `scratch`，避免写入真实题目进度。
- 不 push、打 tag、发布 GHCR、改 Q4/Cloudflare，或修改其他项目。默认保留修复 diff 供主代理复核，不自动 commit。
- 在源码同步完成后检查。按“成组实现 → 最小相关检查 → 一次集成验收”推进，避免每个小改动重复完整测试或部署。
- 如重启服务需要 sudo/密码，不代填、不提权；报告准确命令与唯一阻塞，其余离线/临时隔离服务验证继续完成。
- 用户已经授权详细计划后直接交给指定子代理执行；不再次索取计划批准。范围内可逆实现选择由执行者直接处理并在结果中说明。

## Review Focus

1. 选题 GET 或模板失败、乱序返回、等待期间输入：旧草稿完整，新题不接受旧请求；任务 1。
2. 同轮运行期间输入/AI 回复、连续运行、换题再返回、恢复上一轮：结果归属正确，不能永久 RUNNING；任务 2。
3. 重练模板/保存失败：保留原轮和原 AI 请求；成功才取消旧 AI，且旧 finally 不干扰新请求；任务 2。
4. 收到 200 headers 后响应体断流、取消、无效 JSON：不能误报成功，POST 不重复提交；任务 3。
5. 无 Origin 的未知 Host、本机 IPv6、显式部署主机、伪造转发头：限制有效且支持正常部署；任务 4。

## 现有复现证据与验收资产

- 本轮基线 WSL `npm test`：226/226，通过但未覆盖以下缺陷。
- `/tmp/acmcoder-review-20260929/browser-review.cjs`：真实 Python 返回 AC，但运行时编辑后 UI 为 RUNNING；桌面/手机滚动；重练未取消旧 AI。
- `/tmp/acmcoder-review-20260929/browser-boundaries.cjs`：两轮对话及恢复的正常流程，模拟切题 503 后原草稿被覆盖。
- 这些脚本若仍存在可复制后修改成断言式验收脚本，不要盲目当作测试通过：原文件主要打印现象。
- API 实验：真实 HTTP 响应头 200 后发送部分 JSON 并断开，当前客户端 resolve `{}` 并上报 online。
- 安全实验：隔离服务的假 runner，localhost 连接配任意匹配 Host/Origin，当前 session/run 都 200。这里只证实服务端边界缺陷，不声称完整浏览器 DNS 重绑定已复现。

## 文件职责

| 文件 | 修改职责 |
| --- | --- |
| `web/app.js` | 选题提交边界、运行身份、重练取消 AI、明确可见错误 |
| `web/api-client.js` | 响应体错误分类与既有有限重试 |
| `src/server/server.js` | 配置及验证可信主机，不信任任意 Host/转发头 |
| `tests/frontend-redesign.test.js` | 扩展现有 deferred-request 行为测试，不以正则代替行为断言 |
| `tests/api-client.test.js` | 断流、无效 JSON、取消及重试次数 |
| `tests/server.test.js` | 默认/配置主机的请求矩阵与假 runner 调用次数 |
| `README.md`, `docs/deployment.md`, `docker-compose*.yml` | 可信主机配置与 Docker 传入方式，文档只改本次相关部分 |
| 本计划 | 勾选进度及末尾记录验证结果、限制 |

## Task 1：选题采用准备后提交，保护草稿

**Interfaces:** 保留 `selectProblem(slug, options = {})` 的外部用法；新增单调递增的选题加载 ID（与运行/轮次身份分开）。`beginPracticeContextChange()` 只在目标题所需资源就绪、即将提交时改变当前可编辑上下文。旧工作区在准备期间继续属于旧题。

- [x] **1.1 行为回归测试。** 扩展现有 test harness 使题目 GET 和模板请求均可延迟/拒绝。断言：A 保存完整代码；选 B 的 GET 或模板失败后，A 标题、代码、stdin、expected、对话均不变；再编辑 A/重新选择 A，完整草稿仍在。失败要有用户可见中文提示，不能只产生 unhandled rejection。
- [x] **1.2 覆盖顺序与编辑。** B 加载未完成时继续编辑 A；B 成功后再回 A，保留等待期间的输入。B→C 快速切换，B 最后返回不能覆盖 C；跨语言切换同样不能让过期模板覆盖新编辑器。已有缓存的题目不应因不必要的模板请求失败而无法恢复。
- [x] **1.3 同步并运行新增测试，确认原实现失败。** `mutagen sync flush acmcoder-v3` 后在 WSL 跑相关测试名称，记录断言失败而非环境错误。
- [x] **1.4 最小实现。** 先解析目标 metadata/必要模板/目标身份，在有效加载 ID 下提交选择；提交前保存旧轮最新内容，再完成上下文变更和 UI 应用。失败保留可用旧工作区并展示错误。防止异步请求等待期间开始其他操作后仍错误提交。
- [x] **1.5 验证。** 同步后运行 `ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/frontend-redesign.test.js tests/practice-session.test.js'`。新增与既有乱序/迁移测试全部通过。

## Task 2：运行和 AI 使用独立请求/轮次身份

**Interfaces:** `runCode()` 保持接口；新增单调 `runRequestId` 和明确的练习轮次/上下文失效规则。代码编辑不改变轮次，换题/换语言/成功重练/恢复上一轮改变轮次。复用 `invalidateAssistRequest()`，使成功重练取消上一轮 AI。

- [x] **2.1 行为回归测试。** 同轮运行期间编辑代码、stdin 或收到 AI 答复后，服务器返回 AC/WA/错误仍应结束 RUNNING；不得覆盖后续编辑的代码。显示的是已提交代码的运行结果，允许明确说明“提交后代码已修改”。
- [x] **2.2 覆盖陈旧结果。** 连续发起两个运行仅最新响应可更新结果；换题、换语言、开始重练或恢复上一轮后旧运行不能污染新轮；编辑本身不得让响应永久丢弃。保持已有“旧运行不能完成新巩固轮”测试。
- [x] **2.3 AI 重练回归。** 已有一条回答，再发起一个 pending 请求；成功重练后旧 signal 被 abort、新一轮 ask 按钮立即可用，晚到成功/错误/finally 均不写入新对话、不重置新请求控件。模板失败或浏览器保存失败时，不清空旧轮，不取消仍属旧轮的 AI 请求。
- [x] **2.4 同步运行新增测试看失败，然后实现。** 用稳定的上下文/轮次和请求序号替代 `currentPracticeSession !== requestSession`。对 UI 成功转换的准确时间点作失效处理，不用粗暴禁用编辑来回避问题。
- [x] **2.5 同步并运行任务 1 的最小测试组。** 验证正常保存/恢复不误增轮次，重练成功才取消旧请求。

## Task 3：响应体失败保留真实错误语义

**Interfaces:** 保留 `createApiClient()`、`ApiError`、`getJson(url, options)`。可新增 `kind: "protocol"` 表示 HTTP 成功但不是有效 JSON；`network`、`cancelled` 与原有 HTTP 错误继续区分。

- [x] **3.1 新增失败测试。** 200 响应的 body stream 报 TypeError：GET 最多共 3 次；POST 仅 1 次并提示结果未知，不能触发 online:true。AbortError/已取消 signal：返回 cancelled，不重试。200 非法 JSON：返回可理解的协议错误，不返回 `{}`。401 非 JSON body 仍允许 `/api/run` 换 token 后最多重试一次；其他非 2xx 非 JSON 仍报告 HTTP 状态。
- [x] **3.2 实际 HTTP 测试。** 临时服务器写出 headers 和部分 JSON 后 destroy response；验证客户端按网络错误处理（POST 不重试），服务器监听动态 localhost 端口并在 finally 关闭。
- [x] **3.3 同步运行新增测试看失败，修复读取策略。** 不用 catch-all 空对象吞掉成功响应体错误；必要时仅为非 2xx 保留 HTTP fallback。`/api/session` 同样处理断流，并验证非空 token 才缓存；坏 token 响应不能持续污染缓存。
- [x] **3.4 验证。** 同步后 `ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/api-client.test.js'`，确认重试上限和不会重复执行的原有测试仍通过。

## Task 4：显式可信主机，兼顾本机与部署

**Interfaces:** `createAcmcoderServer({ trustedHosts })` 接受 hostname 数组；未指定时从 `ACMCODER_TRUSTED_HOSTS` 逗号分隔值读取。默认允许 `localhost`、`127.0.0.1`、`[::1]`（统一按 URL hostname 规范化）；监听 `0.0.0.0` 不等于信任任意域名。配置为额外精确 hostname，不支持通配符、URL 路径或从请求自动学习。

- [x] **4.1 默认拒绝测试。** 隔离服务绑定动态 localhost；未知 Host 无论有无 Origin，都不能访问 `/api/session` 和 `/api/run`；假 runner 调用数保持 0。恶意 matching Host/Origin 和伪造 `X-Forwarded-Host` 均不能绕过。未知主机在发 token 和处理 API 前就应拒绝。
- [x] **4.2 正常请求矩阵。** localhost/127.0.0.1/IPv6 主机可访问，带 Origin 时必须与 Host 的 host:port 匹配且为 http(s)。无 Origin 的本机 CLI 与受支持扩展 Origin 继续可用；扩展 Origin 不能绕过未知目标 Host。显式配置的 `practice.example.test` 可同源访问，未配置兄弟域名被拒绝；配置大小写和空白正常化，不接受 `*`。测试环境配置时隔离 env，不受开发机环境污染。
- [x] **4.3 同步运行新增测试看失败，实现最小主机检查。** 基于解析后的 hostname 做精确匹配；Host 缺失/无效返回 403。保留合法端口和同源检查，不信任转发头。不要添加账户系统或新的认证协议。
- [x] **4.4 文档与容器接线。** 在 README/部署文档解释默认本地模式，以及如何用 `ACMCODER_TRUSTED_HOSTS=practice.example.test` 开启已知部署域名；Compose 将该非敏感变量传入容器，默认空。不硬编码用户真实域名，不改现有生产设置。明确反向代理须传递配置中认可的 Host。
- [x] **4.5 验证。** 同步后 `ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test tests/server.test.js tests/docker-deployment.test.js tests/naming-and-docs.test.js'`，未知 Host 不发 token、不进入假 runner，合法请求仍通过。

## Task 5：集中验收与交付

- [x] **5.1 本地里程碑检查。** `git diff --check`；确认仅计划内文件变化。同步后一次 `npm test`，报告实际测试总数与失败数，不仅说全绿。
- [ ] **5.2 服务生效检查。** 服务端变更需重启 `acmcoder-v3.service`；只尝试现有无交互普通权限流程。若权限不足，保留用户服务，报告需要用户执行 `ssh dev-wsl 'sudo systemctl restart acmcoder-v3.service'`。不要索取密码或自行用 sudo 绕过。
- [x] **5.3 浏览器故障复现转为验收。** 新上下文访问 WSL 页面，模拟题目/模板 503 与延迟，验证 A 草稿保留；真实 Python `sleep(1); print(42)`，编辑期间返回 AC 后 UI 退出 RUNNING；二次运行反序、重练/恢复不会接收旧结果。复用临时脚本并加 assertions。
- [x] **5.4 重练正常与异常流程。** 受控 AI 回答两轮→刷新→重练→查看/恢复上一轮→再重练→真实运行 AC→巩固完成；pending AI 重练后立即可问，旧回复不污染。验证桌面与 390px 手机编辑器仍可滚动，页面无新增未处理异常。
- [ ] **5.5 网络与主机。** 真实 HTTP 断流验收以及 WSL 隔离 HTTP server 主机矩阵通过。令牌更新保留一次重试；不为测试随意中断用户隧道。受控断网/过期令牌与真实重启证据分别说明。
- [x] **5.6 交付报告。** 回报变更文件、五项缺陷分别如何修复、回归红绿证据、完整测试结果、真实浏览器结果、未覆盖项和服务是否已加载新版本。主代理复核再决定后续；不自动发布。

## 执行记录

- 2026-09-29：计划由主代理按已复现缺陷整理并自检；等待指定 `gpt-6-sol` / `high` 子代理执行。
- 2026-09-29：Task 1 首轮新增选题 GET/模板失败测试 0/3（旧实现提前清空或抛出 503）；修复后 3/3。切语言准备期的旧编辑器/旧语言控件测试先失败（空编辑器、`java !== python`），修复后通过。旧同题恢复测试改为使用当前内存轮次；删除了仅检查源码正则的旧测试，改由行为断言覆盖。
- 2026-09-29：Task 2 运行期间编辑测试先失败（`RUNNING !== AC`），成功重练取消 pending AI 测试先失败（signal 未 abort），旧 AI 状态清理测试先失败（仍显示“正在请求模型”）；修复后前端/练习状态组 60/60。随后加入反序运行和旧 AI `finally` 不干扰新请求的断言测试，相关组 71/71。失败重练保留 AI 的测试通过。
- 2026-09-29：Task 3 200 响应体 TypeError 与非法 JSON 新增测试初跑 6/9；失败点是旧客户端把 body 失败吞成 `{}`。修复后 API 组 10/10，实际 HTTP 测试确认客户端先收到 200，再遇到断流，POST 仅调用一次；无效 token 不进入缓存，401 非 JSON 仍只做一次明确的 token 更新。
- 2026-09-29：Task 4 未知 Host 和配置主机矩阵新增测试初跑 0/2；修复后服务器/部署/文档组 30/30。额外 malformed `Host: localhost\\unknown.example.test` 无 Origin 回归先失败（200），禁止反斜杠后变为 403；相关前端/服务器组 71/71。测试覆盖未知 Host 无 Origin、同源 Origin、扩展 Origin、伪造 `X-Forwarded-Host`，均在发 token 和进入假 runner 前拒绝；本机及显式域名正常。
- 2026-09-29：最终 `git diff --check` 通过；Mutagen `acmcoder-v3` flush 后为 `Watching for changes`。WSL 全量 `npm test` 为 242/242、失败 0，日志 `/tmp/acmcoder-reliability-20260929-npm-test.log`（WSL `dev-wsl`）。该结果对应当前 10 个已跟踪修改文件以及本计划执行记录；未改 `.serena/` 或 `AGENTS.md`。
- 2026-09-29：主代理独立真实浏览器复核：Python 运行期间编辑后 server/UI 均 AC；切题 503 保留旧草稿；两轮 AI、刷新、恢复、巩固 AC、桌面及 390px 手机滚动通过，未见 `pageerror`。本执行者另以 WSL 隔离 HTTP server 验证新后端 Host 矩阵与响应断流；这些测试均使用假 runner/临时端口，不访问真实模型或进度。
- 2026-09-29：执行者将临时探针转为断言式浏览器验收 `/tmp/acmcoder-review-20260929/browser-assertions.cjs`（Mac，exit 0）：全新 Chrome context 下真实 Python scratch 运行时继续编辑，服务器和 UI 都为 AC；受控 AI 两轮、刷新、查看/恢复上一轮、再次重练及真实 AC 巩固完成；pending AI 重练后按钮即时可用、旧答复不进入新轮；503 选题后旧草稿可见，追加输入并回选仍完整；桌面和 390px 手机编辑器滚动对齐，`pageerror=[]`。`/api/run` 请求在脚本中只将 slug 改为 `scratch`，AI 回答由路由注入。反序运行与旧 AI `finally` 控件归属由自动化单测断言覆盖，不把它们记作浏览器实测。
- 2026-09-29：常驻 `acmcoder-v3.service` 非 sudo 重启返回 `Interactive authentication required`；服务仍 active（PID 577，11:13 CST 启动），**尚未加载本次服务端改动**。Task 5.2 和“真实服务重启后 token 更新”部分的 5.5 待用户在自己的终端执行 `ssh dev-wsl 'sudo systemctl restart acmcoder-v3.service'` 后验证。主代理已向用户请求此项操作；不要用旧服务响应代表新后端。
