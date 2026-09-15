/*!
 * 连山易 · 底部导航（nav.js）
 * ---------------------------------------------------------------------------
 * 正式页面共用一套导航定义，避免各页复制粘贴产生不一致。
 * 用法：<nav class="tabbar" data-nav="chart"></nav>
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var PAGES = [
    { key: 'chart', label: '浏览命盘', href: 'chart.html' },
    { key: 'talent', label: '性格天赋', href: 'talent.html' },
    { key: 'rules', label: '规则状态', href: 'rules.html' },
    { key: 'compare', label: '对比回看', href: 'compare.html' },
    { key: 'archives', label: '过往记录', href: 'archives.html' }
  ];

  /**
   * 渲染导航。
   * @param {HTMLElement} el  目标 <nav>
   * @param {string} active   当前页 key
   * @param {Array} extra     额外按钮 [{label, act}]（如 chart 页的 导出数据/当前档案）
   */
  function render(el, active, extra) {
    if (!el) return;
    var html = PAGES.map(function (p) {
      var cls = (p.key === active) ? ' class="on"' : '';
      return '<a href="' + p.href + '"' + cls + '>' + p.label + '</a>';
    }).join('');
    if (extra && extra.length) {
      html += extra.map(function (b) {
        return '<button data-act="' + b.act + '">' + b.label + '</button>';
      }).join('');
    }
    el.innerHTML = html;
  }

  /** 自动挂载所有 [data-nav] */
  function auto(extraByPage) {
    var els = document.querySelectorAll('[data-nav]');
    Array.prototype.forEach.call(els, function (el) {
      var key = el.getAttribute('data-nav');
      render(el, key, (extraByPage || {})[key] || null);
    });
  }

  root.LSY = root.LSY || {};
  root.LSY.nav = { PAGES: PAGES, render: render, auto: auto };
})(typeof window !== 'undefined' ? window : this);
