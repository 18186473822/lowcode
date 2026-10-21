-- CreateTable
CREATE TABLE `flow_definitions` (
    `flowId` VARCHAR(64) NOT NULL,
    `modelId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `schemaJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `flow_definitions_modelId_idx`(`modelId`),
    PRIMARY KEY (`flowId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flow_instances` (
    `id` VARCHAR(64) NOT NULL,
    `flowId` VARCHAR(64) NOT NULL,
    `modelId` VARCHAR(64) NOT NULL,
    `recordId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `currentNodeId` VARCHAR(64) NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `tasksJson` JSON NOT NULL,
    `historyJson` JSON NOT NULL,

    INDEX `flow_instances_modelId_recordId_idx`(`modelId`, `recordId`),
    INDEX `flow_instances_flowId_idx`(`flowId`),
    INDEX `flow_instances_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ops_events` (
    `seq` INTEGER NOT NULL AUTO_INCREMENT,
    `id` VARCHAR(80) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `pageId` VARCHAR(64) NULL,
    `pageVersion` VARCHAR(16) NULL,
    `source` VARCHAR(16) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `message` TEXT NULL,
    `durationMs` DOUBLE NULL,
    `detailJson` JSON NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ops_events_id_key`(`id`),
    INDEX `ops_events_type_idx`(`type`),
    INDEX `ops_events_pageId_idx`(`pageId`),
    INDEX `ops_events_at_idx`(`at`),
    PRIMARY KEY (`seq`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_config` (
    `id` VARCHAR(32) NOT NULL,
    `theme` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
