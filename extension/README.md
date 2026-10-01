# ACMCoder 统一插件预览

候选构建包包含 Python 和 C++17 全部运行资源，rc.5 两种语言的真实离线运行已验收。rc.6 修正数学上标和完整样例导入。解压发行ZIP后在 Chrome/Edge 的扩展管理页开启开发者模式，加载包中的目录（包含 manifest.json 的目录）。打开 LeetCode 题目后点击 ACMCoder 图标，再点击“读取当前 LeetCode 题目”。基础练习无需本地服务、网站或登录。

源码开发必须先执行 `node scripts/build-clients.mjs extension`，加载生成的 `dist/extension`；不要直接加载源码 `extension/`。构建会把共享题面转换规则打包成经典 content-script，并加入固定运行资源、图标和版本元数据，不需要扩展从网页加载模块。

你的草稿、重写记录和题库保存在插件内。设置中可以导出/合并恢复备份。卸载前先导出。升级请更新相同安装目录中的完整文件并重新加载，旧学习数据会保留。插件商店自动更新尚未发布。

设置里的原版界面仍支持连接本地服务和 Java/C++；统一独立运行器支持 Python/C++17。同浏览器匿名接续已可使用：练习页点击“在网站继续”，目标确认导入；网站也可以反向在插件继续。接续目标当前为独立预览站，账号设备独立授权已接入，第二个真实 GitHub 账号验收仍待完成。

Python 许可证见 licenses/，版本与摘要见 vendor/python/manifest.json；C++ 来源、资源摘要与限制见 vendor/cpp/manifest.json，许可证见 vendor/cpp/licenses/。
