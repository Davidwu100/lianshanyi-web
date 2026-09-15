/*!
 * 连山易 · 十二长生与有气/无气（changsheng.js）
 * ---------------------------------------------------------------------------
 * 用途：把「有气 / 无气」从语义表述变成可算的布尔判定。
 *
 * 主源：S0A/GE萃取2-260908 X.md:3998-4136（有气/无气完整起法与判定）
 *      S0A/05-连山易知识卡片_清洗.md:208-220（长旺墓表 + 阳顺阴逆走势）
 *      S0A/GE萃取2-260908 X.md:4341-4350（六旬空亡与吊客/病符）
 *      S0A/GE萃取2-260908 X.md:4471-4472（官符/死符为孤）
 *
 * ── 十二长生序列如何得到 ──────────────────────────────────────────────
 * 语料**未直接给出**完整 12 阶段落点表（这是本项此前标 RULE_PENDING 的原因）。
 * 但主料 05:208-220 给了每干的【长生 / 旺处 / 墓处】三锚点 + 【走势：阳顺阴逆】，
 * 而三锚点在 12 阶段中固定位于 1（长生）、5（帝旺）、9（墓）。
 * 据此可推出完整序列，且推导自洽性已验证：**帝旺与墓的落点 10/10 全部回填命中**。
 *
 * ⚠ 已知的第三方表有误：`GE萃取2:4112-4127` 的「二十长生母表」把阴干长生写错
 *   （乙未应为午、丁戌应为酉、己辰应为酉、辛丑应为子），并出现「帝旺=墓」的几何矛盾
 *   （丁：巳/丑 帝旺与墓不同，但该表 丁 的墓写丑而帝旺写巳——生成序列时帝旺=墓=丑）。
 *   → **该表不采信**，只作反向参考。本实现以主料 05 三锚点 + 阳顺阴逆为准。
 *
 * ── 有气 / 无气的判定（GE萃取2:4131-4133 的布尔逻辑）────────────────────
 *   爻有气 = (长生状态 ∈ {长生,沐浴,冠带,临官,帝旺})
 *            ∧ (长生落点 ∉ 当旬空亡)
 *            ∧ (长生落点 ∉ 当旬孤辰)
 *   天时认可（真旺） = 爻有气 ∧ (爻地支 与四值发生冲/合)
 *
 * 另有三条修正（GE萃取2:4063-4095）：
 *   · 空亡整流：长生诀逢空 → 由旺变弱，判无气
 *   · 孤辰化零：临孤一律以弱论（孤 = 数理零）
 *   · 绝处逢生：**未采用**（RULE_PENDING，见正文说明：语料两处表述矛盾且依赖五行相生）
 *
 * ⚠⚠ 2026-09-12 T24 复核更正（本模块**不对外输出**，仅作内部数据节点）⚠⚠
 *   本模块此前对外的挂起理由「计算层全库 not-found + 主料禁止硬编码」**不准确**：
 *   1. 计算层**存在**：GE萃取2:3993-4135（源文件名《连山易气场强弱研判法则.md》）
 *      给出完整三步判定（审卦气 / 审爻位 / 天时认可）与 `:4129-4134` 的可编码布尔公式，
 *      且 `:4131` **明文许可**「可用以下布尔逻辑公式进行**高保真硬编码**」。
 *   2. 「禁止硬编码」的真实出处是 `01-书同课程…:4884`
 *      「十二符动盘仍未正式讲完，**有气/无气不能提前硬编码**」
 *      （另一处 `:4523-4525`）—— **不是** 01:2711-2737：
 *      `01:2711-2737` 的原话是「本课只建立语义层，**不建立完整计算算法**」。
 *   3. 三条**未裁冲突**（详见 docs/T24-natal.talismanQi-关闭评估.md）：
 *      ① **禁令冲突**：`01:4884` 禁止 vs `GE萃取2:4131` 许可，语料无裁决条款；
 *      ② **空孤时间锚语料内自相冲突**：`GE萃取2:3848`「空亡主要查**生年旬（年空）**」
 *         （六步法步骤二/三重申）vs 本模块所抄公式 `:4132` 的「**当旬**空亡 / 当旬孤辰」。
 *         ⇒ **本模块公式口径（当旬）与调用方传参口径（出生旬）不一致**，属混接，
 *           取值前必须由使用者裁决采哪一旬（不得由引擎推断）。
 *      ③ **计算对象不同一**：语料判「**六亲爻** × 其在**日月**中分布的十二长生诀」
 *         （`:4018`、`:4131`），本模块按**四柱天干**取值 —— 不是同一个量。
 *   4. 本模块**未实现**语料另给的机制：`:4081-4084` 无中生有、`:4093` 合而入墓、
 *      以及三步中的**第一步「审卦气（月令消息卦）」**（语料未给消息卦↔月令对照表）。
 *   → 结论：**不取值**（`natal.talismanQi` 恒为 null）。本模块保留为内部数据节点，
 *     严禁被生产渲染层调用（回归 R-P11 锁定）。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dict-core.js'), require('./core.js'));
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.changsheng = factory(root.LSY.data.core, root.LSY.engine.core);
  }
})(typeof self !== 'undefined' ? self : this, function (D, C) {
  'use strict';

  var ZHI = D.ZHI;
  var STAGES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
  var YOUQI_STAGES = ['长生', '沐浴', '冠带', '临官', '帝旺'];
  var WUQI_STAGES = ['衰', '病', '死', '墓', '绝', '胎', '养'];

  // 走势（主料 05:210-219 逐干标注）
  var CLOCKWISE = { 甲: 1, 乙: -1, 丙: 1, 丁: -1, 戊: 1, 己: -1, 庚: 1, 辛: -1, 壬: 1, 癸: -1 };

  /** 十二长生：天干 → { 阶段: 地支 } */
  function seqOf(gan) {
    var anchors = D.CHANG_WANG_MU[gan];
    if (!anchors) return null;
    var dir = CLOCKWISE[gan] || 1;
    var start = ZHI.indexOf(anchors[0]);      // 长生
    var out = {};
    for (var i = 0; i < 12; i++) {
      out[STAGES[i]] = ZHI[((start + dir * i) % 12 + 12) % 12];
    }
    return out;
  }

  /** 反查：天干 + 某地支 → 该地支在此干的长生阶段 */
  function stageOf(gan, zhi) {
    var seq = seqOf(gan);
    if (!seq) return null;
    for (var i = 0; i < STAGES.length; i++) {
      if (seq[STAGES[i]] === zhi) return STAGES[i];
    }
    return null;
  }

  /** 十二长生全表（10 干开根，供 UI/规则页展示） */
  var TABLE = (function () {
    var t = {};
    Object.keys(D.CHANG_WANG_MU).forEach(function (g) { t[g] = seqOf(g); });
    return t;
  })();

  /**
   * 有气 / 无气判定
   * @param {string} gan      要判定的天干（如某柱天干）
   * @param {object} xunRow   { kong: [...], gu: [...] } 该轨所用六甲旬的空孤
   *   ⚠ **口径未裁**：语料公式（GE萃取2:4132）写「**当旬**空亡 / 当旬孤辰」，
   *     而语料另一处（GE萃取2:3848）明文「空亡主要查**生年旬（年空）**」。
   *     本模块**不猜**：由调用方显式传入，并在调用处记录所采口径。
   *     ⛔ 本模块当前**无生产调用点**（仅回归脚本调用），严禁接入渲染层。
   * @returns {object}
   */
  function evaluate(gan, xunRow) {
    var seq = seqOf(gan);
    if (!seq) return null;

    var kong = (xunRow && xunRow.kong) || [];
    var gu = (xunRow && xunRow.gu) || [];

    // 本干长生（有气起点）与绝（真空地带）两处落点
    var csBranch = seq['长生'];    // 第 1 阶段 → 有气
    var jueBranch = seq['绝'];     // 第 10 阶段 → 无气

    var csInYouQi = YOUQI_STAGES.indexOf('长生') >= 0;     // 恒真：长生属有气区间
    var csVoid = kong.indexOf(csBranch) >= 0;
    var csLonely = gu.indexOf(csBranch) >= 0;

    // ── 绝处逢生：**未采用**（RULE_PENDING）
    //   ⚠ 使用者裁决 2026-09-12：**连山易没有五行相生、相克的理论，不得混淆。**
    //     而语料中「绝处逢生」的两处表述**均建立在五行相生之上**，且互相矛盾：
    //       · GE萃取2:4095「申金绝在巳，巳火生申金」→ 火克金，此说与五行相克冲突
    //       · GE萃取2:1364「木绝在申，若申得水生，则申不为绝」（另一机制：得生我者）
    //       · GE萃取2:1367 同一张表内自相矛盾：
    //           「巳属火，火虽绝水，但巳火可生土。土绝于巳，但巳生土有救」
    //           —— 土既「绝于巳」又「生于巳」，同格互斥
    //     原文按字面实现时，十天干的绝位**无一触发**（该逻辑等价于死代码）。
    //   → 依裁决**整段移除**，本字段标为 RULE_PENDING，不输出取值，
    //     亦不以五行生克兜底。若日后取得不依赖五行生克的判定口径，再行接入。
    var rescue = { applies: false, note: '', rule_pending: true,
      rule_id: 'LSY-LWM-JUE',
      reason: '连山易不用五行生克；语料两处表述互相矛盾，无法在不引入五行相生的前提下判定' };

    // 基线：长生本属有气区间；但空亡整流 / 孤辰化零 会把它打掉
    var base = csInYouQi && !csVoid && !csLonely;
    var hasQi = base || rescue.applies;

    var reasons = [];
    if (csVoid) reasons.push('长生位「' + csBranch + '」落当旬空亡 → 由旺变弱（空亡整流）');
    if (csLonely) reasons.push('长生位「' + csBranch + '」临孤辰 → 数理化零（孤辰化零）');
    if (rescue.applies) reasons.push('绝处逢生：' + rescue.note);
    if (!reasons.length) reasons.push('长生位「' + csBranch + '」不落空孤，落于有气区间');

    return {
      gan: gan,
      changShengBranch: csBranch,
      jueBranch: jueBranch,
      seq: seq,
      inYouQiRange: csInYouQi,
      changShengVoid: csVoid,
      changShengLonely: csLonely,
      rescue: rescue,
      hasQi: hasQi,
      label: hasQi ? '有气' : '无气',
      reasons: reasons,
      status: (csVoid || csLonely || rescue.applies) ? 'conditional' : 'derived_candidate'
    };
  }

  /**
   * 天时认可度：爻地支是否与四值（年月日时）发生六冲或六合
   * @param {string} zhi     待判地支
   * @param {Array}  fourZhi 四值地支数组
   */
  function fourValuesRecognized(zhi, fourZhi) {
    var hits = [];
    (fourZhi || []).forEach(function (f) {
      if (!f) return;
      var isChong = D.ZHI_CHONG_PAIRS.some(function (p) {
        return (p[0] === zhi && p[1] === f) || (p[1] === zhi && p[0] === f);
      });
      var isHe = D.ZHI_HE_PAIRS.some(function (p) {
        return (p[0] === zhi && p[1] === f) || (p[1] === zhi && p[0] === f);
      });
      if (isChong) hits.push({ type: '冲', with: f });
      if (isHe) hits.push({ type: '合', with: f });
    });
    return { recognized: hits.length > 0, hits: hits };
  }

  /**
   * 值符阵营（四利 / 中性 / 四避）
   * 主源 GE萃取2:3340+ 十二值符气场阵营
   */
  var STAR_CAMP = {
    值符: '四利', 太阴: '四利', 福德: '四利', 龙德: '四利',
    太阳: '中性', 官符: '中性', 破碎: '中性', 吊客: '中性',
    伤符: '四避', 死符: '四避', 白虎: '四避', 病符: '四避'
  };

  return {
    STAGES: STAGES,
    YOUQI_STAGES: YOUQI_STAGES,
    WUQI_STAGES: WUQI_STAGES,
    STAR_CAMP: STAR_CAMP,
    CLOCKWISE: CLOCKWISE,
    seqOf: seqOf,
    stageOf: stageOf,
    TABLE: TABLE,
    evaluate: evaluate,
    fourValuesRecognized: fourValuesRecognized,
    meta: {
      ruleId: 'LSY-TALISMAN-QI',
      status: 'conditional',
      sources: [
        'GE萃取2-260908 X.md:3998-4062',
        'GE萃取2-260908 X.md:4063-4095',
        'GE萃取2-260908 X.md:4112-4136',
        'GE萃取2-260908 X.md:3848',
        '05-连山易知识卡片_清洗.md:208-220',
        '01-书同课程-35P录音稿清洗-260831 √.md:4884'
      ],
      note: '有气/无气语义与三步判定来自 GE萃取2；十二长生完整落点表语料未直接给出，'
        + '本实现由主料 05:208-220 的三锚点（长生/旺处/墓处）+ 阳顺阴逆走势推导，'
        + '推导自洽性已验证（帝旺与墓落点 10/10 命中）。'
        + '⚠ GE萃取2:4112-4127 的「二十长生母表」阴干长生位有误且存在帝旺=墓的几何矛盾，不采信。'
        + '⚠ 「绝处逢生」规则存疑：GE萃取2:4095 举「申金绝在巳，巳火生申金」为例，'
        + '但火不生于金，该例与五行相生矛盾；按字面实现后，十天干的绝位**无一触发**该规则。'
        + '故本工具保留实现但如实标注不触发，不据此改判吉凶。'
        + '⚠ 2026-09-12 T24 复核更正：挂起理由**不是**「计算层 not-found」——'
        + 'GE萃取2:3993-4135 确有可编码公式且 :4131 明文许可硬编码。'
        + '真实阻断点为三条：① 01:4884「不能提前硬编码」与 :4131 许可互斥；'
        + '② 空孤时间锚语料内互斥（:3848 生年旬 vs :4132 当旬），公式口径与传参口径不一致；'
        + '③ 计算对象不同一（语料＝六亲爻×日月长生诀，本模块＝四柱天干）。'
        + '另未实现 :4081-4084 无中生有、:4093 合而入墓、三步之第一步审卦气。'
        + '有气/无气**不在参考图排盘页展示**，属解释层与后续场景（财富/健康）使用。'
        + '详见 docs/T24-natal.talismanQi-关闭评估.md。'
    }
  };
});
