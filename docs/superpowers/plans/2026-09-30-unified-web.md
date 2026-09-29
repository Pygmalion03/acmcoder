# ACMCoder 网站交付 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行；不默认委派。完成每项勾选步骤，只提交该项文件。先读总计划的共享合同。

**Goal:** 在真实网站交付从导题、Python 自测、恢复草稿到重新手撕、对照和归档的完整体验。

**Architecture:** 保留 Pages/Functions/D1；新增统一记录与浏览器存储适配器，渐进替换现有页面。浏览器先落盘，云端成为登录后的持久副本；先建立数据约束再接新界面。

**Tech Stack:** 原生 ES modules、IndexedDB、D1、Pyodide、node:test、桌面浏览器。

**Spec:** [设计](../specs/2026-09-30-unified-product-design.md)；[总计划及接口合同](2026-09-30-unified-product-roadmap.md)。

## Global Constraints

- 继承总计划全部约束；不改生产已应用的 `0001`、`0002` 迁移，不覆盖当前未提交工作。
- Python 必交付；只有实际提供的用例通过才显示“样例通过”，不能冒称原平台 AC。
- 页面、输入和记录不因未登录、超额、断网、超时或导入失败被清空。
- 本计划的测试命令均在同步完成后的 WSL 项目目录执行；文中 `node --test …` 是远程工作目录内命令。

## Review Focus

- 浏览器关闭时 IndexedDB 写入未完成：恢复最后已落盘内容，失败可见（W2）。
- 切题时旧 Python 结果迟到：只能更新原题运行记录（W3）。
- 超过旧历史上限及旧数据迁移重试：不截断、不重复（W1/W5）。
- 归档题仍被今日计划引用：隐藏日常入口，恢复后内容完整（W4/W5）。
- 多账号切换及免费容量耗尽：不串数据，旧记录仍可读出（W6）。

## 文件边界

`shared/records.js` 管记录校验；`shared/practice.js` 管练习状态；`shared/import.js` 管题面/样例规范；`shared/runner.js` 管执行消息。`shared/browser-store.js` 负责 IndexedDB 和恢复日志；`cloudflare/lib/records.js` 负责 D1 持久化与配额。新模块不承担页面渲染。

`shared/ui/tokens.css`、`shared/ui/workspace.css`、`shared/ui/workspace.js` 逐步沉淀三页布局与交互；网站 `app.js` 保留账号、路由和适配器装配。不为拆文件重写无关算法。

### W0 — 确认基线与旧工作归属

**Files:** 读当前 Git diff、中央项目清单、根/子目录 AGENTS；Create `docs/releases/unified-delivery-log.md`；Modify 旧计划只添加指向总计划的状态说明（原记录保留）。

**Interfaces:** 输入当前代码和历史验证；输出日志中的 `baselineCommit`、`dirtyFiles`、`reusedChanges`、`verification` 四项，供后续任务核对。

- [ ] 记录分支/HEAD/远程默认分支与工作树差异；从目录向下查找更具体的 AGENTS。核对中央清单的远程目录、端口和同步会话。
- [ ] 将当前未提交 AI、历史、批量管理按“可复用/需改造/保持独立”列入日志；检查 Pages 生产分支与 GitHub Actions 触发，后续开发使用预览部署，不意外发布生产。
- [ ] 同步后只运行受已有改动影响的 `node --test tests/cloudflare-api.test.js tests/cloudflare-backup.test.js tests/cloudflare-draft-ui.test.js`；如失败标为基线问题，不能归咎后续改动或重写覆盖。
- [ ] 在 Mac 单独提交本次日志/旧计划状态说明，提交名 `docs: record unified product implementation baseline`；旧功能改动仅在确认其归属和通过验证的相应任务中提交。

### W1 — 长期记录及兼容迁移

**Files:** Create `shared/records.js`、`cloudflare/lib/records.js`、`cloudflare/migrations/0003_unified_records.sql`、`tests/unified-records.test.js`；Modify `cloudflare/functions/api/[[path]].js`、`cloudflare/lib/backup.js`、`tests/cloudflare-api.test.js`。

**Interfaces:** `validateRecord(record) -> RecordV3`；`createRecordRepository(db,{limits}) -> {get,list,apply,migrateLegacy}`。`list({userId,kind,cursor,limit}) -> {items,nextCursor}`；`apply({userId,mutation})` 遵循总计划 mutation 合同。此阶段仅服务网站，S2 扩充批量同步端点。

- [ ] 写失败断言：`keeps_101_submissions_and_31_day_old_plan`、`separates_python_and_cpp_drafts`、`legacy_migration_is_idempotent`、`failed_snapshot_does_not_replace_draft`；关键断言为 `assert.equal(history.items.length,101)`、两语言草稿分别保留、迁移两次总数不变、失败后旧代码相等。运行上述两个测试文件确认新增断言失败。
- [ ] 新表按 `(user_id,kind,id)` 定位，保存 revision、payload 字节数、归属题目/语言；增加旧 ID 映射、删除墓碑、mutation 去重与变更序号表。记录与变更日志同事务；draft 按账号/题目/语言唯一，attempt 不可原地覆盖。旧库迁移分批、可恢复、可重复；缺失旧字段使用明确缺省，不丢源数据。
- [ ] 移除最近 100 条与 30 天自动清理，所有历史查询使用游标；旧 API 读写经过新记录仓库，拒绝无法保留新语义的写入，不能留下绕过事务/墓碑的旧写入口。更新备份 revision 覆盖新表。
- [ ] 实测测试账户数据大小与免费 D1 剩余额度（只看聚合容量）；将单账号/全站字节预算作为部署配置记录依据，写入预检查与事务计数。达到上限返回 `CAPACITY_REACHED`，已有数据可读；不再引导“删除旧题才能继续练习”。运行最小测试及临时本地 D1 迁移两次，核对行数、引用、外键和旧接口读写。
- [ ] 提交本任务文件，提交名 `feat: preserve unified practice records without age eviction`。生产迁移先在隔离预览数据库演练，W6 才进入生产批次。

### W2 — 本地草稿与可靠重写

**Files:** Create `shared/practice.js`、`shared/browser-store.js`、`scripts/build-clients.mjs`、`tests/unified-practice.test.js`；Modify `web/practice-session.js`、`cloudflare/public/app.js`、`package.json`、`.gitignore`、`cloudflare/wrangler.jsonc`。

**Interfaces:** `createBrowserStore({namespace}) -> PracticeStore`，方法沿用总计划；额外 `flush() -> Promise<void>`、`getSaveState() -> {state:'saved'|'saving'|'error',error?}`。`createPracticeController({store,runner,onChange})` 只调用适配器，不假设云端或扩展存在。

- [ ] 写并运行失败用例：normal→rewrite 生成旧快照；保存旧快照失败不能清空编辑器；finish 保存两份；discard 仅丢当前重写并恢复先前内容；同题不同语言独立；重复完成请求不重复建快照。断言 `assert.equal(restored.code, originalCode)`、`assert.equal(attempts.length,2)`。
- [ ] IndexedDB 事务实现 PracticeStore；普通输入短防抖写入，`visibilitychange/pagehide` 做小型恢复日志而非依赖卸载时网络请求；同步恢复日志失败显示未保存。切题/语言先提交当前题键，不能靠可变全局 selectedId 决定写入归属。恢复日志先于旧 IndexedDB 值回放，空间不足不能显示“已保存”。
- [ ] guest 与各账号独立 namespace；迁移现有本机草稿先保留原备份并标记完成，重试不重复。明确“结束并对照”“放弃本次重写”，普通关闭保留。现有本地 practice-session 暂用桥接以保持行为，S3 替换存储。
- [ ] 构建脚本复制 shared 与静态文件到 `dist/site`，沿用 Functions 源目录并验证 Pages 实际构建布局；其余客户端目标由 E1/S3 补齐。运行 `node --test tests/unified-practice.test.js tests/practice-session.test.js`、`node scripts/build-clients.mjs site`；真实浏览器快速输入中文/换题/刷新/关闭后重开并恢复；模拟存储拒绝时旧内容仍可复制。
- [ ] 提交 `feat: persist drafts and rewrite snapshots locally`。记录浏览器最后确认落盘边界，不声称可抵抗系统断电前尚未写盘的数据。

### W3 — 真实 Python 与可靠导题

**Files:** Create `shared/import.js`、`shared/runner.js`、`tests/unified-import.test.js`、`tests/unified-runner.test.js`；Modify `cloudflare/lib/problem.js`、`cloudflare/public/app.js`、`cloudflare/public/runner/bridge.js`、`cloudflare/public/runner/bridge.html`、`cloudflare/public/_headers`。

**Interfaces:** `normalizeProblem({sourceUrl,title,statement,rawSamples,cases,sourceKind}) -> ProblemPayload`；`parseImportInput(text) -> {type:'url'|'json'|'text',value}`；`createBrowserRunner({bridgeUrl}) -> RunnerAdapter`。导入后调用 W1/W2 存储，不直接操作页面全局变量。

- [ ] 写并运行失败用例：LC 函数样例保留原文，不未经确认转 ACM 输入；恶意题面仅作为文本/经严格过滤的内容显示；重复来源导入显示已有题而不覆盖草稿；旧 runId 回包不更新当前题；取消后仍可再运行；只有提供了 expected 才报告比对通过。
- [ ] 实现 URL/剪贴板结构化导入和一个可立即运行的内置 ACM 示例；LC 云端抓取先沿用真实路径。若平台拒绝，给出插件读取当前页和粘贴导入两个可用入口，保留用户填写内容，不显示假成功。简单安全转换给用户预览/编辑，不引入自动模板函数解法。
- [ ] 运行器维持无账号凭据沙箱，沿用现有 5 秒执行、30 秒加载、32 KiB 输出上限；代码/输入传递和结果按 runId 校验，超时终止 worker。取消按钮、加载状态、异常/标准错误/无期望结果分别展示；不把超时编译输出当答案。
- [ ] 运行 `node --test tests/unified-import.test.js tests/unified-runner.test.js tests/cloudflare-practice.test.js`；真实浏览器执行 `input()`、多行输入、中文输出、无限循环、超量输出及立即换题。用真实 LC 链接验导入，若受阻记录该路径未通过，确保替代入口能得到同题题面/原始样例。
- [ ] 提交 `feat: connect real Python runs and source-aware imports`。

### W4 — 已认可的三页外观与今日安排

**Files:** Create `shared/ui/tokens.css`、`shared/ui/workspace.css`、`shared/ui/workspace.js`、`tests/unified-workspace.test.js`；Modify `cloudflare/public/index.html`、`cloudflare/public/styles.css`、`cloudflare/public/app.js`、`cloudflare/public/account.js`、`cloudflare/lib/recommendations.js`。

设计参考原文件：`/Users/pygmalion/.codex/visualizations/2026/09/29/01a0eded-abd9-7e52-af94-ffa6efb1c56f/acmcoder-workspace.html`。实施前保留一份到 `docs/design/approved-workspace.html` 供其他环境查看；其中运行/AI/导入演示只用来理解交互。

**Interfaces:** `mountWorkspace(root,{store,runner,importProblem,account,clock}) -> {navigate,destroy}`；`navigate({view:'today'|'library'|'practice'|'settings',problemId?})`；`buildToday({day,timezone,plans,reviews,candidates,count}) -> TodayModel`。时间输入可注入测试，不在各组件各算一次日期。

- [ ] 将已认可 HTML 原型的设计令牌、三页布局和明暗主题移植为真实界面；保留代码区稳定背景。首次无记录进入“今日”并提供可运行示例，有记录恢复上次视图与题目；不携带原型假 AI/运行成功回调。
- [ ] 接通题库搜索、我的/推荐/归档、导入预览；今日继续上次、题量、完成、次日复习。复习是可选动作；日期按用户时区计算，不使用 UTC 截断。预设示例/推荐不足时如实显示，不能自动重复补满。
- [ ] 写交互断言：归档题不出现在未完成计划入口；恢复题保留进度；午夜前后、换时区、切夏令时的“明天”按日历推进；今日完成不强制新建代码快照。运行 `node --test tests/unified-workspace.test.js tests/cloudflare-draft-ui.test.js`。
- [ ] 在真实页面验 1440×900、1280×800，插件布局留 E2：Tab/快捷键不误触运行，中文输入不丢字，减弱动态设置生效，长题面/代码可滚动，明暗主题可读。完整走导题→运行→恢复→重写→对照；无必要不换编辑器依赖，本批沿用现有输入组件。
- [ ] 提交 `feat: deliver glass workspace today library and practice views`；把预览地址与截图证据记入交付日志。

### W5 — 归档、彻底删除和完整备份

**Files:** Modify `shared/records.js`、`shared/browser-store.js`、`cloudflare/lib/records.js`、`cloudflare/lib/backup.js`、`cloudflare/public/backup-ui.js`、`cloudflare/functions/api/[[path]].js`、`tests/cloudflare-backup.test.js`；Create `tests/unified-data-lifecycle.test.js`。

**Interfaces:** Store 增加 `archiveProblem(id)`、`restoreProblem(id)`、`deleteProblem(id,{confirmed:true})`、`exportBackup() -> BackupV3`、`restoreBackup(backup,{mode:'merge'}) -> {imported,conflicts,skipped}`。`BackupV3={version:3,exportedAt,records}`；凭据、运行临时输出不进入备份，旧持久记录不因导出限制丢失。

- [ ] 写并运行失败用例：101+ 条历史和 31+ 天计划完整导出；归档恢复前后相关代码相等；彻底删除该题、草稿、快照、对话/复习引用并产生墓碑；不误删其他题/账号；V1/V2/V3 重复恢复幂等；损坏文件校验失败前数据库不变；备份不含 key/token。
- [ ] 日常删除入口改为归档；彻底删除面板列出题目与相关记录数量，明确需确认。删除事务连同关联数据和 S2 需要的删除变更一并提交；备份恢复遇到墓碑时不复活旧 ID，用户明确恢复则分配新 ID 并重映射引用。
- [ ] V3 分页导出所有持久记录；导出读取统一 revision，期间有写入则重试受影响页或报告需要重试，不能产出悄悄不一致的文件。恢复先验证大小/类型/所有引用、预览数量与冲突，再按批次和恢复会话 ID 幂等写入；取消或失败可续，不覆盖新数据。
- [ ] 运行 `node --test tests/unified-data-lifecycle.test.js tests/cloudflare-backup.test.js`。真实账户导出→新浏览器恢复，比较题数、完整代码、计划与对照记录；在导出期间编辑一次确认一致性保护。
- [ ] 提交 `feat: add reversible archive and complete versioned backups`。

### W6 — 公开网站与第一批发布验收

**Files:** Modify `cloudflare/functions/api/[[path]].js`、`cloudflare/public/account.js`、`cloudflare/README.md`、`cloudflare/wrangler.jsonc`、`tests/cloudflare-api.test.js`；更新交付日志。

**Interfaces:** 保留现有网页登录方式；新增 `GET /api/capabilities -> {version,protocolVersion,minProtocolVersion,features,limits}`，不公开其他用户统计/配置秘密。匿名练习只用设备存储；登录写接口全部从会话确认所有者。

- [ ] 加失败断言：未被邀请的新有效账号可登录；匿名不能读他人记录；用户 A 不能用用户 B 的 ID 更新/删除；登出后不显示前账号草稿；容量满时读与导出仍正常、新增返回明确错误；提交频率上限不会删除已有记录。
- [ ] 移除邀请名单分支与前端误导提示；保留 OAuth state、会话保护、同源写请求校验与逐账号限额。上线前统计实际容量设置默认预算；免费额度耗尽时降级设备保存，显示待同步，不能无声失败。账号页准确区分“保存在此设备/已同步/待同步”。
- [ ] 运行 `node --test tests/cloudflare-api.test.js`，随后网站里程碑一次 `npm test` 与 site 构建；测试数按实际记录。预览环境连真实 OAuth、Python 和 D1，两个真实账号验证隔离；缺第二账号只阻塞该验收，不能用同账号两窗口替代。
- [ ] 导出现有生产数据的受控备份（不提交，执行者不读取正文），应用已演练的扩展式迁移并部署网站一次。生产走匿名和登录两条完整路径；保留旧部署可回退，回退不能用旧代码破坏新记录。
- [ ] 提交 `feat: open the unified Python website for public use`，日志标注已交付范围与未交付插件/同步/AI。此阶段不宣称最终统一版已完成。
