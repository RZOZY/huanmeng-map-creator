
// ===== iframe/theme-patch.js =====
/*
 * ==============================================================
 * FMGC Theme Patch — 配色 + 自定义下拉框
 * ==============================================================
 *
 * 两层功能：
 *   1. 配色重映射 (CSS 变量 + !important setProperty + MutationObserver)
 *   2. Select → 自定义仿下拉框（隐藏原生 select，自定义 trigger + 浮层）
 *
 * 自定义下拉框设计原则：
 *   - 原生 <select> 永远保留在 DOM，只设 display:none
 *   - 点击选项 → nativeSel.value = val → dispatchEvent('change')
 *     确保 FMG 原生 onchange 内联处理器和 addEventListener 都被触发
 *   - 原生 select change 事件反向同步 trigger 显示文字
 *   - 浮层支持：点击外部关闭、ESC 关闭、方向键导航、选项 > 10 时加搜索框
 *   - MutationObserver 监听 option 子节点变化，动态重建浮层
 *   - 浮层定位用 position: absolute + 视口边界自动翻转
 * ==============================================================
 */

(function () {
  'use strict';

  if (window.__FMGC_THEME_PATCH_APPLIED__) return;
  window.__FMGC_THEME_PATCH_APPLIED__ = true;

  // ==============================================================
  // 第一部分：配色重映射
  // ==============================================================

  var THEME_VARS = {
    '--header': '#8b6914',
    '--header-active': '#6b4f0e',
    '--bg-light': '#f5efe0',
    '--bg-lighter': '#faf6ec',
    '--bg-main': '#e8dfcc',
    '--bg-disabled': '#d4c9b3',
    '--bg-dialogs': '#f5efe0',
    '--dark-solid': '#2d2017',
    '--light-solid': '#faf6ec',
    '--bg-opacity': '1'
  };

  function applyThemeVars() {
    var root = document.documentElement;
    if (!root) return false;
    var style = root.style;
    Object.keys(THEME_VARS).forEach(function (name) {
      style.setProperty(name, THEME_VARS[name], 'important');
    });
    return true;
  }

  if (document.documentElement) {
    applyThemeVars();
  }

  // ==============================================================
  // 第二部分：注入 CSS 样式
  // ==============================================================

  var css = [':root {'];
  Object.keys(THEME_VARS).forEach(function (name) {
    css.push('  ' + name + ': ' + THEME_VARS[name] + ' !important;');
  });
  css.push('}');

  // --- hover/active 硬编码颜色覆盖 ---
  css.push('button.active { color: var(--light-solid) !important; }');
  css.push('button.options:hover { color: var(--light-solid) !important; }');
  css.push('.tabcontent button.pressed { color: var(--light-solid) !important; font-style: normal !important; }');
  css.push('.tabcontent button:hover { color: var(--dark-solid) !important; }');
  css.push('#sticked button:hover { color: var(--dark-solid) !important; }');
  css.push('#options button i.icon-cog:hover { color: var(--dark-solid) !important; }');
  css.push('.tab > button#optionsHide:hover { color: var(--dark-solid) !important; background-color: var(--bg-lighter) !important; }');

  // ==============================================================
  // 自定义下拉框 (fmgc-select) 样式
  // ==============================================================

  // trigger 按钮
  css.push('.fmgc-select { display: inline-block !important; position: relative !important; }');
  css.push('.fmgc-select-trigger {');
  css.push('  display: flex !important;');
  css.push('  align-items: center !important;');
  css.push('  justify-content: space-between !important;');
  css.push('  width: 100% !important;');
  css.push('  min-width: 6em !important;');
  css.push('  padding: 3px 8px !important;');
  css.push('  font-size: inherit !important;');
  css.push('  font-family: inherit !important;');
  css.push('  line-height: 1.4 !important;');
  css.push('  color: var(--dark-solid) !important;');
  css.push('  background-color: var(--bg-lighter) !important;');
  css.push('  border: 1px solid var(--dark-solid) !important;');
  css.push('  border-radius: 6px !important;');
  css.push('  cursor: pointer !important;');
  css.push('  text-align: left !important;');
  css.push('  box-sizing: border-box !important;');
  css.push('  user-select: none !important;');
  css.push('  transition: border-color 0.15s ease, box-shadow 0.15s ease !important;');
  css.push('}');

  css.push('.fmgc-select-trigger:hover { border-color: var(--header) !important; }');

  // 展开态
  css.push('.fmgc-select.open .fmgc-select-trigger {');
  css.push('  border-color: var(--header) !important;');
  css.push('  outline: 2px solid rgba(139,105,20,0.25) !important;');
  css.push('  outline-offset: 0 !important;');
  css.push('}');

  // trigger 内箭头（小三角）
  css.push('.fmgc-select-arrow {');
  css.push('  display: inline-block !important;');
  css.push('  width: 0 !important; height: 0 !important;');
  css.push('  border-left: 4px solid transparent !important;');
  css.push('  border-right: 4px solid transparent !important;');
  css.push('  border-top: 5px solid var(--dark-solid) !important;');
  css.push('  margin-left: 6px !important;');
  css.push('  flex-shrink: 0 !important;');
  css.push('  transition: transform 0.15s ease !important;');
  css.push('}');

  css.push('.fmgc-select.open .fmgc-select-arrow { transform: rotate(180deg) !important; }');

  // trigger 内文字（选中项）
  css.push('.fmgc-select-label {');
  css.push('  overflow: hidden !important;');
  css.push('  text-overflow: ellipsis !important;');
  css.push('  white-space: nowrap !important;');
  css.push('  flex: 1 !important;');
  css.push('}');

  // 浮层 panel —— 定位（top/left/bottom/width）完全由 JS positionPanel() 控制
  // CSS 只保留视觉样式，不碰任何定位坐标
  css.push('.fmgc-select-panel {');
  css.push('  position: absolute !important;');
  css.push('  z-index: 9999 !important;');
  css.push('  background-color: var(--bg-lighter) !important;');
  css.push('  border: 1px solid var(--dark-solid) !important;');
  css.push('  border-radius: 6px !important;');
  css.push('  box-shadow: 0 4px 16px rgba(45,32,23,0.18) !important;');
  css.push('  overflow: hidden !important;');
  css.push('  animation: fmgcSelectFade 0.12s ease-out !important;');
  css.push('}');

  // 浮层淡入动画
  css.push('@keyframes fmgcSelectFade {');
  css.push('  from { opacity: 0; transform: translateY(-4px); }');
  css.push('  to   { opacity: 1; transform: translateY(0); }');
  css.push('}');

  // 搜索框
  css.push('.fmgc-select-search {');
  css.push('  display: block !important;');
  css.push('  width: calc(100% - 12px) !important;');
  css.push('  margin: 6px !important;');
  css.push('  padding: 5px 8px !important;');
  css.push('  font-size: inherit !important;');
  css.push('  font-family: inherit !important;');
  css.push('  color: var(--dark-solid) !important;');
  css.push('  background-color: var(--bg-light) !important;');
  css.push('  border: 1px solid var(--dark-solid) !important;');
  css.push('  border-radius: 4px !important;');
  css.push('  outline: none !important;');
  css.push('  box-sizing: border-box !important;');
  css.push('}');

  css.push('.fmgc-select-search:focus { border-color: var(--header) !important; }');

  // 选项列表容器（带滚动，隐藏滚动条）
  css.push('.fmgc-select-options {');
  css.push('  max-height: 14em !important;');
  css.push('  overflow-y: auto !important;');
  css.push('  overflow-x: hidden !important;');
  css.push('  padding: 2px 0 !important;');
  css.push('  scrollbar-width: none !important;');
  css.push('  -ms-overflow-style: none !important;');
  css.push('}');
  css.push('.fmgc-select-options::-webkit-scrollbar { width: 0 !important; height: 0 !important; }');

  // 单个选项
  css.push('.fmgc-select-option {');
  css.push('  display: flex !important;');
  css.push('  align-items: center !important;');
  css.push('  padding: 4px 10px !important;');
  css.push('  font-size: inherit !important;');
  css.push('  font-family: inherit !important;');
  css.push('  color: var(--dark-solid) !important;');
  css.push('  cursor: pointer !important;');
  css.push('  white-space: nowrap !important;');
  css.push('  user-select: none !important;');
  css.push('  transition: background-color 0.1s ease !important;');
  css.push('}');

  css.push('.fmgc-select-option:hover { background-color: var(--bg-main) !important; }');

  // 选中态
  css.push('.fmgc-select-option.selected {');
  css.push('  background-color: var(--header) !important;');
  css.push('  color: var(--light-solid) !important;');
  css.push('}');

  // 键盘高亮（hover 或方向键导航到）
  css.push('.fmgc-select-option.key-hover {');
  css.push('  background-color: var(--bg-main) !important;');
  css.push('}');

  // 禁用态
  css.push('.fmgc-select-option.disabled {');
  css.push('  opacity: 0.4 !important;');
  css.push('  cursor: not-allowed !important;');
  css.push('  pointer-events: none !important;');
  css.push('}');

  // 空结果提示
  css.push('.fmgc-select-empty {');
  css.push('  padding: 8px 10px !important;');
  css.push('  color: var(--dark-solid) !important;');
  css.push('  opacity: 0.6 !important;');
  css.push('  text-align: center !important;');
  css.push('}');

  // ==============================================================
  // 控制面板元素样式优化（只改颜色/圆角/阴影/字体，不动任何布局属性）
  // ==============================================================

  // --- 全局字体覆盖 ---
  // FMG 原生强制 font-family: var(--monospace)（Consolas），改为衬线体
  css.push('#options, #options * { font-family: "Noto Serif SC", Georgia, "Times New Roman", serif !important; }');
  css.push('#options input, #options select, #options button { font-family: inherit !important; }');

  // --- 面板容器 ---
  // 原生：直角 + 紫色描边 → 圆角 + 深色描边 + 柔和阴影
  css.push('#options { border-radius: 10px !important; border: 1px solid var(--dark-solid) !important; box-shadow: 0 6px 24px rgba(45,32,23,0.15) !important; }');

  // --- Tab 栏 ---
  // 原生：.tab 紫色描边（已被变量覆盖）、button.options 整栏 active 紫底
  // 优化：active 粗体 + hover 底部金色指示线（用 inset box-shadow 避免加 border 影响高度）
  css.push('.tab button.options.active { font-weight: bold !important; box-shadow: inset 0 -2px 0 var(--header) !important; }');
  css.push('.tab button.options:hover { box-shadow: inset 0 -2px 0 var(--header-active) !important; }');
  css.push('.tab > button#optionsHide { font-family: inherit !important; box-shadow: none !important; }');

  // --- 段落标题 ---
  // 原生：斜体 italic + 粗体
  // 优化：去 italic，纯粗体 + 金色（字体已全局改成衬线）
  css.push('#options p { font-style: normal !important; color: var(--header) !important; letter-spacing: 0.3px !important; }');

  // 工具提示（段落后的小 .tip）
  css.push('#options .tip { color: var(--header-active) !important; font-family: inherit !important; }');

  // --- button.pressed（图层/选项激活态）---
  // 原生：italic + 整栏紫底
  // 优化：去 italic（颜色已通过变量覆盖）
  css.push('.tabcontent button.pressed { font-style: normal !important; }');

  // --- 图层列表 ul#mapLayers li ---
  // 原生：hover box-shadow 紫色发光 (0 0 2px 2px dark-solid 17)
  // 优化：去发光，改轻微阴影 + 金色描边
  css.push('#mapLayers li { border-radius: 6px !important; }');
  css.push('#mapLayers li:hover { box-shadow: 0 2px 6px rgba(139,105,20,0.25) !important; border-color: var(--header) !important; }');
  css.push('#mapLayers li.buttonoff { opacity: 0.5 !important; }');

  // --- 图层列表布局优化 ---
  // 原生：#mapLayers display:inline-block + li float:left + width:28% + margin:0.2em 0.3em
  // 问题：每行 3 个按钮仅占 84% 宽度，加上 margin 导致右侧大片空白
  // 修复：flex 布局 + 精确计算 width，每个按钮有左右各 6px margin（共 12px/按钮）
  // 数学验证：3 × calc(33.333% - 12px) + 3 × 12px margin = 100% ✅
  css.push('#mapLayers { display: flex !important; flex-wrap: wrap !important; padding: 0 !important; margin: 0 !important; width: 100% !important; }');
  css.push('#mapLayers li { float: none !important; width: calc(33.333% - 12px) !important; flex: 0 0 auto !important; margin: 0.2em 6px !important; }');

  // --- 视图模式按钮布局优化 ---
  // 原生：#viewMode button float:left + width:30.7% + margin:0.3em 0.3em 0.6em 0.3em
  // 问题1：3 个按钮仅占 92.1%，加上 margin 导致右侧空白
  // 问题2：flex 容器里 <p> 标签与按钮同行，按钮实际可用宽度不足导致换行
  // 修复：让 <p> 独占一行，按钮在第二行 flex 排列
  css.push('#viewMode { display: flex !important; flex-wrap: wrap !important; padding: 0 !important; margin: 0 !important; width: 100% !important; }');
  css.push('#viewMode > p { flex: 0 0 100% !important; width: 100% !important; }');
  css.push('#viewMode > button { float: none !important; width: calc(33.333% - 12px) !important; flex: 0 0 auto !important; margin: 0.3em 6px 0.6em 6px !important; }');

  // --- 滑块 input[type=range] ---
  // 原生：轨道白色、thumb 方形（border-radius: 15%）
  // 优化：thumb 改圆形、颜色跟随主题
  css.push('#options input[type="range"]::-webkit-slider-thumb { border-radius: 50% !important; background: var(--header) !important; border-color: var(--dark-solid) !important; box-shadow: 0 1px 2px rgba(45,32,23,0.25) !important; }');
  css.push('#options input[type="range"]::-moz-range-thumb { border-radius: 50% !important; background: var(--header) !important; border-color: var(--dark-solid) !important; box-shadow: 0 1px 2px rgba(45,32,23,0.25) !important; }');
  css.push('#options input[type="range"]::-webkit-slider-runnable-track { background: var(--dark-solid) !important; height: 2px !important; }');
  css.push('#options input[type="range"]::-moz-range-track { background: var(--dark-solid) !important; height: 2px !important; }');

  // --- 颜色选择器 input[type=color] ---
  // 原生：4.5em × 1em、border: 0
  // 优化：圆角（保持 border:0 不动，避免影响尺寸）
  css.push('#options input[type="color"] { border-radius: 4px !important; }');

  // --- 输入框 hover outline ---
  // 原生：outline: 1px solid dark-solid
  // 优化：改金色，更显眼
  css.push('#options input[type="number"]:hover { outline: 1px solid var(--header) !important; }');

  // --- 原生 select ---
  // 原生：border: 0（自定义下拉框会隐藏原生 select，只给没被转换的兜底）
  // 保持 border:0 不动避免影响布局，只改圆角
  css.push('#options select { border-radius: 4px !important; }');

  // --- fieldset / legend ---
  // 原生：直角
  // 优化：圆角 + legend 颜色加粗（已被变量覆盖）
  css.push('fieldset { border-radius: 6px !important; }');
  css.push('legend { font-weight: bold !important; color: var(--header) !important; font-family: inherit !important; }');

  // --- 面板内图标 ---
  // 原生：color: #31272c
  // 优化：用主题深色
  css.push('#options i { color: var(--dark-solid) !important; }');

  // --- #sticked 底部快捷按钮组 ---
  // 原生：hover color: white（硬编码）
  // 优化：改深色（已被硬编码覆盖规则搞定）
  css.push('#sticked button:hover { color: var(--dark-solid) !important; }');

  // --- 生成按钮 ---
  css.push('#generateButton, #finalizeHeightmap, #regenerate { font-weight: bold !important; border-radius: 6px !important; }');

  // ==============================================================
  // 表单项深度优化：行间距、独立清晰度、输入框边框
  // ==============================================================

  // 全局 box-sizing: border-box —— 确保加 border/padding 不会撑大表单元素
  css.push('#options * { box-sizing: border-box !important; }');

  // --- table 表单项 ---
  // 原生：无 tr 分隔、td 无 padding
  // 优化：行间细分隔线 + td 合理内边距 + tr hover 高亮
  css.push('.tabcontent table { border-collapse: separate !important; border-spacing: 0 !important; }');
  css.push('.tabcontent table tr td { padding: 6px 4px !important; border-bottom: 1px solid rgba(45,32,23,0.08) !important; }');
  css.push('.tabcontent table tr:last-child td { border-bottom: none !important; }');
  css.push('.tabcontent table tr:hover td { background-color: rgba(139,105,20,0.04) !important; }');
  css.push('.tabcontent table caption { font-size: 0.85em !important; color: var(--header-active) !important; padding-top: 4px !important; font-style: italic !important; }');

  // --- 输入框 type=text / type=number ---
  // 原生：border:0、background-color: white（硬编码）、font-size: smaller（0.8em）
  // 优化：加深色描边 + 圆角 + padding + 主题色背景
  css.push('#options input[type="text"], #options input[type="number"] {');
  css.push('  border: 1px solid var(--dark-solid) !important;');
  css.push('  border-radius: 4px !important;');
  css.push('  padding: 2px 6px !important;');
  css.push('  background-color: var(--bg-lighter) !important;');
  css.push('  font-size: inherit !important;');
  css.push('  color: var(--dark-solid) !important;');
  css.push('  transition: border-color 0.15s ease, box-shadow 0.15s ease !important;');
  css.push('}');

  css.push('#options input[type="text"]:focus, #options input[type="number"]:focus {');
  css.push('  outline: none !important;');
  css.push('  border-color: var(--header) !important;');
  css.push('  box-shadow: 0 0 0 2px rgba(139,105,20,0.2) !important;');
  css.push('}');

  // 覆盖 input.paired（原生硬编码 background-color: white）
  css.push('#options input.paired { background-color: var(--bg-lighter) !important; text-align: center !important; }');
  // 覆盖 input.long（原生硬编码 background-color: white）
  css.push('#options input.long { background-color: var(--bg-lighter) !important; }');

  // --- 段落标题与下方内容的间距 ---
  // 让功能分组更清晰
  css.push('.tabcontent > p { margin-bottom: 6px !important; }');

  // --- checkbox 样式 ---
  // 原生用原生样式，加一些间距
  css.push('#options input[type="checkbox"] { margin-right: 4px !important; cursor: pointer !important; }');

  // --- checkbox label ---
  css.push('.checkbox-label { font-family: inherit !important; cursor: pointer !important; }');

  // --- output（滑块右侧的数值显示）---
  // 原生 font-size: smaller + text-align: right
  css.push('#options output { font-size: inherit !important; color: var(--header) !important; font-weight: bold !important; }');

  // --- sideButton（+/- 预设按钮）---
  // 原生 border-radius: 15% + margin-block: -1em
  css.push('.tabcontent button.sideButton { margin-inline: 2px !important; }');

  var styleEl = document.createElement('style');
  styleEl.id = 'fmgc-theme-patch';
  styleEl.setAttribute('data-fmgc', 'theme-patch');
  styleEl.textContent = css.join('\n');

  function injectSheet() {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (head) {
      head.appendChild(styleEl);
    } else {
      setTimeout(injectSheet, 50);
    }
  }
  injectSheet();

  // ==============================================================
  // 第三部分：Select → 自定义仿下拉框
  // ==============================================================

  /**
   * 核心转换：隐藏原生 select，创建 trigger + 浮层
   */
  function convertSelectToCustom(sel) {
    if (!sel || sel.__fmgcCustomConverted) return false;
    if (!sel.options || sel.options.length === 0) return false;

    var currentValue = sel.value;
    var showSearch = sel.options.length > 10;

    // 解析原生 select 的内联 style 中的 width，传给包装器
    var inlineStyle = sel.getAttribute('style') || '';
    var widthMatch = inlineStyle.match(/width\s*:\s*[^;]+/);
    var wrapperWidth = widthMatch ? widthMatch[0].replace('width:', '').trim() : '';

    // --- 创建包装器 ---
    var wrapper = document.createElement('div');
    wrapper.className = 'fmgc-select';
    if (wrapperWidth) wrapper.style.width = wrapperWidth;

    // --- 创建 trigger ---
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fmgc-select-trigger';
    trigger.setAttribute('tabindex', '0');

    var label = document.createElement('span');
    label.className = 'fmgc-select-label';
    label.textContent = getSelectedOptionText(sel);

    var arrow = document.createElement('span');
    arrow.className = 'fmgc-select-arrow';

    trigger.appendChild(label);
    trigger.appendChild(arrow);
    wrapper.appendChild(trigger);

    // --- 创建浮层 panel（初始不挂到 DOM，点开时才挂到 body）---
    var panel = document.createElement('div');
    panel.className = 'fmgc-select-panel';
    panel.style.display = 'none';

    // 搜索框（仅选项 > 10 时）
    var searchInput = null;
    if (showSearch) {
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'fmgc-select-search';
      searchInput.placeholder = 'Search...';
      panel.appendChild(searchInput);
    }

    // 选项列表容器
    var optionsContainer = document.createElement('div');
    optionsContainer.className = 'fmgc-select-options';
    panel.appendChild(optionsContainer);

    // 隐藏原生 select
    sel.__fmgcCustomConverted = true;
    sel.__fmgcWrapper = wrapper;
    sel.__fmgcPanel = panel;
    sel.__fmgcLabel = label;
    sel.style.display = 'none';
    sel.setAttribute('aria-hidden', 'true');

    // 插入到 select 所在位置（替换视觉位置，但原生 select 仍在 DOM）
    sel.parentNode.insertBefore(wrapper, sel);

    // 渲染选项到 optionsContainer
    function renderOptions(filter) {
      optionsContainer.innerHTML = '';
      var keyword = (filter || '').toLowerCase().trim();
      var anyShown = false;

      for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        if (opt.hidden) continue;
        if (keyword && (opt.text || opt.value).toLowerCase().indexOf(keyword) === -1) continue;

        anyShown = true;
        var row = document.createElement('div');
        row.className = 'fmgc-select-option';
        row.setAttribute('data-value', opt.value);
        row.textContent = opt.text || opt.value;
        if (opt.disabled) row.classList.add('disabled');
        if (opt.value === sel.value) row.classList.add('selected');
        optionsContainer.appendChild(row);
      }

      if (!anyShown && keyword) {
        var empty = document.createElement('div');
        empty.className = 'fmgc-select-empty';
        empty.textContent = 'No matches';
        optionsContainer.appendChild(empty);
      }
    }

    renderOptions();

    // ==============================================================
    // 事件：trigger 点击 → 打开/关闭浮层
    // ==============================================================
    var isOpen = false;
    var keyHoverIndex = -1; // 方向键导航位置

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      wrapper.classList.add('open');
      panel.style.display = 'block';

      // 清除上次的固定 width/top/left，让 panel 先按内容自然撑开再测量
      panel.style.width = 'auto';
      panel.style.top = 'auto';
      panel.style.left = 'auto';

      // 挂到 body（确保不被父容器 overflow:hidden 裁剪）
      document.body.appendChild(panel);

      // 重新渲染（应对 option 变化）+ 定位
      renderOptions(searchInput ? searchInput.value : '');
      positionPanel();
      scrollToSelected();

      // focus 搜索框或 trigger
      if (searchInput) {
        setTimeout(function () { searchInput.focus(); }, 10);
      } else {
        trigger.focus();
      }
    }

    function closePanel() {
      if (!isOpen) return;
      isOpen = false;
      wrapper.classList.remove('open');
      panel.style.display = 'none';
      if (panel.parentNode === document.body) {
        document.body.removeChild(panel);
      }
      keyHoverIndex = -1;
      trigger.focus();
    }

    function togglePanel() {
      if (isOpen) closePanel(); else openPanel();
    }

    function positionPanel() {
      var rect = trigger.getBoundingClientRect();

      // 清除 panel 的 overflow:hidden 临时改为 visible，让内容自然撑开
      // 这样 scrollWidth 才能反映真实的最长 option 宽度
      var prevOverflow = panel.style.overflow;
      panel.style.overflow = 'visible';

      // optionsContainer 的 scrollWidth = 最长 option 文本宽度 + padding
      // 再加上 panel 的 border（1px × 2）和可能的搜索框宽度
      var optionsWidth = optionsContainer.scrollWidth;
      var searchBoxWidth = searchInput ? searchInput.offsetWidth + 12 : 0; // 搜索框 margin 6px×2
      var naturalWidth = Math.max(optionsWidth, searchBoxWidth) + 2; // +2px for panel border

      // 恢复 overflow（否则圆角不生效）
      panel.style.overflow = prevOverflow || 'hidden';

      // 理想宽度：至少等于 trigger 宽度（保证对齐），但尽量容纳最长选项
      var minWidth = rect.width;
      var idealWidth = Math.max(minWidth, naturalWidth);

      // 视口边界：右侧最多到 window.innerWidth - 8px
      var maxWidthByRight = window.innerWidth - rect.left - 8;
      var finalWidth = Math.min(idealWidth, maxWidthByRight);

      // 如果理想宽度超过右侧空间，且左侧还有空间，整体左移
      var left = rect.left;
      if (idealWidth > maxWidthByRight && rect.left > window.innerWidth / 2) {
        left = Math.max(8, window.innerWidth - finalWidth - 8);
      }

      // 计算向上/向下翻转
      var panelHeight = panel.offsetHeight;
      var spaceBelow = window.innerHeight - rect.bottom;
      var spaceAbove = rect.top;
      var shouldFlip = spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow;

      if (shouldFlip) {
        panel.style.top = (rect.top - panelHeight + window.scrollY) + 'px';
      } else {
        panel.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      }
      panel.style.left = (left + window.scrollX) + 'px';
      panel.style.bottom = 'auto';
      panel.style.width = finalWidth + 'px';
    }

    function scrollToSelected() {
      var selected = optionsContainer.querySelector('.fmgc-select-option.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }

    // trigger 点击
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });

    // trigger 键盘（Enter/Space 打开）
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openPanel();
      }
    });

    // ==============================================================
    // 事件：浮层内选项点击 → 同步原生 select + dispatch change
    // ==============================================================
    optionsContainer.addEventListener('click', function (e) {
      var row = e.target.closest('.fmgc-select-option');
      if (!row || row.classList.contains('disabled')) return;

      var val = row.getAttribute('data-value');
      if (val === null) return;

      // 同步到原生 select
      sel.value = val;

      // 派发 change 事件
      var changeEvent;
      if (typeof Event === 'function') {
        changeEvent = new Event('change', { bubbles: true });
      } else {
        changeEvent = document.createEvent('Event');
        changeEvent.initEvent('change', true, false);
      }
      sel.dispatchEvent(changeEvent);

      // 更新 trigger 文字
      label.textContent = row.textContent;

      closePanel();
    });

    // ==============================================================
    // 事件：浮层内方向键导航 + ESC + 搜索
    // ==============================================================
    function navigateOptions(direction) {
      var rows = optionsContainer.querySelectorAll('.fmgc-select-option:not(.disabled)');
      if (rows.length === 0) return;

      // 清除之前的 key-hover
      for (var i = 0; i < rows.length; i++) rows[i].classList.remove('key-hover');

      keyHoverIndex += direction;
      if (keyHoverIndex < 0) keyHoverIndex = rows.length - 1;
      if (keyHoverIndex >= rows.length) keyHoverIndex = 0;

      rows[keyHoverIndex].classList.add('key-hover');
      rows[keyHoverIndex].scrollIntoView({ block: 'nearest' });
    }

    function selectKeyHovered() {
      var row = optionsContainer.querySelector('.fmgc-select-option.key-hover');
      if (!row) return;
      var val = row.getAttribute('data-value');
      if (val === null) return;

      sel.value = val;
      var changeEvent;
      if (typeof Event === 'function') {
        changeEvent = new Event('change', { bubbles: true });
      } else {
        changeEvent = document.createEvent('Event');
        changeEvent.initEvent('change', true, false);
      }
      sel.dispatchEvent(changeEvent);
      label.textContent = row.textContent;
      closePanel();
    }

    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateOptions(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateOptions(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectKeyHovered();
      }
    });

    // 搜索输入过滤
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        keyHoverIndex = -1;
        renderOptions(searchInput.value);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateOptions(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateOptions(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          selectKeyHovered();
        } else if (e.key === 'Escape') {
          closePanel();
        }
      });
    }

    // ==============================================================
    // 事件：点击外部关闭
    // ==============================================================
    function handleDocClick(e) {
      if (!isOpen) return;
      if (wrapper.contains(e.target)) return;
      if (panel.contains(e.target)) return;
      closePanel();
    }

    function handleDocKeydown(e) {
      if (!isOpen) return;
      if (e.key === 'Escape') closePanel();
    }

    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleDocKeydown);

    // wrapper 销毁时清理监听器
    wrapper.__fmgcCleanup = function () {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleDocKeydown);
    };

    // ==============================================================
    // 反向同步：原生 select change → 更新 trigger 文字 + 浮层选中态
    // ==============================================================
    sel.addEventListener('change', function () {
      label.textContent = getSelectedOptionText(sel);
      if (isOpen) {
        renderOptions(searchInput ? searchInput.value : '');
        scrollToSelected();
      }
    });

    // ==============================================================
    // 监听原生 select 的 option 变化（FMG 动态填充），重建浮层
    // 注：每个 select 挂独立 MO 虽然 MO 数量多，但非常精准（只 observe(sel)），
    // 触发频率极低（只有切换文化库/气候类型等场景才填充 option），远优于 body 级 subtree MO
    // ==============================================================
    var optionObserver = new MutationObserver(function () {
      if (!wrapper.isConnected) {
        optionObserver.disconnect();
        return;
      }
      // 同步 trigger 文字（可能 value 变了）
      label.textContent = getSelectedOptionText(sel);
      // 重建 options
      renderOptions(searchInput ? searchInput.value : '');
    });
    optionObserver.observe(sel, { childList: true, characterData: true, subtree: true });

    return true;
  }

  function getSelectedOptionText(sel) {
    if (sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
      return sel.options[sel.selectedIndex].text || sel.options[sel.selectedIndex].value;
    }
    return '';
  }

  /**
   * 扫描页面所有 select 并转换（限定 #options 和 .ui-dialog 范围内）
   */
  function scanAndConvertSelects() {
    var scopes = document.querySelectorAll('#options select, .ui-dialog select');
    var converted = 0;
    for (var i = 0; i < scopes.length; i++) {
      if (convertSelectToCustom(scopes[i])) {
        converted++;
      }
    }
    return converted;
  }

  /**
   * 多次重试 —— FMG 初始化顺序不确定，option 可能异步填充
   */
  function retryScan(maxAttempts, interval) {
    var attempts = 0;
    function tryNow() {
      attempts++;
      scanAndConvertSelects();
      if (attempts < maxAttempts) {
        setTimeout(tryNow, interval);
      }
    }
    tryNow();
  }

  // ==============================================================
  // 启动
  // ==============================================================

  function startObservers() {
    // MutationObserver 维护配色
    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].attributeName === 'style') {
            applyThemeVars();
            break;
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    }

    scanAndConvertSelects();
    retryScan(5, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObservers);
  } else {
    startObservers();
  }

})();

