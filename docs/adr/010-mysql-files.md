# ADR-010: 文件元数据与内容落 MySQL（第三批）

- 状态：已接受
- 日期：2026-10-22（Phase 4 数据库第三批）
- 关联：ADR-004 / ADR-008 / ADR-009；方案 8.2 / 8.3；Phase 4 生产化

## 背景

文件模块一直按 `<DATA_DIR>/files/<fileId>` 保存字节、`<DATA_DIR>/files-meta/<fileId>.json` 保存元信息：

- 两次写入没有共同事务，字节成功、元信息失败会留下半状态；
- 跨机部署需要额外共享盘，否则不同实例看不到同一附件；
- 数据库备份与文件目录备份节奏不同，恢复时要分别核对；
- 文件元信息损坏时只能靠运行时降级或 500 暴露，缺少数据库约束。

前两批已把用户、页面、模型、记录、RBAC、流程、运维事件与应用配置迁入 MySQL，仓储抽象和 `LC_STORAGE` 双轨稳定，具备把文件作为第三批迁移的条件。

## 决策

1. **新增第 13 张表 `files`**，元数据与内容同行：
   - `id VARCHAR(160)` 主键：`uuid + 白名单扩展名`，服务层仍做路径穿越白名单校验；
   - `originalName TEXT`：不因客户端超长文件名导致写库失败；
   - `mimeType VARCHAR(255)`、`size INT`、`uploadedAt DATETIME(3)`、`uploadedBy VARCHAR(128)`；
   - `content LONGBLOB`：单文件上限沿用 10MB；
   - `uploadedAt` 建索引，便于后续按时间清理或审计。
2. **抽出 `FileRepository` 契约**：`save(StoredFile)` / `find(id): StoredFile | null`，`StoredFile = { id, meta, data }`。服务层只保留文件名 basename 化、扩展名白名单、10MB 判断、`fileId` 生成与 404 语义。
3. **双实现等价**：
   - `DiskFileRepository` 保持原 `files/` + `files-meta/` 布局；字节缺失返回 `null`，元信息缺失按 `application/octet-stream` 降级，元信息损坏继续抛错；
   - `MysqlFileRepository` 用 `upsert` 写单行，保持「同 id 覆盖」语义；读取把 `DATETIME(3)` 回填为 ISO 字符串、`LONGBLOB` 回填为 `Buffer`。
4. **装配集中在 `StorageModule`**：按 `LC_STORAGE` 注入磁盘或 MySQL 实现；`FileModule` 不再直接依赖 fs。JSON 仍是默认/测试路径。
5. **存量文件显式导入**：`import-json-to-mysql.mjs` 扩展 `files/` + `files-meta/` 导入，大小以实际字节为准，元信息缺失时按运行时语义降级。MySQL 模式不自动双读旧磁盘文件，切换前必须执行一次导入。
6. **验证方式**：`mysql.persistence.test.ts` 覆盖元数据、二进制字节、同 id 覆盖、缺失返回 `null`；`smoke-mysql.mjs` 通过真实 HTTP 上传 → Prisma 回读 `files` → HTTP 下载字节比对。

## 备选与取舍

- **元数据表 + 内容表分表**：需要两次写入或事务协调，仍可能出现半状态，读取多一次 join；放弃。
- **把二进制 base64 塞进 JSON/TEXT**：体积膨胀约 33%，且失去 `LONGBLOB` 的流式/长度语义；放弃。
- **继续只用本地盘**：实现最简单，但跨机部署、备份一致性、半写状态问题仍在；放弃。
- **现在直接上对象存储（OSS/COS/MinIO）**：长期方向正确，但会新增外部依赖、凭证与部署复杂度，超出本批企业内网/中小附件范围；暂缓，保留 `FileRepository` 以后替换实现。

## 后果

- ✅ 上传只写一行，元数据与内容天然原子；MySQL 模式多实例可共享同一附件。
- ✅ 数据库备份（`mysqldump`）即可覆盖附件，不再需要 SQL + 文件目录双备份。
- ✅ JSON 模式保持原行为，单测/无数据库 CI 不依赖 MySQL；`FileModule` 与 HTTP 契约零变化。
- ⚠️ `LONGBLOB` 会让数据库体积随附件增长，备份/恢复时长和容量需按业务量评估；单文件仍限 10MB。
- ⚠️ 当前无对象存储 / CDN / Range 下载、文件列表/删除/回收站、哈希去重、病毒扫描；下载仍是公开只读语义。
- ⚠️ 存量附件必须执行 `import:json-to-mysql`；未导入的旧文件在 MySQL 模式下会 404。
- ⚠️ 文件表没有乐观锁；同 id 覆盖是刻意保留的重试语义，不用于并发编辑场景。
