-- 2026-10-29 P1：应用配置增加「应用设置」列。
-- theme 保持原列不动；name / icon / entry / menus 统一存 settings（JSON）。
-- 可空、存量行为 NULL —— 不改变既有读取路径，回滚只需 DROP COLUMN。
ALTER TABLE `app_config` ADD COLUMN `settings` JSON NULL;
