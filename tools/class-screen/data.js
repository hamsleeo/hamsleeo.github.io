/* 班级班务大屏 · 演示数据
   班务模块参考「行为簿 · 班务大屏」，积分体系参考 TeacherLab 班级积分 */
(function (global) {
  var names = [
    '陈思远','林子安','周以宁','沈知远','张三','李四','王五','彭七','陈八','赵一鸣',
    '刘雨桐','黄子涵','吴嘉怡','郑书瑶','孙浩然','马思琪','朱梓涵','胡可欣','郭子墨','何欣妍',
    '高梓萱','罗嘉豪','梁静怡','宋明轩','谢雨萱','唐博文','韩佳宁','冯皓宇','邓语彤','曹子轩',
    '曾欣悦','肖宇航','田心怡','董泽宇','袁诗涵','潘俊杰','于思源','蒋若曦','蔡文博','余梓晴',
    '杜宇航','叶清欢','程一诺','魏子墨','苏晓彤','吕承泽','丁嘉禾','任书宁','卢俊熙','方雨泽'
  ];
  var dims = ['学习态度','课堂纪律','协作贡献','文明礼仪','卫生劳动','集体荣誉'];
  var dimShort = ['学习','纪律','协作','文明','卫生','集体'];

  var behaviors = {
    '学习态度': [
      { label: '主动回答', value: 2 }, { label: '认真笔记', value: 2 },
      { label: '月考进步', value: 5 }, { label: '作业全对', value: 3 },
      { label: '上课走神', value: -2 }, { label: '作业未交', value: -3 }
    ],
    '课堂纪律': [
      { label: '纪律标兵', value: 3 }, { label: '安静自习', value: 2 },
      { label: '迟到', value: -2 }, { label: '课堂讲话', value: -2 }, { label: '带违禁品', value: -5 }
    ],
    '协作贡献': [
      { label: '帮助同学', value: 3 }, { label: '小组贡献', value: 3 },
      { label: '主动分享', value: 2 }, { label: '不参与讨论', value: -2 }
    ],
    '文明礼仪': [
      { label: '主动问好', value: 2 }, { label: '礼貌待人', value: 2 },
      { label: '文明用餐', value: 1 }, { label: '不文明用语', value: -3 }
    ],
    '卫生劳动': [
      { label: '值日认真', value: 3 }, { label: '主动保洁', value: 2 },
      { label: '整理书柜', value: 2 }, { label: '卫生不合格', value: -2 }
    ],
    '集体荣誉': [
      { label: '比赛获奖', value: 6 }, { label: '为班争光', value: 5 },
      { label: '板报贡献', value: 3 }, { label: '损害集体', value: -4 }
    ]
  };

  // 使用稳定伪随机，保证每次刷新演示数据一致
  function rnd(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
  var students = names.map(function (name, i) {
    var base = 82 + Math.floor(rnd(i + 1) * 46);
    if (i === 0) base = 138;
    if (i === 1) base = 126;
    if (i === 2) base = 118;
    if (i === 8) base = 132;
    if (i === 9) base = 64;
    if (i === 13) base = 58;
    var dim = {};
    dims.forEach(function (d, j) { dim[d] = 12 + Math.floor(rnd(i * 7 + j + 3) * 20); });
    return {
      id: 'S' + (i + 1),
      no: i + 1,
      name: name,
      points: base,
      positive: 30 + Math.floor(rnd(i + 11) * 60),
      negative: Math.floor(rnd(i + 31) * 14),
      dim: dim,
      trend: [0, 1, 2, 3, 4, 5, 6].map(function (d) { return 4 + Math.floor(rnd(i * 13 + d) * 12); })
    };
  });

  var groups = [
    { name: '星火学习组', points: 428, members: ['陈思远','林子安','周以宁','沈知远','刘雨桐','黄子涵','张三','李四'] },
    { name: '晨曦值日组', points: 396, members: ['陈八','赵一鸣','吴嘉怡','郑书瑶','孙浩然','马思琪','彭七','王五'] },
    { name: '致远小组', points: 372, members: ['朱梓涵','胡可欣','郭子墨','何欣妍','高梓萱','罗嘉豪','梁静怡','宋明轩'] },
    { name: '青禾小组', points: 351, members: ['谢雨萱','唐博文','韩佳宁','冯皓宇','邓语彤','曹子轩','曾欣悦','肖宇航'] },
    { name: '逐光小组', points: 337, members: ['田心怡','董泽宇','袁诗涵','潘俊杰','于思源','蒋若曦','蔡文博','余梓晴'] },
    { name: '飞扬小组', points: 318, members: ['杜宇航','叶清欢','程一诺','魏子墨','苏晓彤','吕承泽','丁嘉禾','任书宁'] }
  ];

  function dateStr(offsetDays) {
    var d = new Date(); d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function timeStr(offsetMinutes) {
    var d = new Date(Date.now() - offsetMinutes * 60000);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  function createDefaultState() {
    // 默认作息：各节次上下课时间预设，教师端可随时修改；快速添加课程时自动套用
    var defaultPeriods = [
      { name: '第1节', start: '08:00', end: '08:40' },
      { name: '第2节', start: '08:50', end: '09:30' },
      { name: '第3节', start: '09:50', end: '10:30' },
      { name: '第4节', start: '10:40', end: '11:20' },
      { name: '第5节', start: '14:00', end: '14:40' },
      { name: '第6节', start: '14:50', end: '15:30' },
      { name: '第7节', start: '15:40', end: '16:20' },
      { name: '第8节', start: '16:40', end: '17:20' },
      { name: '晚自习一', start: '19:00', end: '19:40' },
      { name: '晚自习二', start: '19:50', end: '20:30' }
    ];
    // 默认课表：周一至周五同一套示范课表，周末留空；教师端可按周分别编辑
    var baseSchedule = [
      { subject: '语文', start: '08:00', end: '08:40' },
      { subject: '数学', start: '08:50', end: '09:30' },
      { subject: '英语', start: '09:50', end: '10:30' },
      { subject: '物理', start: '10:40', end: '11:20' },
      { subject: '化学', start: '14:00', end: '14:40' },
      { subject: '历史', start: '14:50', end: '15:30' },
      { subject: '体育与健康', start: '15:40', end: '16:20' },
      // 第八节示范单双周：单周“道德与法治”，双周“心理健康”；写法 单周科目/双周科目
      { subject: '道德与法治/心理健康', start: '16:40', end: '17:20' }
    ];
    // weeklySchedule 的键 1~7 表示周一~周日；大屏按当天星期自动取对应一天
    var weeklySchedule = {};
    for (var wd = 1; wd <= 7; wd++) {
      weeklySchedule[wd] = wd <= 5 ? baseSchedule.map(function (c) { return { subject: c.subject, start: c.start, end: c.end }; }) : [];
    }
    return {
      version: 1,
      className: '915班',
      slogan: '我们班最棒',
      quote: '睡个安稳觉，明天才有清楚的头脑去做在意的事。',
      theme: 'cloudlight',
      wallpaper: 'gradient',
      margins: { left: 20, right: 0, top: 0, bottom: 0 },
      zoom: 100,
      noticeAccent: '暖橘',
      /* 单双周基准：填“开学第一周那周的周一”日期(YYYY-MM-DD)，该周算单周；
         大屏据此按周推算单双周，未填时回退到自然年周数奇偶 */
      termStart: '',
      moduleOrder: ['schedule','current','homework','duty','countdown','overview','fun','groups','models','radar','notice','leave','attention'],
      hiddenModules: [],
      /* 板块标题样式：每模块可单独设标题颜色(titleColor)与字号(titleSize,px)。
         空字符串表示沿用主题默认色/默认字号。管理端配置，大屏实时应用。 */
      moduleStyles: {
        schedule: { titleColor: '', titleSize: 0 }, current: { titleColor: '', titleSize: 0 },
        homework: { titleColor: '', titleSize: 0 }, duty: { titleColor: '', titleSize: 0 },
        countdown: { titleColor: '', titleSize: 0 }, overview: { titleColor: '', titleSize: 0 },
        fun: { titleColor: '', titleSize: 0 }, groups: { titleColor: '', titleSize: 0 },
        models: { titleColor: '', titleSize: 0 }, radar: { titleColor: '', titleSize: 0 },
        notice: { titleColor: '', titleSize: 0 }, leave: { titleColor: '', titleSize: 0 },
        attention: { titleColor: '', titleSize: 0 }
      },
      /* 板块行高（旧版网格遗留，保留兼容）：大屏 4 行网格各行高度(px)。 */
      rowHeights: [124, 252, 272, 228],
      /* 自由布局：每个板块在画布中的矩形，单位是画布宽高的百分比(0~100)。
         x/y=左上角，w/h=宽高。编辑模式下拖动板块本体移动、拖八角缩放，
         结果存这里；null 的模块用 defaultPanelRects 兜底。 */
      panelRects: defaultPanelRects(),
      /* 布局版本号：谁最后改了板块位置/大小，谁就把这个时间戳顶到最新。
         大屏本机拖拽会写本地覆盖记录；教师端保存布局会写云端。
         同步时只有"本机版本 >= 云端版本"才用本机布局，否则教师端新版布局生效。 */
      layoutVersion: 0,
      /* 手机喊话：老师从管理端发送，展示端检测 id 变化后弹层并朗读 */
      shout: { id: '', text: '', from: '班主任', duration: 12, speak: true, voice: 'xiaoxiao', voiceSpeed: 4, createdAt: '' },
      /* 喊话蒙版样式：班主任在后台「教室喊话」页选模板 + 背景色。
         template=模板 key，bgColor=自定义背景色(#rrggbb，空=用模板默认)。 */
      shoutStyle: { template: 'classic', bgColor: '' },
      /* schedule 为兼容旧数据的“当日课表”；新数据以 weeklySchedule（周一~周日）为准 */
      schedule: baseSchedule,
      weeklySchedule: weeklySchedule,
      /* 作息时间预设：各节次上下课时间，教师端可改 */
      periods: defaultPeriods,
      homework: [
        { subject: '语文', items: [
          { title: '第六单元《出师表》课后练习', detail: '完成课后「思考探究」第一、二、三题；朗读课文两遍；整理「陟罚臧否」等五个重点词语。' },
          { title: '第六单元《陈涉世家》文言积累', detail: '熟读第1、2段，梳理陈胜起义的起因经过，解释「会」「度」「等死」三个词语并翻译「王侯将相宁有种乎」。' }
        ]},
        { subject: '数学', items: [
          { title: '二次函数单元卷 第1—12题', detail: '限时 40 分钟完成，错题标注对应课本页码。' },
          { title: '错题本整理', detail: '整理本周三次小测错题，写出正确解法。' }
        ]},
        { subject: '英语', items: [
          { title: 'Unit 8 单词默写', detail: 'Unit 8 核心词汇 45 个，明天课前听写。' },
          { title: '课文跟读打卡', detail: '跟读 Section B 2b 三遍并录音。' }
        ]}
      ],
      duty: [
        { task: '扫地', names: '林子安、周以宁' },
        { task: '擦黑板', names: '沈知远' },
        { task: '倒垃圾', names: '陈八' },
        { task: '整理讲台', names: '刘雨桐、黄子涵' },
        { task: '拖地', names: '赵一鸣、孙悦' },
        { task: '摆放桌椅', names: '李明轩' },
        { task: '关窗断电', names: '王思远、周小满' }
      ],
      countdown: { title: '班级读书分享会', date: dateStr(10) },
      announcements: [
        { title: '本周班务提醒', text: '本周末准备语文课本和英语单词本。', accent: '#ffc97a' },
        { title: '作业规范', text: '数学作业请用红笔辅助线与证明过程，订正后交在作业本内。', accent: '#7fd6c0' },
        { title: '值日提醒', text: '放学请按值日安排整理桌椅、擦净黑板，离开教室前检查门窗。', accent: '#9db8ff' }
      ],
      /* 请假通报：教师端登记，大屏自动滚动展示当天及最近的请假 */
      leaves: [
        { name: '张三', reason: '感冒发热，家长接回休息', start: dateStr(0), end: dateStr(0) },
        { name: '李四', reason: '牙科就诊，下午返校', start: dateStr(1), end: dateStr(1) }
      ],
      models: [
        { name: '陈八', role: '学习标兵', score: 132, emoji: '🧑‍🎓' },
        { name: '李四', role: '纪律之星', score: 118, emoji: '👩‍🏫' },
        { name: '15张三', role: '劳动之星', score: 109, emoji: '🧹' },
        { name: '林子安', role: '文明之星', score: 97, emoji: '🌟' }
      ],
      fun: [
        { subject: '英语', title: 'Unit 8 单词默写', total: 45, done: 3, unfinished: '12张三、15张三、李四、彭七、陈八' },
        { subject: '语文', title: '《出师表》背诵', total: 45, done: 29, unfinished: '赵一鸣、王五、彭七' },
        { subject: '数学', title: '单元卷订正', total: 45, done: 38, unfinished: '李四、陈八' }
      ],
      students: students,
      groups: groups,
      dims: dims,
      dimShort: dimShort,
      behaviors: behaviors,
      weekNet: [18, 26, 14, 31, 22, 9, 27],
      events: [
        { time: timeStr(12), name: '陈思远', label: '主动回答', delta: 2 },
        { time: timeStr(28), name: '林子安', label: '值日认真', delta: 3 },
        { time: timeStr(45), name: '彭七', label: '课堂讲话', delta: -2 },
        { time: timeStr(67), name: '周以宁', label: '帮助同学', delta: 3 },
        { time: timeStr(92), name: '张三', label: '作业未交', delta: -3 },
        { time: timeStr(130), name: '陈八', label: '比赛获奖', delta: 6 }
      ]
    };
  }

  /* 默认自由布局：把原 12列×4行 网格的排布换算成百分比矩形。
     列: 12 列, gap≈1.1%; 行高按网格默认 136/234/272/284(合计≈926, gap 14)。
     每行 fill 到 100% 宽，模块按 moduleOrder 里的列跨度依次排布。 */
  var COLUMN_SPAN = {
    schedule: 12, current: 3, homework: 5, duty: 2, countdown: 2,
    overview: 3, fun: 3, groups: 3, models: 3, radar: 2,
    notice: 3, leave: 3, attention: 4
  };
  var ROW_ORDER = [
    ['schedule'],
    ['current', 'homework', 'duty', 'countdown'],
    ['overview', 'fun', 'groups', 'models'],
    ['radar', 'notice', 'leave', 'attention']
  ];
  var ROW_H = [15.2, 26.0, 30.0, 28.8]; // 每行的“格子高度”(含下方空隙)，合计 100
  function defaultPanelRects() {
    var rects = {};
    var GAP = 1.0; // 模块之间的空隙（百分比，横向与纵向一致）
    ROW_ORDER.forEach(function (row, ri) {
      var spans = row.map(function (m) { return COLUMN_SPAN[m] || 3; });
      var total = spans.reduce(function (a, b) { return a + b; }, 0);
      var gapTotal = GAP * (row.length - 1);
      var usable = 100 - gapTotal;
      var x = 0;
      var y = +ROW_H.slice(0, ri).reduce(function (a, b) { return a + b; }, 0).toFixed(2);
      var h = +(ROW_H[ri] - GAP).toFixed(2);
      row.forEach(function (m, i) {
        var w = +(usable * spans[i] / total).toFixed(2);
        rects[m] = { x: +x.toFixed(2), y: y, w: w, h: h };
        x = +(x + w + GAP).toFixed(2);
      });
    });
    return rects;
  }

  /* 喊话蒙版模板：班主后台可选。size 为大字字号，accent 为进度条/标题色。 */
  global.SHOUT_TEMPLATES = {
    classic: { name: '经典墨绿', desc: '大屏原版 · 沉稳清晰', icon: '📢', bg: '#103f34', fg: '#f2fff8', accent: '#5ddc9e', accentLight: '#0f6e56', size: 64 },
    banner:  { name: '醒目横幅', desc: '大字横幅 · 紧急通知', icon: '📣', bg: '#8a1c1c', fg: '#fff6e8', accent: '#ffcf6a', accentLight: '#993c1d', size: 78 },
    blue:    { name: '沉稳蓝调', desc: '蓝色主题 · 正式场合', icon: '💡', bg: '#123a63', fg: '#eaf4ff', accent: '#7cc4ff', accentLight: '#185fa5', size: 64 },
    fresh:   { name: '清新浅色', desc: '浅底深字 · 柔和不刺眼', icon: '🌿', bg: '#eef7f2', fg: '#173d31', accent: '#1d9e75', accentLight: '#0f6e56', size: 64 },
    gold:    { name: '荣耀金辉', desc: '金色调 · 表扬表彰', icon: '⭐', bg: '#3d2f18', fg: '#fff6dd', accent: '#e8c979', accentLight: '#854f0b', size: 66 }
  };
  /* 把 state.shoutStyle 解析成可直接用的样式：自定义背景色优先，
     文字色按背景亮度自动取黑/白，进度条色也随深浅切换，保证任何颜色都看得清。 */
  global.resolveShoutStyle = function (st) {
    var cfg = (st && st.shoutStyle) || {};
    var tpl = global.SHOUT_TEMPLATES[cfg.template] || global.SHOUT_TEMPLATES.classic;
    var bg = (/^#[0-9a-f]{6}$/i.test(cfg.bgColor || '') ? cfg.bgColor : tpl.bg);
    var r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
    var light = (r * 299 + g * 587 + b * 114) / 1000 > 150;
    return {
      template: global.SHOUT_TEMPLATES[cfg.template] ? cfg.template : 'classic',
      bg: bg, fg: light ? '#14251f' : '#ffffff',
      accent: light ? tpl.accentLight : tpl.accent,
      icon: tpl.icon, size: tpl.size, name: tpl.name
    };
  };
  global.DEFAULT_STATE = createDefaultState();
  global.createDefaultState = createDefaultState;
  global.defaultPanelRects = defaultPanelRects;
  global.COLUMN_SPAN = COLUMN_SPAN;
  global.DEFAULT_PERIODS = createDefaultState().periods;
  global.THEMES = {
    /* ===== 浅色主题（light:true，深色文字 + 浅色面板）——排在前面，供优先选择 ===== */
    cloudlight:     { name: '云舒白', light: true, a: '#eef3fa', b: '#dde8f5', c: '#cbdcef', accent: '#2f6fb0', accent2: '#c4762c' },
    creamlight:     { name: '奶油黄', light: true, a: '#fff9ee', b: '#f7ecd7', c: '#efdcb9', accent: '#a86a1e', accent2: '#3e7a63' },
    sakuralight:    { name: '浅樱粉', light: true, a: '#fff2f6', b: '#fae1ea', c: '#f2c9d9', accent: '#b03a63', accent2: '#7a56a8' },
    mintlight:      { name: '薄荷白', light: true, a: '#effaf5', b: '#dbf0e6', c: '#c2e5d4', accent: '#1c8062', accent2: '#9a7410' },
    lavenderlight:  { name: '浅薰紫', light: true, a: '#f4f1ff', b: '#e7e0fa', c: '#d6caf1', accent: '#6345aa', accent2: '#a8513a' },
    skyblue:        { name: '晴空蓝', light: true, a: '#f0f7ff', b: '#dceaf8', c: '#c2dcf0', accent: '#2563a8', accent2: '#b5651d' },
    peachcream:     { name: '蜜桃橘', light: true, a: '#fff6f0', b: '#ffe8d9', c: '#f7d2bb', accent: '#b5562b', accent2: '#2f7a68' },
    ivory:          { name: '象牙白', light: true, a: '#fdfcf7', b: '#f5f1e4', c: '#e9e2cd', accent: '#7a6a35', accent2: '#3f6f8f' },
    seaglass:       { name: '海玻璃', light: true, a: '#f0fbfa', b: '#d8f1ee', c: '#bce3de', accent: '#137a70', accent2: '#a86a2c' },
    snowfield:      { name: '雪原白', light: true, a: '#f7f9fb', b: '#e9eef3', c: '#d9e2ea', accent: '#3c556e', accent2: '#8a6632' },
    buttercream:    { name: '奶油香', light: true, a: '#fffcf0', b: '#fbf3d6', c: '#f2e6b8', accent: '#8a7018', accent2: '#396e5a' },
    /* ===== 暖色调主题（浅色暖底 + 暖色强调）——营造温暖教室氛围 ===== */
    apricot:        { name: '杏子暖', light: true, a: '#fff6ec', b: '#ffe9d2', c: '#f8d4b4', accent: '#b05a24', accent2: '#8a3f2a' },
    coral:          { name: '珊瑚暖', light: true, a: '#fff3ee', b: '#ffe0d4', c: '#f9c9b7', accent: '#c05233', accent2: '#9a6a1e' },
    honey:          { name: '蜜糖金', light: true, a: '#fffbef', b: '#fcf1d4', c: '#f4e2b0', accent: '#a06a12', accent2: '#a8482a' },
    rosegold:       { name: '玫瑰金', light: true, a: '#fff5f1', b: '#fbe3d9', c: '#f4cabe', accent: '#b2513e', accent2: '#a07a1e' },
    terracotta:     { name: '陶土暖', light: true, a: '#fdf5ef', b: '#f4e4d7', c: '#e8cdb9', accent: '#98553a', accent2: '#7a4a2e' },
    warmyellow:     { name: '暖阳黄', light: true, a: '#fffdf2', b: '#fff5d6', c: '#f9e8ab', accent: '#967016', accent2: '#b5562b' },
    /* ===== 深色主题——仅保留各班在用的 4 个，去掉重复深色调 ===== */
    aurora:   { name: '极光青', a: '#16243d', b: '#1d3a48', c: '#2e5b58', accent: '#7fd6c0', accent2: '#ffc97a' },
    gold:     { name: '鎏金韵', a: '#241d10', b: '#3d2f18', c: '#665024', accent: '#e8c979', accent2: '#ff9f6b' },
    rose:     { name: '玫瑰红', a: '#2a1620', b: '#4a2033', c: '#7a3048', accent: '#ff9ec0', accent2: '#ffd08a' },
    mint:     { name: '薄荷绿', a: '#112421', b: '#1a3a33', c: '#2c5f50', accent: '#8fe3c6', accent2: '#d4f0a8' }
  };
  global.WALLPAPERS = {
    /* 浅色/中性背景——排在前面，与浅色主题搭配更柔和 */
    gradient:  { name: '渐变', css: 'none' },
    campus:    { name: '校园', css: 'linear-gradient(135deg, rgba(255,255,255,.5) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.5) 50%, rgba(255,255,255,.5) 75%, transparent 75%)' },
    classroom: { name: '课堂', css: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,.65) 0 8%, transparent 9%), radial-gradient(circle at 70% 70%, rgba(255,255,255,.45) 0 12%, transparent 13%)' },
    dots:      { name: '星点', css: 'radial-gradient(rgba(255,255,255,.6) 1px, transparent 1px)' },
    mintwash:  { name: '青雾', css: 'radial-gradient(1000px 700px at 15% 15%, rgba(160,255,220,.8) 0%, transparent 65%), radial-gradient(900px 600px at 90% 85%, rgba(160,220,255,.6) 0%, transparent 60%)' },
    blush:     { name: '粉霞', css: 'linear-gradient(125deg, rgba(255,190,210,.7) 0%, rgba(255,220,190,.45) 55%, transparent 100%)' },
    cloudwhite:{ name: '云白', css: 'radial-gradient(900px 600px at 20% 15%, rgba(255,255,255,.9) 0%, transparent 70%), radial-gradient(800px 500px at 85% 85%, rgba(235,245,255,.75) 0%, transparent 65%)' },
    sunrise:   { name: '晨曦', css: 'linear-gradient(130deg, rgba(255,235,190,.75) 0%, rgba(255,205,170,.45) 55%, transparent 100%)' },
    peachglow: { name: '蜜桃光', css: 'radial-gradient(900px 600px at 18% 18%, rgba(255,215,190,.85) 0%, transparent 65%), radial-gradient(800px 500px at 88% 82%, rgba(255,230,180,.6) 0%, transparent 65%)' },
    ambermist: { name: '琥珀雾', css: 'linear-gradient(120deg, rgba(255,205,130,.7) 0%, rgba(255,170,120,.5) 55%, transparent 100%)' },
    /* 偏艳色罩——保留但放到后面 */
    golden:    { name: '鎏金', css: 'linear-gradient(125deg, rgba(255,215,120,.9) 0%, rgba(255,150,80,.6) 60%, transparent 100%)' },
    sunset:    { name: '晚霞', css: 'linear-gradient(130deg, rgba(255,140,90,.9) 0%, rgba(200,90,170,.7) 55%, transparent 100%)' }
  };
})(window);
