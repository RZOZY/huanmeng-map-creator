// FMGC Shared — 所有 profile 共用

// --- config.js ---
/**
 * shared/config.js — FMGC 名称库唯一配置点
 *
 * 本文件最先加载（文件名 config.js 排序在 extract-roots.js 前）
 * 所有后续文件从这里读配置常量和工具函数
 *
 * 修改白名单 → 只改 LEGIT_DUP 数组
 * 修改重试次数 → 改 MAX_INTERNAL_RETRY / MAX_EXTERNAL_RETRY
 * 修改 procedural 增强参数 → 改 PROCEDURAL 对象
 * 修改长度边界 → 改 TYPE_BOUNDS 对象
 */
(function () {
  'use strict';

  var CONFIG = {

    // ── LEGIT_DUP（getter/setter，允许 profile 通过 forbidden.json 覆盖）──
    _LEGIT_DUP: [
      "塔塔", "密密", "西西", "比比", "的的", "喀喀",
      "波波", "利利", "科科", "可可", "莉莉"
    ],
    get LEGIT_DUP()  { return CONFIG._LEGIT_DUP; },
    set LEGIT_DUP(v) { CONFIG._LEGIT_DUP = v; },

    // ── 重试常量 ──
    MAX_INTERNAL_RETRY: 10,    // 引擎内部找 r1≠r2 的重试
    MAX_EXTERNAL_RETRY: 10,    // profile index.js 外层重试

    // ── procedural 增强参数（Tier 2 动态长度放宽）──
    PROCEDURAL: {
      MAX_ATTEMPTS: 300,              // Tier 2 最多重试 300 次
      RELAX_THRESHOLD: 50,            // 连续撞名 50 次后开始放宽长度
      LENGTH_RELAX_STEP: 2,           // 每次 lengthMax + 2
      MAX_LENGTH_RELAX: 3,            // 最多放宽 3 次（+2, +4, +6）
      MIN_LENGTH_RELAX_AFTER: 2       // lengthMax 放宽 2 次后，lengthMin - 1
    },

    // ── 按 type 全局长度绝对边界（运行时 clamp）──
    TYPE_BOUNDS: {
      "state":    { min: 2, max: 8 },
      "province": { min: 2, max: 8 },
      "burg":     { min: 2, max: 6 },
      "zone":     { min: 2, max: 6 },
      "culture":  { min: 2, max: 6 },
      "religion": { min: 2, max: 6 },
      "river":    { min: 2, max: 6 },
      "lake":     { min: 2, max: 6 },
      "marker":   { min: 2, max: 6 },
      "mapName":  { min: 2, max: 8 }
    },

    // ── 工具函数 ──

    /**
     * 无状态纯函数：字符串内部是否有不合法的连续重复字
     * - 两字连续：黑黑龙 → 拦截
     * - 三字连续：大大大 → 拦截
     * - 白名单中的合法叠字（如 "塔塔塔尔" 里的 "塔塔"）会被跳过
     */
    hasIllegalDup: function (s) {
      var legit = CONFIG._LEGIT_DUP;
      // 两字连续 — 精确匹配：这个具体的叠字是否在白名单
      for (var i = 0; i < s.length - 1; i++) {
        if (s[i] === s[i + 1]) {
          var dup2 = s.substring(i, i + 2);
          if (legit.indexOf(dup2) !== -1) continue;
          return true;
        }
      }
      // 三字连续 — 如果起始二字在白名单（如"莉莉莉莉"的i=0处，"莉莉"合法），跳过整个三字检测
      for (var i = 0; i < s.length - 2; i++) {
        if (s[i] === s[i + 1] && s[i + 1] === s[i + 2]) {
          var dup2atI = s.substring(i, i + 2);
          if (legit.indexOf(dup2atI) !== -1) continue;
          return true;
        }
      }
      return false;
    },

    /**
     * 从 b 数组自动生成 stripSuffixes（全面剥离词汇表）
     *
     * 规则（Python mock 验证过）：
     *   - 只提取 1 字尾部：在 b 数组里出现 ≥ 2 次
     *   - 2 字后缀只从白名单里选（避免 "魔关"、"海坊" 这类伪后缀）
     *   - 合并手工 extractSuffixes（它是 stripSuffixes 的子集）
     *   - 排除常见虚词（之乎者也）
     *
     * @param {string[]} bankNames  b 数组拆分后的词条列表
     * @param {string[]} extractSuffixes  手工配置的精简生成后缀池
     * @returns {string[]}  全面剥离词汇表
     */
    autoGenerateStripSuffixes: function (bankNames, extractSuffixes) {
      var TWO_CHAR_WHITELIST = [
        "中心", "要塞", "枢纽", "首府", "门户", "关口",
        "大道", "广场", "街区", "庄园", "别院",
        "大学", "教堂", "灯塔", "驿站"
      ];
      var BLACKLIST = {
        "之": 1, "乎": 1, "者": 1, "也": 1, "而": 1,
        "其": 1, "此": 1, "彼": 1, "的": 1, "了": 1,
        "吗": 1, "啦": 1, "啊": 1, "地": 1
      };
      var counts = {};
      for (var i = 0; i < bankNames.length; i++) {
        var item = bankNames[i];
        if (item.length >= 2) {
          var t = item.slice(-1);
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      var strip = [];
      for (var tail in counts) {
        if (counts[tail] >= 2 && !BLACKLIST[tail]) {
          strip.push(tail);
        }
      }
      // 2 字白名单（只取确实在数组里出现过的）
      for (var w = 0; w < TWO_CHAR_WHITELIST.length; w++) {
        var word = TWO_CHAR_WHITELIST[w];
        for (var i = 0; i < bankNames.length; i++) {
          if (bankNames[i].length >= word.length && bankNames[i].slice(-word.length) === word) {
            strip.push(word);
            break;
          }
        }
      }
      // 合并 extractSuffixes（保证手工词全在）
      if (extractSuffixes && extractSuffixes.length > 0) {
        for (var k = 0; k < extractSuffixes.length; k++) {
          if (strip.indexOf(extractSuffixes[k]) < 0) strip.push(extractSuffixes[k]);
        }
      }
      return strip;
    },

    /**
     * 检测拼接结果是否有双重后缀
     *
     * strict=true（默认，用于 burg/river/lake）：
     *   迭代剥离检测：剥掉末尾 suffix → 检查 remaining 尾部是否在 stripSuffixes
     *   拦截所有形式的双重后缀（包括 root 尾部的地理词）
     *
     * strict=false（用于 province）：
     *   剥掉末尾 suffix → 检查 remaining 尾部是否在 extractSuffixes（精简行政区后缀池）
     *   拦截真正的双重行政区后缀（"黛郡藩属"、"南郡州"）
     *   不拦截 root 自带的地理词（"寒泉"的"泉"不在 extractSuffixes 里）
     *   不拦截 root 自带的完整地名后缀（"灭省特别行政区" 中 "省" 在 extractSuffixes → 拦截！）
     *
     * @param {string} result  引擎拼接后的结果
     * @param {string[]} stripSuffixes  全面剥离词汇表（用来找 result 末尾的 suffix）
     * @param {boolean} strict  true=严格检查（用 stripSuffixes 检查 remaining），false=中等检查（用 extractSuffixes 检查 remaining）
     * @param {string[]} extractSuffixes  精简生成后缀池（strict=false 时用来检查 remaining 尾部）
     * @returns {boolean}  true = 有双重后缀，应拦截
     */
    isDoubleSuffix: function (result, stripSuffixes, strict, extractSuffixes) {
      strict = strict !== false;  // 默认 true
      if (!result || result.length < 3 || !stripSuffixes || stripSuffixes.length === 0) return false;

      // 剥离 result 末尾的 suffix（选最长的匹配，从 stripSuffixes）
      var sorted = stripSuffixes.slice().sort(function (a, b) { return b.length - a.length; });
      var remaining = result;
      var foundSuffix = null;
      for (var i = 0; i < sorted.length; i++) {
        var suf = sorted[i];
        if (suf && result.length > suf.length && result.slice(-suf.length) === suf) {
          remaining = result.slice(0, -suf.length);
          foundSuffix = suf;
          break;
        }
      }
      if (!foundSuffix || remaining.length < 2) return false;

      // 选择用来检查 remaining 尾部的列表
      var tailCheckList = strict ? stripSuffixes : (extractSuffixes || stripSuffixes);
      if (!tailCheckList || tailCheckList.length === 0) tailCheckList = stripSuffixes;
      var sortedTail = tailCheckList.slice().sort(function (a, b) { return b.length - a.length; });

      // 检查 remaining 的尾部是否在 tailCheckList 里
      for (var j = 0; j < sortedTail.length; j++) {
        var tail = sortedTail[j];
        if (tail && remaining.length > tail.length && remaining.slice(-tail.length) === tail) {
          return true;  // 双重后缀！
        }
      }
      return false;
    }
  };

  window.__FMGC_CONFIG__ = CONFIG;

})();

// --- extract-roots.js ---
/**
 * default profile — extractRoots（迭代剥离版）
 * 从词库数组里去掉每个名称的已知后缀，提取"字根"。
 *
 * v2 核心改动（修复双重后缀根因）：
 *   - 迭代剥离：剥离一次后继续检查新 root 的尾部是否还有 suffix，直到无法再剥离
 *   - candidate 太短时 continue（不是 break），继续尝试更短的 suffix
 *     e.g. "万道场" → 先尝试 "道场"(2字) → candidate="万" 太短 → continue
 *          → 尝试 "场"(1字) → candidate="万达" 有效 → root="万达"
 *
 * 规则：
 *   - 后缀按长度降序，每次迭代选最长的能产生有效 candidate 的 suffix
 *   - 内层循环 candidate 太短时 continue 尝试更短的 suffix
 *   - 外层 while 循环控制迭代，每次成功剥离后重新开始一轮
 *   - 带 cache 避免重复计算（cacheKey 含 minRootLen）
 */
(function () {
  'use strict';
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  function extractRoots(names, suffixes, cache, minRootLen) {
    cache = cache || {};
    minRootLen = minRootLen || 2;
    var cacheKey = suffixes.join('|') + '::' + minRootLen;
    if (cache[cacheKey]) return cache[cacheKey];

    // 后缀按长度降序排列（最长优先匹配）
    var sorted = suffixes.slice().sort(function (a, b) { return b.length - a.length; });

    var roots = {};
    for (var i = 0; i < names.length; i++) {
      var root = names[i];
      var changed = true;
      var safety = 0;

      // 迭代剥离：反复检查 root 尾部是否有 suffix
      while (changed && safety < 15) {
        changed = false;
        safety++;

        // 找最长的能产生有效 candidate 的 suffix
        for (var j = 0; j < sorted.length; j++) {
          var suf = sorted[j];
          if (suf && root.length > suf.length && root.slice(-suf.length) === suf) {
            var candidate = root.slice(0, -suf.length);
            if (candidate.length >= minRootLen) {
              // 有效 candidate → 更新 root，外层 while 继续迭代
              root = candidate;
              changed = true;
              break;
            }
            // candidate 太短 → continue（不是 break），尝试更短的 suffix
          }
        }
      }

      roots[root] = 1;
    }

    var result = [];
    for (var k in roots) result.push(k);
    cache[cacheKey] = result;
    return result;
  }

  registry.__shared_extractRoots = extractRoots;
})();

// --- engine/default.js ---
/**
 * default engine — default: single root + suffix
 * 规则：root 来自 extractRoots（已剥离后缀且 minRootLen≥2），suffix 来自 cfg.extractSuffixes
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['default'] = function (roots, cfg, type) {
    var suffixes = cfg.extractSuffixes || [];
    var stripSuffixes = cfg.stripSuffixes || suffixes;
    if (roots.length === 0 || suffixes.length === 0) return null;

    // MAX_INTERNAL_RETRY 循环（换一批随机 root + suffix）
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var root = roots[Math.floor(Math.random() * roots.length)];

      // hasIllegalDup（用 CFG 工具函数，自动走 LEGIT_DUP 白名单）
      if (CFG.hasIllegalDup(root)) continue;

      // 先过滤冲突的 suffix（避免 root 尾字 === suffix 首字 或 root.endsWith(suffix)），再从剩余里选
      var validSufs = [];
      for (var i = 0; i < suffixes.length; i++) {
        var s = suffixes[i];
        if (s.length >= 1 && root.length > 0 && (root[root.length - 1] === s[0] || root.endsWith(s))) continue;
        validSufs.push(s);
      }
      if (validSufs.length === 0) continue;
      var suffix = validSufs[Math.floor(Math.random() * validSufs.length)];

      var result = root + suffix;

      // TYPE_BOUNDS clamp（全局绝对边界 + profile 覆盖）
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      // 双重后缀检测（修正版）
      if (CFG.isDoubleSuffix(result, stripSuffixes)) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/directional.js ---
/**
 * directional engine — prefix + root + suffix（如 "河西" + "陇" + "州" → "河西陇州"）
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['directional'] = function (roots, cfg, type) {
    var pool = cfg.prefixPool || cfg.directionalPool;
    var suffixes = cfg.extractSuffixes || [];
    if (!pool || pool.length === 0 || roots.length === 0) return null;

    // MAX_INTERNAL_RETRY 循环（换一批随机 prefix + root + suffix）
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var root = roots[Math.floor(Math.random() * roots.length)];
      var prefix = pool[Math.floor(Math.random() * pool.length)];
      var suffix = suffixes.length > 0 ? suffixes[Math.floor(Math.random() * suffixes.length)] : '';

      // hasIllegalDup（root 和 prefix 内部都不能有非法连续重复字）
      if (CFG.hasIllegalDup(root) || CFG.hasIllegalDup(prefix)) continue;

      // 避免 root 尾字和 suffix 首字重复 / root 以 suffix 结尾
      if ((suffix.length >= 1 && root.length > 0 && root[root.length - 1] === suffix[0]) || root.endsWith(suffix)) continue;
      // 避免 prefix 尾字和 root 首字重复
      if (prefix.length >= 1 && root.length > 0 && prefix[prefix.length - 1] === root[0]) continue;
      // 避免 prefix 尾字跳过 root 直接和 suffix 首字重复（prefix[last] === suffix[0] 且 root 短）
      if (suffix.length >= 1 && prefix.length >= 1 && prefix[prefix.length - 1] === suffix[0]) continue;

      var result = prefix + root + suffix;

      // TYPE_BOUNDS clamp
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/doubled-root.js ---
/**
 * doubled-root engine — adaptive multi-formula generator
 *
 * 根据 cfg.lengthMax 自适应选择拼接公式：
 *   lengthMax ≤ 4  → 古风/奇幻风格，2段或3段拼接（绝不产生5+字）
 *   lengthMax ≤ 5  → 西幻/民国风格，混合2/3/4段
 *   lengthMax ≥ 6  → 现代都市风格，4段原公式
 *
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});

  (registry.__shared_engines || (registry.__shared_engines = {}))['doubled-root'] = function (roots, cfg, type) {
    if (roots.length < 1) return null;
    var pool = cfg.prefixPool;
    var suffixes = cfg.extractSuffixes || [];
    var stripSuffixes = cfg.stripSuffixes || suffixes;

    // Resolve effective length bounds
    var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
    var effMax = Math.min(cfg.lengthMax || bounds.max, bounds.max);

    // ─── FORMULA SELECTION (based on effMax) ───────────────────────────
    // 0 = root + suffix (2-segment, shortest)
    // 1 = prefix + root + suffix (3-segment, medium)
    // 2 = prefix + r1 + r2 + suffix (4-segment — 仅 modern-urban 用)
    var formulaWeights;
    if (effMax <= 4) {
      // 古风/奇幻风格：4段拼接必然超4字，直接排除
      formulaWeights = [0.70, 0.30, 0.00];  // [root+suf, prefix+root+suf, 4-seg]
    } else if (effMax <= 5) {
      // 西幻/民国风格：禁用4段拼接（产生"海考山观音城"这类语义垃圾）
      formulaWeights = [0.50, 0.50, 0.00];
    } else if (effMax <= 7) {
      // province 类型（lengthMax=7）：4段拼接在古风 province 里还是太乱，禁用
      formulaWeights = [0.45, 0.55, 0.00];
    } else {
      // 现代都市风格（lengthMax≥8）：自然出长名，4段为主
      formulaWeights = [0.20, 0.30, 0.50];
    }

    // ─── WEIGHTED RANDOM FORMULA PICK ──────────────────────────────────
    function pickFormula() {
      var r = Math.random();
      var cumulative = 0;
      for (var i = 0; i < formulaWeights.length; i++) {
        cumulative += formulaWeights[i];
        if (r < cumulative) return i;
      }
      return formulaWeights.length - 1;
    }

    // ─── MAX_INTERNAL_RETRY LOOP ───────────────────────────────────────
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var formula = pickFormula();
      var result;

      if (formula === 0) {
        // FORMULA A: root + suffix (2-segment)
        var root = roots[Math.floor(Math.random() * roots.length)];
        if (CFG.hasIllegalDup(root)) continue;
        // 先过滤冲突的 suffix（避免 root.endsWith(suf) 或 root[-1]===suf[0]），再从剩余里选
        var validSufsA = [];
        for (var vi = 0; vi < suffixes.length; vi++) {
          var s = suffixes[vi];
          if (s.length >= 1 && root.length > 0 && (root[root.length - 1] === s[0] || root.endsWith(s))) continue;
          validSufsA.push(s);
        }
        if (validSufsA.length === 0) continue;
        var suf = validSufsA[Math.floor(Math.random() * validSufsA.length)];
        result = root + suf;

      } else if (formula === 1) {
        // FORMULA B: prefix + root + suffix (3-segment)
        if (!pool || pool.length === 0) continue;
        var p = pool[Math.floor(Math.random() * pool.length)];
        var rt = roots[Math.floor(Math.random() * roots.length)];
        if (CFG.hasIllegalDup(p) || CFG.hasIllegalDup(rt)) continue;
        // Avoid double character at junctions (prefix-root)
        if (p.length > 0 && rt.length > 0 && p[p.length - 1] === rt[0]) continue;
        // 先过滤冲突的 suffix（避免 rt.endsWith(sf) 或 rt[-1]===sf[0]），再从剩余里选
        var validSufsB = [];
        for (var vi2 = 0; vi2 < suffixes.length; vi2++) {
          var sf2 = suffixes[vi2];
          if (sf2.length >= 1 && rt.length > 0 && (rt[rt.length - 1] === sf2[0] || rt.endsWith(sf2))) continue;
          validSufsB.push(sf2);
        }
        if (validSufsB.length === 0) continue;
        var sf = validSufsB[Math.floor(Math.random() * validSufsB.length)];
        result = p + rt + sf;

      } else {
        // FORMULA C: prefix + r1 + r2 + suffix (4-segment — original behavior)
        if (roots.length < 2) continue;
        if (!pool || pool.length === 0) continue;
        var r1 = roots[Math.floor(Math.random() * roots.length)];
        var r2 = roots[Math.floor(Math.random() * roots.length)];
        if (r1 === r2) continue;
        if (r1.length > 0 && r2.length > 0 && r1[r1.length - 1] === r2[0]) continue;
        if (CFG.hasIllegalDup(r1) || CFG.hasIllegalDup(r2)) continue;
        var prfx = pool[Math.floor(Math.random() * pool.length)];
        var sffx = suffixes.length > 0 ? suffixes[Math.floor(Math.random() * suffixes.length)] : '';
        if ((sffx.length >= 1 && r2.length > 0 && (r2[r2.length - 1] === sffx[0] || r2.endsWith(sffx)))) continue;
        if (prfx.length > 0 && r1.length > 0 && prfx[prfx.length - 1] === r1[0]) continue;
        result = prfx + r1 + r2 + sffx;
      }

      // TYPE_BOUNDS clamp (shared across all formulas)
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      // 双重后缀检测（province 用 strict=false，因为 b 数组词条本身就是完整地名）
      var isProvince = type === 'province';
      if (CFG.isDoubleSuffix(result, stripSuffixes, !isProvince, suffixes)) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/dual-pool.js ---
/**
 * dual-pool engine — r1首字 + r2末字 + suffix（如: "玄天" + "太虚" → "天虚" + suffix）
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['dual-pool'] = function (roots, cfg, type) {
    if (roots.length < 2) return null;
    var suffixes = cfg.extractSuffixes || [];
    var stripSuffixes = cfg.stripSuffixes || suffixes;

    // MAX_INTERNAL_RETRY 循环（换一批随机 r1 + r2）
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var r1 = roots[Math.floor(Math.random() * roots.length)];
      var r2 = roots[Math.floor(Math.random() * roots.length)];

      // hasIllegalDup
      if (CFG.hasIllegalDup(r1) || CFG.hasIllegalDup(r2)) continue;

      var middle = r1[0] + r2[r2.length - 1];
      // 避免 middle 两个字符相同（如 r1="玄天" r2="太玄" → middle="玄玄"）
      if (middle.length >= 2 && middle[0] === middle[1]) continue;
      if (middle.length < 2) continue;

      var suffix = suffixes.length > 0 ? suffixes[Math.floor(Math.random() * suffixes.length)] : '';
      // 避免 middle 尾字和 suffix 首字重复 / middle 以 suffix 结尾
      if ((suffix.length >= 1 && middle.length >= 1 && middle[middle.length - 1] === suffix[0]) || middle.endsWith(suffix)) continue;

      var result = middle + suffix;

      // TYPE_BOUNDS clamp
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      // 双重后缀检测（修正版）
      if (CFG.isDoubleSuffix(result, stripSuffixes)) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/genus-species.js ---
/**
 * genus-species engine — 种族前缀 + 后缀（如「精灵·银溪」「矮人·铁砧」）
 * 中土奇幻风格：种族词 + 地理/特性词，模拟 Tolkien 式命名
 * 使用"·" 分隔符增加异域感，40% 概率不用分隔符直接拼接
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['genus-species'] = function (roots, cfg, type) {
    if (roots.length < 2) return null;
    var suffixes = cfg.extractSuffixes || [];
    var pool = cfg.prefixPool || [];

    // MAX_INTERNAL_RETRY 循环
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var r1 = roots[Math.floor(Math.random() * roots.length)];
      var r2 = roots[Math.floor(Math.random() * roots.length)];

      // 如果有 prefixPool（含种族词如"精灵""矮人"），50% 概率用它作为第一个词
      var first;
      if (pool.length > 0 && Math.random() < 0.5) {
        first = pool[Math.floor(Math.random() * pool.length)];
      } else {
        first = r1;
      }
      var second = (first === r1) ? r2 : r1;

      // hasIllegalDup
      if (CFG.hasIllegalDup(first) || CFG.hasIllegalDup(second)) continue;

      // first 与 second 的双重重复字防护
      if (first.length > 0 && second.length > 0 && first[first.length - 1] === second[0]) continue;

      var useSeparator = Math.random() < 0.6;
      var sep = useSeparator ? '·' : '';
      var suffix = suffixes.length > 0 && Math.random() < 0.5 ? suffixes[Math.floor(Math.random() * suffixes.length)] : '';

      // second 与 suffix 的双重重复字防护
      if (suffix.length >= 1 && second.length > 0 && (second[second.length - 1] === suffix[0] || second.endsWith(suffix))) continue;

      var result = first + sep + second + suffix;

      // TYPE_BOUNDS clamp
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/prefix-suffix.js ---
/**
 * prefix-suffix engine — prefixPool + suffixes（不用 roots）
 * 用于 culture 类型（如 high-fantasy 精灵/矮人种族名）
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['prefix-suffix'] = function (roots, cfg, type) {
    var pool = cfg.prefixPool;
    var suffixes = cfg.extractSuffixes || [];
    var stripSuffixes = cfg.stripSuffixes || suffixes;
    if (!pool || pool.length === 0 || suffixes.length === 0) return null;

    // MAX_INTERNAL_RETRY 循环
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var prefix = pool[Math.floor(Math.random() * pool.length)];
      var suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

      // hasIllegalDup（prefix 内部不能有非法连续重复字）
      if (CFG.hasIllegalDup(prefix)) continue;

      // 避免 prefix 尾字和 suffix 首字重复 / prefix 以 suffix 结尾
      if (prefix.length >= 1 && suffix.length >= 1 && (prefix[prefix.length - 1] === suffix[0] || prefix.endsWith(suffix))) continue;

      var result = prefix + suffix;

      // TYPE_BOUNDS clamp
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      // 双重后缀检测（修正版）
      if (CFG.isDoubleSuffix(result, stripSuffixes)) continue;

      return result;
    }
    return null;
  };
})();

// --- engine/zhizhi.js ---
/**
 * zhizhi engine — "X之Y" 黑暗风格（如「深渊之主」「死灵之王」「黑暗之神」）
 * dark-fantasy 独有的生成器，融合中文黑暗奇幻的经典构词模式
 * CFG 集成：TYPE_BOUNDS 长度 clamp，MAX_INTERNAL_RETRY，hasIllegalDup
 */
(function () {
  'use strict';
  var CFG = window.__FMGC_CONFIG__;
  var registry = window.__FMGC_ENGINE_REGISTRY__ || (window.__FMGC_ENGINE_REGISTRY__ = {});
  (registry.__shared_engines || (registry.__shared_engines = {}))['zhizhi'] = function (roots, cfg, type) {
    if (roots.length < 2) return null;

    // MAX_INTERNAL_RETRY 循环
    for (var retry = 0; retry < CFG.MAX_INTERNAL_RETRY; retry++) {
      var r1 = roots[Math.floor(Math.random() * roots.length)];
      var r2 = roots[Math.floor(Math.random() * roots.length)];

      // hasIllegalDup
      if (CFG.hasIllegalDup(r1) || CFG.hasIllegalDup(r2)) continue;

      var prefixWord = r1;
      var suffixWord = r2;

      // 避免前后相同（重新选一个不同的 root）
      if (prefixWord === suffixWord && roots.length >= 2) {
        for (var i = 0; i < roots.length; i++) {
          if (roots[i] !== prefixWord) { suffixWord = roots[i]; break; }
        }
      }

      var result = prefixWord + '之' + suffixWord;

      // 各种防重复检查
      if (result.indexOf('之之') >= 0) continue;
      if (prefixWord.length > 0 && prefixWord[prefixWord.length - 1] === '之') continue;
      if (suffixWord.length > 0 && suffixWord[0] === '之') continue;
      // 避免前后词尾首字重复（如 "深渊" + "之" + "渊主" → "深渊之渊主"）
      if (prefixWord.length > 0 && suffixWord.length > 0 && prefixWord[prefixWord.length - 1] === suffixWord[0]) continue;

      // TYPE_BOUNDS clamp
      var bounds = CFG.TYPE_BOUNDS[type] || { min: 2, max: 8 };
      var min = Math.max(cfg.lengthMin || bounds.min, bounds.min);
      var max = Math.min(cfg.lengthMax || bounds.max, bounds.max);
      if (result.length < min || result.length > max) continue;

      return result;
    }
    return null;
  };
})();
