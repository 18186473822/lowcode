-- Phase 4 · 乐观锁与流程 outbox（2026-10-22）
-- pages/data_records 增加 revision：ETag / If-Match 的版本源，写路径用 CAS 防丢更新。
-- flow_instances 增加 revision + pendingPatchJson：审批实例 CAS，以及「实例已推进、记录未回写」的补偿字段。
ALTER TABLE `pages` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `data_records` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `flow_instances` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `flow_instances` ADD COLUMN `pendingPatchJson` JSON NULL;
