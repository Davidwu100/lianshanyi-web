/*!
 * 连山易 · 日格标记（calendar-markers.js）
 * ---------------------------------------------------------------------------
 * 用途：给周历日格加节日/纪念日/法定假日的角标。
 *
 * 标记体系（使用者确证 2026-09-11 + 官方文件交叉验证）：
 *
 *   ① 公历固定日（每年公历同位，代码常量即可，**无需年度维护**）
 *      抗 = 中国人民抗日战争胜利纪念日（09-03）
 *      師 = 教师节（09-10）
 *      耻 = 九一八事变纪念日（09-18）
 *      和 = 国际和平日（09-21）
 *   ② 农历节日（由历法推算，**无需年度维护**）
 *      中 = 中秋节（农历八月十五）
 *   ③ 法定假日 / 调休（**需年度数据**，依国务院年度通知）
 *      休 = 放假    工 = 调休上班
 *      2026 年数据来源：国务院办公厅关于2026年部分节假日安排的通知
 *        国办发明电〔2025〕7号
 *        https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
 *        「中秋节：9月25日（周五）至27日（周日）放假，共3天」
 *        「国庆节：10月1日（周四）至7日（周三）放假调休……9月20日（周日）上班」
 *
 * ⚠ 参考图页头定标核对：农历「七月廿二」= 公历 2026-09-03（引擎一致）。
 *   → 「中」标在**当日**，非前一日。
 *
 * ⚠ 法定假日数据**只覆盖 2026 年**。其余年份无数据时该行留空，
 *   不得推测（`RULE_PENDING` 语义）。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.data = root.LSY.data || {};
    root.LSY.data.calendarMarkers = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── ① 公历固定日：月日 → 标记 + 全称
  var FIXED = {
    '09-03': { mark: '抗', name: '中国人民抗日战争胜利纪念日', kind: 'fixed' },
    '09-10': { mark: '師', name: '教师节', kind: 'fixed' },
    '09-18': { mark: '耻', name: '九一八事变纪念日', kind: 'fixed' },
    '09-21': { mark: '和', name: '国际和平日', kind: 'fixed' }
  };

  // ── ② 农历节日：农历月/日 → 标记 + 全称（可扩展）
  var LUNAR = [
    { month: 8, day: 15, mark: '中', name: '中秋节', kind: 'lunar' }
  ];

  // ── ③ 法定假日：**年度数据**（仅 2026 有）
  //   结构：{ 年份: { 'MM-DD': '休'|'工' } }
  var STATUTORY = {
    2026: {
      // 中秋节假期（9/25–9/27）
      '09-25': '休', '09-26': '休', '09-27': '休',
      // 国庆调休上班
      '09-20': '工',
      // 国庆假期（10/1–10/7）
      '10-01': '休', '10-02': '休', '10-03': '休', '10-04': '休',
      '10-05': '休', '10-06': '休', '10-07': '休',
      // 国庆后调休上班
      '10-10': '工',
      // 元旦（1/1–1/3 放假，1/4 上班）
      '01-01': '休', '01-02': '休', '01-03': '休', '01-04': '工',
      // 春节（2/15–2/23 放假，2/14、2/28 上班）
      '02-15': '休', '02-16': '休', '02-17': '休', '02-18': '休', '02-19': '休',
      '02-20': '休', '02-21': '休', '02-22': '休', '02-23': '休',
      '02-14': '工', '02-28': '工',
      // 清明（4/4–4/6）
      '04-04': '休', '04-05': '休', '04-06': '休',
      // 劳动节（5/1–5/5 放假，5/9 上班）
      '05-01': '休', '05-02': '休', '05-03': '休', '05-04': '休', '05-05': '休',
      '05-09': '工',
      // 端午（6/19–6/21）
      '06-19': '休', '06-20': '休', '06-21': '休'
    }
  };

  var KIND_COLOR = { fixed: 'purple', lunar: 'green', statutory: 'blue' };

  /**
   * 取某日的标记（可多个）。
   * @param {number} year  公历年
   * @param {number} month 公历月
   * @param {number} day   公历日
   * @param {object} lunarInfo { month, day } 该日农历月/日（1-based，闰月为负）
   * @returns {Array} [{ mark, name, kind, color }]
   */
  function marksOf(year, month, day, lunarInfo) {
    var out = [];
    var md = pad(month) + '-' + pad(day);

    var f = FIXED[md];
    if (f) out.push({ mark: f.mark, name: f.name, kind: 'fixed', color: KIND_COLOR.fixed });

    if (lunarInfo && lunarInfo.month > 0) {
      LUNAR.forEach(function (L) {
        if (L.month === lunarInfo.month && L.day === lunarInfo.day) {
          out.push({ mark: L.mark, name: L.name, kind: 'lunar', color: KIND_COLOR.lunar });
        }
      });
    }

    var stat = STATUTORY[year] && STATUTORY[year][md];
    if (stat) {
      out.push({
        mark: stat,
        name: stat === '休' ? '法定放假' : '调休上班',
        kind: 'statutory', color: KIND_COLOR.statutory
      });
    }
    return out;
  }

  function pad(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

  /** 该年是否有法定假日数据 */
  function hasStatutory(year) { return !!STATUTORY[year]; }

  return {
    FIXED: FIXED,
    LUNAR: LUNAR,
    STATUTORY: STATUTORY,
    KIND_COLOR: KIND_COLOR,
    marksOf: marksOf,
    hasStatutory: hasStatutory,
    _status: 'confirmed',
    _note: '标记体系三类：公历固定日(代码常量) / 农历节日(历法推算) / 法定假日(年度数据)。'
      + '语义经使用者确证，法定假日经国办发明电〔2025〕7号交叉验证。'
      + '⚠ 法定假日仅覆盖 2026 年；其余年份留空不推测。',
    _sources: [
      '使用者确证 2026-09-11（抗/師/耻/和/中/休/工 七类语义）',
      '国务院办公厅关于2026年部分节假日安排的通知（国办发明电〔2025〕7号）',
      '参考图页头定标：农历七月廿二 = 2026-09-03'
    ]
  };
});
