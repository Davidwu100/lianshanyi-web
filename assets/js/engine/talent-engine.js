/*!
 * 连山易 · 性格与天赋受控输出（talent-engine.js）
 * ---------------------------------------------------------------------------
 * 严格按《场景资产/MVP与后续场景边界.md》的统一输出结构：
 *   当前问题 → 重点分析入口 → 已确认依据 → 条件性倾向 → 可能优势
 *   → 可能风险 → 现实行动建议 → 待补资料 / RULE_PENDING → 安全边界
 *
 * 路由（KB-MVP-001 / LSY-TALENT-003）：
 *   性格问题 → 日柱为第一入口，月柱参考
 *   事业问题 → 月柱为第一入口，日柱校正
 *
 * 硬约束：
 *   - 不做百分制 / 概率 / Top-N 排序 / 加权求和（CONFLICT-005）
 *   - 不做心理诊断；统一用「课程类象 · 倾向 · 现实验证建议」（KB-MVP-005）
 *   - 同一特点正负两面并存，不用一句标签盖掉另一面（LSY-TALENT-006）
 *   - 缺时辰不得猜；依赖时支的模块阻断（LSY-TALENT-007）
 *   - 只给 3—5 个真正重要的判断（PRD 第十一节）
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./dict-core.js'),
      require('./dict-talent.js'),
      require('./core.js')
    );
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.talent = factory(root.LSY.data.core, root.LSY.data.talent, root.LSY.engine.core);
  }
})(typeof self !== 'undefined' ? self : this, function (D, T, C) {
  'use strict';

  var SAFETY = '仅作传统标注，不构成吉凶结论';

  function meta(ruleId) { return D.meta[ruleId] || {}; }
  function fld(value, fieldId, ruleId, status, policy) {
    var m = meta(ruleId);
    return {
      value: value,
      field_id: fieldId,
      field_status: status || m.status || 'conditional',
      rule_id: ruleId || null,
      source_refs: m.sources || [],
      depends_on: [],
      exception_policy: policy || m.note || '',
      interpretation_type: 'traditional_course',
      safety_boundary: T.OUT_GATE.note,
      conflict_id: m.conflictId || null
    };
  }
  function cw(list) { return (list && list.length) ? list.join('、') : '—'; }

  /**
   * @param {object} chartData  chart-engine 产出的 chartData
   * @param {object} question   { text, type } 用户当前问题（可为空）
   */
  function analyze(chartData, question) {
    var q = question || {};
    var qType = routeQuestion(q.text || '');
    var ps = {};
    chartData.natalBase.pillars.forEach(function (p) { ps[p.pos] = p; });

    var hasTime = !!ps.time.gz;
    var dayGan = ps.day.gan, dayZhi = ps.day.zhi;
    var monthGan = ps.month.gan;

    // ---------------------------------------------------- 重点分析入口
    var primary, supporting, routeNote;
    if (qType === 'career') {
      primary = ps.month; supporting = ps.day;
      routeNote = '事业/平台场景以月柱为第一观察入口，日柱作个人行为与能力校正。'
        + '这是路由顺序，不代表固定权重。';
    } else {
      primary = ps.day; supporting = ps.month;
      routeNote = '性格/行为场景以日柱为第一观察入口，月柱参考。源文亦允许在时辰未知时先从日柱辅助理解。';
    }

    // ---------------------------------------------------- 已确认依据
    var evidence = buildEvidence(ps, primary, supporting);

    // ---------------------------------------------------- 条件性倾向
    var tendencies = buildTendencies(dayGan, dayZhi, monthGan, ps, hasTime);

    // ---------------------------------------------------- 可能优势 / 风险
    var strengths = [];
    var risks = [];
    tendencies.forEach(function (t) {
      if (t.profile && t.profile.tendency) {
        t.profile.tendency.forEach(function (x) { strengths.push({ text: x, from: t.label }); });
      }
      if (t.profile && t.profile.risk) {
        t.profile.risk.forEach(function (x) { risks.push({ text: x, from: t.label }); });
      }
    });

    // ---------------------------------------------------- 四季关系
    var season = buildSeason(ps, chartData);

    // ---------------------------------------------------- 行动建议（现实验证导向）
    var actions = buildActions(strengths, risks, season);

    // ---------------------------------------------------- 待补资料
    var pending = buildPending(chartData, hasTime);

    // ---------------------------------------------------- 核心判断（一句话，3—5 条要点）
    var core = buildCore(primary, tendencies, season, qType);

    return {
      scenario: 'talent',
      scenarioLabel: qType === 'career' ? '事业/平台倾向（受控）' : '性格与天赋',
      userQuestion: q.text || null,
      route: {
        questionType: qType,
        primaryPillar: primary.pos_cn,
        supportingPillar: supporting.pos_cn,
        note: routeNote,
        field: fld(qType, 'talent.route', 'KB-MVP-001')
      },
      core: core,
      evidence: evidence,
      tendencies: tendencies,
      season: season,
      strengths: dedup(strengths).slice(0, 6),
      risks: dedup(risks).slice(0, 6),
      actions: actions,
      pending: pending,
      safety: {
        isDiagnosis: false,
        isCareerConclusion: false,
        note: T.OUT_GATE.note,
        ruleId: T.OUT_GATE.ruleId,
        sources: T.OUT_GATE.sources
      },
      ruleHits: [
        'KB-MVP-001', 'KB-MVP-002', 'KB-MVP-005', 'LSY-TALENT-001', 'LSY-TALENT-002',
        'LSY-TALENT-003', 'LSY-TALENT-004', 'LSY-TALENT-006', 'LSY-TALENT-007'
      ]
    };
  }

  // ---------------------------------------------------- 问题路由
  var CAREER_KW = ['事业', '工作', '创业', '跳槽', '转行', '职业', '平台', '生意', '合伙', '升职', '老板', '岗位', '行业', '发展方向', '定位'];
  var MARRIAGE_KW = ['婚姻', '结婚', '离婚', '伴侣', '感情', '配偶', '夫妻'];
  function routeQuestion(text) {
    if (!text) return 'personality';
    var t = String(text);
    if (CAREER_KW.some(function (k) { return t.indexOf(k) >= 0; })) return 'career';
    if (MARRIAGE_KW.some(function (k) { return t.indexOf(k) >= 0; })) return 'marriage';
    return 'personality';
  }

  // ---------------------------------------------------- 已确认依据
  function buildEvidence(ps, primary, supporting) {
    var out = [];
    out.push({
      label: '四柱',
      text: ['year', 'month', 'day', 'time'].map(function (k) {
        return ps[k].pos_cn + ' ' + (ps[k].gz || '（缺）');
      }).join('　'),
      field: fld(null, 'talent.evidence.pillars', 'LSY-BASE-GANZHI', 'confirmed')
    });
    if (primary.gz) {
      out.push({
        label: '重点柱位',
        text: primary.pos_cn + '柱 ' + primary.gz + '（'
          + T.PILLAR_DOMAIN[primary.pos].scope.join(' · ') + '）',
        field: fld(primary.gz, 'talent.evidence.primary', 'LSY-TALENT-003')
      });
    }
    if (supporting.gz) {
      out.push({
        label: '校正柱位',
        text: supporting.pos_cn + '柱 ' + supporting.gz,
        field: fld(supporting.gz, 'talent.evidence.supporting', 'LSY-TALENT-004')
      });
    }
    // 月柱在事业场景是入口，此处说明
    out.push({
      label: '观察框架',
      text: '天干＝先天天赋本质与思想倾向；地支＝落地性格与为人处世行为。两层分开呈现，不混写为固定人格。',
      field: fld(null, 'talent.evidence.layering', 'LSY-TALENT-002',
        'conditional', '天干/地支解释分层由三份主料支持；柱位组合权重尚未验证。')
    });
    return out;
  }

  // ---------------------------------------------------- 条件性倾向
  function buildTendencies(dayGan, dayZhi, monthGan, ps, hasTime) {
    var out = [];
    // 日干 → 先天天赋本质
    out.push({
      layer: '天赋本质（天干）',
      from: '日柱天干 ' + dayGan,
      label: '日干 ' + dayGan,
      profile: T.GAN_PROFILE[dayGan] || null,
      field: fld(dayGan, 'talent.tendency.dayGan', 'LSY-TALENT-002')
    });
    // 月干 → 事业/平台的天赋侧
    if (monthGan && monthGan !== dayGan) {
      out.push({
        layer: '事业平台侧（天干）',
        from: '月柱天干 ' + monthGan,
        label: '月干 ' + monthGan,
        profile: T.GAN_PROFILE[monthGan] || null,
        field: fld(monthGan, 'talent.tendency.monthGan', 'LSY-TALENT-004')
      });
    }
    // 日支 → 落地行为（天赋支为连山易特有字段，但算法层 RULE_PENDING）
    out.push({
      layer: '落地行为（地支）',
      from: '日柱地支 ' + dayZhi,
      label: '日支 ' + dayZhi,
      behavior: T.ZHI_BEHAVIOR_PROFILE[dayZhi] || null,
      zhiAttr: D.ZHI_ATTR[dayZhi] || null,
      tianFu: (function () {
        var v = D.TIAN_FU[dayZhi];
        return v ? { branch: v, note: '「天赋支」字典：日支 ' + dayZhi + ' → ' + v + '。字典 itself 有主料支持（12/12）；但「天赋支→能力/职业」的换算规则未定义，故不作算子。' } : null;
      })(),
      field: (function () {
        var f = fld(dayZhi, 'talent.tendency.dayZhi', 'LSY-BASE-ZHIATTR-001', 'conditional',
          '地支为「落地性格与行为」层。十二地支类象在语料中多为传统类象，不作为人格诊断。');
        return f;
      })(),
      tianFuField: fld(D.TIAN_FU[dayZhi], 'talent.tendency.dayZhi.tianFu', 'LSY-TIANFU-001', 'conditional',
        '天赋支字典 12/12 confirmed；但「天赋支 → 能力/职业」换算规则未定义（LSY-TIANFU-002 RULE_PENDING）。本页只展示对应支，不产出能力结论。')
    });
    // 时柱（若有时辰）
    if (hasTime) {
      out.push({
        layer: '晚景/归宿侧（地支）',
        from: '时柱 ' + ps.time.gz,
        label: ps.time.gz,
        profile: null,
        reference: true,
        field: fld(ps.time.gz, 'talent.tendency.time', 'LSY-TALENT-001',
          'conditional', '时柱在性格场景仅为参考；源文未把时柱作为性格主入口。')
      });
    } else {
      out.push({
        layer: '时柱',
        from: '缺出生时辰',
        label: '未提供',
        profile: null,
        blocked: true,
        field: {
          value: null, field_id: 'talent.tendency.time', field_status: 'RULE_PENDING',
          rule_id: 'LSY-TALENT-007', source_refs: meta('LSY-TALENT-007').sources || [],
          depends_on: ['rawInput.birthTime'],
          exception_policy: '源文明确没有教授完整推时算法，产品不得在缺时辰时静默猜时柱。依赖时支的性格字段整体阻断。',
          interpretation_type: 'traditional_course', safety_boundary: SAFETY, conflict_id: null
        }
      });
    }
    return out;
  }

  // ---------------------------------------------------- 四季
  function buildSeason(ps, chartData) {
    // 天干季节：三口径分流，默认 04（= 参考图口径）
    var dom = '04';
    var dayGan = ps.day.gan, dayZhi = ps.day.zhi;
    var ganSeason = (D.GAN_SEASON_DOMAINS[dom] || {})[dayGan] || null;
    var zhiSeason = (D.ZHI_ATTR[dayZhi] || {}).season || null;

    var relation = null, relationKey = null;
    if (ganSeason && zhiSeason && ganSeason !== zhiSeason) {
      relationKey = ganSeason + zhiSeason;
      if (!T.SEASON_RELATION[relationKey]) relationKey = zhiSeason + ganSeason;
      relation = T.SEASON_RELATION[relationKey] || null;
    } else if (ganSeason && zhiSeason) {
      relation = '同季';
    }

    var conflict = meta('LSY-CONFLICT-015');
    return {
      ganSeason: ganSeason,
      zhiSeason: zhiSeason,
      domain: dom,
      sameSeason: ganSeason === zhiSeason,
      relation: relation,
      relationKey: relationKey,
      relationSemantics: relation && T.SEASON_RELATION_SEMANTICS[relation] ? T.SEASON_RELATION_SEMANTICS[relation] : null,
      ganProfile: ganSeason && T.SEASON_PROFILE[ganSeason] ? T.SEASON_PROFILE[ganSeason] : null,
      zhiProfile: zhiSeason && T.SEASON_PROFILE[zhiSeason] ? T.SEASON_PROFILE[zhiSeason] : null,
      field: {
        value: ganSeason + ' / ' + zhiSeason,
        field_id: 'talent.season',
        field_status: 'conditional',
        rule_id: 'LSY-CONFLICT-015',
        source_refs: (conflict.sources || []).concat(['02-阳阳领航初级-69P书籍清洗-260903 √.md:1427-1607']),
        depends_on: ['pillar.day.gan', 'pillar.day.zhi'],
        exception_policy: '天干四季存在三口径互斥：02 长夏戊己 / 04 戊冬己夏 / 03 戊己中宫。04 主料有明令禁止归一。'
          + '当前 domain=' + dom + '（参考图口径）。天干季节与地支季节不一致时必须提示待确认，不得默认选一层。',
        interpretation_type: 'traditional_course',
        safety_boundary: SAFETY,
        conflict_id: 'CONFLICT-015'
      },
      conflictNote: conflict.note
    };
  }

  // ---------------------------------------------------- 行动建议
  function buildActions(strengths, risks, season) {
    var out = [];
    out.push({
      title: '用现实反馈校准，而不是用标签定义自己',
      text: '本页内容来自课程类象。请在真实工作与关系中有意识地观察：'
        + '哪些描述反复被他人反馈印证，哪些并不成立。以现实验证为准。',
      from: '输出门槛 KB-MVP-005'
    });
    if (risks.length) {
      out.push({
        title: '对高频出现的限制项设定具体对策',
        text: '原文记录的限制倾向：' + cw(risks.slice(0, 3).map(function (r) { return r.text; }))
          + '。这些是「可能过度」的倾向，不是缺陷判定；建议为每一项配一个可执行的调节动作。',
        from: '同一特点正负两面并存（LSY-TALENT-006）'
      });
    }
    if (season && season.relation && season.relationSemantics) {
      out.push({
        title: '当前日柱呈「' + season.relation + '」，方法词是：' + season.relationSemantics.split('、')[0],
        text: '源文对「' + season.relation + '」的语义是：' + season.relationSemantics
          + '。源文举例主要看日、月之间关系，不能据此补齐完整算法。',
        from: '02-I04 顺季/跨季/逆季'
      });
    }
    if (season && !season.sameSeason) {
      out.push({
        title: '注意：天干季节与地支季节不一致',
        text: '天干为「' + season.ganSeason + '」，地支为「' + season.zhiSeason
          + '」。知识库要求此时必须提示待确认，不能默认选其中一层。建议两层都作为参考，以现实表现校准。',
        from: '02-I05 四季路由门控'
      });
    }
    return out;
  }

  // ---------------------------------------------------- 待补资料
  function buildPending(chartData, hasTime) {
    var out = [];
    if (!hasTime) {
      out.push({
        code: 'TIME_MISSING',
        text: '缺出生时辰 → 时柱、依赖时支的字段整体阻断。源文明确没有教授完整推时算法，产品不得猜测。',
        canSupply: ['出生时辰（时:分）'],
        ruleId: 'LSY-TALENT-007'
      });
    }
    out.push({
      code: 'WEIGHT_PENDING',
      text: '柱位组合权重、季节与干支的综合影响尚未完成验证 → 本页不做加权求和，也不给排序。',
      canSupply: ['专家确认的权重与可复现样例'],
      ruleId: 'CONFLICT-005'
    });
    out.push({
      code: 'TIANFU_ALGO_PENDING',
      text: '「天赋支 → 能力/职业」的换算规则在语料中未定义（原话「没有明确说明两者是否为同一套起法」），只展示对应支。',
      canSupply: ['天赋表与口诀的对应关系'],
      ruleId: 'LSY-TIANFU-002'
    });
    out.push({
      code: 'SEASON_CONFLICT',
      text: '天干四季三口径互斥（02 长夏戊己 / 04 戊冬己夏 / 03 戊己中宫），蒸馏库尚未登记该冲突。',
      canSupply: ['专家裁决统一口径'],
      ruleId: 'LSY-CONFLICT-015'
    });
    // 真太阳时：改用「是否已校正」而非「是否 RULE_PENDING」判定
    //   （2026-09 已由 truesolar.js + data/city-longitude.js 关闭该缺口；
    //     未校正的原因只会是「缺经度/地点无法解析」，不再是「算法缺失」）
    var tst = chartData.calendarData.trueSolarTime;
    if (tst && !(tst.value && tst.value.applied)) {
      out.push({
        code: 'TRUESOLAR_PENDING',
        text: '真太阳时未校正：未提供可解析的出生城市/经度，本次排盘的日柱、时柱按行政钟表时刻判定。',
        canSupply: ['出生城市名（如「杭州」）或经度数值（如 120.15）'],
        ruleId: 'LSY-CAL-TRUESOLAR'
      });
    }
    return out;
  }

  // ---------------------------------------------------- 核心判断
  function buildCore(primary, tendencies, season, qType) {
    var day = tendencies[0];
    var prof = day.profile || {};
    var items = [];
    if (prof.tendency && prof.tendency.length) {
      items.push('原文对「' + day.label + '」的倾向描述集中于：' + cw(prof.tendency.slice(0, 4)) + '。');
    }
    if (prof.risk && prof.risk.length) {
      items.push('同时记录的限制或过度倾向：' + cw(prof.risk.slice(0, 3)) + '。');
    }
    if (prof.symbol) {
      items.push('原文具象：' + prof.symbol + '。');
    }
    if (season && season.relation) {
      items.push('日柱天干属「' + season.ganSeason + '」、地支属「' + season.zhiSeason + '」，构成「' + season.relation + '」。');
    }
    return {
      headline: '以' + primary.pos_cn + '柱 ' + (primary.gz || '—') + ' 为第一入口的课程类象',
      points: items.slice(0, 5),
      disclaimer: '以上为传统课程类象与倾向描述，不是心理诊断，也不构成确定性人格结论。',
      field: fld(null, 'talent.core', 'KB-MVP-005', 'verified_as_boundary')
    };
  }

  function dedup(list) {
    var seen = {};
    return list.filter(function (x) {
      if (seen[x.text]) return false;
      seen[x.text] = true;
      return true;
    });
  }

  return {
    analyze: analyze,
    routeQuestion: routeQuestion,
    CAREER_KW: CAREER_KW
  };
});
