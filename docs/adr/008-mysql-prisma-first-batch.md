# ADR-008: 核心业务数据落 MySQL 8 + Prisma（第一批）

- 状态：已接受
- 日期：2026-10-21（Phase 4 数据库第一批）
- 关联：ADR-004；方案 8.1 / 8.4 / 8.5；Phase 4 生产化
- 后续：ADR-009（2026-10-21，第二批 flows / flow-instances / ops / apps 已迁入 MySQL）

## 背景

Phase 0 的 ADR-004 用 JSON 文件仓储换取零外部依赖，并保留「换数据库 = 换仓储实现」的接口边界。到 Phase 4，以下问题已经不能再用单进程文件写掩盖：

- 页面发布/回滚、记录写入需要事务边界，文件 tmp+rename 只能保证单文件原子性；
- 用户/角色、RBAC、页面、模型、记录分散在内存与多个 JSON 文件，进程重启或双实例会丢/覆盖；
- 生产部署需要可备份、可审计、可迁移的数据层。

本机已有 MySQL 8.0.46，原方案的 PostgreSQL 改由 MySQL 承接；ORM 仍用 Prisma。

## 决策

1. **数据库**：MySQL 8（utf8mb4 / InnoDB），Prisma 6.19.3；连接串统一 `DATABASE_URL`。
2. **第一批落库范围**（8 张表）：
   - `users` / `roles` / `user_roles`：用户、角色、多对多；
   - `pages` / `page_versions`：方案 8.4 双表，版本以 `(page_id, version)` 复合主键；
   - `models` / `data_records`：动态模型与业务记录，记录以 `(model_id, id)` 复合主键保留「按模型分区」语义；
   - `rbac_page_grants`：页面可见性白名单；RBAC 角色与用户角色共用 `roles` 表。
3. **不破坏现有契约**：`UserRepository / PageRepository / ModelRepository / RecordRepository / RbacRepository` 接口不变；`StorageModule` 按 `LC_STORAGE` 条件注入 JSON 或 MySQL 实现，服务层零改动。
4. **默认仍为 JSON**：`LC_STORAGE=json` 是默认值，保证无 MySQL 的单位测试与 CI 可运行；`mysql` 为显式 opt-in，启动期校验 `DATABASE_URL`。
5. **JSON 数据可导入**：`import-json-to-mysql.mjs` 幂等导入 pages/models/records/rbac；开发用户由 `seed-mysql.mjs` 写入。
6. **可验证性**：MySQL 仓储条件集成测试（`LC_TEST_DATABASE_URL`，缺省 skip）+ 真启动冒烟（`smoke-mysql.mjs`，拒绝非 `*_test` 库）+ `/ready` 的 `SELECT 1`。
7. **暂不迁移**：`flows.json`、`flow-instances.json`、`ops/events.json`、`apps.json` 仍在 `LC_DATA_DIR`；下一批再落库，期间不承诺跨存储事务。（**已由 ADR-009 接续**：同日第二批已迁入 MySQL；本 ADR 其余决策仍有效。）

## 备选与取舍

- **继续 JSON**：零部署成本，但无法满足事务与多实例；放弃。
- **SQLite**：单机事务简单，但生产并发/备份/运维路径弱于已有 MySQL；放弃。
- **直接手写 mysql2 SQL**：控制力强，但迁移/类型/关联维护成本高；Prisma 的 schema 与 migration 更适合当前团队规模。
- **全量一次迁移**：表更多、回归面更大；本批只覆盖核心主数据，flows/ops/apps 下一批，降低一次交付风险。

## 后果

- ✅ 页面/版本、模型/记录、用户/角色/RBAC 获得真实事务与持久化；MySQL 模式 `/ready` 可直接发现数据库不可用。
- ✅ JSON 路径保留，单测/CI 无需 MySQL；MySQL 集成测试与冒烟用独立 `_test` 库，避免污染开发库。
- ⚠️ 双轨存储：flows / ops / apps 仍为文件；跨存储操作没有分布式事务，下一批迁移前需接受该边界。
- ⚠️ 生产多实例仍需处理迁移顺序、连接池与备份；当前读取可用，写入并发策略（乐观锁）尚未做。
- ⚠️ 开发种子口令仅用于本地；生产环境禁止执行 `seed:mysql`（脚本默认拒绝，需显式 `LC_SEED_DEV_USERS=1`）。
