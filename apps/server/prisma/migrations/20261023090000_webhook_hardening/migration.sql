-- Webhook 生产化：分布式租约、订阅级限流、自定义请求头、密钥轮换宽限期、投递归档。
-- 注意：headers 使用表达式默认值；MySQL 8.0.13+ 支持。旧数据在应用层也会兜底为 {}。

ALTER TABLE `webhook_subscriptions`
  ADD COLUMN `previousSecret` VARCHAR(128) NULL,
  ADD COLUMN `previousSecretExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `headers` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN `rateLimitPerMinute` INT NOT NULL DEFAULT 0;

ALTER TABLE `webhook_deliveries`
  ADD COLUMN `leaseOwner` VARCHAR(64) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD INDEX `webhook_deliveries_status_leaseExpiresAt_idx` (`status`, `leaseExpiresAt`);

CREATE TABLE `webhook_delivery_archives` (
  `id` VARCHAR(64) NOT NULL,
  `subscriptionId` VARCHAR(64) NOT NULL,
  `eventId` VARCHAR(64) NOT NULL,
  `eventType` VARCHAR(64) NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `payloadJson` JSON NOT NULL,
  `attemptsJson` JSON NOT NULL,
  `attemptCount` INT NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL,
  `lastAttemptAt` DATETIME(3) NULL,
  `responseStatus` INT NULL,
  `responseBody` TEXT NULL,
  `error` TEXT NULL,
  `leaseOwner` VARCHAR(64) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `revision` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  `archivedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `webhook_delivery_archives_subscriptionId_createdAt_idx` (`subscriptionId`, `createdAt`),
  INDEX `webhook_delivery_archives_archivedAt_idx` (`archivedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
