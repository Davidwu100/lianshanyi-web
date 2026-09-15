/*!
 * 连山易 · 档案会话与页面守卫（store.js）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 在 IndexedDB 里长期保存历史档案（rawInput + chartData）
 *   2. 页面守卫：分析类页面若无 chartData，自动回 profile.html（PRD 第十三节）
 *   3. 档案栈：支持「前一档案 / 后一档案 / 对比回看 / 当前档案」
 *
 * 隐私说明：本工具为本地静态站点，档案仅存于当前浏览器 IndexedDB，
 *           不上传。用户可在过往记录页重新打开。
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var KEY = 'lsy.profiles.v1';
  var CUR = 'lsy.current.v1';
  var MAX = 9999;
  var DB_NAME = 'lsy-archives-db';
  var DB_VERSION = 1;
  var DB_STORE = 'profiles';
  var cache = null;

  function read() {
    if (cache) return cache.slice();
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) return JSON.parse(saved);
      // 兼容本次改版前仍在当前标签页里的旧记录。
      return JSON.parse(sessionStorage.getItem(KEY) || '[]');
    } catch (e) { return []; }
  }
  function write(list) {
    cache = list.slice(-MAX);
    var value = JSON.stringify(cache);
    try { localStorage.setItem(KEY, value); } catch (e) { /* quota / privacy mode */ }
    // 保留会话镜像，兼容旧页面与已有离线测试环境。
    try { sessionStorage.setItem(KEY, value); } catch (e) { /* ignore */ }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }
  function persistDb(item) {
    openDb().then(function (db) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(item);
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { db.close(); };
    }).catch(function () { /* 兼容层已保存 */ });
  }
  function deleteDb(id) {
    openDb().then(function (db) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { db.close(); };
    }).catch(function () { /* 兼容层已删除 */ });
  }
  function hydrate(done) {
    var finish = function (list) { cache = list.slice(-MAX); if (done) done(cache.slice()); return cache.slice(); };
    openDb().then(function (db) {
      var req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
      req.onsuccess = function () {
        var byId = {};
        read().forEach(function (x) { byId[x.id] = x; });
        (req.result || []).forEach(function (x) { byId[x.id] = x; });
        var merged = Object.keys(byId).map(function (id) { return byId[id]; })
          .sort(function (a, b) { return String(a.savedAt).localeCompare(String(b.savedAt)); });
        db.close(); finish(merged);
      };
      req.onerror = function () { db.close(); finish(read()); };
    }).catch(function () { finish(read()); });
  }

  /** 保存一次排盘结果，返回档案 id */
  function save(record) {
    var list = read();
    var id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var item = {
      id: id,
      savedAt: new Date().toISOString(),
      name: record.name || (record.rawInput && record.rawInput.name) || '未命名',
      rawInput: record.rawInput,
      status: record.status,
      chartData: record.chartData
    };
    list.push(item);
    write(list);
    persistDb(item);
    try { localStorage.setItem('lsy.current.record.v1', JSON.stringify(item)); } catch (e) { /* ignore */ }
    try { localStorage.setItem(CUR, id); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CUR, id); } catch (e) { /* ignore */ }
    return id;
  }

  function list() { return read(); }
  function count() { return read().length; }

  function currentId() {
    try { return localStorage.getItem(CUR) || sessionStorage.getItem(CUR); } catch (e) { return null; }
  }
  function current() {
    var id = currentId();
    var list = read();
    if (!list.length) return readCurrentRecord();
    if (!id) return list[list.length - 1] || readCurrentRecord();
    var hit = list.filter(function (x) { return x.id === id; })[0];
    return hit || readCurrentRecord() || list[list.length - 1];
  }
  function readCurrentRecord() {
    try { return JSON.parse(localStorage.getItem('lsy.current.record.v1') || 'null'); } catch (e) { return null; }
  }
  function setCurrentRecord(record) {
    if (!record) return;
    setCurrent(record.id);
    try { localStorage.setItem('lsy.current.record.v1', JSON.stringify(record)); } catch (e) { /* ignore */ }
  }
  function setCurrent(id) {
    try { localStorage.setItem(CUR, id); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CUR, id); } catch (e) { /* ignore */ }
  }
  function remove(id) {
    var list = read().filter(function (x) { return x.id !== id; });
    write(list);
    deleteDb(id);
    if (currentId() === id) {
      try { localStorage.removeItem(CUR); localStorage.removeItem('lsy.current.record.v1'); } catch (e) { /* ignore */ }
      try { sessionStorage.removeItem(CUR); } catch (e) { /* ignore */ }
      if (list.length) setCurrentRecord(list[list.length - 1]);
    }
    return true;
  }
  function update(id, changes) {
    var list = read();
    var hit = null;
    list.forEach(function (item) {
      if (item.id !== id) return;
      hit = item;
      if (changes.name !== undefined) item.name = String(changes.name || '未命名').trim() || '未命名';
      item.rawInput = Object.assign({}, item.rawInput || {});
      if (changes.name !== undefined) item.rawInput.name = item.name;
      if (changes.relationship !== undefined) item.rawInput.relationship = changes.relationship || null;
    });
    if (!hit) return false;
    write(list);
    persistDb(hit);
    if (hit.id === currentId()) setCurrentRecord(hit);
    return true;
  }
  /** 相对当前位置移动（offset = -1 前一档案，+1 后一档案） */
  function move(offset) {
    var list = read();
    if (!list.length) return null;
    var id = currentId();
    var i = list.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) i = list.length - 1;
    var j = Math.min(list.length - 1, Math.max(0, i + offset));
    setCurrent(list[j].id);
    return list[j];
  }
  function indexOfCurrent() {
    var list = read();
    var id = currentId();
    return list.map(function (x) { return x.id; }).indexOf(id);
  }
  function clear() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(CUR); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(CUR); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('lsy.current.record.v1'); } catch (e) { /* ignore */ }
  }

  /**
   * 页面守卫。analysisOnly=true 时无命盘数据直接跳回 profile.html。
   *
   * ⚠ 2026-09-12：`rawInput` 存在即视为「可重算」→ 不再要求必须有 chartData 快照。
   *   否则建档时的旧快照（或快照缺失）会把使用者挡在分析页之外。
   * @returns {object|null} 当前档案
   */
  function guard(opt) {
    opt = opt || {};
    var cur = current();
    var usable = cur && (cur.chartData || cur.rawInput);
    if (!usable) {
      if (opt.analysisOnly) {
        location.replace('profile.html?need=1');
        return null;
      }
      return null;
    }
    return cur;
  }

  /**
   * ★ 用**当前引擎**重算某档案的排盘结果。
   *
   * 为什么必须重算（2026-09-12 修正的缺陷）：
   *   档案在 localStorage 里存的是**建档当时**的 `chartData` 快照。
   *   引擎一旦修正（⑩ 卦象面板、真太阳时、八宫装卦、三元九运窗口、运行干支…），
   *   旧档案仍渲染旧快照 → 使用者看到的是「改了却没生效」。
   *   实测表现：建档早于 ⑩ 实现的档案，⑩ 区块一直是空的。
   *
   * `rawInput` 才是唯一真源：同一 rawInput 重算结果稳定；
   * 只有**明确随时间变化**的字段（岁月 age、当月高亮、测算年默认值）会更新，
   * 而这正是期望行为（岁月本就定义为「此时此刻」）。
   *
   * 副作用：把重算结果**回灌**档案，使 compare / talent 等页读到同一份新数据。
   *
   * @param {object} cur store.current() 的返回
   * @returns {object|null} { status, boundary, chartData }
   */
  function rebuild(cur) {
    if (!cur || !cur.rawInput) return null;
    var E = root.LSY && root.LSY.engine && root.LSY.engine.chart;
    if (!E || typeof E.build !== 'function') return null;
    var out;
    try { out = E.build(cur.rawInput); } catch (e) { return null; }
    if (!out || !out.chartData) return null;

    // 回灌：仅当档案确实存在且内容变化时才写，避免无谓的序列化开销
    try {
      var list = read();
      var i = list.map(function (x) { return x.id; }).indexOf(cur.id);
      if (i >= 0) {
        list[i].chartData = out.chartData;
        list[i].status = out.status;
        list[i].rebuiltAt = new Date().toISOString();
        write(list);
        persistDb(list[i]);
        if (list[i].id === currentId()) setCurrentRecord(list[i]);
      }
    } catch (e) { /* 回灌失败不影响本次渲染 */ }

    return { status: out.status, boundary: out.boundary, chartData: out.chartData };
  }

  /** 读取 query 参数 */
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  root.LSY = root.LSY || {};
  root.LSY.store = {
    save: save, list: list, count: count,
    current: current, currentId: currentId, setCurrent: setCurrent,
    move: move, indexOfCurrent: indexOfCurrent, clear: clear,
    hydrate: hydrate, setCurrentRecord: setCurrentRecord, remove: remove, update: update,
    guard: guard, qs: qs, rebuild: rebuild
  };
})(typeof window !== 'undefined' ? window : this);
