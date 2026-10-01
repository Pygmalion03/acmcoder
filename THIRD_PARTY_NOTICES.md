# 第三方运行资源与许可证

根仓库许可证尚待用户选择；本文件不替用户赋予项目MIT、Apache或其他授权。发行前可选择MIT（宽松简洁）、Apache-2.0（包含专利条款）或其他适合的许可证；最终选择后保存完整LICENSE文本。

| 组件 | 固定版本 / 来源 | 许可与使用 |
| --- | --- | --- |
| Pyodide | npm pyodide 0.29.3，锁文件固定摘要 | MPL-2.0；插件随包包含未修改运行文件，许可证位于 extension/licenses/Pyodide.txt |
| CPython / Python标准库 | Pyodide所带版本及系统Python | Python-2.0；插件许可证位于 extension/licenses/CPython.txt |
| 浏览器 Clang / LLD / libc++ | cppstudio v0.1.0，Clang22.1.8 / wasi-sdk33，固定来源和摘要 | LLVM Apache-2.0 with LLVM Exceptions；rc.4 构建产物 vendor/cpp/licenses 保留完整许可 |
| 浏览器 memfs / stb_sprintf | cppstudio 固定 commit，SDK33 构建的小型 WASM 适配器 | Apache-2.0、stb MIT / public domain；来源和许可见 third_party/cpp |
| wasi-libc 与 sysroot 组件 | SDK33 submodule 161b3195fc2558d2b1ba3eb9ffae3b2b47407623 | Apache / LLVM Exceptions / MIT 及组件 BSD、CC0；vendor/cpp/licenses 保留原文件，不覆盖为仓库许可 |
| fake-indexeddb | 6.2.5 | Apache-2.0，仅开发测试依赖，不放入插件运行代码 |
| @resvg/resvg-js | 2.6.2，npm 锁文件固定摘要 | MPL-2.0；仅构建图标/宣传图，渲染器及其原生二进制不进入插件运行代码；[原许可证](https://github.com/yisibl/resvg-js/blob/v2.6.2/LICENSE) |
| Node.js | Docker node:22-bookworm-slim基础镜像 | 基础镜像与Node自带许可证；源码包不复制该运行时 |
| GNU g++ / libstdc++ | Debian / Ubuntu基础镜像软件包 | GPL及GCC运行库例外等，以镜像中的软件包版权文件为准 |
| OpenJDK | app镜像17 / runner镜像21 | GPL-2.0及Classpath Exception等，以镜像中的软件包版权文件为准 |

插件构建生成 vendor/python/manifest.json，记录运行文件体积、SHA256和来源。构建再次校验Pyodide版本及npm锁定摘要。发行包应保留随包许可，不将自己的根仓库许可覆盖到这些第三方组件。

rc.4 工作区构建另生成 vendor/cpp/manifest.json；记录压缩和解压后的 SHA256、固定来源、C++17 与执行限制。网站和插件随包分发 gzip 公共资源，下载资源校验后才传给禁止网络的隔离运行器；公开 rc.3 的能力不因此自动改变。巨型 LLVM 与 sysroot 不进入 Git。

Docker依赖通过发行版包管理器安装，保留 /usr/share/doc 中的版权文件。多架构镜像是否已公开发布，以发行清单中的实际digest为准，不以构建流程存在代替公开产物。
