/**
 * 服务端单测统一使用 JSON 存储（Phase 4 数据库第二批加固）。
 *
 * 背景：本机 `apps/server/.env` 可能设置 `LC_STORAGE=mysql`；Vitest 的 `.env` 加载顺序
 * 会覆盖 `test.env` 的默认值，导致普通 e2e 用例把测试数据写进开发库。setupFiles 在
 * 测试模块导入前强制改回 JSON，并移除 `DATABASE_URL`，从根上避免误连。
 *
 * MySQL 专项用例（test/mysql.persistence.test.ts）直接使用 `LC_TEST_DATABASE_URL`
 * 构造 PrismaClient，不依赖这里的环境。
 */
process.env.LC_STORAGE = 'json'
delete process.env.DATABASE_URL
