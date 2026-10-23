# Cloudflare 网站部署

网站使用与插件、本地版相同的工作区。Python、C++17 和 Java 8 在浏览器内运行；Cloudflare 提供可选账号、D1 同步、设备授权和网站 AI 转发，不执行用户的 Java / C++ / Python 程序，也不需要连接 NAS runner。

v4.2.0 包含 `0007_record_capacity_repair.sql`；本机和本地 D1 验证不代表某个公网部署或生产迁移已执行。已发布版本仍以 [Release](https://github.com/Pygmalion03/acmcoder/releases) 和发行清单为准。

## 构建正确的部署目录

在**仓库根目录**运行，环境需有 Node.js 22+、Python 3，首次下载依赖与运行资源需要联网：

```sh
npm ci --ignore-scripts
npm run build:pages
```

部署目录是根目录下的 `dist/site/`。其中 `index.html` 是统一工作区，`legacy.html` 保留旧网站入口，`_worker.js` 处理 `/api/*`；Python / C++ / Java 和编辑器资源都是静态文件。`dist/pages-build/manifest.json` 记录构建产物信息。

不要直接部署 `cloudflare/public/`，也不要使用「根目录 cloudflare、构建命令空、输出 public」的旧配置。Pages Git 构建应以仓库根目录为根，执行 `npm ci --ignore-scripts && npm run build:pages`，输出 `dist/site`。仅运行 `build:site` 不会生成完整 API Worker，也不会把首页切到统一工作区。

## 自托管配置

仓库中的域名、Pages 项目和 D1 标识属于原部署。自建站点必须使用自己的 Pages 项目、D1 数据库和 GitHub OAuth App。

1. 修改公开的 `shared/deployment-config.js`：`cloudOrigin` 为自有账号服务的 HTTPS 根地址，`websiteOrigins` 为允许接续的精确网页来源，并包含 `cloudOrigin`。不写通配符、路径或任何 Secret。重建三端，使插件权限与接续来源一起生成。
2. 在 `cloudflare/wrangler.jsonc` 中使用自己的项目和 D1 信息。D1 binding 名称保持 `DB`，迁移目录为 `cloudflare/migrations/`。
3. 配置公开变量 `PUBLIC_ORIGIN`、`GITHUB_CLIENT_ID`，把 `GITHUB_CLIENT_SECRET` 作为 Pages 加密变量保存。OAuth callback 为 `${PUBLIC_ORIGIN}/api/auth/github/callback`，且必须与部署来源一致。
4. 未登记插件 ID 使用设备确认流程；需要固定插件 PKCE 回调时才配置 `EXTENSION_IDS`，仅填自己的确切安装 ID。旧 `INVITED_GITHUB_IDS` 不是当前代码中的登录访问控制。

默认客户端保留原预览账号服务和正式网站来源，以兼容现有连接。换到自托管地址前导出备份并退出旧账号，再为新部署授权；修改公开地址不会搬迁云端数据库、学习空间或旧设备令牌。不要复用仓库作者的 D1 ID、OAuth Secret 或登录会话。

## 数据迁移与部署顺序

新数据库按编号执行全部迁移 `0001` 至 `0007`。已有数据库先查看已经应用的迁移，只执行缺少的迁移，不重复粘贴历史 SQL、不改已有迁移文件。部署前保留数据库恢复点，在独立本地 D1 或预览环境先验证相同流程。

以下命令中的 `YOUR_D1_DATABASE` 和 `YOUR_PAGES_PROJECT` 必须替换为已在自己配置中登记的名称；从仓库根目录执行：

```sh
npx wrangler d1 migrations list YOUR_D1_DATABASE --remote --config cloudflare/wrangler.jsonc
npx wrangler d1 migrations apply YOUR_D1_DATABASE --remote --config cloudflare/wrangler.jsonc
npx wrangler pages deploy dist/site --project-name YOUR_PAGES_PROJECT --config cloudflare/wrangler.jsonc
```

`0007` 修正旧级联删除后的容量计数，并保留正文、记录修订、同步游标、mutation 和删除标记。生产迁移的执行状态见 v4.2.0 交付回执；自托管环境仍需核对自己数据库的迁移记录。升级这份源码时需把相应服务端代码和迁移配套安排；不要仅凭页面版本号判断数据库已更新。

## 上线检查与回退

先确认精确部署地址的匿名页面、受保护 API 和静态运行资源：

```sh
ACMCODER_PAGES_SMOKE_URL=https://your-project.pages.dev node scripts/smoke-pages.mjs
```

该脚本检查 HTTP 和资源摘要，不证明真实程序执行或账号同步。还需在浏览器完成三语言样例、取消运行、刷新保留草稿、离线资源准备后断网重开，并用隔离测试题验证新设备同步、备份恢复、离线冲突和删除后重连。旧验收记录不能自动作为本次部署证据。

回退页面使用已保留的不可变 Pages 部署。数据库变更单独按恢复点处理，不删除迁移表、协议日志或 tombstone 来模拟回滚；回退前保留升级后新增的学习内容。用户侧步骤见[升级与恢复](../docs/upgrade.md)。

## 数据与免费部署边界

浏览器 IndexedDB 先保存本机记录，连接账号后才同步到 D1；匿名空间不会自动上传。备份采用完整 V3 学习格式，并可合并 V1/V2 旧备份，不按最近 100 条或 30 天裁掉历史。新对话按轮保存，旧聚合记录保留。容量、每日云端运行记录额度和冲突状态在设置中显示，达到限制不会删除已有本机记录。

网站离线资源不缓存 API 响应、Cookie、Key 或学习正文。网站 AI 需要联网与账号，通过受限地址转发用户自己的单次 Key，不把 Key 写入 D1。完整说明见[数据与隐私](../docs/data-and-privacy.md)。

部署前以自己的账户套餐和实际用量核对 [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)和 [D1 额度](https://developers.cloudflare.com/d1/platform/pricing/)。本项目不要求启用付费 Workers、R2 或共享付费模型。
