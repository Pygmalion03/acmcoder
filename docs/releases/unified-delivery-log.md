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

截至下文最新记录：W0 完成；网站、插件、本地/Docker 的统一练习和设备同步已完成多条真实闭环。各任务仍按其剩余验收条件判断，不能据此宣布 W1–W6、E1–E3、S1–S3 全部完成；A1/A2、L1、R1/R2 尚待推进。计划总入口：`docs/superpowers/plans/2026-09-30-unified-product-roadmap.md`。

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
- E1/E2里程碑完整检查 `npm test` **291/291通过**；源码2107e0c已推送，二进制由构建生成。现在进入E3匿名接续，新增20项最小检查通过，真实双向接续待部署后验证。

## E3 — 同浏览器匿名接续

- 传送只包含选中题目、语言草稿及其历史；128位随机标识、5分钟过期、单次消费，并绑定确切目标来源/标签页；URL不包含正文。存储限于可信chrome.storage.session；内容脚本只在生产域名/独立预览域名工作，没有任意扩展存储代理。
- 网站接收时进入guest空间，不自动上传账号。导入前显示预览，冲突或原ID已删除时复制题目并重新映射草稿/快照引用；两份都保留。网站反向打开插件独立工作区确认，侧栏共享该插件存储。
- 最小20项检查通过；部署bdc3f6be（76c95f3）后真实Chrome扩展→HTTPS网站→扩展双向通过：未完成重写/中文输入/旧快照完整接续，冲突新建副本，正文标识成功后从地址移除；网站关闭并断网后插件Python仍通过自测。不依赖登录。
- 当前生成包约5.55MB ZIP，面向开发模式安装；未发布商店和4.0.0正式Release。跨浏览器/跨设备需要后续设备账号授权与同步，不能用本次同浏览器接续代替该验收。

## S1 / S2 / S3 — 设备授权与本地统一版

- 新增0004设备授权表，仅迁移独立预览D1。设备码10分钟、轮询至少5秒；插件用S256 PKCE、state和登记回调。网站显示设备/账号后主动批准，单次交换；访问令牌15分钟、刷新链30天轮换，摘要落库，旧刷新令牌重用撤销整条链。设备令牌只允许记录/同步与自身撤销。
- 插件access在可信session，选保持连接才把refresh留在可信local；内容脚本和沙箱不接收凭据。网站设置增加设备列表/撤销，插件关闭网页后仍可独立同步。开发回调需在EXTENSION_IDS登记，商店固定ID在R2配置；不改变已有未打包插件的身份。
- 部署a638d1a及回调配置重部署c09e2917后，Mac Chrome for Testing真实PKCE窗口→网站批准→关闭网页/移除网页cookie→插件同步→网站读到代码、输入与重写历史→网站撤销→插件草稿保留且断网Python可执行，全部通过。
- 联调暴露focus延迟刷新会重绘正在编辑的页面；已修正练习页保留编辑器，修正后闭环通过。该联调使用临时测试会话，**没有把它作为真实GitHub OAuth验收**。Codex GitHub插件的连接不是网站OAuth配置。
- 本地复用同一PracticeStore和同步适配器，用文件事务接口替换IndexedDB；完整事务先写临时文件并fsync、生成恢复journal、原子rename和目录fsync，恢复时重放完整journal。重写/备份/删除/冲突状态机不另写一份。本地令牌位于学习目录之外、0600，学习备份不包含它。
- 本地统一入口/题库/历史与网站共享UI，保留Python/C++/Java各自草稿；旧页面可从legacy入口访问。旧题面文件迁移保留原文件及副本；浏览器V2语言草稿/前一轮/当前问答按学习键导入，不删除旧键，不读取旧AI配置。
- 真实WSL独立预览43118验证三语言求和、语言切换、刷新恢复重写、历史对照、停止原生进程和下载备份。随后真实本地device flow批准→关网页/移除cookie→独立同步→网站接续本地代码/stdin并保留插件重写历史→本地刷新恢复，通过。
- Docker Node22新镜像acmcoder-app:unified-preview构建成功；独立测试卷/随机回环端口实测三语言AC，移除并重建容器后未完成重写及两次快照仍在。测试卷为新建，未替换用户卷；容器生成的root文件导致清理权限错误，功能验收已通过，随后在仅挂载测试目录的清理容器中完成删除。
- 本阶段完整检查305/305通过；其后账号重连/UTF-8请求处理的相关29项检查通过。正式43117服务未重启，旧数据实机迁移、真实GitHub登录/两真实账号、插件商店ID、剩余同步交互及AI/正式发布仍待完成；不把本次实现记作全计划验收。
- 后续真实旧浏览器迁移验证通过：Python/C++/Java原草稿、未完成重写及原快照恢复，原学习键保留，刷新不重复导入。修正迁移标记按浏览器保存，避免第一个空浏览器阻止其他浏览器导入。临时云测试用户已删除，D1计数确认零；正式账号数据未触碰。
- 网站公开题面读取改为匿名可用，同源校验、固定官方来源、超时/大小限制和每IP每小时20次读取上限；失败仍可手动导入，插件捕获不消耗该网页读取限额。本地统一页增加相同链接导入适配，复用既有LeetCode抓取器。该补充的真实公开站点抓取随本次部署验证。
- 检查并补充当前Mutagen会话排除：data/unified、credentials、.wrangler、.dev.vars*、.superpowers、浏览器测试缓存；保留原端点、两端文件、two-way-safe和已有排除，flush后同步正常。正式服务的sudo重启已按S3计划请用户在自己的终端执行。

## 本轮公开部署的最终验证

- 源码提交`2e418ba`已推送至`codex/unified-product`。Pages Git集成部署`949779f5`和重试`ec94f2ef`均在仓库克隆阶段失败，错误包含GnuTLS接收失败、early EOF和index-pack失败；未继续重复相同部署路径。
- 取Mac已提交源码的`git archive`，在WSL临时隔离目录构建，临时将静态产物与现有API编译为Pages `_worker.js`直接上传。部署`74f078f0-20d8-4f2f-b6d0-bc981a48d36c`成功，对应源码`2e418ba`，未带入工作区原有未提交改动。独立预览D1、域名和Git集成均保留；这是部署恢复路径，后续源码部署仍使用原有Git构建配置。
- 公开入口`https://acmcoder-unified-preview.pages.dev/`，不可变入口`https://74f078f0.acmcoder-unified-preview.pages.dev/`。真实Mac Chrome验证共享首页及CSP下Python自测通过；匿名粘贴题面/原始样例→练习→运行→刷新后中文题面、样例、代码及stdin保留，无pageerror。截图`/tmp/acmcoder-public-import-fallback.png`。
- **真实限制：**本轮Cloudflare直接请求leetcode.cn与leetcode.com均失败，界面明确提示可保留原链接并粘贴题面。公开站的官方题面一键抓取不能标为验收通过；已有真实浏览器插件当前页捕获及网站接续证据仍有效，不以模拟抓取测试代替该限制。
- 公开读取新增匿名额度回归的最小相关检查17项通过；本轮最新完整检查仍为此前305/305，不把后续增量测试描述成又一次全量检查。网站真实GitHub OAuth仍缺独立配置，Codex GitHub插件连接不能代替它。正式43117服务仍active，尚未获得用户执行sudo重启的回复，旧数据实机验收保持未完成。

## 网站 OAuth 配置准备

- 经用户要求，使用其已登录Chrome中的GitHub新建页创建专用OAuth应用`ACMCoder Unified Preview`（应用设置`https://github.com/settings/applications/3894485`）。主页为预览站，回调精确为`https://acmcoder-unified-preview.pages.dev/api/auth/github/callback`，未启用通配回调或GitHub device flow；GitHub显示创建成功。本站自己的设备授权仍走既有独立协议。
- 已通过Cloudflare连接将该应用公开Client ID写入独立预览项目Production的`GITHUB_CLIENT_ID`，核对原EXTENSION_IDS/NODE_VERSION/PUBLIC_ORIGIN仍在，生产正式站未修改。
- GitHub停在生成新Client Secret按钮，Cloudflare Production已准备好名为`GITHUB_CLIENT_SECRET`、类型为密钥的空白输入项，等待用户自行生成、粘贴并保存。依据用户AGENTS中禁止读取/复制真实凭据的规则，未生成、读取或复制该Secret。此项保存前不部署、不声称真实OAuth登录通过；保存后由当前会话完成部署与真实登录联调。

## 2026-10-01 — 网站真实 GitHub OAuth 验收通过

- 用户自行保存Secret后，仅查询配置项存在性与类型，确认`GITHUB_CLIENT_SECRET`为`secret_text`，未读取或打印Secret值。使用此前已验证、源码固定于`2e418ba`的同一部署产物重新绑定环境，部署`5f0168d1-f7a8-4f13-8904-a4231f8434c6`成功，预览站默认入口已切换；正式站及生产正式D1未修改。
- 真实用户Chrome进入网站设置→GitHub登录→GitHub明确显示`Public data only`→用户已有GitHub会话完成授权→站点回调成功，显示`已连接 Pygmalion03`与`已同步到云端`。这是首次真实GitHub OAuth证据，代替先前仅临时会话验证的登录缺项；未访问凭据、Cookie或其他账号资料。
- 新建独立验收题`OAuth 验收：求和（2026-10-01）`，Python输入13 29输出42，实际样例通过。重写中刷新恢复新代码，结束后原代码和重写完成代码可对照。真实预览D1按该题精确查询确认problem、draft（revision 5）、run及两个attempt均已落库，输入保留。
- 退出账号后切回guest，匿名题库不含账号验收题；再次真实OAuth登录恢复同一账号，题库中验收题仍在，显示已同步。验收题随后归档，保留两份历史，未覆盖已有题目或彻底删除任何学习记录。
- 自动化曾在已到达目标前超时（GitHub回调及首次Python加载）或遇到刷新导致的旧节点失效，随后以当前页面与实际结果确认成功；不是网站失败，也未通过读Cookie或造会话绕过登录。未修改应用源码，因此复用已有相关测试，不重复全量测试或构建。截图`/tmp/acmcoder-oauth-accepted.png`。
- 验收范围为预览站真实单账号登录、退出/重登、学习记录云端写入和guest隔离；两真实账号、独立设备真实账号接续、本地旧数据正式升级、AI与统一正式发布仍按原计划待完成，不能据此宣布W6/S1/S2/S3整阶段全部通过。
