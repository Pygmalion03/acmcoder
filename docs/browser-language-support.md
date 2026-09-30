# 浏览器语言支持与实验状态

截至 2026-10-01，公开统一 rc.3 网站和 ZIP 插件正式提供 **Python**。本地与 Docker 仍提供 **Python、C++、Java**。下面的候选实验不改变已部署版本的能力声明。

| 语言 / 候选 | 证据 | 当前判定 |
| --- | --- | --- |
| C++ / binji wasm-clang，固定 commit 648c4a89997a351eef75cdaec3ef5b89d4937dec | 真实 Chrome 编译含 vector/string/map/sort 的新代码，链接缺 `__lttf2`；中文源码有编码警告 | 原发行不能直接达标，停止该候选 |
| C++ / cppstudio Clang 22.1.8、wasi-sdk 33 | 修正同版本教学 iostream 和 UTF-8 I/O 后，真实 Chromium 与无网络隔离帧九项实验均通过 | 可以推进产品接入；仍未部署/打入扩展 |
| Java / CheerpJ 4.3 | 社区许可支持官方 CDN 使用；自托管/再分发另需商业许可 | 不符合当前离线插件与零新增运营费用方案，停止该候选 |
| Java / DoppioJVM 0.5.0 + JCL v3.2 | 真实 Chromium 用 javac 编译新 Main；8/9 项通过，80 MiB 数组成功突破实验的 64 MiB 预算，标注的 20 MiB 堆不限制托管对象总分配 | 未证明可执行的用户总内存上限，不进入本次浏览器正式支持，停止该候选 |

原始来源：[binji](https://github.com/binji/wasm-clang)、[cppstudio 发行](https://github.com/cppstudio-io/wasm-clang-runtime/releases/tag/v0.1.0)、[官方 wasi-sdk 33](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-33)、[CheerpJ 许可](https://cheerpj.com/docs/licensing.html)、[Doppio](https://github.com/plasma-umass/doppio)、[JCL](https://github.com/plasma-umass/doppio_jcl/releases/tag/v3.2)。

## C++ 实测范围

所有提交代码在浏览器中重新编译，不是预编译 hello-world，也不是远程服务器编译。验过标准 cin/cout、vector/string/map/sort、std::getline 的中文多行文本与 emoji、编译错误、20 次重复、1 MiB 输入、128 KiB 源码、64 MiB 用户 WASM 上限、死循环取消和取消后再次编译运行。

隔离帧不带 `allow-same-origin`；CSP 禁止网络、对象与额外脚本。可信父页只传固定运行资源字节、源码、stdin，运行器无法访问应用 IndexedDB 或扩展 API。实机隔离标记全部为 true。9 项结果和实际资源散列见 [证据摘要](../experiments/browser-languages/evidence/cpp-chromium-2026-10-01.json)，复现见 [实验说明](../experiments/browser-languages/README.md)。

本地回环环境首次普通 Worker 编译执行 3.81 秒，隔离 Worker 在资源已准备后为 2.24 秒；同 Worker 的 20 次热运行约 0.74–0.86 秒。主线程心跳最大间隔 159 ms，页面保持响应。这个时间不能代表公网首次下载，取消数字也包含编译阶段。

运行资源原始约 95 MB，gzip 合计 28,005,315 字节，最大单文件 13,504,973 字节。按独立 gzip 静态文件可满足 [Pages 单文件 25 MiB 限制](https://developers.cloudflare.com/pages/platform/limits/)，但不能继续把它们嵌在目前的小 Worker 代码中。必须先完成实际静态分发与离线扩展实装，再开启产品下拉选项。

rc.4 工作区已接入统一练习页及插件适配器，采用 C++17；用户 WASM 64 MiB，clang/lld 各 512 MiB，memfs 128 MiB，JS 虚拟文件共 32 MiB，编译 30 秒、执行 5 秒。源码和 stdin 各最多 200,000 字符（仍须满足记录的整体大小限制），输出共 32,768 字符。产品上限与之前探针的 1 MiB 输入范围分开；没有宣称产品保存/同步支持 1 MiB 的 stdin。标准库采用 noeh，不承诺 C++ 异常或所有系统库。

实际本地网站构建在不透明、禁止网络的帧中运行新源码，精确 stdout/stderr（没有额外换行）、中文/emoji、vector/map/sort/getline、20次重复、编译错误、80MiB分配拒绝、死循环5秒自动停止、加载中/执行中手动停止、恢复后128KiB源码+200,000字符输入均通过。刷新后草稿仍在。重复耗时约3.21–3.97秒，含自动化观察间隔，不能与实验同Worker热运行或公网下载时间直接比较。见产品证据 `../experiments/browser-languages/evidence/cpp-product-local-2026-10-01.json`。

构建输出压缩资源约28.2MB，全部内置插件包；运行资源分别校验压缩/解压摘要，缓存仅保存公共运行字节。此时仍未完成公网静态上传或真实离线扩展实装，公开 rc.3 继续只有 Python。正式稳定版新增 browser-cpp-two-clients 验收门槛，不能以构建成功替代两端分发。

## Java 的边界

CheerpJ 的限制是当前分发许可和成本，不意味着 Java 无法在浏览器运行。Doppio 的源码预检也不替代实机验收；即使某个样例可运行，无法限制用户程序内存或无法安全离线分发时，也不会作为正式支持。浏览器候选失败不影响本地 Java，也不删除该语言的原有草稿。

Doppio 实际用浏览器 javac 编译了含数组/集合/字符串的新 Main，中文多行、错误反馈、20 次重复、1 MiB 输入、128 KiB 源码、死循环取消与取消恢复通过，见 [实机摘要](../experiments/browser-languages/evidence/java-chromium-2026-10-01.json)。冷启动编译执行约 5.25 秒，20 次热运行约 3.75–4.71 秒，主线程心跳最大 103 ms。内存用例输出 `UNBOUNDED 83886080`，与 Node 预检一致。

64 MiB 是本探针选择的用户任务预算，不意味着 Java 语言必须采用这个大小；判定依据是运行器没有证明可设置且执行有效的托管对象/数组总预算，其标注的 20 MiB 只适用于另一个非托管堆。Java 原生 JS 互操作还须单独隔离，不能只封装普通 Worker 就宣称安全。按照每语言两个候选的约定，停止继续移植；未来可另立目标重新研究。

启动中遇到的两处问题已经定位并修正：静态预览不支持 HEAD，通过固定 JCL 尺寸索引解决；基于 setTimeout 的 setImmediate 触发浏览器计时器钳制，通过 MessageChannel 解决。不把这些探针适配错误算成 Java 不可运行。

## 交付状态

L1 的 Java 有界评估已有结论，C++ 技术实验通过后仍需要产品接入和两端真实分发，因此 L1 整项仍未完成。不得把该文档或探针的通过写成已经上线 C++/Java。统一 18 项目标继续保留。
