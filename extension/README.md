# ACMCoder 统一插件预览

rc.4 构建包包含 Python 和 C++17 全部运行资源；真实离线 C++ 实装还在验收，公开 rc.3 包仍只有 Python。解压后在 Chrome/Edge 的扩展管理页开启开发者模式，加载此目录（包含 manifest.json 的目录）。打开 LeetCode 题目后点击 ACMCoder 图标，再点击“读取当前 LeetCode 题目”。基本 Python 练习无需本地服务、网站或登录。

你的草稿、重写记录和题库保存在插件内。设置中可以导出/合并恢复备份。卸载前先导出。升级请更新相同安装目录中的完整文件并重新加载，旧学习数据会保留。插件商店自动更新尚未发布。

设置里的原版界面仍支持连接本地服务和 Java/C++；rc.4 源码的统一独立运行器支持 Python/C++17，公开 rc.3 当前支持 Python。同浏览器匿名接续已可使用：练习页点击“在网站继续”，目标确认导入；网站也可以反向在插件继续。接续目标当前为独立预览站，账号设备独立授权已接入，第二个真实 GitHub 账号验收仍待完成。

Python 许可证见 licenses/，版本与摘要见 vendor/python/manifest.json；C++ 来源、资源摘要与限制见 vendor/cpp/manifest.json，许可证见 vendor/cpp/licenses/。
