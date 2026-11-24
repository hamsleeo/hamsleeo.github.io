/* ============================================================
   软件下载 · 内置清单（随站点代码发布）
   页面读取顺序：云端 downloads 表 > 本文件的内置清单
   只有在云服务不可用、或后台还没建记录时才用这份清单兜底，
   并在页面上明确提示「当前为内置清单」。

   字段说明：
   id          唯一标识（英文小写、连字符），与后台记录同 ID 时以后台为准
   name        软件名称
   version     版本号 / 版本描述
   size        体积，可直接写 '215 MB'，也可写字节数 225443840
   platform    适用系统，例：Windows 10/11 64 位
   category    分类，见下方 DOWNLOAD_CATEGORIES
   icon        卡片图标（emoji 或单字符）
   url         下载地址：仓库内文件写 files/xxx.exe，外部写 https:// 完整网址
   mirror      备用链接（网盘等），可为空
   description 一句话说明用途
   note        安装提示（是否需要注册、是否含捆绑、是否需断网安装等）
   sort_order  排序，小号在前
   bundled     true 表示即使云端没有记录也显示
   ============================================================ */
window.DOWNLOAD_CATEGORIES = ['系统工具', '办公软件', '教学工具', '多媒体', '其他'];

window.DOWNLOAD_SITE_NOTE = '本站软件为校内整理，仅限教学办公使用。安装前请确认来源；标了「网盘」的请到备用链接下载，安装时注意取消捆绑勾选。';

window.DOWNLOAD_FALLBACK = [
  {
    id: 'class-screen-installer',
    name: '安装班务大屏',
    version: 'Windows 安装包',
    size: '196 KB',
    platform: 'Windows 10/11 64 位',
    category: '教学工具',
    icon: '🖥️',
    url: 'files/class-screen-installer.exe',
    mirror: '',
    description: '把班务大屏装到教室电脑或办公电脑：桌面「教师端管理」和「班务大屏壁纸」两个快捷方式都指向本站域名，积分加减、行为点评、喊话、值日考勤随时用。悬浮按钮可拖到屏幕任意位置，单击下拉/收起，长按 0.6 秒调出大屏。',
    note: '安装包约 196 KB。安装时填班级代码（默认 main）。桌面快捷方式打开的是本站 www.smartlearner.top。悬浮按钮操作：单击=下拉展开/往上收起，长按0.6秒=调出大屏，拖动=移位；想露出桌面图标请右键托盘选「收起大屏」。Windows 提示未知发布者时勾选“仍要运行”。',
    sort_order: 10,
    bundled: true
  },
  {
    id: 'class-screen-manual',
    name: '班务大屏 · 班主任使用手册',
    version: 'HTML 版',
    size: '33 KB',
    platform: '浏览器直接打开',
    category: '教学工具',
    icon: '📖',
    url: 'files/class-screen-manual.html',
    mirror: '',
    description: '从 5 分钟快速上手到积分统计、教室喊话、班级管理、管理员专区与常见问题，班主任照着做就能用好大屏。',
    note: '点「在线阅读」直接看，也可下载保存后转发给同事；建议先读第 1 章再安装。',
    sort_order: 11,
    bundled: true
  }
];
