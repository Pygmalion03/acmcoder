# 统一版自带 API（预览）

设置与数据 → 自带 API，填写服务的 API 地址、模型 ID 与密钥。当前适配 `POST <baseUrl>/chat/completions`，完整 JSON 文本响应；暂不宣称流式、工具调用、Anthropic 原生协议或 Gemini 原生协议兼容。提供商提供 OpenAI 兼容入口时才适用。

网站登录后使用同源短时转发，允许的基地址为：

| 服务 | 基地址 | 真实模型验收 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | 待用户自行配置 |
| DeepSeek | `https://api.deepseek.com` 或 `/v1` | 待用户自行配置 |
| SiliconFlow | `https://api.siliconflow.cn/v1` | 待用户自行配置 |
| 阿里云兼容入口 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 通用入口未实测 |
| 阿里云北京工作空间 | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，WorkspaceId以ws-开头 | qwen3.7-flash-2026-07-15真实共享传输、relayAI、本地HTTP问答/取消重试/错误恢复通过；三端界面待验收 |

该表是转发允许范围，不是全部提供商已经实测的声明。网站不能做任意 URL 代理，不跟随重定向，不落库密钥。现有网站问答读取限额是每账号每日 20 次、至少间隔 10 秒；本地和插件仍受提供商自己的额度约束。模型费用由用户选定服务收取，没有共享付费模型回退。

插件直连用户配置的 HTTPS 服务，在用户点击保存时申请确切 origin 的可选访问权限；声明的可选 HTTPS 范围不等于默认授权全网。本地由 Node 请求，只有显式选中“允许本机回环 HTTP 模型服务”才允许 localhost、127.0.0.1、::1 的 HTTP 地址。

默认密钥保留在当前工作区内存，刷新或关闭需重新填写；可选口令加密保管只保存版本化密文，不同步、不进入学习备份。使用 Web Crypto PBKDF2-SHA256（600000 次）、随机 16 字节 salt、AES-GCM 256 位、每次新 12 字节 IV。迭代次数依据 [OWASP 建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；本轮 WSL Node 全部加密往返测试约 0.3 秒，真实 Mac Chrome 设置保存和刷新解锁已纳入界面验收。口令或解密密钥不落盘，重启后需解锁；清除同时取消当前问答。

题目和语言各有独立对话记录。发送不会修改代码；“附带当前题面、代码和输入”默认关闭，选中才发送。限制模型上下文不删除历史，失败或取消保留问题，重试同一次请求不重复记录。网站转发接口只允许已登录网页账号，设备同步令牌不能调用。

目前已验证共享核心、本地 HTTP 兼容测试服务的真实网络与界面链路；测试服务只验证协议和取消/错误行为，不替代真实提供商验收。合成旧版本配置迁移与实际HTTP已通过；真实密码库授权的提供商共享传输、relayAI及本地HTTP问答/取消重试/错误恢复通过，代码/stdin/expected未变且学习备份不含Key。插件实装权限/联网和用户真实Key三端界面问答仍待完成，A1 暂不能标整体完成。

协议参考：[Chat Completions API](https://developers.openai.com/api/reference/resources/chat)。

北京工作空间地址以[阿里云官方Base URL说明](https://help.aliyun.com/zh/model-studio/base-url)为依据，rc.9加入网站允许范围；不允许其他路径、端口、仿冒后缀或Token Plan接口。实际验收收据见`docs/releases/evidence/ai-local-http-client-2026-10-01.json`，该收据明确仅为本地HTTP和产品共享client，不替代浏览器设置或完整找题界面。
