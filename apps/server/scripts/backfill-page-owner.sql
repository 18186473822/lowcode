-- 存量页面创建者回填（一次性，可选执行）
--
-- 背景：迁移 20261027010000_page_owner 只新增可空列 pages.createdBy，不做自动回填。
--       createdBy 为 NULL 的存量页面按「仅管理员可写」保守处理。
--       若希望把存量页面归还给「最早发布该页面的人」，再手工执行本脚本。
--
-- 安全性：
--   * 仅更新 createdBy IS NULL 的行，可重复执行（幂等）；
--   * 只认 page_versions 中最小版本号的 createdBy（即首次发布者），无版本记录的页面保持 NULL；
--   * 建议先在只读副本/备份上跑，确认影响行数与预期一致。
--
-- 用法（示例）：
--   mysql -h 127.0.0.1 -u root -p lowcode < apps/server/scripts/backfill-page-owner.sql

-- 1) 预览：将回填的页面与目标创建者
SELECT p.id AS pageId, p.name, v.createdBy AS newCreatedBy, v.version AS firstVersion
FROM pages p
JOIN page_versions v ON v.pageId = p.id
WHERE p.createdBy IS NULL
  AND v.version = (
    SELECT MIN(v2.version) FROM page_versions v2 WHERE v2.pageId = p.id
  )
ORDER BY p.id;

-- 2) 回填
UPDATE pages p
JOIN page_versions v ON v.pageId = p.id
SET p.createdBy = v.createdBy
WHERE p.createdBy IS NULL
  AND v.version = (
    SELECT MIN(v2.version) FROM page_versions v2 WHERE v2.pageId = p.id
  );

-- 3) 复核：仍为 NULL 的页面（无历史版本，保持仅管理员可写）
SELECT p.id AS pageId, p.name
FROM pages p
WHERE p.createdBy IS NULL
ORDER BY p.id;
