# ACMCoder 插件、本地版与同步 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans`，依赖与合同以总计划为准。不因任务可分拆就自动启动代理。

**Goal:** 插件免部署独立练习，本地版持续离线可用，同账号跨端接续且不覆盖冲突内容。

**Architecture:** 复用 W1–W5 的记录、练习与 UI，通过扩展/文件存储和运行器适配不同平台。所有端先本地保存，认证只为同步与云服务；登录和同步协议独立于网站标签页。

**Tech Stack:** Manifest V3、随包 Pyodide、IndexedDB、Chrome identity/storage、D1、Node 文件持久化、Docker。

**Spec:** [设计](../specs/2026-09-30-unified-product-design.md)；[总计划及共享合同](2026-09-30-unified-product-roadmap.md)；[网站前置任务](2026-09-30-unified-web.md)。

## Global Constraints

- 继承总计划；Python 扩展不依赖本地服务、网站打开或网站登录，用户程序不能获得扩展权限。
- 旧本地 Java/C++/Python、源码/Docker 使用方式继续保留；服务默认不开放公网。
- 匿名网页和插件存储独立；无明确授权不暗中搬运或上传内容。
- “一直保留”通过持久记录、导出和删除传播落实，不使用最近 N 条淘汰。
- 下列最小测试在源文件同步完成后的 WSL 项目目录运行；Mac 完成真实浏览器安装与操作验证。

## Review Focus

- 沙箱执行恶意 Python/JS 调用：不能读取扩展存储、令牌或调用浏览器 API（E1）。
- LeetCode 单页路由切题和侧栏关闭：题目归属正确，草稿可恢复（E2）。
- 网页伪造接续/授权消息：必须验证来源、一次性 nonce 和有效期（E3/S1）。
- 网络重试、乱序与离线旧设备：幂等、不丢冲突、不复活彻底删除的数据（S2）。
- 本地升级中断或同步未登录：旧文件仍可恢复，运行不依赖云（S3）。

## 文件边界

`extension/runner/` 仅执行用户程序；`extension/sidebar.js` 装配公共界面；`extension/background.js` 仅管理消息、授权和生命周期。`shared/sync.js` 管离线队列与冲突，`cloudflare/lib/sync.js` 管服务端游标/批量协议；`cloudflare/lib/device-auth.js` 管设备授权。

`src/server/unified-store.js` 适配本地文件记录，`src/server/cloud-sync.js` 管账号连接与同步。各端不复制练习状态机，不把认证逻辑交给运行器。

### E1 — 扩展 Python 可行性探针及运行器

**前置:** W0 后可以先验证运行隔离，完整接入使用 W2/W3。这是早期风险任务，失败不能等整个 UI 写完才发现。

**Files:** Create `extension/runner/index.html`、`extension/runner/bridge.js`、`scripts/bundle-python.mjs`、`tests/extension-runner.test.js`、`docs/extension-runtime.md`；Modify `extension/manifest.json`、`scripts/build-clients.mjs`、`package.json`（及对应 lockfile）。

**Interfaces:** `createExtensionRunner({frame}) -> RunnerAdapter`，沿用 W3 事件；`bundlePython({version,outDir}) -> {files,totalBytes,licenses}`。资源版本固定 0.29.3；本地生成文件随安装包分发，不提交二进制到源码树。

- [ ] 先做最小可安装扩展：扩展 sandbox 页面中的 worker 加载随包 JS/WASM/标准库，验证 `input()`、循环输出、取消。明确 sandbox opaque origin 下的资源访问；若需可信加载器，只提供固定清单中的运行资源字节，不提供任意 URL/文件/扩展 API 代理。
- [ ] 写并运行失败用例：伪造 runId/来源拒绝，取消重复幂等、旧回包忽略；实际沙箱程序尝试访问 `chrome.storage`、父页面与网络凭据均不得成功。隔离不能满足则记录失败路径并调整沙箱结构，禁止以放宽主扩展页权限绕过。
- [ ] 打包固定版本与许可证清单，脚本校验上游资源摘要；manifest 为 sandbox 单独配置 CSP，扩展主界面不用远程执行代码。核对 Chrome 当前远程代码政策与真实安装结果，记录是否可上架，不能用开发模式成功代替商店合规结论。
- [ ] 运行 `node --test tests/extension-runner.test.js` 与 `node scripts/build-clients.mjs extension`；Mac Chrome 安装产物，关闭本地服务连接与网站，再切断网络运行中文/多行输入、无限循环、重复运行。记录安装体积、首次加载、稳定内存与取消结果。
- [ ] 提交 `feat: package isolated Python runtime for the extension`。产物无法离线运行或隔离不通过时 E2 的执行能力未完成，其他数据任务可继续。

### E2 — LeetCode 独立侧栏与历史

**Files:** Modify `extension/content-script.js`、`extension/background.js`、`extension/sidebar.js`、`extension/sidebar.html`、`extension/sidebar.css`、`extension/manifest.json`、`tests/extension.test.js`；Create `extension/store.js`、`tests/extension-practice.test.js`。

**Interfaces:** `captureProblem({tabId}) -> ProblemPayload` 经 W3 normalize；`createExtensionStore({namespace}) -> PracticeStore` 复用 W2 IndexedDB，运行用 E1。消息白名单为 `captureProblem|openSidePanel|handoff|auth`，不接收任意脚本执行请求。

- [ ] 写并运行失败用例：LC SPA 切题仍返回新 URL 对应题面；捕获结束时页面已换题则拒绝过期内容；题目导入去重不覆盖代码；关闭重开侧栏恢复草稿和未完成重写；卸载前版本升级保留数据。
- [ ] 接入 LC cn/com 当前页题面、原始样例和来源；采集失败展示具体失败及粘贴入口。用户可把转换后的 stdin 改成任意文本；不自动注入 LeetCode 答案编辑器或代提交。
- [ ] 侧栏使用共享令牌/控件，代码优先，测试结果、AI入口、重写/对照按需展开；题库/今日用紧凑切页提供同样核心动作。增加保存位置、离线状态和可选本地运行模式；默认匿名 Python，不要求填服务地址。
- [ ] 运行 `node --test tests/extension.test.js tests/extension-practice.test.js`；真实 LC cn/com 各一题，360/480px 侧栏验导入→ACM 编写→运行→关闭恢复→重写→对照。断网已导入题仍可用，联网导新题准确说明来源要求。
- [ ] 提交 `feat: make the LeetCode sidebar work without local deployment`；保留原本地连接配置迁移，不能因新默认模式丢旧数据。

### E3 — 无账号的同浏览器接续

**Files:** Create `extension/website-bridge.js`、`shared/handoff.js`、`tests/extension-handoff.test.js`；Modify `extension/background.js`、`extension/sidebar.js`、`extension/manifest.json`、`cloudflare/public/app.js`。

**Interfaces:** `createHandoff({records,source}) -> {nonce,expiresAt}`；`consumeHandoff({nonce,targetOrigin}) -> {records}`。nonce 随机至少 128 位、有效期 5 分钟、仅消费一次；数据仅暂存在扩展侧，不放 URL。

- [ ] 写并运行失败用例：错误 origin/过期/重放拒绝；目标网页不能读全部扩展存储；相同题已有草稿先提供保留双方的预览；匿名接续不会触发云端上传。
- [ ] 点击“在网站继续”才打开固定站点，内容脚本只对 `https://acmcoder.pygmalion.top` 工作；消息核对 window 来源、tab 与 nonce。URL 仅携带短期交接标识，成功后从地址移除；传题面、当前草稿与所需快照，使用目标 guest namespace。
- [ ] 网站反向“在侧栏继续”使用相同校验与显式动作。未安装扩展、不同浏览器或 nonce 失效时说明恢复路径，提供数据包导入；不宣称 guest 自动跨设备。
- [ ] 运行 `node --test tests/extension-handoff.test.js`；真实同浏览器网页/插件互传并关掉网站后继续练习；第二个来源页面请求数据必须失败。
- [ ] 提交 `feat: hand off practice between website and sidebar`。

### S1 — 插件、本地的独立账号连接

**Files:** Create `cloudflare/lib/device-auth.js`、`cloudflare/migrations/0004_device_auth.sql`、`extension/auth.js`、`src/server/cloud-auth.js`、`tests/device-auth.test.js`；Modify API 路由、`cloudflare/public/account.js`、`extension/manifest.json`、`src/server/server.js`。

**Interfaces:** `POST /api/devices/start -> {deviceCode,userCode,verificationUrl,expiresIn,interval}`；`POST /api/devices/token -> {accessToken,refreshToken,expiresIn}`（pending 为可识别状态）；`POST /api/devices/refresh`、`POST /api/devices/revoke`；扩展授权码流程使用 PKCE `S256`，与 device flow 共享设备授权记录。网站既有 OAuth 是登录上游。

- [ ] 写并运行失败用例：未批准/过期 deviceCode 无法换令牌；他人不能批准当前账号以外的设备；一次性 code 重放失败；PKCE 不匹配失败；撤销与 refresh 重用失效；调用者传 userId 不改变 token 所属账号。
- [ ] 设备码有效期 10 分钟，轮询最短 5 秒且仅授权窗口活动时进行；网站批准页显示设备名称/账号，主动确认连接。access 有效 15 分钟，refresh 30 天并轮换，服务端仅存摘要；退出/账号删除撤销授权，旧刷新 token 重用撤销所属授权链。
- [ ] 扩展用 `identity.launchWebAuthFlow` 与 allowlist 回调，生产 ID/开发 ID 分开；access 放可信会话存储，refresh 仅在用户选择保持连接时存在可信扩展存储，内容脚本不可读。本地通过 device flow，不开放公网回调；令牌独立于学习数据存放用户数据目录，权限 0600，禁止进入备份和 Git。
- [ ] 运行 `node --test tests/device-auth.test.js`；真实网页登录批准插件与本地连接，随后关闭网页仍可同步授权；在账号设备列表撤销后设备得到明确失效且本机草稿仍在。
- [ ] 提交 `feat: authorize independent extension and local devices`。商店 ID 尚未确定可使用固定开发 ID 验证，生产回调在 R2 配置，不把“网站已登录”当插件已授权。

### S2 — 增量同步、冲突及彻底删除传播

**Files:** Create `shared/sync.js`、`cloudflare/lib/sync.js`、`tests/unified-sync.test.js`；Modify `shared/browser-store.js`、`cloudflare/lib/records.js`、API 路由、`extension/store.js`、`cloudflare/public/account.js`、共享设置 UI。

**Interfaces:** `createSyncEngine({store,transport,accountId}) -> {syncNow,pause,getStatus}`；`POST /api/sync/push {protocolVersion,mutations}` → 总计划结果；`GET /api/sync/pull?cursor=&limit=` → `{changes,nextCursor,hasMore}`。单批最多 50 条且请求大小受部署限制，按字节拆批；不兼容返回 `UPGRADE_REQUIRED`，本地保留队列。

账号生命周期：`DELETE /api/account {confirmation:'DELETE'}` 需要当前有效网页会话及同源保护，先展示实际删除范围。删除用户云记录、旧表残留、会话、授权、同步日志/墓碑及备份恢复元数据；不声称能远程抹掉永不联网的设备副本。

- [ ] 写并运行失败用例：同 mutation 重试只产生一次 revision；相同 mutationId 不同 payload 拒绝；双方 baseRevision 相同并发更新只一个成功；服务器时间与客户端时间相差一周不改变冲突规则；pull 游标只能在变更本地落盘后推进；push 返回的游标不能跨过尚未拉取的其他设备变更。
- [ ] 将本地记录与 outbox 事务提交；网络退避重试且不忙轮询，online/启动/用户点击/有新变更触发。服务端检查账号、baseRevision、墓碑和容量，CAS 更新、结果/日志同事务；push/pull 的实现复用 W1，避免双写旧表不同步。
- [ ] 冲突屏展示本地/云端代码和时间，提供保留本地、保留云端、另存副本；处理前保留两份。首次连接显示 guest/现有账号数据数和合并选项；退出停止队列、清除凭据、切回 guest，账号副本在原 namespace，禁止上传到下一账号。
- [ ] 实现上述账号删除端点与设置页确认，并补失败用例：离线设备更新已彻底删除题返回删除状态，不能重新创建原 ID；题目/草稿依赖乱序有序重试不成孤儿；配额满保留队列且不循环重试；恢复旧备份按 W5 规则新 ID；删除后账号内容计数为零、旧 token 不能上传，另一账号行数不变。运行 `node --test tests/unified-sync.test.js tests/unified-records.test.js tests/device-auth.test.js`。
- [ ] 一次真实双设备联调：网页写→插件读→插件重写→网页对照；两端断网编辑同题再联网保留冲突；彻底删除后旧设备联网不复活；两真实账号相互不可见。标明设备/浏览器和版本，不以 mock 替代。
- [ ] 提交 `feat: sync practice with durable conflicts and deletion tombstones`，记录已有老客户端读写兼容范围和实际冲突结果。

### S3 — 本地/Docker 同步与统一界面

**Files:** Create `src/server/unified-store.js`、`src/server/cloud-sync.js`、`tests/local-unified-store.test.js`；Modify `src/server/server.js`、`src/server/memory.js`、`web/app.js`、`web/api-client.js`、`web/index.html`、`web/styles.css`、`scripts/build-clients.mjs`、`Dockerfile.app`、`tests/docker-deployment.test.js`、`docs/deployment.md`。

**Interfaces:** `createLocalStore({dataDir}) -> PracticeStore` 加 W5 生命周期/导出方法；`createLocalRunner({api}) -> RunnerAdapter` 适配现有 `src/runner/`；本地账号模块采用 S1、同步引擎采用 S2。现有单进程服务持久化以串行写队列、恢复日志、临时文件+原子 rename 提供事务语义。

- [ ] 写并运行失败用例：旧本地数据只迁移一次，语言/草稿/原始记录全保留；快照写盘失败不换新草稿；写入中断重启能恢复；无云凭据仍可运行与导出；本地 Key/设备 token 不进入备份。
- [ ] 首次迁移保留原目录副本，建立 ID 映射与 V3 数据目录；本地多记录变更通过事务日志提交/恢复，不仅在内存 Promise 成功就返回“已保存”。不在 Mac/WSL 同时修改数据文件，运行数据不进入 Mutagen。
- [ ] build local-web 复用 W4 界面与 W2 状态机，保留本地 Java/C++/Python 适配器；本地显示同步设置、冲突/设备状态，默认离线。不把功能差异隐藏：浏览器尚无的语言标注仅本地运行可用。
- [ ] Docker 构建包含共享源与静态产物，用户数据/凭据各自持久卷；升级无需重新导入。运行 `node --test tests/local-unified-store.test.js tests/docker-deployment.test.js tests/api-client.test.js`，随后本阶段一次完整 `npm test` 与本地镜像构建/烟测。
- [ ] 同步后重启 WSL 服务（需要 sudo 时由用户执行），真实 localhost:43117 验旧数据、新外观、三语言、断网重启、备份；Docker 在隔离测试卷升级验证，再连同一云账号执行 S2 的接续。不能直接用测试卷替换现有卷。
- [ ] 提交 `feat: bring offline local and Docker editions into unified sync`；记录完整离线所需镜像/工具链均已安装，AI 与新题抓取联网要求单独说明。
