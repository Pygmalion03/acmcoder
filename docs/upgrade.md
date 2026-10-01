# 升级、备份与恢复

当前公开统一候选版为 **4.0.0-rc.14**，固定源码 **5adac6ab53d55087993004f443a06d5b60d19c8e**。网站、插件ZIP及GHCR双架构镜像在[候选Release](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.0.0-rc.14)关联；稳定3.0.4/latest不变。以下原rc13迁移命令与收据按历史版本保留；rc14升级补充见文末，使用对应源码包的候选Compose文件。

先核对随包 `SHA256SUMS`：插件ZIP `06851c798ab27e08e825f2b7a7042b4820bdf003ccf3b9f762de69e45d0a9bc8`，源码包 `fd8b1ba3c0e998f25848568f1c008291c654cb2db32c9baadf252ee5d38b3c65`。固定网站为 https://18a7b08e.acmcoder-unified-preview.pages.dev/ 。空数据首次运行及公开3.0.4→rc13→重启→升级前副本回退3.0.4→回到rc13已通过；109条V3记录逐项相等。证据见[rc13收据](releases/evidence/rc13-public-distribution-2026-10-02.json)。最终插件新安装/回退和真实设备删除重连仍待完成，不把Docker演练代替它们。

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

Docker保持原数据挂载路径；不用新空卷替换旧卷。从上述已核对摘要的 **rc.13源码包** 解压出的独立目录构建候选镜像，命令为：

```sh
docker build -f Dockerfile.app -t acmcoder-app:4.0.0-rc.13 --build-arg ACMCODER_BUILD_COMMIT=e844d9e5a1810db27b8d601e3763f24727fc9de7 .
```

准备好原数据导出后停止旧容器，再使用相同数据挂载启动新镜像。需要回退时先保留升级后的记录，使用旧镜像及升级前独立备份；不要删除新记录或降级迁移表来“回滚”。协议不兼容时停止云写入，先升级客户端，设备草稿与队列保留。

上述固定标识只适用于该源码包，不可对不同分支源码强行填入e844d9e冒充同一构建。本项目的构建/运行仍在登记的WSL环境执行；不要在运行镜像里改Git工作树。当前工作区与常驻服务的静态构建须作为同一批升级，不要仅重启旧进程就假定三端版本一致。

当前公开镜像为 `ghcr.io/pygmalion03/acmcoder-app:v4.0.0-rc.13`，registry digest `sha256:24491ceb4a02a0c9a5448e9e5a532ba7497be3d62f9d38f0d45ca1dfc9ec8970`；runner digest和同版本Compose命令见[rc13说明](releases/v4.0.0-rc.13.md)。升级后的数据保留在原挂载目录；演练回退时另挂升级前副本，升级后的109条记录独立保留，回到rc13后完整读取。实际执行验证为linux/amd64。

正式WSL服务 acmcoder-v3.service 需要 sudo 重启才会使用新服务代码。用户现有后端已实机升级并验收rc.9/3749604：5个旧题目导出、2条统计及原始文件保持，Python自测8通过，10条学习记录导出恢复逐项相等；升级前后Mac/WSL备份和旧静态目录保留。本轮只将静态界面更新为rc.12/f3c7078，不涉及服务端修改，因此没有重启后端；旧界面另存dist/local-web-before-rc12-f3c7078。之前的隔离3.0.4同卷升级、合成旧Key迁移及容器重启证据继续保留。

AI对话每页最多显示20条，在固定高度的区域内滚动；这只是显示方式，完整历史、备份与同步不按20条截断。更早的对话、更新的对话和回到最新均不会改写记录或问题输入。


## rc14公开候选补充

当前候选[rc14](https://github.com/Pygmalion03/acmcoder/releases/tag/v4.0.0-rc.14)固定5adac6a；下载本版源码，Compose候选覆盖文件锁定rc14镜像，沿用四个数据路径。公开源码/ZIP与两镜像已匿名下载/拉取。隔离数据中rc13→rc14→重启→升级前副本回退rc13→回到rc14，109条记录、104份历史及未完成重写精确保留。回退挂升级前副本，升级后的目录继续保留。旧3.0.4→rc13迁移演练仍有效，不能把rc13旧收据更名成rc14。

本版新目录插件账号连接修正已发布但仍待真实安装/授权/撤销与更新回退；旧已安装插件不会仅因Release更新就自动升级。商店未上架，保持原目录手动更新并先导出备份。完整证据见[rc14收据](releases/evidence/rc14-public-distribution-2026-10-02.json)。
