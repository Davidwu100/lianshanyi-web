/*!
 * 连山易 · 基础算法核心（纯函数，零依赖，Node 与浏览器同构）
 * ---------------------------------------------------------------------------
 * 消费 dict-core.js 的数据，输出"带字段元数据"的取值对象。
 *
 * 三段式：base（地支/干支）→ rolling（滚动/旬/符）→ yao（爻位）
 * 所有返回值统一为 { value, field_id, field_status, rule_id, source_refs,
 *                    depends_on, exception_policy, interpretation_type,
 *                    safety_boundary }
 * 无出处的字段 field_status 一律 'RULE_PENDING'，并给出缺失原因。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dict-core.js'));
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.core = factory(root.LSY.data.core);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var SAFETY = '仅作传统标注，不构成吉凶结论';

  function fld(value, fieldId, status, ruleId, sources, dependsOn, note, iType) {
    var m = D.meta[ruleId] || {};
    return {
      value: value,
      field_id: fieldId,
      field_status: status || m.status || 'RULE_PENDING',
      rule_id: ruleId,
      source_refs: sources || m.sources || [],
      depends_on: dependsOn || [],
      exception_policy: note || m.note || '',
      interpretation_type: iType || 'computed',
      safety_boundary: SAFETY,
      conflict_id: m.conflictId || null
    };
  }
  function pending(fieldId, reason, ruleId) {
    return fld(null, fieldId, 'RULE_PENDING', ruleId || null, [], [], reason, 'computed');
  }

  // ------------------------------------------------------------------ 索引
  var zi = function (z) { return D.ZHI.indexOf(z); };
  var gi = function (g) { return D.GAN.indexOf(g); };
  var mod12 = function (n) { return ((n % 12) + 12) % 12; };
  var mod10 = function (n) { return ((n % 10) + 10) % 10; };

  function split(gz) { return { gan: gz.charAt(0), zhi: gz.charAt(1) }; }
  function join(g, z) { return g + z; }

  // ------------------------------------------------------------- 干支运算
  /** 甲子序（0..59）。非法组合返回 -1。 */
  function jiaziIndex(gz) {
    return D.JIAZI.indexOf(gz);
  }
  /** 由 甲子序 造干支 */
  function jiaziFromIndex(i) {
    var k = ((i % 60) + 60) % 60;
    return D.JIAZI[k];
  }

  /** 旬头：甲 + 支[(zhiIdx - ganIdx + 12) % 12] */
  function xunHead(gz) {
    var g = gi(gz.charAt(0)), z = zi(gz.charAt(1));
    if (g < 0 || z < 0) return null;
    return '甲' + D.ZHI[mod12(z - g)];
  }

  /** 旬内序号（0..9）：甲=0 … 癸=9 */
  function xunOffset(gz) {
    var g = gi(gz.charAt(0));
    return g < 0 ? -1 : g;
  }

  // ---------------------------------------------------------------- 爻位
  /** 爻位 1..6。查表，不用公式（分布不均，无均匀生成器）。 */
  function yaoWei(gz) {
    var v = D.YAO_TABLE[gz];
    return (v === undefined) ? null : v;
  }

  // ------------------------------------------------------------- 空亡 / 孤
  function kongWang(gz) {
    var h = xunHead(gz);
    if (!h || !D.XUN_BY_HEAD[h]) return null;
    return D.XUN_BY_HEAD[h].kong.slice();
  }
  function gu(gz) {
    var h = xunHead(gz);
    if (!h || !D.XUN_BY_HEAD[h]) return null;
    return D.XUN_BY_HEAD[h].gu.slice();
  }

  // ---------------------------------------------------------------- 十二符
  /**
   * 十二值符。anchorBranch = 出生旬锚点的地支（默认年柱旬，见 meta.xunAnchor）。
   * 纯地支索引：十二符排符只看地支，不看天干（01-书同课程:10165）。
   */
  function talisman(targetZhi, anchorBranch) {
    var t = zi(targetZhi), a = zi(anchorBranch);
    if (t < 0 || a < 0) return null;
    return D.STARS[mod12(t - a)];
  }

  /**
   * 符码 = <爻位><符简称>。两个独立轴，互不决定。
   * 48/48 已在参考图 年/月/日/时 四张表上验证。
   */
  function fuCode(gz, anchorBranch) {
    var y = yaoWei(gz);
    var s = talisman(gz.charAt(1), anchorBranch);
    if (y === null || s === null) return null;
    return String(y) + D.STAR_ABBR[s];
  }

  // ------------------------------------------------------------ 五行生克【已移除】
  //   ⚠ 使用者裁决 2026-09-12：**连山易没有五行相生、相克的理论，不得混淆。**
  //   语料明确支持该裁决：
  //     · GE萃取2:1504 / 6066「连山易**不看**繁复的五行相克，专重飞符之间的**冲合作用**」
  //     · GE萃取2:1392「本算法**不看任何后世五行相克**，纯粹看星体轨道干涉」
  //     · GE萃取2:5830「涉及**五行克泄 (ShengKe)、五行相克判定**的所有干扰代码和
  //        子平八字派系函数已被**彻底物理清除**」
  //   → 原 wuxingRelation()（含 SHENG/KE 表）经查**全库无任何调用**（死代码），
  //     其概念亦不属于连山易体系，故整段删除，不保留。

  // ----------------------------------------------------------- 公历年代码
  /** 年干支：1984 = 甲子（主料锚点 01-书同课程:9846/9969/9985） */
  function yearGZ(year) {
    return jiaziFromIndex(year - 1984);
  }
  /** 年柱干支对应的六甲旬（10 年块） */
  function yearXun(year) {
    return xunHead(yearGZ(year));
  }
  /** 年柱所属大运旬块（10 年）的起始年 */
  function xunBlockStart(year) {
    var gz = yearGZ(year);
    var off = xunOffset(gz);
    return year - off;   // 甲 所在年即块首
  }

  // ------------------------------------------------------- 月份 / 时辰干支
  var WUHU = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' };
  var WUSHU = { 甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬' };

  /** 五虎遁：月柱干支。monthIdx0: 0 = 正月(寅) */
  function monthGZByIndex(yearGan, monthIdx0) {
    var start = WUHU[yearGan];
    if (!start) return null;
    return join(D.GAN[mod10(gi(start) + monthIdx0)], D.ZHI[mod12(zi('寅') + monthIdx0)]);
  }
  /** 五鼠遁：时柱干支。hourZhi 为时支 */
  function hourGZ(dayGan, hourZhi) {
    var start = WUSHU[dayGan];
    if (!start) return null;
    return join(D.GAN[mod10(gi(start) + zi(hourZhi))], hourZhi);
  }
  /** 十二时辰支（子 23-01 起） */
  function hourZhiByHour(hh) {
    if (hh === 23 || hh === 0) return '子';
    return D.ZHI[Math.floor((hh + 1) / 2) % 12];
  }

  // ------------------------------------------------- 三元九运 / 旬
  //   一运 = 20 年 = 2 旬；一旬 = 10 年
  // 三元：上元 1864-1923 / 中元 1924-1983 / 下元 1984-2043（主料 03:699-716）
  //   上/中/下 = floor((y - 1864) / 60) mod 3 → 0=上 1=中 2=下
  // 高亮使用测算年
  var SANYUAN_ANCHOR = 1864;
  var SANYUAN_SPAN = 60;
  var YUN_SPAN = 20;
  var XUN_SPAN = 10;

  var YUN_NAMES = ['坎一白水运', '坤二黑土运', '震三碧木运', '巽四绿木运', '中五黄土运', '乾六白金运', '兑七赤金运', '艮八白土运', '离九紫火运'];
  /** 三元：0=上 1=中 2=下 */
  function sanYuanIndex(year) {
    return ((Math.floor((year - SANYUAN_ANCHOR) / SANYUAN_SPAN) % 3) + 3) % 3;
  }
  /** 20 年元运序号（1..9，九宫）
   *  三元九运：1864 = 上元一运起始；每 20 年递进一运，9 运循环。
   *  主料 03:711-716：七运 1984-2003 兑七赤、八运 2004-2023 艮八白、九运 2024-2043 离九紫
   *  → 2024 得 9、2004 得 8、1984 得 7，与参考图 3 个运格逐字一致。
   */
  function yunIndex(year) {
    return ((Math.floor((year - SANYUAN_ANCHOR) / YUN_SPAN) % 9) + 9) % 9 + 1;
  }
  /** 元运起始年（该 20 年块的起点） */
  function yunStart(year) {
    var k = Math.floor((year - SANYUAN_ANCHOR) / YUN_SPAN);
    return SANYUAN_ANCHOR + k * YUN_SPAN;
  }
  /** 显示用 2 位年 */
  function yy2(year) {
    var s = String(Math.abs(year) % 100);
    if (year < 0) return 'BC' + s;   // 公元前按历史纪年约定标注
    return (s.length < 2 ? '0' + s : s);
  }
  /**
   * 显示用「世纪/年」形式（**已弃用于界面**）
   *   1984 → '19/84'，2004 → '20/04'，2024 → '20/24'
   *
   * ⚠ 使用者 2026-09-12：「优化年份格式，如：19/44 改为 1944」
   *   → 界面**一律显示完整四位年份**（见 fullYear()），不再用本形式。
   *   yyPair 保留仅供**历史对拍**（reference.js 的参考图快照即 19/84 形式），
   *   便于与源图逐格比对；**不得再用于界面渲染**。
   */
  function yyPair(year) {
    if (year < 0) return 'BC' + String(Math.abs(year));
    var s = String(year);
    while (s.length < 4) s = '0' + s;
    return s.slice(0, 2) + '/' + s.slice(2);
  }

  /**
   * 显示用**完整四位年份**（界面统一口径）
   *   1984 → '1984'，2004 → '2004'，44 → '0044'
   *   使用者 2026-09-12：「优化年份格式，如：19/44 改为 1944」
   *   负数（公元前）保留 BC 前缀。
   */
  function fullYear(year) {
    if (year === null || year === undefined) return '—';
    if (year < 0) return 'BC' + String(Math.abs(year));
    var s = String(year);
    while (s.length < 4) s = '0' + s;
    return s;
  }

  // 年月日时四柱 → 一次算全
  function xunOfYear(year) { return yearXun(year); }

  // ------------------------------------------------------------------ 导出
  return {
    // 基础
    zi: zi, gi: gi, mod10: mod10, mod12: mod12,
    split: split, join: join,
    jiaziIndex: jiaziIndex, jiaziFromIndex: jiaziFromIndex,
    // 旬 / 空亡 / 孤
    xunHead: xunHead, xunOffset: xunOffset,
    kongWang: kongWang, gu: gu,
    // 爻位 / 十二符
    yaoWei: yaoWei, talisman: talisman, fuCode: fuCode,
    // 五行
    // 干支 / 年月时
    yearGZ: yearGZ, yearXun: yearXun, xunBlockStart: xunBlockStart,
    monthGZByIndex: monthGZByIndex, hourGZ: hourGZ, hourZhiByHour: hourZhiByHour,
    // 时间层
    sanYuanIndex: sanYuanIndex, yunIndex: yunIndex, yunStart: yunStart, yy2: yy2, yyPair: yyPair, fullYear: fullYear,
    YUN_NAMES: YUN_NAMES,
    ANCHORS: { sanyuan: SANYUAN_ANCHOR },
    SPANS: { yun: YUN_SPAN, xun: XUN_SPAN },
    // 元数据包装
    fld: fld, pending: pending,
    dict: D
  };
});
