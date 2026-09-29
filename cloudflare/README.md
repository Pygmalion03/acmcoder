# ACMCoder 免费网站版

Cloudflare Pages Git 集成配置：仓库根目录 `cloudflare`，构建命令留空，输出目录 `public`。独立项目名 `acmcoder-web`。不要将该项目接到个人版 `api.pygmalion.top` 或其运行器。

`/api/*` 由 Pages Functions 提供。部署需将 `DB` 绑定到 D1 `acmcoder-web`，先执行 `migrations/0001_initial.sql`。`wrangler.jsonc` 是 Pages 部署配置来源，包含真实 D1 ID 与 `PUBLIC_ORIGIN`、`GITHUB_CLIENT_ID`、`INVITED_GITHUB_IDS` 三个公开变量；`GITHUB_CLIENT_SECRET` 只存于 Pages 加密变量，绝不写入仓库。邀请名单缺失时默认拒绝登录。OAuth 回调固定为 `${PUBLIC_ORIGIN}/api/auth/github/callback`。Java/C++ 远程执行仍关闭，未接 NAS runner。

账号登录后，题库、草稿、进度、今日计划和自测历史按用户 ID 隔离。草稿每 1.2 秒延迟同步，页面关闭前先留本地副本，远端按版本号发现冲突并要求用户选择。访客草稿只在用户明确点击迁移当前题目后进入账号。所有题面按纯文本显示；链接抓取只允许 GitHub 公共仓库原始 Markdown/TXT 且限制响应大小。每日自测记录限 100 次，个人题库限 200 题，计划保留最近约 30 天，会话有效期 14 天且每用户最多保留 5 个。没有后台轮询。

“导出我的数据”分页生成 V2 JSON，包含题库、草稿、最多 100 条提交历史、进度、计划和设置；修订号检查防止导出期间变更生成不一致文件。“恢复完整备份”支持六类数据及旧 V1 文件，逐条预览、写入与幂等重试，不覆盖现有内容；冲突、悬空记录、超额与失败会明确报告。添加题目 → JSON 导入仍只导入题库。请将完整导出文件保留为私有备份。部署完整恢复版本前执行 `migrations/0002_restore_entries.sql`；生产已执行，不能重复执行或修改这份历史迁移。删除账号会删除关联 D1 数据；本机缓存仍需由浏览器清除网站数据。

多样例编辑最多 8 组；“运行全部样例”逐项展示输入、期望、实际输出和错误，结果仍仅代表当前样例。批量导入先逐条校验，有效题保存、失败题提供单独重试。原创示例包位于 `public/examples/original-problems.json`。今日计划使用北京时间；“开始新一轮”会在本机保留上次代码并创建空模板，可查看或恢复上次代码。本机重练备份不等于云端历史的完整版本管理。

## 2026-09-29 后续批次交付

- `83e1f09`：账号绑定保护与完整备份恢复。生产 0002 回读 10 张应用表、18 个修订触发器。真实 UI 六类验收文件恢复新增 6、失败 0；重复同文件新增 0、跳过 6。再次导出回读保留对应草稿、历史、进度、计划及设置。
- 错配 `x-acm-expected-user` 的实际写请求返回 409；同账号另一个标签退出后，旧编辑器停止同步、保留代码。重新登录后可处理冲突并恢复云端草稿。这不是两个独立真实账号验收。
- `5c45a27`：题目导入和多样例练习。真实主域上编辑新增第二组样例，Python 运行显示 2/2 通过；停止并切题清空旧结果。新一轮重练清空代码，可查看并恢复上次代码。有效/无效题混合导入结果新增 1、失败 1，提示第 2 组样例；仅重试失败项新增 0。390px 视口无横向溢出。
- 最终 Mac 同步后在 WSL 执行 `npm test`：254/254 通过、0 失败。
- 待完成：两个真实独立账号及独立设备/手机实机验收，小规模用户试用；NAS Java/C++ 保持关闭。恢复冲突采用保留当前数据并跳过，尚无冲突副本合并编辑器。账号删除后的浏览器缓存自动清理、完整发布回滚演练仍待完善。

## M1 执行边界

主页面在 `public/`，`runner/bridge.html` 通过 `sandbox="allow-scripts"` iframe 加载，获得不透明来源。iframe 中再启动 Blob Web Worker，运行固定版本 Pyodide `0.29.3`。主页面只向 iframe 发送用户输入的 Python 源码、stdin 和随机任务 ID，绝不发送 Cookie、账户资料或私人题库。主页面仅接受当前 iframe window、`null` 来源、匹配 nonce/任务 ID 的结果。运行器 CSP 只准连接固定 Pyodide CDN；Python 所在 Worker 继承该 CSP。停止与超时直接终止 Worker，执行限制 5 秒、加载限制 30 秒、输出上限 32 KiB。CDN 不可用时显示失败并可重试。

静态 `_headers` 对主站和 runner 使用互不重叠的路径，避免 CSP 交叉收紧。Pages 上线后需实查 `/` 和 `/runner/bridge.html` 的响应头，测试 Python 正常/异常/无限循环停止，并在网络日志中证明 Python 无法请求同站 `/api/*` 且没有请求 NAS 域名。

## 免费资源与来源

Cloudflare Pages Free 当前限制每月 500 次构建、每站最多 20,000 个文件、单文件 25 MiB；Pages Functions 请求计入 Workers Free 每日 100,000 请求。D1 Free 当前每日 500 万行读取、10 万行写入、总存储 5 GB，超过每日额度时查询失败而非自动计费。上线前以账户实际套餐为准，不能启用 Workers Paid、R2 或付费模型。

- [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 定价与免费额度](https://developers.cloudflare.com/d1/platform/pricing/)
- [Pyodide 0.29.3 官方用法](https://pyodide.org/en/0.29.3/usage/index.html)

## 本地验证记录

2026-09-29：Mac 修改源码，经 `mutagen sync flush acmcoder-v3` 到 WSL。`node --check` 验证 JavaScript。WSL 临时静态服务通过 Mac 本地隧道供浏览器访问：正常样例 stdout 为 `8` 且显示“自测通过”；异常显示 traceback；无限循环点击停止后立即恢复界面；刷新保留代码草稿。使用与 `_headers` 相同的 CSP 再次运行成功。沙箱 Python 发起带凭据同站 `/api/private` 请求得到 `JsException`，服务访问日志只有静态文件，没有 `/api/private` 请求。

同日，父 agent 在 `https://acmcoder-web.pages.dev` 完成公网 M1 验收：页面和 CSP 正常，Python 样例输出 `8` 并显示“自测通过”；Python 带凭据请求同站 `/api/private` 得到阻断，浏览器目标网络请求记录为空；无限循环在 5 秒后自动停止。

M2/M3 源码提交 `e20a1f3`，Pages 变量修复 `a10e7ad`，静态资源版本修复 `3e55ec7`。WSL 中 SQLite 内存库成功执行 `0001_initial.sql`，8 张应用表、`foreign_keys=1`、`quick_check=ok`；父 agent 在生产 D1 建立并回读同样 8 张应用表。WSL `npm test` 245/245 通过；另有前端草稿加载竞态测试 1/1 通过。

父 agent 在真实线上以受邀 GitHub 账号 `Pygmalion03` 完成 OAuth，`/api/auth/session` 返回该账号，题库、进度、计划等数据 API 返回 200；添加原创题并以 JSON 保存 2 组样例，Python 输出 `8`、自测通过，D1 草稿生成 version 1 且刷新恢复。两个浏览器窗口使用**同一账号**依次保存不同草稿，后写请求得到 409；界面同时保留本机与云端版本，选择云端版本成功。今日计划可生成、勾选；UI 导出 JSON，删除该测试题后从导出文件重新导入题库并保留 2 组样例。退出后 `/api/auth/session` 返回 `authenticated: false`，`/api/problems` 返回 401；再次 GitHub 登录成功。390px 手机视口无横向溢出。该测试没有证明两个真实独立账号的线上隔离；目前只有 WSL SQLite API 测试覆盖跨用户读写、导出和计划权限。真实双账号与最终主域验收仍待完成。
