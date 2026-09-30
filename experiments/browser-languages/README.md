# 浏览器多语言有界实验

这些文件是 L1 的复现实验，不是产品能力声明。公开 rc.3 网站/插件仍只提供 Python，本地/Docker 保留 Python、C++、Java。每种语言只有两个候选，不扩大为编译器移植项目。

## 复现

依赖、SDK、编译器二进制仅放 WSL `/tmp` 缓存和忽略的 `dist/local-web/language-probe`，不进入源码或 Mutagen。首次约需下载 275 MB；准备脚本校验固定 SHA256，不执行 npm 安装脚本、不需要 sudo。原生 clang 只构建公共 memfs 适配器，用户提交的新程序由 WASM clang 编译。

Mac 编辑完成并确认同步后，在已登记的 WSL 项目运行：

```sh
mutagen sync flush acmcoder-v3
ssh dev-wsl 'cd /home/pygmalion/runs/002-acmcoder/v3 && python3 experiments/browser-languages/prepare.py dist/local-web/language-probe --language all'
```

会话已有的 43118 预览可以直接提供这些静态实验文件，无需重启稳定 43117 服务。浏览器打开 `http://127.0.0.1:43118/language-probe/probe.html`，选择语言后运行基础或完整实验。C++ 勾选隔离帧后，资源由可信页面以固定名单传入，帧仅 `allow-scripts`，Worker 不允许网络/应用存储。这里只运行已知样例；Java 普通 Worker 不可作为用户代码的生产隔离方案。

完整实验包括新源码编译和标准库、中文多行输入输出、错误反馈、20 次重复、1 MiB 输入、128 KiB 源码、64 MiB 用户 WASM 内存边界、死循环停止及停止后恢复。页面心跳监测主线程响应。编译加载有 60 秒截止；死循环从实际执行阶段开始后 250 ms 发起 Worker 终止。测得的取消耗时含编译，不宣称是纯终止延迟。

Node 预检只能辅助定位编译链，不能替代浏览器或扩展验收：

```sh
node experiments/browser-languages/node-preflight.mjs dist/local-web/language-probe
node experiments/browser-languages/java-node-preflight.cjs dist/local-web/language-probe
```

## 固定来源与适配

- C++ 第二候选：[cppstudio-io/wasm-clang-runtime](https://github.com/cppstudio-io/wasm-clang-runtime)，源 commit `df1180d80184733c6a01599f76b92b4001d20f87`、发行 v0.1.0、Clang 22.1.8、wasi-sdk 33。发行包的 iostream 是教学桩，`std::getline` 编译失败；仅用同版本官方 SDK 中的完整 iostream 替换这一头文件。标准库仍按 noeh 配置，异常不是承诺的支持范围。
- memfs 按该候选自己的编译说明构建；固定脚本把 WASI 导入绑定改为调用时查找，允许修正 UTF-8 stdin 与跨写入边界的输出解码。实际链接使用 `--max-memory=67108864`。这些最小适配全部可由脚本复现，不引入另一候选。
- Java 第二候选：[DoppioJVM 0.5.0](https://www.npmjs.com/package/doppiojvm/v/0.5.0)、BrowserFS 1.4.3、官方 JCL v3.2。Java 文件直接从已知归档提取，保留 JCL 的 ASSEMBLY_EXCEPTION/THIRD_PARTY_README。正式再分发还须核验完整许可材料，不能因为运行器 MIT 就把整个 JCL 算作 MIT。
- Java 的浏览器适配提供 `setImmediate` 消息通道、有限 stdin 的 EOF 和从固定 JCL 文件生成的尺寸索引。尺寸索引避免静态预览不支持 HEAD 导致的启动失败。早期 Node 探针的 BrowserFS 全局与 FS 构造器错误来自适配层，不作为运行器不兼容的结论。

## 已获证据与未完成项

见 [浏览器语言支持说明](../../docs/browser-language-support.md)、[C++ 实机摘要](evidence/cpp-chromium-2026-10-01.json) 与 [Java 实机摘要](evidence/java-chromium-2026-10-01.json)。C++ 已在真实 Chromium 浏览器及无网络的隔离帧跑通全部九项实验；公网静态资源分发、扩展打包/断网实装、产品 RunnerAdapter 和统一版本能力声明还未完成。Java 浏览器实测 8/9，通过的功能不能掩盖内存预算未执行这一缺陷，本轮不进入正式支持。

不把 localhost 冷启动时间当成公网下载时间，不把运行器技术可行当作已经部署，不将巨型运行器字节加入 Git。
