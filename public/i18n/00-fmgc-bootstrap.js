
// ===== iframe/bootstrap.js =====
/**
 * FMGC Bootstrap - Unified Namespace & Performance Module
 *
 * Provides:
 * 1. window.FMGC - Unified global namespace
 * 2. MutationObserver throttling/batching for performance
 * 3. Global utility stubs
 *
 * Load order: Load FIRST, before all other modules
 */
(function () {
  'use strict';

  // ============================================================
  // fc_loader / fc_skip 模式早退 —— 分享预览 iframe 不需要 FMGC 补丁
  // 静态 <script> 标签照常渲染（保证补丁链时序正常），但 JS 不执行
  // ============================================================
  try {
    var __fmgc_url = new URL(location.href);
    if (__fmgc_url.searchParams.get("fc_skip") || __fmgc_url.searchParams.get("fc_loader")) {
      // 但要确保 08-geo-export 能拿到 origin guard
      var WHITELIST = null;
      function buildWhitelist() {
        if (WHITELIST) return WHITELIST;
        WHITELIST = new Set();
        try { WHITELIST.add(window.location.origin); } catch(e) {}
        try { if (window.top !== window.self) WHITELIST.add(window.top.location.origin); } catch(e) {}
        return WHITELIST;
      }
      window.__FMGC_IS_ALLOWED_ORIGIN__ = function(origin) {
        if (!origin) return false;
        return buildWhitelist().has(origin);
      };
      // cloud-save 等模块 postMessage 需要 targetOrigin helper
      window.__FMGC_GET_TARGET_ORIGIN__ = function(targetWin) {
        try {
          if (targetWin === window.parent || targetWin === window.top) {
            return window.top.location.origin;
          }
          if (targetWin === window.self || targetWin === window) {
            return window.location.origin;
          }
          try { return targetWin.location.origin; } catch(e) { return '*'; }
        } catch(e) { return '*'; }
      };
      // 确保 window.pack 不为 null（等 uploadMap 设置）、window.notes 为数组
      window.pack = window.pack || null;
      window.notes = Array.isArray(window.notes) ? window.notes : [];
      console.warn("[FC] fc_loader 模式：bootstrap 早退，仅保留 origin guard");
      return;
    }
  } catch(e) { /* 非 URL 场景忽略 */ }

  // ============================================================
  // 0.0 Origin Safety —— postMessage targetOrigin / listener 校验
  // 在任何 postMessage 调用和 message listener 安装之前定义
  // ============================================================
  (function setupOriginGuard() {
    var WHITELIST = null;

    function buildWhitelist() {
      if (WHITELIST) return WHITELIST;
      WHITELIST = new Set();
      try { WHITELIST.add(window.location.origin); } catch(e) {}
      try {
        if (window.top !== window.self) {
          WHITELIST.add(window.top.location.origin);
        }
      } catch(e) {}
      try {
        var injected = window.__FMGC_ORIGIN_WHITELIST__;
        if (Array.isArray(injected)) {
          injected.forEach(function(o) { WHITELIST.add(o); });
        }
      } catch(e) {}
      return WHITELIST;
    }

    window.__FMGC_IS_ALLOWED_ORIGIN__ = function(origin) {
      if (!origin) return false;
      return buildWhitelist().has(origin);
    };

    window.__FMGC_GET_TARGET_ORIGIN__ = function(targetWin) {
      try {
        if (targetWin === window.parent || targetWin === window.top) {
          return window.top.location.origin;  // 发 parent → 需要 parent 的 origin，不是 iframe 自身
        }
        if (targetWin === window.self || targetWin === window) {
          return window.location.origin;
        }
        try { return targetWin.location.origin; } catch(e) { return '*'; }
      } catch(e) { return '*'; }
    };
  })();

  // ============================================================
  // 0.1 NetGuard —— FMG iframe 内外部追踪/统计请求拦截
  // 在任何其他脚本之前安装，覆盖：
  //   - fetch() 请求（Promise 式，拦截 umami.stats 追踪）
  //   - XMLHttpRequest（回调式，同上）
  //   - HTMLImageElement.src（<img> 标签原生加载，防御性）
  //   - HTMLScriptElement.src（<script> 动态加载，拦截 GTAG 追踪脚本）
  //
  // 设计原则：
  //   - 黑名单域名 → 返回空 data URI / 空响应 / 阻止加载，不抛错不 hang
  //   - Service Worker 层也应拦截（更彻底），这里是运行时兜底
  // ============================================================
  (function installNetGuard() {
    var BLOCKED_HOSTS = [
      // —— FMG iframe 内自动追踪/统计请求（拦截以保护用户隐私）——
      '.herokuapp.com',           // FMG 自带 umami stats 追踪脚本 (fmg-stats.herokuapp.com)
      'cdn.openwidget.com',       // 第三方社交挂件 CDN（防御性拦截，FMG 已改为本地 import）
      'www.googletagmanager.com'  // FMG index.html 硬编码的 GTAG GA 追踪脚本
    ];

    function isBlocked(url) {
      if (!url || typeof url !== 'string') return false;
      // 只拦截 http/https 协议，忽略 data:/blob:/chrome-extension: 等
      if (!/^https?:\/\//.test(url)) return false;
      try {
        var host = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        for (var i = 0; i < BLOCKED_HOSTS.length; i++) {
          var h = BLOCKED_HOSTS[i];
          if (h.charAt(0) === '.') {
            // 子域名匹配（如 .herokuapp.com → foo.herokuapp.com）
            if (host === h.slice(1) || host.endsWith(h)) return true;
          } else {
            if (host === h) return true;
          }
        }
      } catch(e) { /* ignore */ }
      return false;
    }

    var EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    // --- fetch 拦截 ---
    if (typeof window.fetch === 'function') {
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (isBlocked(url)) {
          console.warn('[FMGC NetGuard] 🚫 fetch blocked:', url);
          return Promise.resolve(new Response('', { status: 204, statusText: 'FMGC blocked', headers: {} }));
        }
        return origFetch.apply(this, arguments);
      };
      try { window.fetch.prototype = origFetch.prototype; } catch(e) {}
    }

    // --- XMLHttpRequest 拦截 ---
    if (typeof window.XMLHttpRequest === 'function') {
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__fmgc_blocked = isBlocked(url);
        if (this.__fmgc_blocked) {
          console.warn('[FMGC NetGuard] 🚫 XHR blocked:', url);
        }
        return origOpen.apply(this, arguments);
      };

      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function() {
        if (this.__fmgc_blocked) {
          var self = this;
          setTimeout(function() {
            try {
              Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
              Object.defineProperty(self, 'status', { value: 204, configurable: true });
              Object.defineProperty(self, 'responseText', { value: '', configurable: true });
              Object.defineProperty(self, 'response', { value: '', configurable: true });
              Object.defineProperty(self, 'responseType', { value: '', configurable: true });
              Object.defineProperty(self, 'responseURL', { value: '', configurable: true });
              Object.defineProperty(self, 'statusText', { value: 'FMGC blocked', configurable: true });
              var fakeProgress = new Event('progress');
              fakeProgress.lengthComputable = false;
              self.dispatchEvent(fakeProgress);
              if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
              if (typeof self.onload === 'function') self.onload();
              if (typeof self.onloadend === 'function') self.onloadend();
            } catch(e) { /* ignore */ }
          }, 0);
          return;
        }
        return origSend.apply(this, arguments);
      };
    }

    // --- HTMLImageElement.src 拦截（<img> 原生加载）---
    // 这是 armoria.herokuapp.com/png/200/1 这类请求的最可能来源
    try {
      var imgProto = HTMLImageElement.prototype;
      var origImgSrcDesc = Object.getOwnPropertyDescriptor(imgProto, 'src');
      if (origImgSrcDesc && origImgSrcDesc.set) {
        Object.defineProperty(imgProto, 'src', {
          get: origImgSrcDesc.get,
          set: function(url) {
            if (url && isBlocked(String(url))) {
              console.warn('[FMGC NetGuard] 🚫 <img src> blocked:', url);
              return origImgSrcDesc.set.call(this, EMPTY_PNG);
            }
            return origImgSrcDesc.set.call(this, url);
          },
          configurable: true
        });
      }
    } catch(e) { /* 某些环境不允许劫持 */ }

    // --- HTMLScriptElement.src 拦截 ---
    try {
      var scriptProto = HTMLScriptElement.prototype;
      var origScriptSrcDesc = Object.getOwnPropertyDescriptor(scriptProto, 'src');
      if (origScriptSrcDesc && origScriptSrcDesc.set) {
        Object.defineProperty(scriptProto, 'src', {
          get: origScriptSrcDesc.get,
          set: function(url) {
            if (url && isBlocked(String(url))) {
              console.warn('[FMGC NetGuard] 🚫 <script src> blocked:', url);
              return;  // 不设置 src，阻止加载
            }
            return origScriptSrcDesc.set.call(this, url);
          },
          configurable: true
        });
      }
    } catch(e) { /* ignore */ }

  })();

  // ============================================================
  // 0. Sw-Cache Config —— post-build 从 fmgc/config/sw-cache.json 注入
  // ============================================================
  var CACHE_ENABLED = false;
  var CACHE_VERSION = "fmg-v4";

  // ============================================================
  // 0.5 Service Worker 强制清理 + 一次性强制 reload
  // 关键设计：
  //   - 在 bootstrap IIFE 最顶部**同步**检查 controller SW
  //   - 如果有 controller（旧 SW 还在拦截请求），立即 set session flag + reload
  //   - reload 发生在**任何其他脚本执行之前**，确保 06-names-patch.js 等不会被旧 SW 拦截
  //   - sessionStorage flag 防止无限 reload 循环
  //
  // 第二层保障（sw.js 自身）：当 CACHE_ENABLED=false 时，sw.js 在 activate 事件里
  //   self.registration.unregister() 自删自己。nginx 对 sw.js 已经是 no-cache。
  // ============================================================
  (function swForceCleanup() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    if (window.electron && window.electron.isElectron) return;

    function cleanupWorkerCaches(force) {
      try {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          return Promise.all(regs.map(function(r) {
            if (force || !CACHE_ENABLED) return r.unregister();
          }));
        }).catch(function(error) {
          console.warn('[FMGC] Service Worker 清理失败：', error);
        });
      } catch(error) {
        console.warn('[FMGC] Service Worker 清理失败：', error);
      }
      if (!('caches' in window)) return;
      try {
        caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(key) { return caches.delete(key); }));
        }).catch(function(error) {
          console.warn('[FMGC] 缓存清理失败：', error);
        });
      } catch(error) {
        console.warn('[FMGC] 缓存清理失败：', error);
      }
    }

    // sessionStorage flag：防止同一 tab 内无限 reload 循环
    var SESSION_FLAG_KEY = 'fmGC_sw_reloaded_' + CACHE_VERSION;

    // 同步检查：是否有 SW controller 正在拦截请求
    if (navigator.serviceWorker.controller && !sessionStorage.getItem(SESSION_FLAG_KEY)) {
      sessionStorage.setItem(SESSION_FLAG_KEY, '1');

      // 异步清理：注销所有 SW + 清空 CacheStorage（fire-and-forget）
      // 虽然不 await，但后续 reload 的页面也会再次执行这段逻辑
      cleanupWorkerCaches(true);

      // 立即 reload —— 必须在任何其他同步脚本执行前完成
      // 注意：FMG iframe 内的 location.href 就是 iframe 自身 URL
      var reloadUrl = window.location.href.split('#')[0].split('?')[0] + '?fmgsvcreload=' + Date.now();
      window.location.replace(reloadUrl);

      // stop() 终止当前页面所有进一步的脚本执行
      try { window.stop(); } catch(e) {}
      return;
    }

    // reload 之后（或首次访问无 SW），异步执行清理（幂等，不会有副作用）

    cleanupWorkerCaches(false);
  })();

  // ============================================================
  // 1. Unified FMGC Namespace
  // ============================================================

  var FMGC = window.FMGC || {};

  FMGC.version = '2.0.0';
  FMGC.buildTime = new Date().toISOString();

  // Backward-compatible alias map
  var aliasMap = {
    FMG_CN_LOGGER: 'logger',
    FMG_CN_UTILS: 'utils',
    FMG_CN_CONFIG: 'config'
  };

  FMGC.register = function (globalName, module) {
    FMGC[globalName] = module;
    var alias = aliasMap[globalName];
    if (alias) {
      FMGC[alias] = module;
    }
    if (window[globalName] === undefined) {
      window[globalName] = module;
    }
    return module;
  };

  FMGC.get = function (globalName) {
    if (FMGC[globalName]) return FMGC[globalName];
    if (FMGC[aliasMap[globalName]]) return FMGC[aliasMap[globalName]];
    return window[globalName] || null;
  };

  FMGC.NAMESPACE = {
    get logger() { return FMGC.logger || window.FMG_CN_LOGGER; },
    get utils() { return FMGC.utils || window.FMG_CN_UTILS; },
    get config() { return FMGC.config || window.FMG_CN_CONFIG; }
  };

  // ============================================================
  // 2. Utility Helpers
  // ============================================================

  FMGC.debounce = function (fn, wait) {
    var timer = null;
    function debounced() {
      var context = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); timer = null; }, wait);
    }
    debounced.cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    return debounced;
  };

  FMGC.throttle = function (fn, limit) {
    var lastFn = null, lastTime = 0, inThrottle = false;
    return function () {
      var context = this, args = arguments;
      var now = Date.now();
      if (now - lastTime >= limit) {
        if (lastFn) { clearTimeout(lastFn); lastFn = null; }
        lastTime = now;
        inThrottle = false;
        fn.apply(context, args);
      } else if (!lastFn) {
        lastFn = setTimeout(function () { lastTime = Date.now(); lastFn = null; inThrottle = false; fn.apply(context, args); }, limit - (now - lastTime));
      }
      inThrottle = true;
    };
  };

  // ============================================================
  // 4. Window Stubs
  // ============================================================

  FMGC.ensureWindowStubs = function () {
    window.modules = window.modules || {};
    window.pack = window.pack || { states: [], provinces: [], burgs: [], cultures: [], religions: [], rivers: [] };
    window.options = window.options || {};
    window.config = window.config || {};
    window.grid = window.grid || null;
    window.notes = window.notes || null;
    window.defs = window.defs || null;
    window.scaleBar = window.scaleBar || null;
    window.distanceScale = window.distanceScale || 1;
    window.graphWidth = window.graphWidth || 1000;
    window.graphHeight = window.graphHeight || 1000;
    window.svgWidth = window.svgWidth || 1000;
    window.svgHeight = window.svgHeight || 1000;
    window.customization = window.customization || 0;

    if (!JSON.safeParse) {
      JSON.safeParse = function (str, defaultValue) {
        try { return JSON.parse(str); } catch (e) { return defaultValue !== undefined ? defaultValue : null; }
      };
    }

    // Utility functions
    if (!window.debounce) window.debounce = FMGC.debounce;
    if (!window.throttle) window.throttle = FMGC.throttle;
    if (!window.ra) window.ra = function(arr) { if (!arr || !arr.length) return undefined; return arr[Math.floor(Math.random() * arr.length)]; };
    if (!window.randArray) window.randArray = window.ra;
    if (!window.ensureEl) window.ensureEl = function(selector, callback) { var el = document.querySelector(selector); if (el) { if (callback) callback(el); return el; } return null; };

  };

  // ============================================================
  // 5. Boot
  // ============================================================

  window.FMGC = FMGC;

  function boot() {
    FMGC.ensureWindowStubs();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();

