// FMGC Engine Profile: modern-urban
// Files: index.js


// --- index.js ---
/**
 * modern-urban profile — 引擎调度层
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

  // ── modern-urban profile 的 regime 制度（从旧 index.js 保留）──
var REGIMES = {
    'presidential-republic': {
      name: '总统共和制',
      description: '总统为国家元首兼政府首脑，共和国/合众国 → 省/州 → 市/区/县/街/路',
      stateSuffixes: ['共和国', '合众国'],
      provinceSuffixes: ['省', '州', '自治区'],
      burgSuffixes: ['市', '区', '县', '街', '路', '中心']
    },
    'federal-parliamentary': {
      name: '议会联邦制',
      description: '议会制联邦国家，内阁对议会负责，联邦/合众国 → 州/省 → 市/镇/区/路/大厦',
      stateSuffixes: ['联邦', '合众国'],
      provinceSuffixes: ['州', '省', '领地'],
      burgSuffixes: ['市', '镇', '区', '路', '大厦', '广场']
    },
    'constitutional-monarchy': {
      name: '君主立宪制',
      description: '君主为国家元首但无实权，内阁执政，王国/联合王国 → 省/州/自治区 → 市/镇/县/街/巷',
      stateSuffixes: ['王国', '联合王国'],
      provinceSuffixes: ['省', '州', '自治区', '领'],
      burgSuffixes: ['市', '镇', '县', '街', '巷', '中心']
    },
    'socialist-system': {
      name: '社会主义制度',
      description: '工人阶级领导的人民民主专政，共和国 → 省/自治区/直辖市/特别行政区 → 市/区/县/乡/镇',
      stateSuffixes: ['共和国'],
      provinceSuffixes: ['省', '自治区', '直辖市', '特别行政区'],
      burgSuffixes: ['市', '区', '县', '乡', '镇', '街道', '村']
    },
    'special-administration': {
      name: '特别行政区',
      description: '高度自治的特别行政区域，联邦/联合酋长国 → 市/自治区/特别市 → 区/镇/街/广场/中心',
      stateSuffixes: ['联邦', '联合酋长国'],
      provinceSuffixes: ['市', '自治区', '特别市', '特别行政区'],
      burgSuffixes: ['区', '镇', '街', '广场', '中心', '大厦']
    },
    'autonomous-territory': {
      name: '自治领地',
      description: '自治领地/海外领地/公国属地，公国 → 省/州/领地 → 市/区/镇/中心',
      stateSuffixes: ['公国'],
      provinceSuffixes: ['省', '州', '领地', '自治区'],
      burgSuffixes: ['市', '区', '镇', '中心', '广场', '路']
    }
  };
  var REGIME_IDS = Object.keys(REGIMES);
var TYPE_TO_REGIME_KEY = {
    'state': 'stateSuffixes',
    'province': 'provinceSuffixes',
    'burg': 'burgSuffixes'
  };

  registry['modern-urban'] = {
    profile: 'modern-urban',
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
    getProvinceSuffix: function (regimeId) {
      var regime = REGIMES[regimeId];
      if (regime && regime.provinceSuffixes && regime.provinceSuffixes.length > 0) {
        return regime.provinceSuffixes[Math.floor(Math.random() * regime.provinceSuffixes.length)];
      }
      for (var id in REGIMES) {
        if (REGIMES[id].provinceSuffixes && REGIMES[id].provinceSuffixes.length > 0) {
          return REGIMES[id].provinceSuffixes[Math.floor(Math.random() * REGIMES[id].provinceSuffixes.length)];
        }
      }
      return '省';
    },
    translateProvinceFormName: function (fmgFormName) {
      var map = {'Island':'岛','Islands':'岛群','Colony':'殖民地','County':'郡','Earldom':'县','Shire':'郡','Landgrave':'州','March':'关','Principality':'公国','Duchy':'侯国','Canton':'州','Republic':'自治省','Council':'议省区','Commune':'公社','Community':'社区','Tribe':'部落','State':'州','Province':'省','Wild':'荒领'};
      return map[fmgFormName] || null;
    },
    formatProvinceFormName: function (province, regimeId) {
      var orig = province.formName || '';
      var translated = this.translateProvinceFormName(orig);
      if (translated) return translated;
      return this.getProvinceSuffix(regimeId);
    },
    formatProvinceFullName: function (province, regimeId) {
      if (!province || !province.name) return '';
      var suffix = this.getProvinceSuffix(regimeId);
      var name = province.name;
      if (name.length >= 2 && suffix && name.indexOf(suffix, name.length - suffix.length) >= 0) return name;
      return name + suffix;
    },

    formatReligionName: function (religion) {
      var orig = religion.name || '';
      if (!orig) return orig;
      var type = religion.type || 'Organized';
      var core = orig;
      core = core.replace(/ism$/i, '');
      var faithMatch = core.match(/^(Faith|Way|Path|Word|Witnesses)\s+of\s+(.+)$/i);
      if (faithMatch) core = faithMatch[2];
      var ofTheMatch = core.match(/^(.+?)\s+of\s+the\s+.+$/i);
      if (ofTheMatch) core = ofTheMatch[1];
      core = core.replace(/\s+(Religious|Religion|Faith|Church|Creed|Gods|Pantheon|Philosophy|Doctrine|School|Way|Sect|Society|Brotherhood|Circle|Ethics|Precepts|Commandments)$/i, '');
      core = core.replace(/^the\s+/i, '');
      core = core.replace(/^(New|Old|Greater|Lesser|Eastern|Western|Northern|Southern)\s+/i, '');
      var templates = {'Folk':['{core}民俗','{core}传统'],'Organized':['{core}教','{core}会','{core}社'],'Cult':['{core}邪教','{core}异端'],'Heresy':['{core}异见','{core}旁支']};
      var pool = templates[type] || templates['Organized'];
      var tpl2 = pool[Math.floor(Math.random() * pool.length)];
      return tpl2.replace(/\{core\}/g, core);
    }
  };
})();

