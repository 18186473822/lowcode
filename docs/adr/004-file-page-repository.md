# ADR-004: 服务端 JSON 文件仓储（接口先行）

- 状态：已接受
- 日期：2026-09-29（Phase 0 第 3 批第 2 项，D-9 结案）
- 关联：方案 8.1 / 8.3 / 8.4；台账 D-9

## 背景

方案 8.1 技术栈定的是 **NestJS + Prisma + PostgreSQL + Redis**。Phase 0 的目标只是「页面 Schema 能存取、版本模型成立、接口契约跑通」，此时上全套数据库：

- 环境成本（本机/CI 需要 PG + Redis 实例）；
- Prisma schema 与 8.4 双表（`pages` + `versions[]`）的映射属重复劳动，Phase 1 动态 CRUD 定型后再做更稳；
- Redis 的真实需求（缓存/会话）尚未出现。

## 决策

- **定义 `PageRepository` 接口**（对齐方案 8.4 双表语义），Phase 0 提供 `FilePageRepository` 实现：`<DATA_DIR>/pages/<id>.json`，**tmp + rename 原子写入**，id 白名单正则防路径穿越（与 service 层双重校验）。
- 用户为内存种子账号（admin/designer），JWT 密钥环境变量注入。
- **Phase 1 换数据库 = 新写一个仓储实现，接口与上层零改动**；Redis 待需求出现再引入。

## 后果

- ✅ 零外部依赖：`node dist/main.js` 即起，38 用例在临时目录真实落盘，CI 无需服务容器。
- ✅ 8.4 的版本模型（草稿/发布/回滚 = 复制为新草稿）在文件形态已验证，换 PG 时语义有据可依。
- ⚠️ 并发写无锁（单进程假设）——多实例部署前必须换实现（Phase 1 计划内）。
- ⚠️ 与方案 8.1 的差异已在台账 D-9 与方案「实施状态」双向标注，避免被误读为「数据库已就绪」。
