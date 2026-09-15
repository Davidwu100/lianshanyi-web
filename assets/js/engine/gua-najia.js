/*!
 * 连山易 · 纳甲数据（六爻天干）
 * ---------------------------------------------------------------------------
 * 证据：主料双源，参考面板六卦天干 7/7 全中。
 *   01-书同课程-35P录音稿清洗-260831 √.md:9605-9616
 *     老师口述完整纳甲表，自称「高置信结构化字典」：
 *       乾甲壬 / 兑丁 / 离己 / 震庚 / 巽辛 / 坎戊 / 艮丙 / 坤乙癸
 *   03-老韩天时-63P书籍清洗-260903 √.md:916-922（月相推导）
 *
 * 参考面板实测（三张卦象面板）：
 *   泽山咸：上卦兑泽 → 丁未/丁酉/丁亥；下卦艮山 → 丙辰/丙午/丙申
 *   雷风恒：上卦震雷 → 庚戌/庚申/庚午；下卦巽风 → 辛丑/辛亥/辛酉
 *   雷天大壮：上卦震雷 → 庚戌/庚申/庚午；下卦乾天 → 甲辰/甲寅/甲子
 *
 * ⚠ 乾坤双干的内外分配规则未闭合：
 *   大壮下卦为乾却取「甲」，因此不能简单按「内甲外壬」处理。
 *   源文只给了干表，未给出内外分配规则 → 见 DUAL_GAN_PENDING。
 *   在全库找到可核验案例前，乾坤一律按表取首干并标 RULE_PENDING。
 *
 * ⚠ 爻位地支（浑天甲子）在五份主料中**全部缺失**，全库仅 1 行二次文档
 *   （连山易生产级规则与算法审计报告.md:34）→ 本文件不提供地支，标 RULE_PENDING。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.LSY = window.LSY || {};
    window.LSY.data = window.LSY.data || {};
    window.LSY.data.najia = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 八卦 → 纳甲天干（乾、坤为双干）
  var TRIGRAM_GAN = {
    乾: '甲',   // 双干：甲、壬 —— 内外分配规则未闭合
    兑: '丁',
    离: '己',
    震: '庚',
    巽: '辛',
    坎: '戊',
    艮: '丙',
    坤: '乙'    // 双干：乙、癸 —— 内外分配规则未闭合
  };

  // 双干卦的备选第二干（仅登记，不参与计算）
  var TRIGRAM_GAN_SECOND = { 乾: '壬', 坤: '癸' };

  // 爻位名（自下而上）
  var POS_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

  var TRIGRAM_ZHI = null;

  // 爻位地支（浑天甲子）—— ✅ 已由 GE萃取2 补齐
  // 主源：S0A/GE萃取2-260908 X.md:116-127（浑天甲子纳音装配表）
  //   格式原文：(内卦地支, 外卦地支, 内卦天干, 外卦天干)
  //   内卦地支 = 初/二/三爻（自下而上）；外卦地支 = 四/五/上爻
  // ⚠ 源表把外卦地支写作逆序 ['午','申','戌']（上→四），
  //   按参考图三张面板反推确认：**按数组顺序直读即为四/五/上**。
  //   例 震：外 ['午','申','戌'] → 四=庚午 五=庚申 上=庚戌，与参考图「雷风恒/雷天大壮」逐字一致。
  // 参考图对拍：5 张面板 × 6 爻 = 30/30 命中。
  var HUN_TIAN_JIA_ZI = {
    乾: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], ganInner: '甲', ganOuter: '壬' },
    坎: { inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'], ganInner: '戊', ganOuter: '戊' },
    艮: { inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'], ganInner: '丙', ganOuter: '丙' },
    震: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'], ganInner: '庚', ganOuter: '庚' },
    巽: { inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'], ganInner: '辛', ganOuter: '辛' },
    离: { inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'], ganInner: '己', ganOuter: '己' },
    坤: { inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'], ganInner: '乙', ganOuter: '癸' },
    兑: { inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'], ganInner: '丁', ganOuter: '丁' }
  };

  /** 装配六爻干支（自下而上：初 二 三 四 五 上） */
  function assembleSixLines(upperGua, lowerGua) {
    var u = HUN_TIAN_JIA_ZI[upperGua], l = HUN_TIAN_JIA_ZI[lowerGua];
    if (!u || !l) return null;
    var out = [];
    for (var i = 0; i < 3; i++) {
      out.push({ yao: i + 1, stem: l.ganInner, branch: l.inner[i], ganzhi: l.ganInner + l.inner[i] });
    }
    for (var j = 0; j < 3; j++) {
      out.push({ yao: j + 4, stem: u.ganOuter, branch: u.outer[j], ganzhi: u.ganOuter + u.outer[j] });
    }
    return out;
  }

  // 世身：世爻地支 → 世身爻位
  // 主源：GE萃取2-260908 X.md:335-342，并化简验证 12/12
  //   子午→1 丑未→2 寅申→3 卯酉→4 辰戌→5 巳亥→6
  //   等价公式：世身爻位 = (地支索引 mod 6) + 1
  function shiShenYao(shiBranch) {
    var i = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'].indexOf(shiBranch);
    return i < 0 ? null : (i % 6) + 1;
  }

  return {
    _status: 'confirmed',
    _ganStatus: 'confirmed',
    _zhiStatus: 'confirmed',
    _note: '六爻天干（纳甲）主料双源 confirmed，7/7 中。'
      + '爻位地支（浑天甲子）已由 GE萃取2:116-127 补齐，参考图 5 张面板 × 6 爻 = 30/30 命中。'
      + '乾坤双干：乾内甲外壬、坤内乙外癸（GE 注释 + 大壮案下卦乾取甲 印证）。'
      + '世身公式 12/12 验证通过。世应（世爻位）仍以京房八宫表为准。',
    _sources: [
      '01-书同课程-35P录音稿清洗-260831 √.md:9605-9616',
      '03-老韩天时-63P书籍清洗-260903 √.md:916-922',
      'GE萃取2-260908 X.md:116-127',
      'GE萃取2-260908 X.md:287-310',
      'GE萃取2-260908 X.md:335-342'
    ],
    DUAL_GAN_PENDING: {
      ruleId: 'LSY-GUA-NAJIA-DUAL',
      status: 'confirmed',
      note: '原标 RULE_PENDING（乾坤双干内外分配未闭合）。'
        + '现由 GE萃取2:294 注释「坤内乙外癸；乾内甲外壬」+ 参考图大壮案（下卦乾取甲）确认。'
        + '乾内甲外壬、坤内乙外癸。',
      sources: ['GE萃取2-260908 X.md:294']
    },
    HUN_TIAN_JIA_ZI: HUN_TIAN_JIA_ZI,
    assembleSixLines: assembleSixLines,
    shiShenYao: shiShenYao,
    TRIGRAM_GAN: TRIGRAM_GAN,
    TRIGRAM_GAN_SECOND: TRIGRAM_GAN_SECOND,
    TRIGRAM_ZHI: TRIGRAM_ZHI,
    POS_NAMES: POS_NAMES
  };
});
