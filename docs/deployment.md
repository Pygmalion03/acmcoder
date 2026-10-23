# 部署与本地运行

本指南适用于 [v4.2.0](releases/v4.2.0.md)。安装包、源码提交、网站部署与固定镜像的关联以该发行的 `release-manifest.json` 为准。升级已有数据先读[升级与恢复](upgrade.md)。

## 本地源码

准备 Node.js 22+ 和所需语言工具链。Python 使用 Python 3，C++ 需要支持 C++17 的 `g++`，Java 需要 `java` 与 `javac`。

```sh
npm ci --ignore-scripts
node scripts/build-clients.mjs local-web
node bin/acmcoder.js doctor
npm start
```

打开 `http://127.0.0.1:43117`。统一界面使用 `dist/local-web/`，原版界面为 `/legacy.html`。更新源码后重建静态界面并重启服务，避免新前端调用旧服务端接口。完整三端构建使用 `npm run build:clients`，还需 Python 3 和首次下载语言运行资源的网络连接。

统一界面直接使用本机工具链；Docker app 中则使用容器自带工具链。旧界面和 CLI 另保留 Local / Docker runner 选择，不要把旧界面的选择器当作统一工作区必需步骤。

## Docker app

只有 Docker Engine / Docker Desktop 和 Compose v2 也能使用。下载 v4.2.0 源码 ZIP，进入解压目录：

```sh
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml up -d
```

两份配置合用会固定 `ghcr.io/pygmalion03/acmcoder-app:v4.2.0`。只使用 `docker-compose.prebuilt.yml` 则跟随 `latest`；需要可重复安装和回退时使用固定版本。自行构建用：

```sh
docker compose up -d --build
```

app 镜像包含 Node.js、Python 3、g++ 和 JDK 17。宿主机无需安装语言环境，容器也无需访问宿主机 Docker socket。镜像准备好后，基本练习可离线使用；账号同步、外部导题和在线 AI 仍需联网。

Compose 默认绑定 `127.0.0.1:43117`，持久目录如下：

| 宿主目录 | 容器目录 | 内容 |
| --- | --- | --- |
| `data/unified` | `/app/data/unified` | 统一学习记录、同步队列与冲突 |
| `data/memory` | `/app/data/memory` | 原版题面、进度和迁移来源 |
| `data/recommendation` | `/app/data/recommendation` | 原版推荐和安排 |
| `credentials` | `/app/credentials` | 设备授权和旧接口独立凭据 |

保留完整路径，且确保容器运行用户有读写权限。不要把空的 `./data` 整体挂到 `/app/data`，否则会遮住镜像内置题库。使用只读根文件系统、移除 capability 或 NAS ACL 时应按真实数据所有者设置权限，不依赖 root 绕过权限，也不要将凭据目录改成全员可写。

## 数据和连接配置

本地源码默认把统一学习文件写到项目 `data/unified/`，可用 `ACMCODER_UNIFIED_DATA_DIR` 指定独立目录。凭据默认位于 `~/.local/share/acmcoder/credentials/`，可用 `ACMCODER_CREDENTIAL_DIR` 指定；学习备份不包含凭据。文件事务通过恢复 journal、fsync 与原子替换持久化，浏览器关闭后数据仍在。

服务默认只认可 `localhost`、`127.0.0.1` 和 `[::1]`。确需通过自有域名访问时设置 `ACMCODER_TRUSTED_HOSTS=practice.example.test`；多个精确 hostname 用逗号分隔，不接受通配符或 URL。反向代理应保留认可的 Host，`X-Forwarded-Host` 不参与信任判断。仅监听 `0.0.0.0` 不会自动允许其他域名。

自托管云端连接的公开配置在 `shared/deployment-config.js`：`cloudOrigin` 为账号服务的 HTTPS 根地址，`websiteOrigins` 为允许接续的精确网页来源。默认保留既有预览账号入口与正式站来源；不要为已经工作的安装随意换域名。更改后重建三端，让插件权限和接续来源一起更新；切换部署前备份学习数据并退出旧账号，新地址需要重新授权，不会自动搬迁旧云端数据库或凭据。配置文件不应放任何 Secret，Cloudflare 配置见[网站部署](../cloudflare/README.md)。

网站 API 升级到 v4.2.0 时，应先保留 D1 恢复点，再按迁移顺序执行 `0007_record_capacity_repair.sql`。该迁移修复容量统计，保留同步日志与删除标记；将执行结果和网站部署关联一起记录，并核对原有账号数据。新建数据库也需要应用完整迁移序列。

## Docker runner 与 CLI

`Dockerfile` 构建代码运行器，`Dockerfile.app` 构建完整应用。Docker app 不需要额外安装 runner 镜像。

本机 Node 服务或 CLI 需要隔离运行代码时，可单独准备 runner：

```sh
docker build -t acmcoder-runner:local .
node bin/acmcoder.js test reverse-linked-list --lang python --file path/to/main.py --runner docker
```

默认 runner 镜像为 `acmcoder-runner:local`；可用 `ACMCODER_DOCKER_IMAGE` 指定已下载的版本，`ACMCODER_DOCKER_AUTO_BUILD=0` 禁用缺失镜像时自动构建。旧界面 `/legacy.html` 保留对应运行模式选择。统一工作区目前不提供该选择器。

## AI 与离线

统一界面在设置中配置提供商、模型和 Key。Key 默认只在当前页面内存，可选口令加密保存在本机，刷新后解锁；不进入学习备份或同步。本机服务可显式连接回环地址上的本地模型。原版 `/api/assist` 接口保留独立配置，读取旧 `settings.json` 时会将明文 Key 迁到独立凭据文件，不会把旧 Key 回传统一前端。

网站需在设置完成离线资源准备；完整插件包自带运行资源；本机或 Docker 需先装好依赖、界面与工具链。基础练习不需要账号或 AI。详情见[数据与隐私](data-and-privacy.md)。

## 发行链

`prepare-unified-candidate.yml` 构建候选文件并上传 Actions artifact，不发布网站、镜像或 Release。`publish-images.yml` 负责验证并发布 app / runner 的版本镜像，`latest` 通过独立提升步骤更新，不会因推送任意候选标签自动切换。

正式包需要相同产品版本、固定源码提交、干净源码构建及对应验收。修改中的构建标记为 `development / modified`，正式打包检查会拒绝它；仅有相同的 `version.json` commit 字段不能证明源码归档与生成文件相同。发布时把网站部署与两个镜像的不可变 digest 写入最终发行清单，以该清单确认各端关联。
