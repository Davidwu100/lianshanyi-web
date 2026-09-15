/*!
 * 连山易 · 卦象引擎（gua-engine.js）
 * ---------------------------------------------------------------------------
 * 参考图区块⑩「本命卦 / 当前动态卦」的受控实现。
 *
 * 证据分层（详见 _verify/C-卦象纳甲动爻世应-核实.md）：
 *   ✅ 纳甲（六爻天干）   主料双源：01-书同课程:9605-9616、03-老韩天时:916-922
 *                         参考面板六卦天干 7/7 全中
 *   🟡 上卦 / 下卦        公式原文仅二次文档（连山易六爻全息计算算法蓝图:42-55），
 *                         但复算 3 张参考盘 + 5 个语料案例全部精确复现 → conditional
 *   🟡 动爻 / 变卦        (sum) mod 6，余0取6；截图 (3)/(1) 复现且变卦可反向验证 → conditional
 *   🔴 爻位地支（浑天甲子）五份主料全缺，全库仅 1 行二次文档 → RULE_PENDING
 *   🔴 [宫N] 括号码       库内无定义，6 样本与京房八宫序自洽但仅属推断 → RULE_PENDING
 *   🔴 64 卦序号 / 卦辞   须外部导入（data/external/）→ 未导入前不输出
 *   🔴 连山易四字判语     仅 6 样本，无生成规则 → RULE_PENDING
 *   ✅ 世应 / 世身 / 六亲  B2 资料完整给出八宫卦序与世应口诀 → 已实现（bajing-shiying.js）
 *      ⚠ 此前记「八宫卦序表缺失、五份主料零命中」→ **该结论有误**，已更正
 *
 * ⚠ 已证伪的假设，不得建模：
 *   2026 动态卦「恒→大壮」看似 = 甲辰旬 值卦巽 + 冲卦乾 + 空卦震 的组合，
 *   但该卦可由本文件的上下卦公式精确复现，且 05:2898-2906 证明 1962/1982
 *   两盘在同一时刻显示同一动态卦（动态卦只依赖当前年月日时）→ 伪相关。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./dict-core.js'),
      require('./core.js'),
      require('./gua-najia.js'),
      // 三张外部表：语料 not-found，须外部导入。
      // 路径从 assets/js/engine/ 上溯三级到项目根，再进 data/external/
      safeRequire('../../../data/external/hexagram-64.js'),
      safeRequire('../../../data/external/bajing.js'),
      safeRequire('../../../data/external/zhouyi-text.js'),
      require('./bajing-shiying.js')
    );
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.gua = factory(
      root.LSY.data.core, root.LSY.engine.core, root.LSY.data.najia,
      root.LSY.external && root.LSY.external.hexagram64,
      root.LSY.external && root.LSY.external.bajing,
      root.LSY.external && root.LSY.external.zhouyiText,
      root.LSY.engine.bajing
    );
  }
  function safeRequire(p) {
    try { return require(p); } catch (e) { return null; }
  }
})(typeof self !== 'undefined' ? self : this, function (D, C, NAJIA, EXT64, EXT8, EXTTXT, BAJING) {
  'use strict';

  var SAFETY = '仅作传统标注，不构成吉凶结论';
  function meta(id) { return D.meta[id] || {}; }

  // 八卦编号：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤（先天卦序，主料 03:487-496）
  var BAGUA = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  // 八卦 → 三爻（自下而上，阳=1 阴=0）
  var TRIGRAM_LINES = {
    乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
    巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0]
  };
  // 八卦 → 自然象（用于卦名与「雷风/泽山」标签）
  var TRIGRAM_NATURE = { 乾: '天', 兑: '泽', 离: '火', 震: '雷', 巽: '风', 坎: '水', 艮: '山', 坤: '地' };

  // ------------------------------------------------------------------ 上下卦
  /**
   * 上卦/下卦公式（连山易六爻全息计算算法蓝图:42-55）
   *   数值映射：年支 1-12 / 节气月令 建寅=1 / 农历日 1-30 / 时支 1-12
   *   上卦 = (年支数 + 节气月数 + 农历日数) mod 8，余 0 取 8
   *   下卦 = (年支数 + 节气月数 + 农历日数 + 时支数) mod 8，余 0 取 8
   *   动爻 = 同上总和 mod 6，余 0 取 6
   *   → 八卦编号 1乾 2兑 3离 4震 5巽 6坎 7艮 8坤
   */
  function computeGua(rec) {
    var solar = rec.solar, lunar = rec.lunar;
    var yearZhiNum = D.ZHI.indexOf(rec.pillars.year.charAt(1)) + 1;              // 子=1..亥=12
    var monthNum = solarTermMonth(rec);                                         // 建寅=1
    var dayNum = lunar.day;                                                     // 农历日 1-30
    var hourZhiNum = rec.pillars.time ? D.ZHI.indexOf(rec.pillars.time.charAt(1)) + 1 : null;

    var s1 = yearZhiNum + monthNum + dayNum;
    var upperIdx = s1 % 8 === 0 ? 8 : s1 % 8;                                   // 余0取8坤
    // ⚠ 缺时辰时下卦**无解**（公式含时支），不得默认取上卦。
    //   原实现 `lowerIdx = upperIdx` 会凭空造出一个完整的「兑为泽」并附六亲/世应，
    //   属**伪造**（违反本项目不伪造红线）；界面虽写了「下卦与动爻整体阻断」，
    //   但显示出的卦名是编的。现改为 lower = null，由渲染侧显式留白。
    var lowerIdx = hourZhiNum === null ? null : upperIdx;
    var dongYao = null;
    if (hourZhiNum !== null) {
      var s2 = s1 + hourZhiNum;
      lowerIdx = s2 % 8 === 0 ? 8 : s2 % 8;
      dongYao = s2 % 6 === 0 ? 6 : s2 % 6;
    }

    return {
      yearZhiNum: yearZhiNum, monthNum: monthNum, dayNum: dayNum, hourZhiNum: hourZhiNum,
      sum1: s1, sum2: hourZhiNum === null ? null : s1 + hourZhiNum,
      upper: BAGUA[upperIdx - 1],
      lower: lowerIdx === null ? null : BAGUA[lowerIdx - 1],
      upperIdx: upperIdx, lowerIdx: lowerIdx,
      dongYao: dongYao,
      // 缺时辰 → 下卦、动爻、变卦整体阻断（GATE-002 / LSY-TALENT-007）
      lowerBlocked: lowerIdx === null,
      blockReason: lowerIdx === null
        ? '缺出生时辰：下卦 = (年支 + 节气月令 + 农历日 + 时支) mod 8 中含时支，'
          + '时支缺失则下卦无解 → 本命卦、变卦、六亲、世应一并阻断，不猜不补。'
        : null,
      // 记录供回归对拍
      inputs: { 年支: yearZhiNum, 节气月令: monthNum, 农历日: dayNum, 时支: hourZhiNum }
    };
  }

  /** 节气月令：建寅 = 1（以交节时刻切分的月令，不是农历月） */
  function solarTermMonth(rec) {
    // 由月柱地支反推月令序号：寅月=1 … 丑月=12
    var mz = rec.pillars.month.charAt(1);
    return ((D.ZHI.indexOf(mz) - D.ZHI.indexOf('寅') + 12) % 12) + 1;
  }

  // ------------------------------------------------------------------ 卦名
  /** 由上下卦查卦名。优先用外部 64 卦表的 UPPER/LOWER；缺失时返回合成标签 */
  function guaName(upper, lower) {
    if (EXT64 && EXT64.UPPER && EXT64.LOWER && EXT64.ORDER) {
      for (var i = 0; i < EXT64.ORDER.length; i++) {
        var n = EXT64.ORDER[i];
        if (EXT64.UPPER[n] === upper && EXT64.LOWER[n] === lower) {
          return { name: n, no: (EXT64.byName && EXT64.byName[n]) || (i + 1), source: 'external' };
        }
      }
    }
    // 外部表未导入：只用八卦自然象拼一个可读标签，并明确标注为待确认
    return {
      name: TRIGRAM_NATURE[upper] + TRIGRAM_NATURE[lower],
      no: null,
      source: 'pending',
      note: '卦名与周易序号需外部表（64 卦名称+序号）。当前仅按上下卦的自然象拼接显示，未取正式卦名。'
    };
  }

  /** 八卦自然象 + 卦名（参考图「兑泽」「艮山」这种标签）
   *  参考界面用简体；外部表 UPPER_T/LOWER_T 为繁体，UPPER/LOWER 为简体。
   */
  function trigramLabel(t) { return t + TRIGRAM_NATURE[t]; }

  /**
   * 全名卦名（参考图显示「泽山咸」「雷风恒」「雷天大壮」这种形式）。
   *   构成 = 上卦自然象 + 下卦自然象 + 正名，例：兑(泽) + 艮(山) + 咸 = 泽山咸
   *   正名来自外部 64 卦表；外部表缺失时退化为自然象拼接。
   */
  function fullName(upper, lower, name) {
    var nat = TRIGRAM_NATURE[upper] + TRIGRAM_NATURE[lower];
    if (!name) return nat;
    // 正名已含自然象前缀（如某些表可能直接给「泽山咸」）时避免重复
    return (name.indexOf(nat) === 0) ? name : (nat + name);
  }

  /** 卦辞/象辞：优先简体版（参考图口径），并注明来源 */
  function pickText(name) {
    if (!EXTTXT) return null;
    var simp = EXTTXT.byNameSimp && EXTTXT.byNameSimp[name];
    var trad = EXTTXT.byNameTrad && EXTTXT.byNameTrad[name];
    if (simp) return { tuan: simp.tuan, xiang: simp.xiang, script: 'simplified', alt: trad || null };
    if (trad) return { tuan: trad.tuan, xiang: trad.xiang, script: 'traditional', alt: null };
    return null;
  }

  // ------------------------------------------------------------------ 六爻纳甲
  /**
   * 六爻干支（自下而上：初 二 三 四 五 上）
   *   ✅ 天干来自纳甲（主料双源，7/7 中）
   *   ✅ 地支来自浑天甲子表（GE萃取2:116-127，参考图 30/30 中）
   *   装配逻辑：内卦三爻用内卦干支，外卦三爻用外卦干支。
   */
  function sixLines(g, natalStem) {
    var lines = [];
    var upperT = g.upper, lowerT = g.lower;
    var upperLines = TRIGRAM_LINES[upperT], lowerLines = TRIGRAM_LINES[lowerT];
    // 六爻自下而上：下卦三爻(初/二/三) + 上卦三爻(四/五/上)
    var all = lowerLines.concat(upperLines);

    // 优先用浑天甲子表精确装配
    var assembled = (NAJIA && NAJIA.assembleSixLines) ? NAJIA.assembleSixLines(upperT, lowerT) : null;

    for (var i = 0; i < 6; i++) {
      var isUpper = i >= 3;
      var t = isUpper ? upperT : lowerT;
      var gan, zhi;
      if (assembled && assembled[i]) {
        gan = assembled[i].stem;
        zhi = assembled[i].branch;
      } else {
        // 退化路径（浑天表缺失时）
        gan = NAJIA && NAJIA.TRIGRAM_GAN ? NAJIA.TRIGRAM_GAN[t] : null;
        zhi = null;
      }
      lines.push({
        pos: i + 1,
        posName: NAJIA.POS_NAMES[i],
        yang: all[i] === 1,
        trigram: t,
        gan: gan,
        zhi: zhi,
        ganzhi: (gan && zhi) ? gan + zhi : null,
        ganStatus: gan ? 'confirmed' : 'RULE_PENDING',
        zhiStatus: zhi ? 'confirmed' : 'RULE_PENDING'
      });
    }
    return lines;
  }

  /** 变卦：动爻阴阳互换 */
  function bianGua(g, dongYao) {    if (!dongYao) return null;
    var lowerLines = TRIGRAM_LINES[g.lower].slice();
    var upperLines = TRIGRAM_LINES[g.upper].slice();
    var all = lowerLines.concat(upperLines);
    all[dongYao - 1] = all[dongYao - 1] === 1 ? 0 : 1;
    var nl = all.slice(0, 3), nu = all.slice(3, 6);
    function toTrigram(a) {
      for (var k = 0; k < BAGUA.length; k++) {
        var t = BAGUA[k], tl = TRIGRAM_LINES[t];
        if (tl[0] === a[0] && tl[1] === a[1] && tl[2] === a[2]) return t;
      }
      return null;
    }
    return { lower: toTrigram(nl), upper: toTrigram(nu) };
  }

  // ------------------------------------------------------------------ 主入口
  /**
   * @param {object} rec  calendar.rectify 输出
   * @param {object} opt  { natalYearGan } 可选
   * @returns {object} 卦象面板数据（含逐字段元数据）
   */
  function build(rec, opt) {
    opt = opt || {};
    var g = computeGua(rec);
    var extReady = !!(EXT64 && EXT64.ORDER && EXT64.ORDER.length === 64);
    // ⚠ 下卦无解（缺时辰）时**不得**查卦名 —— 否则会捏造一个完整卦。
    var nameInfo = g.lowerBlocked ? { name: null, no: null, source: null, blocked: true }
      : guaName(g.upper, g.lower);
    var lines = g.lowerBlocked ? null : sixLines(g, null);
    var bian = g.lowerBlocked ? null : bianGua(g, g.dongYao);
    var bianName = bian ? guaName(bian.upper, bian.lower) : null;
    var bianGong = null;
    if (bianName && bianName.name && EXT8 && EXT8.byName && EXT8.byName[bianName.name]) {
      var be = EXT8.byName[bianName.name];
      bianGong = { palace: be.palace, shi: be.shi, label: be.palace + (be.shi + 1), source: 'external' };
    }

    var gongInfo = null;
    if (EXT8 && EXT8.byName && nameInfo.name && EXT8.byName[nameInfo.name]) {
      var e = EXT8.byName[nameInfo.name];
      gongInfo = { palace: e.palace, shi: e.shi, label: e.palace + (e.shi + 1), source: 'external' };
    }

    var text = pickText(nameInfo.name);

    // 变卦六爻干支（纳甲 + 浑天甲子）——参考图右列与左列同样带干支
    //   例：泽地萃 = 外卦兑（丁未/丁酉/丁亥，与主卦外卦同）+ 内卦坤（乙卯/乙巳/乙未）
    var bianLines = bian ? sixLines({ upper: bian.upper, lower: bian.lower }, null) : null;
    var bianText = bianName && bianName.name ? pickText(bianName.name) : null;
    // 连山易四字判语 + 等第：**仅 6 条截图样本**，命中才给，否则 null
    var verdictOf = function (nm) {
      var v = nm && D.LIANSHAN_VERDICT ? D.LIANSHAN_VERDICT[nm] : null;
      return v || null;
    };

    return {
      // 本命卦
      natal: {
        upper: g.upper, lower: g.lower,
        upperLabel: trigramLabel(g.upper),
        lowerLabel: g.lower === null ? null : trigramLabel(g.lower),
        name: nameInfo.name, no: nameInfo.no, nameSource: nameInfo.source,
        fullName: g.lowerBlocked ? null : fullName(g.upper, g.lower, nameInfo.source === 'external' ? nameInfo.name : null),
        gong: gongInfo,
        lines: lines,
        dongYao: g.dongYao,
        // 缺时辰 → 下卦无解，本命卦只给上卦，其余整体阻断（不猜不补）
        blocked: !!g.lowerBlocked,
        blockReason: g.blockReason || null,
        bian: bian ? {
          upper: bian.upper, lower: bian.lower,
          upperLabel: trigramLabel(bian.upper), lowerLabel: trigramLabel(bian.lower),
          name: bianName.name, no: bianName.no, gong: bianGong,
          fullName: fullName(bian.upper, bian.lower, bianName.source === 'external' ? bianName.name : null),
          // 变卦六爻干支 + 卦辞（参考图右列与左列同构）
          lines: bianLines,
          text: bianText,
          textSource: bianText ? 'data/external/zhouyi-text.js（非连山易来源，简体）' : null,
          verdict: verdictOf(bianName.name)
        } : null,
        text: text,
        // 参考图面板文字的实际构成：
        //   [连山易四字判语 + 吉凶等第] + [周易原文]
        //   后半段可从外部表取（已导入）；前半段仅 6 样本、无生成规则 → 只转录样本，不外推
        textSource: text ? 'data/external/zhouyi-text.js（非连山易来源，简体）' : null,
        textRefScreenshot: (EXTTXT && EXTTXT._referenceScreenshotSamples
          && EXTTXT._referenceScreenshotSamples.samples
          && EXTTXT._referenceScreenshotSamples.samples[nameInfo.name]) || null,
        // 四字判语：**仅 6 条样本**，命中才给（渲染侧另标「仅案例样本」）
        verdict: verdictOf(nameInfo.name)
      },
      // 计算过程留痕（供回归对拍与用户核对）
      derivation: {
        inputs: g.inputs,
        sum1: g.sum1, sum2: g.sum2,
        note: '上卦 = (年支+节气月令+农历日) mod 8，余0取8；下卦再加时支 mod 8，余0取8；动爻 = 总和 mod 6，余0取6。'
          + '八卦编号 1乾 2兑 3离 4震 5巽 6坎 7艮 8坤。'
          + '公式原文仅见二次文档，但已用 3 张参考盘 + 5 个语料案例复现。'
      },
      // 字段元数据
      fields: {
        xiagua: {
          // ⚠ 下卦无解时**不得**拼出「兑/艮」这种串 —— 值置 null，状态 RULE_PENDING
          value: g.lowerBlocked ? null : (g.upper + '/' + g.lower),
          field_id: 'scenario.gua.xiagua',
          field_status: g.lowerBlocked ? 'RULE_PENDING' : 'conditional',
          rule_id: 'LSY-GUA-XIAGUA',
          source_refs: ['连山易六爻全息计算算法蓝图.md:42-55', '03-老韩天时-63P书籍清洗-260903 √.md:487-496'],
          depends_on: ['pillar.year.zhi', 'pillar.month.zhi', 'calendarData.lunar.day', 'pillar.time.zhi'],
          exception_policy: g.lowerBlocked
            ? '⛔ 缺出生时辰：下卦公式含时支 → **无解**，故本命卦、变卦、六亲、世应一并阻断（不默认取上卦）。'
            : '公式仅见二次文档；主料对取模/余数零支持。但已用 3 张参考盘 + 5 个语料案例精确复现（含余0→8、余0→6 实例）。',
          interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: 'CONFLICT-008'
        },
        najia: {
          value: lines ? lines.map(function (l) { return l.gan; }).join('') : null,
          field_id: 'scenario.gua.najia',
          field_status: lines ? 'confirmed' : 'RULE_PENDING',
          rule_id: 'LSY-GUA-NAJIA',
          source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:9605-9616', '03-老韩天时-63P书籍清洗-260903 √.md:916-922'],
          depends_on: ['scenario.gua.xiagua'],
          exception_policy: lines
            ? '纳甲（六爻天干）主料双源；参考面板六卦天干 7/7 全中。乾坤双干的内外分配仍需专家确认。'
            : '⛔ 缺出生时辰 → 本命卦未成，无六爻可装，纳甲不输出。',
          interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
        },
        yaodizhi: {
          value: lines ? lines.map(function (l) { return l.zhi; }).join('') : null,
          field_id: 'scenario.gua.yaodizhi',
          field_status: lines ? 'confirmed' : 'RULE_PENDING',
          rule_id: 'LSY-GUA-YAODIZHI',
          source_refs: ['GE萃取2-260908 X.md:116-127', 'GE萃取2-260908 X.md:287-310'],
          depends_on: ['scenario.gua.xiagua'],
          exception_policy: lines
            ? '爻位地支（浑天甲子）由 GE萃取2 的装配表补齐，'
              + '参考图 5 张面板 × 6 爻 = 30/30 逐字命中。'
              + '内卦三爻用内卦干支、外卦三爻用外卦干支；乾坤双干为乾内甲外壬、坤内乙外癸。'
            : '⛔ 缺出生时辰 → 本命卦未成，爻位地支不输出。',
          interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
        },
        gongN: {
          value: gongInfo ? gongInfo.label : null, field_id: 'scenario.gua.gongN',
          field_status: gongInfo ? 'conditional' : 'RULE_PENDING',
          rule_id: 'LSY-GUA-GONGN',
          source_refs: gongInfo ? ['data/external/bajing.js'] : [],
          depends_on: ['scenario.gua.xiagua'],
          exception_policy: '`[宫N]` 在语料中无定义；6 样本与京房八宫卦序自洽，但仅属推断，且依赖外部表。',
          interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
        },
        no: {
          value: nameInfo.no, field_id: 'scenario.gua.no',
          field_status: extReady ? 'external' : 'RULE_PENDING',
          rule_id: null,
          source_refs: extReady ? ['data/external/hexagram-64.js'] : [],
          depends_on: ['scenario.gua.xiagua'],
          exception_policy: '64 卦名称与周易序号在连山易语料中 not-found，须外部导入并标注非连山易来源。',
          interpretation_type: 'computed', safety_boundary: '非连山易来源，仅作对照展示', conflict_id: null
        },
        text: {
          value: text, field_id: 'scenario.gua.text',
          field_status: text ? 'external' : 'RULE_PENDING', rule_id: null,
          source_refs: text ? ['data/external/zhouyi-text.js'] : [],
          depends_on: ['scenario.gua.no'],
          exception_policy: '《周易》卦辞/象辞属外部经文，须导入并标注非连山易来源。',
          interpretation_type: 'computed', safety_boundary: '非连山易来源，仅作对照展示', conflict_id: null
        },
        commentary: {
          value: (function () {
            var v = (g.lowerBlocked ? null : (D.LIANSHAN_VERDICT && D.LIANSHAN_VERDICT[nameInfo.name])) || null;
            return v ? (v.verdict + '，' + v.grade) : null;
          })(),
          field_id: 'scenario.gua.commentary',
          // ⚠ 命名沿用历史 `commentary`（= 四字判语 + 等第）。
          //   本字段**不是计算结果**，而是 6 条截图样本的**转录**：
          //     命中 → candidate（值 = 样本原文），未命中 → RULE_PENDING（值 null）。
          //   `05:2472`「不允许模型补全」、`05:2452`「不适合在缺少规则说明的情况下直接生成断语」
          //   → 严禁据 6 样本外推其余 58 卦。
          field_status: (function () {
            var v = (g.lowerBlocked ? null : (D.LIANSHAN_VERDICT && D.LIANSHAN_VERDICT[nameInfo.name])) || null;
            return v ? 'candidate' : 'RULE_PENDING';
          })(),
          rule_id: 'LSY-GUA-PANYU',
          source_refs: (function () {
            var v = (g.lowerBlocked ? null : (D.LIANSHAN_VERDICT && D.LIANSHAN_VERDICT[nameInfo.name])) || null;
            return v ? [v.src] : ['05-连山易知识卡片_清洗.md:2236-2237 等 6 处'];
          })(),
          depends_on: ['scenario.gua.xiagua'],
          exception_policy: '参考图卦辞前置的「连山易四字判语 + 吉凶等第」（如「以情感人，中上」）'
            + '全库**仅 6 条截图样本**，等第判定逻辑 not-found → 本工具**只转录样本、绝不外推**：'
            + '命中 6 卦之一则原样显示并标「仅案例样本」，其余卦一律留白。'
            + '⚠ 语料红线 05:2472「不允许模型补全」、05:2452「不得在缺少规则说明时直接生成断语」、'
            + 'GE萃取2:1517「绝不允许生硬补造、臆测 144 种固定释义断语」。',
          interpretation_type: 'traditional_course', safety_boundary: SAFETY, conflict_id: null
        },
        // 世应 / 世身 —— 原为 RULE_PENDING（理由「八宫卦序表缺失」），
        //   ⚠ 该结论**有误**：B2-连山易壹级资料_高保真知识.md:905-928 完整给出
        //     八宫卦序 64 卦全表，:963-977 给出世应口诀与规则，:981-997 给出六亲规则。
        //     使用者 2026-09-12 指路后补齐（assets/js/engine/bajing-shiying.js）。
        //   规则：八纯卦 世六应三；第二~六卦 世1~5；第七卦=游魂世四；第八卦=归魂世三；
        //         应爻与世爻**隔两位**。六亲以卦宫五行为「我」比较爻支五行。
        //   ⚠ 六亲用五行生克属**装卦命名**环节，不参与连山易吉凶断语。
        shiYing: (function () {
          if (!BAJING) {
            return {
              value: null, field_id: 'scenario.gua.shiying', field_status: 'RULE_PENDING',
              rule_id: 'LSY-GUA-SHIYING', source_refs: [], depends_on: [],
              exception_policy: 'bajing-shiying 模块未加载。',
              interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
            };
          }
          // 复用 build() 已算好的 g / lines / nameInfo（勿重算，避免作用域错）
          // ⚠ 缺时辰 → lines 为 null、卦名未定 → 装卦整体阻断，不得凭空定位
          var nm = g.lowerBlocked ? null : fullName(g.upper, g.lower, nameInfo && nameInfo.name);
          var zhis = lines ? lines.map(function (L) { return L.zhi; }) : null;
          var asm = (nm && zhis) ? BAJING.assemble(nm, zhis) : { ok: false };
          if (!asm.ok) {
            return {
              value: null, field_id: 'scenario.gua.shiying',
              field_status: g.lowerBlocked ? 'RULE_PENDING' : 'conditional',
              rule_id: 'LSY-GUA-SHIYING',
              source_refs: ['B2-连山易壹级资料_高保真知识.md:905-928, 963-997'],
              depends_on: ['gua.fullName'],
              exception_policy: g.lowerBlocked
                ? '⛔ 缺出生时辰 → 下卦无解、本命卦未成，世应/世身/六亲一并阻断。'
                : '卦名未定 → 无法在八宫卦序表中定位。',
              interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
            };
          }
          // 把六亲回填到各爻（供 UI 显示）
          lines.forEach(function (L) {
            var hit = asm.lines.filter(function (x) { return x.pos === L.pos; })[0];
            if (hit) { L.liuQin = hit.liuQin; L.isShi = hit.isShi; L.isYing = hit.isYing; }
          });
          return {
            value: {
              palace: asm.palace, palaceWuxing: asm.palaceWuxing,
              order: asm.order, orderName: asm.orderName,
              shi: asm.shi, ying: asm.ying,
              shiShen: asm.shiShen, shiZhi: asm.shiZhi,
              isYouhun: asm.isYouhun, isGuihun: asm.isGuihun
            },
            field_id: 'scenario.gua.shiying', field_status: 'confirmed',
            rule_id: 'LSY-GUA-SHIYING',
            source_refs: [
              'B2-连山易壹级资料_高保真知识.md:905-928（八宫卦序 64 卦）',
              'B2-连山易壹级资料_高保真知识.md:963-977（安世应口诀）',
              'B2-连山易壹级资料_高保真知识.md:981-997（安六亲）',
              '连山易六爻全息计算算法蓝图.md:63-65'
            ],
            depends_on: ['gua.fullName', 'gua.lines.zhi'],
            exception_policy: '世应依八宫卦序法：八纯世六应三 / 第二~六卦世1~5 / '
              + '游魂世四 / 归魂世三；应爻与世爻隔两位。六亲以卦宫五行为我、'
              + '比较爻支五行（生我父母·我生子孙·我制妻财·制我官鬼·比和兄弟）。'
              + '⚠ 资料另有「变爻推世应」第二法但未给规则，本项目只用八宫卦序法。'
              + '⚠ 六亲用五行生克属装卦命名环节，不参与连山易吉凶断语。',
            interpretation_type: 'computed', safety_boundary: SAFETY, conflict_id: null
          };
        })()
      },
      externalReady: extReady,
      panelNote: g.lowerBlocked
        ? '⛔ 缺出生时辰：下卦 = (年支 + 节气月令 + 农历日 + 时支) mod 8 中含时支，'
          + '时支缺失则**下卦无解** → 本命卦、变卦、六亲、世应一并阻断，只给上卦，不猜不补。'
        : (extReady
          ? '卦名与序号来自外部导入表（非连山易来源），已与连山易规则视觉区分。'
          : '64 卦名称表尚未导入 → 正式卦名、周易序号、`[宫N]` 与卦辞均标为「待确认」。'
            + '上下卦、动爻、变卦与六爻天干已按已复核口径输出。')
    };
  }

  return {
    build: build,
    computeGua: computeGua,
    solarTermMonth: solarTermMonth,
    guaName: guaName,
    fullName: fullName,
    sixLines: sixLines,
    bianGua: bianGua,
    trigramLabel: trigramLabel,
    BAGUA: BAGUA,
    TRIGRAM_LINES: TRIGRAM_LINES,
    TRIGRAM_NATURE: TRIGRAM_NATURE
  };
});
