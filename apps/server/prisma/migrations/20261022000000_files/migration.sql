-- CreateTable
CREATE TABLE `files` (
    `id` VARCHAR(160) NOT NULL,
    `originalName` TEXT NOT NULL,
    `mimeType` VARCHAR(255) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL,
    `uploadedBy` VARCHAR(128) NOT NULL,
    `content` LONGBLOB NOT NULL,

    INDEX `files_uploadedAt_idx`(`uploadedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
