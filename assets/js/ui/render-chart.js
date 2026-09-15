/*!
 * 连山易 · 排盘页渲染器（render-chart.js）
 * ---------------------------------------------------------------------------
 * 严格按 chartData 渲染，不做任何计算、不做任何结论。
 * 参考图区块编号（见 docs/行动计划.md 第 1 节）：
 *   ① 基础信息表  ② 四柱爻位大表  ③ 十二值符大运表
 *   ⑤ 本命批注条  ⑥ 天地盘大字阵  ⑦ 元运旬交互表    ⑧ 年历行  ⑨ 月历行 + 日/时表
 *   ⑩ 卦象面板    ⑪ 底部导航
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var P = root.LSY.pv;
  var esc = P.esc;
  var D = root.LSY.data.core;      // 模块级字典引用（供各渲染函数共享）

  function h(html) { return html; }

  /** 阴阳 class */
  function yy(ganOrZhi, kind) {
    var list = kind === 'gan' ? D.GAN_YANG : D.ZHI_YANG;
    return list.indexOf(ganOrZhi) >= 0 ? 'yang' : 'yin';
  }

  // ==================================================== ① 基础信息表
  // 【列宽网格】3 列均分（33.33% × 3）。
  //   各行 colspan 按此网格分配：
  //     公历/农历/节气  标签1 + 值3       = 4 单元
  //     开元            标签1 + 值2 + 值1 = 4 单元
  //     岁月            标签1 + 值1×3     = 4 单元 → 岁/月/天 三格**均分**
  //     周日            标签1 + 值1×3     = 4 单元 → 右侧三格按内容长度自适应
  function basicInfo(cd) {
    var b = cd.calendarData, s = b.solar, l = b.lunar, jq = b.jieqi;
    var ext = b.external || {};
    var rows = [];

    rows.push('<tr><td class="lbl">公历</td><td class="val yang" colspan="3">'
      + esc(s.text) + '</td></tr>');

    rows.push('<tr><td class="lbl">农历</td><td class="val yin" colspan="3">'
      + esc(l.text)
      + ' <span class="tiny">(' + esc(l.shengxiao) + '年)</span>'
      + '</td></tr>');

    // 开元 = 轩辕纪元 + 农历生肖
    rows.push('<tr><td class="lbl">开元</td>'
      + '<td class="val" colspan="2">轩辕纪元：' + P.badge(numCn(b.xuanyuan.value), b.xuanyuan) + '</td>'
      + '<td class="val">农历：' + esc(l.shengxiao) + '年</td></tr>');

    // 岁月：三格（岁 / 月 / 天），**数字只保留一位小数**
    //   取值 = 当前时刻 − 出生时刻（与 rectify 的 age 字段一致）
    //   使用者 2026-09-11 要求：删除「按当前时刻与出生时刻求差」说明文字，
    //   左侧标签位改用数字填充（即：岁月行不再有文字标签，直接是三个数值）
    (function () {
      var a = cd.calendarData.age;
      var af = { field_status: 'derived_candidate', field_id: 'calendar.age',
        rule_id: 'LSY-TIME-AGE',
        source_refs: ['参考图 ① 岁月行（三格：岁 / 月 / 天）'],
        exception_policy: '岁月 = 当前时刻 − 出生时刻，随时间实时变化。'
          + '参考图数值取决于其截图时刻，故与本地当前时刻的取值必然不同；'
          + '本字段为「此时此刻」的实时值，不作历史复现。小数保留一位。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论' };
      if (!a || a.sui === null || a.sui === undefined) {
        rows.push('<tr><td class="val tiny" colspan="6">岁月：输入不完整，暂不可算</td></tr>');
        return;
      }
      // 左侧表头「岁月」+ 岁/月/天 三格均分（使用者 2026-09-11 要求）
      rows.push('<tr>'
        + '<td class="lbl">岁月</td>'
        + '<td class="val mono num">' + P.badge(a.sui.toFixed(1) + '岁', af) + '</td>'
        + '<td class="val mono num">' + P.badge(a.yue.toFixed(1) + '月', af) + '</td>'
        + '<td class="val mono num">' + P.badge(a.tian.toFixed(1) + '天', af) + '</td>'
        + '</tr>');
    })();

    // 夏令时（夏时制）校正明示 —— 仅在实际扣除时显示
    //   语料 GE萃取2:4580 要求「强制 −1 小时」；界面须让使用者知道已校正，
    //   并在时辰跨界时给出提示（输入粒度为 2 小时，真实时刻无法唯一确定）。
    if (b.dst && b.dst.applied) {
      rows.push('<tr><td class="lbl">夏令时</td><td class="val" colspan="3" style="color:var(--gold)">'
        + P.badge(b.dst.note, {
          field_status: 'confirmed', field_id: 'calendarData.dst',
          rule_id: 'LSY-CAL-DST',
          source_refs: ['GE萃取2-260908 X.md:4580', 'GE萃取2-260908 X.md:4581',
            'GE萃取2-260908 X.md:5079',
            '1986 年中央《在全国范围内实行夏时制的通知》公开转述'],
          exception_policy: '中国 1986–1991 年实行夏时制（人为拨快 1 小时），'
            + '语料要求还原为物理平太阳时，故强制 −1 小时。'
            + '区间精确起止取自 1986 年中央通知的公开转述（每年 4 月中旬第一个星期日'
            + '至 9 月中旬第一个星期日；1986 首年例外 5/4–9/14）。'
            + (b.dst.crossShichen
              ? '⚠ 本工具时辰输入粒度为 2 小时，扣除后连带跨界，'
                + '真实出生时刻落在该时辰的前一小时内；如需唯一确定请提供精确到小时的出生时刻。'
              : ''),
          interpretation_type: 'computed', safety_boundary: '仅作时间整流，不构成吉凶结论'
        }) + '</td></tr>');
    }

    // 真太阳时（语料 S3-连山易天文历法排盘算法与时间边界规则.md:4/:12-14/:119）
    //   海外先按当地时区解释；公式 = 当地钟表时 − 夏令时
    //     + [经度×4 − UTC偏移×60] + 均时差
    //   界面口径：
    //     · 已校正 → 明示「出生地 → 经度」、两项分项与合计偏移、真太阳时刻
    //     · 未校正 → 明示原因 + 提示补填（不得静默按 120°E 处理）
    (function () {
      var tf = b.trueSolarTime || {};
      var t = tf.value || {};
      var raw = cd.rawInput || {};
      var pad2 = function (n) { n = Number(n) || 0; return (n < 10 ? '0' : '') + n; };
      var placeTxt = raw.birthPlace || (raw.longitude !== null && raw.longitude !== undefined
        ? String(raw.longitude) : '未填');
      // 来源引用统一取自字段对象（由 chart-engine 从 dict-core 的 meta 注入），
      // 不在 UI 层再抄一份 → 保持「规则数据只在数据层」的三层分离
      var refs = tf.source_refs || [];
      var policy = '真太阳时 = 当地钟表时（已扣夏令时）+ 当地经度/时区修正 + 均时差。'
        + '经度时差 = (出生地经度 − 120) × 4 分钟（语料 :119）；'
        + '换算口径优先采用中国公开标准资料；均时差当前用 NOAA 公开公式离线展开（海外备选，语料仅给量级 ±14–16 分钟并注明「需外部天文库」，:87/:123）。'
        + '**作用域**：日柱、时柱按真太阳时刻判定（子初换日与时辰分界均为当地物理交界）；'
        + '年柱、月柱按行政钟表刻度判定（节气表与出生时刻同刻度，统一偏移不改变先后关系）。'
        + '海外时间必须按当地时区解释，与北京时间无关；当地 UTC 偏移为必填输入。';
      var unresolvedLon = (t.longitude !== null && t.longitude !== undefined)
        ? '，经度 ' + (t.longitude >= 0 ? (Math.round(t.longitude * 100) / 100) + '°E'
          : (Math.round(-t.longitude * 100) / 100) + '°W') : '';

      if (!t.applied) {
        rows.push('<tr><td class="lbl">真太阳时</td><td class="val" colspan="3" style="color:var(--gold)">'
          + P.badge('未校正（' + esc(placeTxt === '未填' ? '未填出生地'
            : (t.longitude !== null && t.longitude !== undefined
              ? '出生地「' + placeTxt + '」缺当地 UTC 偏移' + unresolvedLon
              : '出生地「' + placeTxt + '」无法解析为经度'))
            + '）→ 日柱/时柱按行政钟表时刻判定',
            {
              field_status: tf.field_status || 'conditional', field_id: 'calendarData.trueSolarTime',
              rule_id: 'LSY-CAL-TRUESOLAR', source_refs: refs,
              exception_policy: policy + '补填出生城市/经度及当地 UTC 偏移（如纽约冬季 −5）即可完成校正。',
              interpretation_type: 'computed', safety_boundary: '仅作时间整流，不构成吉凶结论'
            }) + '</td></tr>');
        return;
      }

      var sgn = function (n) { return (n >= 0 ? '+' : '−') + Math.abs(Math.round(n * 10) / 10) + '′'; };
      // 经度显示：东经用 °E，西经用 °W（语料公式以 120°E 为基准，西经记负值）
      var lonTxt = t.longitude >= 0
        ? (Math.round(t.longitude * 100) / 100) + '°E'
        : (Math.round(-t.longitude * 100) / 100) + '°W';
      // 出生地标签：城市表命中且与用户输入不同（如「浙江省杭州市」→「杭州」）时括注，
      // 避免「真太阳时杭州（杭州 120.15°E）」这类重复。
      var cityBit = (t.longitudeMatched && t.longitudeMatched !== 'explicit'
        && t.longitudeMatched !== placeTxt) ? '（识别为 ' + esc(t.longitudeMatched) + '）' : '';
      var tt = t.trueTime || {};
      var bits = []
        .concat(esc(placeTxt) + cityBit + ' ' + lonTxt)
        .concat('经度时差 ' + sgn(t.lonOffset))
        .concat('当地 UTC' + (t.timezoneOffset >= 0 ? '+' : '') + t.timezoneOffset)
        .concat('均时差 ' + sgn(t.eot))
        .concat('合计 ' + sgn(t.offsetMinutes))
        .concat('→ 真太阳 ' + pad2(tt.hour) + ':' + pad2(tt.minute));
      rows.push('<tr><td class="lbl">真太阳时</td><td class="val" colspan="3" style="color:var(--jade)">'
        + P.badge(bits.join('　'), {
          field_status: tf.field_status || 'confirmed',
          field_id: 'calendarData.trueSolarTime',
          rule_id: 'LSY-CAL-TRUESOLAR', source_refs: refs,
          exception_policy: policy
            + (t.longitudeSource ? '经度取自 ' + t.longitudeSource + '。' : '')
            + (t.shichenChanged ? '⚠ 校正后**时支发生位移**，四柱时柱已按真太阳时重定。' : '')
            + (t.dayChanged ? '⚠ 校正后**日柱基准日发生位移**，四柱日柱已按真太阳时重定。' : '')
            + '海外时间按当地时区计算，不换算为北京时间。',
          interpretation_type: 'computed', safety_boundary: '仅作时间整流，不构成吉凶结论'
        }) + '</td></tr>');
    })();

    // 节气
    var jqTxt = '';
    if (jq.prev) {
      jqTxt = '[' + esc(jq.prev.prevName) + ' ' + esc(jq.prev.prevTime) + '] 第'
        + esc(jq.prev.dayInTerm) + '天';
    }
    if (jq.next) {
      jqTxt += '，距 [' + esc(jq.next.name) + '] ' + esc(jq.next.daysToNext) + '天';
    }
    rows.push('<tr><td class="lbl">节气</td><td class="val" colspan="3" style="color:var(--jade)">'
      + P.badge(jqTxt, {
        field_status: 'conditional', field_id: 'calendarData.jieqi',
        rule_id: 'LSY-CAL-JIEQI',
        source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:1379-1380', '01-书同课程-35P录音稿清洗-260831 √.md:4005'],
        exception_policy: '节气换月以交节时刻切分，不按农历初一。交节秒级裁决属未闭合项（CONFLICT-001）；内置历法库与参考图存在约 14-15 秒差异。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      }) + '</td></tr>');

    // 周日 / 星宿 / 星座 / 乾造坤造
    //   参考图：星宿：昴日鸡 | [摩羯] 第5天 | 乾造
    //   ⚠ 使用者 2026-09-11 要求：右侧三格「按信息长度适配到右端，文字不换行到两行」
    //     → 用 .fit-right：单元格 white-space:nowrap + 内容右对齐，
    //       列宽由 colgroup 的 auto 列按内容分配（见 CSS .tbl-fitright）。
    var gender = cd.rawInput.gender || '—';
    var XZ = [['摩羯', 12, 22], ['水瓶', 1, 20], ['双鱼', 2, 19], ['白羊', 3, 21],
      ['金牛', 4, 20], ['双子', 5, 21], ['巨蟹', 6, 22], ['狮子', 7, 23],
      ['处女', 8, 23], ['天秤', 9, 23], ['天蝎', 10, 24], ['射手', 11, 23]];
    var xzTxt = '—';
    if (s.xingzuo) {
      var dayN = null;
      for (var xi = 0; xi < XZ.length; xi++) {
        if (XZ[xi][0] !== s.xingzuo) continue;
        var sm = XZ[xi][1], sd = XZ[xi][2];
        var startUTC = Date.UTC(s.year, sm - 1, sd);
        var curUTC = Date.UTC(s.year, s.month - 1, s.day);
        if (curUTC < startUTC) startUTC = Date.UTC(s.year - 1, sm - 1, sd);
        dayN = Math.round((curUTC - startUTC) / 86400000) + 1;
        break;
      }
      xzTxt = '[' + s.xingzuo + ']' + (dayN ? ' 第' + dayN + '天' : '');
    }
    rows.push('<tr class="fitright">'
      + '<td class="lbl">' + esc(s.week) + '</td>'
      + '<td class="val nowrap">星宿：'
      + P.badge(ext.xiu || '—', externField('external.xiu', '二十八宿值日为通用历法扩展，67 份连山易语料中全库 not-found（仅 2 处界面截图）。'))
      + '</td>'
      + '<td class="val nowrap">'
      + P.badge(xzTxt, externField('external.xingzuo', '星座及「第N天」为通用历法推算，67 份连山易语料 0 命中。'))
      + '</td>'
      + '<td class="val yang nowrap" style="font-weight:700">' + esc(gender) + '</td></tr>');

    // tbl-left：① 基础信息字段左对齐（其他数据网格保持居中）
    //   colgroup 4 等分（25% × 4）→ 4 个数据列。
    //   各行 colspan 按 4 单元网格分配：
    //     公历/农历/节气  标签1 + 值3       = 4
    //     开元            标签1 + 值2 + 值1 = 4
    //     岁月            标签1 + 值1×3     = 4 → 岁/月/天 **三格均分**
    //     周日            标签1 + 值3       = 4 → 右侧三格按内容长度自适应
    return '<table class="tbl tbl-left">'
      + '<colgroup><col style="width:12%"><col style="width:29%">'
      + '<col style="width:29%"><col style="width:30%"></colgroup>'
      + rows.join('') + '</table>';
  }

  function externField(id, note) {
    return {
      field_status: 'external', field_id: id, rule_id: null,
      source_refs: [], depends_on: [],
      exception_policy: note, interpretation_type: 'computed',
      safety_boundary: '非连山易来源，仅作对照展示'
    };
  }

  function fmtAge(cd) {
    // age 放在 calendarData.age（rectify 输出），chart-engine 未直接透传则从 raw 取
    var a = cd.calendarData.age;
    if (!a) return '—';
    // 测算年早于出生年时三值为 null（见 calendar.js 的 age 计算）
    if (a.sui === null || a.sui === undefined) return '测算年早于出生年';
    return a.sui + '岁 · ' + a.yue + '月 · ' + a.tian + '天';
  }

  /** 阿拉伯数字转中文数字（仅用于轩辕纪元四位年） */
  var CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function numCn(n) {
    return String(n).split('').map(function (c) { return CN[+c] || c; }).join('');
  }

  // ==================================================== ② 四柱爻位大表
  function pillarTable(cd) {
    var ps = cd.natalBase.pillars;           // [time, day, month, year]
    var kg = cd.natalBase.kongGuColumn;
    var gui = cd.natalBase.guiDisplay;
    var yun = cd.natalBase.yunDisplay;

    function cell(f, txt, cls) {
      return '<td class="val ' + (cls || '') + '">' + P.badge(txt, f) + '</td>';
    }
    // 干支单字单元格：用克隆把 value 换成单字，
    // 保证弹层里显示的「取值」与界面上的字一致（否则会显示整个干支）
    function cellChar(f, ch, cls) {
      var body = f
        ? P.badge(ch, Object.assign({}, f, { value: ch }))
        : '<span class="pv-null">—</span>';
      return '<td class="val ' + (cls || '') + '">' + body + '</td>';
    }
    function byPos(pos) { return ps.filter(function (p) { return p.pos === pos; })[0]; }
    var order = ['time', 'day', 'month', 'year'];

    // 【统一列宽网格】全页数据表共用一把「尺」，避免各表列宽互不相同导致参差。
    //   尺：每列 = 100/13 ≈ 7.69%（13 等分），所有表按整列数取宽 → 列线天然对齐。
    //     ①  标签 4 列 + 值 3 列/2 列 …（保持原 4 等分口径）
    //     ②  孤1 空1 | 时1 日1 月1 年1 | 旬1 贵1 运1        = 9 列
    //     ③  大运(旬)1 | 时1 日1 月1 年1 | 流转2 年龄2        = 9 列  ← 与 ② 同宽
    //     ⑦  标签1 + 数据12                                  = 13 列
    //     ⑧⑨ 标签1 + 数据12                                  = 13 列
    //   ② 与 ③ 均为 9 列且列宽相同 → 「时日月年」上下严格对齐。
    var W2 = { gu: '7.69%', kong: '7.69%', four: '7.69%', jx: '7.69%' };
    // ② 四柱要略宽以便放大干支字：孤空窄一档、四柱宽一档、旬贵运窄一档
    //   孤5 空5 | 时15 日15 月15 年15 | 旬10 贵10 运10 = 100%（2×5 + 4×15 + 3×10）
    var out = '<table class="tbl tbl-dense">'
      + '<colgroup>'
      + '<col style="width:8%"><col style="width:8%">'
      + '<col style="width:12%"><col style="width:12%">'
      + '<col style="width:12%"><col style="width:12%">'
      + '<col style="width:12%"><col style="width:12%"><col style="width:12%">'
      + '</colgroup>';
    // 表头（参考图列序：孤 空 时 日 月 年 旬 贵 运）
    out += '<tr>'
      + '<th class="lbl">孤</th><th class="lbl">空</th>'
      + '<th>时</th><th>日</th><th>月</th><th>年</th>'
      + '<th class="lbl">旬</th><th class="lbl">贵</th><th class="lbl">运</th></tr>';

    // 【四行同为 9 格，不用 rowspan（跨行占用列位会导致后续行列线塌陷）】
    //   天干行：孤/空 各一格竖排两字；旬/贵/运 各一格竖排两字。
    //   地支行：与天干行错开 —— 孤/空 的「第二个字」单独放本行、且**逐字拆成两行**
    //           （这样两行的字在同一字列里一上一下，才是参考图的纵向对齐效果）。
    out += '<tr>'
      + '<td class="val stack" style="color:var(--gold)">' + P.badge(kg.gu[0], kg._f) + '</td>'
      + '<td class="val stack" style="color:var(--gold)">' + P.badge(kg.kong[0], kg._f) + '</td>';
    order.forEach(function (pos) {
      var p = byPos(pos);
      out += cellChar(p.gan_f, p.gan, 'big bazi ' + (p.gan ? yy(p.gan, 'gan') : ''));
    });
    out += '<td class="val stack">' + P.badge(kg.gan, kg._f) + '</td>'
      // 「贵」列加**当旬底色**（使用者 2026-09-12：「做米黄底色，因为这是当旬的贵」）
      //   贵 = 流年旬（当旬）的天赐天佐，故与「当旬」同色系标注。
      + '<td class="val stack gui-cur">'
      + (gui.gan ? P.badge(gui.gan, gui) : P.badge(null, {
        field_status: 'RULE_PENDING', field_id: 'natalBase.guiDisplay',
        rule_id: 'LSY-GUIFUCAI-GUIXING',
        source_refs: ['GE萃取2-260908 X.md:3848'],
        exception_policy: (gui._note || '') + ' 参考图观测：'
          + ((gui.referenceObservation || {}).gan || '?') + '/'
          + ((gui.referenceObservation || {}).zhi || '?'),
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      }))
      + '</td>'
      + '<td class="val stack">' + P.badge(yun.gan, { field_status: 'confirmed', field_id: 'natalBase.yunDisplay' }) + '</td>'
      + '</tr>';

    // 地支行（9 格）：孤/空/旬/贵/运 的第二字；两字符值折为上/下两行显示
    out += '<tr>'
      + '<td class="val stack" style="color:var(--gold)">' + P.badge(kg.gu[1], kg._f) + '</td>'
      + '<td class="val stack" style="color:var(--gold)">' + P.badge(kg.kong[1], kg._f) + '</td>';
    order.forEach(function (pos) {
      var p = byPos(pos);
      out += cellChar(p.zhi_f, p.zhi, 'big bazi ' + (p.zhi ? yy(p.zhi, 'zhi') : ''));
    });
    out += '<td class="val stack">' + P.badge(kg.zhi, kg._f) + '</td>'
      + '<td class="val stack gui-cur">'
      + (gui.zhi ? P.badge(gui.zhi, gui) : P.badge(null, {
        field_status: 'RULE_PENDING', field_id: 'natalBase.guiDisplay',
        rule_id: 'LSY-GUIFUCAI-GUIXING', source_refs: ['GE萃取2-260908 X.md:3848'],
        exception_policy: (gui._note || ''), interpretation_type: 'computed',
        safety_boundary: '仅作传统标注，不构成吉凶结论'
      }))
      + '</td>'
      + '<td class="val stack">' + P.badge(yun.zhi, { field_status: 'confirmed', field_id: 'natalBase.yunDisplay' }) + '</td>'
      + '</tr>';

    // 旬头行（9 格）：标签占「孤+空」两列，四柱值，末 3 列留空
    out += '<tr><td class="val tiny" colspan="2" style="color:var(--ink-3)">旬头</td>';
    order.forEach(function (pos) {
      var p = byPos(pos);
      out += cellChar(p.xun_f, (p.xun_f && p.xun_f.value) || null, 'sm');
    });
    out += '<td class="val"></td><td class="val"></td><td class="val"></td>';
    out += '</tr>';

    // 爻位行（9 格）
    out += '<tr><td class="val tiny" colspan="2" style="color:var(--ink-3)">爻位</td>';
    order.forEach(function (pos) {
      var p = byPos(pos);
      var y = (p.yao_f && p.yao_f.value !== null && p.yao_f.value !== undefined) ? p.yao_f.value : null;
      out += cell(p.yao_f, y === null ? null : '(' + y + ')', 'mid yin');
    });
    out += '<td class="val"></td><td class="val"></td><td class="val"></td>';
    out += '</tr>';

    out += '</table>';
    return out;
  }

  // ==================================================== ③ 十二值符大运表
  function talismanTable(cd) {
    var t = cd.view.talismanTable;
    function fuTone(v) {
      if (['伤符', '死符', '白虎', '病符'].indexOf(v) >= 0) return ' fu-red';
      if (['龙德', '福德', '执符', '值符', '太阳', '太阴'].indexOf(v) >= 0) return ' fu-green';
      if (['官符', '破碎', '吊客'].indexOf(v) >= 0) return ' fu-black';
      return '';
    }
    var out = '<table class="tbl tbl-dense" id="zhifu-table">'
      + '<colgroup>'
      + '<col style="width:16%">'
      + '<col style="width:12%"><col style="width:12%">'
      + '<col style="width:12%"><col style="width:12%">'
      + '<col style="width:18%"><col style="width:18%">'
      + '</colgroup>';
    // 列宽网格：四柱与 ② 共用同一组宽度（13%），起始线同为 18% → 「时日月年」上下对齐
    // 术语（使用者 2026-09-12）：
    //   · 首列「六甲旬」（原「原旬静符」）
    //   · 四柱表头**取消「流年动符」文字**，只留 时/日/月/年
    out += '<tr><th class="lbl">六甲旬</th>'
      + '<th>时</th><th>日</th><th>月</th><th>年</th>'
      + '<th>流转周期</th><th>大运年龄</th></tr>';
    // 【当旬行高亮】默认高亮「测算年所在旬」那一行（米黄色背景）；
    //   点击其它行则动态切换高亮（交互见 assets/js/ui/row-select.js）。
    //   判定：测算年落在该行「流转周期」区间 [sy, sy+9] 内。
    var targetYear = t.targetYear;
    // 【术语统一】（使用者裁决 2026-09-12）
    //   · 本行旬头 = **原旬静符**（出生时所带之符；出生年柱旬即「原旬」）
    //     → 出生原旬那一行的旬头加 ★ 并标 .birth-xun，与其他旬区分
    //   · 四柱细目 = **流年动符**（该旬统辖十年内逐旬推移之符，语料称「流年飞符」）
    //     语料 3876「行符十年一变」、3877「仅在其对应的流年里各当值一年」
    var birthXunHead = cd.natalBase.kongGuColumn.kongXun;
    t.rows.forEach(function (r) {
      var sy = Number(String(r.cycle).split('-')[0]);
      var isCur = (targetYear >= sy && targetYear <= sy + 9);
      var isBirth = (r.xun === birthXunHead);
      out += '<tr data-xun="' + esc(r.xun) + '" data-cycle="' + esc(r.cycle) + '"'
        + (isCur ? ' class="row-current"' : '') + '>'
        // 使用者 2026-09-12：「甲寅表头取消底色」——去掉 .birth-xun 底色，仅保留 ★ 标记
        + '<td class="val sm" style="color:var(--ink);font-weight:600"'
        + (isBirth ? ' title="出生旬（甲寅）"' : '') + '>'
        + esc(r.xun) + (isBirth ? '★' : '') + '</td>';
      ['time', 'day', 'month', 'year'].forEach(function (pos) {
        var v = r.cells[pos];
        out += '<td class="val sm' + fuTone(v) + '">' + P.badge(v, {
          field_status: 'conditional', field_id: 'talismanTable.' + pos, rule_id: 'LSY-TALISMAN-002',
          source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:9864', '04-老韩人和-65P书籍清洗-260903 √.md:6891-6899'],
          exception_policy: '偏移公式主料有等价表述+六旬印刷表，72/72 回归通过；字面公式仅二次文档。'
            + '本行为「流年动符」：本旬统辖十年内，各柱地支所临之符，逐旬推移。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
        }) + '</td>';
      });
      // 流转周期 / 大运年龄：等宽数字 + 居中，使 10 行的数字位纵向对齐
      out += '<td class="val tiny mono num">' + esc(r.cycle) + '</td>'
        + '<td class="val sm num">' + esc(r.age) + '</td></tr>';
    });
    out += '</table>';
    return out;
  }

  // ============================================ ④ 动符 / 贵福财 / 宫霞煞 / 天贼
  function actionRows(cd) {
    var natal = cd.natalBase.natal;
    var ps = cd.natalBase.pillars;
    var order = ['time', 'day', 'month', 'year'];
    function vals(fn) {
      return order.map(function (pos) {
        var p = ps.filter(function (x) { return x.pos === pos; })[0];
        return fn(p);
      });
    }
    function row(label, cells, f) {
      return '<tr><td class="lbl">' + esc(label) + '</td>'
        + cells.map(function (c) { return '<td class="val sm">' + P.badge(c, f) + '</td>'; }).join('')
        + '</tr>';
    }
    var out = '<table class="tbl">';
    // 动值符：由大运表当前行取，这里取本命静符作对照已足够；参考图为「动值符」一行
    out += '<tr><td class="lbl">动值符</td>'
      + vals(function (p) { return p.talismanStatic == null && p.talismanStatic_f ? p.talismanStatic_f.value : p.talismanStatic_f.value; })
        .map(function (v) {
          return '<td class="val sm">' + P.badge(
            (v || '').slice(0, 1) + (v || '').slice(1, 2) + (v || '').slice(2, 3) || v,
            { field_status: 'conditional', field_id: 'action.dongFu', rule_id: 'LSY-TALISMAN-002',
              source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:9911-9944'],
              exception_policy: '逐年动符由旬头起值符顺布，规则 confirmed；但「值符管十年/其他管一年」存在源内前后口径冲突（CONFLICT-010）。',
              interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论' }) + '</td>';
        }).join('') + '</tr>';

    // 贵福财（天干三吉：贵 · 福 · 财）
    out += row('贵福财', vals(function (p) {
      if (!p.gz) return null;
      var t = D.GUI_FU_CAI[p.gan];
      return t ? (t.gui + t.fu + t.cai) : null;
    }), {
      field_status: 'confirmed', field_id: 'natal.guiFuCai', rule_id: 'LSY-GUIFUCAI-001',
      source_refs: (D.meta['LSY-GUIFUCAI-001'] || {}).sources || [],
      exception_policy: '天干三吉代数闭环：贵 = 顺平移3位；福 = 顺平移7位；财 = 天干五合。'
        + '参考图四格逐字对拍 4/4（丙→己癸辛、癸→丙庚戊、壬→乙己丁）。'
        + '显示顺序为「贵 · 福 · 财」。'
        + '⚠ 空间/风水场景的「地支坐向求贵福财」路径（纳干 vs 藏干）尚未闭合，首期不实现。',
      interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
    });

    // 宫霞煞
    out += row('宫霞煞', vals(function (p) {
      if (!p.gz) return null;
      return (p.gongSha_f.value || '-') + '、' + (p.xiaSha_f.value || '-');
    }), {
      field_status: 'conditional', field_id: 'action.gongXiaSha', rule_id: 'LSY-SHA-XIA-001',
      source_refs: ['03-老韩天时-63P书籍清洗-260903 √.md:1377', '03-老韩天时-63P书籍清洗-260903 √.md:1371', '05-连山易知识卡片_清洗.md:114'],
      exception_policy: '宫煞 10/10 confirmed；霞煞 9/10 —— 庚位「辰 vs 辰戌」冲突，参考图采用「辰、戌」。并列双值，待回 PDF 校勘。',
      interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论',
      conflict_id: 'CONFLICT-SHA-GENG'
    });

    // 天贼
    out += row('天贼', vals(function (p) { return p.gz ? p.tianFu_f.value : null; }), {
      field_status: 'confirmed', field_id: 'natal.tianZei', rule_id: 'LSY-TIANZEI-001',
      source_refs: ['03-老韩天时-63P书籍清洗-260903 √.md:1312-1335'],
      exception_policy: '地支↔地支对合，以月建为键，6/6 自逆、UI 逐柱 4/4。⚠ 天贼 ≡ 天赋（同一张表）；天祸星/天灾星/天难星是本字段别名，不是宫煞。',
      interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
    });

    out += '</table>';
    return out;
  }

  // ============================================ ④b 按柱派生标注
  // 参考图在十二值符大运表下方还有派生行：长旺墓 / 宫霞煞 / 天贼 / 贵福财
  // 这些是「按柱天干或地支取值」的派生字段，与区块④的合盘标注分开展示。
  function pillarDerived(cd) {
    var ps = cd.natalBase.pillars;
    var order = ['time', 'day', 'month', 'year'];
    // ③b 与⑥联动：⑥天地盘的大字天干/地支是唯一比对集合；③b命中的单字逐字标深粉色。
    var heChars = {};
    (cd.view.heavenEarth || []).forEach(function (c) {
      if (c && c.gan) heChars[c.gan] = true;
      if (c && c.zhi) heChars[c.zhi] = true;
    });
    function markedBadge(val, f, blackUnmatched) {
      var html = P.badge(val, f);
      if (val === null || val === undefined || val === '') return html;
      var raw = String(val);
      var marked = raw.split('').map(function (ch) {
        return heChars[ch]
          ? '<span class="pd-match">' + esc(ch) + '</span>'
          : (blackUnmatched ? '<span class="pd-unmatched">' + esc(ch) + '</span>' : esc(ch));
      }).join('');
      return html.replace(esc(raw), marked);
    }
    function byPos(pos) { return ps.filter(function (p) { return p.pos === pos; })[0]; }

    // ③b 条带式（使用者 2026-09-11：「不必向上对齐四柱信息格」）
    //   每行 = 左标签 + 右四个值，**列序固定为 时 → 日 → 月 → 年**，
    //   故**不再于每格内重复时/日/月/年小标**（使用者 2026-09-12 要求取消）。
    //   为免读者失去列序参照，在条带顶部加一行列头（见下方 head）。
    function strip(label, getter, f, blackUnmatched) {
      var cells = order.map(function (pos) {
        var p = byPos(pos);
        var val = p.gz ? getter(p) : null;
        return '<span class="pd-cell">' + markedBadge(val, f(p), blackUnmatched) + '</span>';
      }).join('');
      return '<div class="pd-row">'
        + '<span class="pd-label">' + esc(label) + '</span>'
        + '<span class="pd-vals">' + cells + '</span>'
        + '</div>';
    }

    // 列头：条带顶部标出列序（时→日→月→年），替代原先每格内的重复小标
    var orderCn = order.map(function (pos) {
      var p = byPos(pos);
      return '<span class="pd-head">' + esc(p ? p.pos_cn : '') + '</span>';
    }).join('');
    var out = '<div class="pd-strip">'
      + '<div class="pd-row pd-headrow">'
      + '<span class="pd-label">柱</span>'
      + '<span class="pd-vals">' + orderCn + '</span>'
      + '</div>';

    // 长旺墓
    out += strip('长旺墓', function (p) {
      var v = p.changWangMu_f.value;
      return v ? v.join('') : null;
    }, function (p) { return p.changWangMu_f; });

    // 宫煞 | 霞煞（来源为单一合并单元格）
    out += strip('宫煞|霞煞', function (p) {
      return (p.gongSha_f.value || '-') + '|' + (p.xiaSha_f.value || '-');
    }, function (p) {
      return {
        field_status: 'conditional', field_id: 'pillar.' + p.pos + '.gongXiaSha',
        rule_id: 'LSY-SHA-XIA-001',
        source_refs: p.xiaSha_f.source_refs.concat(p.gongSha_f.source_refs),
        depends_on: ['pillar.' + p.pos + '.gan'],
        exception_policy: '宫煞 confirmed 10/10（三路主料）；霞煞 conditional 9/10 —— 庚位「辰 vs 辰戌」冲突，本表取参考图口径（辰、戌）。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论',
        conflict_id: 'CONFLICT-SHA-GENG'
      };
    }, true);

    // 天贼（与天赋同表，源文如此）
    out += strip('天贼', function (p) { return p.tianFu_f.value; }, function (p) {
      return {
        field_status: 'confirmed', field_id: 'pillar.' + p.pos + '.tianZei', rule_id: 'LSY-TIANZEI-001',
        source_refs: ['03-老韩天时-63P书籍清洗-260903 √.md:1312-1335', '05-连山易知识卡片_清洗.md:134-149'],
        depends_on: ['pillar.' + p.pos + '.zhi'],
        exception_policy: '⚠ 天贼 ≡ 天赋（同一张表，12/12 同构）；本行保留源文字段，天祸星/天灾星/天难星是本字段别名，不是宫煞。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      };
    });

    // 贵福财（从原④迁入，覆盖原③b「本命静符」位置）
    out += strip('贵福财', function (p) {
      var t = D.GUI_FU_CAI[p.gan];
      return t ? (t.gui + t.fu + t.cai) : null;
    }, function (p) {
      return {
        field_status: 'confirmed', field_id: 'pillar.' + p.pos + '.guiFuCai',
        rule_id: 'LSY-GUIFUCAI-001',
        source_refs: (D.meta['LSY-GUIFUCAI-001'] || {}).sources || [],
        depends_on: ['pillar.' + p.pos + '.gan'],
        exception_policy: '天干三吉：贵、福、财按已确认映射展示；本行从原④贵福财信息迁入③b。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      };
    });

    out += '</div>';

    return out;
  }

  // ==================================================== ⑤ 本命批注条
  function annotation(cd) {
    var a = cd.view.annotation;
    var nb = cd.natalBase;
    var ruling = nb.xunRuling;
    return '<div class="note-box">'
      + '<b>【' + esc(cd.rawInput.gender || '—') + '】</b> '
      + esc(a.text)
      + ' <span class="add">【添加备注】</span>'
      + '<div class="tiny" style="margin-top:6px;color:var(--ink-3)">'
      + '四季：' + esc((a.counts.seasons || []).join(''))
      + ' · 五行：' + esc((a.counts.wuxing || []).join(''))
      + ' · 阳' + a.counts.yang + '阴' + a.counts.yin
      + '</div></div>';
  }

  // ==================================================== ⑥ 天地盘大字阵
  function heavenEarth(cd) {
    var arr = cd.view.heavenEarth;
    var out = '<div class="he-grid">';
    arr.forEach(function (c) {
      if (!c) { out += '<div class="he-col"></div>'; return; }
      out += '<div class="he-col">';
      // 天干区
      out += '<div class="he-half">'
        + '<span class="he-corner he-tl attack">' + esc(c.ganChongDefend || '') + ' ↘</span>'
        + '<span class="he-corner he-tr season">' + esc(c.ganSeason || '') + '</span>'
        + '<span class="he-glyph bazi ' + yy(c.gan, 'gan') + '">' + esc(c.gan) + '</span>'
        + '<span class="he-corner he-bl attack">↙ ' + esc(c.ganChongAttack || '') + '</span>'
        + '<span class="he-corner he-br combo">⊕' + esc(c.ganHe || '') + '</span>'
        + '<span class="he-tag">' + esc(c.pos_cn) + '干</span>'
        + '</div>';
      // 地支区
      out += '<div class="he-half">'
        + '<span class="he-corner he-tl" style="color:var(--violet)">' + esc(c.zhiDir || '') + '<br>' + esc(c.zhiWuXing || '') + '</span>'
        + '<span class="he-corner he-tr season">' + esc(c.zhiSeason || '') + '</span>'
        + '<span class="he-glyph bazi ' + yy(c.zhi, 'zhi') + '">' + esc(c.zhi) + '</span>'
        + '<span class="he-corner he-bl attack">' + esc(c.zhiChong || '') + ' ↔</span>'
        + '<span class="he-corner he-br combo">⊕' + esc(c.zhiHe || '') + '</span>'
        + '<span class="he-tag">' + esc(c.pos_cn) + '支</span>'
        + '</div>';
      out += '</div>';
    });
    out += '</div>';
    return out;
  }

  // ==================================================== ⑦ 元运旬交互表
  function timeLayer(cd) {
    var t = cd.dynamicTransit;
    var out = '';

    // 出生原旬（= 年柱旬，语料口径「公处轨取年柱旬」）——用于标出「原旬静符」所在格
    //   权威字段：natalBase.kongGuColumn.kongXun（与 ② 的「旬」列同源）
    var birthXun = cd.natalBase.kongGuColumn.kongXun;

    // 【列宽网格】本表统一为 **标签列 + 18 数据列**，各行 colspan 之和必须相等，
    //   否则列不对齐（此前 11/10/4/7 互不相等，导致整表错位）。
    //     三元九运  9 格，每格跨 2 列 → 18（9 格严格等宽）
    //     运        3 格，colspan 6/6/6 → 18
    //     旬        6 格，colspan 3 each → 18
    out += '<table class="tbl tbl-dense" id="yuan-yun-xun">'
      + '<colgroup>'
      + '<col style="width:8%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '<col style="width:5.1111111111%"><col style="width:5.1111111111%">'
      + '</colgroup>';

    // ── 三元九运（20 年小运）──────────────────────────────────────────
    //   语料 GE萃取2:3636-3638 正宗层级：
    //     三元甲子大运 (180年) → 三元九运 (20年小运) → 六甲流旬 (10年大运)
    //   主料 `03-老韩天时:691-716`《三元九运应用表》给出完整年限（1864 一运 … 2024 九运）。
    //   本行展示一个完整三元（180 年 = 9 运 × 20 年）窗口。
    //   ⚠ 已按使用者裁决 2026-09-12 取消「大元 / 正元」（语料 8 处否认其为连山易概念），
    //     原 zhengYuan（540 年内 9 个 60 年格）随之弃用。
    var SY = (typeof root !== 'undefined' && root.LSY && root.LSY.engine
      && root.LSY.engine.sanyuan) || null;
    if (SY) {
      // 窗口口径：**以当前元（60 年 = 3 运）居中** = 前一元 + 当前元 + 后一元。
      //   使用者 2026-09-12 裁决：「⑦ 三元 年份改为 1924-2084」。
      //   2026 属下元(1984–2043) → 窗口 = 中元(1924-1983) + 下元(1984-2043) + 上元(2044-2103)
      //   → 九格起始年 1924 1944 1964 1984 2004 2024 2044 2064 2084 ✓
      var y9 = SY.window9(t.targetYear);
      // 使用者 2026-09-12：「表头改为『三元』」
      out += '<tr><td class="lbl">三元</td>';
      y9.forEach(function (c, i) {
        // 【格子尺寸优化】使用者 2026-09-14：「三元 9 格均分尺寸」。
        //   9 格各跨 2 个等宽基础列，确保每格宽度严格一致；每格**只显示「元」与年份**，
        //   运名/九星/卦色由下一行「运」与
        //     面包屑承担；全名进 title 悬浮。
        var cs = 2;
        var col = c.yuan === '上' ? 'var(--yin)'
          : (c.yuan === '中' ? 'var(--violet)' : 'var(--yang)');
        var jy = D.JIU_YUN ? D.JIU_YUN[c.yunIndex] : null;
        var tip = c.yuan + '元（' + c.yuanStar + '） ' + c.name
          + '　' + c.startYear + '–' + (c.startYear + 19)
          + (jy ? '　' + jy.star + ' ' + jy.wuxing + jy.dir + ' ' + jy.gua + c.yunIndex + jy.color
            + '　九宫 ' + jy.gz : '');
        out += '<td class="val tiny mono' + (c.isCurrent ? ' cur cur-cell' : '') + '"'
          + ' colspan="' + cs + '" title="' + esc(tip) + '">'
          + '<span class="mono">' + esc(c.startYear) + '</span><br>'
          + '<span style="color:' + col + '">' + esc(c.yuan + '元') + '</span>'
          + '</td>';
      });
      out += '</tr>';
    }

    // ── 运（20 年，三元九运的「九运」细目）────────────────────────────
    //   参考图每格三行：年(19/84) + 九星名(破军) / 干支(丁酉) / 五行+方位(金正西) + 卦+色(兑七赤)
    var YUN_SPAN = [6, 6, 6];
    out += '<tr><td class="lbl">运</td>';
    t.yun.cells.forEach(function (c, yi) {
      var jy = D.JIU_YUN ? D.JIU_YUN[c.yunIndex] : null;
      var starTxt = jy ? jy.star : (c.star || null);
      var wdTxt = jy ? (jy.wuxing + jy.dir) : '';
      var guaTxt = jy ? (jy.gua + c.yunIndex + jy.color) : '';
      out += '<td class="val tiny' + (c.isCurrent ? ' cur cur-cell' : '') + '" colspan="' + (YUN_SPAN[yi] || 4) + '">'
        + '<span class="mono">' + esc(c.startYear + '–' + (c.startYear + 19)) + '</span> ' + esc(starTxt || '') + '<br>'
        + P.badge(c.gz, {
          // 2026-09-12 由主料 03:726-738《九运—九宫运—九宫映射》直证
          //（运行干支 = 该运所属卦宫的干支：一运戊子 … 七运丁酉 … 九运己巳）
          // → 由 derived_candidate 升为 confirmed，原「+62k」TEMP_DECISION 已作废
          field_status: 'confirmed', field_id: 'dynamicTransit.yun.gz',
          rule_id: 'LSY-TIME-JIUYUN',
          source_refs: ['03-老韩天时-63P书籍清洗-260903 √.md:691-716',
            '03-老韩天时-63P书籍清洗-260903 √.md:726-738'],
          exception_policy: '运行干支 = 该运所属卦宫的干支（九宫列）：'
            + '一运戊子 / 二运癸未 / 三运庚寅 / 四运辛巳 / 五运戊己 / 六运壬戌 / '
            + '七运丁酉 / 八运丙寅 / 九运己巳。'
            + '参考图 运 行七/八/九运三格读数丁酉·丙寅·己巳即该表第 7/8/9 行，全部吻合。'
            + '⚠ 五运居中宫无地支，干支列为「戊己」（主料原样，非笔误）。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
        })
        + '<br>'
        + P.badge(wdTxt + '　' + guaTxt, {
          field_status: 'confirmed', field_id: 'dynamicTransit.yun.jiuYun',
          rule_id: 'LSY-TIME-JIUYUN',
          source_refs: ['03-老韩天时-63P书籍清洗-260903 √.md:653-654',
            '03-老韩天时-63P书籍清洗-260903 √.md:728-738',
            '03-老韩天时-63P书籍清洗-260903 √.md:573-582'],
          exception_policy: '九星按序对应九运（贪狼…右弼）；卦名/颜色/五行/方位均有主料。'
            + '参考图 运 行三格对拍全中：七运破军(丁酉 金正西 兑七赤)、'
            + '八运左辅(丙寅 土东北 艮八白)、九运右弼(己巳 火正南 离九紫)。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
        })
        + '</td>';
    });
    out += '</tr>';

    // ── 旬（10 年大运 = 六甲流旬）────────────────────────────────────
    //   语料 3640：「六甲流旬 (10年大运) → 值符行符、德性空孤、藏天贵」
    //   术语（使用者裁决 2026-09-12）：
    //     · 原旬静符 = 出生时所带之符（本行旬头干支即原旬）
    //     · 流年动符 = 成长过程中逐旬/逐年变化之符
    out += '<tr><td class="lbl">旬</td>';
    t.xun.cells.forEach(function (c) {
      var isBirthXun = (c.head === birthXun);
      out += '<td class="val tiny mono' + (c.isCurrent ? ' cur cur-cell' : '')
        + '" colspan="3"'
        + (isBirthXun ? ' title="出生旬"' : '') + '>'
        + esc(c.startYear + '–' + (c.startYear + 9)) + '<br>' + esc(c.head) + (isBirthXun ? '★' : '') + '</td>';
    });
    out += '</tr>';

    out += '</table>';
    return out;
  }

  // ==================================================== ⑧ 年历行 / ⑨ 月历行 + 日 / 时表
  function yearRow(cd) {
    var t = cd.dynamicTransit;
    var out = '<div class="scroll-x"><table class="tbl">';
    out += '<tr><td class="lbl" style="width:34px">年</td>';
    t.yearRow.forEach(function (r) {
      out += '<td class="val sm mono' + (r.isCurrent ? ' cur cur-cell' : '') + '">' + esc(r.year) + '</td>';
    });
    out += '</tr><tr><td class="lbl">龄</td>';
    t.yearRow.forEach(function (r) {
      // 出生前的年份不给负年龄（使用者 2026-09-11 裁决）→ 显示「—」
      out += '<td class="val tiny mono' + (r.beforeBirth ? ' muted' : '') + '">'
        + (r.beforeBirth ? '—' : esc(r.age)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">历</td>';
    t.yearRow.forEach(function (r) {
      out += '<td class="val tiny">' + esc(r.gz.slice(0, 1)) + '<br>' + esc(r.gz.slice(1)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">符</td>';
    t.yearRow.forEach(function (r) {
      out += '<td class="val tiny">' + P.badge(r.fu, {
        field_status: 'conditional', field_id: 'dynamicTransit.yearRow.fu.' + r.year, rule_id: 'LSY-TALISMAN-002',
        source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:10114-10134', '01-书同课程-35P录音稿清洗-260831 √.md:9911-9944'],
        exception_policy: '前导数字 = 该年干支的爻位（查表）；符名 = 旬头起值符顺布。12/12 参考图复核通过。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      }) + '</td>';
    });
    out += '</tr></table></div>';
    return out;
  }

  function monthRow(cd) {
    var t = cd.dynamicTransit;
    var names = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
    var out = '<div class="scroll-x"><table class="tbl">';
    out += '<tr><td class="lbl" style="width:34px">月</td>';
    t.monthRow.forEach(function (r) {
      // 当月刊做底色（与「贵」列的 .gui-cur 同族，用 .cur-cell）——
      // 参考图 ⑨ 把农历七月染黄（该图测算日 2026-09-03 = 七月廿二）
      // 显示名必须跟随格子自身的农历月序，不能依赖 forEach 的位置变量。
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '"'
        + ' data-lunar-month="' + esc(r.index) + '" style="color:var(--violet)">'
        + esc(names[r.index - 1]) + '</td>';
    });
    out += '</tr><tr><td class="lbl">※</td>';
    t.monthRow.forEach(function (r) {
      out += '<td class="val tiny"' + (r.size ? ' style="color:var(--violet)"' : '') + '>'
        + P.badge(r.size, {
          field_status: r._sizeStatus || (r.size ? 'confirmed' : 'RULE_PENDING'),
          field_id: 'dynamicTransit.monthRow.size', rule_id: 'LSY-TIME-MONTHSIZE',
          source_refs: ['历法层：lunar 库逐月天数（30=大 / 29=小）',
            '参考图 ⑨ 月历 ※ 行（2026 年 12/12 对拍）'],
          exception_policy: '大小月由历法层算出（非规则层）。'
            + '对拍依据：参考图 2026 年 ※ 行 = 大小大小小大小小大大大小，引擎逐月吻合 12/12。'
            + '⚠ 此前误标「全库零定义」为 RULE_PENDING，实为可算，已修。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
        }) + '</td>';
    });
    out += '</tr><tr><td class="lbl">历</td>';
    t.monthRow.forEach(function (r) {
      out += '<td class="val tiny">' + esc(r.gz.slice(0, 1)) + '<br>' + esc(r.gz.slice(1)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">符</td>';
    t.monthRow.forEach(function (r) {
      out += '<td class="val tiny">' + P.badge(r.fu, {
        field_status: 'conditional', field_id: 'dynamicTransit.monthRow.fu.' + r.index, rule_id: 'LSY-TALISMAN-002',
        source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:9864', '04-老韩人和-65P书籍清洗-260903 √.md:6891-6899'],
        exception_policy: '月行符名 = (月支 − 旬头支) 取模查星序；前导数字 = 该月干支爻位。参考图原图逐格复核 12/12 通过。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      }) + '</td>';
    });
    out += '</tr></table></div>';
    return out;
  }

  // 命盘页内联日 / 时表：复用周历渲染器的日格与五鼠遁表，基准固定为系统当天。
  // 周历独立页面取消后，日、时信息仍在命盘页⑨月历下方连续呈现。
  function dayTimeRows() {
    var R = root.LSY.renderCalendar;
    // render-chart 也被若干纯排盘专项测试单独加载；无日/时组件时保持原有排盘可独立渲染。
    if (!R) return '';
    var now = new Date();
    var rec = root.LSY.engine.calendar.rectify({
      year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
      hour: now.getHours(), minute: now.getMinutes(), calendarType: 'solar'
    });
    var anchor = R.anchorBranchOf(rec.solar.year);
    var base = { year: rec.solar.year, month: rec.solar.month, day: rec.solar.day };
    var cells = R.yueCells(rec.solar.year, rec.solar.month, anchor, base);
    var out = '<div class="chart-calendar-inline">'
      + '<div class="inline-calendar-block calendar-page-day">'
      + R.weekGrid({ cells: cells.cells, firstWeekday: cells.firstWeekday })
      + '</div>'
      + '<div class="inline-calendar-block calendar-page-hour">'
      + R.hourStrip(rec)
      + '</div></div>';
    return out;
  }

  // ==================================================== ⑩ 卦象面板
  // 版式对拍参考图（使用者 2026-09-12 附图）：单行横幅表头
  //   「[兑4] 泽山咸 (31) → [兑3] 泽地萃 (45)」+ 左右两列六爻 + 左右两段卦辞。
  //   左列 = 本命卦（带干支/六亲），右列 = **变卦（同样带干支与卦辞）**。
  //   ⚠ 此前右列只画卦画、不显干支，且不输出变卦卦辞 —— 与参考图不符，已修。
  var NATURE = { 乾: '天', 兑: '泽', 离: '火', 震: '雷', 巽: '风', 坎: '水', 艮: '山', 坤: '地' };
  function guaPanel(cd) {
    var g = cd.scenarioDerived.gua;
    if (!g || !g.natal) {
      return '<div class="empty">卦象面板未生成。'
        + esc(g && g.exception_policy ? g.exception_policy : '') + '</div>';
    }
    var n = g.natal;

    // 世应 / 世身 / 六亲：来自八宫装卦（B2-连山易壹级资料:905-928, 963-997）
    //   ⚠ 此前记为「八宫卦序表缺失」→ 该结论有误，已补齐（bajing-shiying.js）。
    //   ⚠ 2026-09-12 版式调整：参考图面板**没有**六亲/世应行，故从爻行内移到脚注，
    //     使主视觉与参考图一致，同时不丢失已验证信息。
    var SY = (g.fields && g.fields.shiYing && g.fields.shiYing.value) || null;

    /** 卦头（宫号 + 卦名 + 周易序号） */
    function head(data, isYuan) {
      var s = '<span class="gh">';
      s += data.gong
        ? '<span class="pal">[' + esc(data.gong.label) + ']</span>'
        : (isYuan ? P.marker(g.fields.gongN) : '');
      s += '<span class="nm">' + esc(data.fullName || data.name || '（卦名待确认）') + '</span>';
      s += data.no ? '<span class="no">(' + esc(data.no) + ')</span>' : P.marker(g.fields.no);
      return s + '</span>';
    }

    /**
     * 一列六爻（自上而下：上爻 → 初爻）
     * @param {Array} lines  六爻数据（含 ganzhi / yang / trigram / pos）
     * @param {object} tri   { upper, lower } 卦的上下卦
     * @param {boolean} withLiuQin 是否显示六亲与世应标签（仅本命卦）
     */
    function linesCol(lines, tri, withLiuQin) {
      var GUA = root.LSY.engine.gua;
      var s = '<div class="gua-lines">';
      for (var i = 5; i >= 0; i--) {
        var L = lines ? lines[i] : null;
        var pos = i + 1;                                   // 1..6
        var t = pos >= 4 ? tri.upper : tri.lower;
        var tl = t ? GUA.TRIGRAM_LINES[t] : null;
        var yang = L ? L.yang : (tl ? tl[pos >= 4 ? pos - 4 : pos - 1] === 1 : null);
        var moving = (n.dongYao === pos);
        var isShi = withLiuQin && !!(SY && SY.shi === pos);
        var isYing = withLiuQin && !!(SY && SY.ying === pos);
        // 卦象标签（兑泽/艮山/坤地…）置于该卦三爻的**中爻**旁（上卦第 5 爻 / 下卦第 2 爻），
        //   与参考图一致（参考图把三爻标签垂直居中于该卦）。
        var triLabel = (pos === 5 || pos === 2) && t ? (t + (NATURE[t] || '')) : '';
        s += '<div class="gua-line' + (moving ? ' moving' : '')
          + (isShi ? ' shi-yao' : '') + (isYing ? ' ying-yao' : '') + '">'
          + '<span class="gz">'
          + (L
            ? P.badge(L.ganzhi || L.gan || null, {
              field_status: L.zhiStatus === 'confirmed' ? 'confirmed' : L.ganStatus,
              field_id: 'scenario.gua.line' + pos,
              rule_id: 'LSY-GUA-NAJIA',
              source_refs: [
                '01-书同课程-35P录音稿清洗-260831 √.md:9605-9616',
                'GE萃取2-260908 X.md:116-127'
              ],
              exception_policy: '六爻干支由纳甲（天干）+ 浑天甲子（地支）装配：'
                + '内卦三爻用内卦干支、外卦三爻用外卦干支；乾坤双干为乾内甲外壬、坤内乙外癸。'
                + '参考图 5 张面板 × 6 爻 = 30/30 逐字命中；变卦六爻同法（兑地示例 乙卯/乙巳/乙未）。',
              interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
            })
            // 卦未成（缺时辰）：本爻无干支可装 → 留白 + 单个待确认点，**不写「待确认」占位字**
            : P.marker({
              field_status: 'RULE_PENDING', field_id: 'scenario.gua.line' + pos,
              rule_id: 'LSY-GUA-NAJIA', source_refs: [],
              exception_policy: '卦未成（缺出生时辰）→ 本爻不装干支。'
            }))
          + (isShi ? '<b class="yao-tag shi">世</b>' : (isYing ? '<b class="yao-tag ying">应</b>' : ''))
          + '</span>'
          // 六亲（装卦命名层；用五行生克，不参与连山易吉凶断语）
          + (withLiuQin && L && L.liuQin ? '<span class="liuqin">' + esc(L.liuQin) + '</span>' : '')
          + '<span class="gua-bar">'
          // ⚠ 阴爻**只能输出一个** `<i class="broken">`：
          //   CSS 里 .broken 用**单条渐变**自己画断口
          //   （`linear-gradient(90deg, ink 0 42%, transparent 42% 58%, ink 58%)`），
          //   一个元素 = 两段一断口。此前写成两个 `<i>` → 每个再断一次，
          //   一个阴爻被画成 **4 段 3 断口**（使用者 2026-09-12 指出「阴卦都画错」）。
          + (yang === null
            ? '<i class="unknown" title="卦未成（缺出生时辰）">?</i>'
            : (yang ? '<i class="solid"></i>' : '<i class="broken"></i>'))
          + (triLabel ? '<span class="trigram">' + esc(triLabel) + '</span>' : '')
          // 动爻标记：参考图作「(3)→」
          + (moving ? '<span class="gua-move">(' + esc(pos) + ')→</span>' : '')
          + '</span>'
          + '</div>';
      }
      s += '</div>';
      return s;
    }

    /** 一段卦辞：四字判语（仅 6 样本）+ 周易卦辞 + 象辞 */
    function textBlock(data, isSource) {
      var v = data && data.verdict;
      var t = data && data.text;
      var s = '<div class="gua-text">';
      if (v) {
        s += P.badge(esc(v.verdict) + '，' + esc(v.grade), {
          field_status: 'candidate', field_id: 'scenario.gua.commentary',
          rule_id: 'LSY-GUA-PANYU', source_refs: [v.src],
          exception_policy: '「四字判语 + 吉凶等第」全库**仅 6 条截图样本**，等第判定逻辑 not-found '
            + '→ 本工具只转录样本、绝不外推（语料红线 05:2472「不允许模型补全」、'
            + '05:2452「不得在缺少规则说明时直接生成断语」、GE萃取2:1517）。'
            + '命中 6 卦之一才显示，其余卦留白。',
          interpretation_type: 'traditional_course', safety_boundary: '仅作传统标注，不构成吉凶结论'
        }, { size: 'tiny' });
        s += '　';
      } else {
        s += P.badge(null, g.fields.commentary, { size: 'tiny' }) + '　';
      }
      if (t) {
        s += esc(t.tuan) + '<br>象曰：' + esc(t.xiang);
      } else {
        s += '<span style="color:var(--ink-3)">卦辞 / 象辞需外部表（data/external/zhouyi-text.js）。</span>';
      }
      s += '</div>';
      return s;
    }

    // ---------------------------------------------------------------- 组装
    var out = '';

    // 卦名横幅（跨两列）：参考图 「[兑4] 泽山咸 (31) → [兑3] 泽地萃 (45)」
    out += '<div class="gua-headline">' + head(n, true);
    if (n.bian) out += '<span class="arrow">→</span>' + head({ name: n.bian.name, fullName: n.bian.fullName, no: n.bian.no, gong: n.bian.gong }, false);
    out += '</div>';

    if (n.blocked) {
      out += '<div class="gua-wrap"><div class="gua-col">'
        + linesCol(null, { upper: n.upper, lower: null }, false)
        + '<div class="empty" style="margin:8px 4px">'
        + '⛔ 缺出生时辰 → <b>下卦无解</b>（公式含时支），本命卦与变卦均无法推出。<br>'
        + '只给出可定的上卦（<b>' + esc(n.upperLabel) + '</b>），下卦、动爻、六爻、世应、六亲一并留白，不猜不补。</div>'
        + '</div><div class="gua-col"><div class="empty" style="margin:12px 4px">'
        + '本命卦未成 → 无变卦。</div></div></div>';
      out += '<div class="legend" style="margin-top:6px">'
        + '⛔ 本命卦未成 → 无卦可系，此处**不输出**周易卦辞/象辞，亦不输出四字判语。'
        + '补齐出生时辰后即可完整推出。</div>';
      return out;
    }

    out += '<div class="gua-wrap">'
      + '<div class="gua-col">' + linesCol(n.lines, { upper: n.upper, lower: n.lower }, true) + '</div>'
      + '<div class="gua-col">'
      + (n.bian
        ? linesCol(n.bian.lines, { upper: n.bian.upper, lower: n.bian.lower }, false)
        : '<div class="empty" style="margin:12px 4px">无法推出变卦。</div>')
      + '</div></div>';

    // 两段卦辞（与两列对齐）
    out += '<div class="gua-texts">'
      + textBlock(n, true)
      + textBlock(n.bian || null, false)
      + '</div>';

    return out;
  }

  /** 推导留痕 + 面板说明（⑩ 尾部） */
  function derivationFoot(g) {
    return '<div class="note-box" style="margin-top:8px">'
      + '<b>推导</b>　' + esc(g.derivation.note) + '<br>'
      + '输入取值：年支 ' + esc(g.derivation.inputs['年支'])
      + '　节气月令 ' + esc(g.derivation.inputs['节气月令'])
      + '　农历日 ' + esc(g.derivation.inputs['农历日'])
      + (g.derivation.inputs['时支'] === null ? '　时支 <span style="color:var(--ev-pending)">缺失</span>' : '　时支 ' + esc(g.derivation.inputs['时支']))
      + '<br>和值：' + esc(g.derivation.sum1)
      + (g.derivation.sum2 === null ? '' : ' → ' + esc(g.derivation.sum2))
      + '</div>'
      + '<div class="legend">' + esc(g.panelNote) + '</div>';
  }

  // ==================================================== 状态横幅
  function statusBanner(cd, out) {
    var b = out.boundary;
    var cls = b.status === 'FULL_CHART' ? 'status-ok'
      : (b.status === 'PARTIAL_THREE_PILLAR' ? 'status-block'
        : (b.status === 'TIME_BOUNDARY_REVIEW' ? 'status-review' : 'status-warn'));
    var ico = b.status === 'FULL_CHART' ? '✓' : '!';
    var label = {
      FULL_CHART: '完整命盘',
      PARTIAL_THREE_PILLAR: '三柱降级（缺时辰）',
      TIME_BOUNDARY_REVIEW: '时间边界待复核',
      LOCATION_CORRECTION_PENDING: '真太阳时未校正'
    }[b.status] || b.status;

    var items = b.flags.filter(function (f) { return f.severity !== 'info'; });
    if (!items.length) return '';
    var html = '<div class="status-banner ' + cls + '"><span class="ico">' + ico + '</span><div class="bd">';
    html += '<b>' + esc(label) + '</b>';
    if (!items.length) {
      html += '<div class="sup">时间整流与四柱均已按当前确认口径生成。</div>';
    } else {
      html += '<ul>';
      items.forEach(function (f) {
        html += '<li>' + esc(f.reason) + ' <span class="sup">可补充：' + esc((f.canSupply || []).join('、')) + '</span></li>';
      });
      html += '</ul>';
    }
    html += '</div></div>';
    return html;
  }

  // ==================================================== 主入口
  /**
   * @param {HTMLElement} mount 挂载点
   * @param {object} out chart-engine build() 的返回值
   */
  function render(mount, out) {
    if (!out || !out.chartData) {
      mount.innerHTML = '<div class="empty">无命盘数据。<a href="profile.html">去填写基础信息</a></div>';
      return;
    }
    var cd = out.chartData;
    var html = '';
    html += statusBanner(cd, out);
    html += '<div class="block" id="b1">' + basicInfo(cd) + '</div>';
    html += '<div class="block" id="b2">' + pillarTable(cd) + '</div>';
    html += '<div class="block" id="b3">' + talismanTable(cd) + '</div>';
    html += '<div class="block" id="b5">' + annotation(cd) + '</div>';
    html += '<div class="block" id="b6">' + heavenEarth(cd) + '</div>';
    html += '<div class="block" id="b3b">' + pillarDerived(cd) + '</div>';
    html += '<div class="block" id="b7">' + timeLayer(cd) + '</div>';
    html += '<div class="block" id="b8">' + yearRow(cd) + '</div>';
    html += '<div class="block" id="b9">' + monthRow(cd) + dayTimeRows() + '</div>';
    html += '<div class="block" id="b10">' + guaPanel(cd) + '</div>';

    html += '<div class="safety">本工具属传统文化知识应用与辅助决策工具。所有标注为'
      + '<b>课程类象 / 倾向 / 待确认</b>的内容均不构成医学诊断、法律意见、财富承诺或确定性预测。'
      + '健康、婚姻、财富、官非等场景只提供倾向、条件、风险与行动建议。</div>';

    mount.innerHTML = html;

    // ③ 十二值符大运表：绑定「行选择」交互
    //   默认高亮已由 talismanTable() 以 class="row-current" 写入（= 当旬行）；
    //   此处仅挂点击/键盘事件，实现「点击其它行动态对应」。
    if (root.LSY && root.LSY.ui && root.LSY.ui.rowSelect) {
      root.LSY.ui.rowSelect.bind(mount);
    }
  }

  root.LSY = root.LSY || {};
  root.LSY.renderChart = {
    render: render,
    basicInfo: basicInfo, pillarTable: pillarTable, talismanTable: talismanTable,
    pillarDerived: pillarDerived, actionRows: actionRows, annotation: annotation,
    heavenEarth: heavenEarth, timeLayer: timeLayer, yearRow: yearRow,
    monthRow: monthRow, guaPanel: guaPanel
  };
})(typeof window !== 'undefined' ? window : this);
