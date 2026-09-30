# 统一产品实施记录

## W0 — 2026-09-30 基线

- baselineCommit：`d1a614c`；分支 `codex/cloudflare-free-edition`，远程默认分支 `v3`。
- 执行：当前会话直接实施，不使用子 agent；沿用中央清单 `v3`、`dev-wsl:/home/pygmalion/runs/002-acmcoder/v3`、`acmcoder-v3`、43117。
- dirtyFiles：API 路由、account.js、index.html、styles.css、wrangler.jsonc、旧 feature-parity 计划、cloudflare-api 测试。未跟踪工具目录、AGENTS 和 reliability 计划保持原状。
- reusedChanges：LC cn/com 抓取回退与错误信息、推荐动作返回可复用；历史和批量选择 UI 随新界面改造；批量删除需要转归档；Workers AI 绑定问答保持独立，后续换为 BYOK，不能算本次 AI 功能已完成。
- verification：源码同步完成，WSL Node v24.20.0；`node --test tests/cloudflare-api.test.js tests/cloudflare-backup.test.js tests/cloudflare-draft-ui.test.js` **15/15 通过**，日志 `/tmp/acmcoder-unified-baseline.log`。未重新安装依赖或重复全量测试。
- GitHub Actions 仅 tag `v*`/手动触发镜像发布；本轮不会提前推 tag。网站部署目标和数据库只读检查另记，不打印任何密钥。
- Pages 生产分支确认是 `codex/cloudflare-free-edition`，构建根 `cloudflare`、输出 `public`。已在相同工作区创建 `codex/unified-product` 承接全部现有工作，避免未来推送误发布；无新 WSL 目录或同步会话。生产 D1 当前约 136 KiB、10 张表，仅查询元数据。

## 执行状态

W0 完成（15/15），进入 W1；其他任务尚未完成。计划总入口：`docs/superpowers/plans/2026-09-30-unified-product-roadmap.md`。

## W1 — 统一记录与保留策略

- 历史保留回归先失败（106 条只剩 100），修正后通过；备份超过第 1000 条的分页先失败（400），修正后通过。不再删除 30 天前计划，旧恢复接口不再以 100 条自测记录为上限。
- 新增 records 校验、D1 仓库、幂等迁移与 `0003` 迁移；语言草稿、不可变快照、版本冲突、墓碑、账号隔离、容量事务回滚已由实际 SQLite 测试验证。
- API 迁移入口先失败 404，接通后验证旧客户端被明确拒写，新版继续保存；复用既有账号删除接口。迁移每请求最多两条，避免超出免费 D1 的请求查询预算。
- 本轮最小检查 **22/22** 通过（unified-records、cloudflare-api、cloudflare-backup）。D1 `batch` 官方文档确认整批失败回滚；真实预览 D1 验证随网站构建批次执行，不声称已迁移生产。
- 默认新数据预算：单账号 8 MiB，全站 128 MiB，记录额外预留变更日志/幂等索引空间；基于当前生产约 136 KiB，保守留出数据库行和索引余量。可由部署变量调低，达到上限停止新增，不删除旧内容；实际文件容量需上线前再核对。
- 本任务 API 文件包含前轮已由基线验证的 LC 回退/Workers AI API 增量；AI 仍待 A1 替换为自带 API，不作为统一版已交付功能。

## W2–W5 — 本机网站纵向闭环

- 新增共享 IndexedDB PracticeStore、重写状态、隔离 Python 适配器和三页 UI；通过 `workspace.html` 独立预览，不替换尚未接好云账号的生产首页。
- 已验证：中文草稿刷新恢复、按语言/账号隔离、重写旧输入保留、未完成重写重开、结束并对照、放弃重写、归档恢复、V3 备份导出/合并恢复。无关联快照的损坏备份整体拒绝，不部分写入。
- 真实 Mac Chrome + WSL 服务验收：内置 Python 输出 8 且样例通过；手动导入题面后运行输入3输出6；刷新保留中文代码/输入与重写；对照显示新旧；归档恢复后记录在；备份真实下载。浏览器 pageerror 为0。
- 第一批全量 `npm test`：**275/275 通过**；随后增加恢复日志/备份关联检查，并补齐服务端子记录删除墓碑，最小相关测试通过。后续不把275当新增检查后的最终数量。
- 本机预览 `http://127.0.0.1:43118/workspace.html`，端口已登记中央清单；WSL tmux `acmcoder-unified-preview`，只绑定回环，Mac SSH 隧道回环。截图 `/tmp/acmcoder-unified-{today,library,practice}.png`，测试备份只含生成的测试题。
- 待完成：完整旧版所有草稿迁移、推荐入口、云账号/同步、V1/V2 本机恢复、真实预览 D1/OAuth。W2/W3/W4/W5 尚未全部验收，不能标整阶段完成。

## 预览部署与同步第一条闭环

- 新建独立 Pages `acmcoder-unified-preview`、D1 `0324388b-a210-4af8-ab6c-6e403ccba1a2`；仅预览库执行0001–0003。生产 Pages 保持原分支，排除 unified-product 的自动预览，避免连到生产库。
- GitHub 构建 `npm ci --ignore-scripts && node scripts/build-pages.mjs`；首轮部署20930f6f成功。真实Chrome访问公开HTTPS站点，Python输出8、中文恢复、重写对照、导入输出6、归档恢复、导出均通过，无pageerror。
- 新增持久同步队列、单记录发送、pull游标与记录原子落盘、版本冲突及双方导出；写入等待云端时仍先存本地。通过账号namespace隔离匿名和账号副本，匿名合并需主动点击。账号切换/失效暂停同步。
- 修正旧云草稿使用规范problem--language ID；移除邀请登录限制。预览站没有独立GitHub OAuth配置，页面明确显示登录不可用，不冒充OAuth验收。
- 本地相关测试29通过；增加“旧编辑器在云端更新后继续输入不得覆盖新版”回归后最小22通过。同步两浏览器真实联调待本次构建完成。
- 后续：独立设备授权、扩展/本地适配、冲突另存为新题、恢复冲突可视化、退避和完整账号删除页面仍未完成；本记录不宣称S2或整计划已完成。
- 部署7844a673（e9a6b72）后，真实Pages+D1验证：两个独立Chrome环境同测试账号接续、重写历史、双方离线修改冲突、明确保留本地后传播均通过；第二测试账号内容隔离。真实D1重试幂等/父子删除/旧ID不复活通过。测试用户及临时会话已清理，OAuth仍未验收。

## E1/E2 — 免部署插件首次真实运行

- 固定Pyodide0.29.3及npm摘要；五个随包文件共12,284,602字节，安装时校验SHA-256。沙箱opaque origin +独立Worker，固定内存资源映射，CSP禁止网络；用户代码没有扩展权限或父页面。第三方许可证随包。
- 新默认侧栏复用共享题库/今日/练习/保存/重写/归档/备份；旧本地侧栏保留入口和配置。旧Python/C++/Java草稿按白名单迁移，原存储保留，不读取旧API Key。
- 真实Mac Chrome for Testing151：断网中文多行输入通过，首次3.2–3.6秒；无限循环取消41–52ms，之后连续三次运行通过；chrome/parent不可访问，网络拒绝；关闭重开恢复重写，对照旧代码；360/480px无横向溢出。LC cn/com真实捕获通过，重复导入保留已有草稿。
- 最小相关验证：扩展旧功能15通过；新增捕获/升级3通过；沙箱来源与旧回包检查加适配器共6通过。商店未发布/未审核，设备授权、匿名网站接续仍未完成。
- 共享UI补充历史版本选择与分页、自测run记录持久保存，避免只有最后一个重写能查看。整计划未完成，不发布4.0.0标签。
