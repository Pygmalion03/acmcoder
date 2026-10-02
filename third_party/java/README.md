# 浏览器 Java 8

候选实现采用 Doppio 0.5.0、BrowserFS 1.4.3 和 Doppio JCL v3.2。固定压缩包来源与 SHA256 在 `experiments/browser-languages/prepare.py`，产品组装入口为 `scripts/bundle-java.mjs`。浏览器不向服务器提交编译任务。

- Doppio npm 源码包：https://registry.npmjs.org/doppiojvm/-/doppiojvm-0.5.0.tgz ，MIT。
- BrowserFS npm 源码包：https://registry.npmjs.org/browserfs/-/browserfs-1.4.3.tgz ，MIT。
- JCL 构建源码：https://github.com/plasma-umass/doppio_jcl/tree/18cce8f823ad5a6d623d1a2549883812531ea71a 。其 Grunttasks.ts 指定 Ubuntu OpenJDK 8u72-b05-1ubuntu1。
- 对应 OpenJDK 源码：https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/openjdk-8/8u72-b05-1ubuntu1/openjdk-8_8u72-b05.orig.tar.gz 。SHA256 为 ba8018db32084d6be91111a23c89758d0d59f5bd5684168d04b9e2c7d225e3fc。
- 对应 Ubuntu 补丁：https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/openjdk-8/8u72-b05-1ubuntu1/openjdk-8_8u72-b05-1ubuntu1.diff.gz 。SHA256 为 c07dd4a3f04339e3666adae459c9cc80d7845a74e38c47a20ef7566ec152a445。

运行分发保留原始 GPL 与 Classpath Exception、第三方声明及 MIT 文本；源码、补丁可按上述固定链接免费取得，也应随包含 Java 的发行版作为独立资源提供。

ACMCoder 的调整随本仓库源码提供：禁用 Doppio 的 JavaScript.eval、使用解释器模式、对生成构造器的类元数据进行字符和展开体积限制、在数组/对象/克隆及文件缓冲分配之前计费。编译累计分配预算 256 MiB，执行累计分配预算 64 MiB。这是保守的累计分配预算，不是 Java GC 堆大小；即使对象已不再使用，计费也不恢复。每次运行使用新的隔离 Worker，执行最多 5 秒，编译及启动最多 30 秒，总输出最多 32,768 字符。

浏览器支持 Java 8 语法和所带类库；本地 Docker 的 JDK 版本单独记录，不承诺新 JDK 专属语法可以在浏览器使用。只有真实浏览器的产品路径验收通过后，才可把候选能力标为已交付。
