/*!
 * 连山易 · 四大局与局态判定（formations.js）
 * ---------------------------------------------------------------------------
 * 依据（语料 S3-连山易局态判定规则与算法建模.md，G09/G10 级底层分类规则）
 *   9-11  成局（完整局中人）：四柱地支**去重后**，某四大局的「长生·旺处·墓库」
 *         三个地支**全部齐备**。全体系共 4 种成局。
 *   10-11 半局（残缺局中人）：去重后某局**具备两个、严格缺失一个**。
 *         全体系**有且仅有 12 种半局**（四局各派生 3）。成局与半局统称「局中人」。
 *   11    局外人（不成局者）：既不成局也不成半局。
 *   12    去重硬规则：判定局态时地支严格执行 **Set 语义**——
 *         重复地支（如「亥未未」「两寅+一午」）**忽略不计，只当一个算**。
 *   74-75 **发现的知识冲突：暂未发现**（成局、半局、局外人的定义在所有源讲义与
 *         教材中 100% 保持一致）。
 *
 * ⚠ 重要更正（使用者 2026-09-12 指路后）
 *   本项目早先在 GE萃取2 精读时把「半局」列为**三重矛盾**（是否承认地支半三合 /
 *   构成定义不同集合 / 地位不同）。本批资料澄清：
 *     · 连山易**不讨论「地支半三合」**（申子半合、寅午半合之类 —— 那是后世三合派概念）；
 *     · 但**明确使用「半局」** —— 特指**四大局缺一字**（如「亥卯」缺「未」）。
 *   二者是不同东西，故原「矛盾」实为**同名异指**，本模块采用后者（四大局缺一字）。
 *
 *   16-23 四大局（连山局名 / 长生 / 旺处 / 墓库）
 *     申子辰 · 智谋局（水/水土局）· 申 · 子 · 辰
 *     寅午戌 · 文采局（火局）    · 寅 · 午 · 戌
 *     巳酉丑 · 贵重局/金钱局（金局）· 巳 · 酉 · 丑
 *     亥卯未 · 权柄局（木局）    · 亥 · 卯 · 未
 *
 *   44-45 多组半局并存：依当前六甲流旬大天时，**优先激活得天时生扶的那一组**。
 *         ⚠ 若两组半局与天时同等强度干涉，讲义**未给数值加权公式** →
 *           本模块只列出全部候选并标 RULE_PENDING，**不擅自定主局**。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.formations = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 四大局（S3:19-23）
  var BUREAUS = [
    { ju: ['申', '子', '辰'], name: '智谋局', wuxing: '水/水土', chang: '申', wang: '子', mu: '辰' },
    { ju: ['寅', '午', '戌'], name: '文采局', wuxing: '火', chang: '寅', wang: '午', mu: '戌' },
    { ju: ['巳', '酉', '丑'], name: '贵重局/金钱局', wuxing: '金', chang: '巳', wang: '酉', mu: '丑' },
    { ju: ['亥', '卯', '未'], name: '权柄局', wuxing: '木', chang: '亥', wang: '卯', mu: '未' }
  ];

  /** 地支四柱去重（Set 语义，S3:12） */
  function uniq(branches) {
    var seen = {}, out = [];
    (branches || []).forEach(function (z) {
      if (z && !seen[z]) { seen[z] = 1; out.push(z); }
    });
    return out;
  }

  /**
   * 局态判定
   * @param {Array<string>} branches 四柱地支（可含重复）
   * @returns {Object} { status:'成局'|'半局'|'局外人', unique, cheng:[], ban:[], missing:[], note }
   */
  function classify(branches) {
    var u = uniq(branches);
    var cheng = [], ban = [], missing = [];
    BUREAUS.forEach(function (b) {
      var hit = b.ju.filter(function (z) { return u.indexOf(z) >= 0; });
      if (hit.length === 3) {
        cheng.push({ name: b.name, wuxing: b.wuxing, ju: b.ju.slice(), chang: b.chang, wang: b.wang, mu: b.mu });
      } else if (hit.length === 2) {
        var miss = b.ju.filter(function (z) { return u.indexOf(z) < 0; })[0];
        ban.push({ name: b.name, wuxing: b.wuxing, ju: b.ju.slice(), have: hit, miss: miss });
        missing.push(miss);
      }
    });
    var status = cheng.length ? '成局' : (ban.length ? '半局' : '局外人');
    var note = null;
    if (ban.length > 1) {
      // S3:44-45 多组半局并存：依当天时优先激活得天时生扶者；同等强度时无加权公式
      note = '去重后同时含 ' + ban.length + ' 组半局（'
        + ban.map(function (x) { return x.have.join('') + '缺' + x.miss; }).join('、')
        + '）。语料 44-45：依当前六甲流旬优先激活得天时生扶的一组；'
        + '⚠ 若与天时同等强度干涉，讲义未给数值加权公式 → 不擅自定主局，全部列出。';
    }
    return {
      status: status,
      unique: u,
      cheng: cheng, ban: ban,
      missing: missing,
      multiBan: ban.length > 1,
      note: note
    };
  }

  return {
    BUREAUS: BUREAUS,
    uniq: uniq,
    classify: classify,
    _status: 'confirmed',
    _sources: [
      'S3-连山易局态判定规则与算法建模.md:9-12（成局/半局/局外人定义 + 去重硬规则）',
      'S3-连山易局态判定规则与算法建模.md:19-23（四大局长生旺处墓库映射表）',
      'S3-连山易局态判定规则与算法建模.md:30-34（12 种半局派生全表）',
      'S3-连山易局态判定规则与算法建模.md:44-45（多组半局的天时优先级与缺口）',
      'S3-连山易局态判定规则与算法建模.md:74-75（★ 冲突核查结论：定义 100% 一致）'
    ],
    _note: '⚠ 本项目早先把「半局」误列为三重矛盾（GE萃取2 精读）。本批资料澄清：'
      + '连山易不讨论「地支半三合」（后世三合派概念），但明确使用「半局」= 四大局缺一字。'
      + '二者同名异指，本模块采用后者。语料 74-75 明言「成局/半局/局外人定义 100% 一致」。'
  };
});
