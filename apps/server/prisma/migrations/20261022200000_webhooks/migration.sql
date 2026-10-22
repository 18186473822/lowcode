-- Phase 4 · Webhook 订阅与投递日志（2026-10-22）
-- 订阅删除不级联投递日志（审计保留），因此不建外键；
-- events / payloadJson / attemptsJson 保存协议原始结构，新增事件无需改表。

CREATE TABLE `webhook_subscriptions` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(500) NULL,
    `url` VARCHAR(2048) NOT NULL,
    `events` JSON NOT NULL,
    `secret` VARCHAR(128) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `timeoutMs` INTEGER NOT NULL DEFAULT 10000,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(64) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `webhook_subscriptions_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webhook_deliveries` (
    `id` VARCHAR(64) NOT NULL,
    `subscriptionId` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(64) NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `attemptsJson` JSON NOT NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `responseStatus` INTEGER NULL,
    `responseBody` TEXT NULL,
    `error` TEXT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `webhook_deliveries_subscriptionId_createdAt_idx`(`subscriptionId`, `createdAt`),
    INDEX `webhook_deliveries_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
