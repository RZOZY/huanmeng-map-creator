
// ===== iframe/wheel-lock.js =====
/**
 * FMGC wheel-lock
 * ------------------------------------------------------------------
 * 目标：在 fantcraft /generator 页面中，当鼠标位于 FMG 地图 iframe 区域
 *       使用滚轮时，滚轮事件只作用于 FMG 地图自身的缩放（d3 zoom /
 *       MapControls），**完全不**穿透到外层的 React 页面导致其滚动。
 *
 * 实现要点：
 *   1. 在 iframe 内部 document 上注册 capture 阶段的 wheel 监听器
 *      （capture:true + passive:false）
 *   2. 只调用 preventDefault() 阻止浏览器默认行为（页面滚动），
 *      **绝不**调用 stopPropagation() —— 那样会阻断 d3 zoom 在 target
 *      阶段的 wheel 监听，导致地图缩放彻底失效。
 *   3. 同时给 html / body 设置 overscroll-behavior: contain，作为
 *      额外的滚动链路防护。
 *
 * 设计取舍（为什么只在 #map 内拦截，而不是全量拦截整个 iframe）：
 *   FMG iframe 虽然 body 是 overflow:hidden，但侧边栏、弹窗、面板等
 *   UI 可能有内部 overflow:auto 的子元素（比如设置选项列表、城镇详情）。
 *   全量 preventDefault 会破坏这些面板的滚轮滚动。因此只对事件目标
 *   在 #map SVG 祖先链上时才拦截——d3 zoom 和 MapControls 都是在 #map
 *   上做的，面板 DOM 肯定在 #map 外面。
 */
(function initWheelLock() {
  'use strict';

  // 缓存 #map 元素 —— 避免每次 wheel 都 getElementById
  var _mapEl = null;
  function _ensureMapEl() {
    if (_mapEl && document.body.contains(_mapEl)) return _mapEl;
    _mapEl = document.getElementById('map');
    return _mapEl;
  }

  /** 判断 DOM 节点 a 是否是 b 自身或 b 的祖先 */
  function isDescendant(ancestor, node) {
    if (!node || !ancestor) return false;
    if (node === ancestor) return true;  // 快速短路：就是自己
    var cur = node;
    while (cur && cur !== document) {
      cur = cur.parentNode;
      if (cur === ancestor) return true;
    }
    return false;
  }

  function applyWheelLock() {
    // —— 1. overscroll-behavior: contain —— 防止滚动链路在 iframe 边界上向外传递 ——
    try {
      document.documentElement.style.overscrollBehavior = 'contain';
      document.body.style.overscrollBehavior = 'contain';
    } catch (e) { /* ignore */ }

    // 预获取 #map 元素
    _ensureMapEl();

    // —— 2. capture 阶段 wheel 监听 ——
    //    仅当事件目标在 #map SVG 内部时才 preventDefault，
    //    这样既能阻止地图区域的滚轮穿透到外层页面，
    //    又不会破坏 FMG 内部侧边栏/弹窗等非地图区域的滚动。
    document.addEventListener(
      'wheel',
      function (e) {
        var map = _ensureMapEl();
        if (!map) return;
        if (isDescendant(map, e.target)) {
          // 在 #map SVG 内 → 阻止浏览器默认行为（页面滚动），
          // 但不 stopPropagation()，让 d3 zoom / MapControls 继续工作
          e.preventDefault();
        }
        // 非 #map 区域 → 不做处理，让 FMG 内部面板（如果有的话）正常滚动
      },
      { passive: false, capture: true }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWheelLock, { once: true });
  } else {
    applyWheelLock();
  }
})();

