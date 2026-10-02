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

当前状态以[原始18节点核对](unified-requirement-audit.md)为准。rc.13公开分发及源码/Docker新安装、升级、回退已完成；新用户ZIP账号连接缺口在rc.14源码中修正，候选包及商店准备包已生成但仍待真实实装。同步删除的真实独立客户端证据、插件最终安装回归及当前截图仍未完成，尚不能宣布完整计划完成。以下按时间保留历史实施记录。

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

## S2 补充 — 冲突副本与自动重试

- 在已有`codex/unified-product`工作区继续，沿用当前实施记录；Ruling：复用既有计划/记录和单写入者配置，不新建worktree或派发代理，不重复此前通过的验收。用户已要求直接推进，按其轻量验证纪律选择本轮相关检查及一次里程碑全量。
- 冲突页面增加“另存为新题”：原题采用云端版本，当前本地题面、各语言草稿、重写快照及题目关联记录复制到新ID，`previousAttemptId`同步映射。复制与处理原冲突在单事务提交，失败保留原状态；本地文件存储共用相同规则，HTTP方法白名单显式开放该动作。
- 另一设备已彻底删除原题而本机尚有未同步工作时，仅为这组冲突保留题面/历史恢复包；复制恢复为新题，不上传旧ID。处理全部冲突或复制后清理内部恢复包。原题没有本地未同步工作时不保存已删除正文。
- 网络/超时/限流及服务端临时错误按5秒起步倍增，最多5分钟自动重试；后台编辑和focus事件尊重等待时间，用户主动同步及online可立即重试。退出/授权失效取消等待，容量不足和其他明确协议错误不自动循环；本机队列保留。
- RED：新增冲突复制/删除恢复两项因缺方法失败，网络重试因状态缺失失败；随后自动触发不得绕过退避的补充断言先失败。GREEN：实际SQLite双设备同步及真实文件事务相关19项通过；本地写盘失败保持旧草稿/冲突且无半成品副本，重开后副本队列仍在。本轮一次`npm test` **311/311通过**，日志`/tmp/acmcoder-sync-milestone-tests.log`。真实UI验证随本批部署进行，不提前标通过。

- 真实单账号本地 device flow 接续成功；独立测试题实际网站与本地交叉编辑形成冲突。界面验收发现冲突后继续编辑时 conflict.local 仍指向旧值，导致副本丢失最后输入；补充回归先失败，再更新所有既有冲突的本地值，相关15项通过。
- 实际点击“另存为新题”后，网站原题保持云端确定版本，新题包含本地最后修改、stdin、题面和重写前原快照；网站重新打开副本历史对照通过。两道验收题已归档保留历史，本地退出验收连接。截图`/tmp/acmcoder-sync-{copy,cloud-copy}-accepted.png`。这是两端真实账号接续，不代替两真实账号验收。

## A1 第一批 — 自带 API 请求与设置接入

- 共享自由问答/按题按语言对话、取消、requestId 去重、上下文截取及独立 CredentialVault 已实现；Key 默认内存，可选口令 PBKDF2-SHA256/AES-GCM 加密保存，学习导出和同步不含凭据。提供商错误不回显正文，答案中当前 Key 被过滤；无 Key 不回退共享模型。
- 网站登录转发仅允许明确 HTTPS 基地址，不跟随重定向，最多1 MiB响应；本地 token 保护请求、显式回环 HTTP 开关，插件只在保存时申请所配置 origin 的可选权限。三端共享设置/问答界面，默认不附带代码，不改编辑器。已有旧版 assist 接口暂保留，旧明文配置迁移待后续完成。
- 新增核心/vault测试先因模块缺失失败，修正后通过；协议、真实 SQLite 账号隔离/转发、Node HTTP鉴权以及同步相关66项通过，补充换题与取消后最小52项通过。三客户端构建通过。真实浏览器通过本地 HTTP 兼容测试服务完成保存配置、连接成功、自由问答、取消、401恢复；原代码未被修改。这是受控兼容服务，不声称真实模型提供商通过。
- 本批 Cloudflare 连接恢复，预览项目已有OAuth配置保持；本批源码与部署ID待最终构建/上传后补记。真实 Key 问答、插件权限实装、旧 Key迁移仍待完成，A1整任务不标完成。
- 真实 Chrome 口令加密保存后刷新显示锁定；正确口令解锁、连接测试成功，清除后请求被阻止，未保存口令或打印Key。截图`/tmp/acmcoder-ai-vault-accepted.png`。最后增量66项通过（含旧assist、Node HTTP、Pages鉴权、扩展现有检查），日志`/tmp/acmcoder-ai-milestone.log`；本轮不重复此前311项全量，不把新增测试当作又一次全量。
- 源码`c48644d`已推送，固定源码archive构建并直接上传同一预览项目，部署`c12df90a-08b2-44b4-80b2-0420a08de54d`成功；旧Git克隆故障恢复路径沿用，未带入原有未提交文件。公开Chrome显示真实GitHub账号、已同步和新API设置；无Key测试明确阻止请求。截图`/tmp/acmcoder-public-ai-settings.png`；已请用户自行配置，未索取/读取真实Key。

## A2 第一批 — 自然语言找题与来源预览

- 题库新增自然语言入口，优先已保存题和已有目录；找到已保存原题直接接续，保留代码。目录和AI建议只作未验证候选；选中后源适配器读到实际题面/样例才标已读取原题。公开抓取受阻时保留候选及输入，提示使用插件或粘贴，不能把空题面候选冒充已导入。
- 仅接受规范LeetCode HTTPS题目路径，无凭据/端口/查询/片段；模型虚构verified标记被丢弃，不存在slug保持未验证，模型正文不会自动成为平台题面。只有用户明确要求原创才接受AI原创，原题链接强制为空，生成样例明确标记。导入预览新增可编辑ACM样例，保留原始样例和多个原创测试用例。
- 新增四项回归先缺模块失败，修正后导题/源解析/问答相关13项通过。真实本地Chrome输入“导入 LeetCode 二分查找”→实际LeetCode题面/样例→自填ACM输入→保存→原生Python输出4、样例通过；再次查找显示已保存，程序未被覆盖。真实不存在slug返回无题目，候选仍未验证。截图`/tmp/acmcoder-natural-import-accepted.png`。
- A2真实模型找未知题/原创仍等用户Key；上述目录检索不消耗模型请求。网站Cloudflare原题读取此前受阻，本地成功不代替网站抓取验收。当前A2批次等待构建/公开部署，不能标整个A2完成。
- 收束A1/A2批次后完整`npm test` **325/325通过**，日志`/tmp/acmcoder-ai-import-milestone.log`；三客户端构建通过。不存在原题真实点击导入被明确阻止，输入保留；本地二分查找验收题已归档保留程序，不覆盖用户题目。正式43117未重启，仍待旧数据实机升级。
- 源码`e06eba5`已推送，同commit隔离构建的公开部署`b6b31c83-7338-4023-9b45-6ff9f0d7702f`成功。真实公开Chrome自然语言匹配二分查找并展示候选通过；选择候选后Cloudflare抓取cn/com仍失败，正确保留链接和题名、未显示虚构题面。截图`/tmp/acmcoder-public-{problem-finder,source-limitation}.png`。保留另一个AI设置页等待用户配置，未刷新丢失用户可能填写的内容。真实模型及插件AI实装仍待完成。

## Goal 启动留存及 S2/W5 收尾 — 2026-10-01

- 开始连续推进前建立注释标签 `checkpoint/unified-before-overnight-20261001-031148`，指向 `fc04ca15ed7f80e3c19d77bc39bda52b1a2a1313`，已推送 GitHub。Mac 私有目录 `/Users/pygmalion/Documents/Codex/Backups/002-acmcoder/before-overnight-20261001-031148` 保存验证通过的 Git bundle、源码归档、原有未提交补丁和两份未跟踪源码文档；没有备份密钥、缓存或运行数据。固定部署 `b6b31c83-7338-4023-9b45-6ff9f0d7702f` 的恢复入口记录在 checkpoint.json。
- 抽出题目副本引用映射，修复同步冲突和匿名接续副本中 AI 会话使用随机 ID 导致界面读不到历史的问题；按 kind/id 分别映射，防止不同记录类型共享 ID 时串引用。原题不覆盖，草稿、快照、对话一起复制。
- 备份和匿名合并冲突保存在独立待处理区，刷新不丢失，完整备份包括待处理版本。设置页新增查看、导出与题目另存入口，另存保留旧快照和对话；彻底删除的 ID 不复活。全局偏好冲突保留待处理版本，不替用户覆盖设置。冲突快照依赖的草稿不直接导入，避免指向错误历史。
- 真实 Mac Chrome → 隔离 WSL Node 43118：通过原生文件选择器导入两份合成备份，显示2项冲突；刷新后仍在，另存后原题与新题同时可见；副本代码、stdin 10 32、期望42、重写前代码及 AI 对话均恢复，真实 Python 样例通过42。自动文件上传缺少浏览器文件访问权限，改用原生选择器完成，未扩大扩展权限。没有触碰用户真实 Key。
- 网站新增云端用量查询（使用当前实际服务配置）和账号删除确认入口。DELETE 确认字段与原版确认方式兼容；必须当前网页会话与同源验证，设备令牌不可删除账号。隔离 SQLite 回归证明删除账号A清除会话/记录/变更/用量/迁移/设备授权，账号B保留；没有在真实账号执行删除。
- 新回归先失败后通过。恢复/同步/本地/接续24项通过；此前账号/API/设备/生命周期相关36项通过。最新全量暂仍为上一批325/325，本轮暂不声称全量或公开部署完成。正式43117服务仍active，sudo不可用；用户真实旧数据实机升级仍待执行。
- 本批最终完整 `npm test` **331/331通过**，日志 `/tmp/acmcoder-recovery-account-full.log`；三个客户端构建通过。源码提交 `5416774a055dcd52e740eb987a0775f6b95a0955` 已推送。固定该commit的隔离archive构建、沿用已验证direct-upload恢复路径，新公开部署 `63a92ec5-3f46-465c-833b-b9ce98bf5a64` success，固定地址 `https://63a92ec5.acmcoder-unified-preview.pages.dev`；当前公开域名已切换。本批无数据库迁移、没有反向删除数据，先前固定部署保持可访问。
- 真实公开 Chrome 验证 GitHub账号仍连接、同步状态正常、新恢复入口可打开；云端容量实际返回4/200题（含归档）、0.02/8.00MiB。删除入口显示完整范围及输入DELETE要求，随后点击取消；没有提交删除。插件AI真实权限/真实提供商、两真实账号、稳定服务旧数据升级、统一版本和发行包依然按原完整计划待完成。

## R1 候选版准备 — 2026-10-01

- 产品根版本定为4.0.0-rc.1；根版本生成三端version.json、同源commit、协议/最小协议和实际语言。Chrome数字版本使用4.0.0.1，正式4.0.0使用4.0.0.65535以保证从RC升级。设置页显示候选版本与源码提交，加载版本信息不阻塞用户导航。
- 新增候选/正式两级发行检查；不同源码提交、版本/语言/协议不一致拒绝打包。正式检查必须满足原始验收和根许可证；当前外部验收不全，因此不tag、不正式publish。新增可复现插件ZIP、源码Git归档和SHA256清单；实际构建结果待下条记录补充。
- Docker改为锁文件安装并构建统一静态目录，服务优先加载同一构建产物。镜像smoke新增版本、统一UI、草稿写读/备份检查；隔离新卷执行，不对用户运行数据做测试写入。
- 镜像发布工作流先运行完整稳定验收，再发布固定版本/源码标签并保存digest；显式禁用metadata-action的自动latest。单独候选流程只生成Actions artifact，不发布网站/镜像或更改稳定渠道。实际双架构和GHCR发布保持待完成。
- 更新升级、数据/隐私、真实功能对照、依赖许可、插件安装和候选说明；仓库许可继续等用户选择，未擅自创建LICENSE。原有未提交Cloudflare文件和旧计划不纳入本批。相关检查首次35/35、工作流修改后12/12通过；两个YAML文件由Ruby Psych解析通过。当前尚未声明本批完整全量或公开部署通过。
- 本批源码`12b5217562981e93f232b2307995dcee630bd1a6`已推送。同commit的Git archive在WSL隔离目录构建全部客户端，完整测试 **333/333通过**，日志`/tmp/acmcoder-r1-full-tests.log`。候选一致性与打包通过；正式检查按预期拒绝RC、未选许可证、双真实账号、真实AI/原创导题和旧安装升级。没有创建发行tag或启动GHCR发布。
- Mac生成包目录`dist/releases/4.0.0-rc.1/`：插件ZIP 5,565,955字节，SHA256 `49eb639661c6802bb28b6079449878f2d59d84af618aade82384162a798fe792`；源码tar.gz 674,591字节，SHA256 `825bf4eb8d044251f4aa83af10c6b9fe1bef9344fe34c536cffd89a8e98c3198`。再次打包ZIP摘要一致；源码Git pax header对应同commit。发行清单关联实际网站和本地Docker镜像，不冒称GHCR已发布或arm64已验证。
- 同commit的Docker app `acmcoder-app:unified-rc1-12b5217`在独立新卷、read-only/cap-drop/no-new-privileges环境运行；统一UI、version.json、草稿API/备份、Python/C++/Java真实执行全部通过。删除测试容器后使用同一卷重建，读取原草稿stdin和代码仍一致。Linux amd64本地image ID `sha256:a16ea66601acc64146db4b24edcb73fafcca96d64c1b7d203152a4ddae0f2388`；这是本地镜像标识，不是GHCR registry digest。日志`/tmp/acmcoder-r1-docker-build.log`。
- Pages预览部署`1ef23ae8-c608-4610-bb53-e51be5ac9f7c` success，同commit固定网址`https://1ef23ae8.acmcoder-unified-preview.pages.dev`；公开域名version.json与客户端一致。真实Chrome设置页显示`4.0.0-rc.1 · 候选版 · 12b5217 · python`，原GitHub账号与已同步状态保留；未刷新等待用户配置API的旧标签页。本批无数据库迁移，旧固定部署仍保留。
- 额外旧卷演练：实际`ghcr.io/pygmalion03/acmcoder-app:v3.0.4`在隔离卷通过API捕获中文题目、原生Python运行AC并导出旧记录，然后同卷切换候选镜像。新版题面/样例迁移、原文件和旧接口AC次数保留通过；**新版progress记录为0，旧AC次数尚未迁入新记录**。这是实际发现的待修正项，不能将此演练标为完整升级验收。没有读写用户稳定服务数据或真实密钥，正式43117服务未重启。

## R1 旧统计迁移修复 — 2026-10-01

- 为本地progress.json增加独立的一次性迁移步骤，早先题面迁移已完成的安装也会执行；关联已迁入题目，未捕获题面则保留可补充来源的父记录。保留旧文件和不含凭据的私有迁移副本；统计进入统一progress和完整备份，不制造不存在的代码或运行快照。
- 题库和练习页显示“旧版自测通过N次”；原版runner的AC是样例自测结果，不能冒称原平台隐藏测试通过。删除过的迁入题不会由旧统计复活，重启不重复累加或覆盖后来写入的记录；迁移中断后能重试。
- 新测试先因缺少progress失败。修复后迁移、文件事务、备份、HTTP/旧API和生命周期相关 **39/39通过**；测试覆盖123次记录、106道题、已完成题面迁移、删除标记和完成标记写入前的中断。不重复上一批333项全量；本批实际Docker/UI验收待下条补记。
- 源码`25814b761e4c5fa7a9f6c6c24f60ecc82d5b5d83`已推送。固定commit的archive构建Docker app `acmcoder-app:progress-25814b7`；本地amd64 image ID `sha256:9e42010790114766b8c83fb43804f9390c830fac4d36b94dd434b89fcc623532`，日志`/tmp/acmcoder-progress-docker-build.log`。没有覆盖旧rc1源码/ZIP或稳定3.0.4镜像，没有发布GHCR/tag。
- 延续上一批真实3.0.4生成数据的同一隔离卷，由旧候选切换修复镜像；API读取到统一progress次数1，旧题面/中文/样例与旧接口次数仍为1。重启修复容器后只保留一条progress，草稿10 32保留。完整备份已包含旧统计；在独立本地预览43118合并恢复该备份，无冲突、导入3条。
- 同commit构建local-web后，只重启会话自建的tmux `acmcoder-unified-preview`，保留其测试记录和独立数据目录；未重启需要sudo的正式43117服务。真实Mac Chrome题库/练习显示“旧版自测通过1次”，原题面、原始样例、程序/stdin/期望保留；点击运行实际Python输出42，显示样例通过。该进展补齐隔离旧卷统计升级，不替代用户真实稳定服务升级、旧Key迁移或整个R1最终发行验收。公开站和下载rc1包仍固定上一批12b5217，待下一组统一候选构建后更新。

## A1 旧 Key 独立保管 — 2026-10-01

- 源码 `ce34f0e8b8d421a29850951bc256282f59265a58` 为旧 assist 配置增加独立私有文件：默认本机 credentials 目录，可明确指定；Compose 使用已有独立凭据挂载。文件0600、新建目录0700，临时文件写入/fsync/rename及父目录fsync；完整 Key/地址/模型一起提交，普通 settings.json 只保留非秘密配置。按配置路径串行处理并发更新，不把清除的Key重新回退为环境变量中的旧值。
- 首次读取旧配置时迁移；写凭据或替换旧文件失败可重试。凭据提交后的中断由已提交配置接续，不由旧明文覆盖；损坏JSON/凭据的错误不包含原始正文。设置、旧问答及今日计划仍可读取原配置。统一页保持独立 vault，不向浏览器返回旧服务器Key，不暗中使用它代替用户自己的设置。预览启动脚本明确隔离旧AI设置路径，避免使用正式安装配置。
- 新增7项凭据迁移检查；相关 `assist-settings`、`assist`、`server` 合计 **39/39通过**，WSL日志 `/tmp/acmcoder-legacy-key-tests.log`。覆盖原文件保留、真实替换失败注入、提交后的恢复、并发保存、清除和环境变量、格式错误不回显内容；独立实际HTTP提供商服务在本地服务器重建前后均收到正确的合成凭据并返回回答。
- 固定该源码 Git archive 构建本地 `acmcoder-app:key-ce34f0e`，镜像ID `sha256:579adf2e040d9f961592c153a41b35467b728cc4736a419376490a7250c0b1fe`，日志 `/tmp/acmcoder-key-docker-build.log`。构建最初因误传短commit被版本校验拒绝，改为完整40位commit后通过；无错误候选发布。
- 隔离旧卷演练：停止会话创建的25814b7容器，真实 `ghcr.io/pygmalion03/acmcoder-app:v3.0.4` 通过旧设置API写入明确合成Key；保留原题目/统计/统一数据卷，切换到该源码镜像并挂载新独立凭据卷。新版旧接口问答与容器内真实HTTP提供商联调成功，设置响应/普通设置文件/统一完整备份均不含合成Key，凭据文件0600，旧progress保留，version.json是完整源码commit。容器再次重启后同检查通过；脚本 `/tmp/acmcoder-key-upgrade-smoke.mjs`。该脚本只使用合成配置，不读取用户真实Key。
- 当前运行验收容器 `acmcoder-key-upgrade-ce34f0e`，远端回环36433；旧验收容器停止、镜像和卷保留。正式服务43117没有重启；公开站与rc1下载包仍固定12b5217，等待下一批统一候选构建。本次完成旧凭据存储迁移这一子项；真实外部AI三端调用、用户现有安装实机升级及整个A1/R1仍未标完成。

## rc.2 — 每日新增运行记录与持久待同步队列

- 固定源码 `041e198308d75f4d0024e2c1e6fda675b0b52cdd`，根版本4.0.0-rc.2、插件数字版本4.0.0.2；共享站点/插件/本地客户端一致性检查通过。新SQL迁移0005增加日计数及事务约束，与新记录提交同事务；重试和失败事务不重复占额度，删除不返还当天额度，旧服务器历史内部迁移不消耗新的日额度。UTC日期、100次上限和恢复时间可在真实设置页查看。
- 达到日额度的新运行记录持久保留在客户端，按服务器返回的恢复时间接续；重新打开继续保留，后台草稿/其他记录仍可发送。浏览器与真实文件适配器验证队列及额度时间恢复，不将历史删到100条。相关存储/仓库/同步/HTTP/旧备份 **48/48通过**，日志 `/tmp/acmcoder-daily-run-tests.log`。本阶段完整检查首次349项中348通过，唯一失败是新增版本说明缺失；补说明及标题后文档目标 **4/4通过**，日志 `/tmp/acmcoder-rc2-milestone-tests.log`、`/tmp/acmcoder-rc2-doc-tests.log`；没有将初次全量日志说成349全过。
- 先取得预览D1的Time Travel书签 `00000016-00000000-000050f6-6cf0dea36009274155716e02bd5e2913`，只读取聚合量（1账号、13条统一记录）。对预览D1 `0324388b-a210-4af8-ab6c-6e403ccba1a2` 应用0005成功，不改已应用迁移、不清理用户记录。该书签属于Cloudflare有限保留期的辅助恢复点，不替代此前长期源码快照或用户学习导出。
- 从Mac固定Git archive在WSL隔离目录 `/tmp/acmcoder-rc2-041e198` 构建三个客户端及发行包；候选一致性与源码归档commit检查通过。Pages direct-upload部署 `ccc0a8e1-e21b-48cb-a3d9-ba2079a90163` success，固定网址 `https://ccc0a8e1.acmcoder-unified-preview.pages.dev/`，公开预览域名切换至同commit。正式网站项目与稳定镜像latest未改；旧固定部署保留。
- 用仅本轮创建的合成账号对真实预览API写入100条自测，重复最后4条没有再计数，101条的records接口返回429/DAILY_RUN_LIMIT，sync接口返回带恢复时间的逐项错误；草稿继续保存，100条历史完整分页可读，显式删除1条不返还日额度。测试代码 `/tmp/acmcoder-rc2-cloud-smoke.mjs`，只生成自己临时会话，不读真实Cookie/Key。清理精确测试账号后，聚合仍为1真实账号、13条记录，测试计数和会话均为0。该合成账号不替代双真实GitHub账号验收。
- 真实Mac Chrome设置页显示 `4.0.0-rc.2 · 候选版 · 041e198 · python`，Pygmalion03仍已连接、已同步；可见用量为4/200题、0.02/8.00MiB、1/100次及当地08:00恢复。未刷新用户等待配置真实AI的旧页面。隔离43118预览更新相同local-web产物并重启会话自己的tmux，version.json同commit、三语言；正式43117服务未重启。
- 本地镜像 `acmcoder-app:unified-rc2-041e198`，实际ID `sha256:9ea9ef65b32ca720f1bd854994e19bb05460b8b286b8017d010f7e5d7333dc74`，只验证linux/amd64，没有冒称已发布多架构GHCR digest。第一次临时验收命令漏掉/tmp的exec导致C++ EACCES；修正为已有CI同样的 `rw,exec,nosuid,nodev`，复用原测试卷后，统一界面、版本、持久草稿、Python/C++/Java实际运行全部通过，无源码/镜像重建。容器 `acmcoder-rc2-smoke-041e198`，远端回环36434；构建日志 `/tmp/acmcoder-rc2-docker-build.log`。
- Mac发行目录 `dist/releases/4.0.0-rc.2`：插件ZIP 5,566,463字节，SHA256 `806887b3088e06469902a79ca09854d8076a061bde7c4931684f1c3ba27d2f4e`；源码tar.gz 688,029字节，SHA256 `f8039dd789c260bc1d9d9e86416178b4ab70aeadfa729aa60852fa7ea501dc9f`。manifest已关联实际部署和本地镜像，正式GHCR/商店/稳定Release仍标未发布。此前rc.1包与最初回退快照继续保留。
- 后续仍需兼容性与最终发布审计，包括保留的旧固定部署写接口是否同样受新增额度约束；本轮真实边界验收针对新的公开预览接口。真实AI三端/原创导题、双真实账号、用户现有安装实机升级、浏览器Java/C++有界验证及许可证/商店身份等仍未完成；本批候选准备不构成18任务全部交付。

## rc.3 — 保留旧部署的日额度兼容修复

- 真实固定旧部署1ef23ae8（12b5217）在计数已100的临时合成账号下仍接受新run，计数未变；新公开rc.2同请求返回429。确认旧部署绕过额度后，新增0006数据库触发器，识别rc.2已经预留的事务，旧写入由数据库计数，内部历史迁移通过独立字段标记。公开参数与ID不构成豁免。
- 补充旧SQL、rc.2旧SQL兼容及事务回退检查；相关50/50、完整351/351通过，日志`/tmp/acmcoder-legacy-quota-guard-tests.log`、`/tmp/acmcoder-legacy-quota-guard-full.log`。版本资料更新后的最小检查和打包结果待后续补记。
- 预览D1原聚合为1账号、13条记录，迁移前书签`0000001c-00000000-000050f6-6b2429f386bd7b7eed8c38c9d92781b6`。REST query两次因触发器解析失败，均核对完整回退；官方import的临时R2上传被连接器域名限制拒绝，CLI没有非交互授权，均未改变数据库。改用临时Worker的D1原子batch，绑定仅为预览D1 `0324388b-a210-4af8-ab6c-6e403ccba1a2`，公共workers.dev与预览入口关闭，定时执行一次后核对新增字段、表和三个触发器。该Worker `acmcoder-preview-migrate-0006-20261001`的定时任务和脚本随后删除成功。正式D1/网站未修改。
- 真实旧固定部署99→100次上传成功，第101次返回429/CAPACITY_REACHED；当前rc.2返回429/DAILY_RUN_LIMIT。另一个临时账号在同一真实预览库通过rc.2上传100条、重试不重复扣额、草稿可保存、100条完整分页及删除不退额度，预留标记为0。只生成自己测试会话并传入其hash，不读取真实Cookie或Key。精确清理本轮三个测试账号后，聚合仍为1账号、13条记录，测试账号与预留标记为0；这些测试不替代两个真实GitHub账号验收。
- rc.3候选版本资料已准备，旧rc.1/rc.2及最初回退快照保留。浏览器语言初查：binji/wasm-clang真实Chrome编译含vector/string/map/sort的新程序，链接缺`__lttf2`，中文源码编码警告；另一套Clang22候选仍待探针。CheerpJ社区许可的自托管/再分发限制及Doppio的独立JCL发行产物已核对，但Java实测尚未完成。本条不把语言调查算作L1完成。

- 固定源码`28d8288105c016335d36920cc9ef882b72f5bc47`已推送；版本资料相关最小检查6/6通过。Mac Git archive在WSL隔离目录`/tmp/acmcoder-rc3-28d8288`构建三个客户端，候选一致性和源码归档检查通过。预览部署`ef947ebc-ce4e-4f70-9a07-b211d577dbeb`已success，固定网址`https://ef947ebc.acmcoder-unified-preview.pages.dev/`，公开域名version.json同commit。真实Chrome显示rc.3、原GitHub账号仍已连接/已同步，用量4/200题、0.02/8.00MiB、1/100次与当地08:00恢复。没有触碰真实AI设置或执行账号删除。
- rc.3真实API额外迁移一个隔离合成账号的1题和106条旧submissions，所有原代码/输出完整分页读取，计数仍为预置99；一条新运行使计数100，重试不扣额，伪造legacyImport与legacy-run前缀仍返回429/DAILY_RUN_LIMIT，迁移完成标记重试导入0。脚本`/tmp/acmcoder-rc3-legacy-cloud-probe.mjs`。清理该测试账号后仍为1原账号、13条记录、0预留标记。
- 本地Docker候选`acmcoder-app:unified-rc3-28d8288`实际image ID `sha256:ac145eb7dacf17cfc0daa2c5f667c9c05d38fc1dcf1e195ddb5d2e953a0ebcea`，linux/amd64。隔离新卷、回环随机映射端口、read-only/cap-drop/no-new-privileges及可执行/tmp下，统一界面、版本、草稿/备份及Python/C++/Java实际运行通过；日志`/tmp/acmcoder-rc3-docker-build.log`。只有会话自建的43118预览已更新同commit静态产物并重启tmux，正式43117服务未重启。
- Mac候选目录`dist/releases/4.0.0-rc.3`：插件ZIP 5,566,465字节，SHA256 `158209e5d3be89344b34cf6a995930d156e8ba62754a759af9a0471e3739619b`；源码tar.gz 692,489字节，SHA256 `331830228112a9137df9afb9354f69295c88ac1017dd2b0212662b8eb43769b3`。manifest关联实际预览部署和本地镜像，GHCR多架构、商店与GitHub稳定Release仍未发布。全部旧候选包、固定部署和最初快照保留。

- 隔离rc.3容器重启后Docker随机回环端口由36435变为36436；一次沿用旧端口的smoke观察最终报ECONNREFUSED，属于验收命令地址过期，没有据此重建镜像或修改源码。核对实际新映射后，只读API验证原草稿code/stdin及commit仍一致，没有先写回同一数据来制造持久化证据。容器`acmcoder-rc3-smoke-28d8288`与原测试卷保留。

## L1 — 浏览器 C++ / Java 有界实机实验，2026-10-01

- 核对当前 Mac HEAD bb6cce3、原回退 tag 和 rc.3 ZIP/源码包仍在；此次不更改公开 rc.3、正式 43117 或用户学习记录。原有五个未提交修改及配置/工具目录保留，不混入实验提交。先前能力说明中的“待探针”已得到新证据，不把本批技术实验冒充18项统一版全部交付。
- 新增 `experiments/browser-languages` 固定来源准备器、浏览器完整探针、隔离帧及两个明确标注为非浏览器的 Node 预检。巨型资源只在 WSL `/tmp/acmcoder-browser-language-assets` 和忽略的 `dist/local-web/language-probe`；12项下载校验固定 SHA256。无需sudo、不执行依赖安装脚本；原生SDK只构建memfs，用户代码由浏览器内clang/javac重新编译。
- C++第二候选 cppstudio v0.1.0/Clang22.1.8/wasi-sdk33。原发行的iostream为教学桩，实际std::getline编译失败；用同版本官方SDK完整iostream替换该头文件，修正UTF-8 stdin/输出及动态WASI方法绑定，链接显式64MiB上限。Node最小预检通过后，在真实Codex内置Chromium的43118页面运行全部9项：标准库、中文多行/emoji、编译错误、20次重复、1MiB输入、128KiB源码、80MiB分配被64MiB预算拒绝、死循环取消、取消后恢复。普通Worker冷加载编译执行3806.5ms、20次热运行约705–925ms，主线程最大110ms。
- 同候选再用 `sandbox=allow-scripts` 的不透明帧、`connect-src none` 与固定5项公共字节资源，不访问应用凭据或存储。全部9项再次通过，opaqueOrigin/networkBlocked/indexedDBBlocked/noExtensionAPI全为true；20次热运行737–855ms，主线程最大159ms，实际执行开始后定时终止可恢复。耗时465.3ms包含编译，不冒称纯取消延迟。完整范围/简要转录见 `evidence/cpp-chromium-2026-10-01.json`。
- C++实际资源原始95,161,999字节；5项gzip合计28,005,315字节，最大13,504,973字节。逐文件可满足Pages25MiB限制，不能沿用把所有资源内嵌在小Worker的方法。产品RunnerAdapter、精确stdout/stderr、标准声明、压缩静态分发/离线包、第三方通知及网站/扩展实装仍未完成；C++尚未启用下拉选项。此前binji候选缺链接符号结论保留，只评估两个候选。
- Java第一候选CheerpJ4.3因自托管/再分发许可需商业授权，不符合当前离线及零新增运营费用条件。第二候选Doppio0.5/BrowserFS1.4.3/JCLv3.2：Node浏览器发行预检实际javac编译新源码并输出结果，80MiB数组分配成功。早期Node适配漏BrowserFS全局/FS构造器，不作为依赖不兼容结论。浏览器启动的HEAD及setImmediate适配问题已定位：使用固定JCL尺寸元数据和MessageChannel后，真实浏览器8/9通过，20次重复约3.75–4.71s、冷运行5.25s、最大心跳103ms、1MiB/128KiB/中文/取消恢复通过。内存用例仍输出UNBOUNDED 83886080；20MiB非托管堆标注不限制托管对象/数组总量。未证明可执行的用户总内存预算，且还需原生JS互操作隔离，不继续无限移植，不纳入本次正式浏览器Java。本地Java保持原有支持。见 `evidence/java-chromium-2026-10-01.json`。
- 浏览器初始连接两次观察超时后继续独立预检，重新取得当前有效内置浏览器并完成真实实验；没有把超时当作已运行任务成功。内置浏览器导出按钮未返回可读下载句柄，证据JSON明确为可见结果的简要转录，不声称保存了完整自动下载或截图。原始结果在本轮UI确认，公开站的私人AI设置页未触碰。
- 新增 `docs/browser-language-support.md` 与R2商店文案/权限/隐私/审核流程草稿 `docs/extension-store-listing.md`。图标、宣传图、真实扩展截图、公开隐私地址与商店身份仍待补齐，未提交审核、未花费费用。WSL准备器重新校验全部资源和JS语法检查通过，日志 `/tmp/acmcoder-language-pins.log`；Node预检日志 `/tmp/acmcoder-cpp22-standard-preflight.log`、`/tmp/acmcoder-java-preflight.log`。此次仅实验和资料，不重跑未受影响的351项产品检查、不重建或部署rc.3。

## L1 — C++17 产品适配与真实本地练习页，2026-10-01

- 开始时核对 Mac HEAD 7d0731f，保留最初 checkpoint tag、私有回退目录和 rc.3 插件 ZIP；其 SHA256 仍为 158209e5d3be89344b34cf6a995930d156e8ba62754a759af9a0471e3739619b。原有五个未提交 Cloudflare/旧计划修改及工具目录未纳入本批。公开站仍 rc.3；正式43117服务和用户数据未修改。
- 新增固定来源的 gzip C++ 构建器、逐文件压缩/解压摘要校验与公共缓存、独立 C++ RunnerAdapter、无网络不透明隔离帧、按语言取消的统一运行入口。网站和插件练习页采用相同 C++17 入口和独立语言草稿；本地仍用原生三语言。源版本进入4.0.0-rc.4工作区候选，旧rc.3能力元数据保持Python，稳定发行另增加 browser-cpp-two-clients 门槛。
- 给固定 LLVM WASM 添加512MiB最大内存，memfs128MiB；用户WASM由lld写入64MiB上限。JS虚拟文件累计32MiB，避免通过seek/文件写入绕过用户linear-memory上限。编译30秒、执行5秒；每次任务退出/取消后终止worker。源码/stdin各200,000字符，仍受既有记录整体大小约束，输出共32,768字符。没有冒称整个浏览器进程只占64MiB。
- 97KB的SDK33 memfs适配器和1707字节官方iostream保存为小型固定资源，来源/摘要/可重建步骤在third_party/cpp。巨型clang/lld/sysroot仍仅构建时下载；许可证保留运行器Apache/LLVM Exceptions、stb及固定SDK33 wasi-libc的多许可/原组件通知，不代替用户选择根LICENSE。网站/插件实际打包压缩运行文件约28.2MB，最大单文件仍低于Pages25MiB。
- 实际Codex内置Chromium打开本地网站构建的统一workspace，在connect-src none的隔离帧编译新源码：vector/map/sort/string/getline/cin/cout/cerr、中文/emoji和没有额外换行的独立stdout/stderr通过；20次连续运行均通过，自动化含观察的耗时3.207–3.967秒。实际编译错误反馈，80MiB申请返回BOUNDED，死循环5秒自动停止，加载中及执行中手动停止，停止后128KiB源码+200,000字符输入输出200000均通过。刷新后草稿恢复。分段UTF-8跨两个流写入分别输出“你”/“好”，1GiB虚拟seek写入被32MiB预算拒绝，40,000字符输出在32,768处明确截断。见cpp-product-local-2026-10-01.json；这些不是公网或扩展断网证据。
- 真实路径发现并修正：clang -cc1不接受driver的-fno-exceptions，保留noeh；替换runner仅改hash不会重载桥接文档，因此使用独立query+nonce。构建时删除输出目录使临时Python预览的cwd失效，已改为每次使用绝对directory后重启会话自建43118预览；不是用户稳定服务故障，没有借此修改产品后端。
- 相关检查最初8项通过；补握手、损坏缓存/重试等后10项通过。完整回归357项中356通过，唯一失败是版本README旧rc.3；更新README/部署引用/rc.4说明后命名和版本相关7项复查通过。日志/tmp/acmcoder-rc4-cpp-full-tests.log。不重复未受文档修正影响的356项运行检查，不声称最初全量零失败。
- 公开Cloudflare静态上传、真实已安装插件断网运行、固定commit候选包与公网部署关联仍待下一批。Java可选有界评估结论保持不进入本次浏览器支持，本地Java不删除；原18任务和真实AI、两账号、用户旧安装升级、许可证/商店身份等门槛继续保留，未标目标完成。

- 产品源码固定commit `ef688b8d0005d2c5450150699a453a16e6b20650` 已推送到codex/unified-product。Mac归档在WSL隔离目录 `/tmp/acmcoder-rc4-ef688b8` 构建三个客户端，候选一致性与打包通过；同固定源码的runner/缓存/版本/文档检查15/15通过。自己的43118静态预览改为此固定构建，实际简单ACM输入3 5输出8通过。未为浏览器阶段重建本地Docker镜像或给旧镜像写新版本标签。
- Mac候选目录 `dist/releases/4.0.0-rc.4`：插件ZIP33,740,055字节，SHA256 `500911c864b696624f0af8bc9170cd37f99b295addd9e4afb20afb971b19cde3`；源码包786,212字节，SHA256 `f6e8898736e1842bcd07cfa945e733a30df7e9880eb824beefd0a1136a236b11`。manifest记录同源码，公网部署/image均未关联，不能作为已部署证明。所有旧候选仍保留。
- Chrome profile yu（浏览器2）的控制调用及重新读取可用表面连续两次超时；停止重复同一路径，没有宣称已经安装/断网验证rc.4。内置浏览器此前的产品实测结果不替代扩展验收。
- Cloudflare最新API核对Pages静态asset上传与部署manifest字段后，预览项目读取可用，生产D1仍为独立预览库。Wrangler4.144.0实际whoami明确未认证。插件能取得短时upload授权对象，但使用该对象的官方静态上传探针和连接器原生upload调用均返回403/code8000013；探针只含公开测试文本，未上传运行资源，未返回/打印授权值。需要恢复可用于静态上传的授权后才能继续公网分发。公开version.json实读仍为rc.3/28d8288/Python，canonical deployment ef947ebc保持不变；正式acmcoder-web与其D1未触碰。

## R2 — 图标与可重建品牌素材，2026-10-01

- 保留原 checkpoint、公开 rc.3、固定 ef688b8 的 rc.4 ZIP/源码包和正式43117服务；本批未涉及账号、授权权限、学习记录或数据库变更。浏览器控制调用仍超时，因此没有制造真实插件截图或把旧截图说成新包验收。
- 新增蓝紫渐变代码/星形 SVG 标记与玻璃卡片品牌宣传图；网站、本地和插件 workspace 使用相同 favicon。扩展构建生成16/32/48/128 PNG并由manifest引用，128图标保留每边16像素透明边距。440×280图是品牌插画，明确不替代真实截图。
- 固定 @resvg/resvg-js 2.6.2 及锁文件摘要，仅构建时使用，不将渲染器放入插件运行代码；不依赖系统字体/外部图。新增 build:store-assets，输出源文件/PNG摘要、尺寸、体积和未捕获截图状态。第三方通知与商店文案按实际候选状态更新；不承诺已安装离线C++或已上架。
- WSL镜像源码完成同步后，素材与扩展实际构建通过；命名/文档/版本相关7/7通过。已查看真实生成的128图标与440×280 PNG，图形和边界完整。固定源码构建及包内文件校验待下条记录补充；不覆盖原rc.4发行目录。

- 固定源码 `19cb17b9cdccaddf0ba9a14159a383694990dd71` 已推送；Mac Git archive 在WSL `/tmp/acmcoder-brand-19cb17b` 构建三端、素材和候选包，一致性检查通过。Mac独立保存于 `dist/brand-candidates/19cb17b`，不替换 `dist/releases/4.0.0-rc.4` 或宣称新正式版本。新ZIP33,761,229字节，SHA256 `d34a17479ba87a14eb99c98e8a62476ddd7afa68faa5200a81a49ecb017cf74e`；源码793,568字节，SHA256 `eae8044f17dae7da5de346274a5721a61ce7f07a80a6333a3e245860040b7e14`。
- 真实生成的5张PNG逐chunk CRC、像素尺寸、摘要/体积、128透明留白检查通过；ZIP完整性和manifest所有图标路径通过，包内图标与素材PNG逐字节一致，无渲染器二进制。Mac再次核对新包摘要与原ef688b8 ZIP摘要不变。独立只安装生产依赖的源码目录 `/tmp/acmcoder-brand-prod-19cb17b` 构建local-web通过，证实新增开发渲染器不阻塞Docker的omit-dev路径。
- 补随包共享数据与隐私HTML、无脚本样式及设置入口；题目/记录、AI传输和Key、设备授权、云容量/日额度、归档/删除/备份与联系说明均对应现有实现。支持Issues及政策源码的匿名HTTP访问200。页面随三端构建复制；浏览器渲染、公开隐私URL和真实插件截图仍待验收。候选Actions流程同时生成并保存品牌素材，但本轮没有触发云构建或商店提交。

## rc.5 — 完整 Pages 静态资源与 API 构建，2026-10-01

- 重新核对预览项目，GitHub来源仍为Pygmalion03/acmcoder、生产分支codex/unified-product、输出dist/site；最新4bda5ad部署明确因commit_message跳过，不是仍在运行的任务。Wrangler4.144.0 whoami仍未认证，但已有Git集成提供不同的受支持部署路径，不继续重复403上传探针。原公开rc.3、稳定43117、旧候选和回退点保留。
- build-pages改为编译现有cloudflare/functions到小型_worker.js，运行资源全部作为静态文件；首页切换统一workspace，原入口保存在legacy.html。固定Wrangler4.144.0，本地不读OAuth/D1仪表盘秘密或把旧正式配置带到输出。_routes.json只有/api/*，静态请求不消耗Functions调用额度。
- 新增Pages产物检查：已知源码提交、共享首页、隐私/图标、Worker免费压缩预算、25MiB单文件/20,000文件、C++资源尺寸/摘要/总量及不允许符号链接。新增4项失败边界检查；第一次23项相关检查中仅测试夹具体积写错失败，改为核对实际stat后完整回归361/361通过，日志/tmp/acmcoder-rc5-milestone-tests.log。WSL完整Pages实际构建通过，64静态文件、API Worker110,107字节；该本地检查不冒称已公开部署。
- 根版本统一递增4.0.0-rc.5，插件数字4.0.0.5；增加发行说明、部署步骤与候选Actions的Pages构建清单。接下来从固定提交触发已有Git集成并核对公开资源/API；不更新稳定tag/GHCR/latest，不做数据库迁移或清理用户数据。

- 固定源码 `96fe8684bf29885e2aab2353652f0c0af9338867` 推送后，真实Git部署 `999d9c9f-99dd-410e-8d0e-8a4cabe122ec` 已clone/build，随后失败：Wrangler4.144.0的弃用outfile生成multipart上传封装，平台将其当_worker.js解析时在Content-Disposition冒号报错。公开rc.3未替换。根据云端错误改用outdir的纯index.js，并在产物检查增加ES模块语法解析；新增封装回归先失败，修复后API/产物21/21通过。不是盲目重试同一失败部署。
- 该首次rc.5源码仍独立保存：三端/素材/包构建一致性通过，Mac dist/releases/4.0.0-rc.5暂对应96fe868；需要在校正源码包关联时另保留该目录，不能覆盖原包。其本地amd64 app镜像 `acmcoder-app:unified-rc5-96fe868` ID `sha256:ba4117fdb02598502244d915767e8cb7b1b9c93c2829d3e5a9640d0631efbb4e` 已构建，独立新卷/只读/cap-drop环境真实smoke通过：统一界面、同commit、草稿/备份、Java/C++/Python执行。它不是已部署网站或公开GHCR镜像的证据。容器 `acmcoder-rc5-smoke-96fe868` 随机回环36437，旧容器/卷/镜像保留。

- 使用真正本地Pages运行时与独立local-DB（不是远程预览/正式D1）发现`.html`会308到无后缀路径；原cpp-bridge.html上的CSP没有进入最终200响应。补workspace/cpp-bridge规范路径及隐私页策略，重启仅会话自建43118 tmux读取新_headers。HTTP联调通过：统一首页、匿名auth/session200、records401、隐私页200、两种C++桥接入口的最终connect-src none/worker-src blob及5份gzip实际摘要。脚本smoke-pages明确不把HTTP检查标为C++执行或离线插件证明。

- 8fd45ad的Git部署edbb5244已成功上传64个静态文件，发布Function时因生成工具注入node:stream失败；项目原配置为2026-01-01且无Node标志。仅预览production兼容日期更新2026-09-30并增加nodejs_compat，OAuth变量名称、预览D1和Git来源保留。重试5dc22b81进入Function初始化后因注入兼容层的Object.defineProperty失败；同源码加构建标志的离线探针仍生成完全相同摘要，因此没有再次盲目推送同一Worker。
- 改为官方Advanced-mode的小型模块入口：复用原onRequest，非API请求转给env.ASSETS；固定esbuild0.28.1中性平台打包，不注入Node/unenv兼容层。Worker87,812字节，构建图没有剩余模块导入；检查拒绝Node专用运行模块。入口/产物/API相关24/24通过，本地真正Pages运行时无Node标志的HTTP联调再次通过。检索当前官方Advanced-mode/最佳实践与Workers类型；新入口无全局请求状态、不读取正文、不打印凭据，保留waitUntil的对象调用。
- 8fd45ad同源码的修正候选包在Mac dist/releases/4.0.0-rc.5；此前96fe868包移到dist/candidates/4.0.0-rc.5/96fe868独立保留。8fd45ad本地镜像ID sha256:33afc82ef1bc593de26ff639e403e84216d286ddf4c1b62570274c8e6fe49529，在同一自建96fe868学习卷替换测试容器后，只读确认原草稿仍为10 32、源commit/版本正确及隐私HTML200，没有先写回原草稿制造证据；容器acmcoder-rc5-smoke-8fd45ad回环36438。两者是过程候选，最终须另关联实际成功网站提交，不作为GHCR/stable发布证据。

## rc.5 — 公网 C++ 执行与同源码产物关联，2026-10-01

- 重新核对 Mac HEAD、中央映射、未提交修改及上一构建句柄；固定源码 `e9a318f8a535936b4f184ad7f4daa0891c5a21ca` 的构建进程正常完成。Cloudflare API确认部署 `55de2797-05f5-44ca-849a-76db500e7993` success，同commit固定网址 `https://55de2797.acmcoder-unified-preview.pages.dev/`。已有Git连接已完成真实上传，不再要求本机Wrangler登录。预览production兼容日期2026-09-30、nodejs_compat保留；正式项目和D1未修改。
- WSL同源码脚本分别检查固定网址和主网址：共享首页/版本/commit、匿名auth/session200、受保护records401、公开隐私页与无脚本CSP、C++桥接规范路径与.html重定向后的严格CSP，以及5个gzip资源的实际尺寸/摘要全部通过。主网址匿名loginAvailable为true；这不是新的完整OAuth登录或双账号验收。
- 真实公网IAB在固定部署独立匿名空间，用演示题编译新C++源码，vector/sort、中文/emoji和独立stderr通过；死循环5秒自动停止，随后新编译运行再次通过，刷新后C++语言/code/stdin/expected保留。没有改写主网址原账号的题目或AI配置。证据 `experiments/browser-languages/evidence/cpp-product-public-2026-10-01.json`，截图 `dist/releases/4.0.0-rc.5/public-cpp.jpg`。网站成功不代替真实已安装扩展C++离线验收，browser-cpp-two-clients保持pending。
- 主网址公开隐私页 `https://acmcoder-unified-preview.pages.dev/shared/privacy` 匿名访问、实际浏览器完整正文及桌面排版通过，图标/渐变/玻璃卡片与正文无重叠。政策及商店草稿登记实际地址；真实插件截图仍待捕获。
- e9a318f固定归档在WSL隔离目录构建三端、Pages、品牌素材和候选包，一致性通过；Mac `dist/releases/4.0.0-rc.5` 现对应该源码，8fd45ad移入 `dist/candidates/4.0.0-rc.5/8fd45ad`，96fe868及所有旧候选仍保留。源码805,840字节，SHA256 `a9174a67e265de28b585e1e471aa0c1f436f0e18520c383433429560950a9ca3`；插件33,765,503字节，SHA256 `47c812e36e2b742e6c2a1fa5f33cf19f460c4bcb456dca300210a20908410d6e`。实际ZIP CRC、源commit、数字版本、图标/隐私/C++资源与Git归档pax commit核对通过，不包含.env/node_modules/.git。
- 同源码本地amd64 app镜像 `acmcoder-app:unified-rc5-e9a318f` ID `sha256:fe03326a0f17ccf78e54e3d087f9b31195b6cc4b07c44d05e33b66ea405e5539` 构建成功。仅替换会话自建测试容器，沿用自建96fe868学习卷；只读确认原Python草稿及输入仍在、版本/commit准确、隐私200。容器 `acmcoder-rc5-smoke-e9a318f` 回环36439；旧镜像/容器/卷保留，正式43117未重启。这次读验证未测试设备授权，不用它替代真实同步验收。
- 发行manifest关联实际部署和本地image ID，GHCR registry digest仍空、稳定渠道未发布；Pages构建清单中的not-deployed仅表示构建时状态，未篡改成部署证据。更新README/矩阵/语言/商店材料与实际公开状态一致。原18任务及真实AI、两个真实账号、旧稳定安装升级、根许可证和商店身份门槛继续保留。

## L1 — 真实插件离线 C++ 验收，2026-10-01

- 未重复调用超时的普通Chrome连接；改用CUA本机窗口操作Chrome for Testing151.0.7922.34，保持未登录，不打开普通Chrome中等待用户配置AI的页面。测试浏览器原来没有扩展；从已校验e9a318f ZIP解到Mac `dist/extension-acceptance/e9a318f`，真实加载未打包插件，界面确认rc.5与实际ID `jmdplnhlhdhcaaefllfndokbcmhbpmdb`。它是测试路径产生的ID，不登记为商店ID。
- 真实扩展工作区在首次C++加载前设置DevTools Offline并刷新，5个编译资源/隔离桥接均从该chrome-extension来源读取；新源码vector/sort、中文/emoji、独立stderr实际编译运行通过。同一标签页访问公网主网址明确net::ERR_INTERNET_DISCONNECTED，返回扩展后C++代码/stdin/expected保持；不是只根据Offline菜单猜测网络被阻断。
- 无限循环5秒自动停止，未定义标识符编译错误清楚显示源行；新C++编译运行恢复通过。切回Python后原独立草稿仍为a+b，并在仍Offline时自测通过。这里的断网是测试目标的DevTools网络阻断，不宣称已关闭整机网络；运行器自身隔离及内存/大输入/20次重复仍引用同源码共享实现及此前真实产品证据，不杜撰本轮测量。
- 保留4份真实原生PNG：`dist/releases/4.0.0-rc.5/extension-evidence/{offline,network-blocked,recovery,python-offline}.png`；摘要 `experiments/browser-languages/evidence/cpp-product-extension-2026-10-01.json`。这些是实装验收证据，尚未裁定为符合商店尺寸的最终截图；LeetCode侧栏与其余商店画面继续准备。
- 结束后恢复No throttling并关闭DevTools，测试安装与学习数据保留。结合技术有界实验、产品全用例及网站/插件两端真实运行，L1现有完整判定：Python/C++17交付浏览器运行；Java两个候选按既定许可/内存原因不进入本次支持，本地Java保留。browser-cpp-two-clients更新passed，网站/包版本不递增；其余原18任务门槛不因此完成。此前文档相关最小7/7通过，无新增运行代码，不重复未受影响全量回归。

## rc.6 — 真实侧栏发现的题面保真修正，2026-10-01

- 重新核对HEAD06eef16、原未提交修改与中央映射；真实Chrome for Testing打开LeetCode cn两数之和，点击实际ACMCoder图标打开侧栏，一键读取成功。但原包把上标10⁴压为104，独立样例区只列第一组。暂不把这个画面作为最终商店截图；rc.5 ZIP、源码、镜像及实装数据保留。
- 新增共享纯文本转换规则，网站API/本地题面读取/扩展捕获及链接导入复用：上标为^、下标为_、段落和br换行保持，所有示例分组保留；来源仍只作纯文本数据，不执行HTML。网页捕获的GraphQL和DOM回退都采用相同规则。内容脚本由固定esbuild0.28.1打包为经典IIFE并作经典语法检查，不增加权限或web-accessible资源。源码extension目录需构建后安装，README明确说明。
- 新增3项题面回归，覆盖数学格式、全部中英文样例、非法字符实体和真正content-script消息入口的GraphQL/DOM两路；相关39/39通过。完整里程碑368项中367通过，唯一失败是README候选文案与已有版本断言不一致；修正文案并增强真实API响应的上标/双样例断言后，相关26/26通过。日志/tmp/acmcoder-rc6-import-milestone.log，未重跑未受文案影响的367项检查，不冒称最初全量零失败。
- 根版本与插件数字版本递增rc.6/4.0.0.6；待同commit构建、公开部署和新安装包真实侧栏复查，再登记实际版本/产物及截图。稳定43117未重启，不更新稳定tag/GHCR/latest，不改真实D1学习数据。

## rc.6 — 实装导入验收与五张真实插件截图，2026-10-01

- 本轮重新核对Mac HEAD89dfab9、原未提交修改、中央映射及上一真实HTTP smoke句柄66223；该进程明确exit0，主网址版本/commit、匿名接口、受保护接口、隐私与C++桥接规范路径CSP、五份gzip资源检查通过。Cloudflare API另确认部署`95614136-812a-486d-8296-792d95188b0a` success，源码`89dfab94fa10cb946df8f10b04de04ae17c4475e`，固定网址`https://95614136.acmcoder-unified-preview.pages.dev/`。正式项目/D1和稳定43117均未修改。
- 同源码三端、Pages、品牌素材、候选包和Docker构建正常完成。Mac `dist/releases/4.0.0-rc.6`保存源码811,775字节/SHA256 `97e328a07e6719d80fd7f8af5b1843ba868ed32297113aced68a9ccb82dec603`，插件33,766,901字节/SHA256 `34608f4b394dbd540e2e7691acfabb266d775472118e929d58af1b92fd518d0c`。实际体积/摘要、ZIP CRC、数字版本、version.json、经典内容脚本和源码归档pax commit核对通过；旧候选/回退点保留。
- 新app镜像`acmcoder-app:unified-rc6-89dfab9`，本地ID `sha256:8bcb7a3b6a9ede40a9ba2f613636acdaab2f1241d845fa88d8526a6e7cae02e6`。只停止并保留会话自建rc.5测试容器，rc.6沿用自建96fe868学习卷，以正确的`ACMCODER_CREDENTIAL_DIR`及read-only/cap-drop/no-new-privileges限制启动，回环36440。只读getDraft先确认原Python程序与10 32输入仍在，版本/源码/隐私200一致；没有先写回数据制造持久化证据，没有测试或暴露授权凭据。实际image/部署关联写入发行manifest，GHCR仍未发布。
- 将旧测试安装目录完整复制为`dist/extension-acceptance/e9a318f-rc5-preserved`，再从实际rc.6 ZIP替换同一路径；测试ID `jmdplnhlhdhcaaefllfndokbcmhbpmdb`保持。浏览器更新页显示rc.6；重载后后台报告No SW并未启动，侧栏先停在静态捕获栏。读取实际DevTools和后台状态后，停用/启用同一测试插件恢复Service Worker及工作区，无源码变更或数据删除。此处是开发安装验收，不称商店自动更新已验证，也不将最初空白算成功。
- 升级保留原两数之和存档及a+b的Python/C++独立草稿。为了不覆盖旧题面/代码，从实际LeetCode可见链接打开未导入的「两数之和 II - 输入有序数组」，真实侧栏一键读取。独立样例区显示三组；实际浏览器导出的备份确认题面包含`3 * 10^4`、`index_1/index_2`且三组样例不含后续约束。既有旧题面没有被自动改写；重复捕获保持此设计。
- 在插件实际编辑完整Python ACM程序，手动安排三组stdin：4 9/2 7 11 15输出1 2，3 6/2 3 4输出1 3，2 -1/-1 0输出1 2，全部自测通过；没有提交LeetCode或称隐藏测试AC。点击重新手撕保存17行原程序，再写7行新程序，完成后新旧对照同时显示。侧栏/完整插件标签页之间接续保留草稿；重复捕获明确显示原代码和历史保留。明天再练动作实际保存10月2日复练，今日页面显示真实三道测试题。
- 两次实际原生下载V3备份分别保留；最终`extension-test-backup-final.json`为18条记录/3道题/3条本题self_pass/2份before-rewrite与completed-rewrite快照，原a+b Python/C++源及3 5输入仍在；重复捕获没有增添重复题。测试浏览器未登录、未配置Key，未读取普通Chrome私人设置。rc.5与rc.6 ZIP中34份runner适配器及资源逐字节一致，沿用先前离线/公网C++完整证据，不冒称本轮重新执行全部实验。
- 真实CFT原生窗口调整为2400×1500，五张选定画面采用实际浏览器75%缩放：LeetCode侧栏完整程序/负数样例通过、插件题库、今日、重写对照、设置版本/备份；额外保留侧栏顶端与无Key AI设置。CUA实际返回JPEG，按真实格式保存为`.jpg`，没有把扩展网页换成网站或生成假UI。通过已锁定resvg2.6.2只等比缩为1280×800 PNG，不裁剪/拼接/覆盖内容；五张实际摘要/尺寸/PNG逐chunk CRC通过，均已逐张视觉检查。图片、转换脚本和原始/输出清单在`dist/releases/4.0.0-rc.6/store-screenshots/`，品牌构建收据的not-captured保持构建时含义，另用实装清单关联当前状态。
- 更新README、部署/功能矩阵、语言/商店材料及rc.6说明；结构化证据`docs/releases/evidence/rc6-extension-acceptance.json`记录范围与摘要。R2当前候选的图片材料已准备；真实AI三端/原创题、第二真实账号、旧稳定安装升级、根许可证及正式分发/商店身份门槛继续保留，不标整个18任务完成。
- 文档同步后WSL最小命名/发行相关7/7通过，日志`/tmp/acmcoder-rc6-docs-acceptance.log`；本轮没有运行代码修改，不重复已通过的完整回归和三端构建。测试浏览器恢复100%缩放、关闭临时DevTools并保留今日页面/实装数据，未改变普通Chrome。此批为`[CF-Pages-Skip]`文档提交，不触发网站重建或替换89dfab9的产物关联。
- 另生成本地可交付素材包`dist/releases/4.0.0-rc.6/acmcoder-store-materials-v4.0.0-rc.6.zip`，4,542,458字节，SHA256 `78bac3aafad832d9216b6dbe14c988d1d769fd2932095dde595822e81f489524`。包含五张PNG/原始JPEG/转换脚本、图标/宣传图、隐私/第三方通知及审阅文案；未包含学习备份、Key或安装运行包。产品源码89dfab9与文档验收提交35dbe82分开登记，包内ZIP CRC和五张截图摘要核对通过。发行manifest和SHA256SUMS已登记材料包；未上传商店或发布稳定GitHub/GHCR。

## W5 — 备份先预览再确认，2026-10-01

- 完整计划复核发现恢复界面选文件后立即合并，尚不满足导入前预览要求。新增共享只读 `previewBackup`，与实际恢复使用同一引用校验及冲突判定；显示题目、各类历史、可新增/已存在/冲突数量。取消和 Esc 不写入；确认时重新检查当前记录，保留已有不同版本。接入本地服务器与浏览器适配器，不改变同步协议。
- 回归首次因缺少方法失败；存储、旧备份、本地文件与 HTTP 相关18/18通过。真实本地验收发现浏览器适配器未暴露该方法，随后修正。最后本地构建来自 `6b94851061672de3388fc754fc86fd8ae039d3d5`，只更新隔离43118预览和会话自己的tmux；正式43117未重启。曾误传短源码标识的构建被校验拒绝，随后使用完整SHA构建通过。此为开发验收构建，未替换89dfab9的公开rc.6、ZIP或镜像。
- 使用实际rc.6插件导出的 `extension-test-backup-final.json`，在Chrome for Testing通过原生文件选择器恢复到隔离本地版。预览3题/4草稿/2快照/8自测/1复习，新增16/相同1/冲突1；先取消，题库仍为原4题。重新选择并确认后，两道LeetCode题进入题库，冲突在待处理区、原草稿未覆盖。
- 真实界面打开两数之和II，负数输入 `2 -1 / -1 0`、期望 `1 2` 与7行程序恢复；本地Python实际自测通过。历史对照显示17行原程序和7行重写程序，刷新保留草稿/输入。随后只读核对自己的验收学习目录：18条源记录中17条payload逐字段相等；仅 `sum--python` 因既有本地内容不同而保留双方，输入备份中的冲突草稿完整留存；两份重写快照和10月2日复习日期一致。
- 原生实际截图 `dist/backup-preview-acceptance/{preview,restored-history}.jpg` 和结构化验收收据保留。此为真实插件备份到本地恢复，不能代替真实云账号到新浏览器、双账号或真实提供商验收。代码已提交，下一候选发布批次再统一版本/三端构建/部署；不会重写现有rc.6发行包或商店材料。

## rc.7/rc.8 — 真实备份幂等恢复、删除范围及统一部署，2026-10-01

- 补齐W5删除面板题名/关联数量，清理共享每日计划中已删除题目的completed/items引用，保留其他题目；同步追踪与删除事务一起提交。匹配的待恢复版本/恢复包也清理，其他题目的冲突保留。新增回归先因缺少预览方法失败；相关30/30通过，随后rc.7完整里程碑371/371通过，日志 `/tmp/acmcoder-rc7-data-milestone.log`。
- rc.7固定源码eb4dd37770e2f2bb6a0b0e81ed6627f1a430dc3c的三端、Pages、品牌及镜像构建成功。首次隔离目录打包未传源码归档导致Git目录缺失，随后只重做打包，用Mac Git archive显式传入，不重建已成功产物。Pages Git部署ba010a67-50d7-4ead-b564-60767b1bd4a2成功，源码包823,657字节/SHA256 f3051b17e5fd0d6dda7bce61ca6a75d3b8b81c4ac0017f6762ed9ed93001ea5f；ZIP33,768,389字节/SHA256 dca9aecd2175b0c2086e52f46252fef23add9ec691032bf9670173707547e671。该镜像只构建，未冒称运行验收。rc.6安装源码另复制保留，再从实际ZIP在同路径升级，测试ID不变；普通重新加载后工作区可打开。
- 真实插件预览原备份显示16条相同/2冲突，取消后导出18条，与升级前备份所有payload逐字段相等；确认数据未丢失。发现快照内部带有草稿状态字段，而备份/同步只存快照自身字段，恢复比较因此误报。新增真实start/finish重写→导出→预览/恢复回归，先复现2项冲突，再统一使用toSyncRecord的实际持久字段比较。修正后相关21/21、版本/文档7/7通过，不重复未受影响的完整371项，不把rc.7预览误报当成功。
- 修正进入独立rc.8，固定源码e38df559db3f1e16c19dd81bed2b00febf68ce75；Mac Git archive在 `/tmp/acmcoder-rc8-e38df55` 构建三端、Pages、品牌、候选包及Docker。Pages部署4f2af202-78e4-485b-b9b0-8601d1cfa0de实际success（02:33:57–02:34:03 UTC），固定网址 https://4f2af202.acmcoder-unified-preview.pages.dev/；主网址version/commit及匿名会话、受保护records401和隐私200通过。HTTP smoke最初使用不存在的auth/me路径而中止，改按源码的auth/session核对后通过，未将第一次中止视为完整成功。正式项目/D1不变。
- Mac `dist/releases/4.0.0-rc.8`：源码824,450字节/SHA256 9ffd5ae010a0fc735e9753cf207097f992a3408c73a6f76634f25b0f65fbf3f2；ZIP33,768,371字节/SHA256 23a3b7de340cc857e2d365ff6ea41b85c505af150a2ae9781c84ec0c1162f4bf。实际ZIP CRC、manifest4.0.0.8/version_name、version.json及源码pax commit通过；34份运行器/资源与rc.6逐字节相同，沿用此前真正离线和C++完整证据。rc.7/rc.6及最初快照未覆盖。
- rc.7测试安装源码另复制保留，再从实际rc.8 ZIP同ID升级，普通重新加载成功。原备份真实预览0新增/18相同/0冲突，实际确认合并仍为0/18/0。归档两数之和II后查看删除确认：1题、1草稿、2快照、3自测、1复习；截图后取消，再恢复归档题，没有执行永久删除。此为开发安装更新，不是商店自动升级证明。
- 同一自建CFT匿名浏览器打开公开站，实际文件选择器导入原插件备份，预览并确认新增16/相同2/零冲突。Python负数ACM输入实际输出1 2、自测通过；17行旧程序/7行重写对照及刷新恢复通过。随后原生下载的 `site-restored-backup.json` 为19条：原18条payload逐字段相等，另1条真实网站自测，待处理恢复0。输出14,173字节/SHA256 6e7521ff0cacdd7ee184afd85f0ea32a44bd88ade859103040007305e7a9179d；这不是云账号到新浏览器验收。
- rc.8本地镜像真实localImageId为sha256:58c03097b17c826ed012aa1de916682fe58e2ad4c3296b1c74270e05785041e1，linux/amd64、本地标识而非GHCR digest。停留存的自建rc.6容器，用相同4个测试卷启动rc.8容器acmcoder-rc8-smoke-e38df55（回环36440）；read-only/cap-drop/no-new-privileges等约束保留，凭据独立目录用正确单数变量。原image-smoke-problem程序/stdin 10 32先读取且一致，两个只读预览通过；未冒称本次重新跑三语言或用户稳定安装升级。稳定43117未重启。构建日志 `/tmp/acmcoder-rc8-docker-build.log`。
- 四张真实原生JPEG、实际输入/输出备份和结构化 `rc8-data-acceptance.json` 保留；发行manifest关联实际部署/镜像。品牌构建收据not-captured保留构建时含义，rc.6五张商店PNG作为历史材料留存，不冒充rc.8最终商店提交图片。真实AI/原创导题、第二真实账号、用户旧安装、许可证/正式分发仍待完成，原18任务范围不缩小。

## R1 — 可审阅的许可证选择与实际包许可清单，2026-10-01

- 当前远端分支核对为815f792e0b24e8c642835e08533111c06204620e，最初checkpoint标签仍在远端。原有五个用户文件修改、工具目录与未跟踪旧计划保留。本轮没有重建或覆写任何RC包、部署或用户数据。
- 当前内置浏览器公开站为匿名空间，实际点击连接入口进入GitHub登录页，尚无会话；已返回网站设置，rc.8/e38df55可见。自己的CFT测试浏览器也为匿名且尚未设置Key。真实云账号导出到新浏览器/导出期间编辑的验收继续保持待完成，不用匿名恢复或登录入口可达代替。
- 新增 `docs/releases/license-decision.md`，给出MIT建议、Apache专利及NOTICE差别、未定状态，以及版权署名所需输入。依据MIT文本、Apache官方第3/4节及Mozilla MPL FAQ核对，未创建根LICENSE。此为完整计划R1要求的具体选择材料，不是许可证已决定或完整法律义务已完成的证明。
- 对已保存rc.8实际插件ZIP核对CRC、version.json及15份许可/NOTICE，记录逐份体积/摘要和资源清单摘要于 `docs/releases/evidence/rc8-license-inventory.json`；ZIP SHA256仍为23a3b7de340cc857e2d365ff6ea41b85c505af150a2ae9781c84ec0c1162f4bf，未改动。核对上游C++ NOTICE原内容逐字节保留，源码补充实际内存/文件预算、头文件、worker和gzip调整说明；第三方总说明补充固定Pyodide源码获取入口及C++来源/修改脚本。同步完成，源码diff空白检查通过；只有文档/许可声明变动，不重复运行器测试或全量构建。
- 补充说明尚未进入历史rc.8网站/ZIP/镜像，下一发行构建统一带入。Docker系统软件包的源码获取义务仍需在公开镜像前按实际包确认，不能凭原版权文件存在宣称已完成。真实提供商、第二真实账号、稳定安装升级及正式分发等原18任务门槛保持。

## W5/R1 — 原生浏览器并发备份与完整发行门槛，2026-10-01

- 新增独立 `experiments/backup-consistency` 探针，只在自己的43118预览静态产物临时复制页面/模块；不加入客户端构建或公开站。Mac修改经Mutagen同步后WSL语法检查通过。使用当前共享模块，不改产品存储；两实例共用随机namespace，原生IDBFactory观察代理只记录四表只读事务打开/complete，另一实例在事务打开时立即请求真实startRewrite。
- Chrome for Testing151.0.7922.34实际原生UI打开探针，20/20轮通过（03:03:58.985–03:03:59.149 UTC）。每轮事件顺序为导出打开→重写请求→导出事务结束→重写完成，导出保留一致的原代码/stdin/expected；后续重写和关联旧快照实际存在。106条2020年旧自测、2020年计划、聊天和40份重写前后快照最终导出150条，恢复到另一随机空间后所有payload相等。没有读普通学习namespace、Key或云账号。
- 通过原生下载保存实际JSON及JPEG，JSON 5,771字节/SHA256 `1ef6d5158fa2490ff0a96d874a28259674456a235b91943eddc4b254eec8eeec`；截图实际格式JPEG并已视觉检查。结构化收据 `docs/releases/evidence/backup-concurrency-2026-10-01.json` 登记20轮事件及截图/源码摘要。BrowserStore SHA256 `a481013be36642c08f97a77646f5e44cbd608783bfb7c93b79564dca0aac0a0e` 与实际已保存rc.8 ZIP逐字节相同；本轮不是新产品版本、未重复构建/部署。
- 对照原W5完整要求，发现正式checker此前只有durable-history，未单列真实云账号到新浏览器与导出期间界面编辑。补入 `cloud-backup-roundtrip` / `backup-edit-during-export` 两门槛，均保持blocked并明确窄范围原生存储证据不替代完整集成。新回归证明已有其他passed/原生探针不能跳过这两项；WSL最小发行检查4/4通过。未选择根许可、不更新正式tag/GHCR/latest，旧候选清单保留构建时快照。

## R1 — 当前候选升级指引与外部验收准备，2026-10-01

- 当前Mac/远端HEAD均为c05a3d9070839d70074f985f89b3f905a310c84b，原checkpoint标签仍在远端，其他未提交工作不变。回查升级说明发现首段和Docker示例仍使用rc.3，已改为实际rc.8固定源码/产物/镜像，说明只从对应源码包构建，不把新分支强行标为旧commit。Mac对实际发行清单和文件重算摘要，插件ZIP、源码包、e38完整commit及本地image ID均与指引一致；diff空白检查通过。只有文档更新，不重跑客户端/运行器构建或全量测试。
- 补充备份预览/取消/确认再检查的步骤，以及WSL源码/静态产物应一批升级、仅重启不能证明版本一致的边界。用户稳定43117未重启，候选/旧镜像与数据卷未变；未给出会立即切换用户安装的命令。
- 当前IAB只检查账号连接链接可见性，结果仍为匿名；未读取密钥字段或Cookies。已一次性请求用户在界面完成账号登录、三端真实提供商配置及第二真实账号准备；不索取Key/密码/验证码。许可证选择问题仍等待用户决定。原18任务完整范围不变，未把匿名恢复、原生存储探针、受控AI或镜像演练改算成剩余真实验收通过。

## R1/A1 — MIT 落地与授权密码库取用，2026-10-01

- 用户明确授权代理选择许可证，采用 MIT，版权署名 2026 Pygmalion03。新增完整根 LICENSE，同步 package.json/锁文件根元数据、README 和第三方声明。第三方组件保留各自许可；历史 rc.8 产物未重建或覆盖，下次发行需带入这些文件并核对随包内容。
- 使用用户指定的本机 bw-codex 入口检查授权；授权有效。脚本内部只查指定文件夹的条目/字段元数据，随后通过 run 将 API Key 注入独立测试进程，进程非空检查通过，退出码 0；stdout/stderr 由入口抑制，未将密钥读入模型、源码、日志、命令参数或文件。这只证明可取用，不代表真实提供商调用或三端 AI 验收通过。
- 条目有两个同名 Base URL 字段且没有模型字段，当前入口无法唯一选择地址。已请求用户补充非秘密的 API 地址和模型名，或在密码库设置唯一字段；未猜测目的地址并发送凭据。网站实际 GitHub 登录页已打开并交接给用户操作，未输入或读取密码/验证码，尚未登记新的真实登录通过。
- Mac 修改完成后 Mutagen 同步，WSL 发行检查 4/4 通过；Git 空白检查及 MIT 文本/根元数据一致性检查通过。只修改许可与文档，不重复运行器回归或部署，不重启稳定服务；候选产物、最初回退点及学习数据保留。

## A1 — 首次真实提供商调用，2026-10-01

- 用户明确指定密码库条目的第一个 Base URL 为 OpenAI 格式，并指定模型 qwen3.7-flash-2026-07-15。脚本内部读取该地址，经 HTTPS、无 URL 凭据/查询/片段检查后，通过 bw-codex run 注入 API Key，调用产品共享 createChatTransport；未修改密码库，也未输出或保存地址、密钥及原始回复。
- 真实请求返回 HTTP 200，有非空文本，17 + 25 测试回答精确匹配 42；子进程退出码 0。仅保存时间、模型、传输实现、状态码及布尔判定的非秘密收据 ai-provider-chat-2026-10-01.json。这证明提供商与共享传输可用，尚不替代网站/实装插件/本地三端界面或真实 AI 原创导题验收；对应完整门槛保持未完成。
- 用户反馈 GitHub Sign in 页面不能刷新；实际重新加载后表单及按钮恢复，再从网站 auth/github/start 发起新的 OAuth 请求。已交接第二真实账号登录，未读入或输入账号凭据。网站学习数据、稳定安装、候选产物均未修改。

## W5/S4/A1 — 真实云备份、双账号与工作空间AI修正，2026-10-01

- 实际第二账号galatea0315导入真实AI原创题，Python 7行初稿与3行重写自测通过，历史对照、明天再练及今日完成保存；网站已同步到云端。导出10条学习记录，经原生文件选择器恢复到新的Chrome for Testing无痕浏览器空间，预览8新增/2相同/0冲突；刷新后代码、输入、期望及历史保留，再导出10条payload全部相等。证据cloud-account-backup-2026-10-01.json。此为目标浏览器本地恢复，不称另一目标账号云同步。
- 普通Chrome实际Pygmalion03与IAB实际galatea0315同时登录。第一账号导入同ID不同题面并同步，保留原13条payload加1条新记录；第二账号刷新后导出原10条payload全未变，两账号同ID各自题面保持。证据two-real-accounts-2026-10-01.json。不读Cookies，不永久删除记录，不触及密码库登录窗口。
- 用户授权密码库在执行脚本内部注入Key。产品共享transport/resolveProblemRequest实际生成原创题，全部三组样例独立核验；真实文件导入/练习已通过，证据ai-original-candidate-2026-10-01.json。网站自然语言找题界面配置真实提供商仍待验收。
- 发现提供商实际地址为阿里云北京独立工作空间，旧网站白名单拒绝。依据官方Base URL说明补齐受限主机模式，未扩大到任意网址；生产API入口新增允许/六类拒绝回归。相关26项初次25通过，新增回归因请求冷却使用同fixture误报429，改独立fixture后单项通过。实际产品relayAI经真实提供商返回200、42匹配，证据ai-workspace-relay-2026-10-01.json；不替代部署或三端UI验收。
- 候选递增rc.9；根MIT及第三方通知将进入新产物。8/12正式验收门槛通过，剩余4项保持未完成，原18任务范围不缩小。稳定43117未重启，旧候选/备份保留，其他用户未提交修改不纳入发行源码。

## rc.9 — 固定源码三端构建与实际发布，2026-10-01

- Mac提交374960477b71effb869732fcfd130ab28bd25cde，归档到WSL隔离目录/tmp/acmcoder-rc9-3749604；未纳入其他用户未提交文件。运行374/374全部通过，三端、Pages及候选包一致性通过；日志保留于dist/releases/4.0.0-rc.9。早先工作副本373/374失败仅为插件版本仍rc.8，修正manifest后最小4/4通过，再在固定源码完成上述全量里程碑。
- 原Git连接自动部署a605b5f7-2515-4c6c-b6ab-72033e85146c，实际success；固定网址https://a605b5f7.acmcoder-unified-preview.pages.dev/及主网址匿名API/受保护401/隐私CSP/C++桥接和五份资源摘要检查通过。IAB真实galatea0315刷新显示rc.9/3749604/已同步，原星空求和代码/stdin/expected保持。未冒称本轮重新运行所有语言或真实AI网站UI。
- Mac候选包源码847,137字节/SHA256 b08ff874af01ea2119bc4b7314c767d8532d6f475c45954f99b5f91008f443f6；插件ZIP33,769,932字节/SHA256 4d9d0460bcba93eb6d24cd1ff15ead7ffe9a6a3a2f516d785378c2f62ae71b9b。实际ZIP CRC、manifest版本、源码pax commit和完整MIT随包通过。运行资源比较初次因C++ NOTICE新增说明而中止；排除许可文本后实际20份运行器/资源逐字节一致，NOTICE完整保留并补充。旧rc.8产物未重写，旧测试安装复制e9a318f-rc8-preserved后从新ZIP更新同路径；实际管理页rc.9/ID不变，题库三题、原负数草稿与17行/7行历史对照可见。不称商店自动更新或本轮再次导出18条等值。
- Docker镜像acmcoder-app:unified-rc9-3749604，本地ID sha256:033a8465260631c11c09aac90f2cb6d8be71c21e6cd598d342ba8d9eecb75d48，amd64。仅停止保留会话自建rc.8测试容器，rc.9沿用原四测试卷与安全限制回环36440；先读取原Python代码及10 32输入准确，再核对版本/commit、MIT/隐私200。未写回数据制造持久化证据；稳定43117未重启。实际关联更新本地发行manifest和rc9-release-acceptance.json，registryDigest为空，未更新latest/稳定tag/商店。
- 发布文档同步后最小命名/发行检查8/8通过；不重复固定源码已通过的374项或构建。该批仅更新实际交付记录，不替换3749604产物。

## A1/R1 — 真实本地AI生命周期与用户旧安装升级准备，2026-10-01

- 本机bw-codex授权仍有效。仅通过其venv执行凭据脚本，内部注入Key并经SSH stdin交给隔离测试进程，不通过参数、日志、文件或模型展示秘密。最初使用系统python缺少密码库依赖而中止，改用入口venv后执行完成退出0。
- 固定rc.9 Docker36440真实/api/unified-ai/chat与共享createAIClient，真实qwen3.7-flash-2026-07-15问答返回42；请求发出后取消、同requestId重试、真实无效模型报错/恢复均通过。重试两组各保留一个用户问题，草稿代码/stdin/expected与调用前完全相等，实际学习备份不含Key。仅新增会话自建测试卷中的验收题/对话，不改用户43117学习记录。收据ai-local-http-client-2026-10-01.json；不是浏览器UI取消、插件权限或三端全部通过。
- 实际用户43117服务尚未重启，sudo -n要求密码；旧进程unified/session为404而静态包为rc.6，未冒称已有真实升级。只读导出原memory/problems及progress：memory0页、问题5条、progress2条。WSL独立备份/home/pygmalion/backups/acmcoder/before-stable-upgrade-20261001T145002与Mac长期Backups目录均保留，所有文件尺寸/SHA256一致；settings/Key与认证令牌没有进入学习备份。
- 固定3749604本地静态文件复制到dist/local-web-rc9-prepared，未切换旧静态或重启服务。Mac编写activation脚本再传到WSL，bash -n通过：先校验version/commit，再sudo -v；取得授权后保留旧静态目录、切换预备目录并restart/is-active。已交接用户在自己的Terminal运行，用户密码不进入Agent。
- 网站设置只预填用户已指定的非秘密地址/模型，未读取密钥框；当前状态尚未设置密钥，已交接手动填写并保存，保持不刷新。自动脚本能取用密码库并不等于浏览器有直接凭据注入接口；不建立临时无认证密钥服务绕过这一限制。截图dist/releases/4.0.0-rc.9/ai-configuration-handoff.jpg。上述真实AI与升级完整门槛继续未完成，未递增版本、重建候选或发布稳定渠道。

## rc.10 — 三端真实AI、旧安装升级与导出并发验收，2026-10-02

- 实际Cloudflare无密钥探针确认运行环境拒绝redirect:error；同目标不带该选项返回401，证明提供商可达。共享transport改为manual并拒绝HTTP/浏览器opaque重定向，临时探针已删除。固定源码e587c0874665d74db5a637b57e433ac1fc148cf2，375/375全量通过，三端/Pages/候选包构建与一致性检查通过。此前77d6129构建在测试阶段因旧断言失败中止；修正后仅使用e587最终产物，不把失败尝试算成功。
- 实际网站部署8b62cdff-2997-4b54-9b4e-455692cee573，固定网址https://8b62cdff.acmcoder-unified-preview.pages.dev/，主网址版本10/e587已核对。源码包852136字节/SHA256 1fc8f3923db5169a7849c927921704d182c6ff75f710fe23c592b5aefe2dd3b1；插件ZIP33769999字节/SHA256 bb958964781a128cf36808af5a2ede6fdf73756e1ac10705721845b42eff8381。源码pax commit、MIT、ZIP CRC及数字版本4.0.0.10通过。插件12份非许可运行资源与rc.9逐字节一致，旧产物均保留。
- Docker候选acmcoder-app:unified-rc10-e587c08，本地ID sha256:273281dc37328360241ce0cc90163d1a465f5dde62bab672b2057971193292ab，仅沿用自建隔离四数据卷和回环36440。原Python代码与10 32输入准确保留，版本/commit、MIT和隐私200核对通过；旧测试容器停止保留，registryDigest为空。CFT同ID插件更新为rc.10，旧安装目录另存，原草稿和17行/7行重写历史保留。
- 用户现有43117服务经用户授权重启并验收rc.9/3749604；原5题导出、2条统计及原始文件逐项一致，迁移标记重复读取不变。实际题库显示旧次数2和1，Python自测8通过，10条学习备份恢复到隔离文件存储payload/引用全部相等。升级前后Mac与WSL独立备份及旧静态目录保留。证据stable-upgrade-verification-2026-10-01.json；这不宣称该服务已激活rc.10。
- 用户分别配置Key后，网站Cloudflare转发、CFT实装插件直连及现有本地服务界面各完成真实Qwen问答42、取消、随后问答42、真实无效模型404及恢复正确模型连接。三端原代码/输入保持，取消的用户问题保留且没有伪造回答。收据ai-website-ui-2026-10-01.json、ai-extension-ui-2026-10-02.json及ai-local-ui-2026-10-02.json。网站Key所在页面未刷新，其已加载rc.9 UI与rc.10部署后台分别登记。插件实际20条学习导出经密码库内部注入比对不含Key，私有备份已保留；早先本地HTTP学习导出Key排除证据继续使用。
- 网站真实自然语言生成“极光计数”原创题，预览完整题面/输入输出及三组样例，点击导入进入练习；浏览器Python执行1->1、4->2、7->4全部通过。证据ai-original-finder-ui-2026-10-01.json；不把模型样例通过称作LeetCode隐藏测试AC。
- 真实galatea0315账号界面导出期间，在第二标签页约0.315秒后完成编辑。为稳定观察，临时延迟IndexedDB事务完成通知10秒，保留实际存储事务及下载链路；17条导出payload/引用均与编辑前完整快照相等，另一标签页刷新确认后续编辑已保存。实际备份不含Key，临时通知钩子移除、测试注释恢复。证据backup-ui-concurrency-2026-10-02.json明确记录仪器范围，未将之前窄范围存储探针冒充产品UI验收。
- 正式功能验收表12/12通过，实际版本/部署/本地image及产物摘要记于rc10-release-acceptance.json和本地发行manifest。原18任务的GitHub Release/GHCR分发、最终需求审计及对应版本商店材料仍需完成；未更新稳定tag/latest或提交商店。最初回退点、旧候选及私有学习备份全部保留。
- 文档同步后WSL最小命名/发行检查8/8通过，Git diff空白检查通过；本批仅保存验收与发布指引，不重复未受影响的375项全量或构建。文档提交使用[CF-Pages-Skip]，保持e587产物及当前部署关联；临时备份标签已关闭，网站/本地Key会话保留。

## rc.11 — 已确认的新排版同步到三端，2026-10-02

- 用户确认786像素排版预览。共享界面收紧页头/面板间距、代码区默认高度和输入输出留白；运行/停止按钮不再折行，AI用原生details展开/收起，问答挂载及设置逻辑继续复用。预览Python输出8通过，AI展开后输入可访问；786像素页面宽与视口均为786，没有横向溢出。预览使用独立/tmp工作目录及数据目录，旧网站/本地Key标签不刷新。
- 固定源码e24b73abba912ce26314929e4a9f3ef87ba0c6f3，归档到WSL/tmp/acmcoder-rc11-e24b73a，不带其他未提交文件。375/375全量、三端/Pages构建、候选checker/package全部通过。版本4.0.0-rc.11/数字4.0.0.11；源码包857402字节/SHA256 c5e65a62ea02852e9a4407635e6de87e598e31d86d025714147b681ada228966，插件33770702字节/SHA256 741bf49d6f6e057a53cda96e63511bbcaa6a94d83d0e290eff9e31799494b118。实际摘要/ZIP CRC/MIT/数字版本核对通过，旧rc.10包不覆盖。
- Cloudflare Git部署966ef595-f9c5-415c-af2e-ef4318800d17实际success，固定网址https://966ef595.acmcoder-unified-preview.pages.dev/。主网址version.json为11/e24；实际website及43117返回的共享JS/CSS逐字节等于本批源码。新IAB网站标签原极光计数代码和7/4输入保持，实际Python输出4、样例通过。截图dist/releases/4.0.0-rc.11/website-layout.jpg；原Key会话保留，没有强制刷新用户编辑页。
- 43117旧静态界面另存dist/local-web-before-rc11-20261002T0110，再切换完整rc.11静态目录。没有服务端变动，没有sudo重启；后端仍为已验收的rc.9。实际新本地标签显示11/e24，原两整数代码/3 5/期望8保持，自测8通过。旧本地Key页保留，新验收标签关闭，截图local-layout.jpg。
- 测试插件安装目录另存e9a318f-rc10-preserved，再从实际rc.11 ZIP更新同一路径并重载。管理页显示rc.11/原ID jmdplnhlhdhcaaefllfndokbcmhbpmdb；重载关闭旧扩展页面后，在同一测试profile打开扩展自身workspace.html，初始化完成。原7行代码及2 -1/-1 0输入保持，真实离线包Python输出1 2通过；历史对照保留17行原代码和7行重写。截图extension-history.jpg。新标签最初原生键入漏掉冒号落入搜索，改用完整粘贴地址后进入真实chrome-extension页面，不把网站或搜索页当作插件验收。
- Docker镜像acmcoder-app:unified-rc11-e24b73a，本地ID sha256:0d315711d933cc8b7235c8377f1698f72cd47c9ebb14b371170ff4a63d713905。只停止保留会话自建rc.10容器，rc.11沿用原四测试卷与回环36440安全限制；只读原草稿代码/10 32准确保留，版本/commit、MIT与隐私200通过。未先写回数据制造证据，未发布GHCR/latest。
- 实际版本/产物/部署/image/回退位置登记rc11-layout-acceptance.json与本地发行manifest。原12项验收证据保留，本轮不重复未受排版影响的真实AI和语言实验；完整18任务的公开分发、最终需求审计及最终版本商店材料仍待完成。
- 文档同步后最小命名/发行8/8通过，Git diff空白检查通过。收据/指引作为[CF-Pages-Skip]文档提交，不改变e24固定产物；网站新排版标签保留供用户查看，本地验收及旧布局预览标签关闭，原网站/本地Key会话保留。

## rc.12 — 设置/题库排版与长会话分页，2026-10-02

- 根据用户两张实际Chrome截图修正设置API挂载位置：放回.settings，与其他设置同宽，地址/模型和密钥/口令两列；侧栏单列。题库独立finder-panel，与标题、筛选、列表同宽，输入/查找按钮并排，收紧留白。原rc.11只折叠AI，没有限制历史渲染；本次明确修正。
- AI历史固定高度内部滚动，每次显示最多20条，默认最近20条；更早、更新、返回最新可访问所有记录。输入区保持在历史滚动区外，显示操作不写回会话。独立43118测试服务保存203条合成消息，实际Chrome翻到1–3条，再向新页及回到184–203条；DOM最多20条，高度186/内容4301，输入草稿翻页和刷新后保留。操作后服务保存及导出均203条；没有将合成消息写入用户43117或云端空间。
- 固定源码f3c70783ffaeac9e5b4c906691afa3425ec44ff4，375/375全量、三端/Pages构建、候选包检查通过。源码860783字节/SHA256 ba8797729116e58ec9a03fde4e06181761da81a23786fbc821e888a784ce3e94；插件33771687字节/SHA256 89bec6e5a53203431ba7d3962dcc8f4278c95d1bf1b1f8ad7bb3842ce02503b1。摘要、ZIP CRC及数字版本4.0.0.12已核对。
- Git部署1c5fb1e3-a4d9-4e0a-8e8a-e07b57ab7403实际success；Chrome新标签显示rc.12/f3c7078。设置与API宽度均850，题库finder/列表均1074且左边对齐，无横向溢出；截图website-settings.jpg及website-library.jpg。400像素独立预览的题库、设置、练习均无横向溢出，API单列、finder/list均352，恢复视口后关闭尺寸验收页。
- 本地旧rc.11静态目录保存在dist/local-web-before-rc12-f3c7078，更新完整rc.12静态目录，实际43117显示12/f3c7078及三语言。没有服务端修改，未重启既有rc.9后端。插件旧目录另存e9a318f-rc11-preserved，从实际ZIP更新原路径重载；管理页确认12/同ID。真实扩展页面原7行代码、2 -1/-1 0输入保留，AI旧5条问答仍可见，新滚动和分页按钮显示；没有额外真实AI请求。
- Docker本地候选acmcoder-app:unified-rc12-f3c7078，image ID sha256:0cec5f5e2e079bbf0f64e19c85d6acf92cff393a4e97fcf39fb2527728419ccd。只停止保留自建rc.11容器，rc.12沿用四个原测试卷及36440回环限制。初次读取在容器尚未监听时socket关闭，确认running后只读检查通过：原10 32草稿、commit、MIT和隐私200保持；没有写入草稿制造保留证据。未发布GHCR/latest。
- 本批收据rc12-layout-chat-acceptance.json与本地发行manifest保存产物/部署/镜像/回退点，旧rc.11及之前学习备份保留。12项既有功能验收继续有效，本次不声称重复真实AI/语言执行实验；原18任务的公开分发和最终发布审计仍未完成。

## rc13 — 原18节点核对、公开分发与新用户安装，2026-10-02

- 固定e844d9e从Mac Git归档到WSL隔离目录，384/384、三端/Pages/品牌构建及候选一致性通过。新增9项直接调用实际workspace UI处理器及IndexedDB验证午夜/DST/跨年、时区切换、归档恢复/完成不建快照；DOM壳首轮缺createElement和清理顺序失败，修正后通过，未改产品日期逻辑。
- 原18节点逐项核对表落盘；同步删除门槛改回pending，真实临时插件会话不冒充GitHubOAuth，未以12项绿检查宣布全计划完成。私有before-public-distribution-20261002保存4de75cc Git bundle/源码/原未提交补丁；无关修改不纳入本批。
- GitHub公开v4.0.0-rc.13候选Release，源码/插件ZIP/SHA256SUMS/release-manifest真实上传，tag精确e844d9e。workflow 36907086039成功，app/runner均amd64+arm64；两镜像空DOCKER_CONFIG匿名拉取，OCI版本/commit与流水线digest匹配，latest与3.0.4清单逐字节相等。全量gh run download先遇非ZIP dockerbuild附件提取错误，改精确image-*仅取所需JSON成功，没有重跑流水线。
- 新用户无凭据公开下载源码/ZIP，SHA256/ZIP CRC/MIT/源pax commit通过；插件85份非版本文件与rc12相等，仅manifest/version.json变，权限/运行资源/代码不变。源码在全新依赖目录npm ci与三客户端构建，实际三语言42通过，WSL工具链已预装的范围明确。
- 全空公开app Compose首次启动、API草稿/备份及三语言通过；另外公开3.0.4新建隔离目录，真实旧memory导入→保留升级前副本→rc13迁移→109条V3/104快照/未完成中文重写/2020计划→重启→备份恢复payload/引用相等→升级前副本回退3.0.4旧题导出相等→回到rc13原109条相等。回退不删除升级后的记录。初次helper仅接受200，旧memory创建实际201，修正验收helper及导出动态时间比较后通过，未改产品。公开runner实际产品Docker适配器三语言42通过，未执行arm64。所有测试使用新目录/36441或36443，用户43117不变。
- 实际IAB网站rc13/galatea0315，1440×900和1280×800无横溢，finder/rows同1188；自建中文题Python输出中文42样例通过，Tab插入四空格不运行，刷新代码/input准确，结束重写两份历史对照，明暗主题可读，减弱动态模拟匹配/按钮transition0s并恢复。测试题归档保留历史；视口/媒体模拟复原，测试标签关闭，没有额外真实AI消耗。OS输入法composition未单独测试。
- Mac原生Chrome for Testing提示锁屏，停止原生操作；不把IAB当插件实装。S1实装真实GitHub授权/撤销、S2真实离线删除重连、新用户插件安装/回退、当前版本五张插件截图仍待完成。商店文案/权限/隐私/审核流程改为当前事实，MIT/三端AI已完成，历史rc6图片仍明确历史，未改标签冒充最终。Chrome/Edge官方图片及提交要求复查，未接受条款/登记/代付/提交审核。
- 证据见rc13-public-distribution-2026-10-02.json；关联清单已上传Release，旧rc12、私有学习备份及所有原测试卷保留。公开候选完成不等于完整目标或稳定4.0.0完成。


## rc14 — ZIP新目录账号连接修正与候选准备，2026-10-02

- 本轮重新确认Mac锁屏；不要求睡眠中的用户解锁，不把CLI/Chrome API夹具当作实装。公开rc13 manifest没有固定key，未登记ID的真实公网PKCE start返回403/unregistered_extension；发现新用户账号连接缺口，S1与插件新安装保持待验。
- 仅明确的未登记ID拒绝改走既有设备确认，登记ID继续PKCE；不放宽回调、不新增manifest权限、不修改学习存储。pending放可信session，短消息轮询跨后台重启接续；关闭未确认页面/过期清理，批准后关闭页面仍可兑换。退出与兑换并发时不恢复连接并撤销刚签发授权。9个新增回归使用实际设备授权实现及SQLite夹具，不冒称真实GitHub批准。
- 初次测试夹具使用mock.property创建不存在的chrome属性、头像空值预期不一致，分别修正夹具；首轮整套检查还发现README版本指引未同步，补源码待验版本与公开版本区别。固定源码33cd7c543a2298d498a5ccae785ff3c883ddd8dd从Mac归档到WSL隔离目录，393/393、三端/Pages/品牌构建及候选包一致性通过，不纳入用户原有无关未提交文件。
- 候选源码878670字节/SHA256 51499e03f5c91094bcce1ba0c4308b944bd434332645f9321c618de9fef659ad；ZIP33772436字节/SHA256 91c12e2c908db5044c224f8420bb2596efca86c761c80e41a4a8c78d3f459b93。ZIP CRC通过，与rc13文件集合相等，只有auth.js/manifest.json/version.json变化，权限/CSP/运行资源保持。产物复制回Mac dist/releases/4.0.0-rc.14，旧包和安装目录保留。
- 代码推送独立GitHub分支codex/zip-device-connect，远端SHA匹配33cd7c5；没有推送生产分支、创建rc14 tag/Release或发布新镜像。实际主网站仍rc13/e844d9e。GitHub现有rc13发行说明已补新目录账号连接限制，公开二进制未覆盖。
- 固定auth.js实际调用公网API，Chrome API仅为进程夹具：PKCE403→device start200→未批准token428，STATUS无用户；退出清pending并保留自建learningFixture，没有网站会话或真实批准。初次helper错误把设备详情当作匿名可读，实际要求登录401；修正helper后完整路径通过，产品源码未改。设备秘密仅留进程内，不输出、不进收据。收据明确nativeInstall/githubApproval为false。
- 当前源码品牌PNG已生成，尺寸/CRC/摘要通过，与rc13品牌像素逐字节相同；商店文案/权限/隐私/审核流程和品牌组成审核准备ZIP，152511字节/SHA256 478a74ad8c8cc004f73b8438b1c36c30a96ec607415a004ac3049886e739d41f。包内清单明确当前原生截图0、submissionReady=false，不以旧rc6画面冒充当前版本，不提交商店。
- [完整收据](evidence/rc14-zip-device-preparation-2026-10-02.json)。待用户醒来解锁后继续实际插件新安装/真实GitHub授权及撤销/更新重启与回退、真实离线删除重连和五张当前截图；Goal不标完成。Chrome身份固定与MV3生命周期依据分别为[manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)及[后台生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)，未使用长期保持后台存活的额外权限。


## rc14 — 同源码公开分发与安装/升级/回退，2026-10-02

- 本轮再次确认Mac锁屏；此前rc13和rc14准备阶段均有同一原生阻塞。没有因为锁屏停止可独立进行的分发：保留33cd7c5准备包至dist/releases/4.0.0-rc.14-pre-public-33cd7c5，修正本版Compose镜像锁定14与下载指引，固定源码5adac6ab53d55087993004f443a06d5b60d19c8e。授权/共享业务代码与已通过393项的33cd7c5相同，本地21项相关检查通过；GitHub同5ad源码Node22全393/393、三端构建、app烟测通过。
- 推送生产源码分支与新候选tag；Cloudflare部署591372c0-3346-47cf-8ca6-c18f6918ea82 success，主网站实际14/5ad。固定部署HTTP烟测通过匿名会话、保护记录401、隐私CSP及五份C++压缩资源摘要，不冒称新增C++执行或插件实装。
- GitHub候选Release14最初草稿上传，镜像流水线36914402731全部成功后公开。源码881406字节/SHA256 dc33e289fc25933c1731c71f488eb52ce2ec2c3f53ee42e76ab397945ba43ca3；ZIP33772438字节/SHA256 ec2ba9a6160c5ef9c727f14767872feeb90ce649167f96c60a08abab2dd72e42。WSL无凭据curl实际公开下载源码/ZIP/SHA，摘要、pax、ZIP CRC和4.0.0.14 metadata匹配。tag与三端源码同5ad，未覆盖旧13包。
- GHCR app/runner双架构index分别46739bac1f1e89bef21352e8d40792eb5ac241b25ab7620d0534ee70bd826ca9、35159220f84ee85973d1f138ba0271c4650ef8ecddc7b44155f5971d8f7f92c0，空DOCKER_CONFIG真实pull通过。registry原始JSON摘要/两架构与流水线匹配，OCI版本/revision匹配。latest与3.0.4原始清单cmp通过；GitHub稳定latest仍3.0.4。
- 全空公开源码目录直接Compose拉取候选14，默认目录种子/统一界面/持久草稿API/备份/三语言实际运行通过。另复制上一轮自建测试109条数据到新隔离目录，公开13→14→重启→升级前副本回退13→14，每段实际只读导出均109条/104份历史及同一SHA，未完成中文重写保留；每段备份恢复payload/引用相等，14升级后实际三语言42通过。产品Docker适配器在公开runner14三语言42、network none/memory256MiB/pids128通过。实际执行为amd64，不宣称arm64执行。
- 测试项目acmcoder-public-fresh-rc14/ acmcoder-upgrade-rc14及36445/36444回环端口均隔离；测试完成容器停止、数据与升级前/升级后两目录保留。用户43117服务没有重启，学习数据及原有无关源码修改未动。最终关联release-manifest上传替换候选分发状态，仍明确真实插件/删除重连/当前截图pending。
- [收据](evidence/rc14-public-distribution-2026-10-02.json)记录最终源、镜像、安装阶段与范围。商店品牌/文案审核准备ZIP本地保留，当前原生截图仍0、submissionReady=false，不发布商店或把旧图改标签。剩余工作依赖原生Mac解锁与真实用户交互，完整Goal不能标完成。


## 剩余原生验收阻塞审计，2026-10-02

公开分发/独立Docker安装工作完成后，再次调用原生Chrome for Testing，Mac仍锁屏且工具无法解锁。该条件在rc13分发、rc14准备、rc14分发三个连续Goal阶段已确认；后台构建、下载和本轮测试进程均已终止成功，不把锁屏当作活跃进程等待。本轮是完成实际分发和安装后的原生验收僵局，不因为任务复杂或测试耗时阻塞，也不把Goal改为较小范围。后续需要用户醒来解锁Mac并恢复Goal；真实授权或不可逆测试删除如出现确认要求，在具体动作前交接。项目仍未整体完成。

当前商店审核准备包已更新为本版运行源码5adac6a与文档9fc4f39，153741字节/SHA256 8a6c3fe91c97ba14c7cc26332c84a2bc8fc4ebf4a7b906dd4c1b14b69c05deb7；先前37c6860草稿另存保留。清单仍为当前截图0、submissionReady=false，未上架或提交审核，不以重新打包代替真实截图。


## rc14 原生验收恢复（2026-10-02）

Mac锁屏已解除。公开rc14 ZIP在新目录真实加载成功，独立插件ID `ojpmfieipijpbbbhedhfjjgdjdembnmd`，扩展管理页显示rc14，设置显示5adac6a。新ID连接进入实际网站设备确认及GitHub登录页；测试浏览器缺登录会话，已交给用户登录，批准/同步/撤销仍待验。旧同ID插件原生导出21条记录，rc12安装文件与私人备份已保留；已准备rc14文件，但尚未重新加载，不宣称升级完成。见 [原生验收收据](evidence/rc14-native-extension-2026-10-02.json)。


## rc14 旧插件升级与回退实测（2026-10-02）

Chrome for Testing 同ID `jmdplnhlhdhcaaefllfndokbcmhbpmdb` 实际重新加载rc14/5adac6a → 保留目录回退rc12/f3c7078 → 再次激活rc14。每次设置确认实际版本、原生导出并与升级前完整比较：21条record数组及pendingRestores完全一致；7行当前代码、原stdin/期望输出、17行历史对照和5条真实AI消息仍可见。未卸载扩展、未清除学习数据。开发模式重载不等同商店自动升级；完整浏览器重启仍待账号验收结束后验证。新ZIP设备确认页已核对到真实GitHub账号Pygmalion03，浏览器操作规则要求新增设备访问在当场确认，当前保持待批准；未读取或注入Cookie/令牌。


## 2026-10-02 — rc14真实账号、离线删除重连、撤销与浏览器重启收口

源码仍固定5adac6a，公开源码/插件ZIP/网站/镜像不重打包、不覆盖；本轮仅补真实验收文档与图片。Mac解锁后，公开ZIP新目录安装的新ID通过既有真实GitHub网站会话明确设备批准，实际插件Python `17 25 -> 42`。插件新题/代码/输入到独立无痕网站，网站修改又到插件，真实双向同步通过；没有Cookie/token或学习存储注入。

原生DevTools Network Offline仅断开网站标签页，实际sync/pull返回ERR_INTERNET_DISCONNECTED；插件仍在线。网站离线代码/stdin20 22实际保存并导出，插件仍见上一在线版本。按人类行动时确认，插件仅彻底删除新建验收题/草稿/自测各1条。级联删除后显示两个空draft/run墓碑冲突，实际点击保留云端完成，14条既有账号记录完全未变。网站恢复No throttling后实际冲突保留离线内容且云端已彻底删除；导出冲突，再实际另存新题。两端17条记录的payload、ID、引用一致，新题保留离线代码/stdin20 22及重映射自测历史；新拷贝的本地/服务器revision和updatedAt有差异，原14条含元数据精确相等。原ID未复活，新副本保留为验收记录。

网站撤销唯一新建的ZIP安装设备，插件再次同步显示连接已暂停；撤销前后17条记录与pendingRestores逐值相等。通过Chrome应用Quit菜单退出并恢复正常窗口，原生页面明确显示重启恢复提示，无痕窗口没有恢复；新插件回到匿名会话。原插件实际rc14/5adac6a的完整导出仍21条，所有payload/引用/ID/revision与升级前相同，只有当前草稿updatedAt在页面恢复焦点时更新。旧rc12文件、升级/回退/重启备份和真实账号冲突备份留存，私有学习数据不公开。

当前原插件实际捕获LeetCode侧栏、题库、今日、历史对照和设置五张原生图片，Python侧栏实际返回1 2/样例通过。公开展示只用匿名空间、公开题面与自写演示代码。2820×1988原JPEG整窗等比到1280×800，中性侧边距保持比例，无裁切或替换；固定resvg2.6.2、尺寸、SHA256、PNG CRC及五图视觉检查通过。商店文案/权限/隐私/审核步骤与当前材料核对完成，可安装未上架。

原18节点逐项核对及12门槛完成。已记录的边界：级联墓碑仍可能需要手动清空冲突；浏览器Java按退路不交付；arm64仅发布清单未实机执行；用户43117旧服务未在本轮更新；稳定latest仍3.0.4，商店身份/条款/费用/审核不在本轮交付范围。没有新增代码修改，复用固定源码393/393及已通过的真实AI/C++/两账号/备份证据，不重复部署或全量测试。

收据：`evidence/rc14-native-extension-2026-10-02.json`；当前截图来源/摘要：`dist/releases/4.0.0-rc.14/store-screenshots/screenshot-manifest.json`。私有备份路径仅记录摘要，不将实际代码、凭据或账号数据上传。


## 2026-10-02 — 最终审核材料与验收补充公开下载通过

验收文档提交160dd1c已推送到codex/unified-product。rc14 Release发布三个新增附件：`acmcoder-store-review-v4.0.0-rc.14-final.zip`（3869534字节，SHA256 `8fbafdc44bffb720d17bf6e0843dd610607a38819ce914b398ce33221b14dd35`）、`RC14-ACCEPTANCE.json`、`STORE-REVIEW-SHA256SUMS`。补充包33个明确选定文件，包含五张当前1280×800截图及原图/转换/清单、品牌图、MIT/第三方声明、文案/权限/隐私/审核步骤、版本和脱敏验收收据；不包含私人学习备份或授权数据。

三个附件全部通过无凭据curl下载，字节、SHA256和GitHub资产digest相等；下载后的ZIP CRC与五图数量通过，12项门槛均passed，原18节点范围记录一致。公开源码tar.gz、安装ZIP及旧release-manifest.json的资产digest不变；后者保留为当时分发收据，最终补充清单明确更新其历史待验状态。Release文案更新为实装与分发验收完成，prerelease身份不变，不移动稳定latest。旧截图/准备包/版本和数据备份继续留存。

完整目标三项（18节点证据核对、公开分发、新用户安装与商店材料）已按约定范围完成。商店上架、稳定频道提升及arm64实机执行没有纳入完成声明。没有新增产品代码或重复全量测试，复用固定5adac6a的393/393及已验证构建。


## v4.0.0正式版准备 · 2026-10-02

用户授权将已验收的统一版本提升为正式版、保留rc.14回退并升级常驻服务。升级前保留Git bundle及预存未提交补丁；本机local-guest完整导出13条记录，Mac和WSL保留独立数据副本，旧静态目录保留。学习备份不作为公开发行资产。

修复已观察到的级联删除空冲突：在上传确认与旧持久化冲突出队时，仅双方删除才自动采用云端墓碑；离线编辑与云端删除的内容冲突继续保留。新增完整题目/草稿/历史/对话/复习级联删除，以及文件存储重启后旧空冲突清理的回归检查。相关同步、文件存储、旧迁移、备份、删除生命周期36项通过，发行版本检查4项通过。题库按钮禁止文字压缩换行，窄侧栏允许按钮组换行；设置复选框保持固有宽度。

发行源改为4.0.0，插件数字版本4.0.0.65535；固定版本Compose覆盖锁定v4.0.0。新增已关联正式发行的手动镜像latest提升路径，两镜像摘要核对后再提升，不重建镜像；保留前一latest摘要。正式版公网/CI/用户进程激活结果在最终收据追加，不以这些准备动作代替实测。
