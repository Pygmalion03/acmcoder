# ACMCoder 完整实施计划

> **For agentic workers:** 按依赖顺序使用 `superpowers:executing-plans` 在当前会话实施。仅在人类明确选择委派时使用 `superpowers:subagent-driven-development`；不默认启动子代理或多轮审查。用户的轻量验证与真实交付纪律优先。

**Goal:** 交付统一版本的 ACM 手撕产品：公开网站、无需本地部署的插件、本地/Docker 版，共同具备自动保存、重新手撕、长期记录、可选同步、AI 与题目导入。

**Architecture:** 保留原生 JavaScript、Cloudflare Pages/Functions/D1、本地 Node 服务及 Docker。通过小型共享模块统一数据和业务规则，保留云端、扩展、本地三种适配器；先交付网站纵向功能，再补插件、同步与 AI，不先重写整个应用。

**Tech Stack:** JavaScript ES modules、Node >=20、node:test、IndexedDB、D1/SQLite、Pyodide（首批沿用已用的 0.29.3）、Manifest V3、Docker、Mutagen/WSL、真实桌面浏览器。只为确定的编辑器体验或打包需要引入固定版本依赖，不默认换框架。

**Spec:** [统一产品设计](../specs/2026-09-30-unified-product-design.md)。用户于 2026-09-30 确认需求收敛，并要求完整计划。本计划中的技术选择是执行默认方案；外部条件不满足时按写明的退路处理，不冒称能力已完成。

## Global Constraints

- 桌面网站、本地 Web、插件侧栏为目标；只做 ACM 标准输入输出；手机编程、函数式练习、截图/PDF、社区不在本次范围。
- Python 是必交付语言。Java/C++ 浏览器运行是有完成条件的可选扩展，不阻塞 Python 产品。
- 网站取消邀请制；网站和插件基本练习无需登录。登录只承担云端同步和需要账号的云服务。
- 普通输入自动保存；重写不覆盖原记录。普通退出不丢重写，仅显式“放弃本次重写”可丢弃它。
- 长期保存，不自动按时间/最近 N 条删除用户学习记录；允许限制新增、暂停云写入，必须保留本地工作和导出。
- 归档可恢复；彻底删除独立操作，并传播删除信息防止旧设备复活数据。
- 用户 API Key 不进入源码、日志、云端普通设置、学习备份或同步数据。
- 运营方新增云费用为零；不启动付费套餐、收费模型或家庭 NAS 公共代码执行入口。
- Mac 编辑/Git；`mutagen sync flush acmcoder-v3` 完成后在 `dev-wsl:/home/pygmalion/runs/002-acmcoder/v3` 执行依赖安装、构建、测试。新 Worktree 必须先配置独立远程目录/同步/端口，不能沿用当前镜像目录。
- 已存在的未提交改动必须辨认和保留，不清理 `.serena/`、`.wrangler/`、`.playwright-cli/` 或其他无关文件。
- 不把静态草图、模拟 AI、同账号多窗口或桌面窄视口当成真实执行、真实模型、双账号或真机证据。

## Review Focus

1. 切题、切语言、退出时写入尚未完成：保留最后编辑与原题归属，重写保存失败不清空代码（W2/W4）。
2. 清理策略、旧备份、删除后离线设备重连：记录不被截断、备份引用完整、删除不复活（W1/W5/S2）。
3. 插件关闭网站、浏览器离线、扩展升级：仍能运行已安装的 Python 并恢复草稿，用户代码无法读取扩展授权（E1/E2）。
4. 多账号/多设备并发及退出：不串账号、不覆盖冲突、不无限回传同一变更（W6/S1/S2）。
5. AI 超时、提供商不兼容、伪造题名/链接：不丢编辑内容、不暗中改代码、不把生成内容当原题、不泄露 Key（A1/A2）。

## 1. 当前基线与必须修正的差距

截至编写计划，稳定版是 `v3.0.4`，网站最近功能提交是 `ff55923`，设计文档提交是 `f62cf12`；本地分支 `codex/cloudflare-free-edition`。

现有网站具备 D1 账号、草稿冲突、V2 备份恢复、Python 多样例、推荐和计划；本地版具备 Java/C++/Python、AI 与重练。插件只连接本地服务。未提交的 API/UI/测试含 Workers AI、历史和批量管理，需 W0 判定后分别接入；本次需求的自带 API 不等同于现有 Workers AI 代码。

已确认源码差距：
- `addSubmission()` 删除第 100 条以外的历史；两处计划写入清理 30 天前记录；列表和旧导出也有固定条数上限。
- `drafts` 当前按 `(user_id, problem_id)` 定位，尚无语言维度；重写主要是浏览器副本。
- 现有删除题目不完整清理历史引用；未提交批量删除也不是归档。
- 网站 CSP 仅允许同源请求；自带 API 不能只添加一个 Key 输入框。
- 网站运行器从 CDN 加载 Pyodide；扩展正式包需要独立的打包与隔离路径。
- 现有完整测试 254/254 是历史记录，不代表当前未提交代码通过。

## 2. 计划拆分与里程碑

| 阶段 | 任务 | 用户可验收成果 | 前置 |
| --- | --- | --- | --- |
| 基线整理 | W0 | 保留旧工作，建立可追踪起点 | 无 |
| 网站完整练习 | W1–W6 | 新外观、题库/今日/Python、草稿/重写/归档、完整备份、开放登录 | W0 |
| 免部署插件 | E1–E3 | LeetCode 侧栏匿名练习、重写、离线运行、与网站接续 | W2/W3；执行探针可在 W0 后尽早做 |
| 多端长期同步 | S1–S3 | 网站/插件/本地可选同步，冲突保留，删除不复活，本地新界面 | W1–W5、E2 |
| 自带 AI 与导题 | A1–A2 | 三端真实 API 问答、来源明确的自然语言导题 | W3/W4、E2、S3 的适配器 |
| 浏览器多语言评估 | L1 | Java/C++ 每种明确“交付”或“未通过及原因” | E1 运行器协议 |
| 统一发布 | R1–R2 | 同版本源码、Docker、扩展包、网站、升级/备份文档 | 必交付任务全部通过 |

详细步骤见：
1. [网站交付计划 W0–W6](2026-09-30-unified-web.md)
2. [插件、本地和同步计划 E1–S3](2026-09-30-unified-clients-sync.md)
3. [AI、语言与发布计划 A1–R2](2026-09-30-unified-ai-release.md)

默认单写入者顺序执行；依赖表不是要求同时启动多个代理。内部阶段可单独部署验证，最终统一发布前必须给出真实功能对照；不能永久让某端缺少已承诺的核心体验。

## 3. 共享技术合同

### 文件布局

新增 `shared/` 为受版本管理的公共源：`records.js`（数据校验）、`practice.js`（重写状态）、`import.js`（来源和样例）、`runner.js`（运行消息）、`sync.js`（冲突与队列）、`ai.js`（模型请求规范）、`ui/`（样式和逐步共享的界面）。不一次搬迁旧文件。

`scripts/build-clients.mjs` 按目标将公共源和固定版本资源复制到 `dist/site`、`dist/extension`、`dist/local-web`；生成目录不提交、不通过 Mutagen 同步。CI/WSL 构建。Pages 在 W2 切换到 `dist/site`，其中包含编译后的静态文件及现有 Functions 构建入口；具体 Pages 输出/Functions 布局先用预览部署确认。本地服务/镜像在 S3 切换静态目录。复制共享源不靠人工维护多份。

本次无需发布 npm 包：现有 `package.json` 为 private；对用户的“包”是扩展 ZIP、Docker/GHCR 镜像和源码 Release。

### RecordV3（应用数据，不含凭据）

`{kind,id,problemId?,language?,revision,updatedAt,payload}`。`kind` 为 `problem|draft|attempt|run|review|plan|progress|settings|conversation`。ID 使用 UUID；已有题目 ID 通过持久映射保留引用。`revision` 为服务器赋予的整数；`updatedAt` 用于展示，不决定冲突胜负。

- problem payload：title、statement、sourceUrl、sourceKind、tags、rawSamples、cases、archivedAt。
- draft payload：code、stdin、expected、mode（normal/rewrite）、previousAttemptId；语言独立。
- attempt payload：不可变 code/stdin/expected 快照、reason（before-rewrite/completed-rewrite/imported）、createdAt；无需记录每个按键。
- run payload：自测结果、实际输入/期望、受限输出、运行时间；旧 submissions 的 code 等已存字段完整迁入，不能借迁移丢历史。新自测是否保存完整代码沿用用户选择，不能将每次运行强制变成重写快照。运行结果属于不可变记录。
- review payload：dueDay（用户当前时区日历日期）、completedAt；初始默认 Asia/Shanghai，设置中可修改。
- conversation payload：题目/语言关联的消息；不会因为重写自动删除旧对话。模型上下文允许截断，但已存记录不因此删除。

`PracticeStore`：`getDraft({problemId,language})`、`saveDraft(draft)`、`startRewrite({problemId,language,template})`、`discardRewrite(...)`、`finishRewrite(...)`、`listAttempts({problemId,cursor,limit})`；全部返回 Promise，原记录与新草稿变更必须事务提交。

`RunnerAdapter`：`run({id,language,code,stdin,signal},onEvent)` / `cancel(id)`；事件为 loading/running/stdout/stderr/complete/error。期望输出比对在可信 UI 侧，用户程序只收 code/stdin，不收凭据或期望答案。客户端成绩属于自测记录，不提供可验证的平台 AC。

### 同步与删除合同

同步 mutation：`{mutationId,kind,id,baseRevision,op:'put'|'delete',payload?}`。服务器仅从会话/授权解析用户身份；请求体不能指定所有者。应用结果与 mutationId、变更日志原子提交；重试返回相同结果。

结果：`{applied:[{mutationId,revision}],conflicts:[{mutationId,current}],cursor}`。读变更使用服务器单调序号游标，不用客户端时间。冲突保留本地与服务器版本，由用户选用或另存。

每账号保留无题面/代码的最小删除墓碑 `{kind,id,revision}`，长期保留以阻止任意旧设备复活原 ID；用户确实重新导入时生成新 ID。账号删除清除全部账号数据和设备授权；旧设备重连得到失效，不能自动作为新账号上传。

每端各自保存离线队列；未登录数据进入明确的 guest 空间。连接账号前展示迁移数量，主动选择合并；不把 guest 数据暗中上传。

### 版本、容量和配置

产品版本以根 `package.json` 为唯一源；构建写入扩展 manifest 和各端 version.json。下一统一大版按 SemVer 递增（拟 4.0.0，执行时若已有新 Release 则选择下一个可用大版本）。接口带 `protocolVersion:1`，服务公开最小兼容协议。旧客户端不能破坏新记录；不兼容写入拒绝并保留本地内容。

容量采用明确的新写入上限，不承诺无限免费：保留初始云端 200 题上限，归档仍计入；每日新自测记录最多 100 次，但不删除旧记录；超限继续本机运行。所有列表与备份分页遍历，页大小不是保留上限。历史总字节预算在 W1 测量现有容量后写入部署配置并显示给用户，不能填一个没有测量依据的数字或自动启用收费资源。

以上限额是当前实现的起点，不是题库功能需求本身；首次公开展示时标明“云端容量”，设备保存和本地版不继承云端题数上限。无法同步时，保存状态必须区分本机已保存与云端未同步。

## 4. 执行与验证节奏

每个行为任务先增加最小失败断言，再实现并运行对应测试；已有行为通过且未修改时复用证据。纯样式、文案、文档和可逆打包路径不为流程额外写镜像实现的测试。

通用命令（以下 `<tests>` 由各任务给出）：
```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && node --test <tests>'
```
每个里程碑才运行一次完整 `npm test` 和所需构建；随后一次真实部署/安装，集中修正。涉及本地 server 变更需重启 `acmcoder-v3.service`；需要管理员权限时由用户在自己的终端执行，不索取密码。

每批在 `docs/releases/unified-delivery-log.md` 记录 commit、部署/包版本、测试数字、真实验收步骤及未验证项。每个有独立价值的任务提交一次明确文件集，不将其他工作混入。

## 5. 外部依赖与明确退路

| 条件 | 何时需要 | 缺少时继续什么 |
| --- | --- | --- |
| 第二个真实测试账号、独立浏览器/设备 | W6/S2 | 数据/UI/插件实现继续；多人验收保持未完成 |
| 用户自带模型 API 与使用额度 | A1 | 完成适配器与受控测试；真实模型验收等待用户在设置页自行配置 |
| 扩展商店开发者账号、身份资料 | R2 | 交付可安装 ZIP、权限清单和商店材料；不冒称已上架 |
| 商店登记费用（若当时存在） | R2 | 不代付，保留免费分发；到提交前核对并说明 |
| 开源许可证选择 | R1 | 准备依赖许可证清单及候选说明，未决定前不擅自赋予仓库许可 |
| Cloudflare 免费容量不足 | 所有云阶段 | 云端新增失败明确报告，本地练习/备份保留，不清旧数据、不升级套餐 |
| Java/C++ 浏览器编译不可用 | L1 | 交付 Python 网站/插件，本地已有多语言保留 |

不对商店审核等待和未验证多语言作确定工期承诺。每批结束报告最近可验收目标和唯一实际阻塞，不重复问已确定的产品偏好。

## 6. 最终验收清单

- [ ] 新用户不登录网站即可导入/选择题目、编辑、真实运行 Python、关闭后恢复。
- [ ] 新用户只安装扩展，不启动本地服务、不打开网站，能在真实 LeetCode 侧栏练习。
- [ ] 重写前后的记录长期保留；刷新恢复、放弃、新旧对照符合设计。
- [ ] 今日/题库/练习、AI、设置及归档入口在网站和本地完整可用，侧栏具备对应核心动作。
- [ ] 两真实账号隔离；同账号跨独立设备接续；断网冲突、彻底删除后旧设备重连不丢失/复活数据。
- [ ] V1/V2 备份可读，V3 完整导出恢复，超过旧 100 条/30 天的数据不被截断。
- [ ] 配置外部 API 后三端真实问答可用；AI 导题有真实来源证据或明确原创标记。
- [ ] 统一版本源码、扩展包、Docker 镜像、网站可以相互对应；旧安装数据升级可恢复。
- [ ] 免费费用边界、离线边界、语言支持和商店发布状态均与实际一致。

## 7. 自检记录

2026-09-30：三份子计划共 18 个任务，逐项对照设计，覆盖语言、开放访问、插件、本地离线、统一版本、ACM、重写、导题、AI、长期数据、前端；补入账号删除、AI 对话保留、guest 接续、备份分页和旧写接口限制。检查共享接口、测试归属及阶段依赖，补齐旧 submissions 的 run 记录类型，避免迁移丢失已有运行历史。用户未要求执行或部署，本次仅产出计划。

技术来源核对（执行时如有变更，以官方新文档及真实验证为准）：
- [扩展远程代码规则](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)：JavaScript/WASM 均需考虑随包分发。
- [扩展 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)：运行器权限与沙箱单独验证。
- [扩展身份接口](https://developer.chrome.com/docs/extensions/reference/api/identity)：扩展授权通过系统浏览器登录流程。
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)：容量、单次处理和费用边界按实际免费配置验收。
