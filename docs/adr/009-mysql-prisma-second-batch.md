# ADR-009: 流程、运维事件与应用配置落 MySQL（第二批）

- 状态：已接受
- 日期：2026-10-21（Phase 4 数据库第二批）
- 关联：ADR-004 / ADR-008；方案 8.1 / 8.6 / 8.2；Phase 4 生产化

## 背景

ADR-008 已把用户/角色、页面/版本、模型/记录、RBAC 迁入 MySQL，但流程定义/实例、运维事件、应用配置仍散落在 `LC_DATA_DIR`：

- 流程实例与页面/记录不在同一数据库，删除定义、记录联动和审计查询都缺少事务边界；
- 运维事件是排障现场数据，文件整表替换在双实例下会互相覆盖；
- `apps.json` 是单文件，主题配置与页面数据备份/恢复节奏不一致。

第一批落地后，仓储抽象、`LC_STORAGE` 开关、`_test` 库集成测试与真启动冒烟均已稳定，具备继续迁移的条件。

## 决策

1. **新增 4 张表**（与第一批合计 12 张）：
   - `flow_definitions`：`flowId` 主键，完整 `FlowSchema` 存 `schemaJson`，冗余 `modelId/name` 供按模型查找与列表；
   - `flow_instances`：一条记录一次流程生命周期，`tasks/history` 整体存 JSON；
   - `ops_events`：错误/性能/事件一张表，`detailJson` 存现场快照；
   - `app_config`：单行 `id='default'`，`theme` 存 JSON，为未来多应用预留 id 维度。
2. **流程定义与实例分表且不建外键**：删除定义只删 `flow_definitions`，实例继续保留用于审计；实例中的 `flowId` 是历史引用，不要求定义仍存在。
3. **运维事件保留自增 `seq`**：同一批事件的 `at` 可能完全相同，`seq` 保证「后写在前」的稳定顺序；业务 `id` 仍唯一。`OpsRepository` 维持「整表读/整表写」契约，由 service 控制 500 条上限，MySQL 实现用事务 delete + create。
4. **字段形状不对协议做破坏性改动**：`tasks/history/detail/theme` 继续用 JSON 列；`pageVersion` 以字符串落库（`'draft'` 或数字字符串），读出时还原为 `number | 'draft'`。
5. **仓储接口与装配方式不变**：新增 `MysqlFlowRepository / MysqlOpsRepository / MysqlAppConfigRepository`；`StorageModule` 按 `LC_STORAGE` 注入 JSON 或 MySQL 实现，`FlowModule / OpsModule` 不再各自 new 文件仓储，`AppConfigService` 改为注入 `AppConfigRepository`。
6. **导入与验证同步扩展**：`import-json-to-mysql.mjs` 导入 `flows.json / flow-instances.json / ops/events.json / apps.json`；`mysql.persistence.test.ts` 覆盖流程/实例/运维/配置仓储；`smoke-mysql.mjs` 扩展为 9 项，真启动回读 4 张新表。
7. **单测隔离加固**：Vitest 自动加载 `apps/server/.env` 会覆盖 `test.env`，新增 `setup-json-storage.ts` 在测试模块导入前强制 `LC_STORAGE=json` 并删除 `DATABASE_URL`，避免普通 e2e 写入开发库。MySQL 专项测试只使用显式 `LC_TEST_DATABASE_URL`。

## 备选与取舍

- **实例内嵌 tasks/history 拆表**：更利于按任务查询/索引，但当前待办规模小、读写总是整实例，拆表会增加事务与映射复杂度；暂用 JSON。
- **流程实例加外键/cascade**：能保证引用完整，但删除定义会连带删除审计实例，违背「删除定义后实例保留」；放弃。
- **运维事件改增量 append**：更抗并发，但会改动现有 `OpsRepository` 契约与 JSON 实现；本批先保持接口，整表替换的并发边界写入 ADR 和风险清单。
- **app_config 键值表**：扩展性更好，但当前只有 theme 一个配置，单行 JSON 更贴近原 `apps.json`；保留 id 为未来多应用留口。

## 后果

- ✅ 12 张核心业务表统一事务、备份与迁移路径；MySQL 模式 `/ready` 的 `SELECT 1` 会随同一数据库连接可用性失败。
- ✅ 流程删除后实例仍可查；运维事件同毫秒顺序可解释；应用配置与页面数据同库。
- ✅ JSON 仍是默认/无数据库测试路径；JSON→MySQL 导入幂等，可在切换时搬运存量数据。
- ⚠️ 上传文件与文件元数据仍在 `LC_DATA_DIR`，不在 MySQL 事务内；备份需要 SQL + 文件目录两份。
- ⚠️ `ops_events` 整表替换在并发上报时仍可能后写覆盖先写（500 条上限，单实例可接受）；多实例前应改增量 append 或独立写入通道。
- ⚠️ 页面/记录仍无乐观锁；MySQL 支持多进程读写不等于并发编辑安全。
