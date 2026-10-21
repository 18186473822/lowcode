-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(64) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `displayName` VARCHAR(128) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `perms` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` VARCHAR(64) NOT NULL,
    `roleKey` VARCHAR(64) NOT NULL,

    INDEX `user_roles_roleKey_idx`(`roleKey`),
    PRIMARY KEY (`userId`, `roleKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pages` (
    `id` VARCHAR(64) NOT NULL,
    `appId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `currentVersion` INTEGER NOT NULL DEFAULT 0,
    `draft` JSON NULL,
    `draftUpdatedAt` DATETIME(3) NULL,
    `draftUpdatedBy` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pages_appId_idx`(`appId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_versions` (
    `pageId` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL,
    `schemaJson` JSON NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,

    PRIMARY KEY (`pageId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `models` (
    `id` VARCHAR(64) NOT NULL,
    `schemaJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_records` (
    `modelId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `data_records_modelId_deletedAt_idx`(`modelId`, `deletedAt`),
    PRIMARY KEY (`modelId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rbac_page_grants` (
    `pageId` VARCHAR(64) NOT NULL,
    `roles` JSON NOT NULL,

    PRIMARY KEY (`pageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleKey_fkey` FOREIGN KEY (`roleKey`) REFERENCES `roles`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `page_versions` ADD CONSTRAINT `page_versions_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_records` ADD CONSTRAINT `data_records_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `models`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
