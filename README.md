# ACMCoder

ACMCoder 是桌面 ACM 手撕练习工作区。网站、浏览器插件、本地/Docker版共用题库、今日安排、自动保存、重新手撕和长期历史；代码由你编写，自测只代表当前样例通过。

当前稳定版为 `v3.0.4`。统一候选版为 `v4.0.0-rc.10`，源码分支为 `codex/unified-product`；稳定源码分支仍是 `v3`。rc.10修正 Cloudflare 模型转发的重定向兼容问题，固定源码 e587c08 的网站、插件ZIP和本地候选镜像已构建验收；旧候选和数据备份继续保留。12项功能验收已通过，包括真实双账号隔离、云账号备份恢复、导出期间编辑及三端真实AI问答/取消/错误恢复。用户现有本地服务实际为rc.9，原题目和练习统计保留。GitHub Release、GHCR及最终分发仍待完成，尚非完整正式发布。实际证据见交付日志。

- **直接练习**：[公开预览网站](https://acmcoder-unified-preview.pages.dev/) 无需登录即可运行Python与C++17；登录GitHub可跨设备同步。
- **LeetCode侧栏**：统一插件生成包 `dist/extension/` 自带离线Python，不需要本地服务或网站打开。商店未上架。
- **本地 / Docker**：保留Python、C++、Java工具链运行和离线数据。候选源码构建后使用相同共享界面。

版本、真实能力和限制见 [功能矩阵](docs/releases/unified-feature-matrix.md)。升级前请先阅读 [升级与恢复](docs/upgrade.md)；API Key去向、长期记录与账号删除见 [数据与隐私](docs/data-and-privacy.md)。

自有源码采用 [MIT 许可证](LICENSE)。随包 Python、LLVM 等组件保留自己的许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 构建统一候选版

```sh
npm ci --ignore-scripts
npm run build:clients
node scripts/check-release.mjs --candidate
npm start
```

浏览器插件安装目录为 `dist/extension/`。源码 `extension/` 缺少生成的共享文件和Python/C++运行资源，不能直接安装新版。发行包由 `node scripts/package-release.mjs --candidate` 生成；在无Git的运行镜像中需提供固定源码归档和源commit。正式发行检查未通过前不生成稳定tag或更新镜像latest。

## 稳定3.0.4的Docker安装

普通用户优先使用 Docker app。只需要 Docker Desktop，不需要在本机另装 Node.js、Java、C++ 或 Python。

```bash
git clone https://github.com/Pygmalion03/acmcoder.git
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

下载候选发行ZIP或先构建 `dist/extension/`，解压到固定目录。Edge打开 `edge://extensions/`；Chrome打开 `chrome://extensions/`，启用 `Developer mode` / 开发者模式，点击 `Load unpacked` / 加载已解压的扩展程序，选择含manifest.json的目录。

打开LeetCode题目页，点击ACMCoder图标，在浏览器插件侧栏读取当前题目，即可直接编写ACM程序和标准输入；默认Python可断网运行。关闭网站和本地服务不会影响插件练习。旧本地侧栏从设置进入，仍可连接稳定版服务。

同一安装目录升级并重新加载，先导出备份再操作。不要卸载旧插件或更换解压路径导致身份变化而丢失旧存储。完整说明见 [插件使用](docs/edge-extension.md) 和 [升级](docs/upgrade.md)。

## 另一台设备怎么更新

如果另一台设备是手动下载 ZIP 使用：

1. 下载最新 Release 或最新源码 ZIP。
2. 解压到一个新的目录，或者覆盖旧目录。
3. 在新目录里启动服务：

```bash
docker compose -f docker-compose.prebuilt.yml pull
docker compose -f docker-compose.prebuilt.yml up -d
```

4. 到 `edge://extensions/` 或 `chrome://extensions/`，对 ACMCoder 点 `Reload` / 重新加载。若旧扩展指向旧解压目录，重新 `Load unpacked` 并选择新目录里的 `extension/`。

如果另一台设备是 Git clone：

```bash
git pull
docker compose -f docker-compose.prebuilt.yml pull
docker compose -f docker-compose.prebuilt.yml up -d
```

然后在扩展管理页点 `Reload`。

如果你在 Compose 文件里固定了镜像 tag，把 tag 更新到当前版本：

```text
ghcr.io/pygmalion03/acmcoder-app:v3.0.4
ghcr.io/pygmalion03/acmcoder-runner:v3.0.4
```

## 日常使用流程

1. 启动 ACMCoder 服务。
2. 打开 LeetCode 题目页。
3. 点击 ACMCoder 扩展图标打开侧栏。
4. 选择语言，按 ACM 输入输出协议补全代码。
5. 填写 `stdin` 和可选预期输出，点击 `Run`。
6. 打开 `http://127.0.0.1:43117`，可以管理个人题库和推荐题库，也可以生成每日计划后在完整练习页继续编程。

## 即时巩固练习

Web 练习页会把当前题目的 AI 对话和最近一轮练习保存在当前浏览器中；每日推荐题加入个人题库的方式不变。收到 AI 建议后可点“我懂了，马上重练”，或在确认 AC 后点“再练一次”：两者都会以同一道题的初始模板开始一轮干净的巩固练习。巩固期间可查看上一轮思路；在首次编辑或运行前也可以恢复上一轮。

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

- **源码分支**：当前为 `v3`，包含代码、Dockerfile、Web、插件和文档。
- **GitHub Release**：面向用户看的版本页，说明 tag、变更和启动方式。
- **GHCR Docker 镜像**：Docker 用户实际拉取的预构建镜像。

`docker-compose.prebuilt.yml` 默认使用：

```text
ghcr.io/pygmalion03/acmcoder-app:latest
```

需要锁版本时使用当前 Release tag：

```text
ghcr.io/pygmalion03/acmcoder-app:v3.0.4
ghcr.io/pygmalion03/acmcoder-runner:v3.0.4
```

更多部署边界见 [`docs/deployment.md`](docs/deployment.md)。

## 当前能力

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

## 模型建议和本地数据

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
