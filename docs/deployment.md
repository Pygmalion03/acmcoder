# ACMCoder部署：统一候选版与稳定版

公开统一候选版为 **4.0.0-rc.12**，固定源码 **f3c7078**；网站部署1c5fb1e3、同ID插件ZIP及本地候选镜像已关联。375/375测试及三端构建通过。设置与题库布局对齐；AI显示每页最多20条，固定高度滚动，203条隔离会话在翻页/刷新后完整保存与导出，插件原5条真实问答保留。桌面1154像素和侧栏400像素布局没有横向溢出。43117静态界面已更新rc.12，后端仍为已验收的rc.9；旧候选及数据备份保留。12项功能验收证据沿用，本轮不重复未受界面修改影响的真实AI调用与语言实验。稳定版仍为3.0.4；GitHub Release/GHCR公开分发与最终审计仍待完成。

源码部署先 `npm ci --ignore-scripts`，再 `node scripts/build-clients.mjs all`，`npm start`；默认127.0.0.1:43117。发布构建提供 `ACMCODER_BUILD_COMMIT` 完整Git SHA，各客户端version.json必须一致。WSL镜像不含.git，使用Mac固定commit归档并传入该SHA构建。

候选Docker app从同一源码构建，生成共享本地界面，保留三语言工具链：

```sh
docker build -f Dockerfile.app -t acmcoder-app:4.0.0-rc.12 --build-arg ACMCODER_BUILD_COMMIT="$(git rev-parse HEAD)" .
```

候选镜像发布后的版本引用为 `ghcr.io/pygmalion03/acmcoder-app:v4.0.0-rc.12`，runner对应 `ghcr.io/pygmalion03/acmcoder-runner:v4.0.0-rc.12`；这两者目前是拟发布名称，尚未有公开digest，不应用“拟发布”命令代替已可下载证明。稳定镜像latest不会随候选构建更新。

Cloudflare预览与正式站使用独立D1和OAuth配置。升级时不反向删除迁移表；网站删除与旧设备写入遵循协议1墓碑。数据库、学习数据与credentials不放入源码包或源码同步。完整升级路径见 [升级](upgrade.md)，实际能力见 [矩阵](releases/unified-feature-matrix.md)。

网站完整构建执行 `npm run build:pages`，输出 `dist/site` 的共享工作区、压缩C++静态资源、`_worker.js` API及仅 `/api/*` 的路由。固定 esbuild 0.28.1 打包 `cloudflare/worker.js`，复用既有Functions的API处理器与Pages ASSETS静态绑定，不引入Node运行模块，检查单文件25MiB/20,000文件与3MiB压缩Worker免费预算，构建清单位于 `dist/pages-build/manifest.json`。现有预览项目通过GitHub连接构建此目录；仪表盘OAuth/D1绑定保持，不上传源码中的旧正式配置。直接上传时只对已授权的预览项目使用这份完整输出，不能只上传静态页面而丢API，也不能把C++资源内嵌Worker。

以下记录稳定3.0.4的安装与运行方式，旧用户仍可使用。

# ACMCoder 部署现状

## 先分清入口和运行模式

ACMCoder 现在有两个 Web 启动入口：

- 宿主机源码启动：Node 服务在本机跑。
- Docker app 启动：Node 服务和 Java/C++/Python 工具链都在 app 容器里。

页面里的运行模式只负责决定 `Run` 时把代码交给谁执行：

- `本机环境` 只出现在宿主机源码启动场景，调用宿主机工具链。
- `Docker runner` 只服务于宿主机 Web 调 Docker runner 镜像。
- `内置环境` 只出现在 Docker app 场景，调用 app 容器自带工具链。

## 本地启动

适合开发者或已经有 Node.js 的用户。

```bash
npm install
npm start
```

打开：

```text
http://127.0.0.1:43117
```

默认只接受本机 Host（`localhost`、`127.0.0.1`、`[::1]`）。通过已知域名部署时，设置 `ACMCODER_TRUSTED_HOSTS=practice.example.test` 后启动服务；多个精确 hostname 可用逗号分隔，不支持通配符或 URL。两份 Compose 文件都会传入该变量，未设置时为空。反向代理需保留被配置认可的 Host，请求中的 `X-Forwarded-Host` 不参与信任判断。

这个模式下，Local runner 会扫描宿主机的 `python`、`javac/java`、`g++`。如果用户没有对应语言环境，但安装了 Docker Desktop，可以在页面里切到 Docker runner。

## 只有 Docker 的用户

发布后的预构建应用镜像是最短路径：

```bash
docker compose -f docker-compose.prebuilt.yml up -d
```

打开：

```text
http://127.0.0.1:43117
```

这条路不要求用户本机安装 Node.js、Java、C++ 或 Python。容器里的内置环境已经带了 `python3`、`g++`、`openjdk`，所以页面里选择 `内置环境` 就能运行代码。它不是 Docker runner，而是 app 容器本身的编译运行环境。新版Compose还独立挂载 `./data/unified` 与 `./credentials`；稳定版原有 `./data/memory` 和 `./data/recommendation` 挂载到容器，因而记忆题目、推荐题库、每日计划、AC 次数和模型设置可以持久化，同时不会让宿主机的空 `./data` 目录遮住镜像内置的 `problems.json`。

这条路径会创建 Docker 镜像、容器和 Compose 网络，但不会修改用户 Docker Desktop 的全局配置，也不会往宿主机安装 Java/C++/Python。

宿主机上的 `./data/memory` 和 `./data/recommendation` 必须允许容器写入。生产配置同时使用 `cap_drop: [ALL]` 时，即使容器进程 UID 为 0，也不能依赖 `DAC_OVERRIDE` 绕过宿主机目录权限。部署前应由 Docker 创建这些目录，或显式设置适合当前 NAS 用户/ACL 的读写权限；不要把权限错误误判为推荐题库或应用启动失败。不要把整个空的 `./data` 目录挂载到 `/app/data`，否则会遮住镜像内置的种子题库。

如果要从当前源码本地构建应用镜像，再运行：

```bash
docker compose up --build
```

## 两类 Docker 镜像的区别

`Dockerfile` 是 runner 镜像。它服务于“本机启动 Web，然后运行代码时选择 Docker runner”的场景。默认镜像名是 `acmcoder-runner:local`，缺失时会自动构建。发布后的预构建镜像名是：

```text
ghcr.io/pygmalion03/acmcoder-runner:latest
```

`Dockerfile.app` 是应用镜像。它服务于“用户只有 Docker，也想直接打开 ACMCoder Web”的场景。它把 Node 服务和 Java/C++/Python 工具链都放在一个容器里，因此不需要在容器里再调用 Docker runner。发布后的预构建镜像名是：

```text
ghcr.io/pygmalion03/acmcoder-app:latest
```

这两个镜像都先做全量三语言。语言选择发生在页面或 CLI 的每次运行里，不发生在 Docker 部署阶段。部署时拆成 Java-only、C++-only、Python-only 镜像是可行的，但会增加镜像矩阵、文档分支和用户选择成本；在当前目标里，先保证“装了 Docker 就能直接用”更划算。

三种入口的边界：

| 使用方式 | Web 服务 | 编译/运行环境 | 适合谁 |
| --- | --- | --- | --- |
| 源码 + Local runner | 宿主机 Node.js | 宿主机 Java/C++/Python | 开发者，本机环境齐全 |
| 源码 + Docker runner | 宿主机 Node.js | Docker runner 镜像 | 有 Node.js，但不想装编译环境 |
| Docker app 镜像 | Docker app 容器 | Docker app 容器 | 只有 Docker 的普通用户 |

页面和插件始终列出 `本机环境`、`内置环境` 和 `Docker runner` 三种名称，并禁用当前部署无法使用的选项。Docker app 模式只启用 `内置环境`；本机服务按工具链和 Docker 状态启用 `本机环境` 与 `Docker runner`。如果用户已经通过 Docker app 进入页面，再选 Docker runner 就变成“容器里的 Web 服务继续调用另一个 Docker runner 容器”，当前部署不提供这条链路。

本地 Web 想直接使用预构建 runner 时，可以设置：

```powershell
$env:ACMCODER_DOCKER_IMAGE="ghcr.io/pygmalion03/acmcoder-runner:latest"
```

```bash
export ACMCODER_DOCKER_IMAGE=ghcr.io/pygmalion03/acmcoder-runner:latest
```

## 镜像发布

`.github/workflows/publish-images.yml` 会发布两类多架构镜像：

- `acmcoder-app`
- `acmcoder-runner`

发布前必须先通过单元测试，并以只读根文件系统、2 CPU、2 GB 内存、256 PID 和无额外 Linux capability 的配置启动真实 app 镜像。冒烟测试会验证空数据卷仍能加载内置推荐题库，并实际编译运行 Java、C++ 和 Python。只有验证任务通过，发布任务才会构建并推送多架构镜像。

工作流支持手动触发，也会在推送 `v*` tag 时发布带版本 tag 的镜像，并给版本发布产物补 `latest`。`docker-compose.prebuilt.yml` 指向预构建 `app` 镜像，避免零环境用户先在本地 build。

## Release、源码和 Package 的关系

Release 不是 Docker 运行的必要条件。Docker 用户真正拉取的是 GHCR package：

```text
ghcr.io/pygmalion03/acmcoder-app:latest
ghcr.io/pygmalion03/acmcoder-runner:latest
```

Release 的作用是给用户一个清晰的版本页，说明这个版本对应哪个 tag、有哪些镜像、怎么启动。源码 ZIP/TAR 也会挂在 Release 下面，但普通 Docker 用户仍然建议使用仓库里的 `docker-compose.prebuilt.yml` 或最新源码目录，而不是把 Release 当成安装器。

源码分支可以先于正式 Release 更新。默认 Compose 文件使用 `ghcr.io/pygmalion03/acmcoder-app:latest`；如果需要固定版本，再使用 Release 对应的 tag，例如 `ghcr.io/pygmalion03/acmcoder-app:v3.0.4`。

## 环境扫描

Web 和 Edge 侧边栏现在都会调用：

```text
GET /api/doctor
```

它会返回 Java/C++/Python 工具链、Docker runner 状态和当前部署模式。宿主机源码启动时，用户没有保存过运行模式，页面会按当前语言推荐 `本机环境` 或 `Docker runner`；Docker app 启动时，页面会标明 `内置环境` 并禁用 Docker runner。

## 模型建议

模型能力是可选项，不参与判题，也不会覆盖源代码。

接口：

```text
GET  /api/assist/settings
POST /api/assist/settings
POST /api/assist
```

默认按 OpenAI-compatible `chat/completions` 接口调用。用户可以在 Web 或插件里填写 API Key、Base URL 和 Model。设置保存到 `data/memory/settings.json`，这个目录已被 git 忽略。也可以用环境变量：

```text
ACMCODER_LLM_API_KEY
ACMCODER_LLM_BASE_URL
ACMCODER_LLM_MODEL
```

## 仍然不够顺的地方

从零用户现在至少需要安装 Docker Desktop，并在项目目录里运行一条 Compose 命令。预构建镜像已经把本地 build 从默认路径里拿掉，但还不是“一键安装”。

再往后可以补安装脚本或桌面打包，但要先保证镜像发布和升级路径稳定。桌面打包会增加维护成本，而且代码执行沙箱仍然要认真处理。

## 统一版本开发预览

新版本地首页采用共享的今日/题库/练习/设置界面，原版保留在`/legacy.html`（`/index.html`也继续可用）。本地Python/C++/Java仍调用已安装工具链；网站和免部署插件目前提供Python。

学习文件默认`data/unified/`，通过`ACMCODER_UNIFIED_DATA_DIR`可指定。原`data/memory/`题面首次迁移会保留原文件并在`legacy-originals/`保留副本；原浏览器语言草稿从学习键导入，不删除旧键。文件写入采用恢复journal、fsync与原子替换，关闭浏览器后仍保留。备份包含统一记录，凭据和原始文件副本不混入学习备份。

本地设置的账号连接使用设备码，在网站批准后可以关闭网站，账号副本在独立namespace。凭据默认在用户`~/.local/share/acmcoder/credentials/`，可用`ACMCODER_CREDENTIAL_DIR`改为独立目录；文件0600，不应纳入源码同步或备份。匿名与账号副本仅在主动合并时汇合。

Compose新增`data/unified:/app/data/unified`和`credentials:/app/credentials`两个独立卷，保留原memory/recommendation卷。GitHub上的旧`latest`镜像尚未更新，正式新镜像在统一版本发布阶段提供；当前验证镜像为本地`acmcoder-app:unified-preview`。升级前应备份原数据，不能用测试卷替换用户卷。

独立验证入口`http://127.0.0.1:43118/workspace.html`由WSL tmux `acmcoder-unified-preview`运行，临时测试数据目录`/tmp/acmcoder-unified-local-preview`，用于验证并会清理。正式43117服务更新需要按项目指南重启后验收，不以测试入口代替旧数据迁移验收。

Mac/WSL源码同步需额外排除`data/unified`、`credentials`、`.wrangler`、`.dev.vars*`、`.superpowers`和浏览器测试缓存；这些内容仅留在运行端。当前`acmcoder-v3` Mutagen会话已保留原双向安全配置并补充这些排除，避免学习数据库和设备凭据随源码回传。

## 统一发行工作流

`prepare-unified-candidate.yml` 仅手动构建候选源码、插件 ZIP 和校验和，上传为 Actions artifact，不发布镜像或更改网站。`publish-images.yml` 在完整稳定版验收、许可证和版本校验通过后才发布 `v版本` / `sha-提交` 镜像；固定源码提交写入 app 的 version.json，两个架构的实际 digest 作为 artifact 保存。不会自动更改 `latest`。所有端的公开产物关联齐全后再单独提升稳定渠道，不能让候选版或半次失败的镜像发布影响旧用户。当前 RC 的正式发行检查会因尚未完成的验收而拒绝发布。

工作流配置依据：[Docker metadata-action flavor](https://github.com/docker/metadata-action#flavor-input)、[GitHub Actions artifacts](https://docs.github.com/en/actions/how-tos/store-and-share-data)。流程存在不代表这些镜像已经公开发布。

网站AI转发支持阿里云北京工作空间的OpenAI接口：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，WorkspaceId须为ws-开头的工作空间ID。仅此官方主机模式、HTTPS默认端口及完整路径可用，不接受任意主机、其他路径或Token Plan接口。依据[阿里云Base URL说明](https://help.aliyun.com/zh/model-studio/base-url)；实际提供商调用及受限地址回归已通过，三端真实界面验收仍单独记录。
