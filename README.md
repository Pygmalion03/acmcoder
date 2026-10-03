# ACMCoder

ACMCoder 是桌面 ACM 手撕练习工作区。网站、浏览器插件、本地/Docker版共用题库、今日安排、自动保存、重新手撕和长期历史；代码由你编写，自测只代表当前样例通过。

统一正式版为 `v4.1.0`，默认源码分支为 `codex/unified-product`。本版在 v4.0.0 基础上增加网站离线重开、浏览器 Java 8，并完成日常 Chrome 插件真实账号与 AI 验收。网站、插件ZIP、本地/Docker使用同一产品版本，源码、网站部署与镜像摘要由随包发行清单关联。v4.0.0、旧候选和原 `v3` 分支继续保留，便于回退。

[正式Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.1.0)提供源码、插件ZIP、Java对应源码、校验和与发行清单。新增功能真实验收见[增量回执](docs/releases/evidence/v4.1-incremental-2026-10-02.json)，原18节点见[需求核对](docs/releases/unified-requirement-audit.md)，安装与限制见[本版说明](docs/releases/v4.1.0.md)。

- **直接练习**：[正式网站](https://acmcoder.pygmalion.top/) 无需登录即可运行Python、C++17与Java 8；登录GitHub可跨设备同步。[原预览地址](https://acmcoder-unified-preview.pages.dev/)继续可用，账号数据共用。
- **LeetCode侧栏**：统一插件生成包 `dist/extension/` 自带离线Python/C++17/Java 8，不需要本地服务或网站打开。商店未上架。
- **本地 / Docker**：保留Python、C++、Java工具链运行和离线数据。源码构建后使用相同共享界面。

版本、真实能力和限制见 [功能矩阵](docs/releases/unified-feature-matrix.md)。升级前请先阅读 [升级与恢复](docs/upgrade.md)；API Key去向、长期记录与账号删除见 [数据与隐私](docs/data-and-privacy.md)。

自有源码采用 [MIT 许可证](LICENSE)。随包 Python、LLVM 等组件保留自己的许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 构建统一正式版

```sh
npm ci --ignore-scripts
npm run build:clients
npm run check:release
npm start
```

浏览器插件安装目录为 `dist/extension/`。源码 `extension/` 缺少生成的共享文件和Python/C++/Java运行资源，不能直接安装新版。发行包由 `npm run pack:release` 生成；在无Git的运行镜像中需提供固定源码归档和源commit。正式发行检查未通过前不生成稳定tag或更新镜像latest。

## 正式版Docker安装

普通用户优先使用 Docker app。只需要 Docker Desktop，不需要在本机另装 Node.js、Java、C++ 或 Python。

```bash
git clone --branch v4.1.0 https://github.com/Pygmalion03/acmcoder.git
cd acmcoder
docker compose -f docker-compose.prebuilt.yml up -d
```

不想安装 Git 时，也可以从 GitHub Release 或仓库页面下载源码 ZIP，解压后在解压目录运行同一条命令：

```bash
docker compose -f docker-compose.prebuilt.yml up -d
```

启动后打开：

```text
http://127.0.0.1:43117
```

服务默认只接受 `localhost`、`127.0.0.1` 和 `[::1]` 的 Host。若通过已知域名访问，启动前设置 `ACMCODER_TRUSTED_HOSTS=practice.example.test`；多个域名用逗号分隔。Compose 会把该变量传入容器。反向代理须传递配置中认可的原始 Host；仅监听 `0.0.0.0` 不会自动信任其他域名。

Docker app 页面里的运行模式会显示为 `内置环境`。这表示 Java/C++/Python 工具链都在 app 容器里，直接选它运行代码即可。

停止服务：

```bash
docker compose -f docker-compose.prebuilt.yml down
```

## 安装浏览器插件

下载[正式版插件ZIP](https://github.com/Pygmalion03/acmcoder/releases/download/v4.1.0/acmcoder-extension-v4.1.0.zip)，解压到固定目录。Edge打开 `edge://extensions/`；Chrome打开 `chrome://extensions/`，启用 `Developer mode` / 开发者模式，点击 `Load unpacked` / 加载已解压的扩展程序，选择含manifest.json的目录。无需注册商店开发者账号或支付注册费；当前使用免费手动安装，商店上架留待以后。

打开LeetCode题目页，点击ACMCoder图标，在浏览器插件侧栏读取当前题目，即可直接编写ACM程序和标准输入；Python/C++17/Java 8可断网运行。关闭网站和本地服务不会影响插件练习。旧本地侧栏从设置进入，仍可连接稳定版服务。

同一安装目录升级并重新加载，先导出备份再操作。不要卸载旧插件或更换解压路径导致身份变化而丢失旧存储。完整说明见 [插件使用](docs/edge-extension.md) 和 [升级](docs/upgrade.md)。

## 另一台设备怎么更新

插件先导出备份，再关闭扩展页面，把新发行ZIP解压覆盖**原安装目录**，在 `edge://extensions/` 或 `chrome://extensions/` 点 `Reload`。不要卸载、换目录或直接加载源码 `extension/`；生成包目录是 `dist/extension/`，发行ZIP解压后的根目录直接含manifest.json。商店尚未上架，当前为手动更新。

Docker用户升级前导出备份并保留原数据目录，在新版源码目录执行：

```bash
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml pull
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml up -d
```

`docker-compose.release.yml`锁定正式v4.1.0；`docker-compose.candidate.yml`保留给rc.14候选环境，不用于本次正式版安装。

覆盖文件仅更换镜像，沿用四个数据/凭据路径和回环端口。升级前先导出并另存数据目录；不要运行带删除卷的命令。降级先保留当前数据，按[升级与回退](docs/upgrade.md)使用升级前副本；旧服务不会显示全部V3记录。

如果你在 Compose 文件里固定了镜像 tag，把 tag 更新到当前版本：

```text
ghcr.io/pygmalion03/acmcoder-app:v4.1.0
ghcr.io/pygmalion03/acmcoder-runner:v4.1.0
```

## 日常使用流程

1. 打开 LeetCode 题目页，点击 ACMCoder 扩展图标打开侧栏。
2. 点击读取当前题目，选择Python、C++17或Java 8，编写完整ACM程序。
3. 填写标准输入和期望输出，点击「运行自测」。
4. 完成后可「重新手撕」，原代码和历史继续保留。
5. 在「设置与数据」主动连接GitHub，可同步到[正式网站](https://acmcoder.pygmalion.top/)和其他设备。基本练习无需登录或本地服务。

需要本地原生工具链环境时，启动本地/Docker服务并打开 `http://127.0.0.1:43117`。

## 即时巩固练习

统一练习页会保存代码、输入、期望输出和同题AI对话。点击「重新手撕」先保留原代码快照，再开始独立重写草稿；关闭后再回来仍可继续。完成重写后可对照原记录，只有显式「放弃本次重写」才丢弃未完成重写。AI对话每页显示20条，完整历史继续保留。

## 启动方式和运行模式

先分清两个概念：

- **启动方式**：ACMCoder Web 服务在哪里跑。
- **运行模式**：点击 `Run` 时，代码交给哪套编译/运行环境。

| 使用方式 | 用户需要先装 | Web 服务 | 页面运行模式 |
| --- | --- | --- | --- |
| Docker app | Docker Desktop | Docker app 容器 | `内置环境` |
| 源码 + 本机环境 | Node.js 和对应语言工具链 | 宿主机 Node.js | `本机环境` |
| 源码 + Docker runner | Node.js、Docker Desktop | 宿主机 Node.js | `Docker runner` |

Docker app 是普通用户最短路径。Docker runner 是给“Web 服务在本机跑，但代码执行交给 runner 容器”的开发/半开发场景用的，不是 Docker app 的必选项。

## 源码本地运行

适合开发者，或已经安装 Node.js 的用户：

```bash
npm install
npm test
npm start
```

打开：

```text
http://127.0.0.1:43117
```

常用 CLI：

```bash
node bin/acmcoder.js list
node bin/acmcoder.js show reverse-linked-list
node bin/acmcoder.js doctor
node bin/acmcoder.js test reverse-linked-list --lang python --file path/to/your/main.py
```

源码模式下会扫描宿主机语言环境。宿主机有对应工具链时选 `本机环境`；如果只有 Node.js 和 Docker Desktop、不想另装 Java/C++/Python，可以选 `Docker runner`。

## Docker runner

Docker runner 镜像带 Java、C++、Python 三套运行环境。默认本地镜像名是：

```text
acmcoder-runner:local
```

首次选择 Docker runner 时，如果镜像不存在，ACMCoder 会自动执行等价构建：

```bash
docker build -t acmcoder-runner:local .
```

也可以指定预构建 runner 镜像：

```powershell
$env:ACMCODER_DOCKER_IMAGE="ghcr.io/pygmalion03/acmcoder-runner:latest"
```

```bash
export ACMCODER_DOCKER_IMAGE=ghcr.io/pygmalion03/acmcoder-runner:latest
```

禁用自动构建：

```bash
ACMCODER_DOCKER_AUTO_BUILD=0
```

`node bin/acmcoder.js doctor` 会同时展示本机 Java/C++/Python 工具链和 Docker runner 状态。

## 版本、Release 和镜像

这个项目有三类发布物：

- **源码分支**：默认 `codex/unified-product`，正式版源码固定于 `v4.1.0`；旧 `v3` 分支保留。
- **GitHub Release**：面向用户看的版本页，说明 tag、变更和启动方式。
- **GHCR Docker 镜像**：Docker 用户实际拉取的预构建镜像。

`docker-compose.prebuilt.yml` 默认使用：

```text
ghcr.io/pygmalion03/acmcoder-app:latest
```

需要锁版本时使用当前 Release tag：

```text
ghcr.io/pygmalion03/acmcoder-app:v4.1.0
ghcr.io/pygmalion03/acmcoder-runner:v4.1.0
```

更多部署边界见 [`docs/deployment.md`](docs/deployment.md)。

## 原版本地兼容能力

以下为保留的原版本地入口能力；统一工作区的当前能力与三端区别见[功能矩阵](docs/releases/unified-feature-matrix.md)。

- 5 道种子题。
- 支持 Java、C++17、Python。
- 支持本机运行、Docker runner 和 Docker app 内置环境。
- 支持 Edge/Chrome 手动加载浏览器插件，在 LeetCode 题目页打开侧栏练习。
- 支持个人题库、完整练习页、AC 次数、导入导出和批量删除。
- 内置 30 道中文高频推荐题，支持推荐题库导入、导出、全选和批量删除。
- 支持按题量、难度和标签生成每日计划，每天可选 1 至 5 道题；模型不可用时自动使用本地规则计划。
- 支持可选 OpenAI-compatible 每日推荐和代码建议，但不使用 LLM 作为判题器。
- 推荐题库只保存题目索引和 LeetCode 链接；加入个人题库时按需读取完整题面并保存在本机。
- Web 工作台会同步插件新增题目和 AC 进度，同时保留当前代码、输入和选题。

## 原版本地模型建议和数据

模型能力是可选增强，不参与判题，也不会覆盖源代码。每日计划只允许模型从本地候选题中选择；模型返回的题量、slug 或去重结果不符合要求，或者请求超过 8 秒时，系统改用确定性的本地规则。用户也可以主动请求代码建议。API Key、Base URL 和 Model 都在本机配置，服务端通过 OpenAI-compatible `chat/completions` 接口请求结果。

本地数据默认保存在：

```text
data/memory/
```

这个目录已被 git 忽略。API Key 目前是本机明文保存，适合个人本地使用，不要把自己的 `data/memory` 目录分享给别人。

本地 HTTP 服务会拒绝普通外部网页的跨域请求，只接受本机同源页面、ACMCoder 浏览器扩展或不经过浏览器的本机客户端。执行代码前，Web 页面和侧栏会先从 `GET /api/session` 获取本次服务进程的临时令牌，再通过 `X-ACMCoder-Token` 请求头调用 `/api/run`；服务重启后令牌自动更换。

## 接口和目录

常用本地接口：

```text
GET  /api/doctor
GET  /api/session
POST /api/run
GET  /api/memory/pages
POST /api/memory/pages
GET  /api/memory/export
POST /api/problems/import
GET  /api/recommendation/catalog
POST /api/daily-plan/generate
GET  /api/daily-plan/today
POST /api/assist
```

主要目录：

```text
data/problems.json       题目元数据
problems/*/cases         固定样例
problems/*/templates     Java/C++/Python 模板
src/core                 题目读取和输出比对
src/runner               本地和 Docker runner
src/server               本地 HTTP API
web                      本地 Web 页面
extension                浏览器侧栏插件
```

## 后续

后面更值得补的是插件商店发布、更多题目贡献规范和更顺的一键安装体验。
