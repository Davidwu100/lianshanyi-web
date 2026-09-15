/*!
 * 连山易 · 八宫装卦：卦序 / 世应 / 六亲（bajing-shiying.js）
 * ---------------------------------------------------------------------------
 * 依据（语料 B2-连山易壹级资料_高保真知识.md，主题十「八宫卦序与装卦」）
 *   ⚠ 该主题此前在本项目中被记为「八宫卦序表缺失 / 五份主料零命中」
 *     （见 gua-engine.js:343 的世应 RULE_PENDING 说明）→ **该结论有误**，
 *     八宫表与世应规则在 B2 资料中完整给出。使用者 2026-09-12 指路后已补齐。
 *
 *   905-928  八宫卦序（八卦宫 × 8 卦 = 64 卦全表）
 *   963-977  安世应口诀：
 *             「八卦之首世六当，以下初爻轮上装；
 *               游魂八卦四爻立，归魂八卦三爻详。」
 *             八纯卦 世六 / 应三；第二卦 初爻世；第三卦 二爻世；
 *             第四卦 三爻世；第五卦 四爻世；第六卦 五爻世；
 *             第七卦 四爻世（游魂）；第八卦 三爻世（归魂）；
 *             **应爻与世爻隔两位**（世1→应4，世2→应5，世3→应6，世4→应1，世5→应2，世6→应3）
 *   981-997  安六亲：以「卦宫五行」为我，比较「爻支五行」与卦宫五行的生制关系
 *             比我者=兄弟 · 我生者=子孙 · 我制者=妻财 · 生我者=父母 · 制我者=官鬼
 *
 *   ⚠ 六亲用的是**五行生克**：这是装卦法（八宫体系）的固有命名环节，
 *     与使用者裁决「连山易本体的**吉凶判定**不看五行生克」不冲突
 *     —— 六亲只作名相标注，不参与连山易吉凶断语。
 *
 *   ⚠ 本资料明说「另有『变爻来推世应』第二法，现场讲，未提供规则」
 *     （1368-1372）→ 本项目只用八宫卦序法。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.bajing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 八宫卦序（B2:906-928 逐宫八句，顺序即卦序：本宫 → 一世 → … → 五世 → 游魂 → 归魂）
  var PALACES = {
    乾: ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'],
    坎: ['坎为水', '水泽节', '水雷屯', '水火既济', '泽火革', '雷火丰', '地火明夷', '地水师'],
    艮: ['艮为山', '山火贲', '山天大畜', '山泽损', '火泽睽', '天泽履', '风泽中孚', '风山渐'],
    震: ['震为雷', '雷地豫', '雷水解', '雷风恒', '地风升', '水风井', '泽风大过', '泽雷随'],
    巽: ['巽为风', '风天小畜', '风火家人', '风雷益', '天雷无妄', '火雷噬嗑', '山雷颐', '山风蛊'],
    离: ['离为火', '火山旅', '火风鼎', '火水未济', '山水蒙', '风水涣', '天水讼', '天火同人'],
    坤: ['坤为地', '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '水天需', '水地比'],
    兑: ['兑为泽', '泽水困', '泽地萃', '泽山咸', '水山蹇', '地山谦', '雷山小过', '雷泽归妹']
  };

  // 宫五行（B2 各宫标题已标：乾金 / 坎水 / 艮土 / 震木 / 巽木 / 离火 / 坤土 / 兑金）
  var PALACE_WUXING = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

  // 卦序位（1-based）→ 世爻位（B2:969-976）
  var SHI_BY_ORDER = {
    1: 6,  // 八纯卦：世六
    2: 1,  // 第二卦：初爻世
    3: 2,  // 第三卦：二爻世
    4: 3,  // 第四卦：三爻世
    5: 4,  // 第五卦：四爻世
    6: 5,  // 第六卦：五爻世
    7: 4,  // 第七卦：四爻世（游魂）
    8: 3   // 第八卦：三爻世（归魂）
  };
  var ORDER_NAME = { 1: '八纯', 2: '一世', 3: '二世', 4: '三世', 5: '四世', 6: '五世', 7: '游魂', 8: '归魂' };

  // 五行生克（仅用于**六亲命名**，不参与吉凶断语）
  var SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  // 地支 → 五行
  var ZHI_WX = {
    子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
    午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水'
  };

  /** 由卦名定位八宫与卦序位 */
  function locate(fullName) {
    var keys = Object.keys(PALACES);
    for (var i = 0; i < keys.length; i++) {
      var list = PALACES[keys[i]];
      var idx = list.indexOf(fullName);
      if (idx >= 0) {
        return {
          palace: keys[i], order: idx + 1, orderName: ORDER_NAME[idx + 1],
          palaceWuxing: PALACE_WUXING[keys[i]], fullName: fullName
        };
      }
    }
    return null;
  }

  /** 世应爻位：世 = SHI_BY_ORDER[卦序位]；应 = 与世隔两位（B2:977） */
  function shiYingOf(fullName) {
    var loc = locate(fullName);
    if (!loc) return null;
    var shi = SHI_BY_ORDER[loc.order];
    var ying = ((shi + 2) % 6) + 1;   // 1→4 2→5 3→6 4→1 5→2 6→3
    return {
      palace: loc.palace, order: loc.order, orderName: loc.orderName,
      palaceWuxing: loc.palaceWuxing,
      shi: shi, ying: ying,
      isYouhun: loc.order === 7, isGuihun: loc.order === 8
    };
  }

  /** 六亲：以卦宫五行为「我」，比较爻支五行（B2:984-990） */
  function liuQinOf(palaceWuxing, yaoZhi) {
    var w = ZHI_WX[yaoZhi];
    if (!w || !palaceWuxing) return null;
    if (w === palaceWuxing) return '兄弟';
    if (SHENG[palaceWuxing] === w) return '子孙';   // 我生者
    if (KE[palaceWuxing] === w) return '妻财';      // 我制者
    if (SHENG[w] === palaceWuxing) return '父母';   // 生我者
    if (KE[w] === palaceWuxing) return '官鬼';      // 制我者
    return null;
  }

  /** 世身：世爻地支 → 世身爻位（子午初 · 丑未二 · 寅申三 · 卯酉四 · 辰戌五 · 巳亥六） */
  function shiShenYao(shiZhi) {
    var i = '子丑寅卯辰巳午未申酉戌亥'.indexOf(shiZhi);
    if (i < 0) return null;
    return (i % 6) + 1;
  }

  /**
   * 一次算全：给定卦名与六爻地支，返回装卦结果
   * @param {string} fullName 卦名（如「泽山咸」）
   * @param {Array<string>} zhiList 六爻地支，**初爻在前**（index 0 = 初爻）
   */
  function assemble(fullName, zhiList) {
    var sy = shiYingOf(fullName);
    if (!sy) return { ok: false, reason: '卦名不在八宫卦序表内：' + fullName };
    var lines = (zhiList || []).map(function (z, i) {
      var pos = i + 1;
      return {
        pos: pos,
        zhi: z,
        liuQin: liuQinOf(sy.palaceWuxing, z),
        isShi: pos === sy.shi,
        isYing: pos === sy.ying
      };
    });
    var shiZhi = (zhiList || [])[sy.shi - 1] || null;
    return {
      ok: true, palace: sy.palace, order: sy.order, orderName: sy.orderName,
      palaceWuxing: sy.palaceWuxing, shi: sy.shi, ying: sy.ying,
      isYouhun: sy.isYouhun, isGuihun: sy.isGuihun,
      shiShen: shiShenYao(shiZhi), shiZhi: shiZhi, lines: lines
    };
  }

  return {
    PALACES: PALACES,
    PALACE_WUXING: PALACE_WUXING,
    SHI_BY_ORDER: SHI_BY_ORDER,
    ORDER_NAME: ORDER_NAME,
    ZHI_WX: ZHI_WX,
    locate: locate,
    shiYingOf: shiYingOf,
    liuQinOf: liuQinOf,
    shiShenYao: shiShenYao,
    assemble: assemble,
    _status: 'confirmed',
    _sources: [
      'B2-连山易壹级资料_高保真知识.md:905-928（八宫卦序 64 卦全表）',
      'B2-连山易壹级资料_高保真知识.md:963-977（安世应口诀与规则）',
      'B2-连山易壹级资料_高保真知识.md:981-997（安六亲）',
      '连山易六爻全息计算算法蓝图.md:63-65（同旨，措辞略异）'
    ],
    _note: '此前 gua-engine.js 记「八宫卦序表缺失、五份主料零命中」→ 该结论有误，'
      + 'B2 资料完整给出；使用者 2026-09-12 指路后补齐。'
      + '⚠ 六亲用五行生克属**装卦命名**环节，不参与连山易吉凶断语。'
      + '⚠ 资料明说另有「变爻推世应」第二法但未给规则 → 本项目只用八宫卦序法。'
  };
});
