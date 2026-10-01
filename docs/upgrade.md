# 升级、备份与恢复

当前统一候选版为 **4.0.0-rc.8**，网站、插件ZIP及已验收的本地候选镜像对应固定源码 **e38df559db3f1e16c19dd81bed2b00febf68ce75**。稳定3.0.4及原有数据应先保留。候选包不是商店自动更新或正式稳定发布；后续文档提交不改变这个已保存候选的源码标识。

本机已保存的候选目录为 `dist/releases/4.0.0-rc.8/`。先核对 `SHA256SUMS`：插件ZIP为 `23a3b7de340cc857e2d365ff6ea41b85c505af150a2ae9781c84ec0c1162f4bf`，源码包为 `9ffd5ae010a0fc735e9753cf207097f992a3408c73a6f76634f25b0f65fbf3f2`。公网预览为 https://acmcoder-unified-preview.pages.dev/ ，固定部署为 https://4f2af202.acmcoder-unified-preview.pages.dev/ 。当前候选尚未发布稳定GitHub Release/GHCR；没有可直接拉取的正式4.0.0镜像。

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

Docker保持原数据挂载路径；不用新空卷替换旧卷。从上述已核对摘要的 **rc.8源码包** 解压出的独立目录构建候选镜像，命令为：

```sh
docker build -f Dockerfile.app -t acmcoder-app:4.0.0-rc.8 --build-arg ACMCODER_BUILD_COMMIT=e38df559db3f1e16c19dd81bed2b00febf68ce75 .
```

准备好原数据导出后停止旧容器，再使用相同数据挂载启动新镜像。需要回退时先保留升级后的记录，使用旧镜像及升级前独立备份；不要删除新记录或降级迁移表来“回滚”。协议不兼容时停止云写入，先升级客户端，设备草稿与队列保留。

上述固定标识只适用于该源码包，不可对不同分支源码强行填入e38df55冒充同一构建。本项目的构建/运行仍在登记的WSL环境执行；不要在运行镜像里改Git工作树。当前工作区与常驻服务的静态构建须作为同一批升级，不要仅重启旧进程就假定三端版本一致。

实际已验收镜像为 `acmcoder-app:unified-rc8-e38df55`，本地image ID `sha256:58c03097b17c826ed012aa1de916682fe58e2ad4c3296b1c74270e05785041e1`。它保留了隔离测试卷的原草稿；这是本地linux/amd64候选镜像，不是GHCR registry digest，也不是用户稳定安装升级完成的证据。

正式WSL服务 acmcoder-v3.service 需要 sudo 重启才会使用新服务代码。用户现有服务实机升级尚未验收。源码25814b7的隔离真实3.0.4镜像同卷升级已验证题面/样例、原文件与旧自测次数保留；次数已迁入新版progress、随完整备份恢复，题库和练习可见，重启不会重复累计。ce34f0e又验证合成旧Key迁移与容器重启后实际HTTP问答。rc.2候选产物与公开预览固定源码041e198，已包含这些修复；先前12b5217的rc.1固定部署和包保留。隔离演练、新Docker卷重建和预览更新不能代替用户旧服务及旧卷完整升级。
