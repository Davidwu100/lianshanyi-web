/*!
 * 连山易 · 出生地点分级选择数据
 * 这是输入辅助数据，不是连山易规则；经度仍由 city-longitude.js 提供。
 * 层级：大州 → 国家/地区 → 省/州 → 城市/县。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./city-longitude.js'));
  else {
    root.LSY = root.LSY || {}; root.LSY.data = root.LSY.data || {};
    root.LSY.data.birthPlaces = factory(root.LSY.data.city);
  }
})(typeof self !== 'undefined' ? self : this, function (cityData) {
  'use strict';
  var allChina = Object.keys((cityData && cityData.CITIES) || {});
  var outsideChina = ['香港', '澳门', '台北', '新竹', '台中', '台南', '高雄', '新加坡', '吉隆坡'];
  var chinaNames = allChina.filter(function (n) { return outsideChina.indexOf(n) < 0; });
  var by = function (names) { return names.filter(function (n) { return allChina.indexOf(n) >= 0; }); };
  var china = {
    '北京市': by(['北京']), '上海市': by(['上海']), '天津市': by(['天津']), '重庆市': by(['重庆']),
    '河北省': by(['石家庄', '唐山', '保定', '廊坊', '秦皇岛', '邯郸', '邢台', '沧州', '承德', '张家口', '衡水', '定州']),
    '山西省': by(['太原', '大同', '临汾', '运城', '长治', '晋城', '晋中', '阳泉', '忻州']),
    '辽宁省': by(['沈阳', '大连', '鞍山', '抚顺', '本溪', '锦州', '营口', '丹东', '盘锦']),
    '吉林省': by(['长春', '吉林', '四平', '通化', '延吉', '松原', '白城']),
    '黑龙江省': by(['哈尔滨', '齐齐哈尔', '大庆', '牡丹江', '佳木斯', '鸡西', '双鸭山', '伊春', '七台河', '鹤岗', '黑河', '绥化']),
    '江苏省': by(['南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州', '盐城', '泰州', '镇江', '连云港', '淮安', '宿迁']),
    '浙江省': by(['杭州', '宁波', '温州', '嘉兴', '绍兴', '台州', '金华', '湖州', '衢州', '丽水', '舟山', '义乌', '慈溪']),
    '安徽省': by(['合肥', '芜湖', '蚌埠', '安庆', '马鞍山', '阜阳', '六安', '宿州', '淮南', '淮北', '铜陵', '黄山']),
    '福建省': by(['福州', '厦门', '泉州', '漳州', '莆田', '三明', '南平', '龙岩', '宁德']),
    '江西省': by(['南昌', '九江', '赣州', '景德镇', '上饶', '宜春', '吉安', '抚州', '萍乡', '新余', '鹰潭']),
    '山东省': by(['济南', '青岛', '烟台', '潍坊', '淄博', '临沂', '济宁', '泰安', '威海', '东营', '日照', '德州', '聊城', '菏泽', '枣庄', '滨州']),
    '河南省': by(['郑州', '洛阳', '开封', '新乡', '安阳', '焦作', '平顶山', '许昌', '漯河', '南阳', '信阳', '商丘', '周口', '驻马店', '三门峡', '濮阳']),
    '湖北省': by(['武汉', '宜昌', '襄阳', '荆州', '黄石', '十堰', '孝感', '荆门', '黄冈', '咸宁', '随州', '恩施']),
    '湖南省': by(['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德', '郴州', '邵阳', '益阳', '永州', '怀化', '娄底', '张家界']),
    '广东省': by(['广州', '深圳', '珠海', '汕头', '佛山', '东莞', '中山', '惠州', '江门', '湛江', '肇庆', '茂名', '揭阳', '潮州', '梅州', '清远', '韶关', '阳江', '河源', '汕尾', '云浮']),
    '海南省': by(['海口', '三亚', '儋州', '琼海']), '四川省': by(['成都', '绵阳', '德阳', '宜宾', '南充', '泸州', '乐山', '自贡', '攀枝花', '内江', '遂宁', '眉山', '广元', '达州', '雅安', '西昌']),
    '贵州省': by(['贵阳', '遵义', '六盘水', '安顺', '毕节', '凯里', '都匀', '铜仁']), '云南省': by(['昆明', '曲靖', '玉溪', '大理', '丽江', '保山', '昭通', '普洱', '红河', '西双版纳', '楚雄', '文山']),
    '陕西省': by(['西安', '宝鸡', '咸阳', '渭南', '汉中', '榆林', '延安', '安康', '铜川', '商洛']), '甘肃省': by(['兰州', '天水', '白银', '酒泉', '张掖', '武威', '平凉', '庆阳', '定西', '嘉峪关', '金昌', '陇南']),
    '青海省': by(['西宁', '格尔木', '海东', '德令哈']), '宁夏回族自治区': by(['银川', '石嘴山', '吴忠', '固原', '中卫']),
    '新疆维吾尔自治区': by(['乌鲁木齐', '克拉玛依', '喀什', '伊宁', '库尔勒', '哈密', '吐鲁番', '阿克苏', '石河子', '和田', '阿勒泰', '塔城', '博乐']),
    '西藏自治区': by(['拉萨', '日喀则', '林芝', '昌都', '阿里'])
  };
  var used = Object.keys(china).reduce(function (a, k) { return a.concat(china[k]); }, []);
  china['其他省市/县'] = chinaNames.filter(function (n) { return used.indexOf(n) < 0; });

  var tree = {
    '亚洲': {
      '中国': china, '中国香港': { '香港特别行政区': ['香港'] }, '中国澳门': { '澳门特别行政区': ['澳门'] }, '中国台湾': { '台湾地区': ['台北', '新竹', '台中', '台南', '高雄'] },
      '日本': { '东京都': ['东京'], '大阪府': ['大阪'], '京都府': ['京都'], '爱知县': ['名古屋'], '福冈县': ['福冈'], '北海道': ['札幌'] },
      '韩国': { '首尔特别市': ['首尔'], '釜山广域市': ['釜山'] }, '泰国': { '曼谷': ['曼谷'] }, '印度尼西亚': { '雅加达': ['雅加达'] }, '菲律宾': { '马尼拉': ['马尼拉'] }, '越南': { '河内': ['河内'], '胡志明市': ['胡志明市'] }, '缅甸': { '仰光': ['仰光'] }, '阿联酋': { '迪拜': ['迪拜'] }, '印度': { '马哈拉施特拉邦': ['孟买'], '德里': ['新德里'] }, '俄罗斯': { '莫斯科州': ['莫斯科'] }
    },
    '欧洲': { '英国': { '英格兰': ['伦敦'] }, '法国': { '法兰西岛大区': ['巴黎'] }, '德国': { '柏林州': ['柏林'] }, '意大利': { '拉齐奥大区': ['罗马'], '伦巴第大区': ['米兰'] }, '西班牙': { '马德里自治区': ['马德里'] }, '荷兰': { '北荷兰省': ['阿姆斯特丹'] }, '瑞士': { '苏黎世州': ['苏黎世'] }, '奥地利': { '维也纳州': ['维也纳'] }, '瑞典': { '斯德哥尔摩省': ['斯德哥尔摩'] } },
    '北美洲': { '美国': { '纽约州': ['纽约'], '加利福尼亚州': ['洛杉矶', '旧金山'], '华盛顿州': ['西雅图'], '伊利诺伊州': ['芝加哥'], '马萨诸塞州': ['波士顿'], '哥伦比亚特区': ['华盛顿'], '得克萨斯州': ['休斯敦'] }, '加拿大': { '安大略省': ['多伦多'], '不列颠哥伦比亚省': ['温哥华'] } },
    '大洋洲': { '澳大利亚': { '新南威尔士州': ['悉尼'], '维多利亚州': ['墨尔本'] }, '新西兰': { '奥克兰大区': ['奥克兰'] } },
    '非洲': { '埃及': { '开罗省': ['开罗'] }, '南非': { '豪登省': ['约翰内斯堡'] } },
    '南美洲': { '巴西': { '圣保罗州': ['圣保罗'] } }
  };
  var sort = function (a) { return a.slice().sort(function (x, y) { return x.localeCompare(y, 'zh-CN'); }); };
  function continents() { return Object.keys(tree); }
  function countries(c) { return tree[c] ? sort(Object.keys(tree[c])) : sort(Object.keys(tree).reduce(function (a, k) { return a.concat(Object.keys(tree[k])); }, [])); }
  function regions(c, country) { var x = tree[c] && tree[c][country]; return x ? sort(Object.keys(x)) : []; }
  function places(c, country, region) { var x = tree[c] && tree[c][country]; return x && x[region] ? sort(x[region]) : []; }
  function search(q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return [];
    var out = [];
    continents().forEach(function (c) { Object.keys(tree[c]).forEach(function (country) {
      var countryText = country.toLowerCase();
      var countryRank = countryText === q ? 0 : (countryText.indexOf(q) === 0 ? 1 : (countryText.indexOf(q) >= 0 ? 2 : 9));
      if (countryRank < 9) out.push({ kind: 'country', continent: c, country: country, region: '', place: '', rank: countryRank });
      Object.keys(tree[c][country]).forEach(function (region) {
        var regionText = region.toLowerCase();
        var regionRank = regionText === q ? 0 : (regionText.indexOf(q) === 0 ? 1 : (regionText.indexOf(q) >= 0 ? 2 : 9));
        if (regionRank < 9) out.push({ kind: 'region', continent: c, country: country, region: region, place: '', rank: regionRank });
        tree[c][country][region].forEach(function (place) {
          var hay = (place + ' ' + region + ' ' + country + ' ' + c).toLowerCase(); var rank = place.toLowerCase() === q ? 0 : (place.toLowerCase().indexOf(q) === 0 ? 1 : (hay.indexOf(q) >= 0 ? 2 : 9));
          if (rank < 9) out.push({ kind: 'place', continent: c, country: country, region: region, place: place, rank: rank });
        });
      });
    }); });
    return out.sort(function (a, b) { return a.rank - b.rank || (a.place || a.region || a.country).localeCompare(b.place || b.region || b.country, 'zh-CN'); }).slice(0, 12);
  }
  return { tree: tree, continents: continents, countries: countries, regions: regions, places: places, search: search, _status: 'external', _note: '分级目录仅作出生地点输入辅助；经度与时区按各自数据/用户输入处理。' };
});
