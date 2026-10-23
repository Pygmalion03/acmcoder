# ACMCoder

ACMCoder 是本地优先的个人 ACM 练习工作区：自己编写完整程序，用标准输入和样例自测，长期保留题目、草稿、重写历史和同题对话。网站、浏览器侧栏、本地 / Docker 共用学习数据格式，可选连接账号同步。样例通过不代表原平台隐藏测试 AC。

v4.2.0 增加代码编辑器、多样例自测、运行历史、每日队列和长对话分页，完善备份恢复与自托管部署。插件 ZIP、源码和校验和见 [Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.2.0)；功能与验收见[版本说明](docs/releases/v4.2.0.md)。网站部署、镜像 digest 和源码提交以最终 `release-manifest.json` 的关联为准。

## 选择使用方式

| 入口 | 代码在哪里运行 | 离线条件 | 需要账号吗 |
| --- | --- | --- | --- |
| [网站](https://acmcoder.pygmalion.top/) | 浏览器内 Python、C++17、Java 8 | 先在设置完成「网站离线」资源准备 | 基本练习不需要；同步与网站 AI 转发需要 |
| Chrome / Edge 插件 | 随包的 Python、C++17、Java 8 | 安装完整生成包后可独立运行 | 基本练习不需要；跨设备同步可选 |
| 本地源码 | 本机 Python、C++、Java 工具链 | 先安装依赖、构建界面及所需语言工具链 | 不需要；同步可选 |
| Docker app | app 容器内 Python、C++、Java 工具链 | 先下载或构建镜像 | 不需要；同步可选 |

浏览器 Java 使用 Java 8，编译时保持页面可见。本地 Java 版本由已安装工具链决定。离线时无法抓取外部题目、请求在线模型或云端同步；已保存的题目、代码与历史仍可用。清除网站数据或浏览器回收缓存后，网站需重新准备离线资源。

## 最短安装：Docker

先安装支持 Compose v2 的 Docker Engine 或 Docker Desktop，然后下载 v4.2.0 源码 ZIP 并解压，或使用 Git：

```sh
git clone --branch v4.2.0 https://github.com/Pygmalion03/acmcoder.git
cd acmcoder
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml up -d
```

打开 [本地工作区](http://127.0.0.1:43117)。该命令固定使用 v4.2.0 镜像，宿主机无需安装 Node.js 或语言工具链。首次拉取镜像需要联网；启动后基础练习可以离线使用。

学习数据保存在项目目录下的 `data/unified/`，旧数据保留在 `data/memory/`、`data/recommendation/`；设备凭据单独存放于 `credentials/`。停止服务用同一组 Compose 文件执行 `stop`。升级、换目录或删除数据前先按[升级与恢复](docs/upgrade.md)备份。

## 安装浏览器插件

1. 从 [Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.2.0) 下载 `acmcoder-extension-v4.2.0.zip`，解压到固定目录。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，启用开发者模式，选择「加载已解压的扩展程序」，选含 `manifest.json` 的目录。
3. 打开 LeetCode cn/com 题目页，点击 ACMCoder 图标，在侧栏读取题目、编写 ACM 程序并运行自测。

网站和本地服务不需要常开。插件商店尚未上架，当前使用免费手动安装；升级时保留原目录和插件身份。源码目录 `extension/` 缺少生成资源，不能直接当作新版安装包。详见[插件使用](docs/edge-extension.md)和[离线运行](docs/extension-runtime.md)。

## 从源码运行

需要 Node.js 22 或更新版本，以及要使用的语言工具链：Python 3、支持 C++17 的 `g++`、或包含 `javac` 的 JDK。先在源码目录执行：

```sh
npm ci --ignore-scripts
node scripts/build-clients.mjs local-web
npm start
```

打开 [本地工作区](http://127.0.0.1:43117)。构建会生成编辑器和共享界面；源码或依赖变化后重新构建，并重启后台服务。下载依赖时需要联网，完成安装后本地基础练习不依赖网站。

检查语言环境：

```sh
node bin/acmcoder.js doctor
```

也可以在源码目录使用 `docker compose up -d --build` 构建本地 app 镜像。已有服务升级前先备份，不要用空目录覆盖原数据。运行模式、端口与目录配置见[部署说明](docs/deployment.md)。

## 日常练习

- **今日**：查看到期复习和继续入口。当天队列保持稳定，支持完成、推迟与替换。
- **题库**：导入题面、原始样例与 ACM 输入，搜索、归档或恢复已有题目。
- **练习**：代码和输入自动保存；重新手撕先留快照，结束后可对照。提供代码编辑器、多样例运行、运行记录和重写差异。
- **数据**：在设置导出完整备份。匿名记录与账号记录分开保存，连接后需要主动合并；同步不能代替独立备份。
- **AI**：自带提供商配置和 Key，按需请求解释或建议。新对话按轮保存并分页读取，旧对话继续保留；模型不参与判题。

完整数据边界见[数据与隐私](docs/data-and-privacy.md)。原版本地入口保留在 `/legacy.html`，供需要旧每日推荐、记忆模式或运行器选择的用户使用。

## 构建三端与准备发行

三端完整构建另需 Python 3；首次构建网站和插件会下载固定版本运行资源并校验摘要。

```sh
npm ci --ignore-scripts
npm run build:clients
npm run build:pages
```

生成目录分别为 `dist/local-web/`、`dist/extension/` 和 `dist/site/`。Cloudflare 部署必须使用 `build:pages` 生成的 `dist/site/`，不能直接部署源码 `cloudflare/public/`。自托管账号服务见 [Cloudflare 部署](cloudflare/README.md)。

本地开发构建可以包含未提交修改，并标记为 `development / modified`。正式发行必须从固定提交的干净源码构建，再执行 `npm run check:release`、`npm run pack:release`；开发构建不能通过正式打包检查。发行包位于 `dist/releases/<版本>/`。没有 Git 的环境需使用该提交的固定源码归档，并准确提供构建提交与源码状态。

项目自有源码采用 [MIT 许可证](LICENSE)，运行器和编辑器的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。公开分享时只分享源码或发行包，不附带学习数据、设备凭据或 API Key。
