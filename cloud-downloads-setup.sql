-- 教师工具箱 · 下载页已下架（2026-11-24）
-- 原「建表 + 初始数据」脚本已废弃：前台下载页整页删除，安装包改为本地按班级打包，
-- 不再随站点发布。请勿再执行旧的插入语句，否则会把下载条目重新写回云端。
--
-- 下架 / 清空云端清单请改用：cloud-downloads-clear.sql

-- 如需彻底移除云端表（可选，一般不必执行）：
-- drop policy if exists downloads_admin_write on public.downloads;
-- drop policy if exists downloads_read on public.downloads;
-- drop table if exists public.downloads;
