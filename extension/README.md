# ACMCoder 统一插件

统一正式版 v4.1.0 自带离线 Python、C++17 和 Java 8。解压正式发行ZIP，在 Chrome/Edge 扩展管理页启用开发者模式，加载包含 manifest.json 的固定目录。源码开发先执行 `node scripts/build-clients.mjs extension`，加载生成的 `dist/extension`，不要直接加载源码目录。基础练习无需本地服务、网站或登录。

日常 Chrome 的真实账号、AI 与网站同步已验收。草稿、题库、重写和历史保存在插件内，可导出或合并恢复备份。更新同一安装目录后重新加载，保留旧学习数据；卸载或清除数据前先导出。商店自动更新尚未发布。

Java 为 Java 8，编译时保持侧栏可见。本地原版入口保留原生工具链。完整安装、同步、API Key 与运行限制见 [插件说明](../docs/edge-extension.md) 和 [离线运行说明](../docs/extension-runtime.md)。各运行资源摘要和许可见随包 vendor 目录；Java对应源码随正式发行提供。
