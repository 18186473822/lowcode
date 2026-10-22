# ADR-011: 乐观锁、审批幂等与流程 outbox

- 状态：已接受
- 日期：2026-10-22（Phase 4 生产化第 1 项）
- 关联：ADR-004 / ADR-008 / ADR-009 / ADR-010；方案 8.3 / 8.4 / 8.6；`docs/protocol.md` §10.2 / §10.6

## 背景

平台此前是「读 → 修改 → 整行覆盖」写入：

- 两个设计器标签页同时编辑同一页面，后保存者会覆盖先保存者；
- 两个客户端同时更新同一条业务记录，后写覆盖先写；
- 两人同时审批同一任务，会重复推进流程、重复写 history，甚至重复回写记录字段；
- 审批到达 `end` 后要回写业务记录，但实例与记录分属不同仓储（JSON 文件或不同 MySQL 表），没有跨表事务；
- 网络超时后客户端重试最后一次审批，可能收到「流程已结束」，客户端无法判断是否成功。

生产化必须先解决「并发写不丢更新」与「审批重试不重复推进」，且不能破坏旧客户端。

## 决策

### 1. 行级 `revision` + HTTP `ETag` / `If-Match`

页面、业务记录、流程实例都增加 `revision`（整数，默认 0）：

- 新建 = 0；每次成功写 +1；删除记录也 +1（软删仍保留行）。页面首次保存草稿由 0 增到 1（建档算一次写）；记录/流程实例创建响应为 0。
- 读取接口返回 `revision`，并设置 ETag：
  - `"page:<pageId>:<revision>"`
  - `"record:<modelId>/<recordId>:<revision>"`
  - `"flow:<instanceId>:<revision>"`
- 页面保存/发布/回滚、记录更新/删除接受 `If-Match`；流程审批不接受 `If-Match`，用幂等键。

`If-Match` 设计为**可选**：

- 旧客户端不携带时，服务端仍用「本次读取到的 revision」做 CAS，避免请求内读改写窗口丢更新；
- 新客户端携带时，版本不一致返回 `409 VERSION_CONFLICT`，响应带 `expectedRevision` / `currentRevision`，前端可提示刷新；
- 格式非法（空串、别的资源 id、非数字）返回 `400 INVALID_IF_MATCH`，不把坏值当成 0。

### 2. 两种存储的并发实现

- **JSON 仓储**：新增进程内 `KeyedLock`，按资源 key 串行化「读 → 判版本 → 写」。只保证单进程；多副本必须切 MySQL。
- **MySQL 仓储**：`UPDATE ... WHERE id = ? AND revision = ?` 行级 CAS；受影响行数为 0 即冲突。并发创建同一主键由唯一键兜底为冲突（`P2002` → `false`）。
- 页面写仍在一个事务内完成「页面行 + 版本行」替换，CAS 失败时整个事务回滚。

### 3. 审批 `Idempotency-Key`

- 只作用于 `POST /flows/instances/:instanceId/tasks/:taskId`，作用域为单个实例；
- 首次成功时把 key、动作、意见、审批人写入任务；相同内容重放直接返回当前实例，不重复推进；
- 同 key 不同任务/动作/意见/审批人 → `409 IDEMPOTENCY_KEY_REUSED`；
- 重放判断在终态判断之前，保证「服务端已成功、响应丢失」的客户重试得到 200；
- 不带 key 的旧客户端保持原错误语义（`FLOW_TASK_STALE` / `FLOW_NOT_RUNNING`）。

### 4. 流程 `pendingPatch` outbox

实例增加 `pendingPatch`（JSON）。审批到达 `end` 时：

1. 实例 CAS 写入 `pendingPatch` 并进入 `approved`；
2. 对记录做 CAS 回写 `onApprove.setField`；
3. 成功清空 `pendingPatch`；
4. 记录 CAS 冲突时重读记录重试；进程中断则由后续 GET 实例 / 列表 / 审批补偿。

选择「实例先落、记录后写」而不是反向，是因为实例是审批状态真相：先保证不会重复审批，再让记录回写可补偿。代价是短暂不一致窗口，补偿后收敛。

## 放弃的方案

- **悲观锁（SELECT ... FOR UPDATE / 进程锁）**：跨请求锁生命周期难管理，JSON 模式无数据库锁，且会阻塞正常读。
- **只靠 If-Match，不带时的请求不做 CAS**：旧客户端仍会丢更新；本方案对旧客户端也做 CAS。
- **流程与记录共用事务**：JSON 模式无法实现；MySQL 虽有事务，但会迫使流程/记录强耦合，且文件存储路径被破坏。
- **在 HTTP 层自动重试审批**：无法判断业务是否已成功，可能放大重复；改由幂等键保证服务端去重。
- **用 `Idempotency-Key` 做全局请求去重**：键的语义和过期策略复杂，本批只覆盖审批这一高风险写操作。

## 后果

- 旧客户端兼容，新客户端可主动获得 409 保护；设计器已接入。
- JSON 模式只适合单进程；多副本部署必须 `LC_STORAGE=mysql`。
- `pendingPatch` 采用至少一次回写；`setField` 是幂等赋值，重复补偿无业务副作用。
- 需要新增测试覆盖：并发同版本写、非法/陈旧 If-Match、幂等重放、同键改内容 409、并发审批、MySQL CAS 与 outbox 回读。

## 验证

- `apps/server/test/concurrency.test.ts`：页面/记录 ETag 与 409、非法 If-Match、并发写、审批幂等/终态重放、同键改动作/意见 409、并发审批。
- `apps/server/test/mysql.persistence.test.ts`：真实 MySQL 下 CAS / `pendingPatch` 回读。
- `apps/server/test/mysql.repositories.test.ts`：无数据库时覆盖仓储映射与 CAS 分支，保证 CI 覆盖率口径。
- 迁移 `20261022160000_optimistic_locking` 已在 `lowcode` 与 `lowcode_test` 应用，并通过 `information_schema` 回读 `revision` / `pendingPatchJson` 列。
