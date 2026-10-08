
// ===== iframe/names-patch.js =====
/**
 * FMGC Names Patch - Chinese Names Generator with Context Routing
 *
 * ============================================================
 * 架构说明
 * ============================================================
 *
 * 不再全局 patch FMG 的 Names 通用方法（getCulture/getBase 等被 8+ 种实体共用，
 * 硬设一个固定返回词库必然导致张冠李戴）。
 *
 * 新方案：
 *   1. ChineseNames —— 独立于 FMG 的中文名称生成器，每种实体类型一个独立函数
 *      对应 fmgc/features/names/wordbanks/default/ 下的一个 JSON 配置文件（10 个文件 = 10 个函数）
 *
 *   2. 上下文路由 —— 在每个 FMG 模块的 generate() 执行期间，临时把 FMG 的 Names 方法
 *      "劫持"到 ChineseNames 对应的生成函数。执行完立即恢复原状。
 *
 *   3. MODULE_INTERCEPTS —— 配置驱动的拦截表，描述每个 FMG 模块执行期间
 *      需要把哪些 FMG Names 方法指向哪个 ChineseNames 生成函数。
 *
 * ============================================================
 * 1:1 映射（每个实体类型 ↔ 一个配置文件 ↔ 一个生成函数）
 * ============================================================
 *
 *   culture   → culture.json   → ChineseNames.getCulture()
 *   state     → state.json     → ChineseNames.getState()
 *   burg      → burg.json      → ChineseNames.getBurg()
 *   province  → province.json  → ChineseNames.getProvince()
 *   river     → river.json     → ChineseNames.getRiver()
 *   lake      → lake.json      → ChineseNames.getLake()
 *   mapName   → mapName.json   → ChineseNames.getMapName()
 *   religion  → religion.json  → ChineseNames.getReligion()   ← 本轮新增
 *   marker    → marker.json    → ChineseNames.getMarker()     ← 本轮新增
 *   zone      → zone.json      → ChineseNames.getZone()       ← 本轮新增
 *
 * ============================================================
 * MODULE_INTERCEPTS（FMG 内部事实，描述 FMG 的调用点）
 * ============================================================
 *
 *   Cultures.generate()    → 劫持 Names.getBase/getBaseShort → ChineseNames.getCulture
 *   Burgs.generate()       → 劫持 Names.getCulture/getCultureShort → ChineseNames.getBurg
 *   States.generate()      → 劫持 Names.getState → ChineseNames.getState
 *   Provinces.generate()   → 劫持 Names.getState → ChineseNames.getProvince
 *   Rivers.specify()       → 劫持 Names.getCulture → ChineseNames.getRiver   ⚠️ 不是 generate
 *   Lakes.defineNames()    → 劫持 Names.getCulture → ChineseNames.getLake    ⚠️ 不是 generate
 *   Religions.generate()   → 劫持 Names.getCulture/getCultureShort → ChineseNames.getReligion
 *   Markers.generate()     → 劫持 Names.getCulture/getCultureShort → ChineseNames.getMarker
 *   Zones.generate()       → 劫持 Names.getCultureShort → ChineseNames.getZone
 *
 * FMG 模块外独立补丁：
 *   States.getFullName()   → 消除 "${formName} of ${name}" 模板，返回纯 state.name
 *   Names.getMapName()     → 独立覆盖
 *
 * ============================================================
 * 为什么这个方案是对的
 * ============================================================
 *
 *   ✅ 10 个实体类型 ↔ 10 个前端 JSON ↔ 10 个 ChineseNames 函数 —— 纯 1:1
 *   ✅ 零 fallback —— 每种实体要么有自己的配置文件，要么就不处理
 *   ✅ 配置目录通过 manifest.json 的 profile 字段传递 —— 方便以后扩展其他风格
 *   ✅ FMG 所有模块 generate() 都是纯同步（已验证无 async/await）— try/finally 安全
 *   ✅ 不修改 FMG 源码
 */
(function () {
  'use strict';

  // ============================================================
  // 日志工具
  // ============================================================
  var TAG = '%c[FMGC Names]';
  var STYLE = 'color:#10b981;font-weight:bold';
  var STYLE_DEBUG = 'color:#6b7280';
  var STYLE_WARN = 'color:#f59e0b;font-weight:bold';
  var STYLE_ERROR = 'color:#ef4444;font-weight:bold';

  var LOG = {
    // info: 默认输出 console.log（绿色加粗），可用 window.__FMGC_NAMES_VERBOSE__=false 关闭
    info: function () {
      if (window.__FMGC_NAMES_VERBOSE__ === false) return;
      console.log(TAG, STYLE, '[INFO]', Array.prototype.slice.call(arguments).join(' '));
    },
    // debug: 仅在 DEBUG=true 时输出（灰色），默认关闭
    debug: function () {
      if (!DEBUG) return;
      console.log(TAG, STYLE_DEBUG, '[DEBUG]', Array.prototype.slice.call(arguments).join(' '));
    },
    warn: function () { console.warn(TAG, STYLE_WARN, '[WARN]', Array.prototype.slice.call(arguments).join(' ')); },
    error: function () { console.error(TAG, STYLE_ERROR, '[ERROR]', Array.prototype.slice.call(arguments).join(' ')); }
  };

  var DEBUG = false;
  var SAMPLE_LIMIT = 5;

  // wrap 函数字典 —— 必须在 IIFE 顶部声明，_registerWrap 在 L930 就被调用
  var _WRAP_FUNCTIONS = {};

  // 名称生成计数器
  var counters = {};
  function incCounter(key) { counters[key] = (counters[key] || 0) + 1; return counters[key]; }

  // ============================================================
  // 词库数据 —— post-build 编译注入
  // ============================================================
  var WORD_BANKS_RAW = "{\"_profile\":\"default\",\"_forbidden\":{\"roots\":[\"诛仙\",\"青云门\",\"焚香谷\",\"万毒门\",\"鬼王宗\",\"合欢派\",\"御剑\",\"飞升\",\"渡劫\",\"修真\",\"筑基\",\"金丹\",\"元婴\",\"化神\",\"修罗\",\"冥河\",\"血海\",\"精灵\",\"矮人\",\"半身人\",\"地精\",\"泰坦\",\"霍比特\",\"中土\",\"刚铎\",\"洛汗\",\"摩瑞亚\",\"精灵宝钻\",\"瓦坎达\",\"黑豹\",\"阿波罗\",\"雅典娜\",\"宙斯\",\"奥丁\",\"雷神\",\"联邦\",\"同盟\",\"苏维埃\",\"人民公社\",\"直辖市\",\"特别市\",\"丐帮皇朝\",\"武当帝国\",\"峨眉皇朝\",\"日月神教\",\"天地会皇朝\",\"斗罗大陆\",\"魂殿\",\"武魂殿\",\"北京\",\"上海\",\"广州\",\"深圳\",\"香港\",\"澳门\"],\"byType\":{\"state\":[\"联邦\",\"同盟\",\"政府\",\"共和国\",\"合众国\",\"王国\",\"公国\"],\"burg\":[\"直辖市\",\"特别市\",\"市辖区\",\"街道办事处\"]},\"legitDupOverride\":null},\"culture\":{\"names\":\"乐舞论,史传学,珪律论,天算观,格观,澜衡学,筠权家,琳衡学,地理家,考工观,珣衡家,论学,乐舞术,地理观,瑚律术,史家,瑾律学,术论,清术,瑚律家,格物学,琨鉴观,静观,史传术,琅鉴学,策衡学,筠权学,考工学,瑄律术,天家,澜衡术,格物家,珪律观,名辩家,珪律术,历律观,璞衡学,史传家,乐舞家,筠权术,史学,兵策家,名辩术,博弈论,珣衡观,博弈家,兵学,琨鉴家,历学,璞衡论\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"家\",\"学\",\"术\",\"论\",\"观\"],\"prefixPool\":[\"清\",\"静\",\"默\",\"元\",\"历\",\"律\",\"天\",\"地\",\"格\",\"致\",\"名\",\"辩\",\"术\",\"数\",\"策\",\"论\",\"文\",\"史\",\"兵\",\"医\"],\"lengthMin\":2,\"lengthMax\":4}},\"state\":{\"names\":\"大承帝国,商帝国,大顺王朝,大渝王朝,大晖王朝,大坤王朝,大梁帝国,大胤王朝,大治帝国,大宸帝国,大稷帝国,大宣王朝,大太帝国,大肃帝国,大靖帝国,大景帝国,大兴帝国,大安王朝,大曜帝国,大盛王朝,大光帝国,大明王朝,大隆帝国,大聿王朝,大平王朝,大崇王朝,大宁帝国,大开王朝,大玄王朝,大武王朝,大弘王朝,大文帝国,大昭王朝,大定帝国,大昊王朝,大燕帝国,大昌王朝,宋帝国,大乾帝国,大大王朝,大淳王朝,周王朝,大庆王朝,蜀帝国,大永帝国,大元帝国,蔡王朝,大苍帝国,大齐王朝,齐王朝,大诚王朝,大福王朝,大雍帝国,魏帝国,大端帝国,韩帝国,殷王朝,申帝国,大恭王朝,大嘉王朝,晋王朝,曹帝国,邓王朝,楚王朝,大柔帝国,大泰帝国,鲁王朝,隋帝国,大禧帝国,唐帝国,汉帝国,夏王朝,大温王朝,许帝国,大良帝国,秦帝国,大哲帝国,大睿王朝,卫王朝,郑帝国,陈帝国,燕王朝,大敬帝国,越王朝,赵王朝,吕王朝,梁帝国,吴王朝,大承皇朝,商皇朝,大顺皇朝,大渝皇朝,大晖皇朝,大承朝,大承国\",\"procedural\":{\"enabled\":true,\"extractSuffixes\":[\"皇朝\",\"王朝\",\"帝国\",\"朝\",\"国\"],\"generator\":\"prefix-suffix\",\"prefixPool\":[\"万岁登封\",\"万岁通天\",\"上元\",\"东吴\",\"东周\",\"东晋\",\"东汉\",\"中兴\",\"中和\",\"中大同\",\"中大通\",\"久视\",\"义宁\",\"义熙\",\"乾元\",\"乾兴\",\"乾化\",\"乾封\",\"乾德\",\"乾符\",\"乾道\",\"仁寿\",\"仪凤\",\"会昌\",\"元丰\",\"元兴\",\"元和\",\"元嘉\",\"元徽\",\"元祐\",\"元符\",\"光初\",\"光启\",\"光和\",\"光大\",\"光天\",\"光宅\",\"光平\",\"光武\",\"光熙\",\"兴元\",\"前秦\",\"北凉\",\"北宋\",\"北燕\",\"北魏\",\"升明\",\"南凉\",\"南唐\",\"南宋\",\"南齐\",\"同光\",\"后周\",\"后秦\",\"周\",\"咸亨\",\"咸平\",\"咸淳\",\"咸通\",\"唐\",\"商\",\"嘉定\",\"嘉泰\",\"嘉熙\",\"嘉祐\",\"嘉禾\",\"圣历\",\"垂拱\",\"夏\",\"大业\",\"大中\",\"大中祥符\",\"大乾\",\"大光\",\"大历\",\"大同\",\"大和\",\"大坤\",\"大宁\",\"大宇\",\"大宙\",\"大宝\",\"大宣\",\"大平\",\"大庆\",\"大康\",\"大弘\",\"大承\",\"大文\",\"大昊\",\"大昌\",\"大明\",\"大晟\",\"大曜\",\"大正\",\"大武\",\"大永\",\"大熙\",\"大瑞\",\"大祥\",\"大禧\",\"大衍\",\"大观\",\"大足\",\"大通\",\"大靖\",\"大顺\",\"天会\",\"天佑\",\"天兴\",\"天册万岁\",\"天历\",\"天嘉\",\"天圣\",\"天宝\",\"天庆\",\"天康\",\"天成\",\"天授\",\"天监\",\"天盛\",\"天祐\",\"天禄\",\"天福\",\"天禧\",\"天顺\",\"太元\",\"太始\",\"太平\",\"太平兴国\",\"太建\",\"太极\",\"太清\",\"如意\",\"始兴\",\"孝建\",\"宋\",\"宝元\",\"宝历\",\"宝庆\",\"宝应\",\"宝祐\",\"宣和\",\"崇兴\",\"崇宁\",\"崇文\",\"崇武\",\"崇盛\",\"广德\",\"广明\",\"广顺\",\"庆元\",\"庆历\",\"应顺\",\"康定\",\"延康\",\"延载\",\"建中\",\"建中靖国\",\"建元\",\"建安\",\"建武\",\"建炎\",\"建隆\",\"开元\",\"开兴\",\"开宝\",\"开平\",\"开庆\",\"开成\",\"开泰\",\"开皇\",\"开禧\",\"开耀\",\"开运\",\"弘道\",\"德祐\",\"总章\",\"承圣\",\"承天\",\"承安\",\"承平\",\"承德\",\"承运\",\"政和\",\"文德\",\"明\",\"明道\",\"昭武\",\"显庆\",\"显德\",\"普通\",\"景云\",\"景和\",\"景定\",\"景平\",\"景德\",\"景明\",\"景泰\",\"景炎\",\"景熙\",\"景祐\",\"景耀\",\"景隆\",\"景龙\",\"正始\",\"武德\",\"永乐\",\"永元\",\"永初\",\"永和\",\"永宁\",\"永安\",\"永定\",\"永平\",\"永康\",\"永徽\",\"永昌\",\"永明\",\"永泰\",\"永淳\",\"永熙\",\"永贞\",\"永隆\",\"永顺\",\"汉\",\"治平\",\"泰和\",\"泰始\",\"泰安\",\"泰定\",\"泰州\",\"泰昌\",\"淳化\",\"淳熙\",\"淳祐\",\"清\",\"清泰\",\"熙宁\",\"皇祐\",\"神功\",\"神龙\",\"祥兴\",\"祯明\",\"秦\",\"端平\",\"端拱\",\"绍兴\",\"绍圣\",\"绍定\",\"绍熙\",\"至和\",\"至德\",\"至道\",\"西凉\",\"西周\",\"西晋\",\"西楚\",\"西汉\",\"证圣\",\"调露\",\"贞元\",\"贞明\",\"贞观\",\"赤乌\",\"载初\",\"重和\",\"长乐\",\"长兴\",\"长安\",\"长寿\",\"长庆\",\"长康\",\"长永\",\"长顺\",\"隆兴\",\"隆安\",\"隋\",\"雍熙\",\"青龙\",\"靖康\",\"麟德\",\"黄初\",\"黄武\",\"黄龙\",\"龙德\",\"龙朔\"]}},\"burg\":{\"names\":\"柿林乡,幽谷府,石竹市场,玉竹垣,偏谷,山地坊,飞瀑浦,墨林市,潼关广场,槐林轩,朱门铺,柿林市场,浅滩殿,丹丘场,潼关驿,浅滩楼,乌梅埠,宁武关场,阳关乡,杀虎口堂,娘子关驿,平型关集,青榕塔,榆林区,楠竹浦,蕉丘乡,函谷关楼,丘陵坡,幽谷寨,梧桐渡,杨林街,寒泉坞,杏花坞,高崖馆,红梅寨,书崖驿,麟陂街,松坡中心,泪竹浦,沼泽区,红梅府,松林市场,翠柳集,铜官巷,松林乡,阳关陂,石竹塔,高原宫,银山汀,棕榈谷,剑门关店,慈竹城,椒丘巷,慈竹洞,蕉丘市场,金汤铺,玉垣区,金堂浦,苦竹府,雁门关乡,铁山坞,枫林铺,黄石店,苦竹塔,榆关村,梨花县,紫竹谷,竹林垣,险滩陂,青榕寨,榆林埠,梅花市,娄山关埠,荷浦陂,深渊站,铜官坡,梅花乡,金汤埠,枣林堡,紫竹院,娘子关县,急流轩,湘竹汀,断崖堂,黄石楼,散关村,萧关县,大散关港,蓝关乡,玉垣铺,铁山区,青田乡,赤冈村,温汤宫,山地里,高崖堡,柏林村,赤峡,蓝关寨,棕榈关,玉门中心,雁门关寨,斑竹场,银桂驿,娄山关铺,杀虎口渡,金桂铺,杉林店,柏林街,潼关市,麟陂区,青竹院,金竹馆,书崖渡,泪竹殿,棉坞县,武关堡,杨林村,杏林驿,玉门垣,兰汀广场,槐林广场,张家口馆,荷浦巷,丘陵馆,朱门轩,急流埠,青榕城,红棉场,木竹区,雁门关塔,散关街,盆地浦,青田塔,腊梅场,翠竹堂,函谷关区,赤冈阁,甜竹宫,丹桂关,蓝关市场,飞瀑楼,断崖峡,武关镇,柳林港,银竹城,金桂轩,古北口铺,偏关站,幽涧馆,青梅港,黄石港,青梅楼,丹丘镇,湿地陂,白梅宫,松坡镇,竹林中心,紫竹区,喜峰口店,松坡堡,洼地中心,杀虎口驿,甜竹阁,朱门埠,梧桐县,温汤汀,紫府堂,腊梅馆,金堂区,赤冈坡,墨林站,麟陂村,洼地洞,赤冈集,翠柳村,碧梧店,柳林巷,方竹堂,榆关街,泪竹广场,平原区,山地营,枫林区,白梅集,盆地殿,苦竹坞,金堂广场,石竹峡,山地府,险滩峡,喜峰口楼,翠竹渡,张家口堡,丹丘堡,飞瀑殿,青梅殿,梓坞集,枣林中心,荷浦阁,金汤区,棉坞驿,红棉堡,武关中心,慈竹轩,方竹峡,柏林屯,湿地峡,梓坞街,潼关,青竹谷,丹桂站,绝壁院,翠柳阁,梨花汀,偏关阁,木竹谷,沼泽街,乌梅轩,枣林镇,大散关巷,椒丘港,椒丘店,木竹街,玉竹洞,杨林集,兰汀市,杏林县,金竹坡,乌梅洞,深潭轩,方竹陂,大散关店,喜峰口港,独石口站,杏花区,碧梧港,深谷阁,湘竹宫,娘子关渡,荷浦店,断崖渡,古北口轩,山地坞,青竹站,玉门镇,竹林镇,幽涧场,宁武关镇,平原院,绝壁谷,深潭洞,山地城,墨林关,棕榈站,深渊院,深潭垣,红梅塔,书崖县,腊梅堡,急流洞,张家口场,寒泉塔,榆关区,碧梧楼,萧关驿,平型关村,平型关阁,柳林店,兰汀关,柏林区,平原谷,散关集,梧桐驿,高原汀,盆地广场,榆林铺,松林陂,青榕乡,红棉镇,银山县,绝壁站,桃花坡,楠竹楼,槐林关,娄山关区,石竹陂,湿地市场,梓坞村,深谷集,洼地垣,宁武关堡,独石口关,寒泉府,紫府渡,桃花巷,阳关市场,甜竹汀,蕉丘寨,棕榈市,紫府驿,沼泽谷,槐林市,斑竹坡,白梅阁,高崖场,青田寨,险滩堂,玉竹中心,偏关市,独石口院,柿林寨,银桂堂,浅滩港,银竹府,荷浦城,梅花浦,幽谷塔,金堂市,丹桂院,金桂埠,杉林巷,山地屯,楠竹殿,翠竹峡,慈竹垣,剑门关巷,深谷宫,古北口埠,斑竹馆,偏关,深渊关,银桂渡,银竹坞,梅花广场,温汤阁,函谷关铺,幽涧坡\",\"procedural\":{\"enabled\":true,\"generator\":\"doubled-root\",\"extractSuffixes\":[\"城\",\"镇\",\"县\",\"乡\",\"里\",\"关\",\"堡\",\"寨\",\"州\",\"郡\",\"府\",\"坊\",\"集\",\"店\",\"驿\",\"铺\",\"屯\",\"营\",\"渡\",\"浦\",\"场\",\"区\",\"村\",\"阁\",\"谷\",\"市\",\"轩\",\"楼\",\"埠\",\"塔\",\"街\",\"巷\",\"站\",\"港\",\"堂\",\"馆\",\"殿\",\"坞\",\"宫\",\"汀\",\"坡\",\"陂\",\"院\",\"峡\",\"垣\",\"洞\",\"中心\",\"泉\"],\"prefixPool\":[\"青\",\"赤\",\"白\",\"紫\",\"金\",\"玉\",\"银\",\"翠\",\"碧\",\"丹\",\"苍\",\"昊\",\"晟\",\"清\",\"明\",\"景\",\"昭\",\"润\",\"芳\",\"馥\",\"山\",\"谷\",\"林\",\"泽\",\"崖\",\"滩\",\"岛\",\"洲\",\"溪\",\"潭\",\"渊\",\"池\",\"泉\",\"桥\",\"渡\",\"港\",\"埠\",\"驿\",\"关\",\"堡\",\"寨\",\"屯\",\"营\",\"庄\",\"村\",\"店\",\"镇\",\"坊\",\"集\",\"市\",\"场\",\"园\",\"苑\",\"阁\",\"楼\",\"台\",\"亭\",\"轩\",\"堂\",\"馆\",\"院\",\"府\",\"宫\",\"殿\",\"塔\",\"洞\",\"观\",\"寺\",\"庵\",\"祠\",\"庙\",\"陵\",\"墓\",\"冢\",\"丘\",\"坟\",\"阡\",\"陌\",\"径\",\"道\",\"路\",\"街\",\"巷\",\"城\",\"郭\",\"墙\",\"垣\",\"堑\",\"隘\",\"塞\",\"障\",\"烽\",\"燧\",\"垒\"],\"lengthMin\":2,\"lengthMax\":4}},\"province\":{\"names\":\"墨林府,玉垒郡,砚田道,坡北州,海隅省,墨渚省,榕荫省,岭西郡,渊上郡,兰洲郡,坡北府,玉关军,雨中郡,溪沿省,玉省,铜雀府,烟中道,梓坞道,砚田州,松崖州,飞檐军,雪中道,云中道,剑门郡,梧冈州,承露军,剑门州,椒丘道,霞中道,书崖府,玉垒省,飞檐州,雾中军,渚西郡,坡北省,兰洲军,溪沿府,渊上省,书浦省,梓坞州,镇南道,剑门道,棋岫军,金汤省,岭西省,坡北郡,墨林道,剑门省,瑾道,松崖府,墨渚军,书崖道,松崖军,望仙府,渊上州,笔岩军,墨渚郡,丹郡,江沿府,玉关省,琴坞道,梧冈省,桐洲军,梓坞省,椒丘府,书浦府,云中省,榕荫州,砚田省,桐洲府,海隅道,墨府,承露省,雨中道,渚西府,溪沿州,虎牢道,岭东道,承露道,玉关郡,书浦郡,墨林州,坡北道,铜雀军,银州,溪左道,梧塘省,墨林军,江右州,渊上道,溟东郡,岭西州,桐洲州,南省,溟东道,笔岩州,海隅府,承露府,海隅州,渊上府,铜雀郡,玉垒军,溟东州,书崖军,镇南州,南郡,兰洲府,金汤郡,飞檐郡,银省,笔岩道,石垣道,霞中省,石垣州,棋溪郡,铜雀省,椒丘郡,云中州,书崖郡,崖下州,琴坞省,墨渚道,玉关道,榕荫府,江右道,棋溪道,溪左军,雪中郡,溪沿道,椒丘州,雨中省,江右郡,岭西军,飞檐道,书浦州,梧塘道,书浦道,砚峡省,朱郡,梧塘郡,筱园郡,筱园府,雾中省,霞中府,椒塘军,棋岫省,望仙道,西省,玉关州,墨林省,江沿省,赤郡,铜雀道,砚峡郡,黛府,金汤州,筱园州,玉垒府,崖下军,溟东府,琴坞府,椒丘军,关北州,琴冈军,椒塘郡,雾中州,梧塘府,雾中府,关北道,梧冈府,关北军,紫郡,椒塘州,虎牢军,玉军,石垣省,望仙省,江右军,霞中州,黛郡,虎牢郡,梓坞府,金汤道,椒塘道,承露州,梓坞郡,砚峡府,椒塘府,梧塘军,溪左郡,玉道,渚西道,雨中州,渚西军,玉关府,砚峡州,金汤府,赤军,琴坞军,紫省,霞中军,棋溪省,玉垒道,江沿道,笔岩府\",\"procedural\":{\"enabled\":true,\"generator\":\"doubled-root\",\"extractSuffixes\":[\"特别行政区\",\"行政区\",\"自治州\",\"自治区\",\"开发区\",\"保税区\",\"经济区\",\"行省\",\"藩地\",\"领地\",\"藩邦\",\"藩属\",\"地区\",\"特区\",\"林区\",\"矿区\",\"新区\",\"省\",\"州\",\"郡\",\"府\",\"军\",\"道\",\"路\",\"司\",\"监\",\"市\",\"县\",\"旗\",\"盟\",\"都\",\"京\",\"部\"],\"prefixPool\":[\"东\",\"南\",\"西\",\"北\",\"中\",\"青\",\"赤\",\"白\",\"紫\",\"金\",\"玉\",\"银\",\"苍\",\"翠\",\"丹\",\"朱\",\"墨\",\"黛\",\"琚\",\"瑾\",\"京\",\"畿\",\"辅\",\"藩\",\"府\",\"州\",\"郡\",\"道\",\"路\",\"省\",\"部\",\"院\",\"司\",\"寺\",\"监\",\"署\",\"局\",\"厅\",\"委\",\"办\",\"处\",\"所\",\"区\",\"县\",\"市\",\"镇\",\"乡\",\"里\",\"亭\",\"长\",\"安\",\"宁\",\"康\",\"泰\",\"永\",\"平\",\"和\",\"昌\",\"盛\",\"兴\",\"隆\",\"仁\",\"义\",\"礼\",\"智\",\"信\",\"忠\",\"孝\",\"友\",\"睦\",\"敬\",\"诚\",\"谦\",\"恭\",\"俭\"],\"lengthMin\":3,\"lengthMax\":7}},\"river\":{\"names\":\"寒波水,珪波源,兰漪源,青渚溪,潋滟河,芷漪沟,竹渚溪,浩瀚沟,清波江,白浪涧,长澜涧,玉澜河,凉波河,兰漪江,玉澜溪,碧波溪,长澜江,浩瀚源,怒涛源,珪波水,浩瀚水,金澜水,清波源,璧泓溪,潋滟江,凉波源,珪波涧,碧澜水,梅漪涧,寒波沟,竹渚川,白渚涧,紫渚水,白浪沟,桐澜水,桂澜江,潋滟沟,芷漪川,青渚涧,桂澜川,青渚源,枫澜涧,奔腾河,绿波江,澄波河,长澜溪,翠澜涧,碧澜源,竹漪涧,翠澜河,惊涛源,怒涛沟,玉泓河,芷漪江,奔腾涧,奔涛沟,柳澜江,玉泓川,翠澜沟,兰漪溪,奔腾溪,玉澜涧,浩瀚江,紫渚源,枫澜源,银波江,荷澜水,梅渚川,松澜沟,枫澜川,汹涌涧,翠澜江,竹漪川,紫渚江,桐澜河,梅渚溪,松澜源,金澜川,璧泓源,玉澜水,白渚水,长澜川,竹渚江,青渚沟,凉波水,金澜溪,碧波源,桐澜川,澎湃沟,竹漪水,澎湃溪,青渚河,怒涛溪,翠波涧,清波河,翠澜川,澄波源,梅漪江,碧波江,桂澜沟,清波溪,白渚源,凉波溪,竹渚源,璧泓川,寒波源,奔涛溪,惊涛川,梅漪溪,紫渚河,荷澜涧,桂澜溪,清波水,碧澜江,潋滟源,柳澜河,青渚江,绿浪源,珪波江,碧澜河,翠波沟,浩瀚涧,碧澜沟,奔腾水,潋滟水,汹涌沟,寒波河,凉波沟,白渚川,银波溪,金澜源,梅漪源,金澜江,梅漪河,松澜水,柳澜源,兰漪沟,竹渚水,银波涧,清波川,澎湃河,荷澜河,珠波水,银波川,惊涛溪,汹涌河,银波沟,翠波溪,桂澜源,柳澜川\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"河\",\"江\",\"水\",\"川\",\"溪\",\"涧\",\"沟\",\"源\",\"潭\",\"渊\",\"澜\",\"涛\",\"波\",\"池\",\"湖\",\"沼\",\"泽\",\"泉\",\"瀑\",\"湾\",\"渚\",\"汀\",\"滩\",\"岸\",\"渡\",\"桥\"],\"prefixPool\":[\"碧\",\"清\",\"翠\",\"深\",\"长\",\"澄\",\"明\",\"青\",\"玉\",\"银\",\"寒\",\"暖\",\"岚\",\"雾\",\"烟\",\"云\",\"雪\",\"雨\",\"霜\",\"露\"],\"directionalPool\":[\"东\",\"南\",\"西\",\"北\",\"阴\",\"阳\",\"上\",\"下\",\"内\",\"外\",\"前\",\"后\",\"左\",\"右\"],\"lengthMin\":2,\"lengthMax\":3}},\"lake\":{\"names\":\"银洲淀,方汀泽,青汀池,金汀海,方汀塘,银洲湖,桂屿塘,竹汀池,绿汀海,银洲海,兰渚淀,金汀泊,青汀湖,桂屿湖,桂屿泽,翠汀潭,青汀淀,方汀淀,枫屿潭,荷渚湖,玉洲淀,碧汀泊,竹汀海,竹汀塘,方汀池,芷渚塘,珪洲泊,玉汀塘,金汀淀,兰渚塘,方汀海,翠汀湖,绿汀淀,芷渚泊,翠汀塘,绿汀塘,玉汀潭,绿汀湖,珠洲塘,凉汀湖,碧汀泽,柳屿池,圆渚池,澄汀塘,珠洲海,璧岩泊,松屿海,翠汀海,梅汀潭,荷渚淀,松屿泊,绿汀泊,寒汀泊,银洲泽,珪洲湖,珪洲海,璧岩海,枫屿塘,桂屿池,珠洲湖,澄汀海,澄汀泽,碧汀池,银洲潭,竹汀泽,寒汀池,珠洲池,玉汀淀,璧岩池,寒汀湖,芷渚潭,竹汀湖,凉汀潭,桂屿淀,澄汀潭,兰渚泽,青汀海,珪洲泽,梅汀湖,寒汀潭\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"湖\",\"海\",\"池\",\"泽\",\"淀\",\"泊\",\"潭\",\"塘\"],\"prefixPool\":[\"碧\",\"翠\",\"清\",\"澄\",\"金\",\"银\",\"玉\",\"黛\",\"澜\",\"静\",\"平\",\"远\",\"寒\",\"暖\",\"绿\",\"青\",\"紫\",\"赤\",\"白\",\"玄\"],\"lengthMin\":2,\"lengthMax\":3}},\"mapName\":{\"names\":\"昊穹录,麟德图,龙德纪,清穹表,海内集,乾坤史,清穹序,八荒史,无极表,寰宇志,玄冥纪,昊穹志,玄冥经,近古传,中原经,麟德表,宇内图,龙朔考,六合史,乾坤表,大荒录,苍冥集,曜穹史,清穹纪,上古序,无极序,太素序,今古志,太素史,昊穹经,大荒纪,远古传,寰中考,玄穹经,玄穹纪,寰宇传,凤历传,宇内表,太极志,龙德经,龙德志,近古录,凤历集,昊旻经,麟德传,太素图,天寰录,中古集,远古录,曜穹序,苍冥纪,太初图,玄穹集,昊穹史,上古录,宇内史,寰宇考,昊旻图,中原志,海内考\",\"procedural\":{\"enabled\":true,\"generator\":\"dual-pool\",\"extractSuffixes\":[\"纪\",\"志\",\"图\",\"经\",\"录\",\"史\",\"集\",\"考\",\"表\",\"序\",\"传\"],\"prefixPool\":[\"玄\",\"苍\",\"昊\",\"大\",\"极\",\"无\",\"太\",\"紫\",\"清\",\"玉\",\"天\",\"辰\",\"曜\",\"九\",\"万\",\"千\",\"百\",\"亿\",\"地\"],\"roots\":[\"世界\",\"天下\",\"华夏\",\"九州\",\"疆土\",\"海内\",\"八荒\",\"六合\",\"宇内\",\"寰中\",\"乾坤\",\"大荒\",\"中原\",\"华夷\",\"方舆\",\"版图\",\"疆域\",\"山河\",\"神州\",\"赤县\",\"中土\",\"中国\",\"四海\",\"大地\",\"江山\"],\"lengthMin\":2,\"lengthMax\":4}},\"religion\":{\"names\":\"幽鉴社,琼瑛道,法衡坛,律衡经,皓衡坛,幽鉴宫,璧瑛宫,律衡会,律衡坛,琼瑛庙,太玄教,冥律教,玄瑛社,咒衡道,灵瑛会,法衡庙,琼瑛教,辰衡祠,曜鉴经,玄瑛祠,律衡祠,戒衡道,珠瑛道,咒衡教,灵瑛教,玄真道,金宸道,玄瑛坛,太玄道,金宸经,琼瑛经,玄真教,玄律会,戒衡经,玄瑛会,金宸庙,辰衡社,晨衡宫,律衡教,璇衡社,太玄坛,幽鉴典,琼瑛典,法衡典,律衡典,皓衡典,幽鉴志,琼瑛志,法衡志,律衡志,皓衡志,幽鉴纪,琼瑛纪,法衡纪,律衡纪,皓衡纪,幽鉴传,琼瑛传,法衡传,律衡传,皓衡传,幽鉴诗,琼瑛诗,法衡诗,律衡诗,皓衡诗\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"教\",\"道\",\"经\",\"坛\",\"宫\",\"祠\",\"庙\",\"会\",\"社\",\"典\",\"志\",\"纪\",\"传\",\"诗\",\"礼\"],\"prefixPool\":[\"澜\",\"筠\",\"衡\",\"鉴\",\"珪\",\"璟\",\"珣\",\"瑄\",\"琨\",\"琳\",\"瑾\",\"琅\",\"珩\",\"琮\",\"瑚\",\"璞\",\"璇\",\"辰\",\"曜\",\"玉\"],\"lengthMin\":2,\"lengthMax\":4}},\"marker\":{\"names\":\"鹰影洞,孤岫丘,黄岫崖,深岫峰,鹤栖峰,鳌窟陵,赤岫谷,孤岫滩,翠岫陵,蝉蜕台,兔穴滩,龙脊礁,虎穴峰,虫窠滩,鸥影洞,莺影礁,鹏翅陵,白岫滩,凤巢陵,苍岫崖,龙脊洞,凤翼岭,黄岫礁,龙脊崖,龙脊陵,兔穴台,墨岫岭,鹤栖山,兔穴陵,苍岫台,白岫台,霞冈谷,玄岫滩,狐窟滩,鹤栖岭,雾冈陵,赤岫丘,幽岫岭,虫窠峰,远岫礁,鲸影谷,鹿栖岛,龙脊岛,狐窟洞,鹰影峰,远岫山,鹊巢礁,凤翼陵,云巅礁,丹岫丘,鹿栖礁,鸥影峰,鹿栖山,丹岫岛,白岫岭,莺影崖,碧岫丘,龙脊峰,虎斑陵,丹岫滩,鲲影陵,鸦巢陵,黄岫岛,孤岫山,鹿栖台,紫岫丘,雁影陵,鸦巢峰,虫窠岛,碧岫山,龙鳞峰,龙窟洞,幽岫丘,鳌窟岛,危岫滩,翠岫岛,黄岫丘,麟甲峰,烟岫陵,麟甲山,青岫陵,危岫峰,兔穴谷,凤翼崖,虎斑山,凤巢滩,远岫岛,蛟窟洞,兔穴岭,雾冈峰,鹤翼岛,危岫山,蝶影崖,鹤栖丘,龙脊台,幽岫山,鹤栖洞,黄岫洞,奇岫礁,紫岫岛,鹤翼台,翠岫谷,孤岫礁,鹿角峰,玄岫岭,鸥影岛,紫岫礁,孤岫岭,远岫台,蛟窟滩,龙窟陵,鲸影崖,蛟窟谷,雁影山,蝶影岛,鲲翼峰,烟岫礁,碧岫峰,燕影谷,赤岫台,碧岫滩,虎斑丘,凤巢丘,危岫崖,鸥影台,蝉蜕峰,驹影峰,墨岫陵,凤翼谷,鹿角滩,蝉蜕礁,凤巢岭,虎穴台,鹤栖台,凤巢洞,龟背峰,深岫岭,莺影谷,霞冈山,鲲影丘,鲲翼丘,紫岫山,鹿栖崖,翠岫礁,凤翼台,燕影丘,鹰影岭,虎斑洞,雾冈礁,丹岫崖\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"山\",\"岭\",\"峰\",\"崖\",\"谷\",\"台\",\"洞\",\"礁\",\"滩\",\"岛\",\"丘\",\"陵\"],\"prefixPool\":[\"青\",\"赤\",\"白\",\"紫\",\"金\",\"玉\",\"银\",\"苍\",\"皓\",\"辰\",\"昊\",\"翠\",\"黛\",\"岫\",\"峰\",\"岚\",\"霞\",\"烟\",\"云\",\"雾\"],\"lengthMin\":2,\"lengthMax\":3}},\"zone\":{\"names\":\"齐鲁甸,关外壤,关东壤,边塞界,百里服,千岭防,冀并域,万里界,漠北圻,百里疆,海外防,中南区,华东地,漠南圻,千里圻,关东区,关外防,河洛区,千里地,塞上区,海东地,漠南畿,华南甸,江北域,千岭区,海西域,天边域,边塞域,关外服,海南界,万里地,内地壤,海西圻,万里服,关外畿,燕赵服,海西甸,塞上方,海北防,天边防,天边方,塞上服,漠南防,青徐地,关外疆,关外圻,吴越疆,塞北服,华北畿,江东地,江东服,关外方,海西畿,关西壤,塞外圻,千山区,漠南方,关东畿,塞外甸,千岭畿,漠南服,海东区,关西疆,千岭圻,天边甸,东北防,边塞地,千里防,海南甸,漠北甸,华中服,江南疆,万里畿,荆楚圻,华东圻,西域壤,关东圻,海西界,海北地,千里服,塞北圻,远甸,千岭方,塞上疆,天边服,百里甸,中原疆,漠北地,漠北疆,齐鲁防,兖豫疆,边陲防,吴越方,边疆域,塞上壤,关中防,百里区,塞北界,千岭地,海西方,海北壤,岭南畿,关东防,沿海界,海东畿,海北界,西南方,天边圻\",\"procedural\":{\"enabled\":true,\"generator\":\"default\",\"extractSuffixes\":[\"疆\",\"域\",\"界\",\"壤\",\"畿\",\"圻\",\"甸\",\"服\",\"方\",\"防\",\"区\",\"地\"],\"prefixPool\":[\"东\",\"南\",\"西\",\"北\",\"中\",\"上\",\"下\",\"内\",\"外\",\"京\",\"畿\",\"镇\",\"关\",\"城\",\"界\",\"边\",\"远\",\"近\",\"深\",\"浅\"],\"lengthMin\":2,\"lengthMax\":3}},\"_era\":[\"永昌历\",\"大统纪\",\"承平历\",\"开元纪\",\"永徽历\",\"天宝纪\",\"太和历\",\"贞观纪\",\"洪武历\",\"永乐纪\",\"景泰历\",\"宣德纪\",\"弘治历\",\"嘉靖纪\",\"隆庆历\",\"万历纪\",\"泰昌历\",\"天启纪\",\"崇祯历\",\"顺治纪\"]}";

  var WORD_BANKS = null;
  var PROFILE = 'unknown';
  var ERA_POOL = null; // 当前 profile 的历法名称池（从 era.json 读）

  // 解析词库 —— 零 fallback：JSON 解析失败 = 致命错误
  // 注意：不直接用字符串比较 PLACEHOLDER，因为 post-build 会全局替换占位符，
  // 如果条件检查里也写了占位符字符串会被一并替换导致条件永远为 true。
  try {
    WORD_BANKS = JSON.parse(WORD_BANKS_RAW);
    LOG.info('词库 JSON 解析成功 ✓');
  } catch (e) {
    LOG.error('词库注入/解析失败！错误:', e.message);
    LOG.error('原始数据前 200 字符:', String(WORD_BANKS_RAW).slice(0, 200));
    throw new Error('[FMGC Names] 词库数据无效，补丁模块拒绝加载。');
  }

  PROFILE = WORD_BANKS._profile || 'default';
  delete WORD_BANKS._profile;

  // 🆕 读 forbidden.json —— 运行时禁止规则（post-build 已注入到 _forbidden 字段）
  var FORBIDDEN = WORD_BANKS._forbidden || { roots: [], byType: {} };
  delete WORD_BANKS._forbidden;
  LOG.info('🚫 FORBIDDEN rules loaded: ' + (FORBIDDEN.roots || []).length + ' roots, ' +
    Object.keys(FORBIDDEN.byType || {}).length + ' type-specific suffix groups');

  // 🆕 读 era.json —— 历法名称池（post-build 已注入到 _era 字段）
  if (WORD_BANKS._era && Array.isArray(WORD_BANKS._era) && WORD_BANKS._era.length > 0) {
    ERA_POOL = WORD_BANKS._era.slice();
    delete WORD_BANKS._era;
    LOG.info('📅 历法名称池已加载: ' + ERA_POOL.length + ' 种历法 (profile=' + PROFILE + ')');
  } else {
    ERA_POOL = null;
    delete WORD_BANKS._era;
    LOG.info('📅 当前 profile 无 era 数据，将使用 FMG 默认历法');
  }

  // 词库完整性校验 —— 10 个 key 必须全部存在且非空
  // 新结构: WORD_BANKS[key] = { names: "a,b,c", procedural: {...} }
  var ALL_KEYS = ['culture', 'state', 'burg', 'province', 'river', 'lake', 'mapName', 'religion', 'marker', 'zone'];
  var missingOrEmpty = ALL_KEYS.filter(function (k) {
    var v = WORD_BANKS[k];
    if (!v) return true;
    var names = typeof v === 'string' ? v : (v.names || '');
    return !names || names.trim() === '';
  });
  if (missingOrEmpty.length > 0) {
    throw new Error('[FMGC Names] 词库配置不完整！以下 key 缺失或为空: ' + missingOrEmpty.join(', ') +
      '。请检查 fmgc/features/names/wordbanks/default/ 对应的 JSON 文件。');
  }
  LOG.info('词库完整性校验通过 ✓ (' + ALL_KEYS.length + ' keys, profile=' + PROFILE + ')');

  // ============================================================
  // 启动时打印词库摘要
  // ============================================================
  (function printSummary() {
    var ALL_KEYS_LOCAL = ['culture', 'state', 'burg', 'province', 'river', 'lake', 'mapName', 'religion', 'marker', 'zone'];
    LOG.info('========== ChineseNames 词库摘要 ==========');
    LOG.info('  📂 配置目录: ' + PROFILE);
    ALL_KEYS_LOCAL.forEach(function (key) {
      var bank = WORD_BANKS[key];
      var namesStr = typeof bank === 'string' ? bank : (bank && bank.names) || '';
      var entries = namesStr.split(',').filter(function (x) { return x.trim(); });
      var procedural = bank && bank.procedural;
      var sample = entries.slice(0, 3).join('|');
      var suffix = entries.length > 3 ? '|...' : '';
      var procTag = procedural && procedural.enabled ? ' +procedural(' + procedural.generator + ')' : '';
      LOG.info('  ' + key.padEnd(10) + ' → ' + entries.length + ' 条' + procTag +
        (entries.length > 0 ? '  样本: [' + sample + suffix + ']' : '  ⚠️ 词库为空！'));
    });
    LOG.info('==========================================');
  })();

  // ============================================================
  // 工具函数
  // ============================================================

  // ============================================================
  // 去重追踪系统
  // 每种实体类型维护一个 _used[type] Set，确保同一张地图内名称不重复
  // 策略：优先从未用过的名称中选取（保证唯一性），词库耗尽时安全降级 → 从已用过的里随机复用
  // 靠前端词库规模保证绝大多数情况不耗尽（burg 1013条 / province 702条 / river 414条 / state 294条）
  // 耗尽时支流/小实体重名是合理的地理现实，不阻断生成
  // ============================================================
  var _usedNames = {};     // _usedNames[type] = { name: count, ... }
  var _bankArrays = {};    // 预处理后的词库数组缓存（打乱后的真实名称）
  var _proceduralCfgs = {};// 每种类型的 procedural 生成规则缓存

  // 初始化词库数组缓存 + procedural 配置
  function initBankArrays() {
    for (var i = 0; i < ALL_KEYS.length; i++) {
      var key = ALL_KEYS[i];
      var raw = WORD_BANKS[key];
      var namesStr = typeof raw === 'string' ? raw : (raw && raw.names) || '';
      var arr = namesStr
        .split(',')
        .filter(function (x) { return x && x.trim(); })
        .map(function (x) { return x.trim(); });

      // 🆕 FORBIDDEN.byType 过滤 —— 禁止的后缀从 bank 里排除
      // 只影响 tier 1（直接选 bank 名）。tier 2 procedural 里也有独立过滤
      // 用 endsWith 而非 indexOf：只排除真正以禁止后缀结尾的名称，避免过度过滤
      var badSuffixes = (FORBIDDEN.byType && FORBIDDEN.byType[key]) || [];
      if (badSuffixes.length > 0) {
        arr = arr.filter(function (name) {
          for (var bs = 0; bs < badSuffixes.length; bs++) {
            if (name.endsWith(badSuffixes[bs])) return false;
          }
          return true;
        });
      }

      _bankArrays[key] = arr;
      // 缓存 procedural 配置
      _proceduralCfgs[key] = (raw && typeof raw === 'object') ? raw.procedural : null;
    }

    // 🆕 FORBIDDEN 暴露到全局 —— engine 的 generateProcedural 里读
    // 直接挂在 window 上，不依赖 debug 对象链（运行时 100% 可用）
    window.__FMGC_FORBIDDEN__ = FORBIDDEN;
  }
  initBankArrays();

  // 重置所有去重追踪（每次生成新地图时调用）
  function resetAllUsed() {
    _usedNames = {};
    _proceduralWarned = {};
    _tier2ExhaustedWarned = {};
    // 重新打乱每个词库数组，增加变化
    for (var key in _bankArrays) {
      if (_bankArrays[key]) {
        _bankArrays[key] = shuffleArray(_bankArrays[key].slice());
      }
    }
    if (DEBUG) LOG.info('🧹 已重置所有名称去重追踪 + 打乱词库 + 重置行政制度');
    _currentRegime = null;  // 新地图重新选制度
  }

  // 🔄 全路径兜底：监听 FMG 的 map:generated 事件，每次地图生成完成后重置词库去重。
  // 覆盖所有生成入口（按钮、F2、omnibar、seed 重生成、submap、transform、load .map 文件），
  // 因为它们最终都走 generate() → registerMap() → dispatchEvent('map:generated')。
  // 这比单独 hook regeneratePrompt 更可靠（内部调用走局部 import，绕过 window 属性替换）。
  window.addEventListener('map:generated', function () {
    resetAllUsed();
    if (DEBUG) LOG.info('🔄 map:generated → 词库去重已重置');
  });

  // 重置某一种类型的去重追踪（局部重新生成时调用，如 regenerateRivers 只清 river）
  function resetTypeUsed(type) {
    if (_usedNames[type]) _usedNames[type] = {};
    if (_proceduralWarned) delete _proceduralWarned[type];
    if (_tier2ExhaustedWarned) delete _tier2ExhaustedWarned[type];
    // 重新打乱该类型词库
    if (_bankArrays[type]) {
      _bankArrays[type] = shuffleArray(_bankArrays[type].slice());
    }
    if (DEBUG) LOG.info('🧹 已重置 type=' + type + ' 的去重追踪');
  }

  // Fisher-Yates shuffle
  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ============================================================
  // 组合生成引擎（profile 级）
  // 具体实现由各 profile 的 wordbanks/{profile}/engine/ 目录提供
  // names-patch.js 只保留通用调度骨架
  // ============================================================

  // 确保全局 ENGINE_REGISTRY 存在（各 profile engine 自注册到这里）
  if (!window.__FMGC_ENGINE_REGISTRY__) window.__FMGC_ENGINE_REGISTRY__ = {};
  var ENGINE_REGISTRY = window.__FMGC_ENGINE_REGISTRY__;

  // 运行时 profile 私有缓存（ensureEngine 时由 profile 的 onLoad 初始化）
  var _rootCache = {};

  // ──────────────────────────────────────────────────────────────
  // 行政制度上下文（default profile 专用）
  // 设计选择：**地图级**统一制度（第一次 getState() 时随机选一套，
  // 之后所有 state/province/burg 全部沿用）
  //
  // 未来增强方向：per-state 差异化制度（不同国家可使用不同制度），
  // 需要在 States.generate 拦截层做更深层改造 —— 每次 Names.getState()
  // 被调用时 pickRegime()，然后通过闭包或 FMG state 对象传递给
  // 该 state 的 province/burg 生成。当前简化版足够满足"同一国家下
  // 行政区域风格一致"的核心需求（因为全图只选一套制度）。
  // ──────────────────────────────────────────────────────────────
  var _currentRegime = null;

  // 确认当前 profile 的 engine 已就绪，返回 engine 对象
  function ensureEngine() {
    var engine = ENGINE_REGISTRY[PROFILE];
    if (!engine) {
      // fallback: 尝试 default
      engine = ENGINE_REGISTRY['default'];
      if (engine) {
        console.warn('[FMGC Engine] profile "' + PROFILE + '" 未找到 engine，fallback 到 default');
      } else {
        console.error('[FMGC Engine] 无可用 engine！profile=' + PROFILE);
        return null;
      }
    }
    // 初始化/刷新 profile 私有缓存
    if (engine.onLoad) {
      var ctx = engine.onLoad(WORD_BANKS);
      if (ctx && ctx.rootCache) _rootCache = ctx.rootCache;
    }
    return engine;
  }

  // 组合生成主入口 —— Tier 2 使用
  // 调度到当前 profile engine 的 generateProcedural
  // opts.suffixes: 可选的 suffix 子集（行政制度过滤）
  function generateProcedural(type, bankNames, proceduralCfg, opts) {
    var engine = ensureEngine();
    if (!engine || typeof engine.generateProcedural !== 'function') return null;
    return engine.generateProcedural(type, bankNames, proceduralCfg, _rootCache, opts || {});
  }

  // ============================================================
  // pickUnique 三层选取逻辑
  // Tier 1: 词库内未用过的名称（首选，保证唯一性+原始质量）
  // Tier 2: procedural 组合生成（最多尝试 300 次 + 动态长度放松）
  //         300 次里：前 50 次严格约束，之后逐步放松长度限制
  // Tier 3: 受控复用（从已用过的 bank 名称里随机选一个复用）
  //         同一张地图内支流/小河流重名完全合理（地理现实）
  //
  // 告警去重：_proceduralWarned 控制 Tier 1 耗尽告警
  //           _tier2ExhaustedWarned 控制 Tier 2 耗尽告警
  //           每 type 每次 resetAllUsed() 后只打一次
  //
  // opts.suffixes: 可选 suffix 子集（行政制度过滤）
  // ============================================================
  var _proceduralWarned = {};          // Tier 1 耗尽告警（每 type 每次 reset 只打一次）
  var _tier2ExhaustedWarned = {};       // Tier 2 耗尽告警（每 type 每次 reset 只打一次）

  // 自动 reset：同类型 pickUnique 500ms 内只 reset 一次
  // 覆盖 MODULE_INTERCEPTS 未覆盖的入口：regenerateStates → recreateStates → Names.getState/getCulture
  // 这些局部 regenerate 函数直接调 Names.get* 绕过模块包装，但 pickUnique 是最终必经之路
  var _autoResetLastCall = {};          // { type: timestamp }
  var AUTO_RESET_WINDOW = 500;          // 500ms 时间窗口
  function autoResetIfNeeded(type) {
    var now = Date.now();
    var last = _autoResetLastCall[type] || 0;
    if (now - last > AUTO_RESET_WINDOW) {
      resetTypeUsed(type);
      _autoResetLastCall[type] = now;
      if (DEBUG) LOG.info('🧹 autoResetIfNeeded(' + type + ')');
    }
  }

  // 内部工具：检查名称是否匹配某个 suffix 列表
  function _matchSuffix(name, suffixes) {
    if (!suffixes || suffixes.length === 0) return true;
    for (var i = 0; i < suffixes.length; i++) {
      var s = suffixes[i];
      if (s === '' || name.endsWith(s)) return true;
    }
    return false;
  }

  // 内部工具：剥离双重后缀
  // 场景：引擎/procedural 组合后可能出现 "洪荒纪元纪元"、"昆仑道道" 这种
  // 遍历所有 suffix，若名称以 "suffix+suffix" 结尾，只保留一个
  function _stripDoubleSuffix(name, type) {
    if (!name || name.length < 4) return name;  // 太短不可能有双重
    var procCfg = _proceduralCfgs[type];
    var suffixes = procCfg && procCfg.extractSuffixes || [];
    if (suffixes.length === 0) return name;
    var sorted = suffixes.slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i];
      if (s.length >= 1 && name.endsWith(s + s)) {
        // 双重后缀 → 剥离一个
        name = name.slice(0, name.length - s.length);
        LOG.warn('[FMGC Names] _stripDoubleSuffix: 剥离双重后缀 → "' + name + '" (suffix=' + s + ', type=' + type + ')');
        // 剥离后可能又和另一个 suffix 形成双重，循环检查（最多 3 次避免死循环）
        var loop = 0;
        while (loop++ < 3) {
          var changed = false;
          for (var j = 0; j < sorted.length; j++) {
            if (sorted[j].length >= 1 && name.endsWith(sorted[j] + sorted[j])) {
              name = name.slice(0, name.length - sorted[j].length);
              changed = true;
              break;
            }
          }
          if (!changed) break;
        }
        break;
      }
    }
    return name;
  }

  function pickUnique(type, opts) {
    // 🧹 自动 reset：覆盖 MODULE_INTERCEPTS 未覆盖的 regenerateStates→recreateStates→Names.getState 等绕过场景
    // 500ms 时间窗口内同类型只 reset 一次，不影响批量生成性能
    autoResetIfNeeded(type);

    var bank = _bankArrays[type];
    if (!bank || bank.length === 0) {
      LOG.error('[FMGC Names] pickUnique(' + type + '): 词库为空！返回 null。');
      return null;
    }
    if (!_usedNames[type]) _usedNames[type] = {};

    var used = _usedNames[type];
    var optsSuffixes = (opts && opts.suffixes && opts.suffixes.length > 0) ? opts.suffixes : null;

    // ── Tier 1: 从未用过的里挑（优先保证原始质量 + 唯一性）──
    var remaining = [];
    for (var i = 0; i < bank.length; i++) {
      var name = bank[i];
      if (!used[name] && (!optsSuffixes || _matchSuffix(name, optsSuffixes))) {
        remaining.push(name);
      }
    }
    if (remaining.length > 0) {
      var pick = remaining[Math.floor(Math.random() * remaining.length)];
      used[pick] = 1;
      return _stripDoubleSuffix(pick, type);
    }

    // ── Tier 2: procedural 组合生成（200 次 + 动态长度放松）──
    // 动态放松节奏：
    //   attempt 0-49:   严格长度约束（cfg.lengthMin / cfg.lengthMax）
    //   attempt 50-99:  max +1
    //   attempt 100-149: max +2, min -1
    //   attempt 150-199: max +3, min -1
    var procCfg = _proceduralCfgs[type];
    if (procCfg && procCfg.enabled) {
      if (!_proceduralWarned[type]) {
        _proceduralWarned[type] = true;
        LOG.warn('[FMGC Names] pickUnique(' + type + '): 词库已耗尽(' + bank.length + '条' +
          (optsSuffixes ? ', 且被制度 suffix 过滤后可能更少' : '') + ')，启用组合生成[' + procCfg.generator + ']。');
      }
      var procOpts = optsSuffixes ? { suffixes: optsSuffixes } : {};
      var baseMax = procCfg.lengthMax || 6;
      var baseMin = procCfg.lengthMin || 2;
      var MAX_ATTEMPTS = 300;

      for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        var relaxStage = Math.floor(attempt / 50);
        var effectiveMax = baseMax + Math.min(relaxStage, 3) * 2;
        var effectiveMin = relaxStage >= 2 ? Math.max(2, baseMin - 1) : baseMin;

        var gen = generateProcedural(type, bank, procCfg, procOpts);
        // Tier 2: procedural 生成不做 regime suffix 过滤
        // （procedural 就是为了补足 Tier 1 缺口，被过滤等于废掉这个功能 → 直接出"无名"）
        if (gen && !used[gen] && gen.length >= effectiveMin && gen.length <= effectiveMax) {
          used[gen] = 1;
          return _stripDoubleSuffix(gen, type);
        }
      }

      // Tier 2 也失败 → Tier 3: 从已用过的里随机复用（支流/小河流重名是地理现实）
      // 只打一次告警（每 type 每次 reset 后），后续静默复用
      if (!_tier2ExhaustedWarned[type]) {
        _tier2ExhaustedWarned[type] = true;
        LOG.warn('[FMGC Names] pickUnique(' + type + '): Tier 2 也耗尽 —— ' +
          MAX_ATTEMPTS + ' 次 procedural 生成全部撞名/不匹配。' +
          ' 降级到 Tier 3（受控复用已有名称，支流/小实体重名是合理的）。');
      }
    }

    // ── Tier 3: 受控复用（从已用过的 bank 名称里随机选一个复用）──
    // 同一张地图内支流/小河流重名完全合理（长江有多条支流都叫"XX溪"）
    // 复用来自原始词库（质量可控），不用 procedural 生成的合成名
    var usedBankNames = [];
    for (var u = 0; u < bank.length; u++) {
      if (used[bank[u]]) usedBankNames.push(bank[u]);
    }
    if (usedBankNames.length > 0) {
      var reuse = usedBankNames[Math.floor(Math.random() * usedBankNames.length)];
      // 复用不标记 used（允许继续被复用）
      return _stripDoubleSuffix(reuse, type);
    }

    // Tier 1/2/3 全部失败（理论上不可能走到这里）→ 返回 null
    LOG.error('[FMGC Names] pickUnique(' + type + '): Tier 1/2/3 全部失败！词库 ' + bank.length + ' 条全空，procedural 也耗尽。');
    return null;
  }

  // ============================================================
  // ChineseNames —— 独立中文名称生成器（核心）
  // 每种实体类型一个独立方法，对应一个前端 JSON 配置文件
  // ============================================================
  var ChineseNames = {
    profile: PROFILE,
    banks: WORD_BANKS,
    _used: _usedNames,

    // 每次生成新地图时调用，清空去重追踪 + 打乱词库
    resetUsed: function () {
      resetAllUsed();
    },

    // ---- 10 个独立生成函数（全部走 pickUnique 去重 + null 兜底） ----

    // 文化名（儒家、道家、佛教...）
    getCulture: function () {
      return pickUnique('culture') || '无名文化';
    },

    // 内部：根据当前制度构造 suffix 过滤参数
    _regimeOpts: function (type) {
      if (!_currentRegime) return null;
      var engine = ensureEngine();
      if (!engine || typeof engine.getSuffixesFor !== 'function') return null;
      var suffixes = engine.getSuffixesFor(type, _currentRegime);
      if (!suffixes || suffixes.length === 0) return null;
      return { suffixes: suffixes };
    },

    // 国家/政权名 —— 首次调用时随机选一套制度，之后沿用
    getState: function () {
      if (!_currentRegime) {
        var engine = ensureEngine();
        if (engine && typeof engine.pickRegime === 'function') {
          _currentRegime = engine.pickRegime();
          LOG.info('🏛️ 行政制度选定: ' + _currentRegime);
        }
      }
      var opts = ChineseNames._regimeOpts('state');
      return pickUnique('state', opts) || '无名国';
    },

    // 城镇名（长安、洛阳、金陵、敦煌...）—— 使用与 state 相同的制度
    getBurg: function () {
      var opts = ChineseNames._regimeOpts('burg');
      return pickUnique('burg', opts) || '无名镇';
    },

    // 省/州名（雍州、凉州、益州、关内道...）—— 使用与 state 相同的制度
    getProvince: function () {
      var opts = ChineseNames._regimeOpts('province');
      return pickUnique('province', opts) || '无名省';
    },

    // 河流名（黄河、长江、塔里木河...）
    getRiver: function () {
      return pickUnique('river') || '无名河';
    },

    // 湖泊名（洞庭湖、鄱阳湖、青海湖...）
    getLake: function () {
      return pickUnique('lake') || '无名湖';
    },

    // 地图名（天下、九州、寰宇...）
    getMapName: function () {
      return pickUnique('mapName') || '无名地图';
    },

    // 宗教名（道教、佛教、儒教...）
    getReligion: function () {
      return pickUnique('religion') || '无名教';
    },

    // 标记名（昆仑、蓬莱、泰山...）
    getMarker: function () {
      return pickUnique('marker') || '无名标记';
    },

    // 灾害带名（地震带、火山带、断裂带...）
    getZone: function () {
      return pickUnique('zone') || '无名地带';
    }
  };

  // ============================================================
  // 上下文栈 —— 每个 FMG 模块执行期间临时劫持 Names 方法
  // FMG 所有模块 generate/specify/defineNames 都是纯同步 —— try/finally 安全
  // ============================================================
  var _ctxStack = [];

  function enterContext(hijackMap) {
    // hijackMap = { getBase: fn(){...}, getCulture: fn(){...}, ... }
    var saved = {};
    for (var fmgMethod in hijackMap) {
      saved[fmgMethod] = window.Names[fmgMethod];
      window.Names[fmgMethod] = hijackMap[fmgMethod];
    }
    _ctxStack.push(saved);
  }

  function exitContext() {
    var saved = _ctxStack.pop();
    if (saved) {
      for (var fmgMethod in saved) {
        window.Names[fmgMethod] = saved[fmgMethod];
      }
    }
  }

  // ============================================================
  // MODULE_INTERCEPTS —— FMG 模块拦截配置表
  // key = FMG 模块, value = { 包装方法名: { FMG Names 方法名: ChineseNames 生成函数 } }
  // 这是 FMG 内部事实的直接映射：每个 FMG 模块在生成名称时调了哪些 Names 方法
  // ============================================================
  var MODULE_INTERCEPTS = {
    Cultures: {
      generate: {
        getBase:      ChineseNames.getCulture,
        getBaseShort: ChineseNames.getCulture,
      },
      expand: {
        getBase:      ChineseNames.getCulture,
        getBaseShort: ChineseNames.getCulture,
      },
    },
    Burgs: {
      generate: {
        getCulture:      ChineseNames.getBurg,
        getCultureShort: ChineseNames.getBurg,
      },
    },
    States: {
      generate: {
        getState:        ChineseNames.getState,      // 国名
        getCultureShort: ChineseNames.getBurg,       // basename 用城镇名 → 长安、洛阳、金陵
        getBase:         ChineseNames.getBurg,       // 兜底：若 getCultureShort 内部调了 getBase
        getBaseShort:    ChineseNames.getBurg,       // 同上
      },
    },
    Provinces: {
      generate: {
        getState:        ChineseNames.getProvince,   // 省州名
        getCultureShort: ChineseNames.getProvince,   // basename 也走省州词库（雍州、凉州...）
        getBase:         ChineseNames.getProvince,
        getBaseShort:    ChineseNames.getProvince,
      },
    },
    Rivers: {
      specify: {
        getCulture: ChineseNames.getRiver,
      },
    },
    // FMG 2.0: 湖泊命名从 Lakes.defineNames 迁移到 Features.defineNames → Features.getName → Names.getCulture
    Features: {
      defineNames: {
        getCulture: ChineseNames.getLake,
      },
    },
    Religions: {
      generate: {
        getCulture:      ChineseNames.getReligion,
        getCultureShort: ChineseNames.getReligion,
      },
    },
    Markers: {
      generate: {
        getCulture:      ChineseNames.getMarker,
        getCultureShort: ChineseNames.getMarker,
      },
    },
    Zones: {
      generate: {
        getCultureShort: ChineseNames.getZone,
      },
    },
  };

  // ============================================================
  // RESET_MAP —— 模块方法 → 需要重置的名称类型
  // 局部重新生成时（如 regenerateRivers → Rivers.specify）只清对应 type，
  // 不清其他 type（如 regenerateProvinces 不应影响已生成的 state/burg 名称）。
  // 全图 generate 时 randomizeOptions 已先 resetAllUsed，这里的 per-type reset 是无害冗余。
  // ============================================================
  var RESET_MAP = {
    'Cultures.generate':  ['culture'],
    'Cultures.expand':    ['culture'],
    'Burgs.generate':     ['burg'],
    'States.generate':    ['state'],       // 注意：States.generate 内部劫持 getCultureShort→getBurg，
                                           // 但不应清 burg 的 used（state 短名和已有城镇撞名是正常的）
    'Provinces.generate': ['province'],
    'Rivers.specify':     ['river'],
    'Features.defineNames': ['lake'],
    'Religions.generate': ['religion'],
    'Markers.generate':   ['marker'],
    'Zones.generate':     ['zone'],
  };

  // ============================================================
  // 通用包装器
  // ============================================================

  // 包装 module[methodName]，让其执行期间 Names 方法被劫持到 hijackMap
  function wrapMethod(module, methodName, hijackMap, debugCtxName) {
    if (!module) {
      LOG.warn('[FMGC Names] wrapMethod 跳过: 模块未找到 → ' + debugCtxName +
        '（FMG 版本可能已移除该模块，不影响其他补丁）');
      return false;
    }
    if (typeof module[methodName] !== 'function') {
      LOG.warn('[FMGC Names] wrapMethod 跳过: 目标方法不存在 → ' + debugCtxName +
        '（FMG 版本可能已重命名/移除该方法，不影响其他补丁）');
      return false;
    }
    if (module[methodName].__fmgcPatched) return false;

    var orig = module[methodName].bind(module);
    var methodLabel = debugCtxName || methodName;

    module[methodName] = function () {
      // 🧹 局部重新生成时 per-type reset（关键：让 regenerateX 不从旧 used 里跳过）
      // 全图 generate 时 randomizeOptions 已 resetAllUsed，这里是无害冗余
      var resetTypes = RESET_MAP[debugCtxName];
      if (resetTypes && resetTypes.length > 0) {
        for (var ri = 0; ri < resetTypes.length; ri++) {
          resetTypeUsed(resetTypes[ri]);
        }
      }
      LOG.info('🔛 进入: ' + methodLabel);
      enterContext(hijackMap);
      try {
        return orig.apply(this, arguments);
      } finally {
        exitContext();
        LOG.info('🔚 退出: ' + methodLabel);
      }
    };
    module[methodName].__fmgcPatched = true;
    return true;
  }

  // 遍历 MODULE_INTERCEPTS，一次性包装所有 FMG 模块
  function wrapAllModules() {
    var wrappedCount = 0;
    var missingModules = [];

    for (var moduleName in MODULE_INTERCEPTS) {
      var module = window[moduleName];
      if (!module) {
        missingModules.push(moduleName);
        continue;
      }

      var methodConfigs = MODULE_INTERCEPTS[moduleName];
      for (var methodName in methodConfigs) {
        var hijackMap = methodConfigs[methodName];
        var debugCtxName = moduleName + '.' + methodName;
        if (wrapMethod(module, methodName, hijackMap, debugCtxName)) {
          wrappedCount++;
          var hijackMethods = Object.keys(hijackMap);
          LOG.info('✅ 已包装 ' + debugCtxName + ' → 劫持 Names[' + hijackMethods.join(',') + ']');
        }
      }
    }

    if (missingModules.length > 0) {
      throw new Error('[FMGC Names] FMG 模块缺失: ' + missingModules.join(', ') +
        '。补丁无法完整应用，至少这 ' + missingModules.length + ' 个模块会回退到 FMG 原始 Markov 链生成西方名称。');
    }

    return wrappedCount;
  }

  // ============================================================
  // state.fullName 格式化 —— 委托给当前 profile engine 的 formatStateFullName
  // 没有提供则 fallback 到纯 state.name
  // ============================================================
  function formatStateFullName(state) {
    var engine = ensureEngine();
    if (engine && typeof engine.formatStateFullName === 'function') {
      var result = engine.formatStateFullName(state);
      if (result != null) return result;
    }
    return state && state.name ? state.name : '';
  }

  // ============================================================
  // 模块外独立补丁（不经过 Names 劫持）
  // ============================================================

  // patch States.getFullName —— 委托给 engine.formatStateFullName
  function patchStatesGetFullName() {
    if (!window.States || typeof window.States.getFullName !== 'function') {
      throw new Error('[FMGC Names] States.getFullName 不存在！无法注入 state.fullName 格式化。FMG 版本可能不匹配。');
    }
    if (window.States.getFullName.__fmgcPatched) return false;

    var origGetFullName = window.States.getFullName.bind(window.States);
    var fullNameCount = 0;

    window.States.getFullName = function (state) {
      if (!state || !state.name) return origGetFullName(state);
      var result = formatStateFullName(state);
      fullNameCount++;
      if (DEBUG && fullNameCount <= SAMPLE_LIMIT) {
        var orig = origGetFullName(state);
        LOG.debug('States.getFullName → "' + result + '"  (engine=' + PROFILE + ', 原模板会生成: "' + orig + '")');
      }
      return result;
    };
    window.States.getFullName.__fmgcPatched = true;
    LOG.info('✅ States.getFullName 已覆盖 → 委托 engine.formatStateFullName (profile=' + PROFILE + ')');
    return true;
  }

  // wrap States.defineStateForms —— 在其 finally 块里遍历所有 state：
  //   1. fullName 修正为中文制度名格式（委托 engine.formatStateFullName）
  //   2. formName 改写为中文制度后缀（如 "帝国"/"王朝"/"共和国"）
  //   3. form 改写为中文制度类型（如 "君主制"/"共和制"）
  // 这样即使 FMG 编辑器后续显示 formName，也是中文的
  function wrapDefineStateForms() {
    if (!window.States || typeof window.States.defineStateForms !== 'function') {
      throw new Error('[FMGC Names] States.defineStateForms 不存在！无法修正 state.fullName。FMG 版本可能不匹配。');
    }
    if (window.States.defineStateForms.__fmgcPatched) return false;

    var orig = window.States.defineStateForms.bind(window.States);

    window.States.defineStateForms = function () {
      var result = orig.apply(this, arguments);
      // defineStateForms 执行完后，必须拿到 states 数组修正 fullName + formName
      if (!window.pack || !window.pack.states) {
        throw new Error('[FMGC Names] defineStateForms 执行后 window.pack.states 不可用！无法修正 fullName。');
      }
      var states = window.pack.states;
      var fixedFull = 0, fixedForm = 0;
      for (var i = 0; i < states.length; i++) {
        var s = states[i];
        if (s && s.i && !s.removed && s.name) {
          // 修正 fullName 为中文制度名格式
          var chineseFull = formatStateFullName(s);
          if (s.fullName !== chineseFull) {
            s.fullName = chineseFull;
            fixedFull++;
          }

          // 同时改写 formName 为中文制度后缀
          // 优先用 engine.getSuffixesFor 拿到对应制度的后缀，否则走全量后缀
          var engine = ensureEngine();
          var suffixes = null;
          if (engine && typeof engine.getSuffixesFor === 'function') {
            suffixes = engine.getSuffixesFor('state', _currentRegime);
          }
          if (suffixes && suffixes.length > 0) {
            // 从 state.name 里找一个匹配的后缀（state 词库本身含后缀）
            var matchedSuffix = '';
            for (var si = 0; si < suffixes.length; si++) {
              if (suffixes[si] && s.name.endsWith(suffixes[si]) && suffixes[si].length > matchedSuffix.length) {
                matchedSuffix = suffixes[si];
              }
            }
            if (matchedSuffix) {
              if (s.formName !== matchedSuffix) {
                s.formName = matchedSuffix;
                fixedForm++;
              }
            } else {
              // 从 state 词库全量后缀里找
              var stateProc = _proceduralCfgs['state'];
              if (stateProc && stateProc.extractSuffixes) {
                for (var ti = 0; ti < stateProc.extractSuffixes.length; ti++) {
                  var sfx = stateProc.extractSuffixes[ti];
                  if (sfx && s.name.endsWith(sfx) && sfx.length > matchedSuffix.length) {
                    matchedSuffix = sfx;
                  }
                }
                if (matchedSuffix && s.formName !== matchedSuffix) {
                  s.formName = matchedSuffix;
                  fixedForm++;
                } else if (s.formName) {
                  // 实在找不到匹配后缀，清空 formName 防止英文残留
                  s.formName = '';
                  fixedForm++;
                }
              } else if (s.formName) {
                s.formName = '';
                fixedForm++;
              }
            }
          } else if (s.formName) {
            // 没有 suffixes 信息，直接清空 formName 防止英文残留
            s.formName = '';
            fixedForm++;
          }
        }
      }
      if (fixedFull > 0 || fixedForm > 0) {
        LOG.info('✅ defineStateForms 后修正 ' + fixedFull + ' 个 fullName, ' + fixedForm + ' 个 formName');
      }
      return result;
    };
    window.States.defineStateForms.__fmgcPatched = true;
    LOG.info('✅ States.defineStateForms 已包装 → fullName 中文格式化 + formName 中文后缀');
    return true;
  }

  // wrap window.drawStateLabels —— 作为 fullName 修正的最终安全网
  // 在 FMG 渲染国家标签之前，遍历所有 state 强制修正 fullName 和 formName
  // 同时：强制使用 fullName + 允许极小字号，通过 post-process 覆盖 FMG 的缩减逻辑
  function wrapDrawStateLabels() {
    var drawFn = window.drawStateLabels;
    if (typeof drawFn !== 'function') {
      LOG.info('ℹ️ wrapDrawStateLabels: window.drawStateLabels 尚未赋值，跳过。late-wrap 拦截器将在赋值时自动补 wrap');
      return false;
    }
    if (drawFn.__fmgcPatched) return false;

    // === 跨调用缓存：fullName → 测量宽度 ===
    // 同一字符串 + 同一字体 → 同一渲染宽度，可安全长期缓存
    // 字体由 SVG 上下文决定（Noto Serif SC），不会变化
    var _textWidthCache = {};

    var wrapper = function () {
      // 必须能拿到 states 数组
      var states = null;
      if (window.pack && window.pack.states) {
        states = window.pack.states;
      }
      if (!states) {
        LOG.warn('⚠️ drawStateLabels wrap: states 不存在，跳过 fullName 修正，直接执行原始绘制');
        return drawFn.apply(this, arguments);
      }

      var fixedInDraw = 0;
      for (var i = 0; i < states.length; i++) {
        var s = states[i];
        if (s && s.i && !s.removed && s.name) {
          // 强制修正 fullName 为 engine.formatStateFullName 的结果
          // 每次重新生成后 engine 可能变（切换 profile），所以无条件覆盖
          var targetFull = formatStateFullName(s);
          if (s.fullName !== targetFull) {
            s.fullName = targetFull;
            fixedInDraw++;
          }
          if (s.formName) {
            s.formName = '';  // 清空 formName 防止模板残留
          }
        }
      }
      if (fixedInDraw > 0 && DEBUG) {
        LOG.debug('drawStateLabels 前修正了 ' + fixedInDraw + ' 个 state.fullName');
      }

      // 临时强制 full 模式，防止 FMG auto 模式下把 fullName 缩减为 short name
      var prevMode = null;
      if (window.options) {
        prevMode = window.options.stateLabelsMode;
        window.options.stateLabelsMode = 'full';
      }

      try {
        drawFn.apply(this, arguments);
      } finally {
        if (window.options && prevMode !== null) {
          window.options.stateLabelsMode = prevMode;
        }
      }

      // === POST-PROCESS: 确保所有 state label 显示 fullName 单行 + 精确字号 ===
      // FMG 在 auto 模式下会：
      //   pathLength 很短时把 fullName 拆成两行
      //   两行也放不下时缩减为 state.name (short name)
      //   还有 ratio 的 minmax clamp 导致无法无限缩小字号
      // 我们要覆盖这些行为：总是 fullName 单行，通过精确计算 font-size 适配 pathLength
      var d3 = window.d3;
      if (!d3) return;

      var textGroup = d3.select('g#labels > g#states');
      if (textGroup.empty()) return;

      // === 关键修复：直接测量中文 fullName 的实际渲染宽度 ===
      // FMG 用 Latin "Example" 估算 letterPixelLength，但中文字符比 Latin 宽 ~1.5-2 倍，
      // 导致 pathLengthInLetters 被高估、ratio 算得过大、文字溢出被截断（用户看到"圩王"而非"大圩王朝"）。
      // 我们改为：对每个 fullName 创建临时 <text> 元素，直接 getComputedTextLength() 测量实际宽度。
      // 注：measureEl 必须挂在 textGroup（g#labels > g#states）内 —— 这样才能继承地图 SVG 的字体上下文
      // （Noto Serif SC / 衬线体），body 下独立 SVG text 会用浏览器默认字体导致测量不准！

      // 预创建一个隐藏的临时 text 元素用于测量
      // 注意：不能用 display:none —— 会导致 getComputedTextLength() 返回 0（不参与布局）
      // 改用 visibility:hidden + 移出屏幕，既不可见又能正常测量
      var measureEl = textGroup.append('text').attr('x', -9999).attr('y', -9999).style('visibility', 'hidden');

      // === 性能优化：单次查询建 pathId→pathEl Map + WeakMap 缓存 getTotalLength ===
      // 消除 N 次 document.getElementById 和 N 次 getTotalLength() 的 reflow
      // ① 单次 querySelectorAll 建 pathMap — 限定在 label SVG 作用域内，避免扫全文档
      var svgScope = textGroup.node();
      while (svgScope && svgScope.tagName !== 'svg') svgScope = svgScope.parentNode;
      if (!svgScope) svgScope = document;  // fallback
      var pathMap = {};
      svgScope.querySelectorAll('path[id]').forEach(function(p) {
        pathMap[p.id] = p;
      });
      // ② WeakMap 缓存 path 元素的 getTotalLength（元素重建自动失效）
      var pathLenCache = new WeakMap();

      var postFixed = 0;
      textGroup.selectAll('text').each(function () {
        var textEl = this;
        var tspan = textEl.querySelector('textPath');
        if (!tspan) return;

        // 找对应的 path —— 从 pathMap O(1) 取，代替 document.getElementById
        var textPathHref = tspan.getAttribute('href') || tspan.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (!textPathHref) return;
        var pathId = textPathHref.replace(/^#/, '');
        var pathEl = pathMap[pathId];
        if (!pathEl) {
          // fallback：万一 pathMap 没覆盖（极少见）
          pathEl = document.getElementById(pathId);
        }
        if (!pathEl) return;

        // 获取 path 长度（SVG 像素）—— WeakMap 缓存，避免 reflow
        var svgPathLength = pathLenCache.get(pathEl);
        if (svgPathLength === undefined) {
          svgPathLength = pathEl.getTotalLength();
          pathLenCache.set(pathEl, svgPathLength);
        }
        if (!svgPathLength || svgPathLength <= 0) return;

        var labelId = textEl.getAttribute('id') || '';
        var stateIdMatch = labelId.match(/stateLabel(\d+)/);
        if (!stateIdMatch) return;
        var stateId = +stateIdMatch[1];
        var state = states[stateId];
        if (!state || !state.fullName) return;

        var fullName = state.fullName;

        // === 直接测量 fullName 在 100% font-size 下的实际渲染宽度 ===
        // 跨调用字符串缓存：同字符串 → 同宽度，避免重复 reflow
        var actualTextWidth = _textWidthCache[fullName];
        if (actualTextWidth === undefined) {
          measureEl.text(fullName);
          actualTextWidth = 0;
          try {
            actualTextWidth = measureEl.node().getComputedTextLength() || 0;
          } catch(e) {}
          if (!actualTextWidth || actualTextWidth <= 0) actualTextWidth = fullName.length * 10; // fallback
          _textWidthCache[fullName] = actualTextWidth;
        }

        // 理想 ratio：让 fullName 的实际宽度刚好等于 pathLength
        // 例：path=80px, "大圩王朝"(4字)=56px(100%) → ratio = 80/56*100 = 142.8%
        // 例：path=20px, "大圩王朝"(4字)=56px(100%) → ratio = 20/56*100 = 35.7%
        var idealRatio = Math.round((svgPathLength / actualTextWidth) * 1000) / 10;
        idealRatio = Math.max(idealRatio, 1);   // 最小值 1%，确保仍可辨识
        idealRatio = Math.min(idealRatio, 250); // 放宽上限（FMG 原生只到 170%）

        // === 安全网：设置 lengthAdjust="spacingAndGlyphs" ===
        // 即使 font-size 计算有微小误差，SVG 也会自动将字形+间距等比缩放至 path 长度，
        // 确保文字绝不会被截断。同时设置在父 text 元素和 textPath 上以兼容各浏览器。
        textEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        tspan.setAttribute('lengthAdjust', 'spacingAndGlyphs');

        // 只在当前不是 fullName 单行时才重写（避免不必要的 DOM 操作）
        var currentContent = tspan.textContent || '';
        var needsFix = currentContent !== fullName || textEl.querySelectorAll('tspan').length > 1;

        if (!needsFix) {
          // 当前已经是 fullName 单行，只需要更新 ratio（FMG 原生 clamp 到 [70%, 170%] 可能不够小）
          var currentRatio = parseFloat(tspan.getAttribute('font-size') || textEl.getAttribute('font-size') || '100');
          // 如果当前 ratio 和我们算的 idealRatio 差异超过 5%，更新它
          if (currentRatio > idealRatio * 1.05 || currentRatio < idealRatio * 0.95) {
            tspan.setAttribute('font-size', idealRatio + '%');
            postFixed++;
          }
          return;
        }

        // 重写为 fullName 单行
        tspan.textContent = fullName;
        tspan.setAttribute('font-size', idealRatio + '%');
        postFixed++;
      });

      // 清理临时测量元素
      measureEl.remove();

      if (postFixed > 0) {
        LOG.info('📏 drawStateLabels post-process: 修正了 ' + postFixed + ' 个标签 → fullName 单行 + 精确字号');
      }
    };
    wrapper.__fmgcPatched = true;
    window.drawStateLabels = wrapper;
    LOG.info('✅ drawStateLabels 已包装（fullName + 精确字号 patch）');
    return true;
  }
  _registerWrap('wrapDrawStateLabels', wrapDrawStateLabels);

  // wrap window.generate —— 在每次生成新地图开始时 reset 去重追踪
  // 注意：FMG 的 generate() 是 main.js 里的局部作用域函数，从未赋值到 window
  // 此函数仅在将来 FMG 暴露 window.generate 时生效，属于增强型功能
  // patch Names.getMapName —— 独立覆盖
  function patchNamesGetMapName() {
    if (!window.Names || typeof window.Names.getMapName !== 'function') {
      throw new Error('[FMGC Names] Names.getMapName 不存在！无法注入中文地图名。FMG 版本可能不匹配。');
    }
    if (window.Names.getMapName.__fmgcPatched) return false;

    window.Names.getMapName = function (force) {
      var result = ChineseNames.getMapName();
      // FMG 2.0: 地图名输入在 lore 弹窗内，id="loreMapName"；旧版是 #mapName。
      // 返回值已被 options-model.ts 直接赋给 lore.name，DOM 写入仅作 UI 同步。
      var el = document.getElementById('loreMapName') || document.getElementById('mapName');
      if (el) {
        el.value = result;
      }
      return result;
    };
    window.Names.getMapName.__fmgcPatched = true;
    LOG.info('✅ Names.getMapName 已覆盖');
    return true;
  }

  // patch Names 默认行为 —— 上下文外调用（如 options.js generateEra）也返回中文
  // 这样 FMG 的 getBase/getBaseShort/getCulture/getCultureShort/getState 不会走到原始 Markov 链
  function patchNamesDefaults() {
    if (!window.Names) return false;
    if (window.Names.__fmgcDefaultsPatched) return false;

    // 保存原始方法（enterContext/exitContext 可以 save/restore 它们之间的切换）
    window.Names.__fmgcDefaultsPatched = true;
    LOG.info('✅ Names 默认兜底 patch 已应用（上下文外调用也返回中文）');
    return true;
  }

  // 直接覆盖 Names 的核心方法为 ChineseNames 对应的默认实现
  // 这是在全局层面做的 enterContext/exitContext 的"底座"
  function applyNamesMethodOverrides() {
    if (!window.Names) {
      throw new Error('[FMGC Names] applyNamesMethodOverrides: window.Names 不存在！无法注入全局兜底。');
    }
    var N = window.Names;
    if (N.__fmgcMethodOverridden) return;

    // 默认映射：FMG 方法 → ChineseNames 默认生成函数
    // （上下文内会被 MODULE_INTERCEPTS 覆盖，上下文外走这里）
    var overrides = {
      getBase:      ChineseNames.getCulture,
      getBaseShort: ChineseNames.getCulture,
      getCulture:      ChineseNames.getBurg,      // 最常用 → 城镇词库
      getCultureShort: ChineseNames.getBurg,
      getState:        ChineseNames.getState,
    };

    var missingMethods = [];
    for (var method in overrides) {
      if (typeof N[method] !== 'function') {
        missingMethods.push(method);
        continue;
      }
      if (!N[method].__fmgcOverridden) {
        var wrapFn = overrides[method];
        var wrapped = function () { return wrapFn(); };
        wrapped.__fmgcOverridden = true;
        N[method] = wrapped;
      }
    }

    if (missingMethods.length > 0) {
      throw new Error('[FMGC Names] Names 对象缺少方法: ' + missingMethods.join(', ') +
        '。全局兜底不完整，至少这些方法会回退到 FMG 原始 Markov 链生成西方名称。');
    }

    N.__fmgcMethodOverridden = true;
    LOG.info('✅ Names 核心方法已全局覆盖（getBase/getCulture/getState...）');
  }

  // patch Names.getNameBases —— 返回中文词库供 FMG UI 兼容
  // 同时覆盖 window.nameBases 为单元素数组（文化下拉"名称库：{profile}")
  function patchNamesGetNameBases() {
    if (!window.Names) {
      throw new Error('[FMGC Names] patchNamesGetNameBases: window.Names 不存在！');
    }
    if (window.Names.getNameBases.__fmgcPatched) return;

    // profile id → 中文名称（与 registry.json 保持一致）
    var PROFILE_CN_NAMES = {
      'default': '中国古代历史',
      'xianxia': '仙侠修真',
      'xuanhuan': '玄幻异世',
      'wuxia': '武侠江湖',
      'modern-urban': '现代都市',
      'mythology': '上古神话',
      'dark-fantasy': '黑暗奇幻',
      'high-fantasy': '中土奇幻',
      'republic': '民国近现代',
    };

    function getProfileDisplayName() {
      var id = (typeof PROFILE !== 'undefined' && PROFILE) ? PROFILE : 'default';
      return PROFILE_CN_NAMES[id] || id;
    }

    window.Names.getNameBases = function () {
      LOG.info('getNameBases() → 全局唯一名称库: "名称库：' + getProfileDisplayName() + '"');
      return [{
        i: 0,
        name: '名称库：' + getProfileDisplayName(),
        min: 2,
        max: 6,
        d: '',
        m: 0,
        b: ChineseNames.banks.culture || ''
      }];
    };
    window.Names.getNameBases.__fmgcPatched = true;

    // ============================================================
    // 覆盖 window.nameBases 为单元素数组
    // cultures-editor.js 的 getBaseOptions() 遍历这个数组渲染下拉
    // 让它变成只有一个选项 —— 当前 profile 中文名
    // ============================================================
    function ensureSingleNameBaseArray() {
      if (typeof window.nameBases === 'undefined') {
        window.nameBases = [];
      }
      // 清空并重建为单元素
      window.nameBases.length = 0;
      window.nameBases.push({
        i: 0,
        name: '名称库：' + getProfileDisplayName(),
        min: 2,
        max: 6,
        d: '',
        m: 0,
        b: ChineseNames.banks.culture || ''
      });
      LOG.info('✅ window.nameBases 已覆盖为单元素: "' + window.nameBases[0].name + '"');
    }
    ensureSingleNameBaseArray();

    // 暴露给 wordbank-switcher 调用：profile 切换时更新 name 显示
    window.__FMGC_UPDATE_NAMEBASE_NAME__ = function (profileId) {
      var cnName = PROFILE_CN_NAMES[profileId] || profileId || getProfileDisplayName();
      if (window.nameBases && window.nameBases.length > 0) {
        window.nameBases[0].name = '名称库：' + cnName;
      }
      if (window.Names && typeof window.Names.getNameBases === 'function' && window.Names.getNameBases.__fmgcPatched) {
        // 让 getNameBases 也返回最新名字（因为 PROFILE 全局变量在 switchToProfile 里会更新）
      }
      LOG.info('🔄 nameBases 已更新为: "' + window.nameBases[0].name + '"');
    };
    LOG.info('✅ patchNamesGetNameBases 完成（nameBases 单元素 + 更新函数已暴露）');
  }

  // ============================================================
  // patchCulturesBaseNormalize —— 文化 generate/expand 完成后：
  //   1) base 统一归零（全局 profile 模式下只有一个词库）
  //   2) name 用 ChineseNames.getCulture() 覆盖
  //      ← 根因：FMG 默认 culturesSet="world"，走 hardcoded 英文名分支
  //        （Shwazen / Roman / Hellenic / Germanic...），完全不调 Names.getBase
  //        所以 MODULE_INTERCEPTS 劫持碰不到这些名字
  // ============================================================
  function patchCulturesBaseNormalize() {
    var Cultures = window.Cultures;
    if (!Cultures) {
      throw new Error('[FMGC Names] Cultures 模块未找到，无法归一化 base');
    }

    function normalizeCultures() {
      try {
        if (typeof pack === 'undefined' || !pack.cultures) return;
        var baseChanged = 0, nameChanged = 0;
        for (var i = 0; i < pack.cultures.length; i++) {
          var c = pack.cultures[i];
          if (!c.i) continue; // 跳过 Uncultured（neutral）
          // base 归一化
          if (c.base !== 0) baseChanged++;
          c.base = 0;
          // name 归一化 —— 用 ChineseNames 生成中文名
          try {
            var cnName = ChineseNames.getCulture();
            if (cnName && cnName !== c.name) {
              c.name = cnName;
              nameChanged++;
              // code 也同步更新（FMG 自动生成的缩写，可能仍含英文，但可接受）
              try { c.code = abbreviate(c.name, pack.cultures.map(function (x) { return x.code; })); } catch (e) {}
            }
          } catch (e) {
            LOG.warn('文化 [' + c.i + '] 名称替换失败: ' + e.message);
          }
        }
        if (baseChanged > 0) LOG.info('🏛️ 已归一化 ' + baseChanged + ' 个文化的 base → 0');
        if (nameChanged > 0) LOG.info('🏛️ 已替换 ' + nameChanged + ' 个文化的名称 → 中文');
      } catch (e) {
        LOG.warn('normalizeCultures 执行异常: ' + e.message);
      }
    }

    // 包装 Cultures.generate
    if (typeof Cultures.generate === 'function' && !Cultures.generate.__fmgcBasePatched) {
      var origGen = Cultures.generate.bind(Cultures);
      // 保存原函数的所有 __fmgc* 标记（MODULE_INTERCEPTS 已设的 __fmgcPatched）
      var origGenMarks = {};
      for (var k in origGen) { if (k.indexOf('__fmgc') === 0) origGenMarks[k] = origGen[k]; }
      Cultures.generate = function () {
        var result = origGen.apply(this, arguments);
        normalizeCultures();
        return result;
      };
      Cultures.generate.__fmgcBasePatched = true;
      // 复制原标记，让 forceVerifyAndApply 检测通过
      for (var mk in origGenMarks) Cultures.generate[mk] = origGenMarks[mk];
      Cultures.generate.__fmgcPatched = true; // 兜底
      LOG.info('✅ Cultures.generate 已包装 → 执行后归一化 base + name');
    }

    // 包装 Cultures.expand（新增文化时也调用）
    if (typeof Cultures.expand === 'function' && !Cultures.expand.__fmgcBasePatched) {
      var origExpand = Cultures.expand.bind(Cultures);
      var origExpandMarks = {};
      for (var ek in origExpand) { if (ek.indexOf('__fmgc') === 0) origExpandMarks[ek] = origExpand[ek]; }
      Cultures.expand = function () {
        var result = origExpand.apply(this, arguments);
        normalizeCultures();
        return result;
      };
      Cultures.expand.__fmgcBasePatched = true;
      for (var emk in origExpandMarks) Cultures.expand[emk] = origExpandMarks[emk];
      Cultures.expand.__fmgcPatched = true;
      LOG.info('✅ Cultures.expand 已包装 → 执行后归一化 base + name');
    }
  }
  // ============================================================
  // Phase 2 同步标记 + 工厂函数
  // ============================================================
  var _phase2Done = false;
  // 9 个 FMG 核心 class 模块（window.XXX = new class{...}）
  var EXPECED_MODULES = ['Cultures', 'Burgs', 'States', 'Provinces', 'Rivers', 'Lakes', 'Religions', 'Markers', 'Zones', 'Military', 'Features'];
  // FMG 全局绘制函数 —— 这些在 module 脚本里的赋值时间点远晚于模块
  // FMG 2.0: drawStateLabels/drawBurgLabels/drawMarkers 已被移除（标签渲染重构到 renderers/），
  // state.fullName 修正完全依赖 States.getFullName patch，不再需要 late-wrap 绘制函数。
  var GLOBAL_DRAW_FUNCTIONS = [];

  // FMG module script 中各关键符号的赋值顺序（实测 offset）:
  //   Names@142K → Lakes@231K → Rivers@233K → Cultures@240K → Burgs@256K
  //   → States@281K → Zones@294K → Religions@307K → Provinces@315K
  //   → Markers@423K ← 最后一个模块，触发 Phase 2
  //   → drawBurgLabels@608K → drawMarkers@618K → drawStateLabels@626K
  // 绘制函数都在 Phase 2 触发点之后赋值，必须用独立拦截器补 wrap

  // 全局函数名 → 对应的 wrap 函数（字符串，运行时查找）
  // FMG 2.0: drawStateLabels 已移除，无需 wrap
  var GLOBAL_WRAP_MAP = {};

  // 一次性执行所有 Phase 2 补丁（消除 100ms setInterval 竞态）
  // 关键设计：每个补丁调用都独立 try-catch，一个失败不影响后续补丁
  // 整体也有顶层 try-catch，防止 throw 从 module script 向上冒泡
  function runPhase2Patches() {
    if (_phase2Done) return;
    _phase2Done = true;

    LOG.info('🚨🚨🚨 所有 FMG 子模块已就绪，立即执行 Phase 2 补丁...');

    // 整体 try-catch —— 防止任何 throw 冒泡到 FMG module script 执行上下文
    try {
      var wrapped = 0;

      // 1. 包装 MODULE_INTERCEPTS 中的各模块方法
      try { wrapped = wrapAllModules(); }
      catch (e) { LOG.error('❌ wrapAllModules 失败: ' + e.message); }

      // 1.5. 归一化 Cultures 的 base 索引 —— generate/expand 后全部设为 0
      try { patchCulturesBaseNormalize(); }
      catch (e) { LOG.error('❌ patchCulturesBaseNormalize 失败: ' + e.message); }

      // 2. patch States.getFullName（此时 window.States 一定存在）
      try { patchStatesGetFullName(); }
      catch (e) { LOG.error('❌ patchStatesGetFullName 失败: ' + e.message); }

      // 3. 包装 States.defineStateForms → 修正 fullName 属性 + 改写 formName
      try { wrapDefineStateForms(); }
      catch (e) { LOG.error('❌ wrapDefineStateForms 失败: ' + e.message); }



      // 4. 额外包装 window.drawStateLabels 作为 fullName 修正安全网
      try { wrapDrawStateLabels(); }
      catch (e) { LOG.error('❌ wrapDrawStateLabels 失败: ' + e.message); }





      LOG.info('============================================');
      LOG.info('✓✓✓ ChineseNames Phase 2 补丁应用完成 ✓✓✓');
      LOG.info('  📂 Profile: ' + ChineseNames.profile);
      LOG.info('  🧩 已包装 ' + wrapped + ' 个 FMG 模块方法');
      LOG.info('  🎯 10 种实体类型各使用独立词库');
      LOG.info('============================================');

      // Phase 2 验证模块级补丁（跳过 drawStateLabels 等 late-wrap 项，它们在 FMG 78.9% 处才赋值）
      // 最终完整验证由 waitAndWrapLateFunctions 兜底轮询完成后触发
      try { forceVerifyAndApply({ skipLateWrap: true, stage: 'Phase2' }); }
      catch (e) { LOG.error('❌ forceVerifyAndApply 异常: ' + e.message); }
    }
    catch (topE) {
      // 顶层兜底 —— 绝对不能让 throw 中断 FMG module script 执行
      LOG.error('❌❌❌ runPhase2Patches 顶层异常（已吞掉，关键补丁可能部分生效）: ' + topE.message);
    }

  }

  // 检查所有模块是否就绪 → 就绪则立即执行 Phase 2
  function tryRunPhase2() {
    if (_phase2Done) return true;
    var allReady = EXPECED_MODULES.every(function (m) { return window[m]; });
    if (allReady) {
      runPhase2Patches();
      return true;
    }
    return false;
  }

  // ============================================================
  // 主补丁入口（Phase 1）
  // ============================================================
  function applyAllPatches() {
    if (!window.Names) {
      throw new Error('[FMGC Names] applyAllPatches() 被调用但 window.Names 不存在！无法应用任何补丁。');
    }

    LOG.info('🚨 FMG Names 已初始化，开始应用中文名称补丁...');

    // 1. 全局覆盖 Names 核心方法（上下文外也返回中文，不走到 FMG Markov 链）
    applyNamesMethodOverrides();

    // 1.5. 设置默认值补丁标记（patchNamesDefaults 本身是死代码存根，
    // 实际工作已由 applyNamesMethodOverrides 完成，但 forceVerifyAndApply 检查此标记）
    patchNamesDefaults();

    // 2. patch getNameBases（FMG UI 兼容）
    patchNamesGetNameBases();

    // 3. patch getMapName（独立覆盖）
    patchNamesGetMapName();

    // 4. 为 9 个 FMG 模块安装 Object.defineProperty 拦截器 —— 这是消除竞态的关键
    // FMG 的 index-CLZB_uJe.js 是 type="module" 脚本，内部同步执行：
    //   window.Names = ... (触发本 setter)
    //   window.States = ...
    //   window.Cultures = ...
    //   ... (所有模块同步定义)
    // Names setter 触发时模块还不全，但每个模块赋值时都会触发各自的 setter，
    // 逐个检查 → 当最后一个模块赋值完成时立即执行 Phase 2，零延迟。
    installModuleInterceptors();
    // 额外：为 Phase 2 之后才赋值的全局绘制函数安装拦截器
    installLateFunctionInterceptors();

    // 5. 同步检查一次 —— 如果 Names setter 触发时模块已存在（理论上不会发生，
    // 但作为防御性检查），立即执行
    if (!tryRunPhase2()) {
      LOG.info('⏳ Phase 2 等待中：当前已就绪 ' + EXPECED_MODULES.filter(function(m){return window[m];}).length
        + '/' + EXPECED_MODULES.length + '，剩余模块将通过拦截器赋值触发');
    }
  }

  // ============================================================
  // 为 9 个 FMG 模块安装 Object.defineProperty 拦截器
  // 每个模块赋值时 setter 触发 → 检查是否所有模块都就绪 → 就绪则立即执行 Phase 2
  // ============================================================
  function installModuleInterceptors() {
    EXPECED_MODULES.forEach(function (moduleName) {
      // 跳过已存在拦截器的情况（幂等安全）
      if (window.__FMGC_INTERCEPTED_MODULES__ === undefined) {
        window.__FMGC_INTERCEPTED_MODULES__ = {};
      }
      if (window.__FMGC_INTERCEPTED_MODULES__[moduleName]) return;

      var storage = { value: undefined, hasValue: false };
      try {
        // 如果模块已经被赋值了（比如脚本加载顺序异常），保留已有值
        if (window[moduleName] !== undefined) {
          storage.value = window[moduleName];
          storage.hasValue = true;
        }

        Object.defineProperty(window, moduleName, {
          configurable: true,
          enumerable: true,
          get: function () { return storage.value; },
          set: function (v) {
            // 跳过纯函数式的赋值检测（某些环境里 defineProperty setter 可能被意外触发）
            if (storage.hasValue && storage.value === v) return;
            storage.value = v;
            storage.hasValue = true;
            window.__FMGC_INTERCEPTED_MODULES__[moduleName] = true;
            LOG.info('🚨 window.' + moduleName + ' 已赋值');
            // 每次模块赋值都尝试触发 Phase 2
            tryRunPhase2();
          }
        });

        // 如果模块已经存在（非零概率），标记已拦截并立即检查
        if (storage.hasValue) {
          window.__FMGC_INTERCEPTED_MODULES__[moduleName] = true;
        }
      } catch (e) {
        LOG.warn('⚠️ 无法为 window.' + moduleName + ' 安装拦截器（' + e.message + '），将依赖 waitAndWrapModules 兜底');
      }
    });
    LOG.info('✓ 已为 ' + EXPECED_MODULES.length + ' 个 FMG 模块安装拦截器');
  }

  // ============================================================
  // 为 Phase 2 之后才赋值的全局绘制函数安装拦截器
  // 这些函数在 FMG module script 中的赋值时间晚于所有 9 个模块
  // 实测：Phase 2 在 Markers@423K(53%) 触发，drawStateLabels@626K(78%) 才赋值
  // 所以需要独立拦截器：函数赋值时如果 _phase2Done 已 true，立即单独 wrap
  // ============================================================
  function installLateFunctionInterceptors() {
    GLOBAL_DRAW_FUNCTIONS.forEach(function (fnName) {
      if (window.__FMGC_INTERCEPTED_FUNCS__ === undefined) {
        window.__FMGC_INTERCEPTED_FUNCS__ = {};
      }
      if (window.__FMGC_INTERCEPTED_FUNCS__[fnName]) return;

      var storage = { value: undefined, hasValue: false };
      try {
        var alreadyExists = window[fnName] !== undefined;
        if (alreadyExists) {
          storage.value = window[fnName];
          storage.hasValue = true;
          LOG.info('ℹ️ installLateFunctionInterceptors: window.' + fnName + ' 安装拦截器时已存在（hasValue=true）');
        } else {
          LOG.info('ℹ️ installLateFunctionInterceptors: window.' + fnName + ' 安装拦截器时不存在（hasValue=false），等待 FMG 赋值');
        }

        Object.defineProperty(window, fnName, {
          configurable: true,
          enumerable: true,
          get: function () { return storage.value; },
          set: function (v) {
            if (storage.hasValue && storage.value === v) return;
            // 如果新值已经是我们包装过的函数（__fmgcPatched 标记），跳过处理 ——
            // 这发生在 wrapDrawStateLabels() 内部执行 window.drawStateLabels = wrapper 时，
            // 会再次触发 setter。虽然下面的 wrapFn() 调用也有 __fmgcPatched guard，
            // 但这里提前返回能避免冗余日志输出和不必要的 call stack 开销。
            if (v && v.__fmgcPatched) {
              LOG.info('ℹ️ LATE-WRAP SETTER: window.' + fnName + ' 被重新赋值为已包装函数（__fmgcPatched=true），跳过');
              storage.value = v;
              storage.hasValue = true;
              return;
            }
            LOG.info('🚨 LATE-WRAP SETTER 触发: window.' + fnName + ' 被赋值，_phase2Done=' + _phase2Done + ', storage.hasValue=' + storage.hasValue);
            storage.value = v;
            storage.hasValue = true;
            window.__FMGC_INTERCEPTED_FUNCS__[fnName] = true;

            // 关键逻辑：如果 Phase 2 已完成，立即尝试 wrap 这个函数
            // 如果 Phase 2 还没完成 → 不处理，Phase 2 里会统一调 wrapDrawStateLabels()
            if (_phase2Done && GLOBAL_WRAP_MAP[fnName]) {
              LOG.info('🚨 window.' + fnName + ' 赋值（Phase 2 已完成），立即执行对应 wrap...');
              try {
                var wrapFn = _getWrapFunction(GLOBAL_WRAP_MAP[fnName]);
                if (typeof wrapFn === 'function') {
                  wrapFn();
                  LOG.info('✅  late-wrap window.' + fnName + ' 成功');
                } else {
                  LOG.warn('⚠️ late-wrap window.' + fnName + ' 失败：wrap 函数未找到（_WRAP_FUNCTIONS 中 key=' + GLOBAL_WRAP_MAP[fnName] + '）');
                }
              } catch (e) {
                LOG.warn('⚠️ late-wrap window.' + fnName + ' 异常: ' + e.message);
              }
            } else if (!GLOBAL_WRAP_MAP[fnName]) {
              LOG.info('ℹ️ window.' + fnName + ' 赋值（无对应 wrap 函数，跳过）');
            } else {
              LOG.info('🚨 window.' + fnName + ' 已赋值（Phase 2 尚未完成，_phase2Done=' + _phase2Done + '，将由 Phase 2 统一 wrap）');
            }
          }
        });

        if (storage.hasValue) {
          window.__FMGC_INTERCEPTED_FUNCS__[fnName] = true;
          // 函数已存在 → Phase 2 尚未完成时等统一处理；Phase 2 已完成则立即 wrap
          if (_phase2Done && GLOBAL_WRAP_MAP[fnName]) {
            LOG.info('ℹ️ installLateFunctionInterceptors: window.' + fnName + ' 已存在且 Phase 2 完成，用 setTimeout(0) 延迟 wrap');
            setTimeout(function () {
              var wrapFn = _getWrapFunction(GLOBAL_WRAP_MAP[fnName]);
              if (typeof wrapFn === 'function') wrapFn();
            }, 0);
          }
        }
      } catch (e) {
        LOG.warn('⚠️ 无法为 window.' + fnName + ' 安装拦截器（' + e.message + '），将依赖 waitAndWrapLateFunctions 兜底');
      }
    });
    LOG.info('✓ 已为 ' + GLOBAL_DRAW_FUNCTIONS.length + ' 个全局绘制函数安装拦截器');
  }

  // wrap 函数字典 —— 让 installLateFunctionInterceptors 能通过名字查找 wrap 函数
  // 闭包内的局部函数名在 setInterval/setTimeout 回调里无法直接引用，
  // 所以用一个统一的字典注册
  // 注：_WRAP_FUNCTIONS 的 var 声明在 IIFE 顶部（与 _phase2Done 等同处），避免 hoisting 问题
  function _registerWrap(name, fn) { _WRAP_FUNCTIONS[name] = fn; }
  function _getWrapFunction(name) { return _WRAP_FUNCTIONS[name]; }

  // ============================================================
  // 强制验证补丁链完整性（最后一道防线）
  // 在 waitAndWrapModules 所有 wrap 完成后调用，检测所有 __fmgcPatched 标记
  // 如果 defineProperty 拦截器因旧版脚本崩溃等原因未生效，这里能主动发现并报错
  //
  // @param {object} options - 可选配置
  // @param {boolean} options.skipLateWrap - 为 true 时跳过 GLOBAL_DRAW_FUNCTIONS 相关检查项
  //   （Phase 2 同步执行时 drawStateLabels 等还未赋值，传 true 避免误报；
  //    late-wrap 轮询兜底完成后不传此参数，做完整检查）
  // @param {string} options.stage - 日志标记当前阶段，帮助定位问题
  // ============================================================
  function forceVerifyAndApply(options) {
    options = options || {};
    var skipLateWrap = !!options.skipLateWrap;
    var stageLabel = options.stage || '';

    var failures = [];

    // 关键补丁标记检查清单
    var allChecks = [
      // Names 全局方法覆盖
      { obj: 'Names', prop: '__fmgcMethodOverridden', label: 'Names 方法覆盖', isLateWrap: false },
      { obj: 'Names', prop: '__fmgcDefaultsPatched', label: 'Names 默认值补丁', isLateWrap: false },
      // 各 FMG 模块包装
      { obj: 'Cultures', method: 'generate', prop: '__fmgcPatched', label: 'Cultures.generate', isLateWrap: false },
      { obj: 'Cultures', method: 'expand', prop: '__fmgcPatched', label: 'Cultures.expand', isLateWrap: false },
      { obj: 'Burgs', method: 'generate', prop: '__fmgcPatched', label: 'Burgs.generate', isLateWrap: false },
      { obj: 'States', method: 'generate', prop: '__fmgcPatched', label: 'States.generate', isLateWrap: false },
      { obj: 'States', method: 'getFullName', prop: '__fmgcPatched', label: 'States.getFullName', isLateWrap: false },
      { obj: 'States', method: 'defineStateForms', prop: '__fmgcPatched', label: 'States.defineStateForms', isLateWrap: false },
      { obj: 'Provinces', method: 'generate', prop: '__fmgcPatched', label: 'Provinces.generate', isLateWrap: false },
      { obj: 'Rivers', method: 'specify', prop: '__fmgcPatched', label: 'Rivers.specify', isLateWrap: false },
      { obj: 'Features', method: 'defineNames', prop: '__fmgcPatched', label: 'Features.defineNames', isLateWrap: false },
      { obj: 'Religions', method: 'generate', prop: '__fmgcPatched', label: 'Religions.generate', isLateWrap: false },
      { obj: 'Markers', method: 'generate', prop: '__fmgcPatched', label: 'Markers.generate', isLateWrap: false },
      { obj: 'Zones', method: 'generate', prop: '__fmgcPatched', label: 'Zones.generate', isLateWrap: false },
    ];

    // 过滤：skipLateWrap=true 时排除 late-wrap 项
    var checks = allChecks.filter(function (c) {
      return !skipLateWrap || !c.isLateWrap;
    });

    var header = stageLabel ? '[' + stageLabel + '] ' : '';

    checks.forEach(function(c) {
      var target;
      if (c.method) {
        // module.method
        target = window[c.obj] && window[c.obj][c.method];
      } else {
        // 全局对象
        target = window[c.obj];
      }
      if (!target || !target[c.prop]) {
        failures.push(c.label);
      }
    });

    if (failures.length > 0) {
      LOG.error(header + '⚠️⚠️⚠️ 补丁链有 ' + failures.length + ' 处未生效: ' + failures.join(', ') + ' ⚠️⚠️⚠️');
      LOG.error(header + '⚠️ 这意味着中文名称补丁可能无法正常工作！地图将显示英文名称。');
      LOG.warn(header + '⚠️ 常见原因: 1) 浏览器有旧版本缓存 → Hard Reload (Cmd+Shift+R) 2) SW 残留 → DevTools > Application > Service Workers > Unregister 3) 多个版本的 names-patch.js 并存');

      // 检查 WORD_BANKS_RAW 是否真的是完整注入的
      if (typeof WORD_BANKS_RAW === 'string' && WORD_BANKS_RAW.indexOf('PLACEHOLDER') !== -1) {
        LOG.error('❌ 致命: WORD_BANKS_RAW 仍含 PLACEHOLDER！构建产物有问题，请重新构建后部署。');
      }
      if (typeof WORD_BANKS_RAW === 'string' && WORD_BANKS_RAW.length < 100) {
        LOG.error('❌ 致命: WORD_BANKS_RAW 长度异常短 (' + WORD_BANKS_RAW.length + ' 字符)，词库可能未注入。');
      }
    } else {
      LOG.info(header + '✅✅✅ 补丁链完整性验证通过 —— 全部 ' + checks.length + ' 处已生效 ✅✅✅' +
        (skipLateWrap ? '（跳过 late-wrap 项，等待轮询兜底补完）' : ''));
      LOG.info(header + '✅ 中文名称补丁可以正常工作');
    }

    return failures;
  }

  // waitAndWrapModules —— 兜底机制（正常情况下由 installModuleInterceptors 完成 Phase 2，
  // 这里只作为 defineProperty 拦截器因某些环境限制（CSP、旧浏览器）无法生效时的备选方案）
  // 缩短轮询间隔到 10ms，确保即使拦截器失效也几乎不产生可感知延迟
  function waitAndWrapModules() {
    // 如果 Phase 2 已通过拦截器触发完成，直接返回
    if (_phase2Done) {
      LOG.info('waitAndWrapModules: Phase 2 已由拦截器触发，跳过兜底');
      return;
    }

    var attempts = 0;
    var maxAttempts = 100;  // 100 × 10ms = 1s 超时

    LOG.info('waitAndWrapModules 兜底启动（' + EXPECED_MODULES.length + ' 个模块，间隔 10ms）...');

    var interval = setInterval(function () {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        var readyList = EXPECED_MODULES.filter(function (m) { return window[m]; });
        var missingList = EXPECED_MODULES.filter(function (m) { return !window[m]; });
        LOG.warn('waitAndWrapModules 兜底超时：' + readyList.length + '/' + EXPECED_MODULES.length +
          ' 就绪。缺失: ' + missingList.join(', '));
        return;
      }

      // 每次轮询都检查并触发 Phase 2
      if (tryRunPhase2()) {
        clearInterval(interval);
        LOG.info('✅ waitAndWrapModules 兜底：Phase 2 已通过轮询触发完成');
      }
    }, 10);  // 10ms 间隔，几乎零竞态
  }

  // ============================================================
  // 启动 —— Object.defineProperty 拦截 window.Names 赋值
  // ============================================================
  try {
    var _names = null;
    Object.defineProperty(window, 'Names', {
      configurable: true,
      enumerable: true,
      get: function () { return _names; },
      set: function (v) {
        LOG.info('🚨 检测到 window.Names 赋值（FMG NamesGenerator 初始化）');
        _names = v;
        applyAllPatches();
      }
    });
    LOG.info('✓ Object.defineProperty 拦截器已就绪');
  } catch (e) {
    LOG.error('Object.defineProperty 拦截失败！无法注入补丁:', e.message);
    LOG.error('请检查是否有 CSP 或其他安全策略阻止了 defineProperty');
    // 拦截器全部失效 → 依赖 waitAndWrapModules 兜底
  }

  // 启动兜底轮询 —— 即使拦截器正常工作也跑一下（幂等），防止极端时序下拦截器未触发
  waitAndWrapModules();

  // ============================================================
  // late-wrap 兜底轮询 —— 为 Phase 2 之后才赋值的全局绘制函数（drawStateLabels 等）
  // 提供轮询兜底。Object.defineProperty 拦截器因 CSP/浏览器限制/时序问题失效时，
  // 此函数确保即使拦截器全部挂掉，drawStateLabels 也能在赋值后 10ms 内被 wrap。
  // ============================================================
  function waitAndWrapLateFunctions() {
    var pendingFnNames = GLOBAL_DRAW_FUNCTIONS.filter(function (fnName) {
      var wrapName = GLOBAL_WRAP_MAP[fnName];
      // 只轮询那些有对应 wrap 函数的全局函数（drawStateLabels 有，drawBurgLabels/markers 没有）
      return wrapName && _getWrapFunction(wrapName);
    });

    if (pendingFnNames.length === 0) {
      LOG.info('waitAndWrapLateFunctions: 无需兜底的 late-wrap 函数');
      return;
    }

    LOG.info('waitAndWrapLateFunctions 兜底启动（' + pendingFnNames.join(', ') + '，间隔 10ms）...');

    var attempts = 0;
    var maxAttempts = 300;  // 300 × 10ms = 3s 超时（FMG module script 整个 ~780KB，远快于这个）

    var interval = setInterval(function () {
      attempts++;

      // 逐个检查并 wrap
      var stillPending = [];
      for (var i = 0; i < pendingFnNames.length; i++) {
        var fnName = pendingFnNames[i];
        if (typeof window[fnName] === 'function' && !window[fnName].__fmgcPatched) {
          var wrapName = GLOBAL_WRAP_MAP[fnName];
          var wrapFn = _getWrapFunction(wrapName);
          try {
            LOG.info('🚨 waitAndWrapLateFunctions 兜底: 检测到 window.' + fnName + ' 已赋值，立即 wrap...');
            var result = wrapFn();
            LOG.info('✅ waitAndWrapLateFunctions 兜底 wrap ' + fnName + ' 结果: ' + (result ? '成功' : '跳过'));
          } catch (e) {
            LOG.error('❌ waitAndWrapLateFunctions 兜底 wrap ' + fnName + ' 异常: ' + e.message);
            stillPending.push(fnName);
          }
        } else if (typeof window[fnName] !== 'function') {
          stillPending.push(fnName);
        }
        // else: 已经是 function 且 __fmgcPatched 已标记 → 无需处理
      }
      pendingFnNames = stillPending;

      if (pendingFnNames.length === 0) {
        clearInterval(interval);
        LOG.info('✅ waitAndWrapLateFunctions 兜底完成：所有 late-wrap 函数已就绪');
        // 兜底完成后再跑一次完整 forceVerifyAndApply
        if (typeof forceVerifyAndApply === 'function') {
          forceVerifyAndApply({ stage: 'LateWrapComplete' });
        }
        return;
      }

      if (attempts > maxAttempts) {
        clearInterval(interval);
        LOG.warn('⚠️ waitAndWrapLateFunctions 兜底超时：仍有 ' + pendingFnNames.join(', ') + ' 未就绪');
        // 超时后也跑一次完整验证，报告准确状态
        if (typeof forceVerifyAndApply === 'function') {
          forceVerifyAndApply({ stage: 'LateWrapTimeout' });
        }
      }
    }, 10);
  }

  // Phase 2 完成后启动 late-wrap 兜底 —— 用 setTimeout(0) 确保 Phase 2 已执行完
  // （因为 Phase 2 是在 Names setter 里同步执行的，我们需要跳出那个 call stack）
  var _startPollingAttempts = 0;
  var _startPollingMaxAttempts = 100;  // 100 × 50ms = 5s 超时
  var _tryStartLateWrapPolling = function () {
    _startPollingAttempts++;
    if (_phase2Done) {
      waitAndWrapLateFunctions();
    } else if (_startPollingAttempts <= _startPollingMaxAttempts) {
      // Phase 2 还没完成，再等 50ms
      setTimeout(_tryStartLateWrapPolling, 50);
    } else {
      LOG.warn('⚠️ _tryStartLateWrapPolling 超时：Phase 2 始终未完成（已等 5s），放弃启动 late-wrap 兜底');
    }
  };
  setTimeout(_tryStartLateWrapPolling, 0);

  // ============================================================
  // 暴露调试接口
  // ============================================================
  var _debugApi = {};
  Object.defineProperty(_debugApi, 'profile', {
    configurable: true,
    enumerable: true,
    get: function () { return ChineseNames.profile; },
    set: function (v) { ChineseNames.profile = v; }
  });
  _debugApi.chineseNames = ChineseNames;
  _debugApi.getCounters = function () { return counters; };
  _debugApi.getWordBanks = function () { return ChineseNames.banks; };
  _debugApi.showSummary = function () {
    LOG.info('=== 名称生成计数器汇总 ===');
    Object.keys(counters).forEach(function (k) {
      LOG.info('  ' + k + ' = ' + counters[k]);
    });
    LOG.info('========================');
  };
  _debugApi.reload = function () { applyAllPatches(); };
  // ============================================================
  // 词库切换接口 —— 给 wordbank-switcher.js 调用
  // 接受完整的 WORD_BANKS 对象: { _profile: "xxx", culture: {names:"...",procedural:{}}, state: {...}, ... }
  // ============================================================
  _debugApi.loadProfile = function (newBankData) {
    if (!newBankData || typeof newBankData !== 'object') {
      throw new Error('[FMGC Names] loadProfile: 传入的数据必须是对象');
    }
    LOG.info('🔄 切换词库 profile...');

    // 1. 更新闭包变量
    WORD_BANKS = newBankData;
    PROFILE = WORD_BANKS._profile || 'unknown';
    delete WORD_BANKS._profile;

    // 1.5. 历法名称池（从 era.json 来）
    if (WORD_BANKS._era && Array.isArray(WORD_BANKS._era) && WORD_BANKS._era.length > 0) {
      ERA_POOL = WORD_BANKS._era.slice();
      delete WORD_BANKS._era;
      LOG.info('📅 历法名称池已加载: ' + ERA_POOL.length + ' 种历法');
    } else {
      ERA_POOL = null;
      LOG.info('📅 当前 profile 无 era 数据，使用 FMG 默认历法');
    }

    // 2. 重新构建缓存
    initBankArrays();

    // 2.5. 确保当前 profile engine 就绪 + 刷新私有缓存
    ensureEngine();

    // 3. 重置去重
    resetAllUsed();

    // 4. 重置计数器
    counters = {};

    // 5. 同步更新暴露对象（ChineseNames.profile 变化后，debug.profile getter 自动跟上）
    ChineseNames.profile = PROFILE;
    ChineseNames.banks = WORD_BANKS;

    LOG.info('✅ 词库已切换为: ' + PROFILE);
    return PROFILE;
  };
  // 直接测试每种生成函数
  _debugApi.test = function () {
    LOG.info('=== ChineseNames 测试生成 ===');
    LOG.info('  culture:  ' + ChineseNames.getCulture());
    LOG.info('  state:    ' + ChineseNames.getState());
    LOG.info('  burg:     ' + ChineseNames.getBurg());
    LOG.info('  province: ' + ChineseNames.getProvince());
    LOG.info('  river:    ' + ChineseNames.getRiver());
    LOG.info('  lake:     ' + ChineseNames.getLake());
    LOG.info('  mapName:  ' + ChineseNames.getMapName());
    LOG.info('  religion: ' + ChineseNames.getReligion());
    LOG.info('  marker:   ' + ChineseNames.getMarker());
    LOG.info('  zone:     ' + ChineseNames.getZone());
    LOG.info('============================');
  };

  // ============================================================
  // Hook FMG era —— 用 FMGC 词库风格历法名
  //
  // ⚠️ 关键时序陷阱 ⚠️
  // FMG 的脚本加载顺序：
  //   defer: options.js  →  window.generateEra 定义
  //   defer: main.js     →  generate() → randomizeOptions() → generateEra()
  //
  // 所有 defer 脚本在 DOM 解析完后**同步连续执行**（同一个 macrotask）。
  // setTimeout 轮询的 hook 要等这整个 macrotask 结束后才会触发，
  // 也就是说：main.js 的 generate() 已经跑完了我们的 hook 才装上！
  // 第一次 generateEra 调用必然走 FMG 原始逻辑，options.era 是 "Han Era"。
  //
  // ✅ 解决方案：双保险
  //   保险1：hook randomizeOptions（等它出现后叠一层）—— 覆盖第一次 generate()
  //   保险2：hook generateEra（用户手动 regenerateEra / 切换词库）—— 覆盖后续调用
  // ============================================================

  // — 工具函数：从 ERA_POOL 随机选一个历法名并写入 FMG 状态 —
  // ⚠️ 关键：FMG 的 options 是 main.js 里的 "let options"（Script Scope），
  // 不是 window.options！所以这里直接写 options.era（Script Scope 变量），
  // 不要写 window.options.era（那是 FMGC bootstrap 创建的另一个空对象）。
  function _applyEraOverride() {
    if (!ERA_POOL || !Array.isArray(ERA_POOL) || ERA_POOL.length === 0) return;
    // 尊重用户显式锁定的 era
    try {
      if (typeof window.locked === 'function' && window.locked('era')) return;
    } catch (e) {}

    var idx = Math.floor(Math.random() * ERA_POOL.length);
    var eraName = ERA_POOL[idx];
    try {
      // 直接写 Script Scope 的 options（main.js 里的 let options）
      // eslint-disable-next-line no-undef
      if (typeof options !== 'undefined' && options) {
        options.era = eraName;
        if (/[\u4e00-\u9fff]/.test(eraName)) {
          options.eraShort = eraName.length > 2 ? eraName.substring(0, 2) : eraName;
        } else {
          options.eraShort = eraName.split(' ').map(function (w) {
            return w[0] ? w[0].toUpperCase() : '';
          }).join('');
        }
      }
      if (typeof window.eraInput !== 'undefined') window.eraInput.value = eraName;
      LOG.info('📅 FMGC era override: "' + eraName + '" (profile=' + PROFILE + ')');
    } catch (e) {
      LOG.warn('FMGC era override 失败:', e.message);
    }
  }

  // ============================================================
  // Marker type 中文名映射 + editMarker hook
  // FMG 的 marker.type 是英文 key（"volcanoes"、"battlefields"...），
  // 编辑弹窗 #markerType input 和 Overview 下拉菜单都直接显示这个 key。
  // 这里 hook editMarker 函数，在更新完 inputs 后把 type value 翻译成中文。
  // ============================================================

  // FMG markers-generator.ts 中所有 marker type key → 中文名
  var MARKER_TYPE_NAMES = {
    'volcanoes': '火山',
    'hot-springs': '温泉',
    'water-sources': '水源',
    'mines': '矿山',
    'bridges': '桥梁',
    'inns': '客栈',
    'lighthouses': '灯塔',
    'waterfalls': '瀑布',
    'battlefields': '古战场',
    'dungeons': '地牢',
    'lake-monsters': '湖怪',
    'sea-monsters': '海怪',
    'hill-monsters': '山妖',
    'sacred-mountains': '圣山',
    'sacred-forests': '圣地森林',
    'sacred-pineries': '圣地松林',
    'sacred-palm-groves': '圣地棕榈林',
    'brigands': '盗匪',
    'pirates': '海盗',
    'statues': '雕像',
    'ruins': '遗迹',
    'libraries': '图书馆',
    'circuses': '马戏团',
    'jousts': '骑士比武',
    'fairs': '集市',
    'canoes': '独木舟',
    'migration': '迁徙',
    'dances': '舞蹈',
    'mirage': '海市蜃楼',
    'caves': '洞穴',
    'portals': '传送门',
    'rifts': '裂隙',
    'disturbed-burials': '被盗坟墓',
    'necropolises': '墓地',
    'encounters': '遭遇'
  };

  // 反向映射（中文名 → 英文 key），处理用户手动输入中文的情况
  var MARKER_TYPE_NAMES_REVERSE = {};
  Object.keys(MARKER_TYPE_NAMES).forEach(function(k) {
    MARKER_TYPE_NAMES_REVERSE[MARKER_TYPE_NAMES[k]] = k;
  });

  function translateMarkerTypeKey(key) {
    if (!key) return key;
    return MARKER_TYPE_NAMES[key] || key;
  }
  function translateMarkerTypeKeyBack(cn) {
    if (!cn) return cn;
    return MARKER_TYPE_NAMES_REVERSE[cn] || cn;
  }

  // hook editMarker（Script Scope 函数，轮询等待 FMG markers-editor.js 加载）
  function hookMarkerEditor() {
    if (typeof editMarker !== 'function') {
      setTimeout(hookMarkerEditor, 50);
      return;
    }
    if (editMarker.__fmgcHooked) return;

    var _origEditMarker = editMarker;
    // eslint-disable-next-line no-undef
    editMarker = function(markerI) {
      var result = _origEditMarker.apply(this, arguments);
      // editMarker 内部调用了 updateInputs() 设 markerType.value
      // 这里等下一个 tick 确保 DOM 更新完成后翻译
      setTimeout(function() {
        try {
          var mt = document.getElementById('markerType');
          if (mt && mt.value && MARKER_TYPE_NAMES[mt.value]) {
            // mt.value 当前是英文 key（由 FMG updateInputs 写入），
            // 先存原始英文 key 到 dataset，再改成中文显示
            mt.dataset.enType = mt.value;
            mt.value = MARKER_TYPE_NAMES[mt.value];
          }
        } catch (e) {}
      }, 0);
      return result;
    };
    editMarker.__fmgcHooked = true;
    LOG.info('✅ editMarker 已 hook → markerType 中文显示');

    // 同时 hook changeMarkerType 的反向翻译（用户可能编辑 input）
    // changeMarkerType 在 editMarker 的闭包里，外部 hook 不到。
    // 所以改用监听 input 的 change 事件做反向翻译
    document.addEventListener('change', function(e) {
      if (e.target && e.target.id === 'markerType') {
        var cnVal = e.target.value.trim();
        var enVal = translateMarkerTypeKeyBack(cnVal);
        if (enVal !== cnVal) {
          // 找到了对应的英文 key，设回去让 FMG 内部正常处理
          e.target.value = enVal;
        }
      }
    }, true); // capture phase，在 FMG 的 change 处理之前执行
  }
  setTimeout(hookMarkerEditor, 100);

  // — 用 DOMContentLoaded 保证在 FMG 第一次 generate() 之前 hook —
  // FMG 的 generateMapOnLoad() 也是在 DOMContentLoaded 里触发的，
  // 我们的监听器先注册（head 同步执行），所以先执行 → hook 先装上 → FMG generate 后跑。
  document.addEventListener('DOMContentLoaded', function installEraHooks() {
    // FMG 2.0: randomizeOptions/generateEra 已不存在。历法现在由 Names.getEra() / Names.getEraShort() 生成，
    // 在 options-model.ts 生成 pipeline 中被调用。这里直接 patch 这两个 Names 方法。
    if (!window.Names || typeof window.Names.getEra !== 'function' || typeof window.Names.getEraShort !== 'function') {
      LOG.warn('⚠️ DOMContentLoaded 时 Names.getEra/getEraShort 还没就绪，fallback 到轮询');
      var retries = 0;
      var tryAgain = function () {
        retries++;
        if (retries > 60) { LOG.warn('⏰ era hook 超时'); return; }
        if (window.Names && typeof window.Names.getEra === 'function' && typeof window.Names.getEraShort === 'function') {
          installEraHooks();
        } else {
          setTimeout(tryAgain, 50);
        }
      };
      setTimeout(tryAgain, 50);
      return;
    }

    // === Patch Names.getEra —— 返回中文历法名 ===
    if (!window.Names.getEra.__fmgcPatched) {
      var _origGetEra = window.Names.getEra;
      window.Names.getEra = function () {
        if (ERA_POOL && Array.isArray(ERA_POOL) && ERA_POOL.length > 0) {
          return ERA_POOL[Math.floor(Math.random() * ERA_POOL.length)];
        }
        return _origGetEra.apply(this, arguments);
      };
      window.Names.getEra.__fmgcPatched = true;
      LOG.info('✅ Names.getEra 已覆盖 → 中文历法名');
    }

    // === Patch Names.getEraShort —— 中文历法取前 2 字 ===
    if (!window.Names.getEraShort.__fmgcPatched) {
      var _origGetEraShort = window.Names.getEraShort;
      window.Names.getEraShort = function (era) {
        if (era && /[\u4e00-\u9fff]/.test(era)) {
          return era.length > 2 ? era.substring(0, 2) : era;
        }
        return _origGetEraShort.apply(this, arguments);
      };
      window.Names.getEraShort.__fmgcPatched = true;
      LOG.info('✅ Names.getEraShort 已覆盖 → 中文历法缩写');
    }

    // === Hook regeneratePrompt / regenerateMap —— 每次重新生成地图前重置去重追踪 ===
    // FMG 2.0 的"生成新地图"按钮 onclick="regeneratePrompt()"，走 window.regeneratePrompt（全局查找）。
    // regeneratePrompt 内部调用局部 const regenerateMap，所以必须 hook regeneratePrompt 才能拦截。
    // 同时 hook window.regenerateMap 兜底（其他可能直接调 window.regenerateMap 的场景）。
    if (typeof window.regeneratePrompt === 'function' && !window.regeneratePrompt.__fmgcPatched) {
      var _origRegeneratePrompt = window.regeneratePrompt;
      window.regeneratePrompt = function () {
        resetAllUsed();
        return _origRegeneratePrompt.apply(this, arguments);
      };
      window.regeneratePrompt.__fmgcPatched = true;
      LOG.info('✅ regeneratePrompt 已 hook → resetAllUsed');
    }
    if (typeof window.regenerateMap === 'function' && !window.regenerateMap.__fmgcPatched) {
      var _origRegenerateMap = window.regenerateMap;
      window.regenerateMap = function () {
        resetAllUsed();
        return _origRegenerateMap.apply(this, arguments);
      };
      window.regenerateMap.__fmgcPatched = true;
      LOG.info('✅ regenerateMap 已 hook → resetAllUsed');
    }

    // === regenerateEra（lore 弹窗内的历法重新生成按钮）—— 重置 era 去重并强制重算 ===
    // FMG 2.0 的 regenerateEra 在 lore-editor.ts 内，不挂 window。这里通过按钮事件委托实现。
    var eraRegenBtn = document.getElementById('loreEraRegenerate');
    if (eraRegenBtn && !eraRegenBtn.__fmgcHooked) {
      eraRegenBtn.addEventListener('click', function () {
        // era 名称从 ERA_POOL 随机取，无需去重；这里仅确保 getEra 下次调用返回新值
        LOG.info('📅 loreEraRegenerate 点击 → Names.getEra 将返回新历法名');
      }, true);
      eraRegenBtn.__fmgcHooked = true;
    }

    // === Hook 批量改名按钮（直接调 Names.get*，不经过模块包装）===
    // 这些按钮在编辑器里批量重新生成名称，直接走 Names.get* 路径。
    // 需要在 FMG click handler 执行前做 per-type reset。
    // 用 capture phase 监听，因为我们要在 FMG 的 click 处理之前执行 reset。
    var REGENERATE_BUTTON_HOOKS = [
      // burgs-overview.js 的"重新生成所有城镇名"按钮
      { id: 'regenerateBurgNames', type: 'burg', label: '批量重命名城镇' },
    ];
    for (var hi = 0; hi < REGENERATE_BUTTON_HOOKS.length; hi++) {
      (function(hookCfg) {
        var el = document.getElementById(hookCfg.id);
        if (el && !el.__fmgcHooked) {
          // capture phase 先于 FMG 的 click 处理执行
          document.addEventListener('click', function(e) {
            if (e.target === el || el.contains(e.target)) {
              resetTypeUsed(hookCfg.type);
              if (DEBUG) LOG.info('🧹 批量改名触发 resetTypeUsed(' + hookCfg.type + ')');
            }
          }, true);
          el.__fmgcHooked = true;
          LOG.info('✅ ' + hookCfg.label + ' hook → ' + hookCfg.id + ' resetTypeUsed(' + hookCfg.type + ')');
        }
      })(REGENERATE_BUTTON_HOOKS[hi]);
    }
  });

  window.__FMGC_NAMES_DEBUG__ = _debugApi;
  LOG.info('调试接口就绪：__FMGC_NAMES_DEBUG__ (try __FMGC_NAMES_DEBUG__.test())');
})();

