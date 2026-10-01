# 原生 IndexedDB 并发备份探针

本实验使用未修改的 `shared/browser-store.js` 和 `shared/backup.js`，不带云账号、密钥或真实用户数据。供开发验收，不加入三端产品构建。

把 probe.html、probe.js 及当前 shared 目录复制到隔离本地预览静态根目录的同一子目录后打开 probe.html，点击运行，再下载结果。脚本创建随机 namespace，保留测试数据，不清除已有数据库；重跑创建另一独立测试空间。

测试打开原生覆盖四个 object store 的只读导出事务时，在另一 BrowserStore 实例立即请求重写；观察顺序必须是导出打开、写入请求、导出事务结束、重写完成。数据源包含106条旧自测、2020年计划和聊天；20轮分别保存重写前后记录，最终完整备份恢复到另一随机空间，比较全部150条记录payload及40份快照。

IDBFactory代理只观察真实数据库的transaction创建/complete事件，没有模拟IndexedDB、替换产品存储逻辑或修改导出结果。收据与截图源自Chrome for Testing原生UI下载，见 `docs/releases/evidence/backup-concurrency-2026-10-01.json`。该次执行的BrowserStore摘要与已保存rc.8实际插件ZIP相同。

这不能证明云账号分页导出、新登录浏览器恢复，也不能代替产品界面编辑期间导出的集成验收。W5两项完整要求保留在正式发行检查中。
