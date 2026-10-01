# 商店品牌素材

源文件采用项目蓝紫渐变、玻璃卡片及代码括号/星形标记。素材不是实际产品截图，不替代商店要求的真实扩展使用画面。

- 共享图标源：`shared/ui/brand-mark.svg`。
- 宣传图源：`assets/store/promo-small.svg`，构建时插入共享图标。
- WSL 项目目录执行 `npm ci --ignore-scripts` 后运行 `npm run build:store-assets`。
- 输出在忽略的 `dist/store-assets`：16/32/48/128 像素 PNG、440×280 宣传 PNG、合成 SVG 和摘要清单。
- 扩展构建自动生成 `icons` 并由 manifest 引用。128 像素图标保留每边 16 像素透明边距；工具栏的小图减少留白。

渲染器固定为 `@resvg/resvg-js@2.6.2`，无系统字体、外部图片或联网渲染依赖。清单记录工具版本、源 SVG 和生成 PNG 的 SHA256；构建资源也受 npm 锁文件约束。生成 PNG 不随手复制回源码以避免两套来源。

真实截图须来自同一最终提交的安装包：LeetCode 侧栏练习、题库、今日安排、重写对照和设置。至少一张 1280×800 或 640×400，使用非敏感演示数据，不展示 Key/授权值。当前状态见 `docs/extension-store-listing.md`；生成品牌素材不代表截图、上架或审核已经完成。
