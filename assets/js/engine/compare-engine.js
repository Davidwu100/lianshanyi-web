/*!
 * 连山易 · 双档案对比引擎（compare-engine.js）
 * ---------------------------------------------------------------------------
 * 用途：把两份 chartData 拉平成「可比字段表」，逐项标注 同/异/缺失。
 *
 * 设计约束（严格遵守 PRD 与知识库契约）：
 *   1. 只做**并列与差异呈现**，不做吉凶比较、不排序、不打分
 *   2. 任一侧字段为 RULE_PENDING 时，该行标「待确认」而非参与比对
 *   3. 缺时辰导致阻断了字段的，两侧都标阻断，不判「不同」
 *   4. 差异只陈述「取值不同」，不推断谁优谁劣
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.compare = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POS = ['time', 'day', 'month', 'year'];
  var POS_CN = { time: '时', day: '日', month: '月', year: '年' };

  function byPos(pillars, p) {
    return pillars.filter(function (x) { return x.pos === p; })[0] || null;
  }
  function pick(f) {
    if (!f) return { status: 'MISSING', value: null };
    return { status: f.field_status || 'RULE_PENDING', value: f.value === undefined ? null : f.value };
  }
  /** 值的可读化（数组 → 字符串） */
  function fmt(v) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.join('');
    if (typeof v === 'object') {
      if (v.xun) return v.xun;
      return JSON.stringify(v);
    }
    return String(v);
  }

  /**
   * 生成一行对比。
   * @returns {object} { group, label, a, b, verdict }
   *   verdict: 'same' | 'diff' | 'pending' | 'blocked' | 'missing'
   */
  function row(group, label, fa, fb, opt) {
    opt = opt || {};
    var A = pick(fa), B = pick(fb);
    var va = fmt(opt.rawA !== undefined ? opt.rawA : A.value);
    var vb = fmt(opt.rawB !== undefined ? opt.rawB : B.value);

    // 任一为待确认 → 不参与比对
    if (A.status === 'RULE_PENDING' || B.status === 'RULE_PENDING') {
      return { group: group, label: label, a: va, b: vb, verdict: 'pending',
        note: '至少一侧为「待确认」字段，不参与比对' };
    }
    if (A.status === 'MISSING' || B.status === 'MISSING') {
      return { group: group, label: label, a: va, b: vb, verdict: 'missing',
        note: '档案数据缺失' };
    }
    if (va === null || vb === null) {
      // 常见于缺时辰导致的时柱阻断
      return { group: group, label: label, a: va, b: vb, verdict: 'blocked',
        note: '至少一侧因输入缺失而阻断（如缺时辰）' };
    }
    return {
      group: group, label: label, a: va, b: vb,
      verdict: (va === vb) ? 'same' : 'diff',
      statusA: A.status, statusB: B.status
    };
  }

  /**
   * @param {object} ca  chartData A
   * @param {object} cb  chartData B
   * @param {object} metaA { name, rawInput }
   * @param {object} metaB
   */
  function compare(ca, cb, metaA, metaB) {
    metaA = metaA || {}; metaB = metaB || {};
    var rows = [];

    // ---------------------------------------------------------- 基础信息
    var G = '基础信息';
    rows.push(row(G, '出生日期',
      { field_status: 'confirmed', value: dateStr(metaA) },
      { field_status: 'confirmed', value: dateStr(metaB) }));
    rows.push(row(G, '时辰',
      { field_status: 'confirmed', value: timeStr(metaA) },
      { field_status: 'confirmed', value: timeStr(metaB) }));
    rows.push(row(G, '性别',
      { field_status: 'confirmed', value: (ca.rawInput.gender || '—') },
      { field_status: 'confirmed', value: (cb.rawInput.gender || '—') }));
    rows.push(row(G, '公历',
      { field_status: 'confirmed', value: ca.calendarData.solar.text },
      { field_status: 'confirmed', value: cb.calendarData.solar.text }));
    rows.push(row(G, '农历',
      { field_status: 'confirmed', value: ca.calendarData.lunar.text },
      { field_status: 'confirmed', value: cb.calendarData.lunar.text }));
    rows.push(row(G, '生肖',
      { field_status: 'confirmed', value: ca.calendarData.lunar.shengxiao },
      { field_status: 'confirmed', value: cb.calendarData.lunar.shengxiao }));
    rows.push(row(G, '节气',
      { field_status: 'confirmed', value: jieqiStr(ca) },
      { field_status: 'confirmed', value: jieqiStr(cb) }));

    // ---------------------------------------------------------- 四柱爻位
    G = '四柱';
    POS.forEach(function (p) {
      var a = byPos(ca.natalBase.pillars, p), b = byPos(cb.natalBase.pillars, p);
      rows.push(row(G, POS_CN[p] + '柱',
        a ? { field_status: 'confirmed', value: a.gz || null } : null,
        b ? { field_status: 'confirmed', value: b.gz || null } : null));
      rows.push(row(G, POS_CN[p] + '柱 旬头',
        a && a.xun_f, b && b.xun_f));
      rows.push(row(G, POS_CN[p] + '柱 爻位',
        a && a.yao_f, b && b.yao_f));
      rows.push(row(G, POS_CN[p] + '柱 长旺墓',
        a && a.changWangMu_f, b && b.changWangMu_f));
      rows.push(row(G, POS_CN[p] + '柱 宫煞|霞煞',
        a && a.gongSha_f, b && b.gongSha_f,
        { rawA: a ? (a.gongSha_f.value || '-') + '|' + (a.xiaSha_f.value || '-') : null,
          rawB: b ? (b.gongSha_f.value || '-') + '|' + (b.xiaSha_f.value || '-') : null }));
      rows.push(row(G, POS_CN[p] + '柱 天赋支',
        a && a.tianFu_f, b && b.tianFu_f));
      rows.push(row(G, POS_CN[p] + '柱 本命静符',
        a && a.talismanStatic_f, b && b.talismanStatic_f));
    });

    // ---------------------------------------------------------- 空孤双轨
    G = '空亡孤（双轨）';
    rows.push(row(G, '公处轨 旬（年柱旬）',
      ca.natalBase.xunTracks.year, cb.natalBase.xunTracks.year));
    rows.push(row(G, '私处轨 旬（日柱旬）',
      ca.natalBase.xunTracks.day, cb.natalBase.xunTracks.day));
    rows.push(row(G, '空亡（日柱旬）',
      { field_status: 'confirmed', value: ca.natalBase.kongGuColumn.kong },
      { field_status: 'confirmed', value: cb.natalBase.kongGuColumn.kong }));
    rows.push(row(G, '孤（日柱旬）',
      { field_status: 'confirmed', value: ca.natalBase.kongGuColumn.gu },
      { field_status: 'confirmed', value: cb.natalBase.kongGuColumn.gu }));
    rows.push(row(G, '日自空（私处轨）',
      ca.natalBase.daySelfKong, cb.natalBase.daySelfKong,
      { rawA: (ca.natalBase.daySelfKong.value.kong || []).join(''),
        rawB: (cb.natalBase.daySelfKong.value.kong || []).join('') }));

    // ---------------------------------------------------------- 四季
    G = '四季';
    ['春', '夏', '秋', '冬'].forEach(function (s) {
      var va = seasonOf(ca, s), vb = seasonOf(cb, s);
      rows.push(row(G, s,
        { field_status: va.length ? 'confirmed' : 'RULE_PENDING', value: va.length ? va.join('') : null },
        { field_status: vb.length ? 'confirmed' : 'RULE_PENDING', value: vb.length ? vb.join('') : null }));
    });
    rows.push(row(G, '四柱偏阴偏阳',
      { field_status: 'confirmed', value: yyStr(ca) },
      { field_status: 'confirmed', value: yyStr(cb) }));

    // ---------------------------------------------------------- 十二值符大运首行
    G = '十二值符大运';
    var ta = ca.view.talismanTable.rows[0], tb = cb.view.talismanTable.rows[0];
    rows.push(row(G, '首行旬',
      { field_status: 'conditional', value: ta.xun },
      { field_status: 'conditional', value: tb.xun }));
    rows.push(row(G, '首行年龄',
      { field_status: 'conditional', value: ta.age },
      { field_status: 'conditional', value: tb.age }));

    // ---------------------------------------------------------- 时间层（共享，按测算年）
    G = '时间层（共享 · 按测算年）';
    var da = ca.dynamicTransit, db = cb.dynamicTransit;
    rows.push(row(G, '测算年',
      { field_status: 'confirmed', value: da.targetYear },
      { field_status: 'confirmed', value: db.targetYear }));
    // 使用者裁决 2026-09-12：取消「大元 / 正元」（语料 8 处否认其为连山易概念），
    //   改为正宗层级「三元九运 → 六甲流旬」。
    //   ⚠ 差异页只呈现**差异项**，故两项一致时不输出该行。
    {
      var SYc = (typeof window !== 'undefined' && window.LSY && window.LSY.engine
        && window.LSY.engine.sanyuan)
        || (typeof require === 'function' ? require('./sanyuan-jiuyun.js') : null);
      if (SYc) {
        var yl = function (t) {
          var i = SYc.yunIndexOf(t.targetYear);
          return SYc.yuanLabelOfYun(i) + '元' + SYc.YUN_NAME[i - 1];
        };
        rows.push(row(G, '所属三元九运',
          { field_status: 'confirmed', value: yl(da) },
          { field_status: 'confirmed', value: yl(db) }));
      }
    }
    rows.push(row(G, '所属元运',
      { field_status: 'confirmed', value: (function () { var c = da.yun.cells.filter(function (x) { return x.isCurrent; })[0]; return c.year + ' ' + c.gz + ' 运' + c.yunIndex; })() },
      { field_status: 'confirmed', value: (function () { var c = db.yun.cells.filter(function (x) { return x.isCurrent; })[0]; return c.year + ' ' + c.gz + ' 运' + c.yunIndex; })() }));
    rows.push(row(G, '所属六甲旬',
      { field_status: 'confirmed', value: (function () { var c = da.xun.cells.filter(function (x) { return x.isCurrent; })[0]; return c.year + ' ' + c.head; })() },
      { field_status: 'confirmed', value: (function () { var c = db.xun.cells.filter(function (x) { return x.isCurrent; })[0]; return c.year + ' ' + c.head; })() }));

    // ---------------------------------------------------------- 卦象
    G = '本命卦';
    var ga = ca.scenarioDerived.gua && ca.scenarioDerived.gua.natal;
    var gb = cb.scenarioDerived.gua && cb.scenarioDerived.gua.natal;
    rows.push(row(G, '卦名',
      ga ? { field_status: ga.nameSource === 'external' ? 'external' : 'RULE_PENDING', value: ga.fullName } : null,
      gb ? { field_status: gb.nameSource === 'external' ? 'external' : 'RULE_PENDING', value: gb.fullName } : null));
    rows.push(row(G, '周易序号',
      ga ? { field_status: ga.no ? 'external' : 'RULE_PENDING', value: ga.no } : null,
      gb ? { field_status: gb.no ? 'external' : 'RULE_PENDING', value: gb.no } : null));
    rows.push(row(G, '宫位',
      ga && ga.gong ? { field_status: 'conditional', value: ga.gong.label } : null,
      gb && gb.gong ? { field_status: 'conditional', value: gb.gong.label } : null));
    rows.push(row(G, '动爻',
      ga ? { field_status: 'conditional', value: ga.dongYao } : null,
      gb ? { field_status: 'conditional', value: gb.dongYao } : null));
    rows.push(row(G, '变卦',
      ga && ga.bian ? { field_status: 'conditional', value: ga.bian.fullName } : null,
      gb && gb.bian ? { field_status: 'conditional', value: gb.bian.fullName } : null));

    // ---------------------------------------------------------- 汇总
    var counts = { same: 0, diff: 0, pending: 0, blocked: 0, missing: 0 };
    rows.forEach(function (r) { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });

    return {
      nameA: metaA.name || '档案 A',
      nameB: metaB.name || '档案 B',
      rows: rows,
      counts: counts,
      groups: rows.reduce(function (acc, r) {
        if (acc.indexOf(r.group) < 0) acc.push(r.group);
        return acc;
      }, []),
      disclaimer: '本页只呈现两份命盘的**字段并列与取值差异**，不做吉凶比较、不排序、不打分。'
        + '标注为「待确认」的字段不参与比对；因输入缺失而阻断的字段不判为「不同」。'
    };
  }

  // ---------------------------------------------------------------- 小工具
  function dateStr(m) {
    var r = m.rawInput || {};
    var b = r.birthDate || { year: r.year, month: r.month, day: r.day };
    if (!b.year) return '—';
    var p = function (n) { var s = String(n); return s.length < 2 ? '0' + s : s; };
    return b.year + '-' + p(b.month) + '-' + p(b.day);
  }
  function timeStr(m) {
    var r = m.rawInput || {};
    var t = r.birthTime || (r.hour !== undefined && r.hour !== null
      ? { hour: r.hour, minute: r.minute || 0 } : null);
    if (!t) return '缺时辰';
    var p = function (n) { var s = String(n); return s.length < 2 ? '0' + s : s; };
    return p(t.hour) + ':' + p(t.minute);
  }
  function jieqiStr(cd) {
    var j = cd.calendarData.jieqi;
    if (!j.prev) return '—';
    return j.prev.prevName + ' 第' + j.prev.dayInTerm + '天'
      + (j.next ? '，距 ' + j.next.name + ' ' + j.next.daysToNext + '天' : '');
  }
  function seasonOf(cd, s) {
    var dom = cd.natalBase.pillars
      .filter(function (p) { return p.gz; })
      .map(function (p) { return p.ganSeason_f.value; });
    return dom.filter(function (x) { return x === s; });
  }
  function yyStr(cd) {
    var a = cd.view.annotation.counts;
    if (a.yang > a.yin) return '偏阳（阳' + a.yang + '阴' + a.yin + '）';
    if (a.yin > a.yang) return '偏阴（阳' + a.yang + '阴' + a.yin + '）';
    return '阴阳各半（阳' + a.yang + '阴' + a.yin + '）';
  }

  return { compare: compare, row: row };
});
