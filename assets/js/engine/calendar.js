/*!
 * 连山易 · 历法整流层（calendar.js）
 * ---------------------------------------------------------------------------
 * 职责：rawInput → calendarData（时间整流 + 四柱 + 节气 + 边界检测）
 *
 * 严守《MVP工具知识库契约草案》与《排盘底座字段映射草案》的分层：
 *   rawInput → inputGate → timeCalibration → fourPillars → staticChartData
 * 本文件只负责 timeCalibration + fourPillars，不做任何解释、不下任何结论。
 *
 * ⚠ 知识库明确的两处缺口（不得静默处理）：
 *   1. 真太阳时 / 均时差 / 节气秒级 / 23:00 子初换日：
 *      01-书同课程:1176、:9098 两处独立章节都把它列为「待补算法」，
 *      具体规则只在二次文档 → 一律挂 TIME_BOUNDARY_REVIEW，禁止取整。
 *   2. 大月/小月、闰月口径：A/B 全库零定义（03:1128-1131 要求另补历法规范）
 *      → 仅作历法库输出，标 status='external'。
 *
 * 历法数据源：内置 lunar-javascript 1.6.12（离线，见 assets/vendor/）
 *   - 已验证与参考图逐项一致（农历/四柱/节气/星宿/星座/生肖/星期）
 *   - 节气时刻与参考图存在 14-15 秒差异 → 交节 ±1 天挂临界标记
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dict-core.js'));
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.calendar = factory(root.LSY.data.core);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var ZHI = D.ZHI, GAN = D.GAN;

  /** 取得历法库（Node 用 require，浏览器用全局注册的 Solar/Lunar） */
  function lib() {
    if (typeof module === 'object' && module.exports) {
      return require('../../vendor/lunar.js');
    }
    // 浏览器：lunar.js 的 UMD 分支把 Solar / Lunar 直接挂到全局对象
    var g = (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self
        : (typeof globalThis !== 'undefined') ? globalThis : {};
    return { Solar: g.Solar, Lunar: g.Lunar };
  }
  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }

  /** 全局对象（浏览器 / worker / node 三态） */
  function G() {
    return (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self
        : (typeof globalThis !== 'undefined') ? globalThis : {};
  }
  /** 取得 data/ 下的数据模块（Node 用 require，浏览器读全局注册） */
  function dataMod(nodePath, globalKey) {
    if (typeof module === 'object' && module.exports) {
      try { return require(nodePath); } catch (e) { return null; }
    }
    var g = G();
    return (g.LSY && g.LSY.data && g.LSY.data[globalKey]) || null;
  }
  /** 取得 engine/truesolar.js */
  function tsMod() {
    if (typeof module === 'object' && module.exports) {
      try { return require('./truesolar.js'); } catch (e) { return null; }
    }
    var g = G();
    return (g.LSY && g.LSY.engine && g.LSY.engine.truesolar) || null;
  }

  // =================================================== 出生地 → 经度
  /**
   * 解析出生地经度。优先级：
   *   1) input.longitude（显式数值）
   *   2) input.place 文本 → data/city-longitude.js 城市表 / 显式经度写法
   * @returns {Object|null} { longitude, matched, cst, source }
   */
  function resolveLongitude(input) {
    if (input.longitude !== undefined && input.longitude !== null && input.longitude !== ''
      && !isNaN(Number(input.longitude))) {
      var v = Number(input.longitude);
      if (Math.abs(v) <= 180) {
        var CITY0 = dataMod('../../../data/city-longitude.js', 'city');
        var hit0 = (CITY0 && input.place) ? CITY0.lookup(input.place) : null;
        return {
          longitude: v, matched: 'explicit', cst: hit0 ? hit0.cst : null,
          source: '用户直接输入的经度'
        };
      }
    }
    var CITY = dataMod('../../../data/city-longitude.js', 'city');
    if (!CITY || !input.place) return null;
    return CITY.lookup(input.place);
  }

  /**
   * 输入钟表时间对应的当地 UTC 偏移（小时）。海外必须显式提供，
   * 国内 UTC+8 城市可由基准时区补齐；不得把海外时间默认为北京时间。
   */
  function resolveTimezoneOffset(input, lonInfo) {
    var v = input && input.timezoneOffset;
    if (v !== undefined && v !== null && v !== '' && isFinite(Number(v))) {
      v = Number(v);
      if (v >= -12 && v <= 14) return { value: v, source: '用户提供的当地 UTC 偏移' };
    }
    if (lonInfo && lonInfo.cst === true) return { value: 8, source: 'UTC+8 基准时区' };
    return null;
  }

  var MS_DAY = 86400000;
  function dayStart(y, m, d) { return new Date(y, m - 1, d).getTime(); }
  function rd(s) { return new Date(s.getYear(), s.getMonth() - 1, s.getDay()).getTime(); }

  // ============================================================ 节气定位
  /**
   * 找出 date 之前最近的节气与之后最近的节气。
   * 节气表含 31 条（跨两个农历年，键名有拼音大写重复项），故按时间排序去重后再定位。
   */
  function jieQiAround(lunar, solar) {
    var table = lunar.getJieQiTable();
    var list = [];
    Object.keys(table).forEach(function (k) {
      var s = table[k];
      if (!s || typeof s.getYear !== 'function') return;
      list.push({ name: k, solar: s, t: s.getYear() * 10000 + s.getMonth() * 100 + s.getDay() });
    });
    var cur = solar.getYear() * 10000 + solar.getMonth() * 100 + solar.getDay();
    var prev = null, next = null;
    list.forEach(function (it) {
      if (it.t <= cur) { if (!prev || it.t > prev.t) prev = it; }
      if (it.t > cur) { if (!next || it.t < next.t) next = it; }
    });
    return { prev: prev, next: next, all: list };
  }

  /** 节气名前缀判定：节（换月） vs 气（中气） */
  var JIE_NAMES = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
  // 历法库的上一农历年键名用全大写拼音，需还原成中文
  var JIE_ALIAS = {
    // 十二节（换月）
    LI_CHUN: '立春', JING_ZHE: '惊蛰', QING_MING: '清明', LI_XIA: '立夏', MANG_ZHONG: '芒种',
    XIAO_SHU: '小暑', LI_QIU: '立秋', BAI_LU: '白露', HAN_LU: '寒露', LI_DONG: '立冬',
    DA_XUE: '大雪', XIAO_HAN: '小寒',
    // 十二气（中气）
    YU_SHUI: '雨水', CHUN_FEN: '春分', GU_YU: '谷雨', XIAO_MAN: '小满', XIA_ZHI: '夏至',
    DA_SHU: '大暑', CHU_SHU: '处暑', QIU_FEN: '秋分', SHUANG_JIANG: '霜降', XIAO_XUE: '小雪',
    DONG_ZHI: '冬至', DA_HAN: '大寒'
  };
  function jieDisplayName(rawName) {
    return JIE_ALIAS[rawName] || rawName;
  }
  function isJie(rawName) {
    return JIE_NAMES.indexOf(jieDisplayName(rawName)) >= 0;
  }

  // ============================================================ 时辰定位
  /** 十二时辰支：子时 23:00-00:59，显示为包含式分钟区间 */
  function hourZhi(hh) {
    if (hh === 23 || hh === 0) return '子';
    return ZHI[Math.floor((hh + 1) / 2) % 12];
  }
  /** 时辰区间显示：子 → '23~00点'；终点为该时辰最后一分钟 */
  function hourRangeLabel(z) {
    var i = ZHI.indexOf(z);
    var start = (i * 2 + 23) % 24;
    var nextStart = (i * 2 + 1) % 24;
    var end = nextStart === 0 ? 23 : nextStart - 1;
    return (start < 10 ? '0' + start : start) + '~' + (end < 10 ? '0' + end : end) + '点';
  }

  /**
   * 输入日期合法性：先拦截不存在的公历日期，再交给历法库核验农历日期。
   * 返回 { ok, reason }，供 chart-engine 的输入门控与页面提示共用。
   */
  function validateDateInput(input) {
    input = input || {};
    var y = Number(input.year), m = Number(input.month), d = Number(input.day);
    var isInt = function (n) { return Number.isInteger(n); };
    if (!isInt(y) || y < 1901 || y > 2100) {
      return { ok: false, reason: '年份必须是 1901–2100 的整数。' };
    }
    if (!isInt(m) || !isInt(d)) {
      return { ok: false, reason: '出生日期的年、月、日必须填写为整数。' };
    }
    if (input.calendarType === 'lunar') {
      if (m === 0 || Math.abs(m) > 12 || d < 1 || d > 30) {
        return { ok: false, reason: '农历日期无效，请检查月份、日期及闰月标记。' };
      }
      try {
        lib().Lunar.fromYmd(y, m, d);
      } catch (e) {
        return { ok: false, reason: '农历日期无效，请检查月份、日期及闰月标记。' };
      }
      return { ok: true, reason: '' };
    }
    if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) {
      return { ok: false, reason: '公历日期不存在，请检查月份与日期。' };
    }
    return { ok: true, reason: '' };
  }

  // ====================================================== 出生信息 → 四柱
  /**
   * @param {object} input { year, month, day, hour, minute, calendarType:'solar'|'lunar', gender }
   * @returns {object} 整流结果
   */
  function rectify(input) {
    var L = lib();
    var Solar = L.Solar, Lunar = L.Lunar;
    var y = input.year, mo = input.month, d = input.day;
    var hh = (input.hour === undefined || input.hour === null) ? null : input.hour;
    var mi = input.minute || 0;
    // 只知道“亥时”时，hour 只是区间起点的内部占位，不是真实出生时刻。
    // 只有 minute 精度才允许夏令时/真太阳时把时辰推过边界。
    var exactTime = input.timePrecision !== 'shichen';
    var selectedZhi = input.shichen || (hh === null ? null : hourZhi(hh));
    // 记录输入原值（供夏令时校正后回溯展示）
    var inputRaw = { year: y, month: mo, day: d, hour: hh, minute: mi };

    // ── 夏令时（夏时制）行政扣除 ────────────────────────────────────────
    //   语料 GE萃取2:4580「**必须强制剔除**：凡是判定出生于夏令时实行期间的时间，
    //   必须在系统底层强制减去 1 小时，还原为该地区真实的物理平太阳时」；
    //   4581 / 4625 / 5079 同旨（4625 给出精确用例：1988-05-12 21:30 → 20:30，
    //   时柱 丁亥 → 丙戌）。
    //   中国 1986–1991 全国统一施行（区间表见 data/dst-ranges.js，含 1986 首年例外）。
    //   ⚠ 输入约定：用户所填为**行政钟表时间**（profile 页提示「真太阳时未校正」），
    //     故落在该区间内即须 −1 小时。
    //   input.skipDst = true 可显式跳过（供用户声明其填写的已是校正后时间）。
    var dstApplied = false, dstNote = null, dstCrossShichen = false;
    var DST = dataMod('../../../data/dst-ranges.js', 'dst');
    if (DST && exactTime && hh !== null && !input.skipDst && DST.inDst(y, mo, d)) {
      var totalMin = hh * 60 + mi + DST.OFFSET_MINUTES;
      var dstDayShift = 0;
      while (totalMin < 0) { totalMin += 1440; dstDayShift -= 1; }
      while (totalMin >= 1440) { totalMin -= 1440; dstDayShift += 1; }
      if (dstDayShift !== 0) {
        var ndd = new Date(Date.UTC(y, mo - 1, d));
        ndd.setUTCDate(ndd.getUTCDate() + dstDayShift);
        y = ndd.getUTCFullYear(); mo = ndd.getUTCMonth() + 1; d = ndd.getUTCDate();
      }
      // 时辰跨界检测：原输入时辰支 vs 扣除后时辰支
      //   ⚠ 本工具输入粒度为「时辰」（2 小时）。减去 1 小时后，若时支发生变化，
      //     说明**真实出生时刻落在该时辰的前一小时内**（否则不会跨界）。
      //     此情形下时支由输入值决定，但真实出生时刻无法由 2 小时粒度唯一确定
      //     → 标记 dstCrossShichen，并在 UI 同时给出两个候选，不静默二选一。
      var zhiBefore = hourZhi(hh);
      hh = Math.floor(totalMin / 60);
      mi = totalMin % 60;
      var zhiAfter = hourZhi(hh);
      dstApplied = true;
      dstCrossShichen = (zhiBefore !== zhiAfter);
      dstNote = '输入 ' + inputRaw.hour + ':' + String(inputRaw.minute).padStart(2, '0')
        + ' 处于中国夏令时期间（1986–1991），已按语料 4580 强制 −1 小时 → '
        + hh + ':' + String(mi).padStart(2, '0')
        + (dstCrossShichen
          ? '；⚠ 该时辰连带跨界（' + zhiBefore + '→' + zhiAfter + '），'
            + '表示真实出生时刻落在「' + zhiBefore + '时」的前一小时内'
          : '');
    }

    var solar, lunar;
    if (input.calendarType === 'lunar') {
      // 农历输入：缺时辰时用 0 点占位仅用于取日期，四柱时柱标缺失
      lunar = Lunar.fromYmdHms(y, mo, d, hh === null ? 0 : hh, mi, 0);
      solar = lunar.getSolar();
    } else {
      solar = Solar.fromYmdHms(y, mo, d, hh === null ? 0 : hh, mi, 0);
      lunar = solar.getLunar();
    }

    // ── 真太阳时校正（语料 S3-连山易天文历法排盘算法与时间边界规则.md） ────
    //   :4  「真太阳时、节气换月、子时换日」是三条**绝对不能动摇的物理交界红线**
    //   :12-14 定义与公式：真太阳时 = 本地钟表时间 − 夏令时偏置 + 经度时差 + 均时差
    //   :119 longitude_offset = (longitude − 120.0) × 4
    //   顺序：夏令时已在上方先行扣除 → 此处再叠加 经度时差 + 均时差。
    //
    //   ⚠ 作用域（严谨口径，本工具的关键设计）：
    //     · **日柱 / 时柱** 改由**真太阳时刻**决定 —— 这两柱的边界（子初换日、
    //       时辰分界）是「当地子正/子初」这类**物理交界**，必须用当地真太阳时刻去比。
    //     · **年柱 / 月柱** 仍用**行政钟表时刻** —— 它们由「出生瞬间 vs 节气瞬间」
    //       的先后决定，而内置节气表与出生时刻处于**同一刻度**；一个统一偏移量
    //       同时作用在两者上不改变先后关系 → 年/月柱不受真太阳时影响。
    //       反之若把真太阳时刻喂给节气比较，就变成「真太阳刻度 vs 行政刻度」的
    //       跨刻度比较，那是错的。
    var clockSolar = {
      year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(),
      hour: hh === null ? 0 : hh, minute: mi
    };
    var lonInfo = resolveLongitude(input);
    var tzInfo = resolveTimezoneOffset(input, lonInfo);
    var TS = tsMod();
    var tsResult = null, tsTime = null;
    if (exactTime && hh !== null && lonInfo && TS) {
      tsResult = TS.rectify({
        year: clockSolar.year, month: clockSolar.month, day: clockSolar.day,
        hour: clockSolar.hour, minute: clockSolar.minute,
        longitude: lonInfo.longitude,
        timezoneOffset: tzInfo ? tzInfo.value : null
      });
      if (tsResult && tsResult.ok) tsTime = tsResult.trueTime;
    }

    // 年柱 / 月柱：行政钟表刻度
    var bazi = lunar.getEightChar();

    // ── 23:00 子初换日（语料 GE萃取2:5305-5307 / 4520-4521 / 4621-4622）
    //   语料原文：「不以子夜24:00（公历0点）换日，而是以子时的起点——晚上23点作为
    //   新一天的开始」；「一旦出生钟表时间达到晚上23:00（含 23:00:00），
    //   日柱干支、时柱干支必须立刻平移切换为下一公历日」。
    //   边界用例（4621-4622）：
    //     2026-09-05 22:59:59 → 日柱用 9/5（甲午）；时柱 乙亥
    //     2026-09-05 23:00:01 → 日柱用 9/6（乙未）；时柱 丙子
    //   ⚠ lunar-javascript 的 getEightChar() 按 00:00 换日，且 23:00 时
    //     **日柱与时柱双双前移**（实测 9/6 23:00 → 日癸未、时甲子），
    //     与语料口径不符 → 故本工具自行整流：
    //       · 日柱：以**真太阳时**的日期为准，该时刻 ≥ 23:00 时取次日
    //       · 时柱：由整流后的日干经**五鼠遁**自行推算（子时干 = 日干序×2 mod 10）
    //     缺时辰 → 日柱仍给（历法可定），时柱 null（不猜测）。
    //     这样 1982-12-26 07:00（日癸未/时丙辰）等既有对拍结果不受影响
    //     —— 该用例未填出生地 → 无真太阳时校正 → 与钟表时一致。
    var eff = (exactTime && tsTime) || clockSolar; // 只知道时辰时不伪造精确校正
    var effH = (hh === null) ? null : eff.hour;
    var dayShift = (effH !== null && effH >= 23) ? 1 : 0;

    var pillarsOut = (function () {
      var dayGZ;
      if (hh === null) {
        dayGZ = bazi.getDay();
      } else {
        // 取该日**正午**（避开 23:00 与 00:00 两个边界），只为读日柱
        var anchor = Solar.fromYmdHms(eff.year, eff.month, eff.day, 12, 0, 0);
        var daySolar = dayShift ? anchor.next(1) : anchor;
        dayGZ = daySolar.getLunar().getEightChar().getDay();
      }
      // 时柱：五鼠遁。语料 GE萃取2:3621「时干由五鼠遁（日上起时）推导」
      var timeGZ = null, timeZhi = null;
      if (effH !== null) {
        var gi = GAN.indexOf(dayGZ.charAt(0));
        var ziGan = GAN[((gi * 2) % 10 + 10) % 10];
        timeZhi = exactTime ? hourZhi(effH) : selectedZhi;
        timeGZ = GAN[(GAN.indexOf(ziGan) + ZHI.indexOf(timeZhi)) % 10] + timeZhi;
      }
      return { year: bazi.getYear(), month: bazi.getMonth(), day: dayGZ, time: timeGZ, timeZhi: timeZhi };
    })();

    var jq = jieQiAround(lunar, solar);
    var prevJq = jq.prev, nextJq = jq.next;

    // 节气「第 N 天」「距 N 天」 —— 参考图有，但口径全库 not-found（05:2058/2505 仅截图）
    // 此处按自然日差计算并标 derived
    var birthDay = dayStart(solar.getYear(), solar.getMonth(), solar.getDay());
    var termInfo = null;
    if (prevJq) {
      var ps = prevJq.solar;
      var pDay = dayStart(ps.getYear(), ps.getMonth(), ps.getDay());
      termInfo = {
        prevName: jieDisplayName(prevJq.name),
        prevTime: pad(ps.getHour()) + ':' + pad(ps.getMinute()) + ':' + pad(ps.getSecond()),
        prevDate: pad(ps.getMonth()) + '月' + pad(ps.getDay()) + '日',
        dayInTerm: Math.round((birthDay - pDay) / MS_DAY) + 1,     // derived
        isJie: isJie(prevJq.name)
      };
    }
    var nextInfo = null;
    if (nextJq) {
      var ns = nextJq.solar;
      nextInfo = {
        name: jieDisplayName(nextJq.name),
        time: pad(ns.getHour()) + ':' + pad(ns.getMinute()) + ':' + pad(ns.getSecond()),
        date: pad(ns.getMonth()) + '月' + pad(ns.getDay()) + '日',
        daysToNext: Math.round((rd(ns) - birthDay) / MS_DAY)
      };
    }

    // ---- 年龄（岁/月/天）：按当前时刻与出生时刻求差
    var now = new Date();
    var birthMs = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(),
      hh === null ? 0 : hh, mi, 0).getTime();
    var diffDays = (now.getTime() - birthMs) / MS_DAY;

    // ---- 大月/小月：仅历法库输出，非连山易规则
    var monthSize = lunarMonthSize(Lunar, solar);
    var clockZhi = hh === null ? null : (exactTime ? hourZhi(clockSolar.hour) : selectedZhi);
    var shichenShiftNote = exactTime && (clockZhi && pillarsOut.timeZhi && clockZhi !== pillarsOut.timeZhi)
      ? '（输入' + clockZhi + '时，真太阳时校正为' + pillarsOut.timeZhi + '时）' : '';

    return {
      ok: true,
      solar: {
        year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(),
        hour: hh, minute: mi,
        text: solar.getYear() + '年 ' + pad(solar.getMonth()) + '月 ' + pad(solar.getDay()) + '日'
          + (hh === null ? '' : ' (' + hourRangeLabel(selectedZhi) + ')'),
        week: '周' + solar.getWeekInChinese(),
        xingzuo: solar.getXingZuo()
      },
      lunar: {
        year: lunar.getYear(), month: lunar.getMonth(), day: lunar.getDay(),
        yearChinese: lunar.getYearInChinese(),
        monthChinese: lunar.getMonthInChinese(),
        dayChinese: lunar.getDayInChinese(),
        isLeap: lunar.getMonth() < 0,
        monthSize: monthSize,
        shengxiao: lunar.getYearShengXiao(),
        text: lunar.getYearInChinese() + '年 ' + lunar.getMonthInChinese() + '月'
          + (monthSize ? '(' + monthSize + ')' : '') + ' ' + lunar.getDayInChinese()
          + (pillarsOut.timeZhi === null ? '' : ' ' + pillarsOut.timeZhi + '时' + shichenShiftNote)
      },
      pillars: {
        year: pillarsOut.year, month: pillarsOut.month,
        day: pillarsOut.day, time: pillarsOut.time
      },
      // 历法库自带旬/空亡，作为与 engine/core 的交叉校验源
      libXun: {
        year: bazi.getYearXun(), month: bazi.getMonthXun(),
        day: bazi.getDayXun(), time: hh === null ? null : bazi.getTimeXun()
      },
      // ── 真太阳时校正结果 ──────────────────────────────────────────────
      //   ok=false → 缺出生地/经度，未校正（由 GATE-003 标 LOCATION_MISSING）
      trueSolarTime: {
        ok: !!(tsResult && tsResult.ok),
        applied: !!(exactTime && tsResult && tsResult.ok),
        precision: exactTime ? 'minute' : 'shichen',
        selectedShichen: selectedZhi,
        longitude: lonInfo ? lonInfo.longitude : null,
        longitudeSource: lonInfo ? lonInfo.source : null,
        longitudeMatched: lonInfo ? lonInfo.matched : null,
        sameTimeZoneAsBase: lonInfo ? lonInfo.cst : null,
        timezoneOffset: tzInfo ? tzInfo.value : null,
        timezoneSource: tzInfo ? tzInfo.source : null,
        localMeanOffset: (tsResult && tsResult.ok) ? tsResult.localMeanOffset : null,
        offsetMinutes: (tsResult && tsResult.ok) ? tsResult.offsetMinutes : null,
        lonOffset: (tsResult && tsResult.ok) ? tsResult.lonOffset : null,
        eot: (tsResult && tsResult.ok) ? tsResult.eot : null,
        trueTime: tsTime,
        clockTime: clockSolar,
        // 校正是否改变了「日柱基准日」或「时支」
        dayChanged: !!(tsTime && (tsTime.year !== clockSolar.year
          || tsTime.month !== clockSolar.month || tsTime.day !== clockSolar.day)),
        shichenChanged: !!(exactTime && tsTime && hh !== null
          && hourZhi(tsTime.hour) !== hourZhi(clockSolar.hour)),
        note: (tsResult && tsResult.ok) ? tsResult.note : (tsResult ? tsResult.note : null)
      },
      jieqi: { prev: termInfo, next: nextInfo, tableSpan: jq.all.length },
      // 非连山易来源
      external: {
        xiu: lunar.getXiu() + lunar.getZheng() + lunar.getAnimal(),
        xiuLuck: lunar.getXiuLuck(),
        shujiu: (function () { try { var s = lunar.getShuJiu(); return s ? s.getName() : null; } catch (e) { return null; } })(),
        fu: (function () { try { var f = lunar.getFu(); return f ? f.getName() : null; } catch (e) { return null; } })()
      },
      // 岁月 = 测算时刻 − 出生时刻。
      //   ⚠ 若测算年**早于出生年**，差值为负 → 年龄无意义（人尚未出生）。
      //     原实现直接输出负值（如 2043 年生、测算 2026 → -17.3 岁），
      //     与「③ 值符大运负年龄」同性质。使用者 2026-09-11 裁决：不得出现负年龄。
      //     → 早于出生时三值置 null（并在 raw 保留标志供 UI 提示），
      //       UI 侧显示「测算年早于出生年」而非负数。
      age: (function () {
        if (diffDays < 0) return { sui: null, yue: null, tian: null, beforeBirth: true };
        return {
          sui: Math.round(diffDays / 365.25 * 10000) / 10000,
          yue: Math.round(diffDays / 30.44 * 1000) / 1000,
          tian: Math.round(diffDays * 100) / 100,
          beforeBirth: false
        };
      })(),
      // 夏令时（夏时制）校正结果：供 UI 显示「已扣除」及跨界候选提示
      dst: {
        applied: dstApplied,
        crossShichen: dstCrossShichen,
        note: dstNote,
        inputRaw: inputRaw,
        skipped: !!input.skipDst
      },
      raw: { solar: solar, lunar: lunar, bazi: bazi }
    };
  }

  /** 农历月大小：29=小 / 30=大。历法库不直接给，用相邻月首日差推算。 */
  function lunarMonthSize(Lunar, solar) {
    try {
      var l = solar.getLunar();
      var y = l.getYear(), m = l.getMonth();
      var next = Lunar.fromYmd(y, m + 1, 1);
      var cur = Lunar.fromYmd(y, m, 1);
      var d1 = cur.getSolar(), d2 = next.getSolar();
      var days = Math.round((new Date(d2.getYear(), d2.getMonth() - 1, d2.getDay())
        - new Date(d1.getYear(), d1.getMonth() - 1, d1.getDay())) / MS_DAY);
      if (days === 29) return '小';
      if (days === 30) return '大';
      return null;
    } catch (e) { return null; }
  }

  /**
   * 农历某年「第 M 个非闰月」的大小：'大'(30) / '小'(29) / null
   *
   * 与上面 `lunarMonthSize` 的区别：本函数按**农历月序**（月建：正月…腊月）索引，
   * 供 ⑨ 月历行 / 周历月页使用；上面那个按「某个具体日期所在月」索引。
   *
   * ⚠ 不能用「相邻月首日差」实现：1982 年有闰四月，四月初一 → 五月初一 相隔 58 天，
   *   会算出 58 而非 29。故改为**从该月初一逐日扫描**，直到农历月号（含闰月符号）
   *   发生变化为止 —— 闰月与跨年（腊月→次年正月）都能自然终止。
   */
  function lunarMonthSizeOf(lunarYear, lunarMonth) {
    try {
      var L = lib();
      var cur = L.Lunar.fromYmd(lunarYear, lunarMonth, 1).getSolar();
      var y0 = cur.getYear(), m0 = cur.getMonth(), d0 = cur.getDay();
      var n = 0;
      for (var k = 0; k < 31; k++) {
        var dt = new Date(y0, m0 - 1, d0 + k);
        var lu = L.Solar.fromYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()).getLunar();
        if (lu.getMonth() !== lunarMonth) break;
        n++;
      }
      if (n === 30) return '大';
      if (n === 29) return '小';
      return null;
    } catch (e) { return null; }
  }

  // ====================================================== 时间边界检测
  /**
   * 输出 7 类边界状态。任一命中即不为 FULL_CHART。
   * 参考：《字段门控与降级验收题》GATE-002 / GATE-003 / GATE-006
   */
  function detectBoundary(input, rec) {
    var flags = [];

    // GATE-002 缺时辰
    if (input.hour === undefined || input.hour === null) {
      flags.push({
        code: 'TIME_MISSING', severity: 'block',
        scope: ['pillars.time', 'yao', 'gua', 'dynamicSymbols', 'hourCodes'],
        reason: '未提供出生时辰。源文允许初学阶段从日柱辅助，但明确未教授完整推时算法。',
        canSupply: ['出生时辰（时:分）'],
        ruleId: 'LSY-TALENT-007',
        sources: ['01-书同课程-35P录音稿清洗-260831 √.md:77', '01-书同课程-35P录音稿清洗-260831 √.md:264']
      });
    }

    // GATE-006 23:00 子初换日临界
    if (input.hour === 23 || input.hour === 0) {
      flags.push({
        code: 'ZISHI_CHANGE_DAY', severity: 'review',
        scope: ['pillars.day', 'pillars.time'],
        reason: '出生时刻处于 23:00 子初换日临界。课程主料把换日规则列为「待补算法」，具体规则仅见二次文档。',
        canSupply: ['确认 23:00 后是否换日（专家裁决）'],
        ruleId: 'LSY-CAL-ZISHI',
        sources: ['01-书同课程-35P录音稿清洗-260831 √.md:1176', '01-书同课程-35P录音稿清洗-260831 √.md:9098']
      });
    }

    // 交节临界：出生日与前后节气同日在 ±1 天内
    if (rec.jieqi.prev && rec.jieqi.prev.dayInTerm <= 1) {
      flags.push({
        code: 'JIEQI_BOUNDARY', severity: 'review',
        scope: ['pillars.month', 'pillars.year'],
        reason: '出生日紧邻节气「' + rec.jieqi.prevName + '」（第 ' + rec.jieqi.prev.dayInTerm + ' 天）。节气换月以交节时刻切分，不按农历初一。',
        canSupply: ['确认采用的历法数据源与交节精度'],
        ruleId: 'LSY-CAL-JIEQI',
        sources: ['01-书同课程-35P录音稿清洗-260831 √.md:1379-1380', '01-书同课程-35P录音稿清洗-260831 √.md:4005']
      });
    }
    if (rec.jieqi.next && rec.jieqi.next.daysToNext <= 1) {
      flags.push({
        code: 'JIEQI_BOUNDARY_NEXT', severity: 'review',
        scope: ['pillars.month', 'pillars.year'],
        reason: '出生日距下一节气「' + rec.jieqi.next.name + '」仅 ' + rec.jieqi.next.daysToNext + ' 天，处于临界。',
        canSupply: ['确认采用的历法数据源与交节精度'],
        ruleId: 'LSY-CAL-JIEQI',
        sources: ['01-书同课程-35P录音稿清洗-260831 √.md:1379-1380']
      });
    }

    // GATE-003 缺地点 / 地点无法解析 / 海外缺当地时区 → 真太阳时未校正
    //   ⚠ 自真太阳时接入后（truesolar.js + data/city-longitude.js），此门的语义
    //     收紧为：**只要有可解析的经度即完成校正**。填了城市名但城市表零命中
    //     （如「某某村」）同样落入本门，不得静默按 120°E 处理。
    var tsRec = rec.trueSolarTime || {};
    if (!tsRec.ok) {
      flags.push({
        code: 'LOCATION_MISSING', severity: 'warn',
        scope: ['calendarData.trueSolarTime'],
        reason: (!input.place && !input.longitude)
          ? '未提供出生地点/经度，真太阳时未校正（日柱/时柱按行政钟表时刻判定）。'
          : (tsRec.longitude !== null && tsRec.longitude !== undefined
            && (tsRec.timezoneOffset === null || tsRec.timezoneOffset === undefined)
            ? '出生地已解析为经度，但缺少当地 UTC 偏移；不得按北京时间代替，真太阳时未校正。'
            : '出生地点「' + (input.place || input.longitude) + '」无法解析为经度，'
              + '真太阳时未校正（日柱/时柱按行政钟表时刻判定）。'),
        canSupply: ['出生城市名（如「杭州」）或经度数值（如 120.15）', '当地 UTC 偏移（如纽约冬季 −5、夏季 −4）'],
        ruleId: 'LSY-CAL-TRUESOLAR',
        sources: ['S3-连山易天文历法排盘算法与时间边界规则.md:12-14', 'S3-连山易天文历法排盘算法与时间边界规则.md:119']
      });
    }
    // 当地时区缺失提示：这是输入缺口，不是“跨时区算法待裁决”。
    if (tsRec.longitude !== null && tsRec.longitude !== undefined
      && (tsRec.timezoneOffset === null || tsRec.timezoneOffset === undefined)) {
      flags.push({
        code: 'TRUESOLAR_TZ_INFERENCE', severity: 'review',
        scope: ['calendarData.trueSolarTime'],
        reason: '已按知识库与专家裁决确定：海外出生时间必须按当地时区解释；当前缺当地 UTC 偏移，'
          + '不得静默按北京时间或 UTC+8 计算。',
        canSupply: ['当地 UTC 偏移（按输入钟表时间，含当时夏令时）'],
        ruleId: 'LSY-CAL-TRUESOLAR',
        sources: ['GE萃取2-260908 X.md:4561-4571', 'GE萃取2-260908 X.md:4630-4648']
      });
    }
    // 真太阳时校正后日柱/时柱发生位移 → 临界提示（属正常物理结果，但须让使用者看见）
    if (tsRec.ok && (tsRec.dayChanged || tsRec.shichenChanged)) {
      var shiftBits = [];
      if (tsRec.shichenChanged) shiftBits.push('时辰');
      if (tsRec.dayChanged) shiftBits.push('日柱基准日');
      flags.push({
        code: 'TRUESOLAR_SHIFT', severity: 'info',
        scope: ['pillars.day', 'pillars.time'],
        reason: '真太阳时校正 ' + (tsRec.offsetMinutes >= 0 ? '+' : '−')
          + Math.abs(Math.round(tsRec.offsetMinutes * 10) / 10) + ' 分钟后，'
          + shiftBits.join('与') + '发生位移（'
          + (tsRec.clockTime ? pad(tsRec.clockTime.hour) + ':' + pad(tsRec.clockTime.minute) : '—')
          + ' → ' + (tsRec.trueTime ? pad(tsRec.trueTime.hour) + ':' + pad(tsRec.trueTime.minute) : '—')
          + '）。此为语料 :4 所称「物理交界红线」的正常结果。',
        canSupply: ['确认出生经度精度'],
        ruleId: 'LSY-CAL-TRUESOLAR',
        sources: ['S3-连山易天文历法排盘算法与时间边界规则.md:4', 'S3-连山易天文历法排盘算法与时间边界规则.md:119']
      });
    }

    // 节气秒级差异提示（历法源差异）
    flags.push({
      code: 'JIEQI_SECOND_DRIFT', severity: 'info',
      scope: ['calendarData.solarTerm'],
      reason: '内置历法库的节气时刻与参考图存在约 14-15 秒差异（交节秒级裁决属未闭合项）。',
      canSupply: ['权威历法数据源'],
      ruleId: 'LSY-CAL-JIEQI',
      sources: ['冲突与待确认登记.md:5-14']
    });

    // 大月/小月与闰月口径
    if (rec.lunar.isLeap) {
      flags.push({
        code: 'LEAP_MONTH', severity: 'warn',
        scope: ['calendarData.lunarMonth'],
        reason: '出生月为闰月，源文要求另补历法规范（闰月/时区口径未定义）。',
        canSupply: ['闰月处理口径'],
        ruleId: 'LSY-CAL-LEAP',
        sources: ['03-老韩天时-63P书籍清洗-260903 √.md:3287-3294']
      });
    }

    // 汇总状态
    var status = 'FULL_CHART';
    var has = function (c) { return flags.some(function (f) { return f.code === c; }); };
    if (has('TIME_MISSING')) status = 'PARTIAL_THREE_PILLAR';
    else if (has('ZISHI_CHANGE_DAY') || has('JIEQI_BOUNDARY') || has('JIEQI_BOUNDARY_NEXT')
      || has('TRUESOLAR_TZ_INFERENCE')) status = 'TIME_BOUNDARY_REVIEW';
    else if (has('LOCATION_MISSING')) status = 'LOCATION_CORRECTION_PENDING';

    return {
      status: status,
      flags: flags,
      blockers: flags.filter(function (f) { return f.severity === 'block'; }),
      reviews: flags.filter(function (f) { return f.severity === 'review'; }),
      warnings: flags.filter(function (f) { return f.severity === 'warn'; })
    };
  }

  return {
    rectify: rectify,
    detectBoundary: detectBoundary,
    jieQiAround: jieQiAround,
    hourZhi: hourZhi,
    hourRangeLabel: hourRangeLabel,
    validateDateInput: validateDateInput,
    isJie: isJie,
    resolveLongitude: resolveLongitude,
    lunarMonthSizeOf: lunarMonthSizeOf,
    lib: lib
  };
});
