# 商店品牌素材

源文件采用项目蓝紫渐变、玻璃卡片及代码括号/星形标记。素材不是实际产品截图，不替代商店要求的真实扩展使用画面。

- 共享图标源：`shared/ui/brand-mark.svg`。
- 宣传图源：`assets/store/promo-small.svg`，构建时插入共享图标。
- WSL 项目目录执行 `npm ci --ignore-scripts` 后运行 `npm run build:store-assets`。
- 输出在忽略的 `dist/store-assets`：16/32/48/128 像素 PNG、440×280 宣传 PNG、合成 SVG 和摘要清单。
- 扩展构建自动生成 `icons` 并由 manifest 引用。128 像素图标保留每边 16 像素透明边距；工具栏的小图减少留白。

渲染器固定为 `@resvg/resvg-js@2.6.2`，无系统字体、外部图片或联网渲染依赖。清单记录工具版本、源 SVG 和生成 PNG 的 SHA256；构建资源也受 npm 锁文件约束。生成 PNG 不随手复制回源码以避免两套来源。

真实截图须来自同一固定源码的安装包：LeetCode侧栏练习、题库、今日安排、重写对照和设置。至少一张1280×800或640×400，使用非敏感演示数据，不展示Key/授权值。rc.6/89dfab9已在真实Chrome for Testing同ID升级后捕获五张，保留2400×1500原始JPEG，等比缩为1280×800 PNG；转换脚本及原始/输出摘要在`dist/releases/4.0.0-rc.6/store-screenshots/`。品牌清单仍是构建时收据，不改写为实装证据。实际检查见`docs/releases/evidence/rc6-extension-acceptance.json`，当前分发状态见`docs/extension-store-listing.md`；截图准备不代表上架或审核已经完成。

2026-10-02：rc.14/5adac6a已补五张当前原生实装截图；2820×1988整窗JPEG等比缩到1280×800并加中性侧边距，不裁切或替换内容。独立截图清单与转换脚本在`dist/releases/4.0.0-rc.14/store-screenshots/`，事实摘要为`docs/releases/evidence/rc14-native-extension-2026-10-02.json`，公开审核材料在rc.14 Release。商店尚未提交。

2026-10-02正式版商店推进：v4.0.0/1e141a7已重新捕获五张实际插件画面，原生窗口2126×1500，使用锁定resvg2.6.2按底对齐1280×800满幅裁切/等比缩小，不新增边距或替换内容。原整窗JPEG及源/输出摘要继续保留。此前rc.14带边距截图与Chrome官方“no padding/full bleed”要求不符，不用于新提交。正式安装ZIP保持原SHA，16/32/48/128图标直接从该ZIP提取。当前Google开发者后台要求重新验证身份，商店条目与注册状态未知；资料包和真实截图不代表已经提交或上架。收据见`docs/releases/evidence/v4-store-preparation-2026-10-02.json`。
