
// ===== iframe/fc-loader-shim.js =====
/**
 * FC Loader Shim
 *
 * FantCraft 分享预览 fc_loader=1 / fc_skip=1 模式下的运行时补丁。
 * 注入时机：所有 FMG deferred scripts 之后（tail target + defer），
 * 此时 FMG 所有函数都已挂载到 window。
 *
 * 做的事（全部确定生效）：
 *   1. window.notes = [] — FMGC geo-export markers 用它
 *      （main.js 的 notes 是 let，不自动挂 window；bootstrap early return 只设了 null stub）
 *   2. wrap showUploadMessage — fc_loader 模式下跳过 invalid/ancient/newer 的 alert UI，
 *      直接调 parseLoadedData。跨脚本调用（main.js → load.js）能拦截到。
 *   3. wrap uploadMap — 完成后立即隐藏 FMG SVG 容器，防 drawLayers 把 DOM 画出来
 *   4. wrap 自动生成函数 — 防任何后续触发生成（当前 checkLoadParameters 已跑完）
 *
 * 注：FMGC bootstrap.js 在 HEAD 里已经 early return，只保留 origin guard，
 *     所以 names/wordbank/engine 等 FMGC 脚本虽然会被加载但 FMGC namespace 不存在，
 *     它们会 graceful 地 no-op 或报错（对 fc_loader 无影响）。
 */
(function () {
  'use strict';

  var url = new URL(location.href);
  var isLoader = url.searchParams.get("fc_loader") || url.searchParams.get("fc_skip");
  if (!isLoader) return;

  console.warn("[FC Loader] fc_loader 模式：安装运行时 shim");

  // ============================================================
  // 1. window.notes — geo-export markers 依赖
  // ============================================================
  if (!Array.isArray(window.notes)) {
    window.notes = [];
  }

  // ============================================================
  // 2. wrap auto-gen functions — 防二次触发
  // ============================================================
  ;['generateMapOnLoad', 'regenerateMap', 'generateMap', 'checkLoadParameters'].forEach(function(name) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig.__fcWrapped) {
      var noop = function fc_noop() { console.warn("[FC Loader] 跳过:", name); return Promise.resolve(); };
      noop.__fcWrapped = true;
      window[name] = noop;
    }
  });

  // ============================================================
  // 3. wrap showUploadMessage — 拦截 uploadMap → parseLoadedData
  //    这是跨脚本调用（main.js postMessage handler → load.js showUploadMessage），
  //    所以 wrap window.showUploadMessage 能生效。
  //    fc_loader 模式只处理 "updated"/"outdated"，跳过 alert UI。
  // ============================================================
  var origSUM = window.showUploadMessage;
  if (typeof origSUM === 'function' && !origSUM.__fcWrapped) {
    var wrappedSUM = function(type, mapData, mapVersion) {
      if (!isLoader) return origSUM.apply(this, arguments);
      if (type === 'updated' || type === 'outdated') {
        if (typeof window.parseLoadedData === 'function') {
          window.parseLoadedData(mapData, mapVersion);
        }
      } else if (type === 'invalid' || type === 'ancient' || type === 'newer') {
        // 🆕 修复：不再静默跳过 —— 发错误回复让 parent 快速失败
        // cloud-save.js 的 trySendLoadedReplyOrError 在 150ms 后检测 #alert dialog，
        // 但 fc_loader 模式下 shim 不会弹 dialog，所以我们主动发 error，
        // 让 MapPreview 的 postMessageToIframe 立即 reject，不等 30s 超时。
        try {
          var parentWin = window.parent;
          if (parentWin && parentWin !== window) {
            var origin = window.location.origin;
            // 协议：发 type=FC_MAP_LOADED + error 字段（和 cloud-save.js 的 sendMapLoadError 一致）
            // MapPreview postMessageToIframe handler: expectType=FC_MAP_LOADED, error 字段触发 reject
            // FMGFrame handler: type=FC_MAP_LOADED 但带 error 字段 → 也走错误分支
            parentWin.postMessage({
              type: 'FC_MAP_LOADED',
              error: '地图' + (type === 'invalid' ? '文件无效' :
                              type === 'ancient' ? '版本过旧无法加载' :
                              '版本过新请用对应版本加载')
              // 注意：shim 拿不到 cloud-save.js 发 FC_LOAD_MAP 时的 requestId，
              // 所以不发 requestId —— MapPreview handler 用 `ev.data.requestId &&` 放宽匹配，
              // 没 requestId 的消息也能匹配（因为它直接检查 error 字段）
            }, origin);
          }
        } catch (e) { /* postMessage fail 忽略 */ }
      }
      // 其他分支（valid 正常流程）—— fc_loader 模式不应该走到这里
    };
    wrappedSUM.__fcWrapped = true;
    window.showUploadMessage = wrappedSUM;
  }

  // ============================================================
  // 4. wrap uploadMap — 完成后立即隐藏 FMG DOM
  //    uploadMap 完成 parseLoadedData 后，drawLayers()/FMG UI 会画 SVG，
  //    我们不需要这些，立即 display:none 隐藏。
  //    同样是跨脚本调用（main.js → uploadMap），wrap 能生效。
  // ============================================================
  var origUploadMap = window.uploadMap;
  if (typeof origUploadMap === 'function' && !origUploadMap.__fcWrapped) {
    var wrappedUploadMap = function(blob) {
      var p = origUploadMap.apply(this, arguments);
      var hide = function() {
        try {
          var mapEl = document.getElementById('map');
          if (mapEl) mapEl.style.display = 'none';
          var optsEl = document.getElementById('optionsContainer');
          if (optsEl) optsEl.style.display = 'none';
        } catch(e) {}
      };
      if (p && typeof p.then === 'function') {
        p.then(hide).catch(hide);
      } else {
        hide();
      }
      return p;
    };
    wrappedUploadMap.__fcWrapped = true;
    window.uploadMap = wrappedUploadMap;
  }

  console.warn("[FC Loader] shim 安装完成 ✓");
})();

