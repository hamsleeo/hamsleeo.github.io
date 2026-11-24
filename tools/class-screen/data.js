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
      theme: 'aurora',
      wallpaper: 'gradient',
      margins: { left: 20, right: 0, top: 0, bottom: 0 },
      zoom: 100,
      noticeAccent: '暖橘',
      /* 单双周基准：填“开学第一周那周的周一”日期(YYYY-MM-DD)，该周算单周；
         大屏据此按周推算单双周，未填时回退到自然年周数奇偶 */
      termStart: '',
      moduleOrder: ['schedule','current','homework','duty','countdown','overview','fun','groups','models','radar','notice','leave','attention'],
      hiddenModules: [],
      /* 手机喊话：老师从管理端发送，展示端检测 id 变化后弹层并朗读 */
      shout: { id: '', text: '', from: '班主任', duration: 12, speak: true, voice: 'xiaoxiao', voiceSpeed: 4, createdAt: '' },
      /* schedule 为兼容旧数据的“当日课表”；新数据以 weeklySchedule（周一~周日）为准 */
      schedule: baseSchedule,
      weeklySchedule: weeklySchedule,
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

  global.DEFAULT_STATE = createDefaultState();
  global.createDefaultState = createDefaultState;
  global.THEMES = {
    aurora:   { name: '极光青', a: '#16243d', b: '#1d3a48', c: '#2e5b58', accent: '#7fd6c0', accent2: '#ffc97a' },
    warm:     { name: '暖橘暮', a: '#2a1e2e', b: '#3c2b35', c: '#6b4a3c', accent: '#ffb98a', accent2: '#ffd98a' },
    ocean:    { name: '深海蓝', a: '#111d3a', b: '#173355', c: '#205878', accent: '#7fc7ff', accent2: '#a8e6ff' },
    forest:   { name: '松林绿', a: '#142a25', b: '#1e4034', c: '#376548', accent: '#9be0a6', accent2: '#e7dc94' },
    violet:   { name: '星云紫', a: '#1b1836', b: '#302653', c: '#4b3778', accent: '#c2a8ff', accent2: '#ffc4e1' },
    ink:      { name: '墨玉黑', a: '#101218', b: '#1b1f27', c: '#2c313d', accent: '#d7deea', accent2: '#f2c98a' },
    sakura:   { name: '樱花雨', a: '#2a1c2b', b: '#43283b', c: '#6b3a55', accent: '#ffb3d1', accent2: '#ffe0c7' },
    sunrise:  { name: '朝霞橙', a: '#2b1a17', b: '#4a2c1f', c: '#7a4526', accent: '#ffc08a', accent2: '#ffe0a3' },
    mint:     { name: '薄荷绿', a: '#112421', b: '#1a3a33', c: '#2c5f50', accent: '#8fe3c6', accent2: '#d4f0a8' },
    sky:      { name: '晴空蓝', a: '#12253a', b: '#1c3f5c', c: '#2e6a8e', accent: '#8fd4ff', accent2: '#ffe08a' },
    rose:     { name: '玫瑰红', a: '#2a1620', b: '#4a2033', c: '#7a3048', accent: '#ff9ec0', accent2: '#ffd08a' },
    gold:     { name: '鎏金韵', a: '#241d10', b: '#3d2f18', c: '#665024', accent: '#e8c979', accent2: '#ff9f6b' },
    lavender: { name: '薰衣草', a: '#1e1b33', b: '#332c55', c: '#54497e', accent: '#bfa9ff', accent2: '#ffc9e8' }
  };
  global.WALLPAPERS = {
    gradient:  { name: '渐变', css: 'none' },
    campus:    { name: '校园', css: 'linear-gradient(135deg, rgba(255,255,255,.5) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.5) 50%, rgba(255,255,255,.5) 75%, transparent 75%)' },
    classroom: { name: '课堂', css: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,.65) 0 8%, transparent 9%), radial-gradient(circle at 70% 70%, rgba(255,255,255,.45) 0 12%, transparent 13%)' },
    dots:      { name: '星点', css: 'radial-gradient(rgba(255,255,255,.6) 1px, transparent 1px)' },
    /* 纯色/渐变色罩：叠加在主题背景上，快速改变大屏整体色调 */
    blush:     { name: '粉霞', css: 'linear-gradient(125deg, rgba(255,160,190,.85) 0%, rgba(255,205,170,.5) 55%, transparent 100%)' },
    sunset:    { name: '晚霞', css: 'linear-gradient(130deg, rgba(255,140,90,.9) 0%, rgba(200,90,170,.7) 55%, transparent 100%)' },
    seafoam:   { name: '碧波', css: 'linear-gradient(130deg, rgba(110,235,210,.75) 0%, rgba(90,170,255,.6) 60%, transparent 100%)' },
    golden:    { name: '鎏金', css: 'linear-gradient(125deg, rgba(255,215,120,.9) 0%, rgba(255,150,80,.6) 60%, transparent 100%)' },
    moonlight: { name: '月夜', css: 'linear-gradient(140deg, rgba(120,150,255,.7) 0%, rgba(90,100,200,.5) 55%, rgba(20,30,70,.2) 100%)' },
    mintwash:  { name: '青雾', css: 'radial-gradient(1000px 700px at 15% 15%, rgba(160,255,220,.8) 0%, transparent 65%), radial-gradient(900px 600px at 90% 85%, rgba(160,220,255,.6) 0%, transparent 60%)' }
  };
})(window);
