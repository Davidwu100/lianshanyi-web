/*!
 * 连山易 · 三元九运（sanyuan-jiuyun.js）
 * ---------------------------------------------------------------------------
 * 依据（**主料** 03-老韩天时-63P书籍清洗-260903 √.md:691-738《三元九运应用表》）
 *   697-716 完整应用表（三元 / 星 / 九运 / 年限 / 九宫运 / 九宫 / 六甲旬 / 天赐天佐）：
 *     | 上元 | 金星 | 一运 | 1864-1873·1874-1883 | 坎一白 |
 *     | 上元 | 金星 | 二运 | 1884-1893·1894-1903 | 坤二黑 |
 *     | 上元 | 金星 | 三运 | 1904-1913·1914-1923 | 震三碧 |
 *     | 中元 | 木星 | 四运 | 1924-1933·1934-1943 | 巽四绿 |
 *     | 中元 | 木星 | 五运 | 1944-1953·1954-1963 | 中五黄 |
 *     | 中元 | 木星 | 六运 | 1964-1973·1974-1983 | 乾六白 |
 *     | 下元 | 土星 | 七运 | 1984-1993·1994-2003 | 兑七赤 |
 *     | 下元 | 土星 | 八运 | 2004-2013·2014-2023 | 艮八白 |
 *     | 下元 | 土星 | 九运 | 2024-2033·2034-2043 | 离九紫 |
 *   → 一个三元 = **1864–2043**（180 年）；每运 20 年；每元 60 年 = 3 运。
 *   → 720-724 结构表：上元金星(一/二/三运) · 中元木星(四/五/六运) · 下元土星(七/八/九运)。
 *   → 726-738 九运—九宫映射（坎一白…离九紫）。
 *   同表复见于 03:1034（简版）。
 *
 * 语料 GE萃取2（交叉一致，非唯一依据）
 *   3636 三元甲子大运 (180年) → 3638 三元九运 (20年小运) → 3640 六甲流旬 (10年大运)
 *   3669 一元：六十年为一个"元"；3670 三元 = 上元+中元+下元 = 一百八十年
 *   3680 一元（六十年）分为三小运，一小运二十年
 *   4744 二十年元运（一至九运）严格按照后天八卦顺序**永恒顺推**
 *   1478 实例：「下元七赤金运（1984-2003），前十年由甲子旬统辖」→ 与 03 表一致
 *
 * ⚠ 已按使用者裁决 2026-09-12 **取消「大元 / 正元」**：
 *   语料 3537-3549 / 3663 / 3705 / 1720 / 3756 共 8 处一致声明二者
 *   「在连山易讲义与书稿中不存在」（无定义、无起法，属玄空风水等外部学派）。
 *   原 `zhengYuan` 为 540 年大元内 9 个 **60 年**格，正是该伪概念的结构
 *   → 本模块以正宗「三元九运」替代。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.sanyuan = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 三元：一~三运=上元，四~六运=中元，七~九运=下元（主料 03:720-724）
  var YUAN_LABEL = ['上', '上', '上', '中', '中', '中', '下', '下', '下'];
  // 三元星（主料 03:720-724：上元金星 / 中元木星 / 下元土星）
  var YUAN_STAR = ['金星', '金星', '金星', '木星', '木星', '木星', '土星', '土星', '土星'];
  // 九运名（后天八卦序）
  var YUN_NAME = ['坎一运', '坤二运', '震三运', '巽四运', '中五运', '乾六运', '兑七运', '艮八运', '离九运'];
  // 九星（贪狼…右弼，按序对应一~九运）
  var YUN_STAR = ['贪狼', '巨门', '禄存', '文曲', '廉贞', '武曲', '破军', '左辅', '右弼'];
  // 卦与色（主料 03:726-738 九宫运）
  var YUN_GUA = ['坎一白', '坤二黑', '震三碧', '巽四绿', '中五黄', '乾六白', '兑七赤', '艮八白', '离九紫'];
  // 九宫（主料 03:726-738，如 一运→戊子 / 七运→丁酉）
  var YUN_GONG = ['戊子', '癸未', '庚寅', '辛巳', '戊己', '壬戌', '丁酉', '丙寅', '己巳'];

  var SPAN = 20;                 // 一运 20 年（主料 03:711-716 年限每格 10 年 ×2）
  var YUAN_SPAN = SPAN * 3;      // 一元 = 60 年 = 3 运
  var SAN_YUAN_SPAN = SPAN * 9;  // 一个三元 = 180 年 = 9 运（语料 3670）
  /**
   * 九运起算锚点：1984 起 **兑七运**。
   *   **主料 03:711**：「| 下元 | 土星 | 七运 | 1984-1993 | 兑七赤 |」→ 锚点有主料直证。
   *   （此前仅由语料 1478 实例外推、标 derived；**现已升级为 confirmed**。）
   *   ⇒ 一运（三元之始，坎一白）起于 1864 = 1984 − 60 − 60。
   */
  var ANCHOR_YEAR = 1984;
  var ANCHOR_YUN = 7;            // 兑七运
  var SAN_YUAN_ANCHOR = 1864;    // 上元一运（坎一白）起点，主料 03:699

  /** 某公历年所属的九运序号（1..9） */
  function yunIndexOf(year) {
    var steps = Math.floor((year - ANCHOR_YEAR) / SPAN);
    return ((ANCHOR_YUN - 1 + steps) % 9 + 9) % 9 + 1;
  }
  /** 某公历年所属运的起始年 */
  function yunStart(year) {
    var i = yunIndexOf(year);
    // 从锚点回推该运起点
    var delta = ((i - ANCHOR_YUN) % 9 + 9) % 9;
    var guess = ANCHOR_YEAR + delta * SPAN;
    while (guess > year) guess -= SAN_YUAN_SPAN;
    while (guess + SPAN - 1 < year) guess += SAN_YUAN_SPAN;
    return guess;
  }
  /** 三元标签（上/中/下） */
  function yuanLabelOfYun(yunIndex) { return YUAN_LABEL[yunIndex - 1]; }
  /** 三元星（金星/木星/土星） */
  function yuanStarOfYun(yunIndex) { return YUAN_STAR[yunIndex - 1]; }
  /** 某年所属三元（1864 + 180k）的起始年 */
  function sanYuanStart(year) {
    var d = year - SAN_YUAN_ANCHOR;
    return SAN_YUAN_ANCHOR + Math.floor(d / SAN_YUAN_SPAN) * SAN_YUAN_SPAN;
  }

  function cellOf(year) {
    var i = yunIndexOf(year);
    return {
      startYear: year,
      yunIndex: i,
      yuan: yuanLabelOfYun(i),
      yuanStar: yuanStarOfYun(i),
      name: YUN_NAME[i - 1],
      star: YUN_STAR[i - 1],
      gua: YUN_GUA[i - 1],
      gong: YUN_GONG[i - 1]
    };
  }

  /**
   * 一个三元（180 年 = 9 运 × 20 年）窗口，**以「当前元（60 年 = 3 运）」居中**：
   *
   *   [前一元 · 3 运] [当前元 · 3 运] [后一元 · 3 运]
   *
   * 使用者 2026-09-12 裁决：「⑦ 三元 年份改为 1924-2084」。
   *   2026 属**下元**（1984–2043）→ 窗口 = 中元(1924-1983) + 下元(1984-2043) + 上元(2044-2103)
   *   → 九个运的起始年 = 1924 1944 1964 1984 2004 2024 2044 2064 2084 ✓
   *
   * ⚠ 与「当前运居中」的旧实现（`yunStart − 4×20`）不同：旧法把**当前运**居中，
   *   本法则把**当前元（3 运）**居中 —— 后者才使窗口恰好落在一个完整三元上，
   *   且窗口内三组「上/中/下元」各占连续的 3 格（旧法会切碎元的分组）。
   *   例：1982 属中元 → 窗口 = 上元(1864-1923) + 中元(1924-1983) + 下元(1984-2043) = 1864…2024。
   */
  function window9(targetYear) {
    var yi = yunIndexOf(targetYear);
    // 当前运在「元」内的序号 0/1/2
    var offInYuan = (yi - 1) % 3;
    // 回溯到「当前元的第一运」，再向前推一元（60 年）
    var start = yunStart(targetYear) - offInYuan * SPAN - YUAN_SPAN;
    var out = [];
    for (var k = 0; k < 9; k++) {
      var y = start + k * SPAN;
      var c = cellOf(y);
      c.isCurrent = (targetYear >= y && targetYear <= y + SPAN - 1);
      // 该格是否为其所在元的首运（供界面分组显示）
      c.isYuanHead = ((c.yunIndex - 1) % 3) === 0;
      out.push(c);
    }
    return out;
  }

  return {
    SPAN: SPAN,
    YUAN_SPAN: YUAN_SPAN,
    SAN_YUAN_SPAN: SAN_YUAN_SPAN,
    ANCHOR_YEAR: ANCHOR_YEAR,
    ANCHOR_YUN: ANCHOR_YUN,
    SAN_YUAN_ANCHOR: SAN_YUAN_ANCHOR,
    YUAN_LABEL: YUAN_LABEL,
    YUAN_STAR: YUAN_STAR,
    YUN_NAME: YUN_NAME,
    YUN_STAR: YUN_STAR,
    YUN_GUA: YUN_GUA,
    YUN_GONG: YUN_GONG,
    yunIndexOf: yunIndexOf,
    yunStart: yunStart,
    yuanLabelOfYun: yuanLabelOfYun,
    yuanStarOfYun: yuanStarOfYun,
    sanYuanStart: sanYuanStart,
    cellOf: cellOf,
    window9: window9,
    _sources: [
      '03-老韩天时-63P书籍清洗-260903 √.md:691-716（★主料《三元九运应用表》完整年限：1864 一运 … 2024 九运）',
      '03-老韩天时-63P书籍清洗-260903 √.md:720-724（三元—星—九运结构：上元金星/中元木星/下元土星）',
      '03-老韩天时-63P书籍清洗-260903 √.md:726-738（九运—九宫运—九宫映射：坎一白…离九紫）',
      '03-老韩天时-63P书籍清洗-260903 √.md:1034（同表简版）',
      'GE萃取2-260908 X.md:3636（三元甲子大运 180年）',
      'GE萃取2-260908 X.md:3638（三元九运 20年小运）',
      'GE萃取2-260908 X.md:3640（六甲流旬 10年大运）',
      'GE萃取2-260908 X.md:3669-3670（一元60年 / 三元180年）',
      'GE萃取2-260908 X.md:3680（一元分三小运，一小运20年）',
      'GE萃取2-260908 X.md:4744（九运按后天八卦顺序永恒顺推）',
      'GE萃取2-260908 X.md:1478（1984-2003 兑七 / 2004-2023 艮八 / 2024-2043 离九）'
    ],
    _status: 'confirmed',
    _note: '锚点 1984=兑七运由**主料 03:711** 直证（「七运 | 1984-1993 | 兑七赤」），'
      + '不再是由实例外推的 derived_candidate。三元归属（一~三=上元、四~六=中元、七~九=下元）'
      + '与三元星（金星/木星/土星）均有主料 03:720-724。'
      + '窗口取法按使用者 2026-09-12 裁决：**以当前元居中**（前一元 + 当前元 + 后一元 = 一个三元）。'
  };
});
