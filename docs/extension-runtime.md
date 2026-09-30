# 统一插件预览：离线 Python

统一插件候选版使用共享题库、今日、练习、草稿、重写、归档和备份界面。Python 默认在插件内运行，网站和本地服务均可关闭。Java/C++ 暂保留在旧本地侧栏，入口位于设置中的“打开原版界面”。同浏览器匿名接续和可选设备账号连接已完成真实开发安装验证；插件商店发布尚未完成。

## 构建与安装

在开发运行环境中执行：

```sh
npm ci --ignore-scripts
node scripts/build-clients.mjs extension
```

生成的 `dist/extension/` 是完整插件，包含固定版本 Python 运行资源。Chrome/Edge 扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，选这个目录。源码 `extension/` 不含生成的 Python 二进制和共享文件，不能直接作为新版安装包。

在 LeetCode cn/com 题目页点击工具栏 ACMCoder 图标，再点“读取当前 LeetCode 题目”。保留题面和原平台样例；用户自行编写 ACM 程序和标准输入。题库的链接导入也支持公开 LeetCode 题目。无法抓取时可以粘贴题面，不会替用户生成伪造原题。

升级时更新原安装目录中的完整文件，再在扩展管理页重新加载。同一个扩展身份下，旧插件的语言草稿仅迁移一次，原键保持不变，API Key 不迁入学习备份。换到另一个解压路径可能被浏览器视作新插件；先保留旧插件中的数据。本版本没有商店自动升级。

## 执行隔离

- Pyodide 固定0.29.3；npm包摘要锁定在package-lock，构建再次核对版本/摘要，并为五个运行文件生成SHA-256清单。完整资源约12,284,602字节，随包分发，不依赖CDN。
- 主界面读取固定文件并校验后，只向沙箱传公开运行字节、代码和stdin。沙箱页面是opaque origin，不能读取主界面、扩展存储和浏览器API。
- 每次运行在独立Worker内初始化Python。资源请求由固定内存映射提供，沙箱CSP禁止网络连接；没有任意URL代理。取消/5秒运行超时会终止Worker。输出上限32,768字符。
- 窗口消息检查父窗口、扩展来源、随机nonce和当前runId；旧回包不影响新任务。用户程序不收到账户凭据或期望输出。
- MPL-2.0与CPython许可证随包位于licenses/，第三方运行文件未经修改。

## 真实验证

使用Mac上的Chrome for Testing151.0.7922.34加载完整生成包；Chrome正式版不支持测试所需的命令行加载开关，因此没有用无效加载结果宣称成功。

已验证断网中文多行输入、首次启动约3.2–3.6秒、三个连续运行、无限循环取消约41–52毫秒；用户程序无法访问chrome/parent，网络请求拒绝。已验证360/480px布局、关闭重开未完成重写、结束对照、LeetCode cn/com真实题面捕获及重复导入不覆盖代码。截图保存于开发验证环境，不包含用户记录。

这是开发模式真实运行结果；不代表Chrome Web Store/Edge Add-ons已审核通过。官方政策参考：

- [Sandbox manifest](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)
- [Manifest V3要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/)
- [远程代码要求](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

## 同浏览器匿名接续

练习页点击“在网站继续”，打开独立预览网站并显示题目、代码和记录数量。确认后写入网站匿名空间；已有不同版本时新建副本，原版本仍在。网站的“在插件继续”打开插件工作区确认导入；随后可关掉网站，继续在插件内离线练习，工具栏侧栏使用相同插件数据。

接续仅在主动点击时发生，不要求网站登录、不自动上传账号云端。URL只带随机短期标识，正文暂存在可信扩展会话存储；五分钟失效、只能消费一次，且绑定确切目标标签页和来源。不同浏览器、未安装插件或失效时使用完整备份导入。当前接续目标是 `https://acmcoder-unified-preview.pages.dev`，生产切换随统一版最终发布进行。

## 可选账号连接（开发预览）

插件设置可发起GitHub账号连接，弹出网站确认设备和账号。默认仅保留到浏览器会话；勾选“保持连接”后最长30天，刷新令牌会轮换。匿名练习不会自动合并，需在连接后主动点击合并。网站关闭不影响设备同步；网站设置中的设备列表可撤销，撤销保留插件本机副本和离线运行。

开发安装路径决定未打包插件的ID，授权回调必须登记在预览Pages的`EXTENSION_IDS`（逗号分隔）。当前真实验证ID为`jhnkppkcdcigomaahaoahelfbhmkklhf`，仅对应开发验证安装目录。商店固定ID和公开分发回调将在正式发布阶段配置；不要为了测试改变旧插件身份或覆盖其存储。未登记版本仍能匿名练习和同浏览器接续。

网站自己的GitHub登录需专用OAuth应用：Homepage为预览站域名，callback为`https://acmcoder-unified-preview.pages.dev/api/auth/github/callback`，Pages Production配置`GITHUB_CLIENT_ID`和Secret类型的`GITHUB_CLIENT_SECRET`后重新部署。Codex中的GitHub插件授权用于开发工具，并不会给ACMCoder网站配置登录凭据。不得把真实密钥写进源码、备份或聊天。
