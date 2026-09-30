# 浏览器 C++ 的小型固定适配资源

编译器和 sysroot 的巨型运行文件在构建时下载到 WSL 缓存，不进入 Git。
`scripts/bundle-cpp.mjs` 校验固定摘要，替换一个同版本头文件，并给 LLVM
WASM 与 memfs 添加可执行的 linear-memory maximum。打包输出保留下列许可。

- 来源：cppstudio-io/wasm-clang-runtime
  `df1180d80184733c6a01599f76b92b4001d20f87`，发行 v0.1.0。
- `memfs.wasm`：按 `experiments/browser-languages/prepare.py`，使用官方
  wasi-sdk 33.0 的 clang/wasm-ld 编译该 commit 的 memfs.c、stb_sprintf.h。
  SHA256 `8354810a29ce761771e19fea911c95d2ba666668dc31aa0a605ecb82ab0c1b1c`。
- `iostream`：同一 wasi-sdk 33 的
  `share/wasi-sysroot/include/wasm32-wasip1/noeh/c++/v1/iostream`，
  SHA256 `197093ba0b5cfd0104fa17f29520f4df160c33e1fa46495f4b00945f937e7922`。
  LLVM source `4434dabb69916856b824f68a64b029c67175e532`。
- `licenses`：该固定运行器的 Apache LICENSE、LLVM Exceptions、NOTICE 与
  stb 原许可段；SDK33 的 wasi-libc
  `161b3195fc2558d2b1ba3eb9ffae3b2b47407623` 许可和组件原始版权/许可段（不复制无关实现）。
  C++ runtime 不使用根仓库尚未选定的许可证覆盖第三方授权。

目前为 rc.4 的工作区实现；公开 rc.3 仍只有 Python。产品验收需要实际网站
分发和离线插件运行，不能以这些文件存在或实验通过替代。
