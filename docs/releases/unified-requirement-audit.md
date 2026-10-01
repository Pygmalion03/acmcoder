# 原始18节点需求与证据核对

核对日期：2026-10-02。原范围以[总计划](../superpowers/plans/2026-09-30-unified-product-roadmap.md)及三份子计划为准；功能检查表的12项不是18节点的替代。此表记录可证明的范围；没有证据的动作保持待验，不以测试数量推断产品完成。

“已有证据”表示对应实现、测试及已记录真实路径可复用，不表示本轮重新做了所有检查。“补验/分发中”表示该节点仍有明确未完成项。

| 节点 | 要求与当前实现 | 可核查证据 | 结论及剩余动作 |
| --- | --- | --- | --- |
| W0 | 保留旧分支、未提交文件、数据；登记Mac/WSL运行映射 | delivery-log的W0；原checkpoint；本轮私有repository.bundle、源码归档及未提交补丁 | 已有证据；不将无关修改纳入发行 |
| W1 | RecordV3、语言独立草稿、不可变快照、事务/CAS/去重、容量拒绝而不清旧记录、兼容旧数据 | shared/records.js、cloudflare/lib/records.js；unified-records、cloudflare-backup测试；日志W1及5416774历史里程碑 | 已有证据；101条及31天以上保存/备份不是最近N条列表 |
| W2 | IndexedDB自动保存、恢复日志、切题归属、普通退出保留重写、结束/放弃保留原历史、guest隔离 | unified-practice.test.js；日志W2–W5；rc6/rc11扩展快照及rc12原代码输入保留收据 | 已有证据；系统断电前尚未落盘的键入不作保证 |
| W3 | 实际Python执行、取消/超时/输出上限、旧run回包隔离、样例比对、导入来源/原文/去重 | unified-runner/import、cloudflare-practice、extension-runner测试；日志真实公网Python与E1/E2；rc6-extension-acceptance.json三样例及题面保真 | 已有证据；Cloudflare直接读LC受阻，已交付插件捕获/粘贴退路，不能宣称云抓取成功 |
| W4 | 今日/题库/练习/设置、玻璃外观/主题、搜索/归档、可选复习、时区日历 | shared/ui/workspace.js/CSS；rc11/rc12-layout收据；新增unified-workspace.test.js直接调用实际UI事件，7个午夜/DST/跨年场景及换时区、归档恢复/完成无快照 | 主要路径已有证据；新增9项为DOM壳+实际IndexedDB测试；rc13另补实际IAB网站1440×900/1280×800、Tab、已提交中文文本、刷新、重写/明暗主题/减弱动态回归；OS输入法composition未单独演练 |
| W5 | 可恢复归档、彻底删除关联范围/墓碑、V1/V2/V3幂等恢复、冲突预览、完整一致备份、排除凭据 | unified-data-lifecycle/backup、cloudflare-backup测试；cloud-account-backup-2026-10-01.json；backup-ui-concurrency-2026-10-02.json | 已有证据；并发UI收据明确延迟事务完成通知的仪器范围，持久消息203条也已实测完整导出 |
| W6 | 开放匿名练习、无邀请登录、身份由会话确定、免费容量/超额本地保留 | cloudflare-api/device-auth测试；真实OAuth日志；two-real-accounts-2026-10-01.json | 已有证据；真实两账号同ID异内容隔离，不用同账号多窗口代替 |
| E1 | Python及资源随包、无扩展授权的沙箱、加载/取消/恢复、离线执行 | extension-runner.test.js；日志E1/E2真实离线冷启动与取消；打包摘要/许可 | 已有证据；最终公开下载ZIP仍需新安装回归 |
| E2 | 真实LC cn/com捕获、SPA/过期保护、360/480侧栏、匿名练习/恢复/重写、升级不丢数据 | extension/practice测试；日志E1/E2及rc6；rc6-extension-acceptance.json；rc11/rc12同ID更新 | 已有证据；商店自动更新尚未发生，开发模式升级不得冒充商店升级 |
| E3 | 显式匿名双向接续、nonce/origin/重放保护、冲突保留双方、网站关闭后插件继续 | extension-handoff.test.js；日志E3真实插件→HTTPS→插件、URL清理、离线继续 | 已有证据；不是匿名自动跨设备同步 |
| S1 | PKCE/设备批准、轮换令牌、可信凭据区、关闭网站可同步、撤销不丢草稿 | device-auth/local-cloud-auth测试；日志S1/S2/S3实装插件及本地授权/撤销；后续真实GitHub本地接续 | 补验：早期插件授权联调用了临时测试会话，需最终包确认真实GitHub插件授权/撤销，不将临时会话称作真实OAuth |
| S2 | 事务outbox、revision冲突、退避、配额保留、退出namespace、删除不复活、账号删除/设备失效 | unified-sync/records/device-auth测试；真实本地/网站冲突另存日志；真实双账号收据；真实D1墓碑演练日志 | 补验：真实独立客户端离线编辑→另一端彻底删除→旧端重连这一整条产品路径尚无完整收据；数据库/模拟客户端检查不能替代 |
| S3 | 文件journal/fsync/rename、旧目录迁移、三语言、默认离线、独立凭据卷、统一界面/同步 | local-unified-store/api、docker-deployment测试；日志S3；stable-upgrade-verification-2026-10-01.json | 已有证据；用户43117后端仍rc9，静态rc12；rc13同版本公开Docker新安装/升级/回退已通过，不能据此声称用户常驻服务已激活rc13 |
| A1 | 用户自由问答、不改代码、取消/错误恢复/去重、按题对话长期保存、上下文截取不清历史、私有Key、可选加密/host权限 | unified-ai/credential-vault/assist测试；真实vault解锁日志；ai-{website,extension,local}-ui收据及local-http-client收据 | 已有证据：真实提供商三端42/取消/404恢复、代码输入保留；不宣称任意提供商或协议均兼容 |
| A2 | 已存/目录优先、真实读取才验证、失败保留输入、原创明确标记、预览一次导入、不自动改代码 | ai-import/unified-import/leetcode-question测试；ai-original-finder-ui-2026-10-01.json；真实本地二分原题及rc6插件来源 | 已有证据；网站直接LC抓取失败准确保留退路，三组原创样例实际运行通过 |
| L1 | 每语言最多两候选、许可证/新代码编译/标准库/UTF-8/限额/取消/重复运行；网站及离线插件分别判定 | experiments/browser-languages及evidence；browser-language-support.md；cpp-product-public/extension-2026-10-01.json | 已有证据：网站/插件Python、C++17；Java浏览器未通过且不交付，本地原生Java保留 |
| R1 | 根版本/同commit产物、兼容协议、3.0.4升级、MIT/第三方许可/隐私、ZIP/源码/双架构镜像 | release checker/package脚本；release测试；LICENSE/THIRD_PARTY_NOTICES；真实stable-upgrade收据 | 分发中：公开rc13同commit源码/ZIP/网站及两镜像已关联，384/384、匿名下载/拉取、版本锁定Compose及amd64真实执行已通过；正式版仍待必交付补验；latest仍稳定3.0.4 |
| R2 | 原计划逐项收口、固定源码全量/构建/烟测、网站回退、公开Release/GHCR、最终实装截图/商店材料/上手 | 本表、delivery-log、各版本acceptance收据；rc6真实截图保留 | 分发中：公开源码/Docker首次运行、3.0.4升级/重启/109条记录/备份恢复/回退再升级已通过；网站1440/1280回归已补，插件新安装/升级/回退及当前版五张真实截图仍待完成；可安装未上架 |

## 最终收口的具体待办

1. 补S1真实GitHub插件授权/撤销、S2真实独立客户端离线删除重连证据，仅用新建验收题，保留用户既有记录。
2. rc.13同commit源码/ZIP/校验和/发布说明及两个架构镜像已公开，registry digest、匿名下载与拉取已核对。后续候选保持同样关联，不能覆盖已公开产物。
3. 公开源码及Docker在隔离新目录的首次运行→升级→重启→完整备份比较→回退已完成。插件公开下载产物的新安装、升级/重启、数据保留及回退仍待实装。
4. 最终实装桌面/侧栏回归与当前版本商店截图、权限/隐私/审核流程材料。商店身份、登记费用及审核为外部条件；材料+ZIP可交付，未上架必须如实标明。

完整目标尚未完成。本表将随实际证据更新，不以候选Release、绿测试或发布脚本代替上述动作。

## 公开分发与新用户Docker补充

2026-10-02：rc13/e844d9e公开Release/ZIP/源码/校验和/网站及GHCR两镜像完成关联，完整384项和GitHub构建/烟测通过。无凭据下载源码/ZIP并核对SHA256；无凭据Docker拉取两镜像，registry均含amd64/arm64清单，实际执行验证在amd64。全空Compose首次启动、公开3.0.4→rc13→重启→升级前副本回退3.0.4→rc13恢复全部109条记录及三语言通过。公开runner通过产品适配器三语言执行。收据rc13-public-distribution-2026-10-02.json保留边界。

当前可继续的缺项集中在实装插件授权/撤销、新用户插件安装/回退、最终实装截图及真实离线删除重连。Mac锁屏仅阻止原生插件操作，IAB网站回归已完成；未请求睡眠中的用户解锁或提供秘密。现有数据与旧版本继续保留。

## 新用户插件账号连接缺口

公开rc.13 ZIP没有固定manifest key，解压目录变化会改变未打包扩展ID。账号连接只走登记ID的PKCE；2026-10-02实际公网向未登记ID发起start，返回403/unregistered_extension。这直接影响新用户同步，S1及新安装不能视为完整通过。

rc.14源码新增明确设备批准路径，仅在服务端明确拒绝未登记ID时使用；网络错误不切换授权方式，也不扩大PKCE回调名单。短消息轮询和可信session pending记录允许后台重启/页面刷新后继续；默认不持久保持连接。新增实际设备授权实现和SQLite夹具回归，真实GitHub实装仍待完成。Mac本轮再次确认锁屏，未冒充完成原生验收。
