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

这条路不要求用户本机安装 Node.js、Java、C++ 或 Python。容器里的内置环境已经带了 `python3`、`g++`、`openjdk`，所以页面里选择 `内置环境` 就能运行代码。它不是 Docker runner，而是 app 容器本身的编译运行环境。Compose 只把启动目录中的 `./data/memory` 和 `./data/recommendation` 挂载到容器，因而记忆题目、推荐题库、每日计划、AC 次数和模型设置可以持久化，同时不会让宿主机的空 `./data` 目录遮住镜像内置的 `problems.json`。

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

源码分支可以先于正式 Release 更新。默认 Compose 文件使用 `ghcr.io/pygmalion03/acmcoder-app:latest`；如果需要固定版本，再使用 Release 对应的 tag，例如 `ghcr.io/pygmalion03/acmcoder-app:v3.0.3`。

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
