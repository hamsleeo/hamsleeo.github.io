-- 教师工具箱 · 软件管理云端建表 + 初始数据
-- 用法：在云服务控制台的 SQL 查询页整段执行一次。
-- 执行后，后台「管理后台 → 软件管理」即可看到并编辑下面两条；
-- 即使不执行，前台下载页也会通过 assets/downloads-data.js 的内置清单显示它们。

create table if not exists public.downloads (
  id text primary key,
  name text not null,
  version text,
  size text,
  platform text,
  category text,
  icon text,
  url text not null,
  mirror text,
  description text,
  note text,
  sort_order int default 10,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.downloads enable row level security;
create policy downloads_read on public.downloads for select using (true);
create policy downloads_admin_write on public.downloads for all using (public.is_admin()) with check (public.is_admin());

insert into public.downloads (id, name, version, size, platform, category, icon, url, mirror, description, note, sort_order, enabled)
values
  ('class-screen-installer', '安装班务大屏', 'Windows 安装包', '196 KB', 'Windows 10/11 64 位', '教学工具', '🖥️',
   'files/class-screen-installer.exe', '',
   '把班务大屏装到教室电脑或办公电脑：桌面「教师端管理」和「班务大屏壁纸」两个快捷方式都指向本站域名，积分加减、行为点评、喊话、值日考勤随时用。悬浮控制台可拖到屏幕任意位置，也能收起成小条、点击再展开。',
   '安装包约 196 KB。安装时填班级代码（默认 main）。桌面快捷方式打开的是本站 www.smartlearner.top；若教师端登录后提示「来源未授权」，是云端白名单还没放行本站域名，此时数据只存本机，需管理员在云端补白名单。Windows 提示未知发布者时勾选“仍要运行”。',
   10, true),
  ('class-screen-manual', '班务大屏 · 班主任使用手册', 'HTML 版', '33 KB', '浏览器直接打开', '教学工具', '📖',
   'files/class-screen-manual.html', '',
   '从 5 分钟快速上手到积分统计、教室喊话、班级管理、管理员专区与常见问题，班主任照着做就能用好大屏。',
   '点「在线阅读」直接看，也可下载保存后转发给同事；建议先读第 1 章再安装。',
   11, true)
on conflict (id) do update set
  name = excluded.name, version = excluded.version, size = excluded.size,
  platform = excluded.platform, category = excluded.category, icon = excluded.icon,
  url = excluded.url, description = excluded.description, note = excluded.note,
  sort_order = excluded.sort_order, enabled = excluded.enabled, updated_at = now();
