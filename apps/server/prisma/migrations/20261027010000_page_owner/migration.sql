-- 页面创建者：写权限归属判定（创建者或 '*' 管理员可编辑）
-- 存量为 NULL，按「仅管理员可编辑」保守处理，不做自动回填。
ALTER TABLE `pages` ADD COLUMN `createdBy` VARCHAR(64) NULL;
