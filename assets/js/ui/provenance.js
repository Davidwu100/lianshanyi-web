/*!
 * 连山易 · 证据标注层（provenance.js）
 * ---------------------------------------------------------------------------
 * 职责：把 chartData 里每个字段携带的元数据，渲染成界面上的「候选角标 + 来源浮层」。
 *
 * 硬规则（来自知识库字段契约与 PRD）：
 *   1. field_status 只有 4 种：confirmed / conditional / RULE_PENDING / derived_candidate
 *   2. 角标颜色**只表示证据强度，绝不表示吉凶**
 *   3. RULE_PENDING 字段 value 必须为 null，界面不得显示伪造值
 *   4. 每个角标必须能点开看到 rule_id + source_refs(file:line) + exception_policy
 *
 * 「精简」模式只隐藏角标，**不隐藏规则页**（rules.html 永远可访问）。
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  // 知识库规则注册表的状态词表（见 规则与推演/规则注册表.md）
  //   candidate / conditional / verified_as_boundary / expert_confirmed / retired
  // 界面把「边界原则」按证据强度归到主料支持一档（两者都由源文明确支持），
  // 但保留独立标签，避免与「算法闭合的 confirmed」混淆。
  var STATUS_META = {
    confirmed: { label: '主料支持', cls: 'confirmed', short: '✓' },
    verified_as_boundary: { label: '边界原则', cls: 'confirmed', short: '✓' },
    conditional: { label: '条件性', cls: 'conditional', short: '?' },
    candidate: { label: '候选', cls: 'conditional', short: '?' },
    RULE_PENDING: { label: '待确认', cls: 'RULE_PENDING', short: '!' },
    derived_candidate: { label: '界面推导', cls: 'derived_candidate', short: '~' },
    external: { label: '非连山易来源', cls: 'external', short: '外' }
  };

  var mode = 'full';          // full | compact
  var registry = {};          // ruleId → meta（由 registerAll 注入）
  var sheetEl = null;

  function setMode(m) {
    mode = (m === 'compact') ? 'compact' : 'full';
    document.documentElement.setAttribute('data-provenance', mode);
  }
  function getMode() { return mode; }

  /** 注入规则表（chartData 收集到的所有 meta） */
  function registerAll(dictMeta) {
    registry = dictMeta || {};
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 给字段值加角标。
   * @param {*} text  要显示的文本（调用方负责；RULE_PENDING 时传 null/空）
   * @param {object} f 字段元数据对象（含 field_status / rule_id / source_refs / exception_policy）
   * @param {object} opt { size:'tiny'|'sm', extra:附加说明 }
   */
  function badge(text, f, opt) {
    opt = opt || {};
    if (!f) return esc(text);
    var st = f.field_status || 'RULE_PENDING';
    var sm = STATUS_META[st] || STATUS_META.RULE_PENDING;
    var isPending = (st === 'RULE_PENDING');

    // pending 且无值 → 显示占位而不是伪造值
    var shown = (text === null || text === undefined || text === '')
      ? (isPending ? '待确认' : '—')
      : text;

    var payload = encodeURIComponent(JSON.stringify({
      value: isPending ? null : shown,
      field_id: f.field_id || '',
      status: st,
      rule_id: f.rule_id || '',
      sources: f.source_refs || [],
      depends_on: f.depends_on || [],
      policy: f.exception_policy || '',
      itype: f.interpretation_type || '',
      safety: f.safety_boundary || '',
      conflict: f.conflict_id || null,
      extra: opt.extra || ''
    }));

    var cls = 'pv pv-' + sm.cls + (opt.size === 'tiny' ? ' pv-tiny' : '');
    return '<span class="' + cls + '" data-pv="' + payload + '">' + esc(shown) + '</span>';
  }

  /** 只输出角标（不包含值），用于值已单独渲染的场景 */
  function marker(f) {
    if (!f) return '';
    var st = f.field_status || 'RULE_PENDING';
    if (st === 'confirmed') return '';
    var sm = STATUS_META[st] || STATUS_META.RULE_PENDING;
    var payload = encodeURIComponent(JSON.stringify({
      value: null, field_id: f.field_id || '', status: st,
      rule_id: f.rule_id || '', sources: f.source_refs || [],
      depends_on: f.depends_on || [], policy: f.exception_policy || '',
      itype: f.interpretation_type || '', safety: f.safety_boundary || '',
      conflict: f.conflict_id || null, extra: ''
    }));
    return '<i class="pv-dot pv-dot-' + sm.cls + '" data-pv="' + payload + '" title="' + esc(sm.label) + '"></i>';
  }

  // ------------------------------------------------------------ 浮层
  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.className = 'pv-sheet';
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-hidden', 'true');
    sheetEl.innerHTML = '<div class="pv-sheet-inner"><button class="pv-close" aria-label="关闭">×</button><div class="pv-body"></div></div>';
    document.body.appendChild(sheetEl);
    sheetEl.addEventListener('click', function (e) {
      if (e.target === sheetEl || e.target.classList.contains('pv-close')) hideSheet();
    });
    return sheetEl;
  }

  function showSheet(data) {
    var el = ensureSheet();
    var sm = STATUS_META[data.status] || STATUS_META.RULE_PENDING;
    var src = (data.sources || []);
    var html = '';
    html += '<div class="pv-hd"><span class="pill ' + sm.cls + '">' + esc(sm.label) + '</span>'
      + '<code>' + esc(data.field_id || '-') + '</code></div>';
    html += '<dl class="pv-dl">';
    html += '<dt>取值</dt><dd>' + (data.value === null || data.value === '' ? '<span class="pv-null">待确认（不输出伪造值）</span>' : esc(String(data.value))) + '</dd>';
    html += '<dt>规则 ID</dt><dd>' + (data.rule_id ? '<code>' + esc(data.rule_id) + '</code>' : '<span class="pv-null">未注册</span>') + '</dd>';
    html += '<dt>来源</dt><dd>' + (src.length
      ? '<ul class="pv-src">' + src.map(function (s) { return '<li><code>' + esc(s) + '</code></li>'; }).join('') + '</ul>'
      : '<span class="pv-null">无来源记录</span>') + '</dd>';
    if (data.depends_on && data.depends_on.length) {
      html += '<dt>依赖</dt><dd>' + data.depends_on.map(function (s) { return '<code>' + esc(s) + '</code>'; }).join(' ') + '</dd>';
    }
    if (data.policy) html += '<dt>缺失/冲突策略</dt><dd>' + esc(data.policy) + '</dd>';
    if (data.itype) {
      var tmap = { computed: '计算值', traditional_course: '课程类象', case_only: '仅案例' };
      html += '<dt>解释类型</dt><dd>' + esc(tmap[data.itype] || data.itype) + '</dd>';
    }
    if (data.conflict) html += '<dt>冲突编号</dt><dd><code>' + esc(data.conflict) + '</code></dd>';
    if (data.safety) html += '<dt>安全边界</dt><dd>' + esc(data.safety) + '</dd>';
    if (data.extra) html += '<dt>备注</dt><dd>' + esc(data.extra) + '</dd>';
    html += '</dl>';
    if (data.status === 'external') {
      html += '<p class="pv-warn">本项来自《周易》/京房八宫等<b>非连山易来源</b>，仅作对照展示，不计入连山易规则体系。</p>';
    }
    if (data.status === 'RULE_PENDING') {
      html += '<p class="pv-warn">知识库未提供可执行算法或来源不足，网页<b>不得伪造结果</b>。此项需专家确认后才可升级。</p>';
    }
    el.querySelector('.pv-body').innerHTML = html;
    el.setAttribute('aria-hidden', 'false');
    el.classList.add('on');
  }
  function hideSheet() {
    if (!sheetEl) return;
    sheetEl.setAttribute('aria-hidden', 'true');
    sheetEl.classList.remove('on');
  }

  /** 全局事件委托：任何带 data-pv 的元素被点/悬浮即弹层 */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pv]');
      if (t) {
        e.preventDefault();
        try { showSheet(JSON.parse(decodeURIComponent(t.getAttribute('data-pv')))); } catch (err) { /* ignore */ }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideSheet();
    });
  }

  // ------------------------------------------------------------ 统计
  /** 统计一棵 chartData 里的字段状态分布 */
  function countStatuses(node, acc) {
    acc = acc || { confirmed: 0, conditional: 0, RULE_PENDING: 0, derived_candidate: 0 };
    if (!node || typeof node !== 'object') return acc;
    if (Array.isArray(node)) { node.forEach(function (x) { countStatuses(x, acc); }); return acc; }
    if (node.field_status && node.field_id) {
      if (acc[node.field_status] !== undefined) acc[node.field_status]++;
      return acc;
    }
    Object.keys(node).forEach(function (k) { countStatuses(node[k], acc); });
    return acc;
  }

  root.LSY = root.LSY || {};
  root.LSY.pv = {
    STATUS_META: STATUS_META,
    setMode: setMode, getMode: getMode,
    registerAll: registerAll,
    badge: badge, marker: marker,
    showSheet: showSheet, hideSheet: hideSheet,
    bindGlobal: bindGlobal,
    countStatuses: countStatuses,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : this);
