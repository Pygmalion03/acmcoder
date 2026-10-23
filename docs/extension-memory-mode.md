# 原版兼容：浏览器插件记忆模式设计

本文仅说明保留的原版本地连接模式；当前独立插件的安装、IndexedDB存储和API Key规则见[插件使用](edge-extension.md)与[数据与隐私](data-and-privacy.md)。以下本地接口和缓存描述不作为统一工作区的安装要求。

插件通过 content script 读取 LeetCode 当前题目页。优先走 LeetCode 同源 GraphQL，拿不到时退回 DOM 文本提取。

## 基本流程

1. 插件确认当前 URL 是 `leetcode.cn/problems/<slug>/` 或 `leetcode.com/problems/<slug>/`。
2. content script 读取题目标题、难度、标签、正文和第一个样例。优先通过 background service worker 请求 `https://leetcode.cn/graphql/`，拿中文标题和中文标签。
3. 用户开启“记忆模式”后，读取成功会自动发送到本地服务。
4. 本地服务保存 JSONL，并维护一份 `current.json` 给 ACMCoder Web 自动加载。
5. 插件侧栏不展示完整题面，只提供 ACM 练习工作区。

## 本地接口

```http
POST http://127.0.0.1:43117/api/memory/pages
content-type: application/json

{
  "source": "leetcode",
  "url": "https://leetcode.cn/problems/two-sum/",
  "slug": "two-sum",
  "title": "两数之和",
  "difficulty": "简单",
  "tags": ["数组", "哈希表"],
  "sample": {
    "inputText": "4\n2 7 11 15\n9",
    "outputText": "0 1"
  },
  "content": "给定一个整数数组 nums 和一个整数 target ...",
  "capturedAt": "2026-05-12T08:00:00.000Z"
}
```

查询历史：

```http
GET http://127.0.0.1:43117/api/memory/pages?slug=two-sum
```

查询最近一次读取：

```http
GET http://127.0.0.1:43117/api/memory/current
```

服务端支持 CORS `OPTIONS` 预检，浏览器插件可以直接请求本地 API。

## 缓存策略

插件侧栏使用 `chrome.storage.local` 缓存：

- 最近一次读取的题目。
- 语言选择。
- 当前题目、当前语言下的代码、stdin 和预期输出。
- LLM API Key。

ACMCoder Web 使用 `localStorage` 缓存：

- 当前题目。
- 语言选择。
- 当前题目、当前语言下的代码、stdin 和预期输出。

## 注意点

LeetCode 的 DOM 结构可能变化，所以读取逻辑必须保留 fallback。GraphQL 也可能因为站点策略调整而失败，失败时仍应尽量从页面可见文本中提取可用信息。

侧栏按浏览器窗口启用。用户点击扩展图标后直接打开 ACMCoder 侧栏，切换 tab 或页面时保持打开；读取题目动作仍只在 LeetCode 题目页执行。

插件不直接写本地文件，而是请求本地 Node 服务。这样安全边界更清楚，用户也能明确知道数据只保存在本机项目目录下。
