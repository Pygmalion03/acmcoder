# ACMCoder AI、多语言与统一发布 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans`，继承总计划，不自动启动代理。缺外部账号/Key 时交付可验证的剩余部分，真实验收保持待完成。

**Goal:** 三端自带 API 自由问答与来源明确的导题，验证浏览器多语言，交付版本对应的源码、网站、扩展与 Docker。

**Architecture:** 抽取现有 `assist.js` 的请求规范，凭据保管与学习数据分离；各端用自己的网络适配器。发布从单一版本与同一 commit 构建，逐端记录实际功能与兼容协议。

**Tech Stack:** JavaScript、Fetch/AbortSignal、Web Crypto、Cloudflare Functions、扩展可选 host permissions、Node、GitHub Actions、GHCR。

**Spec:** [设计](../specs/2026-09-30-unified-product-design.md)；[总计划](2026-09-30-unified-product-roadmap.md)；[网站](2026-09-30-unified-web.md)及[客户端/同步](2026-09-30-unified-clients-sync.md)前置任务。

## Global Constraints

- 用户自由提问，AI 不强制逐级提示、不自动改代码；不把 Workers AI 演示当自带 API 已交付。
- Key 不进入普通数据、历史、日志、Git、备份或同步；不读取用户真实 Key 来做验收，用户在设置页自行填入。
- 不承诺所有提供商的任意协议都兼容；先沿用已有兼容 chat-completions 协议，并显示实际支持范围。
- 运营方新增云费用为零；任何用户模型费用均在请求发往用户选定的服务时产生。
- 本地测试和构建遵循总计划 WSL 命令路径；发布材料不能先于真实验证宣称完成。

## Review Focus

- Key 出现在提供商错误回显、请求日志或导出：统一过滤（A1）。
- AI 请求中途换题、取消或重试：回答归原题、不重复写入、不改编辑器（A1）。
- AI 返回不存在的题或恶意 URL：只作候选，不冒称已导入真实题（A2）。
- 编译器能跑示例却缺常用库/取消机制：不据此宣布多语言支持（L1）。
- 商店更新滞后、旧客户端回写与数据库升级：兼容检测阻止破坏新数据（R1/R2）。

## 文件边界

`shared/ai.js` 管请求/响应与上下文截取；`shared/credential-vault.js` 管浏览器会话凭据及可选加密保存；`cloudflare/lib/ai-relay.js` 仅做白名单提供商转发；`extension/ai.js`、`src/server/assist.js` 为端适配器。

`shared/ai-import.js` 将模型建议变为可核验候选；导入仍走 W3 的源校验。`scripts/check-release.mjs`、构建脚本和 GitHub 工作流负责产物关联，不引入另一套独立版本号。

### A1 — 自带 API 的三端自由问答

**Files:** Create `shared/ai.js`、`shared/credential-vault.js`、`cloudflare/lib/ai-relay.js`、`extension/ai.js`、`tests/unified-ai.test.js`、`tests/credential-vault.test.js`；Modify `src/server/assist.js`、API 路由、`cloudflare/public/_headers`、共享设置/练习 UI、`extension/manifest.json`、`tests/assist.test.js`。

**Interfaces:** `createAIClient({transport,credentials}) -> {chat,cancel}`；`chat({requestId,conversationId,messages,context,signal},onEvent) -> {message,usage?}`。`CredentialVault={set,get,clear,lock,unlock}`；provider 设置只含 `{id,baseUrl,model,transport}`，凭据单独存储。会话存为 RecordV3 conversation；限制模型上下文不删除已存对话。

- [ ] 写并运行失败用例：普通问答无分级提示前置；API 错误/超时不清草稿；换题回答归原会话；requestId 重试不重复持久化；正文/错误/导出不能回显 Key；清除 Key 后不能再发请求；上下文缩短不减少持久消息数；无凭据不得回退共享付费模型。
- [ ] 默认 Key 仅当前应用会话有效。可选“记住”采用用户口令加密本机保管：Web Crypto PBKDF2-SHA256、随机 salt、AES-GCM 每次新 IV，派生参数写在版本化封装中；口令与解密 key 不落盘，重启后需解锁。迭代次数以实施时官方安全建议和目标设备耗时实测确定并记录，不手写加密算法。本地旧 settings.json 的明文 Key 迁移到独立 0600 凭据文件或同类 vault，迁移失败保留原文件，不把它复制进学习备份。
- [ ] 网站默认使用登录后的短时转发：提供商 HTTPS 主机白名单，模型由用户填；Key 只随该次请求在内存转发，不落 D1、不记录请求体、不跟随重定向。直接访问仅对明确允许浏览器 CORS 的提供商开放，并同步 CSP；匿名用户仍可练习，需转发的 AI 配置明确提示连接账号。自定义服务无法安全转发时标明限制，不做任意 URL 公共代理。
- [ ] 插件向用户配置的 HTTPS 服务申请该 origin 的可选权限，再从可信扩展上下文直连；默认不申请全网 host 权限。本地继续由 Node 请求，可显式选择回环本地模型服务；云端不接受回环/私网目标。网络层不把用户 Key 发给题库抓取服务。
- [ ] 保留普通 chat-completions 请求适配器及取消；流式响应仅在真实兼容时启用，否则返回完整响应。设置页提供地址/模型/连接测试、密钥状态、清除入口、是否附带当前题面/代码的可见开关；默认不把其他题、旧答案或历史全部发给模型。用户明确发消息是该次发送授权。
- [ ] 运行 `node --test tests/unified-ai.test.js tests/credential-vault.test.js tests/assist.test.js`；用户自行配置 Key 后，网站/插件/本地各完成一次真实问答、取消、错误恢复，核对代码未变及密钥不出现在 UI/备份。无真实 Key 保留该验收待完成，不索取明文。
- [ ] 提交 `feat: support private user-provided AI across clients`。提供商注册表与可用传输实测结果写入文档，既有 Workers AI 路径仅在明确保留且不突破费用边界时单独标注，否则不作为默认入口。

### A2 — 自然语言找题与一键导入

**Files:** Create `shared/ai-import.js`、`tests/ai-import.test.js`；Modify `shared/import.js`、`shared/ui/workspace.js`、`cloudflare/lib/recommendations.js`、`extension/content-script.js`、`src/server/leetcode-question.js`。

**Interfaces:** `resolveProblemRequest({text,catalog,aiClient,sourceAdapter}) -> {candidates}`；candidate 为 `{title,sourceUrl?,sourceKind:'verified-source'|'unverified-link'|'ai-original',evidence?}`。只有 `sourceAdapter.fetch(sourceUrl)` 取得真实题面/样例后才转 `verified-source`；确认导入调用 W3。

- [ ] 写并运行失败用例：模型只提供题名/URL不算真实题；不存在的 slug 和平台拒绝抓取保持未验证；模型把原创标成 LC 被拒绝；恶意协议/重定向 URL 不抓取；重复导入已有源保留现有代码；解析失败保留用户输入。
- [ ] 优先检索已保存题目与推荐目录，用户给定真实 LC 链接则走源适配器；模型辅助匹配候选题，不假装模型天然有实时检索。插件可用已打开的源页面获取实际内容；网站抓取受阻时将候选交给插件或粘贴入口。
- [ ] 显示短预览：来源、题名、题面、样例、ACM 输入可编辑；点击一次导入即保存并进入练习。用户明确要求原创时标记“AI 原创”，生成样例不冒称经原平台验证；不把聊天普通代码块自动覆盖到编辑器。
- [ ] 运行 `node --test tests/ai-import.test.js tests/unified-import.test.js tests/leetcode-question.test.js`；真实输入“导入 LeetCode 二分查找”完成题库/来源选择到保存；另验一个不存在题目和一个明确原创请求，确认来源展示区别。
- [ ] 提交 `feat: import verified problems from natural-language requests`。其他题站不在本次承诺列表，使用同一 sourceAdapter 扩展，不提前实现大量不验证的爬虫。

### L1 — Java/C++ 浏览器编译执行的有界验证

**前置:** E1 的运行器协议可用即可启动；每种语言最多两个有证据的候选方案。没有可分发编译器时记录结论，禁止投入无限移植项目。

**Files:** Create `experiments/browser-languages/README.md`、候选实际需要的 probe 文件、`docs/browser-language-support.md`；仅候选通过时 Create `shared/runners/<language>.js` 和相应测试，Modify 构建脚本、语言能力声明与 UI。

**Interfaces:** 每种通过的实现都实现 `RunnerAdapter`，保留 loading/running/cancel；`GET /api/capabilities` 和本地 `version.json` 声明实际语言。远程编译服务不作为“浏览器内执行”达标证据。

- [ ] 从维护方文档、发行产物和许可证验证能在浏览器编译用户新代码，而非仅执行预编译样例。C++ 至少标准输入输出、vector/string/map/sort；Java 至少 Main、标准输入输出、数组/集合/字符串。记录标准/运行时版本，不暗称所有语言特性可用。
- [ ] 在与 Python 同类隔离边界中实测编译错误、多行中文 I/O、重复执行、死循环取消、内存上限；记录下载体积、冷启动/热运行耗时及主线程是否卡死。测试典型桌面环境：1 MiB 输入、128 KiB 程序、重复运行 20 次，无页面崩溃；阈值只是可行性场景，不是题库最大规模承诺。
- [ ] 检查网站与扩展都能分发/离线缓存对应资源；要求用户无需系统安装额外编译器。若热运行或加载体验明显不适用、体积超实际部署限制、授权不允许分发或隔离失败，则该语言不进入本次浏览器正式支持。
- [ ] 成功方案接入统一下拉、最小 ACM 模板和按语言草稿，做一次真实网站及扩展验收；失败方案仅提交结论与最小可复现实验，不把巨型编译器产物放入 Git。网站 Java 与 C++ 分别判定，不绑在一起。
- [ ] 提交 `docs: record browser language feasibility`；通过的实际实现单独以 `feat: add verified browser <language> runner` 提交。本地原有三语言不受失败结论影响。

### R1 — 版本、升级、许可证与发布包

**Files:** Create `scripts/check-release.mjs`、`docs/releases/unified-feature-matrix.md`、`docs/data-and-privacy.md`、`docs/upgrade.md`、`THIRD_PARTY_NOTICES.md`；Modify `package.json`、锁文件、构建脚本、`.github/workflows/publish-images.yml`、`Dockerfile.app`、`README.md`、`docs/deployment.md`、`docs/edge-extension.md`；用户确定许可证后才 Create `LICENSE`。

**Interfaces:** 根版本唯一；产物 `version.json={version,commit,protocolVersion,features}`；发布清单含网站部署 ID、ZIP SHA256、镜像 digest、源 commit 和支持语言。`check-release` 不通过时不得 tag/publish。

- [ ] 统一生成网站/本地/扩展版本；扩展 manifest 只放商店允许的数字版本，预发布文字放独立显示字段。检查发布 tag、package version、manifest、version.json 一致，缺功能必须在矩阵标为未交付而非改版本号掩盖。
- [ ] 完成旧版升级路径：V1/V2 数据与 3.0.4 目录迁移、升级前导出、断电恢复、协议不兼容阻止写入。扩展商店渠道依靠商店更新，ZIP/开发模式渠道给出手动升级步骤；网站新版本不强制刷新丢草稿。网页缓存仅在确认无待保存内容后更新，不覆盖本地状态。
- [ ] 生成扩展 ZIP/校验和、源码 release 说明、Docker amd64/arm64 产物流程；镜像构建包含共享代码，compose 对外端口默认只绑定回环。CI 在依赖引入后先按锁文件安装再运行检查，避免现有工作流直接 `npm test` 缺依赖。
- [ ] 整理根仓库许可候选与现有依赖许可证义务；用户未选择前不擅自写 LICENSE。隐私说明准确列出题目/代码/对话保存位置、Key 去向、模型提供商收到的内容、同步/备份区别；对应 S2 已实现的账号删除行为说明云端全部删除、设备下次连接失效、离线本机副本需用户自行清除的边界。
- [ ] 校验所有数据导出都排除密钥；AI 模型费用、免费云容量上限、语言差异、离线所需资源、匿名设备清理后果写在对应设置/帮助处，不用长告警阻挡正常练习。移除仓库中过时的邀请制/必须本地运行插件说明。
- [ ] 执行 `node scripts/check-release.mjs` 与升级演练：保留真实旧数据的脱敏副本在隔离卷，从3.0.4 升级、重启和导出恢复，证据入日志。代码/构建改动只跑相关测试，最终全量留 R2。
- [ ] 提交 `build: prepare unified versioned release and upgrade assets`。发布前准备完整包和可审阅材料，只有真正需用户选择的许可证/商店身份/费用才请求一次输入。

### R2 — 最终验收、部署与分发

**Files:** 更新 `docs/releases/unified-delivery-log.md`、`docs/releases/unified-feature-matrix.md`；Create `docs/releases/v<实际版本>.md`、`docs/extension-store-listing.md`。不为发布新增无关功能。

**Interfaces:** 消费 R1 的同 commit 产物与总计划最终清单；输出每项 `passed|blocked|not-in-scope` 的证据，禁止以 mock 或未发布草稿替代公开产物。

- [ ] 对照总计划逐项验收：匿名网站、独立插件、本地离线、今日/题库/重写、真实 AI 导题、双账号/双设备、冲突、删除、完整备份。Java/C++ 浏览器失败属于已约定可选项，插件 Python/长期保存失败属于发布阻塞。
- [ ] 同步后运行一次完整 `npm test`、全部客户端构建、release checker、Docker smoke。只重跑被修复影响的检查，最终交付日志保留命令/结果/commit，不沿用旧 254 项数字。
- [ ] 备份生产后做一次网站候选部署与真实回归；检查部署版本、D1 迁移和回滚路径。回滚静态资源可行，不反向删除新数据；如旧版本协议不兼容，则只读保护后向前修复。免费资源无足够空间时暂停新云写入，保留设备练习与导出。
- [ ] 发布同 commit 的 GitHub Release、扩展 ZIP、源码和 GHCR 镜像；推 tag 前核对其将触发镜像发布，确保版本/渠道正确。记录网站上线版本与可下载包一致，发布失败不能把 latest 指向不完整版本。
- [ ] 准备并核验 Chrome/Edge 商店所需截图、权限理由、隐私说明、可测试流程；账户/身份/潜在登记费用由用户处理。已具备明确发布授权才提交商店；缺少条件交付 ZIP 与材料，状态写“可安装，未上架”，不伪造审核通过。商店更新滞后期间靠协议兼容维持使用。
- [ ] 完成交付说明：用户入口、最短上手、数据位置、同步/导出/升级、真实限制、剩余外部阻塞。只有必交付验收通过才标统一版完成；若仅商店上架受阻，明确区分产品可用与分发渠道未完成。
