# 升级、备份与恢复

统一正式版为 **4.0.0**。[正式Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.0.0)提供源码、生成插件ZIP、`SHA256SUMS` 与 `release-manifest.json`。先核对校验和，再按清单确认同一版本、源码commit、网站与镜像；不要使用不同源码而手工填写发行commit。

rc.14固定源码5adac6a、[旧Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.0.0-rc.14)与 https://591372c0.acmcoder-unified-preview.pages.dev/ 继续保留。原rc13/rc14升级与回退记录见交付日志及对应收据，不把旧候选验收改名为正式版验收。

## 升级前

从原版导出学习备份，并保留旧安装目录、旧镜像与数据目录。备份不等于同步：云端删除会传播，而独立备份仍可用于新ID恢复。不要在升级前卸载旧插件、清除浏览器网站数据或覆盖 Docker 数据卷。

## 网站

网站使用同一域名、同一浏览器存储空间自动接续。不会自动强制刷新正在编写的页面；先确认已保存，再刷新查看新版。V1/V2导出可在设置中合并恢复；旧历史不会按100条或30天截断。选择备份文件后先查看数量/冲突预览，取消不会写入，确认时再次检查当前内容。恢复冲突进入待处理区，原版本保留，可另存题目及历史。已经彻底删除的题目从旧备份恢复时使用新ID，旧设备不能复活原ID。

账号切换使用独立空间：退出回到匿名空间，账号副本仍在本机。不同设备匿名记录需要主动选择合并，不自动上传。

## 插件

候选ZIP解压到固定目录。Chrome打开 chrome://extensions/，Edge打开 edge://extensions/，启用 Developer mode，Load unpacked 选择解压目录中的 manifest.json 所在目录。新版必须使用生成包 dist/extension；源码 extension/ 不含随包运行资源。

升级时先导出备份，再更新原解压目录中的完整文件，点击扩展管理页重新加载。保留原安装路径和扩展身份，切勿卸载后再装来代替升级；不同路径可能产生不同ID和存储。旧语言草稿一次迁移，原键保留。授权回调需登记安装ID；未登记ID仍能匿名离线练习。

商店版以后由商店更新，审核期间网站通过协议兼容保留旧客户端。商店版本号由根版本派生：rc.N映射major.minor.patch.N，正式版映射major.minor.patch.65535，显示版本仍为原SemVer，避免正式版数字小于候选版而不能升级。该字段规则参考 [Chrome官方版本说明](https://developer.chrome.com/docs/extensions/reference/manifest/version)。

## 本地与 Docker

保留 data/memory、data/recommendation、data/unified。credentials单独保留并限制本机权限，切勿放入学习备份、Git或源码同步。更新源码时保持既有运行数据目录；新本地版会迁移旧题面文件，保留原文件与迁移副本。浏览器旧草稿在当前浏览器首次进入时迁移，不删除原键。

旧AI接口首次读取配置时，将 settings.json 中的明文Key迁入独立凭据文件；设置页、问答和今日计划沿用该配置。默认凭据目录是 ~/.local/share/acmcoder/credentials，可用 ACMCODER_CREDENTIAL_DIR 指定，Docker Compose 已使用独立 credentials 挂载。凭据文件0600、新建目录0700，先原子写入并确认持久化，再移除普通设置文件中的Key；失败保留原配置，下次读取重试。定制 settingsFile 的调用方应明确指定独立 credentialDir；测试默认放在该临时目录的 .credentials 子目录。统一练习页仍需要在其自带API设置里自行配置或解锁Key，不会自动将旧服务器Key返回浏览器或同步。

Docker保持原数据挂载路径，在v4.0.0源码目录运行：

```sh
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml pull
docker compose -f docker-compose.prebuilt.yml -f docker-compose.release.yml up -d
```

该覆盖文件锁定 `ghcr.io/pygmalion03/acmcoder-app:v4.0.0`，与四个既有数据目录共用。`docker-compose.candidate.yml`仍锁定rc.14，供保留的候选环境使用。回退时先保留升级后的内容，另挂升级前独立副本，再启动旧版本镜像；不要删除新记录或修改迁移表来回滚。

本地源码与生成静态界面需成组更新；常驻 `acmcoder-v3.service` 需在用户自己的Terminal完成sudo重启。保留旧 `dist/local-web` 目录与数据副本，实际激活和数据核对结果另记交付日志，不以文件版本代替运行进程验收。

AI对话每页最多显示20条，在固定高度区域滚动；完整历史、备份与同步不按20条截断。更早的对话、更新的对话和回到最新均不会改写记录或问题输入。

正式版会在同步时清理双方均已删除的空冲突；本地仍有离线编辑时继续保留内容冲突，用户可导出或另存新题，原已删除ID不会复活。

## 当前实际验收

v4.0.0常驻服务已由用户完成sudo重启；13条本机原内容与引用不变。原插件同ID更新后22条原内容与引用不变。公开Docker镜像用独立原数据副本升级、重启，13条原内容与引用不变，三语言均输出42。实际使用Linux数据所有者UID:GID 1000:1000运行受限容器，避免root在cap_drop ALL下不能写入既有0700目录；不用放宽活跃目录权限。其他宿主环境须使用其实际所有者/ACL，不机械套用1000。rc14固定包及旧界面、升级前独立副本保留，回退不删除升级后的记录。完整收据见[正式验收](releases/evidence/v4-stable-2026-10-02.json)。
