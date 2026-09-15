/*!
 * 连山易 · 周历页渲染器（render-calendar.js）
 * ---------------------------------------------------------------------------
 * 四页纵向周历：年 / 月 / 日 / 时 —— **每页各自对应参考图里的一种视图**
 *
 *   年页  年 / 龄 / 历 / 符 × 12      ← 参考图 年历行（本命年起 12 年）
 *   月页  月 / ※ / 历 × 12            ← 参考图 月历行（正月…腊月 + 大小月 + 月建干支）
 *   日页  7 列（日一二三四五六）网格    ← 参考图 日历页（每格 = 日期 + 农历 + 干支 + 符码）
 *   时页  时 / 历 / 符 × 12 时辰        ← 参考图 时历行（五鼠遁）
 *
 * 底部另有 ① 公历 / 农 / 节 三行信息 与 ② 筛选行，四页共用。
 *
 * ⚠ 2026-09-12 修正：此前「月页」与「日页」调用同一个 `yueCells` 渲染**完全相同**的
 *   周网格（仅标题不同，6 行逐格一致），既非 1:1 复刻、也是纯冗余。现按使用者裁决
 *   改为：月页 = 十二月条（含 ※ 大小月与当月刊底色），日页 = 周网格。
 *   年页同时瘦身：去掉其下重复展开的 12 个逐月小网格，只保留 年/龄/历/符 一表。
 *
 * 符码规则（48/48 参考图复核通过）：
 *   符码 = <爻位><符简称>，两个独立轴
 *     爻位   = 该格自身干支查《六十甲子爻位表》
 *     符名   = STARS[((idx(格内支) − idx(旬头支)) % 12 + 12) % 12]
 *   旬头 = 当值六甲旬首（本工具按**基准年**取）
 *
 * 高亮口径：四页一律高亮**周历基准日**（出生日，或未建档时的今天），
 *   与页头「周历基准」标签一致；不用「系统今天」，以免看 1982 档案时高亮错位。
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var P = root.LSY.pv;
  var esc = P.esc;
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  // lunar-javascript 的节气表使用英文键名，日格显示必须转为中文节气名。
  var JIE_ALIAS = {
    LI_CHUN: '立春', JING_ZHE: '惊蛰', QING_MING: '清明', LI_XIA: '立夏', MANG_ZHONG: '芒种',
    XIAO_SHU: '小暑', LI_QIU: '立秋', BAI_LU: '白露', HAN_LU: '寒露', LI_DONG: '立冬',
    DA_XUE: '大雪', XIAO_HAN: '小寒', YU_SHUI: '雨水', CHUN_FEN: '春分', GU_YU: '谷雨',
    XIAO_MAN: '小满', XIA_ZHI: '夏至', DA_SHU: '大暑', CHU_SHU: '处暑', QIU_FEN: '秋分',
    SHUANG_JIANG: '霜降', XIAO_XUE: '小雪', DONG_ZHI: '冬至', DA_HAN: '大寒'
  };

  function pad(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }
  function D() { return root.LSY.data.core; }
  function C() { return root.LSY.engine.core; }
  function CAL() { return root.LSY.engine.calendar; }

  // 当前旬头支（按测算年）
  function anchorBranchOf(year) {
    return C().yearXun(year).charAt(1);
  }

  // 符码字段元数据（统一口径，避免每格重复构造）
  function fuField(fieldId, extra) {
    return {
      field_status: 'conditional',
      field_id: fieldId,
      rule_id: 'LSY-TALISMAN-002',
      source_refs: [
        '01-书同课程-35P录音稿清洗-260831 √.md:9864',
        '04-老韩人和-65P书籍清洗-260903 √.md:6891-6899',
        '01-书同课程-35P录音稿清洗-260831 √.md:10165'
      ],
      depends_on: [],
      exception_policy: '符码 = 该格干支的爻位 + 旬头起值符顺布的符名，两个独立轴。'
        + '前导数字 48/48、符名 48/48 均在参考原图逐格复核通过。「十二符排符只看地支，不看天干」。'
        + (extra || ''),
      interpretation_type: 'computed',
      safety_boundary: '仅作传统标注，不构成吉凶结论'
    };
  }

  // ==================================================== ① 页头三行
  function headRows(rec, birthXun) {
    var s = rec.solar, l = rec.lunar, jq = rec.jieqi;
    var jieTxt = '';
    if (jq.prev) jieTxt += jq.prev.prevDate + jq.prev.prevName + jq.prev.prevTime;
    if (jq.next) jieTxt += '　' + jq.next.date + jq.next.name + jq.next.time;
    return '<table class="tbl">'
      + '<tr><td class="lbl" style="width:34px">公历</td>'
      + '<td class="val yang" colspan="6">' + esc(s.text) + '</td></tr>'
      + '<tr><td class="lbl">农</td>'
      + '<td class="val yin" colspan="6">' + esc(l.text.replace(/ .*$/, '')) + '</td></tr>'
      + '<tr><td class="lbl">节</td>'
      + '<td class="val" colspan="6" style="color:var(--jade)">'
      + P.badge(jieTxt, {
        field_status: 'conditional', field_id: 'calendar.jieqi', rule_id: 'LSY-CAL-JIEQI',
        source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:1379-1380'],
        exception_policy: '节气换月以交节时刻切分，不按农历初一。秒级裁决属未闭合项。',
        interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论'
      }) + '</td></tr>'
      + '</table>';
  }

  // ==================================================== ② 筛选行
  function filterRow(rec, birthXun) {
    var ps = ['time', 'day', 'month', 'year'].map(function (k) { return rec.pillars[k] || '—'; });
    return '<table class="tbl" style="margin-top:4px">'
      + '<tr>'
      + '<td class="val tiny" style="width:14%">' + esc(rec.external.xiu.slice(0, 1) || '') + '</td>'
      + '<td class="val tiny" style="width:14%">' + esc(rec.external.xiu.slice(1, 2) || '') + '</td>'
      + '<td class="val sm yang" colspan="4">' + ps.map(esc).join('　') + '</td>'
      + '<td class="val tiny" style="background:var(--surface-2)">公历</td>'
      + '<td class="val tiny" style="background:var(--surface-2)">' + esc(birthXun) + '</td>'
      + '</tr></table>';
  }

  // ==================================================== ③ 周历网格
  /**
   * @param {object} opt
   *   cells: [{ y,m,d, solarDay, lunarDay, gz, fu, isTerm, isToday, isOtherMonth }]
   *   anchorBranch: 旬头支
   *   firstWeekday: 0..6
   */
  function weekGrid(opt) {
    var cells = opt.cells;
    var out = '<table class="cal-grid">';
    out += '<tr>' + WD.map(function (w) { return '<th>' + w + '</th>'; }).join('') + '</tr>';

    var idx = 0, total = cells.length;
    var first = opt.firstWeekday;
    // 首行前置空格
    var rows = [];
    var row = [];
    for (var i = 0; i < first; i++) row.push(null);
    while (idx < total) {
      row.push(cells[idx++]);
      if (row.length === 7) { rows.push(row); row = []; }
    }
    if (row.length) { while (row.length < 7) row.push(null); rows.push(row); }

    rows.forEach(function (r) {
      out += '<tr>';
      r.forEach(function (c) {
        if (!c) { out += '<td class="muted"></td>'; return; }
        var cls = [c.isToday ? 'today' : '', c.isTerm ? 'term' : '', c.isOtherMonth ? 'muted' : ''].join(' ').trim();
        // 标记角标（参考图：日格右上角的小色块 + 字）
        var marksHtml = '';
        if (c.marks && c.marks.length) {
          marksHtml = '<div class="cal-marks">'
            + c.marks.map(function (mk) {
              var color = mk.color === 'purple' ? 'var(--violet)'
                : (mk.color === 'green' ? 'var(--ev-ok, #2a7)' : 'var(--yin)');
              return '<span class="cal-mark" style="background:' + color + '" title="'
                + esc(mk.name) + '">' + esc(mk.mark) + '</span>';
            }).join('')
            + '</div>';
        }
        var dayText = c.isSolarMonthStart
          ? '<span class="month-tag">' + esc(pad(c.month) + '月') + '</span>' + esc(c.dayLabel)
          : esc(c.dayLabel);
        out += '<td class="' + cls + '">'
          + marksHtml
          + '<div class="d">' + dayText + '</div>'
          + '<div class="lv">' + esc(c.lunarLabel) + '</div>'
          + '<div class="gz-line"><span class="gz">' + P.badge(c.gz, {
            field_status: 'confirmed', field_id: 'cal.' + c.gz, rule_id: 'LSY-BASE-GANZHI'
          }) + '</span><span class="fu">' + P.badge(c.fu, fuField('cal.fu.' + c.gz)) + '</span></div>'
          + '</td>';
      });
      out += '</tr>';
    });
    out += '</table>';
    return out;
  }

  // ==================================================== ④ 十二月 / 十二时辰表
  function stripTable(rows, labelLeft, labelRight) {
    var out = '<table class="tbl hour-tbl">';
    out += '<tr><td class="lbl" style="width:34px">' + esc(labelLeft) + '</td>';
    rows.forEach(function (r) { out += '<td class="val tiny">' + esc(r.a) + '</td>'; });
    out += '</tr><tr><td class="lbl">' + esc(labelRight) + '</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny">' + P.badge(r.fu, fuField('strip.fu.' + r.a, r.extra)) + '</td>';
    });
    out += '</tr></table>';
    return out;
  }

  /** 12 时辰表：时 / 历（干支）/ 符 */
  function hourStrip(rec) {
    var D0 = D();
    var dayGan = rec.pillars.day.charAt(0);
    var anchor = anchorBranchOf(rec.solar.year);
    var now = new Date();
    var isToday = rec.solar.year === now.getFullYear()
      && rec.solar.month === now.getMonth() + 1
      && rec.solar.day === now.getDate();
    var currentZhi = isToday && C().hourZhiByHour
      ? C().hourZhiByHour(now.getHours()) : null;
    var rows = D0.ZHI.map(function (z) {
      var gz = C().hourGZ(dayGan, z);
      var start = (D0.ZHI.indexOf(z) * 2 + 23) % 24;
      return { a: z, gz: gz, fu: C().fuCode(gz, anchor), start: start,
        isCurrent: z === currentZhi };
    });
    var out = '<table class="tbl hour-tbl">';
    out += '<tr><td class="lbl" style="width:34px">时</td>';
    rows.forEach(function (r) {
      var e = (r.start + 2) % 24;
      out += '<td class="val tiny mono' + (r.isCurrent ? ' cur cur-cell' : '') + '">' + pad(r.start) + '.<br>' + pad(e) + '</td>';
    });
    out += '</tr><tr><td class="lbl">历</td>';
    rows.forEach(function (r) {
      out += '<td class="val sm' + (r.isCurrent ? ' cur cur-cell' : '') + '">' + esc(r.gz.charAt(0)) + '<br>' + esc(r.gz.charAt(1)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">符</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '">' + P.badge(r.fu, fuField('hour.fu.' + r.gz)) + '</td>';
    });
    out += '</tr></table>';
    return out;
  }

  // ==================================================== 四种视图
  /**
   * 某公历月的日格数组。
   * @param {number} year  公历年
   * @param {number} month 公历月 1..12
   * @param {string} anchor 旬头地支（符码锚点）
   * @param {object} [base] 周历基准日 {year,month,day} → 决定高亮格（缺省=系统今天）
   */
  function yueCells(year, month, anchor, base) {
    var L = CAL().lib();
    var first = L.Solar.fromYmd(year, month, 1);
    var days = first.getLunar().getMonth() === 0 ? 30 : new Date(year, month, 0).getDate();
    var firstWd = new Date(year, month - 1, 1).getDay();
    var hi = base || { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() };
    var cells = [];
    var jqTable = {};
    try {
      var t = L.Solar.fromYmd(year, month, 15).getLunar().getJieQiTable();
      Object.keys(t).forEach(function (k) {
        var s = t[k];
        if (s && s.getYear() === year && s.getMonth() === month) {
          jqTable[s.getDay()] = JIE_ALIAS[k] || k;
        }
      });
    } catch (e) { /* ignore */ }

    for (var d = 1; d <= days; d++) {
      var s = L.Solar.fromYmd(year, month, d);
      var lu = s.getLunar();
      var gz = lu.getDayInGanZhi();
      var dayCn = lu.getDayInChinese();
      // 农历月首显示月名（参考图口径：「七月初一」而非仅「初一」）
      var monCn = lu.getMonthInChinese ? lu.getMonthInChinese() : '';
      var prefix = (lu.getDay() === 1 && monCn) ? (monCn + '月') : '';
      cells.push({
        dayLabel: pad(d) + (jqTable[d] ? jqTable[d] : ''),
        month: month,
        isSolarMonthStart: d === 1,
        lunarLabel: prefix + dayCn,
        lunarDayNum: d,
        lunarMonthCn: monCn,
        isLunarMonthStart: lu.getDay() === 1,
        gz: gz,
        fu: C().fuCode(gz, anchor),
        // 节日/纪念日/法定假日标记（数据源见 data/calendar-markers.js）
        marks: (function () {
          var MK = root.LSY && root.LSY.data && root.LSY.data.calendarMarkers;
          if (!MK) return [];
          try {
            return MK.marksOf(year, month, d, { month: lu.getMonth(), day: lu.getDay() });
          } catch (e) { return []; }
        })(),
        isTerm: !!jqTable[d],
        // 高亮 = 周历基准日（出生日 / 今天），不是「系统今天」
        isToday: (hi.year === year && hi.month === month && hi.day === d)
      });
    }
    return { cells: cells, firstWeekday: firstWd };
  }

  // ---------------------------------------------------------- 年页：年 / 龄 / 历 / 符 × 12
  /**
   * 12 年条：自**基准年所在旬的旬首年**起排（与排盘页 ⑧ 同规则），
   * 高亮基准年。年龄以基准年为 0 起算。
   */
  function yearStrip(year, anchor, base) {
    var xunBase = C().xunBlockStart(year);
    var baseYear = (base && base.year !== undefined) ? base.year : year;
    var rows = [];
    for (var a = 0; a < 12; a++) {
      var ay = xunBase + a;
      var gz = C().yearGZ(ay);
      var ageN = ay - year;
      rows.push({
        year: ay, gz: gz, age: ageN, beforeBirth: ageN < 0,
        fu: C().fuCode(gz, anchor),
        isCurrent: ay === baseYear
      });
    }
    var out = '<div class="scroll-x"><table class="tbl">';
    out += '<tr><td class="lbl" style="width:34px">年</td>';
    rows.forEach(function (r) {
      out += '<td class="val sm mono' + (r.isCurrent ? ' cur cur-cell' : '') + '">' + esc(r.year) + '</td>';
    });
    out += '</tr><tr><td class="lbl">龄</td>';
    rows.forEach(function (r) {
      // 出生前的年份不给负年龄（使用者 2026-09-11 裁决）→ 显示「—」
      out += '<td class="val tiny mono' + (r.beforeBirth ? ' muted' : '') + '">'
        + (r.beforeBirth ? '—' : esc(r.age)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">历</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny">' + esc(r.gz.charAt(0)) + '<br>' + esc(r.gz.charAt(1)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">符</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny">' + P.badge(r.fu, fuField('yearStrip.fu.' + r.year)) + '</td>';
    });
    out += '</tr></table></div>';
    return out;
  }

  function renderYearPage(year, anchor, birthXun, base) {
    return '<div class="block">'
      + yearStrip(year, anchor, base)
      + '</div>';
  }

  // ---------------------------------------------------------- 月页：月 / ※ / 历 × 12
  /**
   * 十二月条：月名（正…腊）/ ※ 大小月 / 月建干支，**当月刊**做底色。
   * 月建干支由基准年的年干经五虎遁推出；大小月按农历月序（见 calendar.lunarMonthSizeOf）。
   * 与排盘页 ⑨ 月历行同源，口径一致（2026 年 ※ 行 12/12 对拍参考图）。
   */
  function monthStrip(year, anchor, base) {
    var names = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
    var tGan = C().yearGZ(year).charAt(0);
    var baseLunarMonth = null;
    if (base) {
      try {
        baseLunarMonth = CAL().lib().Solar
          .fromYmd(base.year, base.month, base.day).getLunar().getMonth();
      } catch (e) { baseLunarMonth = null; }
    }
    var rows = [];
    for (var m = 1; m <= 12; m++) {
      var gz = C().monthGZByIndex(tGan, m - 1);
      rows.push({
        index: m, name: names[m - 1], gz: gz,
        fu: C().fuCode(gz, anchor),
        size: CAL().lunarMonthSizeOf(year, m),
        isCurrent: baseLunarMonth !== null && m === baseLunarMonth
      });
    }
    var sizeField = function (s) {
      return {
        field_status: s ? 'confirmed' : 'RULE_PENDING',
        field_id: 'cal.monthStrip.size', rule_id: 'LSY-CAL-EXTERNAL-MONTHSIZE',
        source_refs: ['历法层（lunar-javascript）逐日扫描：30=大 / 29=小',
          '参考图 ⑨ 月历 ※ 行（2026 年 12/12 对拍）'],
        exception_policy: '连山易 A/B 两库对「大月/小月（29/30 天）」零定义（03:1128-1131 要求另补历法规范），'
          + '故本行取自历法层，仅作历法标注，**不参与任何连山易判定**。'
          + '⚠ 按**农历月序**取（1982 有闰四月，故不能按「相邻月首日差」）。',
        interpretation_type: 'computed', safety_boundary: '仅作历法标注，不构成吉凶结论'
      };
    };
    var out = '<div class="scroll-x"><table class="tbl">';
    out += '<tr><td class="lbl" style="width:34px">月</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '" style="color:var(--violet)">'
        + esc(r.name) + '</td>';
    });
    out += '</tr><tr><td class="lbl">※</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '" style="color:var(--violet)">'
        + P.badge(r.size, sizeField(r.size)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">历</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '">'
        + esc(r.gz.charAt(0)) + '<br>' + esc(r.gz.charAt(1)) + '</td>';
    });
    out += '</tr><tr><td class="lbl">符</td>';
    rows.forEach(function (r) {
      out += '<td class="val tiny' + (r.isCurrent ? ' cur cur-cell' : '') + '">'
        + P.badge(r.fu, fuField('monthStrip.fu.' + r.gz)) + '</td>';
    });
    out += '</tr></table></div>';
    return out;
  }

  function renderMonthPage(year, anchor, base) {
    // 页头显式给出「基准日 → 其农历月」，因为 ※/月/历 三行是按**农历月序**排的，
    //   底色格落在农历月上；若只写公历月会让人以为高亮错位。
    var tag = '';
    if (base) {
      try {
        var lu = CAL().lib().Solar.fromYmd(base.year, base.month, base.day).getLunar();
        tag = '　基准 ' + base.year + '-' + pad(base.month) + '-' + pad(base.day)
          + '（' + lu.getMonthInChinese() + '月）';
      } catch (e) { tag = ''; }
    }
    return '<div class="block">'
      + monthStrip(year, anchor, base)
      + '</div>';
  }

  // ---------------------------------------------------------- 日页：周网格
  function renderDayPage(rec, anchor, base) {
    var s = rec.solar;
    var cells = yueCells(s.year, s.month, anchor, base);
    return '<div class="block calendar-page-day">'
      + weekGrid({ cells: cells.cells, firstWeekday: cells.firstWeekday })
      + '</div>';
  }

  function renderHourPage(rec) {
    return '<div class="block calendar-page-hour">' + hourStrip(rec) + '</div>';
  }

  // ==================================================== 主入口
  /**
   * @param {HTMLElement} mount
   * @param {object} rec  calendar.rectify 的输出
   * @param {object} opt  { birthXun }
   */
  function render(mount, rec, opt) {
    opt = opt || {};
    var anchor = anchorBranchOf(rec.solar.year);
    var birthXun = opt.birthXun || '—';
    // 周历基准日：四页高亮与「当月/基准月」判定共用同一个日期
    var base = opt.base || {
      year: rec.solar.year, month: rec.solar.month, day: rec.solar.day
    };

    var html = '';
    html += headRows(rec, birthXun);
    html += filterRow(rec, birthXun);

    // 月历（日格）之后紧接日表、时表；三者保持同一条纵向阅读流。
    html += '<div class="pager pager-stack" id="pager">'
      + '<div class="page">' + renderYearPage(rec.solar.year, anchor, birthXun, base) + '</div>'
      + '<div class="page">' + renderMonthPage(rec.solar.year, anchor, base) + '</div>'
      + '<div class="page">' + renderDayPage(rec, anchor, base) + '</div>'
      + '<div class="page">' + renderHourPage(rec) + '</div>'
      + '</div>';

    mount.innerHTML = html;

  }

  root.LSY = root.LSY || {};
  root.LSY.renderCalendar = {
    render: render,
    yueCells: yueCells,
    weekGrid: weekGrid,
    hourStrip: hourStrip,
    anchorBranchOf: anchorBranchOf
  };
})(typeof window !== 'undefined' ? window : this);
