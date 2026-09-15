/*!
 * 连山易 · 真太阳时整流（truesolar.js）
 * ---------------------------------------------------------------------------
 * 依据（语料 S3-连山易天文历法排盘算法与时间边界规则.md）
 *   :4   「真太阳时、节气换月、子时换日是三条**绝对不能动摇**的『物理交界红线』」
 *   :12  「规则一：真太阳时（True Solar Time，本地视太阳时）」
 *   :13  「以出生地真正接受到的太阳直射与光照角度为准，将**行政钟表时间**
 *         （如北京时间、UTC 时区）还原为当地真太阳时」
 *   :14  ★公式：真太阳时 = 本地钟表时间 − 夏令时偏置(1小时) + 经度时差 + 均时差(Δt)
 *        经度时差：每偏离中央子午线 1°，平移 4 分钟
 *        均时差 Δt：因地球轨道椭圆及黄赤交角产生的 **±14–16 分钟**波动
 *   :66  例：成都 104.06°E → 经度差 −15.94° → 时间负修正 −63分45秒 →
 *         平太阳时为 12:26:15（15.94×4=63.76 分=63 分 45.6 秒，自洽）
 *   :119 longitude_offset = (longitude - 120.0) * 4
 *   :123 eot_minutes = get_astronomical_eot(dt)   # 外部天文算法
 *   :87  「均时差（EoT）高阶多项式内建代码缺口（**需依赖外部天文库**）」
 *
 * ⚠ 本项目此前的错误结论
 *   早先据 `GE萃取2:3944`「原始文献没有真太阳时/经度修正的任何算法规则」判定该字段
 *   不可实现 → **该结论被本批语料直接证伪**（:12-14 有定义与公式、:119-124 有可运行
 *   代码、:82 把「经度修正」列为已调用知识、:83 自称闭环）。
 *   故 `GE萃取2:3944` 与本文档属**跨文档冲突**，本文档为准。
 *
 * ⚠ 均时差（EoT）语料只给出量级与「需依赖外部天文库」，**未给多项式**。
 *   口径优先采用中国公开标准资料的换算关系；因该资料的数值时差在附录表中，
 *   本地离线实现采用 NOAA Global Monitoring Division 的公开公式展开 EoT。
 *   NOAA 仅作为数值算法备选，不接入商业授权、付费系统或运行时网络服务；属
 *   **工程实现层**、非连山易规则。
 *
 *   跨时区裁决：海外出生时间必须先按**当地时区**解释，不能强行换算成北京时间。
 *   以输入钟表时间对应的 UTC 偏移量计算当地平太阳时，再叠加经度与均时差；
 *   这正是「当地日照时空」口径，不是把美国时间改写成中国时间。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.truesolar = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE_MERIDIAN = 120.0;   // 东八区中央子午线（语料 :119 硬编码）
  var MIN_PER_DEGREE = 4;      // 每偏离 1° 平移 4 分钟（语料 :14/:119）

  /**
   * 均时差 EoT（分钟），正值为真太阳时快于平太阳时。
   *   中国公开标准资料的换算关系：AT = CST + e − (120° − λ) / 15°；
   *   数值 EoT 采用公开海外备选公式，来源 NOAA Global Monitoring Division：
   *   γ = 2π/年长 × (日序 − 1 + (小时 − 12) / 24)
   *   EoT = 229.18 × (0.000075 + 0.001868 cosγ − 0.032077 sinγ
   *         − 0.014615 cos2γ − 0.040849 sin2γ)
   *   中国口径参考：https://zjj.sz.gov.cn/attachment/1/1541/1541744/11974206.pdf（4.3.11）
   *   海外备选：https://gml.noaa.gov/grad/solcalc/solareqns.PDF
   * @param {Date} dt 公历时刻（UTC 或本地皆可，仅用到年内日序）
   * @returns {number} 分钟（约 ±16）
   */
  function equationOfTime(dt) {
    var year = dt.getUTCFullYear();
    var start = Date.UTC(year, 0, 1);
    var dayStart = Date.UTC(year, dt.getUTCMonth(), dt.getUTCDate());
    var dayOfYear = Math.floor((dayStart - start) / 86400000) + 1;
    var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    var hours = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
    var gamma = 2 * Math.PI / (leap ? 366 : 365) * (dayOfYear - 1 + (hours - 12) / 24);
    return 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
      - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
      - 0.040849 * Math.sin(2 * gamma));
  }

  /** 经度时差（分钟）—— 语料 :119 */
  function longitudeOffset(longitude) {
    return (longitude - BASE_MERIDIAN) * MIN_PER_DEGREE;
  }

  /**
   * 真太阳时整流
   * @param {Object} o { year, month, day, hour, minute, longitude, timezoneOffset }
   * @returns {Object}
   *   ok            是否完成校正（缺经度则 false）
   *   offsetMinutes 相对输入当地钟表时间的总偏移（当地经度/时区 + 均时差）
   *   lonOffset / eot 分项
   *   trueTime      { year, month, day, hour, minute }
   *   note
   */
  function rectify(o) {
    if (o.longitude === null || o.longitude === undefined || isNaN(o.longitude)) {
      return { ok: false, note: '缺出生地经度 → 真太阳时未校正' };
    }
    var lon = Number(o.longitude);
    if (o.timezoneOffset === null || o.timezoneOffset === undefined || o.timezoneOffset === '') {
      return { ok: false, note: '缺当地时区 UTC 偏移 → 不得把当地钟表时间静默按北京时间解释' };
    }
    var tz = Number(o.timezoneOffset);
    if (!isFinite(tz) || tz < -12 || tz > 14) {
      return { ok: false, note: '缺当地时区 UTC 偏移 → 不得把当地钟表时间静默按北京时间解释' };
    }
    // 输入是当地行政钟表时间；先还原同一瞬间的 UTC，再在出生地经度上求平太阳时。
    // 均时差按输入日期/钟面时刻取值；时区只决定该钟面时刻对应的物理瞬间。
    var eot = equationOfTime(new Date(Date.UTC(o.year, o.month - 1, o.day,
      o.hour || 0, o.minute || 0)));
    var lonOff = longitudeOffset(lon);
    // 相对当地钟表时间的经度/时区修正：经度每度 4 分钟，减去当地 UTC 偏移。
    var localMeanOffset = lon * MIN_PER_DEGREE - tz * 60;
    var total = localMeanOffset + eot;

    // 加回当地真太阳时修正；结果仍以当地民用日期/时刻展示。
    var localClock = Date.UTC(o.year, o.month - 1, o.day, o.hour || 0, o.minute || 0);
    var t = new Date(localClock + Math.round(total * 60000));

    return {
      ok: true,
      offsetMinutes: total,
      lonOffset: lonOff,
      localMeanOffset: localMeanOffset,
      timezoneOffset: tz,
      eot: eot,
      trueTime: {
        year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(),
        hour: t.getUTCHours(), minute: t.getUTCMinutes()
      },
      note: '真太阳时 = 当地钟表时（已扣夏令时） + [经度×4 − UTC偏移×60] + 均时差。'
        + '海外时间必须按当地时区解释，与北京时间无关；'
        + '经度相对 120°E 的显示差值仍为 (经度 − 120) × 4 分钟（语料 :119）；'
        + '均时差按公开算法计算（当前采用 NOAA Global Monitoring Division 备选公式；'
        + '语料仅给量级 ±14–16 分钟与「需外部天文库」，:87/:123）。'
    };
  }

  return {
    BASE_MERIDIAN: BASE_MERIDIAN,
    MIN_PER_DEGREE: MIN_PER_DEGREE,
    equationOfTime: equationOfTime,
    longitudeOffset: longitudeOffset,
    rectify: rectify,
    _status: 'confirmed',
    _scope: '依语料 :4 属「物理交界红线」；缺经度时不校正，由 GATE-003 标 LOCATION_MISSING',
    _sources: [
      'S3-连山易天文历法排盘算法与时间边界规则.md:4（三条物理交界红线）',
      'S3-连山易天文历法排盘算法与时间边界规则.md:12-14（定义与公式）',
      'S3-连山易天文历法排盘算法与时间边界规则.md:66（成都 104.06°E 算例）',
      'S3-连山易天文历法排盘算法与时间边界规则.md:119（longitude_offset）',
      'S3-连山易天文历法排盘算法与时间边界规则.md:123（eot 外部天文算法）',
      'S3-连山易天文历法排盘算法与时间边界规则.md:87（EoT 多项式为已标外部依赖）',
      '中国公开标准资料：真太阳时与中国标准时换算关系（4.3.11）',
      'NOAA Global Monitoring Division: General Solar Position Calculations（海外备选 eqtime 公式）'
    ],
    _inference: '跨时区旧推断已由知识库明确规则与专家裁决覆盖：海外出生时间按当地时区，'
      + '以当地日照时空为准；缺当地 UTC 偏移时不得计算或静默按 UTC+8。',
    _correction: '⚠ 本项目早先据 GE萃取2:3944「原始文献没有真太阳时/经度修正的任何算法规则」判该字段不可实现'
      + ' → **已被本批语料证伪**（:12-14 有公式、:119-124 有代码、:83 自称闭环）。属跨文档冲突，本文档为准。'
  };
});
