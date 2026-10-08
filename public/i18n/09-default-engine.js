// FMGC Engine Profile: default
// Files: index.js


// --- index.js ---
/**
 * default profile — 引擎调度层
 *
 * 职责唯一：读 JSON → extractRoots → 调共享引擎 → 返回
 * 本文件不包含任何引擎拼接逻辑。
 *
 * 运行时加载：08-shared-engine.js 先于本文件加载
 *   shared/config.js       → window.__FMGC_CONFIG__
 *   shared/extract-roots.js → registry.__shared_extractRoots
 *   shared/engine/*.js     → registry.__shared_engines
 */
(function () {
  'use strict';
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  var CFG = window.__FMGC_CONFIG__;

  // 从 shared 拿（08-shared-engine.js 已先加载）
  var extractRoots = registry.__shared_extractRoots;
  var engines = registry.__shared_engines;

  if (!extractRoots) {
    console.error('[FMGC] ❌ shared/extract-roots.js 未加载！构建脚本有问题。');
    return;
  }

  // ── default profile 的 regime 制度（从旧 index.js 保留）──
var REGIMES = {
    'prefecture-county': {
      name: '郡县制',
      stateSuffixes: ['朝', '国'],
      provinceSuffixes: ['郡', '州', '道', '路'],
      burgSuffixes: ['城', '县', '镇', '乡', '里', '关', '堡', '寨']
    },
    'zhou-jun': {
      name: '州郡制',
      stateSuffixes: ['朝', '国'],
      provinceSuffixes: ['州', '郡', '府', '军'],
      burgSuffixes: ['城', '县', '镇', '乡', '坊', '集', '店', '驿']
    },
    'dao-lu': {
      name: '道路制',
      stateSuffixes: ['朝', '国'],
      provinceSuffixes: ['道', '路', '府', '州', '郡'],
      burgSuffixes: ['城', '县', '镇', '乡', '坊', '集', '店', '驿', '铺']
    },
    'xing-sheng': {
      name: '行省制',
      stateSuffixes: ['朝', '国'],
      provinceSuffixes: ['省', '府', '州', '道'],
      burgSuffixes: ['城', '县', '镇', '乡', '堡', '关', '屯', '营', '寨']
    },
    'feudal': {
      name: '封建制',
      stateSuffixes: ['朝', '国'],
      provinceSuffixes: ['州', '城'],
      burgSuffixes: ['城', '关', '寨', '镇', '堡', '屯']
    }
  };
  var REGIME_IDS = Object.keys(REGIMES);
var TYPE_TO_REGIME_KEY = {
    'state': 'stateSuffixes',
    'province': 'provinceSuffixes',
    'burg': 'burgSuffixes'
  };

  registry['default'] = {
    profile: 'default',
    _regimes: REGIMES,

    // ═══ names-patch.js 调用的接口（签名绝对不变）═══

    /** 随机选择一套行政制度（names-patch.js getState() 首次调用时触发） */
    pickRegime: function () {
      return REGIME_IDS[Math.floor(Math.random() * REGIME_IDS.length)];
    },

    /** 按制度获取 suffix 子集 */
    getSuffixesFor: function (type, regimeId, fullSuffixes) {
      var regime = REGIMES[regimeId];
      if (!regime) return fullSuffixes || [];
      var key = (TYPE_TO_REGIME_KEY || {
        'state': 'stateSuffixes',
        'province': 'provinceSuffixes',
        'burg': 'burgSuffixes'
      })[type];
      if (key && regime[key] && regime[key].length > 0) return regime[key];
      return fullSuffixes || [];
    },

    // 🔥 5 参数签名绝对不变（names-patch.js 按这个调的）
    generateProcedural: function (type, bankNames, proceduralCfg, rootCache, opts) {
      if (!proceduralCfg || !proceduralCfg.enabled) return null;

      // 1. extractRoots 用 stripSuffixes（全面剥离词汇表），由 config.js 自动生成
      //    迭代剥离 + candidate太短时continue（extract-roots.js v2）→ root 彻底干净
      var extractSuffixes = proceduralCfg.extractSuffixes || [];
      var stripSuffixes = proceduralCfg.stripSuffixes || CFG.autoGenerateStripSuffixes(bankNames, extractSuffixes);
      var roots = extractRoots(bankNames, stripSuffixes, rootCache);
      if (roots.length === 0) return null;

      // 🆕 从 forbidden.json 拿禁止的 root 片段（运行时过滤）
      // 直接读 window.__FMGC_FORBIDDEN__（names-patch.js initBankArrays 里设置，100% 可用）
      var forbidden = window.__FMGC_FORBIDDEN__;
      if (forbidden && forbidden.roots && forbidden.roots.length > 0) {
        var filtered = [];
        for (var r = 0; r < roots.length; r++) {
          var ok = true;
          for (var fr = 0; fr < forbidden.roots.length; fr++) {
            if (roots[r].indexOf(forbidden.roots[fr]) >= 0) { ok = false; break; }
          }
          if (ok) filtered.push(roots[r]);
        }
        roots = filtered;
        if (roots.length === 0) return null;
      }

      // 2. 找引擎（JSON 里写死的 generator，路径 100% 确定）
      //    🆕 去掉了旧代码的 70/30 随机引擎选择
      var genName = proceduralCfg.generator || 'default';
      var engine = engines[genName];
      if (!engine) {
        console.error('[FMGC] 引擎 "' + genName + '" 不存在。可用: ' + Object.keys(engines).join(','));
        return null;
      }

      // 3. suffix 始终用完整 extractSuffixes（生成后缀池，精简版）
      //    stripSuffixes（全面剥离词汇表）已在上面生成，传给引擎做双重后缀检测
      var suffixes = extractSuffixes;

      // 4. 组装 cfg → 调共享引擎（内部用 TYPE_BOUNDS clamp 长度）
      //    - prefixPool 自动剔除与 extractSuffixes 重叠的词（契约：prefixPool ∩ extractSuffixes = ∅）
      //    - 注入 stripSuffixes 供引擎双重后缀检测
      var rawPP = proceduralCfg.prefixPool || [];
      var cleanedPP = rawPP.filter(function(p) { return suffixes.indexOf(p) < 0; });
      var engineCfg = {
        extractSuffixes: suffixes,
        stripSuffixes: stripSuffixes,
        prefixPool: cleanedPP,
        lengthMin: proceduralCfg.lengthMin,
        lengthMax: proceduralCfg.lengthMax
      };

      // 5. 外层重试（引擎返回 null = 内部约束无法满足，换一批随机）
      for (var i = 0; i < CFG.MAX_EXTERNAL_RETRY; i++) {
        var result = engine(roots, engineCfg, type);
        if (result && result.length > 0) return result;
      }
      return null;
    },

    onLoad: function (wordBanks) {
      // 🆕 LEGIT_DUP profile 覆盖（时机：onLoad 执行一次）
      // 从 window.__FMGC_FORBIDDEN__ 读（names-patch.js 在 L115 已 delete 了 wordBanks._forbidden，
      // 所以不能从参数读）
      var fb = window.__FMGC_FORBIDDEN__;
      if (fb && fb.legitDupOverride) {
        CFG.LEGIT_DUP = fb.legitDupOverride;
      }
      return { rootCache: {} };
    },

    formatStateFullName: function (state) {
      return state && state.name ? state.name : '';
    },

    // ═══════════════════════════════════════════════════════════
    // Provinces 行政区划后缀 —— 替换 FMG 原生 County/Earldom/Island 等英文
    // ═══════════════════════════════════════════════════════════

    /** 从当前 REGIME 取一个 province 中文后缀 */
    getProvinceSuffix: function (regimeId) {
      var regime = REGIMES[regimeId];
      if (regime && regime.provinceSuffixes && regime.provinceSuffixes.length > 0) {
        return regime.provinceSuffixes[Math.floor(Math.random() * regime.provinceSuffixes.length)];
      }
      // fallback: 从所有 regime 里随便取一个
      for (var id in REGIMES) {
        if (REGIMES[id].provinceSuffixes && REGIMES[id].provinceSuffixes.length > 0) {
          return REGIMES[id].provinceSuffixes[Math.floor(Math.random() * REGIMES[id].provinceSuffixes.length)];
        }
      }
      return '省';
    },

    /** 特殊处理：Island/Islands/Colony → 中文映射（不需要 regime，直接替换 FMG 原生硬编码） */
    translateProvinceFormName: function (fmgFormName) {
      var map = {
        'Island': '岛',
        'Islands': '岛群',
        'Colony': '殖民地',
        'County': '郡',
        'Earldom': '县',
        'Shire': '郡',
        'Landgrave': '州',
        'March': '关',
        'Principality': '公国',
        'Duchy': '侯国',
        'Canton': '州',
        'Republic': '自治省',
        'Council': '议省区',
        'Commune': '公社',
        'Community': '社区',
        'Tribe': '部落',
        'State': '州',
        'Province': '省',
      };
      return map[fmgFormName] || null;
    },

    /** 格式化 province.formName 为中文后缀名 */
    formatProvinceFormName: function (province, regimeId) {
      // 1. 如果 FMG 给的是英文特殊值（Island/Colony...），先查翻译表
      var orig = province.formName || '';
      var translated = this.translateProvinceFormName(orig);
      if (translated) return translated;

      // 2. 正常情况：从 REGIME.provinceSuffixes 取一个中文后缀
      return this.getProvinceSuffix(regimeId);
    },

    /** 格式化 province.fullName 为 "名称+后缀" 格式 */
    formatProvinceFullName: function (province, regimeId) {
      if (!province || !province.name) return '';
      // name 可能已经含后缀（如 "长安郡"），此时直接返回 name
      // 简单启发式：检查最后一个字符是否匹配任一 provinceSuffixes 后缀
      var suffix = this.getProvinceSuffix(regimeId);
      var name = province.name;
      if (name.length >= 2 && suffix && name.indexOf(suffix, name.length - suffix.length) >= 0) {
        return name; // 已含后缀
      }
      return name + suffix;
    },

    // ═══════════════════════════════════════════════════════════
    // Religions 宗教名称 —— 替换 FMG 原生 ism/Faith of/of the 等英文模板
    // ═══════════════════════════════════════════════════════════

    /**
     * 把 FMG 原生生成的宗教名转为中文模板名
     *
     * FMG 原生宗教名结构分析 (generateReligionName L1074-1105):
     *   "Random + ism"         → `${random()}ism`               → "道教ism"  (中文词根 + ism)
     *   "Supreme + ism"        → `${trimVowels(supreme)}ism`    → "三清ism"
     *   "Faith of + Supreme"   → `Faith of ${supreme}`          → "Faith of 三清" (全英文模板)
     *   "Place + ism"          → `${place()}ism`                → "长安ism"
     *   "Culture + ism"        → `${trimVowels(culture)}ism`    → "儒家ism"
     *   "Place + ian + type"   → `${adj(place)} ${type}`        → "长安 Religious"
     *   "Culture + type"       → `${culture} ${type}`           → "儒家 Faith"
     *   "Burg + ian + type"    → `${adj(place)} ${type}`        → "长安 Church"
     *   "Random + ian + type"  → `${adj(random())} ${type}`     → "道教 Religion"
     *   "Type + of the + ..."  → `${type} of the ${meaning}`    → "Faith of the XXX"
     *
     * 提取策略：
     *   1. 去掉末尾 ism → 中文词根
     *   2. 去掉 "Faith of "/"+ ism"/" + type"/" of the XXX" → 保留核心部分
     *   3. 根据 religion.type (Folk/Organized/Cult/Heresy) + religion.form
     *      选一个中文命名模板组合
     */
    formatReligionName: function (religion) {
      var orig = religion.name || '';
      if (!orig) return orig;
      var type = religion.type || 'Organized'; // Folk / Organized / Cult / Heresy
      var form = religion.form || '';          // Monotheism/Polytheism/Philosophical...

      // ── Step 1: 从原始英文结构里提取中文词根 ──
      var core = orig;

      // 1a. 去掉 ism 后缀（可能直接在中文后面）
      core = core.replace(/ism$/i, '');

      // 1b. 处理 "Faith of XXX" / "Way of XXX" / "Path of XXX" 类
      var faithMatch = core.match(/^(Faith|Way|Path|Word|Witnesses)\s+of\s+(.+)$/i);
      if (faithMatch) core = faithMatch[2];

      // 1c. 处理 "XXX of the YYY" 类（Y 是英文 meaning）
      var ofTheMatch = core.match(/^(.+?)\s+of\s+the\s+.+$/i);
      if (ofTheMatch) core = ofTheMatch[1];

      // 1d. 处理 "XXX Religious" / "XXX Faith" / "XXX Church" 类（尾部英文 type）
      core = core.replace(/\s+(Religious|Religion|Faith|Church|Creed|Gods|Pantheon|Philosophy|Doctrine|School|Way|Sect|Society|Brotherhood|Circle|Ethics|Precepts|Commandments)$/i, '');

      // 1e. 去掉 "the " 前缀（getAdjective 可能生成）
      core = core.replace(/^the\s+/i, '');

      // 1f. 处理 getAdjective 前缀（"New"/"Old"/"Greater"/"Lesser"）—— 直接去掉
      core = core.replace(/^(New|Old|Greater|Lesser|Eastern|Western|Northern|Southern)\s+/i, '');

      // ── Step 2: 根据 type + form 选中文命名模板 ──
      // default profile 模板（中国古代历史风格）
      var templates = this._religionTemplates || {
        // Folk 民间信仰
        'Folk': ['{core}信仰', '{core}传统', '{core}祭', '{core}礼'],
        // Organized 有组织宗教
        'Organized': ['{core}教', '{core}道', '{core}宗', '{core}门', '{core}会'],
        // Cult 邪教/异教
        'Cult': ['{core}邪教', '{core}秘教', '{core}异教', '{core}暗教'],
        // Heresy 异端
        'Heresy': ['{core}异端', '{core}邪说', '{core}旁门', '{core}左道'],
      };

      var pool = templates[type] || templates['Organized'];
      var tpl = pool[Math.floor(Math.random() * pool.length)];
      var result = tpl.replace(/\{core\}/g, core);

      return result;
    }
  };
})();

