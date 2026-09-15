/*!
 * 连山易 · 表格行选择（row-select.js）
 * ---------------------------------------------------------------------------
 * 用途：③ 十二值符大运表 —— **默认高亮「当旬」行**（测算年所在旬），
 *       点击其它行则动态切换高亮。
 *
 * 行为：
 *   · 页面渲染后，.row-current 行显示米黄色背景（默认 = 当旬）
 *   · 点击任意行 → 高亮移到该行；再次点击同一行 → 恢复到默认（当旬）行
 *   · 键盘可达：行加 tabindex=0，Enter/Space 等同点击
 *   · 高亮状态写入 data-selected 供样式与回归断言读取
 *
 * 设计取舍：
 *   · **不改动 ③ 表的取值** —— 高亮纯属视觉标注，不参与任何计算，
 *     亦不改变「值符」等内容（避免把交互误解为换盘）。
 *   · 当旬判定由 render-chart.js 渲染时写入 class="row-current"，
 *     本模块只负责「点击后切换」，不重复实现判定逻辑。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.ui = root.LSY.ui || {};
    root.LSY.ui.rowSelect = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 默认（当旬）行 = 渲染时标记 .row-current 的那一行 */
  function defaultRow(table) {
    return table.querySelector('tr.row-current');
  }

  /** 清掉动态选择状态，回到默认高亮 */
  function reset(table) {
    table.querySelectorAll('tr[data-selected]').forEach(function (tr) {
      tr.removeAttribute('data-selected');
    });
  }

  /** 选中某行；重复选中同一行（或显式传 null）→ 取消动态选择，回到默认高亮 */
  function select(table, tr) {
    var already = tr && tr.getAttribute('data-selected') === '1';
    reset(table);
    // 重复点击同一行 → 取消动态选择（回到「当旬」默认高亮）
    if (!tr || already) return null;
    var def = defaultRow(table);
    if (tr === def) return null;       // 点默认行等同取消
    tr.setAttribute('data-selected', '1');
    return tr;
  }

  /**
   * 绑定到 ③ 表（幂等：重复绑定不会叠加监听）
   * @param {HTMLElement} rootEl 渲染容器
   * @returns {number} 绑定到的表格数
   */
  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return 0;
    var tables = rootEl.querySelectorAll('#zhifu-table');
    var n = 0;
    Array.prototype.forEach.call(tables, function (table) {
      if (table.getAttribute('data-rowselect') === '1') return;   // 已绑定
      table.setAttribute('data-rowselect', '1');
      n++;
      table.querySelectorAll('tbody > tr').forEach(function (tr) {
        // 跳过表头行
        if (tr.querySelector('th')) return;
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-pressed', 'false');
        tr.addEventListener('click', function () {
          var sel = select(table, tr);
          table.querySelectorAll('tbody > tr').forEach(function (x) {
            x.setAttribute('aria-pressed', x === sel ? 'true' : 'false');
          });
        });
        tr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            tr.click();
          }
        });
      });
    });
    return n;
  }

  return {
    bind: bind,
    select: select,
    reset: reset,
    defaultRow: defaultRow,
    _note: '③ 十二值符大运表：默认高亮当旬行（render-chart 写入 .row-current），'
      + '点击其它行动态切换。纯视觉标注，不参与计算。'
  };
});
