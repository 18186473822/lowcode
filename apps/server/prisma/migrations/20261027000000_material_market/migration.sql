-- Phase 4 · 物料市场（2026-10-27）
-- 物料草稿/审核状态 + 发布版本快照 + 租户级安装状态。
-- 版本快照不建外键：删除物料时仍保留已发布历史用于审计。

CREATE TABLE `market_materials` (
    `id` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(500) NULL,
    `category` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `component` VARCHAR(64) NULL,
    `metaJson` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(64) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(64) NULL,
    `reviewDecision` VARCHAR(16) NULL,
    `reviewNote` VARCHAR(500) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedBy` VARCHAR(64) NULL,
    `publishedVersion` VARCHAR(32) NULL,

    INDEX `market_materials_status_idx`(`status`),
    INDEX `market_materials_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `market_material_versions` (
    `materialId` VARCHAR(64) NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `entryJson` JSON NOT NULL,
    `note` VARCHAR(500) NULL,
    `publishedBy` VARCHAR(64) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,

    INDEX `market_material_versions_publishedAt_idx`(`publishedAt`),
    PRIMARY KEY (`materialId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `market_installs` (
    `tenantId` VARCHAR(64) NOT NULL,
    `materialId` VARCHAR(64) NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `installedBy` VARCHAR(64) NOT NULL,
    `installedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,

    INDEX `market_installs_materialId_idx`(`materialId`),
    PRIMARY KEY (`tenantId`, `materialId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
