# ACMCoder 免费网站版

当前可部署里程碑是 M1 浏览器 Python 练习页。Cloudflare Pages Git 集成配置：仓库根目录 `cloudflare`，构建命令留空，输出目录 `public`。独立项目建议名 `acmcoder-web`。不要将该项目接到个人版 `api.pygmalion.top` 或其运行器。

此时 `/api/*` 尚未实现，登录、跨设备同步和远程 Java/C++ 均在页面上标记为未开放。只需 Pages 静态服务，不需要 D1 绑定或密钥。以后加入 Pages Functions 时，入口放在本目录 `functions/`；D1 数据库 ID 应按真实创建结果配置。

## M1 执行边界

主页面在 `public/`，`runner/bridge.html` 通过 `sandbox="allow-scripts"` iframe 加载，获得不透明来源。iframe 中再启动 Blob Web Worker，运行固定版本 Pyodide `0.29.3`。主页面只向 iframe 发送用户输入的 Python 源码、stdin 和随机任务 ID，绝不发送 Cookie、账户资料或私人题库。主页面仅接受当前 iframe window、`null` 来源、匹配 nonce/任务 ID 的结果。运行器 CSP 只准连接固定 Pyodide CDN；Python 所在 Worker 继承该 CSP。停止与超时直接终止 Worker，执行限制 5 秒、加载限制 30 秒、输出上限 32 KiB。CDN 不可用时显示失败并可重试。

静态 `_headers` 对主站和 runner 使用互不重叠的路径，避免 CSP 交叉收紧。Pages 上线后必须实查 `/` 和 `/runner/bridge.html` 的响应头，测试 Python 正常/异常/无限循环停止，并在网络日志中证明 Python 无法请求同站 `/api/*` 且没有请求 NAS 域名。M1 本地测试使用 WSL 临时 HTTP 服务模拟了完全相同的 CSP，尚不等于 Pages 线上验收。

## 免费资源与来源

Cloudflare Pages Free 当前限制每月 500 次构建、每站最多 20,000 个文件、单文件 25 MiB；Pages Functions 请求计入 Workers Free 每日 100,000 请求。D1 Free 当前每日 500 万行读取、10 万行写入、总存储 5 GB，超过每日额度时查询失败而非自动计费。上线前以账户实际套餐为准，不能启用 Workers Paid、R2 或付费模型。

- [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 定价与免费额度](https://developers.cloudflare.com/d1/platform/pricing/)
- [Pyodide 0.29.3 官方用法](https://pyodide.org/en/0.29.3/usage/index.html)

## 本地验证记录

2026-09-29：Mac 修改源码，经 `mutagen sync flush acmcoder-v3` 到 WSL。`node --check` 验证两段 JavaScript。WSL 临时静态服务通过 Mac 本地隧道供浏览器访问：正常样例 stdout 为 `8` 且显示“自测通过”；异常显示 traceback；无限循环点击停止后立即恢复界面；刷新保留代码草稿。使用与 `_headers` 相同的 CSP 再次运行成功。沙箱 Python 发起带凭据同站 `/api/private` 请求得到 `JsException`，服务访问日志只有静态文件，没有 `/api/private` 请求。Cloudflare 真实预发布尚待验收。
