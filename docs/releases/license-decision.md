# ACMCoder 发行许可证选择

2026-10-01。用户明确授权“许可证什么的，你去做”后，采用本文件建议的 **MIT**，版权署名 **2026 Pygmalion03**。完整文本已保存到根 `LICENSE`，package.json 和锁文件的根项目元数据同步为 MIT。下方保留选择依据，供后续审阅。

## 需要决定的内容

建议 MIT：适合这个允许别人使用、修改、自行部署的个人练习项目，文字短，分发时保留版权及许可声明即可。MIT 允许商业使用和闭源再分发，不要求改造者公开修改。[MIT 原文与条件](https://choosealicense.com/licenses/mit/)

| 选择 | 别人可以怎样使用 ACMCoder 自有代码 | 你需要接受的差别 |
| --- | --- | --- |
| MIT（建议） | 使用、修改、部署、商业使用、再分发，包括闭源修改版 | 需要保留许可/版权声明；没有 Apache 的独立明确专利条款 |
| Apache-2.0 | 同样允许商业使用、修改及闭源再分发 | 有明确专利授权和专利诉讼终止条款；分发时保留许可、相关 NOTICE，标识修改 |
| 暂不授予开源许可 | 继续保留当前未定状态 | 不能把公开可查看的仓库描述为已取得开源使用授权；本计划的正式发行许可门槛继续等待 |

Apache 的差别依据其第 3、4 节，不承诺第三方专利都被覆盖。[Apache 官方原文](https://www.apache.org/licenses/LICENSE-2.0)

此次已按用户授权选择 MIT，署名使用现有公开仓库账号。下一次发行构建需核对各端随包 LICENSE；不能因为当前源码已补上许可，就宣称历史 rc.8 包已经包含它。

## 第三方组件保持自己的许可

根许可只覆盖你有权授权的 ACMCoder 代码，不会把 Pyodide、Python、LLVM、Debian、JDK 或题面改成 MIT/Apache。LeetCode 来源题面与用户代码/聊天/备份不因此成为项目源码许可的一部分。

| 实际分发对象 | 已确认的许可文件与来源 | 下一发行包要保留的内容 |
| --- | --- | --- |
| Pyodide 0.29.3（未修改随包运行文件） | `licenses/Pyodide.txt`；[对应版本 MPL 源码](https://github.com/pyodide/pyodide/tree/0.29.3) | MPL 文本及对应源码获取链接；根许可不能限制接收者的 MPL 权利 |
| Pyodide 内 Python | `licenses/CPython.txt` | Python 原版权及许可，不用根许可替换 |
| C++ 编译器/链接器、memfs、sysroot、worker | `vendor/cpp/licenses/` 的 13 个原许可/NOTICE；固定来源与修改脚本见 `third_party/cpp/README.md` | 原 Apache/LLVM Exceptions/stb/wasi-libc 许可及修改说明；保留固定版本与摘要 |
| 构建工具和测试依赖 | `package-lock.json`、`THIRD_PARTY_NOTICES.md` | 不把开发工具二进制加入插件；源码中保留依赖说明 |
| Docker 中 Node/Python/g++/JDK/发行版软件包 | 镜像内 `/usr/share/doc` 等原版权文件 | 保留系统版权文件；公开镜像前还需按实际软件包确认相应源码获取要求，不把“文件存在”当成所有义务已经完成 |

MPL 覆盖的修改文件需要按 MPL 提供源代码；它不自动要求独立新增的 ACMCoder 文件全部采用 MPL。只带压缩后的 JS 或 WASM 不能代替源码获取说明。[Mozilla FAQ：Q8、Q11、Q16](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)

## 当前实际核对范围

`docs/releases/evidence/rc8-license-inventory.json` 来自已经保存的 rc.8 实际 ZIP，记录包摘要、15 个许可/NOTICE 文件以及两份资源清单摘要。它证明许可文件确实在该 ZIP 中，不证明根许可已经选定或 Docker 全部义务已经完成。

本批给源码的第三方说明补充固定源码入口，给 C++ NOTICE 补充 ACMCoder 对上游资源的具体修改说明。这些补充尚未进入已保存的 rc.8 ZIP/网站/镜像；下一次发行构建一并带入，不覆写历史 rc.8 产物。
