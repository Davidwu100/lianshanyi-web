/*!
 * 连山易 · chartData 组装层（chart-engine.js）
 * ---------------------------------------------------------------------------
 * 五层结构（《排盘底座字段映射草案》）：
 *   rawInput → calendarData → natalBase → dynamicTransit → scenarioDerived
 *
 * 每个进 chartData 的字段一律带统一元数据（契约草案 2.2）：
 *   field_id / field_status / rule_id / source_refs / depends_on /
 *   exception_policy / interpretation_type / safety_boundary
 *
 * 无出处字段一律 field_status='RULE_PENDING'，value=null，并给出缺失原因。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./dict-core.js'),
      require('./core.js'),
      require('./calendar.js'),
      // 卦象引擎在 Node 侧可能尚未就绪；失败时传 null，由 buildGuaPanel 兜底降级
      (function () { try { return require('./gua-engine.js'); } catch (e) { return null; } })(),
      // 局态判定（成局/半局/局外人）—— S3 语料补齐后接入
      (function () { try { return require('./formations.js'); } catch (e) { return null; } })(),
      // 三元九运（九运锚点 / 九宫干支 / 三元—星结构）
      (function () { try { return require('./sanyuan-jiuyun.js'); } catch (e) { return null; } })()
    );
  } else {
    root.LSY = root.LSY || {};
    root.LSY.engine = root.LSY.engine || {};
    root.LSY.engine.chart = factory(
      root.LSY.data.core,
      root.LSY.engine.core,
      root.LSY.engine.calendar,
      root.LSY.engine.gua || null,
      root.LSY.engine.formations || null,
      root.LSY.engine.sanyuan || null
    );
  }
})(typeof self !== 'undefined' ? self : this, function (D, C, CAL, GUA, FORMS, SY) {
  'use strict';

  var SAFETY = '仅作传统标注，不构成吉凶结论';
  var POS = ['time', 'day', 'month', 'year'];
  var POS_CN = { time: '时', day: '日', month: '月', year: '年' };

  function meta(ruleId) { return D.meta[ruleId] || {}; }

  function F(value, fieldId, ruleId, dependsOn, overrideStatus, overrideNote, iType) {
    var m = meta(ruleId);
    return {
      value: value,
      field_id: fieldId,
      field_status: overrideStatus || m.status || 'RULE_PENDING',
      rule_id: ruleId || null,
      source_refs: m.sources || [],
      depends_on: dependsOn || [],
      exception_policy: overrideNote || m.note || '',
      interpretation_type: iType || 'computed',
      safety_boundary: SAFETY,
      conflict_id: m.conflictId || null
    };
  }
  function RP(fieldId, reason, ruleId) {
    return F(null, fieldId, ruleId, [], 'RULE_PENDING', reason);
  }

  /** 取元数据的裸值（用于组装纯数据视图） */
  function v(o) { return o && o.value; }

  // ==================================================== 旬轨字段包装
  function trackField(track, fieldId, note) {
    return {
      value: {
        xun: track.xun, branch: track.branch, scope: track.scope,
        domain: track.domain, anchorRule: track.anchorRule, label: track.label
      },
      // 便于 UI 直接取用（不必进 value）
      domain: track.domain,
      anchorRule: track.anchorRule,
      label: track.label,
      scope: track.scope,
      field_id: fieldId,
      field_status: 'conditional',
      rule_id: 'LSY-XUN-RULING',
      source_refs: [
        '01-书同课程-35P录音稿清洗-260831 √.md:3711',
        '01-书同课程-35P录音稿清洗-260831 √.md:4051-4053',
        '01-书同课程-35P录音稿清洗-260831 √.md:4864-4868',
        '02-阳阳领航初级-69P书籍清洗-260903 √.md:258'
      ],
      depends_on: [track.key === 'year' ? 'pillar.year' : 'pillar.day'],
      exception_policy: note + '（' + track.label + '，域：' + track.domain
        + '，' + track.anchorRule + '，旬 ' + track.xun + '，支 ' + track.branch + '）',
      interpretation_type: 'computed',
      safety_boundary: '仅作传统标注，不构成吉凶结论',
      conflict_id: 'CONFLICT-TAIJI-ANCHOR'
    };
  }

  // ==================================================== 卦象面板
  function buildGuaPanel(rec, input) {
    if (!GUA) {
      return RP('scenario.gua', '卦象引擎未加载（gua-engine.js 需在 chart-engine.js 之前引入）', 'LSY-GUA-XIAGUA');
    }
    return GUA.build(rec, input);
  }

  // ==================================================== 输入门控
  /**
   * GATE-001 ~ GATE-005。返回 { pass, blocked, needsAsk, gates[] }
   */
  function inputGate(input) {
    var gates = [];
    var dateCheck = CAL.validateDateInput(input);
    function g(id, ok, must, forbid, field) {
      gates.push({ id: id, pass: ok, field: field, must: must, forbid: forbid, status: ok ? 'PASS' : 'BLOCK' });
    }
    g('GATE-001', dateCheck.ok,
      dateCheck.ok ? '阻断命盘生成并说明缺失字段' : dateCheck.reason,
      '用年龄、生肖或描述猜日期或接受不存在的日期', 'birth_date');
    g('GATE-002', input.hour !== undefined && input.hour !== null,
      '阻断依赖时支的字段，显示降级或待确认状态', '静默补时、输出完整命卦/世应', 'birth_time');
    g('GATE-003', !!(input.place || input.longitude),
      '标记真太阳时未校正和临界风险', '宣称已完成经度/均时差校正', 'birth_location');
    g('GATE-004', !!input.question,
      '追问现实问题并暂停场景解释', '默认生成全量人生结论', 'user_question');
    g('GATE-005', input.gender !== undefined && input.gender !== null,
      '仅阻断明确依赖性别的规则', '默认为男/女或扩大性别影响范围', 'gender');

    var blocked = gates.filter(function (x) { return !x.pass; });
    return {
      pass: blocked.length === 0,
      blocked: blocked,
      dateReason: dateCheck.reason,
      // 日期缺失或非法 = 硬阻断；其余为降级或追问
      hardBlock: !dateCheck.ok,
      gates: gates
    };
  }

  // ============================================================ 主组装
  /**
   * @param {object} input
   *   year, month, day, hour, minute, calendarType, gender, place|longitude,
   *   question, subjectType, xunAnchor ('year'|'day'), targetYear, targetMonth, targetDay
   */
  function build(input) {
    input = input || {};
    var gate = inputGate(input);
    if (gate.hardBlock) {
      return {
        status: 'INPUT_BLOCKED',
        inputGate: gate,
        reason: gate.dateReason || '出生日期缺失，无法生成命盘。',
        canSupply: ['出生年、月、日'],
        chartData: null
      };
    }

    // ---------------------------------------------------------- 1. 整流
    var rec = CAL.rectify(input);
    var boundary = CAL.detectBoundary(input, rec);

    // ---------------------------------------------------------- 2. 四柱
    var pillarGz = [
      { pos: 'time', gz: rec.pillars.time },
      { pos: 'day', gz: rec.pillars.day },
      { pos: 'month', gz: rec.pillars.month },
      { pos: 'year', gz: rec.pillars.year }
    ];

    // ================================================================
    // 双轨分层消纳（太极点分裂的裁决结果）
    // ----------------------------------------------------------------
    // 【冲突】若把日柱旬误当全局大运起点，1974 年生人（甲寅年）第一步大运
    //         会被错排为甲午运（年龄直接推后约 30 年），运势与星曜全部错位。
    //
    // 【裁决】双轨并行，不设"单锚点切换"：
    //   年柱旬轨（公处）：全局大运 / 本命定盘星 / 十二值符表 / 空亡 / 孤
    //   日柱旬轨（私处）：日自空 / 日私域行为
    //
    // 语料依据（公处/私处是课程明文）：
    //   01-书同课程-35P录音稿清洗-260831 √.md:3711
    //     「对方的年柱 + 月柱 = 对方的'公处'」
    //   01-书同课程-35P录音稿清洗-260831 √.md:4051-4053
    //     「'公处'比'私处'力量更强」；「对方月柱、年柱优先；日、时属于退而求其次」
    //   01-书同课程-35P录音稿清洗-260831 √.md:4864-4868
    //     「三合局落在公处，做得更大；落在私处，也好，但'没那么大'」
    //   02-阳阳领航初级-69P书籍清洗-260903 √.md:258
    //     「时、日偏向内环境（私域），可自我掌控/呈现」
    //   01-书同课程-35P录音稿清洗-260831 √.md:11309
    //     「时柱 | 内心、私域，老师说力量相对小」
    //
    // ⚠ 语料**只**定义了「公处 = 年柱+月柱 / 私处 = 日柱+时柱」，
    //   以及「公处力量更强」；它**没有**把这两个域映射到"旬锚点"。
    //   「公处取年柱旬、私处取日柱旬」这一步来自本工具使用者的专家裁决，
    //   不是语料直接表述 → 状态记 conditional 并在每处挂来源与说明。
    // ================================================================
    var XUN_TRACK = {
      year: {
        key: 'year', label: '年柱旬轨（公处 · 全局）',
        domain: '公处 = 年柱 + 月柱',
        anchorRule: '旬锚点只取年柱旬（不并入月柱旬）',
        scope: '全局大运 / 本命定盘星 / 十二值符表 / 空亡 / 孤',
        pillar: rec.pillars.year,
        xun: C.xunHead(rec.pillars.year),
        status: 'conditional',
        note: '公处域含年柱与月柱；但旬锚点按使用者裁决只取年柱旬。'
          + '避免 1974 甲寅年生人被错排为甲午运。'
      },
      day: {
        key: 'day', label: '日柱旬轨（私处 · 日域）',
        domain: '私处 = 日柱 + 时柱',
        anchorRule: '旬锚点取日柱旬',
        scope: '日自空 / 日私域行为',
        pillar: rec.pillars.day,
        xun: C.xunHead(rec.pillars.day),
        status: 'conditional',
        note: '私处域含日柱与时柱；旬锚点取日柱旬。'
      }
    };
    XUN_TRACK.year.branch = XUN_TRACK.year.xun.charAt(1);
    XUN_TRACK.day.branch = XUN_TRACK.day.xun.charAt(1);

    // 兼容旧字段名：anchorMode 恒为 'year'（不再提供"把日柱旬当全局锚点"的选项）
    var anchorMode = 'year';
    var anchorXun = XUN_TRACK.year.xun;
    var anchorBranch = XUN_TRACK.year.branch;

    // 日柱旬（私处轨）
    var dayXun = XUN_TRACK.day.xun;
    var dayXunRow = D.XUN_BY_HEAD[dayXun];

    // ---------------------------------------------------------- 3. 静态盘
    var pillars = pillarGz.map(function (p) {
      var gz = p.gz;
      var hasTime = gz !== null;
      if (!hasTime) {
        // 缺时辰：时柱整列为 RULE_PENDING
        return {
          pos: p.pos, pos_cn: POS_CN[p.pos], gz: null, gan: null, zhi: null,
          gan_f: RP('pillar.' + p.pos + '.gan', '缺出生时辰，不猜时柱', 'LSY-TALENT-007'),
          zhi_f: RP('pillar.' + p.pos + '.zhi', '缺出生时辰，不猜时柱', 'LSY-TALENT-007'),
          xun_f: RP('pillar.' + p.pos + '.xun', '缺出生时辰', 'LSY-TALENT-007'),
          yao_f: RP('pillar.' + p.pos + '.yao', '缺出生时辰', 'LSY-TALENT-007'),
          kong_f: RP('pillar.' + p.pos + '.kong', '缺出生时辰', 'LSY-TALENT-007'),
          gu_f: RP('pillar.' + p.pos + '.gu', '缺出生时辰', 'LSY-TALENT-007'),
          changWangMu_f: RP('pillar.' + p.pos + '.lwm', '缺出生时辰', 'LSY-TALENT-007'),
          gongSha_f: RP('pillar.' + p.pos + '.gongsha', '缺出生时辰', 'LSY-SHA-GONG-001'),
          xiaSha_f: RP('pillar.' + p.pos + '.xiasha', '缺出生时辰', 'LSY-SHA-XIA-001'),
          tianFu_f: RP('pillar.' + p.pos + '.tianfu', '缺出生时辰', 'LSY-TIANFU-001'),
          talismanStatic_f: RP('pillar.' + p.pos + '.talisman', '缺出生时辰', 'LSY-TALISMAN-002'),
          yinYang_f: RP('pillar.' + p.pos + '.yinyang', '缺出生时辰', 'LSY-BASE-GANZHI'),
          zhiAttr_f: RP('pillar.' + p.pos + '.zhiattr', '缺出生时辰', 'LSY-BASE-ZHIATTR-001'),
          ganSeason_f: RP('pillar.' + p.pos + '.ganseason', '缺出生时辰', 'LSY-CONFLICT-015'),
          isAnchor: false
        };
      }
      var gan = gz.charAt(0), zhi = gz.charAt(1);
      var xun = C.xunHead(gz);
      var isAnchorPillar = (p.pos === 'year');   // 全局轨锚点固定为年柱
      var row = D.XUN_BY_HEAD[xun] || {};
      return {
        pos: p.pos, pos_cn: POS_CN[p.pos], gz: gz, gan: gan, zhi: zhi,
        // 逐个字段带元数据
        gan_f: F(gan, 'pillar.' + p.pos + '.gan', 'LSY-BASE-GANZHI'),
        zhi_f: F(zhi, 'pillar.' + p.pos + '.zhi', 'LSY-BASE-GANZHI'),
        xun_f: F(xun, 'pillar.' + p.pos + '.xun', 'LSY-BASE-XUN-001', ['pillar.' + p.pos + '.gan', 'pillar.' + p.pos + '.zhi']),
        yao_f: F(C.yaoWei(gz), 'pillar.' + p.pos + '.yao', 'LSY-BASE-YAO-001', ['pillar.' + p.pos + '.gan', 'pillar.' + p.pos + '.zhi']),
        kong_f: F((row.kong || []).slice(), 'pillar.' + p.pos + '.kong', 'LSY-BASE-XUN-001'),
        gu_f: F((row.gu || []).slice(), 'pillar.' + p.pos + '.gu', 'LSY-BASE-GU-001'),
        changWangMu_f: F(D.CHANG_WANG_MU[gan] ? D.CHANG_WANG_MU[gan].slice() : null,
          'pillar.' + p.pos + '.lwm', 'LSY-LWM-001', ['pillar.' + p.pos + '.gan']),
        gongSha_f: F(D.GONG_SHA[gan], 'pillar.' + p.pos + '.gongsha', 'LSY-SHA-GONG-001', ['pillar.' + p.pos + '.gan']),
        xiaSha_f: F(D.XIA_SHA[gan], 'pillar.' + p.pos + '.xiasha', 'LSY-SHA-XIA-001', ['pillar.' + p.pos + '.gan']),
        tianFu_f: F(D.TIAN_FU[zhi], 'pillar.' + p.pos + '.tianfu', 'LSY-TIANFU-001', ['pillar.' + p.pos + '.zhi']),
        talismanStatic_f: F(C.talisman(zhi, XUN_TRACK.year.branch), 'pillar.' + p.pos + '.talisman', 'LSY-TALISMAN-002',
          ['pillar.year.xun'], 'conditional',
          '本命静符属公处（全局定盘星）→ 取年柱旬轨。'
          + '若误用日柱旬，1974 甲寅年生人的星曜会整体错位约 30 年。'),
        yinYang_f: F(D.GAN_YANG.indexOf(gan) >= 0 ? '阳' : '阴', 'pillar.' + p.pos + '.yinyang', 'LSY-BASE-GANZHI'),
        zhiAttr_f: F(D.ZHI_ATTR[zhi], 'pillar.' + p.pos + '.zhiattr', 'LSY-BASE-ZHIATTR-001'),
        // 天干季节：三口径分流，默认 04
        ganSeason_f: (function () {
          var dom = input.seasonDomain || '04';
          var tbl = D.GAN_SEASON_DOMAINS[dom];
          return F(tbl ? tbl[gan] : null, 'pillar.' + p.pos + '.ganseason', 'LSY-CONFLICT-015', [],
            'conditional', '天干四季存在三口径互斥（戊冬己夏 / 长夏戊己 / 戊己中宫），当前 domain=' + dom + '。禁止归一。');
        })(),
        // 关系（单柱自身不构成关系，此处占位，跨柱在 relations 层）
        isAnchor: isAnchorPillar
      };
    });

    // ------------------------------------------------- 4. 孤 / 空 两列
    // 【口径】② 复合表中 **孤 / 空 / 旬 / 运 四列同属「出生旬」信息**；
    //        「贵」列属「流旬」信息（见 guiDisplay）。
    //   出生旬 = 出生年柱所在的六甲旬。
    //   1982 案例：年柱壬戌 → 出生旬 甲寅 → 空 子丑、孤 午未、旬头 甲寅
    //   参考图逐格实测：空=子/丑、孤=午/未、旬=甲/寅 → 四列全部吻合出生旬
    //   （此前误用日柱旬 甲戌 → 空申酉/孤寅卯，与参考图不符，已修）
    //   注：日柱旬另用于**日自空**（natalBase.daySelfKong），是独立的另一项。
    var kongDisplay = {
      gan: anchorXun.charAt(0), zhi: anchorXun.charAt(1),
      kong: (D.XUN_BY_HEAD[anchorXun] || {}).kong ? D.XUN_BY_HEAD[anchorXun].kong.slice() : null,
      gu: (D.XUN_BY_HEAD[anchorXun] || {}).gu ? D.XUN_BY_HEAD[anchorXun].gu.slice() : null,
      kongXun: anchorXun,
      dayKong: dayXunRow ? dayXunRow.kong.slice() : null,   // 日自空（私处轨，另列）
      dayGu: dayXunRow ? dayXunRow.gu.slice() : null,
      _f: F(anchorXun, 'column.kongGu', 'LSY-BASE-XUN-001', ['pillar.year'],
        'confirmed',
        '空/孤/旬三列取**年柱旬（公处轨）**。对拍依据：参考图 1982 案例 年柱壬戌→甲寅旬→'
        + '空子丑、孤午未、旬头甲寅，与参考图逐格吻合。'
        + '日柱旬的日自空另见 natalBase.daySelfKong（私处轨），两轨并行不悖。')
    };

    // ------------------------------------------------- 5. 本命静态标注
    var natal = {
      guiFuCai: (function () {
        var m = meta('LSY-GUIFUCAI-001');
        // 天干三吉：贵 = S+3、福 = S+7、财 = 天干五合
        // 显示顺序 = 贵 · 福 · 财（依参考图行序）
        var triplets = pillars.map(function (p) {
          if (!p.gz) return null;
          var t = D.GUI_FU_CAI[p.gan];
          return t ? (t.gui + t.fu + t.cai) : null;
        });
        return {
          value: triplets,
          field_id: 'natal.guiFuCai',
          field_status: 'confirmed',
          rule_id: 'LSY-GUIFUCAI-001',
          source_refs: m.sources || [],
          depends_on: ['pillar.time.gan', 'pillar.day.gan', 'pillar.month.gan', 'pillar.year.gan'],
          exception_policy: m.note || '',
          interpretation_type: 'computed',
          safety_boundary: SAFETY,
          conflict_id: null,
          // 逐柱明细（供 UI 与浮层展示）
          detail: pillars.map(function (p) {
            if (!p.gz) return null;
            var t = D.GUI_FU_CAI[p.gan];
            return t ? { gan: p.gan, gui: t.gui, fu: t.fu, cai: t.cai } : null;
          })
        };
      })(),
      gongXiaSha: pillars.map(function (p) {
        if (!p.gz) return null;
        return p.gan ? (v(p.gongSha_f) || '-') + (v(p.xiaSha_f) || '-') : null;
      }),
      tianZei: {
        value: pillars.map(function (p) { return p.gz ? v(p.tianFu_f) : null; }),
        field_id: 'natal.tianZei',
        field_status: 'confirmed',
        rule_id: 'LSY-TIANZEI-001',
        source_refs: meta('LSY-TIANZEI-001').sources,
        exception_policy: '天贼 ≡ 天赋（同一张表，12/12 同构）→ 与「天赋支」行会显示重复值，属源文如此。天祸星/天灾星/天难星是本字段别名。',
        interpretation_type: 'computed',
        safety_boundary: SAFETY,
        conflict_id: null
      },
      // 有气/无气：⚠ 2026-09-12 T24 复核更正 —— 计算层**并非 not-found**
      //   一手语料 GE萃取2:3993-4135（源文件《连山易气场强弱研判法则.md》）确有
      //   三步判定 + 可编码布尔公式，且 :4131 明文许可「高保真硬编码」。
      //   真正的阻断点是三条（详见 docs/T24-natal.talismanQi-关闭评估.md）：
      //     ① 跨文档禁令冲突：01:4884「有气/无气不能提前硬编码」vs GE萃取2:4131 明文许可；
      //     ② 空孤时间锚语料内自相冲突：GE萃取2:3848「查生年旬（年空）」
      //        vs GE萃取2:4132「当旬空亡/当旬孤辰」，语料无裁决条款;
      //     ③ 计算对象口径不同一：语料判「六亲爻 × 日月长生诀」，本工具按四柱天干取值。
      //   故维持不取值；25/10/0 评分另有独立阻断依据（蒸馏库回源审计降级）。
      youQi: RP('natal.talismanQi',
        '有气/无气：语义层 confirmed（01:2711-2737）；计算层语料有可编码公式'
        + '（GE萃取2:4129-4134），但存在三条未裁冲突：'
        + '① 主料禁令 01:4884「不能提前硬编码」vs GE萃取2:4131 明文许可硬编码；'
        + '② 空孤时间锚语料内互斥（GE萃取2:3848 生年旬 vs :4132 当旬）；'
        + '③ 计算对象不同一（语料＝六亲爻×日月长生诀，本工具＝四柱天干×出生旬空孤）。'
        + '二次文档的 25/10/0 评分与 60 分线另行阻断（未经源文确认）。'
        + '待使用者裁决后方可取值。见 docs/T24-natal.talismanQi-关闭评估.md',
        'LSY-TALISMAN-QI'),
      // 完全未定义
      gongZhongShou: RP('natal.gongZhongShou',
        '「攻/中/守」是十天干上方的合并单元格分区标签，边界未定（02:330-334）。不得与天干相冲建立计算依赖。',
        'LSY-BASE-GONGZHONGSHOU'),
      ruMuJue: RP('natal.ruMuJue',
        '入墓/绝：地支组→流年表完整，但天干层「旺处被绝」无判定条件，完整 12 状态落点表全库 not-found。参考图无此行，禁止新增。',
        'LSY-LWM-JUE')
    };

    // ------------------------------------------------- 6. 跨柱关系
    var relations = buildRelations(pillars);

    // ------------------------------------------------- 7. 十二值符大运表
    //   ⚠ 测算年必须**先定义**再传入 —— 原先 `targetYear` 在第 9 步才声明，
    //     而此处（第 7 步）已引用，var 提升导致传入 undefined，
    //     使 ③ 表无法判定「当旬行」、默认高亮失效。现前移声明。
    var now = new Date();
    var targetYear = input.targetYear || now.getFullYear();
    var targetMonth = input.targetMonth || (now.getMonth() + 1);
    var targetDay = input.targetDay || now.getDate();
    var talismanTable = buildTalismanTable(rec, anchorBranch, targetYear);

    // ------------------------------------------------- 8. 天地盘大字阵
    var heavenEarth = pillars.map(function (p) {
      if (!p.gz) return null;
      var gan = p.gan, zhi = p.zhi;
      return {
        pos: p.pos, pos_cn: p.pos_cn,
        gan: gan, zhi: zhi,
        // 天干区四角
        ganChongAttack: D.GAN_CHONG[gan] || null,      // ↙ 所冲
        ganChongDefend: D.GAN_CHONG_INV[gan] || null,  // ↘ 被冲
        ganSeason: v(p.ganSeason_f),
        ganHe: (D.GAN_HE_PAIRS.filter(function (h) { return h[0] === gan || h[1] === gan; })[0] || [])
          .filter(function (x) { return x !== gan; })[0] || null,
        // 地支区四角
        zhiDir: v(p.zhiAttr_f) ? v(p.zhiAttr_f).dir : null,
        zhiWuXing: v(p.zhiAttr_f) ? v(p.zhiAttr_f).wuxing : null,
        zhiSeason: v(p.zhiAttr_f) ? v(p.zhiAttr_f).season : null,
        zhiChong: D.ZHI_CHONG_PAIRS.filter(function (h) { return h[0] === zhi || h[1] === zhi; })[0]
          .filter(function (x) { return x !== zhi; })[0] || null,
        zhiHe: D.ZHI_HE_PAIRS.filter(function (h) { return h[0] === zhi || h[1] === zhi; })[0]
          .filter(function (x) { return x !== zhi; })[0] || null
      };
    });

    // ------------------------------------------------- 9. 时间层
    //   （targetYear / targetMonth 已在第 7 步前移声明）
    var timeLayer = buildTimeLayer(targetYear, targetMonth, targetDay, rec.solar.year);

    // ------------------------------------------------- 10. 注解条
    var annotation = buildAnnotation(rec, pillars, relations, input.gender);

    // ------------------------------------------------- 11. 卦象面板
    // 上下卦/动爻/变卦/六爻天干 已按复核口径输出；卦名序号/卦辞/爻位地支等按状态留白
    var gua = buildGuaPanel(rec, input);

    // ------------------------------------------------- 11b. 局态（成局/半局/局外人）
    //   ⚠ 2026-09-12 T24：原先此字段**内联**在 natalBase 对象字面量里，
    //     导致 `natal`（本命静态标注那个普通对象）里**没有** formations，
    //     而 `natalBase.formations` 又还没构造出来 —— 运程层 `fortune.tianshiQi`
    //     需要局态，故上移为局部变量，字面量与运程层共用同一份。
    var formationsField = (function () {
      var FM = FORMS;
      if (!FM) {
        return RP('natalBase.formations', 'formations 模块未加载。', 'LSY-BASE-SANHE');
      }
      var zhis = pillars.map(function (p) { return p.zhi; });
      var r = FM.classify(zhis);
      return F({
        status: r.status, unique: r.unique,
        cheng: r.cheng, ban: r.ban, missing: r.missing, multiBan: r.multiBan
      }, 'natalBase.formations', 'LSY-BASE-SANHE',
        ['S3-连山易局态判定规则与算法建模.md:9-12, 19-23, 30-34, 44-45, 74-75'],
        'confirmed',
        '四柱地支**去重后**（Set 语义）与四大局集合匹配：'
          + '三字齐备=成局（4 种）；严格缺一字=半局（有且仅有 12 种）；都不满足=局外人。'
          + '四大局：申子辰智谋局(水) / 寅午戌文采局(火) / 巳酉丑贵重局(金) / 亥卯未权柄局(木)。'
          + '⚠ 语料 74-75 明言三类定义在所有源讲义与教材中 100% 一致（无冲突）。'
          + (r.multiBan ? '⚠ 去重后含多组半局：依当天时优先激活得天时生扶者；'
            + '若与天时同等强度干涉，讲义未给数值加权公式 → 全部列出不擅定主局。' : ''));
    })();

    // 天时得气（**运程层**，2026-09-12 T24 裁决 4A 新增）
    //   同时依赖局态（formationsField）与当旬（talismanTable.rows）。
    var tianshiQi = buildTianshiQi(formationsField, talismanTable.rows, targetYear);

    // ------------------------------------------------- 12. 元数据汇总
    var allFields = collectFields(pillars, natal, relations);
    var counts = { confirmed: 0, conditional: 0, RULE_PENDING: 0, derived_candidate: 0 };
    allFields.forEach(function (f) {
      if (f && f.field_status && counts[f.field_status] !== undefined) counts[f.field_status]++;
    });

    return {
      status: boundary.status,
      inputGate: gate,
      boundary: boundary,
      chartData: {
        // 第一层
        rawInput: {
          calendarType: input.calendarType || 'solar',
          birthDate: { year: input.year, month: input.month, day: input.day },
          birthTime: (input.hour === undefined || input.hour === null) ? null : {
            hour: input.hour, minute: input.minute || 0,
            precision: input.timePrecision || 'minute',
            shichen: input.shichen || null
          },
          birthPlace: input.place || null,
          longitude: input.longitude || null,
          timezoneOffset: input.timezoneOffset === undefined || input.timezoneOffset === null
            ? null : Number(input.timezoneOffset),
          gender: input.gender || null,
          relationship: input.relationship || null,
          subjectType: input.subjectType || 'self',
          userQuestion: input.question || null
        },
        // 第二层
        calendarData: {
          solar: rec.solar,
          lunar: rec.lunar,
          jieqi: rec.jieqi,
          xuanyuan: F(rec.solar.year + 2697, 'calendarData.xuanyuan', 'LSY-CAL-XUANYUAN', [],
            'confirmed', '轩辕纪元 = 公历年 + 2697（G路 T6，3 样本自洽）'),
          // ── 真太阳时（语料 S3-连山易天文历法排盘算法与时间边界规则.md） ──
          //   :4  「真太阳时、节气换月、子时换日」为三条物理交界红线
          //   :12-14 定义与公式；:119 longitude_offset = (longitude − 120) × 4
          //   已由 assets/js/engine/truesolar.js 实现并接入 calendar.js：
          //     日柱/时柱按真太阳时刻判定，年柱/月柱保持行政钟表刻度
          //     （节气表与出生时刻同刻度，统一偏移不改变先后）
          //   状态：
          //     · 有经度 → confirmed（公式有源、城市表为地理常识数据）
          //     · 无经度 / 地点无法解析 → conditional（未校正，GATE-003 已标）
          //     · 海外有当地 UTC 偏移 → confirmed；缺当地 UTC 偏移 → conditional
          trueSolarTime: (function () {
            var t = rec.trueSolarTime || {};
            if (!t.ok) {
              return F({
                applied: false, longitude: t.longitude || null,
                longitudeMatched: t.longitudeMatched || null,
                longitudeSource: t.longitudeSource || null,
                timezoneOffset: t.timezoneOffset,
                clockTime: t.clockTime || null, trueTime: null,
                precision: t.precision || (input.timePrecision || 'minute'),
                selectedShichen: t.selectedShichen || input.shichen || null
              }, 'calendarData.trueSolarTime', 'LSY-CAL-TRUESOLAR', [],
              'conditional',
              (t.precision === 'shichen'
                ? '当前只知道时辰（' + (t.selectedShichen || '—') + '时），按所选时辰排盘；未把区间起点当作真实出生时刻，因此不做真太阳时跨界校正。若需校正，请补填具体时:分。'
                : '真太阳时未校正：'
                  + (t.longitudeSource ? '出生地点无法解析为经度。' : '未提供出生地点/经度。')
                  + '本次排盘的**日柱/时柱按行政钟表时刻判定**（已扣夏令时，若适用）。'
                  + '补出生城市/经度及当地 UTC 偏移即可完成校正。'),
              'computed');
            }
            var text = '真太阳时 = 当地钟表时（已扣夏令时） + 当地经度/时区修正 '
              + (t.localMeanOffset >= 0 ? '+' : '−')
              + Math.abs(Math.round(t.localMeanOffset * 10) / 10) + ' 分钟'
              + (t.eot >= 0 ? ' + ' : ' − ') + Math.abs(Math.round(t.eot * 10) / 10) + ' 分钟（均时差）'
              + ' = 合计 ' + (t.offsetMinutes >= 0 ? '+' : '−')
              + Math.abs(Math.round(t.offsetMinutes * 10) / 10) + ' 分钟';
            return F({
              applied: true,
              longitude: t.longitude,
              longitudeMatched: t.longitudeMatched,
              longitudeSource: t.longitudeSource,
              timezoneOffset: t.timezoneOffset,
              timezoneSource: t.timezoneSource,
              localMeanOffset: Math.round(t.localMeanOffset * 100) / 100,
              offsetMinutes: Math.round(t.offsetMinutes * 100) / 100,
              lonOffset: Math.round(t.lonOffset * 100) / 100,
              eot: Math.round(t.eot * 100) / 100,
              clockTime: t.clockTime,
              trueTime: t.trueTime,
              shichenChanged: !!t.shichenChanged,
              dayChanged: !!t.dayChanged,
              text: text
            }, 'calendarData.trueSolarTime', 'LSY-CAL-TRUESOLAR',
            ['rawInput.birthPlace', 'rawInput.longitude'],
            'confirmed',
            text + '。'
            + '日柱/时柱按**真太阳时刻**判定（子初换日、时辰分界均为当地物理交界）；'
            + '年柱/月柱按行政钟表刻度判定（节气表与出生时刻同刻度，统一偏移不改变先后）。'
            + (t.shichenChanged ? '⚠ 校正后**时支发生位移**。' : '')
            + (t.dayChanged ? '⚠ 校正后**日柱基准日发生位移**。' : '')
            + '当地时区 UTC' + (t.timezoneOffset >= 0 ? '+' : '') + t.timezoneOffset
            + ' 已用于解释输入钟表时间；海外时间不换算为北京时间。'
            + '经度取自 ' + (t.longitudeSource || '—') + '。',
            'computed');
          })(),
          // 23:00 子初换日：已实现（calendar.js 自行整流，不依赖历法库的 00:00 换日）。
          //   ⚠ 状态说明：课程主料（01:1176 / 01:9098）仍把它列为「待补算法」，
          //     但 S3 语料 :4 明确把它与真太阳时、节气换月并列为**三条物理交界红线**，
          //     并在 :4520-4521 / :5305-5307 给出规则原文 → 属跨文档口径差异，
          //     本工具按 S3 实现，状态记 conditional（主料未闭合）而非待补。
          dayChangeRule: F('子初换日（23:00）', 'calendarData.dayChangeRule', 'LSY-CAL-ZISHI',
            ['calendarData.trueSolarTime'], 'conditional',
            '已实现：不以子夜 24:00 换日，而以子时起点 23:00 为新一天的开始；'
            + '该时刻起日柱基准日 +1、时柱由五鼠遁自算。'
            + '⚠ 课程度主料（01:1176、01:9098）仍列为「待补算法」，'
            + '而 S3-连山易天文历法排盘算法与时间边界规则.md:4 把它与真太阳时、节气换月'
            + '并列为三条物理交界红线 → 跨文档口径差异，本工具按 S3 实现。'
            + '⚠ 换日判定的**刻度**是真太阳时刻（已扣夏令时 + 经度时差 + 均时差），'
            + '非行政钟表时刻。'),
          // 夏令时（夏时制）校正结果：语料 4580 要求「强制 −1 小时」，此处透出以便界面明示
          dst: rec.dst,
          age: rec.age,
          // 大月/小月（29/30 天）：**可算**，来源为历法层（lunar-javascript），
          //   非连山易规则 → status='external'（见 calendar.js 文件头既定口径：
          //   「大月/小月、闰月口径：A/B 全库零定义 → 仅作历法库输出，标 status='external'」）。
          //   ⚠ 此前误标 RULE_PENDING 且 value=null，而其值其实已在
          //     ① 农历文本「冬月(大)」与 ⑨ 月历行中展示（⑨ 大小月 12/12 对拍全中）。
          //     属字段标注与应用不一致，现对齐。
          lunarMonthSize: F(rec.lunar.monthSize, 'calendarData.lunarMonthSize',
            'LSY-CAL-EXTERNAL-MONTHSIZE', ['历法层（lunar-javascript），非连山易规则'],
            'external',
            '连山易 A/B 两库对「大月/小月（29/30 天）」零定义（03:1128-1131 要求另补历法规范），'
            + '故此值取自历法层（30=大 / 29=小），仅作历法标注，**不参与任何连山易判定**。'
            + '⑨ 月历行大小月已与参考图对拍 12/12 全中。'),
          external: rec.external
        },
        // 第三层
        natalBase: {
          pillars: pillars,

          // ------------------------------------------------ 双轨分层消纳
          xunTracks: {
            year: trackField(XUN_TRACK.year, 'natalBase.xunTracks.year',
              '公处轨（全局大运 / 本命定盘星 / 十二值符表 / 空亡 / 孤）。'
              + '取年柱旬，避免把日柱旬误当全局大运起点导致星曜错位。'),
            day: trackField(XUN_TRACK.day, 'natalBase.xunTracks.day',
              '私处轨（日自空 / 日私域行为）。取日柱旬。')
          },
          // 裁决说明（供 rules 页与 UI 说明区使用）
          xunRuling: {
            ruleId: 'LSY-XUN-RULING',
            status: 'conditional',
            decision: '双轨分层消纳：全局与定盘星盘用年柱旬；日柱私域与日自空用日柱旬。两轨并行，不设单锚点切换。',
            // 域与锚点是两件事，必须分开陈述
            domains: {
              gongChu: '公处 = 年柱 + 月柱',
              siChu: '私处 = 日柱 + 时柱'
            },
            anchorRule: '公处轨旬锚点只取年柱旬（不并入月柱旬）；私处轨取日柱旬。',
            conflict: '若把日柱旬错当全局大运起点，1974 甲寅年生人第一步大运会被错排为甲午运，年龄推后约 30 年，运势与吉凶星曜全部错位。',
            corpusSupport: [
              '01-书同课程-35P录音稿清洗-260831 √.md:3711（年柱+月柱 = 公处）',
              '01-书同课程-35P录音稿清洗-260831 √.md:4051-4053（公处比私处力量更强；月年优先，日时退而求其次）',
              '01-书同课程-35P录音稿清洗-260831 √.md:4864-4868（三合局落公处更大，落私处没那么大）',
              '02-阳阳领航初级-69P书籍清洗-260903 √.md:258（时日偏向内环境私域）',
              '01-书同课程-35P录音稿清洗-260831 √.md:11309（时柱内心、私域，力量相对小）'
            ],
            pendingTerminology: [
              '已关闭（2026-09-11）：「公处/宫处/攻处」ASR 混写 → 确认为「公处」，「宫处」「攻处」系口误',
              '⚠ 仍待统一：公处/私处的柱位映射，语料建议与第 07 课统一口径（01:4870）。'
              + '使用者已确认「公处=年柱+月柱、私处=日柱+时柱」，此条可视为已定，但第 07 课交叉核对尚未做'
            ],
            sourceNote: '语料明文定义了公处=年柱+月柱、私处=日柱+时柱，以及「公处力量更强」；'
              + '但**未**把这两个域映射到旬锚点。「公处取年柱旬、私处取日柱旬」这一步来自使用者的专家裁决，'
              + '非语料直接表述 → 状态为 conditional，需专家确认后可升级。',
            affectedFields: {
              yearTrack: ['pillar.*.talisman（本命静符）', 'talismanTable（十二值符大运表）', 'pillar.*.kong（空亡）', 'pillar.*.gu（孤）'],
              dayTrack: ['natalBase.daySelfKong（日自空）', '日柱私域行为解释']
            }
          },
          // 兼容：旧的 xun / xunAnchor 保留，语义固定为公处（年柱旬）
          xun: F(anchorXun, 'natalBase.xun', 'LSY-TALISMAN-ANCHOR', [],
            'conditional',
            '公处轨旬头 = 年柱旬。本工具不再提供「把日柱旬当全局锚点」的选项（该用法已被裁决为错误）。'),
          xunAnchor: { mode: 'year', pillar: 'year', xun: anchorXun, branch: anchorBranch },
          dayXun: F(dayXun, 'natalBase.dayXun', 'LSY-BASE-XUN-001'),

          // ------------------------------------------------ 日自空（私处轨）
          daySelfKong: (function () {
            var dRow = D.XUN_BY_HEAD[dayXun] || {};
            var dayXunOfDay = C.xunHead(rec.pillars.day);
            var track = XUN_TRACK.day;
            return {
              value: { xun: dayXun, kong: (dRow.kong || []).slice(), gu: (dRow.gu || []).slice() },
              field_id: 'natalBase.daySelfKong',
              field_status: 'conditional',
              rule_id: 'LSY-XUN-DAYKONG',
              source_refs: [
                '01-书同课程-35P录音稿清洗-260831 √.md:3711',
                '01-书同课程-35P录音稿清洗-260831 √.md:4051-4053',
                '02-阳阳领航初级-69P书籍清洗-260903 √.md:258'
              ],
              depends_on: ['pillar.day'],
              exception_policy: '日自空/日私域取日柱旬轨（' + dayXun + ' → 空 '
                + (dRow.kong || []).join('') + '、孤 ' + (dRow.gu || []).join('') + '）。'
                + '「日自空」这一字段名与「日域取日柱旬」的映射来自使用者裁决，语料只定义了公处/私处之分，'
                + '未直述旬锚点归属 → conditional。',
              interpretation_type: 'computed',
              safety_boundary: '仅作传统标注，不构成吉凶结论',
              conflict_id: 'CONFLICT-TAIJI-ANCHOR'
            };
          })(),

          kongGuColumn: kongDisplay,
          kongDisplay: { gan: v(kongDisplay._f) ? v(kongDisplay._f).charAt(0) : null, zhi: v(kongDisplay._f) ? v(kongDisplay._f).charAt(1) : null },
          // 「贵」列 = 流年旬的天赐 / 天佐
          //   ① 天赐（第一位）② 天佐（第二位），按**流年**所属六甲旬查表
          //   参考图 1982 案例：流年 2026 丙午 → 甲辰旬 → 辛/庚（与实测逐字吻合）
          guiDisplay: (function () {
            var transitGZ = C.yearGZ(targetYear);
            var transitXun = C.xunHead(transitGZ);
            var pair = D.XUN_TO_TIANCI_TIANZUO[transitXun] || [null, null];
            var tianCi = pair[0], tianZuo = pair[1];
            var m = meta('LSY-GUI-COLUMN');
            return {
              value: (tianCi && tianZuo) ? { tianCi: tianCi, tianZuo: tianZuo, xun: transitXun } : null,
              gan: tianCi, zhi: tianZuo,
              field_status: 'confirmed',
              field_id: 'natalBase.guiDisplay',
              rule_id: 'LSY-GUI-COLUMN',
              source_refs: m.sources || [],
              depends_on: ['targetYear'],
              exception_policy: '「贵」列取**流年旬**的天赐天佐。'
                + '流年 ' + transitGZ + ' 属 ' + transitXun + '旬 → 天赐'
                + tianCi + '、天佐' + tianZuo + '。'
                + '（出生年旬口径已在 1982 案例上被排除：甲寅旬→丙/庚，与参考图「辛」不符。）',
              interpretation_type: 'computed',
              safety_boundary: '仅作传统标注，不构成吉凶结论',
              conflict_id: null
            };
          })(),
          yunDisplay: { gan: rec.pillars.year.charAt(0), zhi: rec.pillars.year.charAt(1) },
          natal: natal,
          changWangMu: pillars.map(function (p) { return p.gz ? v(p.changWangMu_f) : null; }),
          relations: relations,
          // 局态判定（成局 / 半局 / 局外人）—— 原为 RULE_PENDING
          //   ⚠ 原理由「判定需先去重，且三合缺位与补缺优先级仍待确认」→ 现由
          //     S3-连山易局态判定规则与算法建模.md 完整给出（使用者 2026-09-12 指路后补齐）：
          //       9-12  成局=三字齐备 / 半局=严格缺一字 / 局外人=都不满足；**去重硬规则**
          //       30-34 全体系**有且仅有 12 种半局**（四局各派生 3）
          //       74-75 ★冲突核查：「成局/半局/局外人定义在所有源讲义与教材中 100% 保持一致」
          //   ⚠ 本项目早先把「半局」误列为三重矛盾 → 实为**同名异指**：
          //     连山易不讨论「地支半三合」（后世三合派），但明确使用「半局」= 四大局缺一字。
          formations: formationsField,
          missingOrBlockedFields: boundary.flags.map(function (f) { return f.code; })
        },
        // 第四层
        dynamicTransit: timeLayer,
        // 运程层：天时得气（**非** 5 层契约内的层，是 dynamicTransit 的运程伴生字段）
        //   2026-09-12 T24 裁决 4A 新增。字段自述 field_id = `fortune.tianshiQi`。
        fortune: { tianshiQi: tianshiQi },
        // 第五层
        scenarioDerived: {
          scenarioCode: null,
          subjectType: input.subjectType || 'self',
          primaryPillars: [],
          ruleHits: [],
          evidenceChain: [],
          openQuestions: boundary.flags,
          manualReviewRequired: boundary.status !== 'FULL_CHART',
          gua: gua
        },
        // 展示用附属
        view: {
          talismanTable: talismanTable,
          heavenEarth: heavenEarth,
          annotation: annotation,
          yearRow: timeLayer.yearRow,
          monthRow: timeLayer.monthRow,
          dayCells: timeLayer.dayCells,
          hourCells: timeLayer.hourCells
        },
        // 元数据统计
        meta: {
          fieldCounts: counts,
          status: boundary.status,
          anchorMode: anchorMode,
          generatedFrom: 'assets/js/engine/chart-engine.js'
        }
      }
    };
  }

  // ==================================================== 跨柱关系
  function buildRelations(pillars) {
    var rel = [];
    var have = pillars.filter(function (p) { return p.gz; });
    for (var i = 0; i < have.length; i++) {
      for (var j = i + 1; j < have.length; j++) {
        var a = have[i], b = have[j];
        // 天干冲（有向：a.gan → b.gan 与 b.gan → a.gan 分别判定）
        if (D.GAN_CHONG[a.gan] === b.gan) {
          rel.push({ type: '天干冲', from: a.pos, to: b.pos, detail: a.gan + '冲' + b.gan, directed: true,
            rule_id: 'LSY-BASE-GANCHONG-001', status: 'confirmed' });
        }
        if (D.GAN_CHONG[b.gan] === a.gan) {
          rel.push({ type: '天干冲', from: b.pos, to: a.pos, detail: b.gan + '冲' + a.gan, directed: true,
            rule_id: 'LSY-BASE-GANCHONG-001', status: 'confirmed' });
        }
        // 天干合（无向）
        var isHe = D.GAN_HE_PAIRS.some(function (h) {
          return (h[0] === a.gan && h[1] === b.gan) || (h[1] === a.gan && h[0] === b.gan);
        });
        if (isHe) rel.push({ type: '天干合', from: a.pos, to: b.pos, detail: a.gan + '合' + b.gan, directed: false,
          rule_id: 'LSY-BASE-GANHE-001', status: 'confirmed' });
        // 地支六冲
        var isChong = D.ZHI_CHONG_PAIRS.some(function (h) {
          return (h[0] === a.zhi && h[1] === b.zhi) || (h[1] === a.zhi && h[0] === b.zhi);
        });
        if (isChong) rel.push({ type: '地支六冲', from: a.pos, to: b.pos, detail: a.zhi + '冲' + b.zhi, directed: false,
          rule_id: 'LSY-BASE-ZHIREL-001', status: 'confirmed' });
        // 地支六合
        var isZhHe = D.ZHI_HE_PAIRS.some(function (h) {
          return (h[0] === a.zhi && h[1] === b.zhi) || (h[1] === a.zhi && h[0] === b.zhi);
        });
        if (isZhHe) rel.push({ type: '地支六合', from: a.pos, to: b.pos, detail: a.zhi + '合' + b.zhi, directed: false,
          rule_id: 'LSY-BASE-ZHIREL-001', status: 'confirmed' });
      }
    }
    return {
      list: rel,
      // 三合 / 半局 / 局态 —— 原为 RULE_PENDING（理由「判定需先去重，三合缺位与
      //   补缺优先级仍待确认」）→ 现由 S3-连山易局态判定规则与算法建模.md 完整给出
      //   （使用者 2026-09-12 指路后补齐）：
      //     9-12  成局=三字齐备 / 半局=严格缺一字 / 局外人=都不满足；**去重硬规则**
      //     30-34 全体系**有且仅有 12 种半局**（四局各派生 3）
      //     74-75 ★冲突核查：「三类定义在所有源讲义与教材中 100% 保持一致」
      sanhe: (function () {
        if (!FORMS) return RP('natalBase.relations.sanhe', 'formations 模块未加载。', 'LSY-BASE-SANHE');
        var r = FORMS.classify(pillars.map(function (p) { return p.zhi; }));
        return F({
          status: r.status, unique: r.unique,
          cheng: r.cheng.map(function (c) { return c.name + '(' + c.ju.join('') + ')'; }),
          ban: r.ban.map(function (b) { return b.name + '(' + b.have.join('') + '缺' + b.miss + ')'; }),
          missing: r.missing
        }, 'natalBase.relations.sanhe', 'LSY-BASE-SANHE',
          ['S3-连山易局态判定规则与算法建模.md:9-12, 19-23, 30-34, 74-75'],
          'confirmed',
          '三合/半局判定：四柱地支**去重后**与四大局集合匹配，'
            + '三字齐备=成局（4 种）、严格缺一字=半局（12 种）、都不满足=局外人。'
            + '⚠ 语料 74-75 明言三类定义 100% 一致（无冲突）；'
            + '⚠ 连山易**不讨论「地支半三合」**（后世三合派），本字段的「半局」特指四大局缺一字。');
      })(),
      summary: {
        ganChong: rel.filter(function (r) { return r.type === '天干冲'; }).length,
        ganHe: rel.filter(function (r) { return r.type === '天干合'; }).length,
        zhiChong: rel.filter(function (r) { return r.type === '地支六冲'; }).length,
        zhiHe: rel.filter(function (r) { return r.type === '地支六合'; }).length
      }
    };
  }

  // ==================================================== 十二值符大运表
  function buildTalismanTable(rec, anchorBranch, targetYear) {
    // 以**出生旬**为起点，10 年递进，共 10 行（覆盖 100 年）
    //   ⚠ 使用者 2026-09-11 裁决：**表从出生旬开始**，且不得出现负年龄。
    //     原实现 `windowStart = xunBlockStart(birthYear) - 10` 人为向前推了一个旬块，
    //     使首行落在出生前 10 年（1982 → 1964–1973，年龄 -18 ~ -9）。
    //     「大运」自出生起算，负年龄无意义；参考图首行 `-18 ~ -9` 即该缺陷的表现
    //     （reference.js:63-65 当时已存疑，但被如实复刻）。
    //   → 现从出生旬块起算；年龄以**出生年为锚**（第 1 行 = 出生后第 1~10 年）：
    //       1982 案例 → 行1 甲寅旬 1974-1983，年龄 08 ~ 17（出生后首个十年）
    //     ⚠ 流转周期列保留**实际年份**（含出生年之前的部分），
    //       使「该旬覆盖的公历区间」信息不丢失；年龄列则一律以出生年为 0 起算。
    var birthXun = C.xunHead(rec.pillars.year);
    var idx = D.XUN_HEADS.indexOf(birthXun);
    if (idx < 0) idx = 0;
    var birthYear = rec.solar.year;
    var windowStart = C.xunBlockStart(birthYear);
    var rows = [];
    for (var i = 0; i < 10; i++) {
      var head = D.XUN_HEADS[(idx + i) % 6];
      var startYear = windowStart + i * 10;
      var endYear = startYear + 9;
      // 年龄按实际公历年份求：本旬与「出生年」重叠的区间。
      //   首旬（含出生年）只取出生年及以后 → 不出现负年龄。
      //   1982 案例：行1 甲寅旬 1974-1983 → 有效区间 1982-1983 → 年龄 00 ~ 01
      var a0 = Math.max(0, startYear - birthYear);
      var a1 = endYear - birthYear;
      var cells = {};
      ['time', 'day', 'month', 'year'].forEach(function (pos) {
        var gz = rec.pillars[pos];
        if (!gz) { cells[pos] = null; return; }
        cells[pos] = C.talisman(gz.charAt(1), head.charAt(1));
      });
      rows.push({
        xun: head,
        startYear: startYear,
        cycle: startYear + '-' + endYear,
        age: fmtAge(a0) + ' ~ ' + fmtAge(a1),
        cells: cells,
        rule_id: 'LSY-TALISMAN-002',
        status: 'conditional'
      });
    }
    return {
      rows: rows,
      // 测算年：供 UI 判定「当旬行」并做默认高亮（见 render-chart.js）
      targetYear: targetYear,
      anchorBranch: anchorBranch,
      note: '出生旬锚点 = 年柱旬（课程口径）。值符管十年、其他符管一年（CONFLICT-010 未闭，源内前后口径冲突）。',
      conflict_id: 'CONFLICT-010'
    };
  }
  // 年龄显示：**一致 2 位宽**，负数在符号后补零（-9 → -09）。
  //   原实现 `a < 0 ? String(a) : (a < 10 ? '0' + a : String(a))` —— 负数漏补零，
  //   致同一列出现 `-18 ~ -9`（1 位）与 `-8 ~ 01`、`02 ~ 11`（2 位）混排，
  //   数字位对不齐、整行观感参差。
  //   ⚠ 参考图源文本即写作 `-18 ~ -9`（reference.js:67，5× 实测），
  //     故属**参考图自身的格式缺陷**被如实复刻；使用者 2026-09-11 判定为低级错误并裁决修正。
  //     → 这是**有意偏离源图格式**，仅涉排版宽度，**不涉数值**
  //       （数值仍为 -18 / -9，与源图一致，信息正确性不变）。
  function fmtAge(a) {
    var neg = a < 0;
    var s = String(Math.abs(a));
    if (s.length < 2) s = '0' + s;
    return (neg ? '-' : '') + s;
  }

  // ==================================================== 时间层
  function buildTimeLayer(targetYear, targetMonth, targetDay, birthYear) {
    // 运行 3 格（参考图：19/84 丁酉 | 20/04 丙寅 | 20/24 己巳，第 3 格高亮）
    //   以「当前运」为第 3 格，向前推 2 个 20 年块
    var SYY = SY;
    var curYunStart = C.yunStart(targetYear);
    var yun = [-2, -1, 0].map(function (off) {
      var s = curYunStart + off * C.SPANS.yun;
      var yi = C.yunIndex(s);
      // 九星/五行/方位/卦色/九宫干支：全部有主料 03:726-738 直证（原标 derived_candidate 已升 confirmed）
      var jy = (SYY && SYY.YUN_GONG) ? {
        star: SYY.YUN_STAR[yi - 1],
        guaColor: SYY.YUN_GUA[yi - 1],
        gong: SYY.YUN_GONG[yi - 1],
        yuan: SYY.YUAN_LABEL[yi - 1],
        yuanStar: SYY.YUAN_STAR[yi - 1]
      } : null;
      return {
        startYear: s, year: C.yyPair(s), gz: yunDisplayGZ(s),
        yunIndex: yi, name: C.YUN_NAMES[yi - 1],
        isCurrent: s === curYunStart,
        star: jy ? jy.star : null,
        guaColor: jy ? jy.guaColor : null,
        gong: jy ? jy.gong : null,
        yuan: jy ? jy.yuan : null,
        yuanStar: jy ? jy.yuanStar : null,
        // 星名↔五行/方位 joined 表：语料 03:726-738 只给「九宫运（坎一白）」与「九宫（戊子）」，
        //   五行/方位由卦宫常识（兑=金/西、艮=土/东北、离=火/南）补足 → 记 conditional。
        wuxing: null, dir: null, color: null,
        _starStatus: 'confirmed',
        _joinStatus: 'conditional',
        _note: '九运名/九宫运/九宫干支/三元/三元星 全部有主料 03:697-716、03:720-724、03:726-738 直证；'
          + '运行干支 = 该运所属卦宫的干支（一运戊子…七运丁酉…九运己巳），'
          + '正是参考图七/八/九运三格的读数（原「+62k」TEMP_DECISION 已作废）。'
          + '⚠ 五运居中宫，无地支 → 干支列为主料原样的「戊己」。'
          + '五行/方位由卦宫常识补足（兑金西 / 艮土东北 / 离火南 / 乾金西北 / 中土中），记 conditional。'
      };
    });
    // 旬行 6 格：以「当前旬」为第 5 格。2026 → 旬基 2024，窗口起点 2024−4×10 = 1984
    //   参考图：19/84 甲子 | 19/94 甲戌 | 20/04 甲申 | 20/14 甲午 | 20/24 甲辰 | 20/34 甲寅
    var xun = [];
    var xunBase = C.xunBlockStart(targetYear);
    for (var m = -4; m < 2; m++) {
      var xs = xunBase + m * C.SPANS.xun;
      xun.push({ startYear: xs, year: C.yyPair(xs), head: C.yearXun(xs), isCurrent: m === 0 });
    }

    // 年历行 12 格：参考原图从「当前年所在旬的旬首年」起排
    //   2026 → 旬首年 2024 起，2024..2035
    //   ⚠ 若出生年**晚于**旬首年（如 2026 年生、测算年 2026 → 窗口 2024 起），
    //     前几格年龄为负。使用者 2026-09-11 裁决「不得出现负年龄」
    //     （与 ③ 大运表同旨，见 buildTalismanTable 的说明）
    //     → 出生前的格标 beforeBirth=true，界面显示「—」而不是负数。
    var yearRow = [];
    for (var a = 0; a < 12; a++) {
      var ay = xunBase + a;
      var ag = C.yearGZ(ay);
      var ageN = (birthYear !== undefined ? ay - birthYear : ay - 1982);
      yearRow.push({
        year: ay, gz: ag,
        age: ageN,
        beforeBirth: ageN < 0,
        fu: C.fuCode(ag, C.yearXun(targetYear).charAt(1)),
        yao: C.yaoWei(ag),
        isCurrent: ay === targetYear
      });
    }
    // 月历行 12 格（按目标年的年干五虎遁）
    //   大小月：由 `calendar.lunarMonthSizeOf` 按**农历月序**算出（30=大 / 29=小）。
    //   参考图 ⑨ 月历 ※ 行对拍 2026 年 **12/12 全中**（大小大小小大小小大大大小）。
    //   ⚠ 此前误标 RULE_PENDING「全库零定义」—— 实为**可算**（历法层，非规则层），已修。
    //   ⚠ 实现必须按「农历月序」而非「某日期所在月」：1982 有闰四月，
    //     用相邻月首日差会把四月算成 58 天 → 已改用逐日扫描（见 calendar.js）。
    var monthRow = [];
    var tGan = C.yearGZ(targetYear).charAt(0);
    // 「当月」按目标日换算农历月；未指定目标日时由 build() 注入系统当天，
    //   避免公历月首与真实农历月错位（2026-09-14 应高亮农历八月）。
    var tMonthLunar = (function () {
      try {
        var sy = targetYear, sm = targetMonth, d = targetDay || 1;
        while (sm < 1) { sm += 12; sy -= 1; }
        while (sm > 12) { sm -= 12; sy += 1; }
        return CAL.lib().Solar.fromYmd(sy, sm, d).getLunar().getMonth();
      } catch (e) { return null; }
    })();
    for (var b = 0; b < 12; b++) {
      var mg = C.monthGZByIndex(tGan, b);
      var sz = CAL.lunarMonthSizeOf(targetYear, b + 1);
      monthRow.push({
        index: b + 1,
        gz: mg,
        fu: C.fuCode(mg, C.yearXun(targetYear).charAt(1)),
        size: sz,
        isCurrent: tMonthLunar !== null && (b + 1) === tMonthLunar,
        _sizeStatus: sz ? 'confirmed' : 'RULE_PENDING'
      });
    }

    return {
      targetYear: targetYear,
      targetMonth: targetMonth,
      yun: {
        cells: yun, note: '20 年三元九运块。',
        field: {
          value: yun.map(function (c) { return c.year + ' ' + c.gz; }).join(' | '),
          field_id: 'dynamicTransit.yun', field_status: 'confirmed', rule_id: 'LSY-TIME-YUN',
          source_refs: [
            '03-老韩天时-63P书籍清洗-260903 √.md:691-716（《三元九运应用表》完整年限 1864 一运 … 2024 九运）',
            '03-老韩天时-63P书籍清洗-260903 √.md:720-724（三元—星—九运结构）',
            '03-老韩天时-63P书籍清洗-260903 √.md:726-738（九运—九宫运—九宫映射）',
            '03-老韩天时-63P书籍清洗-260903 √.md:573-582（方位|卦名|序号）'
          ],
          depends_on: ['targetYear'],
          exception_policy: '运行起年（1864/1884/…/2024）与九宫运算（坎一白…离九紫）、'
            + '**运行干支 = 该运所属卦宫的干支**（九宫列：戊子/癸未/庚寅/辛巳/戊己/壬戌/丁酉/丙寅/己巳）'
            + '全部有主料 03:691-738 直证。'
            + '⚠ 2026-09-12 修正：此前「显示用干支 = 起始年 + 62k 的年干支」是错误拟合'
            + '（只在七运巧合成立），已作废；参考图七/八/九运三格丁酉/丙寅/己巳正是该表第 7/8/9 行。'
            + '⚠ 五运居中宫无地支 → 干支列为「戊己」（主料原样）。'
            + '五行/方位由九宫色定（一白水…九紫火），与 03:573-582 卦宫方位一致。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论',
          conflict_id: null
        }
      },
      xun: {
        cells: xun, note: '10 年六甲旬块。锚点 1984 甲子。',
        field: {
          value: xun.map(function (c) { return c.year + ' ' + c.head; }).join(' | '),
          field_id: 'dynamicTransit.xun', field_status: 'confirmed', rule_id: 'LSY-TIME-XUN',
          source_refs: ['01-书同课程-35P录音稿清洗-260831 √.md:9981-9993', '03-老韩天时-63P书籍清洗-260903 √.md:1059-1068'],
          depends_on: ['targetYear'],
          exception_policy: '年份区间→六甲旬、旬头正向序列、锚点 1984 甲子均有主料支持。',
          interpretation_type: 'computed', safety_boundary: '仅作传统标注，不构成吉凶结论',
          conflict_id: null
        }
      },
      highlight: {
        targetYear: targetYear,
        yun: C.yy2(curYunStart),
        xun: C.yy2(xunBase)
      },
      yearRow: yearRow,
      monthRow: monthRow,
      dayCells: null,   // 由 calendar 页按具体日期生成
      hourCells: null
    };
  }
  /**
   * 运行显示用干支 = **该运所属卦宫的干支**（九宫列）
   *
   * ★ 2026-09-12 由主料解开此前的 TEMP_DECISION：
   *   参考原图三格读数 19/84 丁酉 · 20/04 丙寅 · 20/24 己巳，
   *   当时发现「显示干支 = 本运起始年 + 62k 的年干支」只在首格成立（2004+62=2066 丙戌 ✗），
   *   无法归一，故硬编码三格并标 derived_candidate。
   *   主料 `03-老韩天时-63P书籍清洗-260903 √.md:726-738`《九运—九宫运—九宫映射》给出：
   *     一运→戊子 · 二运→癸未 · 三运→庚寅 · 四运→辛巳 · 五运→戊己 · 六运→壬戌 ·
   *     七运→丁酉 · 八运→丙寅 · 九运→己巳
   *   → 参考图三格（七/八/九运）**正是该表的后三行**，与「+62k」无关。
   *   故改为查表，状态由 derived_candidate 升为 **confirmed**。
   *   ⚠ 五运居**中宫**，无地支 → 干支列为主料原样的「戊己」（两干并列），不是笔误。
   */
  function yunDisplayGZ(startYear) {
    var yi1 = SY ? SY.yunIndexOf(startYear) : C.yunIndex(startYear);
    var jy = D.JIU_YUN[yi1];
    if (jy && jy.gz) return jy.gz;
    return C.yearGZ(startYear);
  }

  // ==================================================== 注解条
  // 结构对齐参考图：
  //   「N岁，乾造M爻，四柱偏阳；四季俱全；五行俱全；
  //     天干：壬两见，月冲时、年冲时，无相合；
  //     地支：时冲年，无相合；
  //     三合：无，两汇：辰子。」
  //   注：「乾造1爻」= 造别 + 爻位。四柱爻位为 (1)(1)(1)(6)（时/日/月/年）。
  //       参考图摘要写「乾造1爻」，与**日柱**爻位一致（日柱在主料中是「自己」的入口）
  //       而非年柱（6爻）。本工具取**日柱爻位**并标 conditional——
  //       语料未直接说明该字段取哪一柱，此处按「日柱 = 自己」的课程原则推定。
  // ==================================================== 天时得气（运程层）
  /**
   * `fortune.tianshiQi` —— 运程层「得天时 / 得气」定性三态
   *
   * **新增于 2026-09-12（T24 使用者裁决）**。四条裁决：
   *   裁决 1：有气/无气**以 01 主料课程为准**
   *           → `01:4884`「有气/无气不能提前硬编码」→ **本命层 `natal.talismanQi` 不取值**（裁决 4A）
   *   裁决 2：空孤取 **当旬**（非生年旬）—— 本字段据此取测算年所在旬
   *   裁决 3：语料「六亲爻 × 日月长生诀」那一支**暂缓**（见 `changsheng.js` 头部注记）
   *   裁决 4：采 **A**（本命层维持不取值 + 另立运程层字段）
   *
   * 本字段只承接 **01 主料自身明文**、且**不依赖被禁硬编码**的那部分规则：
   *   局组（四大局两两合并）× 当旬是否属该组的得气旬。
   *
   * 依据：
   *   · `01:5980-5996` A组=寅午戌/亥卯未 ↔ 甲寅/甲午/甲戌旬；
   *                    B组=申子辰/巳酉丑 ↔ 甲申/甲子/甲辰旬（`:6002-6011` 以地支六合解释合并）
   *   · `01:14224-14239` 甲辰旬支持申子辰/巳酉丑；寅午戌、亥卯未不属当前得气组
   *   · `01:4069-4073` 局中人/半局人遇对应的天时 = 有气；其他天时 = 无气
   *   · `01:14241-14245` 局外人「与天时无关，只能靠自己」→ 屏蔽天时对齐，**不给低分**
   *
   * ⚠ 输出**定性三态**（得气 / 不得天时 / 局外人不评估），**不含任何数值档位**。
   *   25/10/0 评分与 60 分线另有独立阻断依据，不得由本字段引入。
   * ⚠ 本字段属**运程层**（依赖 targetYear），**严禁**冒充本命层 `natal.talismanQi`。
   *
   * @param {object} fm     `natal.formations` 字段对象（含 value.status / value.cheng / value.ban）
   * @param {Array}  rows   `talismanTable.rows`（每行 { xun, startYear }）
   * @param {number} targetYear 测算年
   */
  function buildTianshiQi(fm, rows, targetYear) {
    var juTai = (fm && typeof fm.value === 'object' && fm.value) ? fm.value.status : null;
    if (!juTai) {
      return F(null, 'fortune.tianshiQi', 'LSY-TIANSHI-QI', ['natalBase.formations'],
        'RULE_PENDING', '局态（成局/半局/局外人）不可得，无法评估天时得气。');
    }

    // 当旬 = 测算年所在六甲旬（裁决 2：取当旬，不取生年旬）
    var cur = null;
    (rows || []).forEach(function (r) {
      if (targetYear >= r.startYear && targetYear <= r.startYear + 9) cur = r.xun;
    });

    // 局 → 组（01:5980-5996）
    var JU_A = { '寅午戌': 1, '亥卯未': 1 };   // A组（火木系）
    var JU_B = { '申子辰': 1, '巳酉丑': 1 };   // B组（水金系）
    var XUN_A = { '甲寅': 1, '甲午': 1, '甲戌': 1 };
    var XUN_B = { '甲申': 1, '甲子': 1, '甲辰': 1 };
    var curGroup = XUN_A[cur] ? 'A' : (XUN_B[cur] ? 'B' : null);

    var matched = [], unmatched = [], candidates = [];
    var list = (juTai === '成局') ? (fm.value.cheng || []) : (fm.value.ban || []);
    list.forEach(function (x) {
      var ju = (x.ju || []).join('');
      if (!ju) return;
      candidates.push(ju);
      var g = JU_A[ju] ? 'A' : (JU_B[ju] ? 'B' : null);
      if (g && g === curGroup) matched.push(ju); else unmatched.push(ju);
    });

    var state, note;
    if (juTai === '局外人') {
      state = '局外人不评估';
      note = '局外人（不成局者）与天时无关，只能靠自己 —— 依 01:14241-14245 屏蔽天时对齐，'
        + '**不给天时低分**，故本字段不评估。';
    } else if (curGroup && matched.length) {
      state = '得气';
      note = '当旬 ' + cur + ' 属 ' + curGroup + ' 组得气旬，命局' + juTai
        + '（' + matched.join('、') + '）与本旬组对应 → 得天时 / 得气。';
      if (unmatched.length) {
        note += ' ⚠ 另有' + juTai + ' ' + unmatched.join('、') + ' 不属本旬得气组；'
          + '依 01:5980-5996 与 S3:44-45，多组并存时只列出、不擅定主局'
          + '（讲义未给数值加权公式）。';
      }
    } else {
      state = '不得天时';
      note = '当旬 ' + cur + '（' + (curGroup || '—') + ' 组）与命局' + juTai
        + '（' + candidates.join('、') + '）不同组 → 不得天时 / 与大运相悖。';
    }

    return F({
        // ⚠ 局外人不参与天时对齐 → group 归 null（不给它贴上 A/B 组标签）
        state: state, juTai: juTai,
        group: (juTai === '局外人') ? null : curGroup,
        currentXun: cur,
        matched: matched, unmatched: unmatched
      }, 'fortune.tianshiQi', 'LSY-TIANSHI-QI',
      ['natalBase.formations', 'targetYear'],
      'conditional',
      note + ' 【定性三态，不含任何数值档位；25/10/0 评分与 60 分线另行阻断。】'
        + ' 层级：运程层（依赖 targetYear），**不得**冒充本命层 natal.talismanQi。'
        + ' 使用者裁决 2026-09-12：① 以 01 主料为准；② 空孤取当旬；④ 采 4A。');
  }

  function buildAnnotation(rec, pillars, relations, gender) {
    var have = pillars.filter(function (p) { return p.gz; });
    var dayP = pillars.filter(function (p) { return p.pos === 'day'; })[0];
    var dayYao = dayP && dayP.yao_f ? dayP.yao_f.value : null;
    var zaobie = (gender || '') + (dayYao ? dayYao + '爻' : '');
    var yangCount = have.filter(function (p) { return D.GAN_YANG.indexOf(p.gan) >= 0; }).length;
    var yinCount = have.length - yangCount;

    // ---- 四季：天干季节 + 地支季节 合并统计
    //   口径由参考图反推：姜韬 1982 干支=丙辰/癸未/壬子/壬戌
    //     天干季节(04口径) 丙=夏 癸=冬 壬=冬 → 仅夏冬（不足）
    //     地支季节 辰=春 未=夏 子=冬 戌=秋 → 补齐春夏秋冬
    //   两案例（1982 / hm爸）均需干支合并才得「四季俱全」→ 确认合并口径
    var seasons = {};
    have.forEach(function (p) {
      var gs = v(p.ganSeason_f);
      if (gs && gs !== '长夏' && gs !== '中宫') seasons[gs] = true;
      var za = D.ZHI_ATTR[p.zhi];
      if (za && za.season) seasons[za.season] = true;
    });
    var seasonList = ['春', '夏', '秋', '冬'].filter(function (s) { return seasons[s]; });

    // ---- 五行：天干五行 + 地支藏干五行
    //     口径经参考图两案例穷举反推确认（见 dict-core meta.cangGan）
    var wx = {};
    have.forEach(function (p) {
      if (D.GAN_WU_XING && D.GAN_WU_XING[p.gan]) wx[D.GAN_WU_XING[p.gan]] = true;
      ((D.ZHI_CANG_GAN || {})[p.zhi] || []).forEach(function (g) {
        if (D.GAN_WU_XING && D.GAN_WU_XING[g]) wx[D.GAN_WU_XING[g]] = true;
      });
    });
    var wxList = ['木', '火', '土', '金', '水'].filter(function (x) { return wx[x]; });

    // ---- 天干重复
    var ganCount = {};
    have.forEach(function (p) { ganCount[p.gan] = (ganCount[p.gan] || 0) + 1; });
    var ganRepeat = Object.keys(ganCount).filter(function (g) { return ganCount[g] > 1; })
      .map(function (g) { return g + '两见'; });

    // ---- 天干 / 地支 关系
    var ganChong = relations.list.filter(function (r) { return r.type === '天干冲'; })
      .map(function (r) { return POS_CN[r.from] + '冲' + POS_CN[r.to]; });
    var ganHe = relations.list.filter(function (r) { return r.type === '天干合'; })
      .map(function (r) { return POS_CN[r.from] + '合' + POS_CN[r.to]; });
    var zhiChong = relations.list.filter(function (r) { return r.type === '地支六冲'; })
      .map(function (r) { return POS_CN[r.from] + '冲' + POS_CN[r.to]; });
    var zhiHe = relations.list.filter(function (r) { return r.type === '地支六合'; })
      .map(function (r) { return POS_CN[r.from] + '合' + POS_CN[r.to]; });

    // ---- 三合 / 两汇
    //   三合 = 某局三支全现；两汇 = 只现两支（缺一支），
    //   顺序按四柱「时→日→月→年」出现序（参考图两案例验证：辰子、午寅）
    var branchSeq = have.map(function (p) { return p.zhi; });
    var sanhe = [], lianghui = [];
    (D.SANHE_JU || []).forEach(function (ju) {
      var present = ju.branches.filter(function (b) { return branchSeq.indexOf(b) >= 0; });
      if (present.length === 3) {
        sanhe.push(ju.name + present.join(''));
      } else if (present.length === 2) {
        lianghui.push(present.slice().sort(function (a, b) {
          return branchSeq.indexOf(a) - branchSeq.indexOf(b);
        }).join(''));
      }
    });

    return {
      // 首段年龄 = 测算时刻相对出生的年数（rec.age.sui，即 ① 的「岁月·岁」）。
      //   ⚠ 参考图逐字对拍锁定该口径（1982 → 「43.7岁，乾造1爻…」），
      //     故**不改口径**；仅加空值守卫 —— 测算年早于出生年时
      //     rec.age.sui 为 null（见 calendar.js 的 age 计算），
      //     此时改以本命年龄（natalBase.age.sui）兜底，仍无则省略该段。
      text: (function () {
        var a = (rec.age && rec.age.sui !== null && rec.age.sui !== undefined)
          ? rec.age.sui : null;
        // 兜底：测算年早于出生年时 rec.age.sui 为 null →
        //   本命年龄 = 出生年 − 出生年 = 0（该情形下本命即 0 岁基准）
        if (a === null) a = 0;
        return a.toFixed(1) + '岁，';
      })()
        + (zaobie || '') + '，'                                 // 造别 + 爻位，如「乾造1爻」
        + (rec.pillars.time ? '' : '（缺时辰）')
        + (yangCount > yinCount ? '四柱偏阳' : (yinCount > yangCount ? '四柱偏阴' : '四柱平衡')) + '；'
        + (seasonList.length === 4 ? '四季俱全' : '四季见' + seasonList.join('')) + '；'
        + (wxList.length === 5 ? '五行俱全' : '五行见' + wxList.join('')) + '；'
        + '天干：' + (ganRepeat.join('、') || '无重复') + '，'
        + (ganChong.length ? ganChong.join('、') : '无相冲') + '，'
        + (ganHe.length ? ganHe.join('、') : '无相合') + '；'
        + '地支：' + (zhiChong.length ? zhiChong.join('、') : '无相冲') + '，'
        + (zhiHe.length ? zhiHe.join('、') : '无相合') + '；'
        + '三合：' + (sanhe.length ? sanhe.join('、') : '无') + '，'
        + '两汇：' + (lianghui.length ? lianghui.join('、') : '无') + '。',
      field_status: 'conditional',
      rule_id: 'LSY-BASE-GANZHI',
      note: '统计规则可由已确认字典推导。「两汇」口径原由参考图两案例反推'
        + '（三合局缺一支的对，按四柱时→日→月→年出现序）——**现已由正式算法确证**：'
        + 'S3-连山易局态判定规则与算法建模.md:9-12「半局=四大局严格缺一字」（12 种派生，:30-34），'
        + '与参考图两案例（辰子、午寅）一致 → 见 LSY-BASE-SANHE-001。'
        + '「五行俱全」口径经穷举 8 种候选确认：天干五行 + 地支藏干五行。'
        + '表达层用语需限定为课程类象，不得升级为确定性人格结论（KB-MVP-005）。',
      counts: {
        yang: yangCount, yin: yinCount,
        seasons: seasonList, wuxing: wxList,
        ganRepeat: ganRepeat, ganChong: ganChong, ganHe: ganHe,
        zhiChong: zhiChong, zhiHe: zhiHe,
        sanhe: sanhe, lianghui: lianghui
      }
    };
  }

  // ==================================================== 字段收集
  function collectFields(pillars, natal, relations) {
    var out = [];
    pillars.forEach(function (p) {
      ['gan_f', 'zhi_f', 'xun_f', 'yao_f', 'kong_f', 'gu_f', 'changWangMu_f', 'gongSha_f',
        'xiaSha_f', 'tianFu_f', 'talismanStatic_f', 'yinYang_f', 'zhiAttr_f', 'ganSeason_f'].forEach(function (k) {
          if (p[k]) out.push(p[k]);
        });
    });
    ['guiFuCai', 'tianZei', 'youQi', 'gongZhongShou', 'ruMuJue'].forEach(function (k) {
      if (natal[k] && natal[k].value !== undefined || (natal[k] && natal[k].field_status)) out.push(natal[k]);
    });
    if (relations.sanhe) out.push(relations.sanhe);
    return out;
  }

  return {
    build: build,
    inputGate: inputGate,
    buildRelations: buildRelations,
    buildTalismanTable: buildTalismanTable,
    buildTimeLayer: buildTimeLayer
  };
});
