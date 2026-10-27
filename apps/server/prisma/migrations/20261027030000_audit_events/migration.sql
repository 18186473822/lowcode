-- 安全审计事件表：只记录服务端拒绝（登录失败 / 401 / 403 / 429）
CREATE TABLE `audit_events` (
  `id` VARCHAR(36) NOT NULL,
  `at` DATETIME(3) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `username` VARCHAR(64) NULL,
  `ip` VARCHAR(64) NOT NULL,
  `method` VARCHAR(8) NOT NULL,
  `path` VARCHAR(512) NOT NULL,
  `status` INTEGER NOT NULL,
  `code` VARCHAR(64) NULL,
  `userAgent` VARCHAR(256) NULL,

  INDEX `audit_events_at_idx`(`at`),
  INDEX `audit_events_type_at_idx`(`type`, `at`),
  INDEX `audit_events_username_at_idx`(`username`, `at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
