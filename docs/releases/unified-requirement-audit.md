# 原始18节点需求与证据核对

核对日期：2026-10-02。原范围以[总计划](../superpowers/plans/2026-09-30-unified-product-roadmap.md)及三份子计划为准；功能检查表的12项不是18节点的替代。此表记录可证明的范围；没有证据的动作保持待验，不以测试数量推断产品完成。

“已有证据”表示对应实现、测试及已记录真实路径可复用，不表示本轮重新做了所有检查。2026-10-02最终补验完成：18/18节点具有实现及对应验收证据；12项功能门槛全部通过。以下保留真实范围和已约定退路，商店未上架、Java浏览器未交付、arm64仅发布清单，不能按未实测范围扩大结论。

| 节点 | 要求与当前实现 | 可核查证据 | 结论及剩余动作 |
| --- | --- | --- | --- |
| W0 | 保留旧分支、未提交文件、数据；登记Mac/WSL运行映射 | delivery-log的W0；原checkpoint；本轮私有repository.bundle、源码归档及未提交补丁 | 已有证据；不将无关修改纳入发行 |
| W1 | RecordV3、语言独立草稿、不可变快照、事务/CAS/去重、容量拒绝而不清旧记录、兼容旧数据 | shared/records.js、cloudflare/lib/records.js；unified-records、cloudflare-backup测试；日志W1及5416774历史里程碑 | 已有证据；101条及31天以上保存/备份不是最近N条列表 |
| W2 | IndexedDB自动保存、恢复日志、切题归属、普通退出保留重写、结束/放弃保留原历史、guest隔离 | unified-practice.test.js；日志W2–W5；rc6/rc11扩展快照及rc12原代码输入保留收据 | 已有证据；系统断电前尚未落盘的键入不作保证 |
| W3 | 实际Python执行、取消/超时/输出上限、旧run回包隔离、样例比对、导入来源/原文/去重 | unified-runner/import、cloudflare-practice、extension-runner测试；日志真实公网Python与E1/E2；rc6-extension-acceptance.json三样例及题面保真 | 已有证据；Cloudflare直接读LC受阻，已交付插件捕获/粘贴退路，不能宣称云抓取成功 |
| W4 | 今日/题库/练习/设置、玻璃外观/主题、搜索/归档、可选复习、时区日历 | shared/ui/workspace.js/CSS；rc11/rc12-layout收据；新增unified-workspace.test.js直接调用实际UI事件，7个午夜/DST/跨年场景及换时区、归档恢复/完成无快照 | 主要路径已有证据；新增9项为DOM壳+实际IndexedDB测试；rc13另补实际IAB网站1440×900/1280×800、Tab、已提交中文文本、刷新、重写/明暗主题/减弱动态回归；OS输入法composition未单独演练 |
| W5 | 可恢复归档、彻底删除关联范围/墓碑、V1/V2/V3幂等恢复、冲突预览、完整一致备份、排除凭据 | unified-data-lifecycle/backup、cloudflare-backup测试；cloud-account-backup-2026-10-01.json；backup-ui-concurrency-2026-10-02.json | 已有证据；并发UI收据明确延迟事务完成通知的仪器范围，持久消息203条也已实测完整导出 |
| W6 | 开放匿名练习、无邀请登录、身份由会话确定、免费容量/超额本地保留 | cloudflare-api/device-auth测试；真实OAuth日志；two-real-accounts-2026-10-01.json | 已有证据；真实两账号同ID异内容隔离，不用同账号多窗口代替 |
| E1 | Python及资源随包、无扩展授权的沙箱、加载/取消/恢复、离线执行 | extension-runner.test.js；日志E1/E2真实离线冷启动与取消；打包摘要/许可 | 已有证据；rc14公开下载ZIP新目录实装及Python自测通过 |
| E2 | 真实LC cn/com捕获、SPA/过期保护、360/480侧栏、匿名练习/恢复/重写、升级不丢数据 | extension/practice测试；日志E1/E2及rc6；rc6-extension-acceptance.json；rc11/rc12同ID更新 | 已有证据；商店自动更新尚未发生，开发模式升级不得冒充商店升级 |
| E3 | 显式匿名双向接续、nonce/origin/重放保护、冲突保留双方、网站关闭后插件继续 | extension-handoff.test.js；日志E3真实插件→HTTPS→插件、URL清理、离线继续 | 已有证据；不是匿名自动跨设备同步 |
| S1 | PKCE/设备批准、轮换令牌、可信凭据区、关闭网站可同步、撤销不丢草稿 | device-auth/local-cloud-auth测试；日志S1/S2/S3实装插件及本地授权/撤销；后续真实GitHub本地接续 | 已补验：rc14新ZIP未知ID走真实GitHub设备批准，双向同步与实际撤销通过；撤销前后17条记录精确保留；见rc14-native-extension收据。关闭网站路径的早期收据与本轮真实授权范围分别记录 |
| S2 | 事务outbox、revision冲突、退避、配额保留、退出namespace、删除不复活、账号删除/设备失效 | unified-sync/records/device-auth测试；真实本地/网站冲突另存日志；真实双账号收据；真实D1墓碑演练日志 | 已补验：真实网站独立无痕空间仅该标签页断网，插件在线删除新验收题；重连不复活原ID，冲突另存新ID保留离线代码/输入及历史，两端一致、既有14条记录未变。删除级联产生的两条空冲突需要手动保留云端；见rc14-native-extension收据 |
| S3 | 文件journal/fsync/rename、旧目录迁移、三语言、默认离线、独立凭据卷、统一界面/同步 | local-unified-store/api、docker-deployment测试；日志S3；stable-upgrade-verification-2026-10-01.json | 已有证据；用户43117后端仍rc9，静态rc12；rc14同版本公开Docker新安装/升级/重启/回退已通过，不能据此声称用户常驻服务已激活rc14 |
| A1 | 用户自由问答、不改代码、取消/错误恢复/去重、按题对话长期保存、上下文截取不清历史、私有Key、可选加密/host权限 | unified-ai/credential-vault/assist测试；真实vault解锁日志；ai-{website,extension,local}-ui收据及local-http-client收据 | 已有证据：真实提供商三端42/取消/404恢复、代码输入保留；不宣称任意提供商或协议均兼容 |
| A2 | 已存/目录优先、真实读取才验证、失败保留输入、原创明确标记、预览一次导入、不自动改代码 | ai-import/unified-import/leetcode-question测试；ai-original-finder-ui-2026-10-01.json；真实本地二分原题及rc6插件来源 | 已有证据；网站直接LC抓取失败准确保留退路，三组原创样例实际运行通过 |
| L1 | 每语言最多两候选、许可证/新代码编译/标准库/UTF-8/限额/取消/重复运行；网站及离线插件分别判定 | experiments/browser-languages及evidence；browser-language-support.md；cpp-product-public/extension-2026-10-01.json | 已有证据：网站/插件Python、C++17；Java浏览器未通过且不交付，本地原生Java保留 |
| R1 | 根版本/同commit产物、兼容协议、3.0.4升级、MIT/第三方许可/隐私、ZIP/源码/双架构镜像 | release checker/package脚本；release测试；LICENSE/THIRD_PARTY_NOTICES；真实stable-upgrade收据 | 候选分发完成：rc14固定5adac6a源码/ZIP/网站/GHCR两镜像关联，393/393、匿名下载/拉取、amd64执行、新安装/升级/回退及备份通过；latest稳定3.0.4保留，未自动提升稳定频道 |
| R2 | 原计划逐项收口、固定源码全量/构建/烟测、网站回退、公开Release/GHCR、最终实装截图/商店材料/上手 | 本表、delivery-log、各版本acceptance收据；rc6真实截图保留 | 验收与材料完成：公开源码/Docker首次运行、升级/重启/109条记录/备份恢复/回退通过；网站1440/1280回归已补；rc14插件新安装/同ID升级/回退/完整浏览器重启/21条内容保留及五张当前截图通过；商店文案/权限/隐私/流程/图片齐备，可安装未上架 |

## 最终交付范围

1. 原18节点逐项有实现与真实路径/必要测试证据；本轮收据为[rc14插件实装](evidence/rc14-native-extension-2026-10-02.json)。前序未受修改影响的真实AI、C++、两账号、备份及旧安装证据复用，不重新计作本轮动作。
2. rc14/5adac6a公开源码、插件ZIP、同commit网站和GHCR app/runner已关联。完整393项、匿名下载/拉取、空数据Compose、rc13→rc14→重启→回退→rc14共109条记录及104份历史保留通过；公开runner三语言实际执行。见[分发收据](evidence/rc14-public-distribution-2026-10-02.json)。
3. 公开ZIP在新目录真实安装并产生新ID；真实GitHub设备批准、Python输出42、双向草稿同步、撤销后17条记录精确保留。旧插件在同目录/同ID rc12→rc14→rc12→rc14，每次21条记录精确相等；完整浏览器退出/重启后内容、引用、ID和revision一致，当前草稿保存时间更新。
4. 真实网站独立无痕空间通过原生DevTools Offline断开该标签页，插件保持在线。离线编辑后，另一端按人类确认删除仅新题/草稿/自测；恢复网络后原ID未复活。实际冲突另存新题，离线代码/输入和重映射历史到两端，既有14条记录未变。未注入存储、Cookie或模拟会话。原题已删除，新副本留作验收记录。
5. 当前rc14插件五张真实截图、商店文案、权限理由、隐私与审核员流程已齐备。截图保留原生浏览器上下文，整窗等比缩放并加中性侧边距到1280×800，无裁切或替换。商店身份、条款、登记费及审核是外部条件，交付可安装ZIP与材料，不冒称上架。

## 已记录边界

- 删除级联后插件会显示两条空的draft/run本地删除与远端墓碑冲突；本轮通过实际“保留云端”完成处理。数据安全路径通过，但这一操作仍可简化。
- 浏览器Java未通过，已按原计划退路交付网站/插件Python+C++17，本地原生Java保留。
- 两镜像均发布amd64/arm64清单；实际执行在amd64。未重复宣称arm64硬件验收。
- 用户43117常驻服务保留此前后端rc9/静态rc12；本轮新版本地/Docker验收在隔离目录，公开产品版本统一，不自动改动用户旧安装。
- 候选包与旧稳定3.0.4/latest并存；本次三个目标不包含商店提交或自动提升稳定频道。

锁屏和未知插件ID曾是实际阻塞：rc13未知ID在公网返回403/unregistered_extension，rc14增加明确设备批准，并在本轮新安装真实GitHub路径验收。早期锁屏收据保留在分发日志；本轮Mac解锁后完成原生补验，旧收据不改写成当时已完成。


## 正式版交付补充 · 2026-10-02

用户授权后已发布v4.0.0，固定发行源码1e141a7。395/395与完整三端/Pages构建、Docker烟测通过；公网Git连接部署成功，Python/C++实际自测8通过。源码/插件公开匿名下载摘要、ZIP CRC、归档commit和根版本一致。两镜像amd64/arm64关联到同commit，独立提升latest流程成功，GitHub latest为v4.0.0，默认源码分支改为codex/unified-product，旧v3分支保留。

前述rc14删除级联产生的两条空冲突现已修复：仅双方墓碑自动确认，并清理旧已持久化的空冲突；真实离线编辑继续保留，相关36项回归通过。原插件升级后22条内容/引用相同；用户常驻服务重启后13条原内容/引用相同，Python实际输出42。公开Docker镜像在13条原数据的独立副本上升级和重启，三语言输出42且原内容/引用不变；只验证amd64执行，未删除或覆盖用户活跃数据。

题库操作按钮在实际原插件桌面保持完整文字，共享网页360像素测试页面宽度仍为360，按钮为单行；设置复选框宽度已修复。rc14包、固定部署、旧镜像、旧界面和升级前数据备份保留。此前各条历史证据的RC标识继续有效，不回写成v4执行。最终收据见evidence/v4-stable-2026-10-02.json。
