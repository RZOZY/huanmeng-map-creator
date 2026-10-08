
// ===== iframe/config-patch.js =====
/**
 * FMGC Config Patch - Chinese UI & Default Settings
 *
 * Removes "About" tab, applies Chinese-friendly defaults
 * (metric units, oriental culture set, etc.)
 */
(function() {
  'use strict';

  var U = window.FMG_CN_UTILS;
  var Logger = U ? U.Logger : {
    debug: function(){}, info: function(){}, warn: function(){}, error: function(){}
  };
  var patchApplied = false;

  /**
   * Wait for an element to appear in DOM
   */
  function waitForElement(id, callback, timeout) {
    timeout = timeout || 10000;
    var start = Date.now();
    function check() {
      var el = document.getElementById(id);
      if (el) { callback(el); return; }
      if (Date.now() - start > timeout) return;
      setTimeout(check, 100);
    }
    check();
  }

  /**
   * Wait for a function to be available on window
   */
  function waitForFunction(name, callback, timeout) {
    timeout = timeout || 10000;
    var start = Date.now();
    function check() {
      if (typeof window[name] === 'function') { callback(); return; }
      if (Date.now() - start > timeout) return;
      setTimeout(check, 100);
    }
    check();
  }

  function removeAboutTab() {
    var aboutTab = document.getElementById('aboutTab');
    if (aboutTab) aboutTab.style.display = 'none';
    var aboutContent = document.getElementById('aboutContent');
    if (aboutContent) aboutContent.style.display = 'none';
    var startTourBtn = document.getElementById('startTourButton');
    if (startTourBtn) startTourBtn.style.display = 'none';
    Logger.info('Config', 'About tab removed');
  }

  function patchTabSwitching() {
    var tabContainer = document.querySelector('#options div.tab');
    if (!tabContainer) {
      setTimeout(patchTabSwitching, 100);
      return;
    }
    tabContainer.addEventListener('click', function(event) {
      if (event.target.tagName !== 'BUTTON') return;
      var id = event.target.id;
      if (id === 'aboutTab') {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    Logger.info('Config', 'Tab switching patched');
  }

  function applyChineseDefaults() {
    // Force-override: oriental culture set
    var forceDefaults = { culturesSet: 'oriental' };
    for (var forceKey in forceDefaults) {
      localStorage.removeItem(forceKey);
      var forceEl = document.getElementById(forceKey);
      if (forceEl) {
        forceEl.value = forceDefaults[forceKey];
        var evt = new Event('change');
        forceEl.dispatchEvent(evt);
        localStorage.setItem(forceKey, forceDefaults[forceKey]);
      }
    }

    if (localStorage.getItem('fmg_cn_config_applied')) return;
    Logger.info('Config', 'Applying Chinese user defaults');

    var defaults = {
      distanceUnit: 'km', heightUnit: 'm', temperatureScale: '°C',
      points: '5', statesNumber: '25', cultures: '18',
      stateLabelsMode: 'full', temperatureEquator: '28',
      temperatureNorthPole: '-30', temperatureSouthPole: '-20',
      religionsNumber: '8', manors: '1500', azgaarAssistant: 'hide'
    };

    var idMapping = {
      distanceUnit: 'distanceUnitInput', heightUnit: 'heightUnit',
      temperatureScale: 'temperatureScale', points: 'pointsInput',
      statesNumber: 'statesNumber', cultures: 'culturesInput',
      stateLabelsMode: 'stateLabelsModeInput',
      temperatureEquator: 'temperatureEquatorInput',
      temperatureNorthPole: 'temperatureNorthPoleInput',
      temperatureSouthPole: 'temperatureSouthPoleInput',
      religionsNumber: 'religionsNumber', manors: 'manorsInput',
      azgaarAssistant: 'azgaarAssistant'
    };

    for (var key in defaults) {
      if (localStorage.getItem(key)) continue;
      var el = document.getElementById(idMapping[key]);
      if (!el) continue;
      el.value = defaults[key];
      var evtType = (key === 'points' || key === 'cultures' || key === 'statesNumber' ||
                     key === 'manors' || key === 'religionsNumber') ? 'input' : 'change';
      el.dispatchEvent(new Event(evtType));
      localStorage.setItem(key, defaults[key]);
    }

    localStorage.setItem('fmg_cn_config_applied', 'true');
    Logger.info('Config', 'Chinese defaults applied');
  }

  function patchRandomizeOptions() {
    if (typeof window.randomizeOptions !== 'function') {
      setTimeout(patchRandomizeOptions, 100);
      return;
    }
    var originalRandomizeOptions = window.randomizeOptions;
    window.randomizeOptions = function() {
      originalRandomizeOptions();
      var randomize = new URL(window.location.href).searchParams.get('options') === 'default';
      if (randomize || !window.locked || !window.locked('culturesSet')) {
        var culturesSet = document.getElementById('culturesSet');
        if (culturesSet && window.rw) {
          var sets = { world: 5, european: 3, oriental: 8, english: 2, antique: 2, highFantasy: 5, darkFantasy: 2, random: 1 };
          culturesSet.value = window.rw(sets);
          if (typeof window.changeCultureSet === 'function') window.changeCultureSet();
        }
      }
      if (randomize || !window.locked || !window.locked('temperatureEquator')) {
        if (window.options && window.gauss) {
          window.options.temperatureEquator = window.gauss(28, 5, 20, 35, 0);
          window.options.temperatureNorthPole = window.gauss(-30, 5, -45, 10, 0);
          window.options.temperatureSouthPole = window.gauss(-20, 5, -45, 10, 0);
        }
      }
    };
    Logger.info('Config', 'randomizeOptions patched');
  }

  function patchApplyStoredOptions() {
    if (typeof window.applyStoredOptions !== 'function') {
      setTimeout(patchApplyStoredOptions, 100);
      return;
    }
    var original = window.applyStoredOptions;
    window.applyStoredOptions = function() {
      original();
      var unitDefaults = { distanceUnit: 'km', heightUnit: 'm', temperatureScale: '°C' };
      for (var key in unitDefaults) {
        if (localStorage.getItem(key)) continue;
        var el = document.getElementById(key === 'distanceUnit' ? 'distanceUnitInput' : key);
        if (!el) continue;
        el.value = unitDefaults[key];
        if (typeof window.lock === 'function') window.lock(key);
      }
    };
    Logger.info('Config', 'applyStoredOptions patched');
  }

  /**
   * 隐藏 PWA 安装按钮
   * FMG installation.js 在 beforeinstallprompt 时创建一个
   *   <button class="options glow" style="position:fixed;top:1em;right:1em;">安装</button>
   *
   * 两层防护：
   * 1. 提前设 localStorage("installationDontAsk") — FMG init() 第 6-7 行检查此值后直接 return
   * 2. findAndHideInstallButton() 立即扫描并隐藏已存在的按钮
   *
   * 注：曾用过 body+subtree MutationObserver 做动态兜底，但 FMG init() 本身
   * 已在首次调用 installation.js 时就因 localStorage 检查提前 return，
   * 不会再动态创建安装按钮。MO 在地图生成期间每次 DOM 变化都空跑 querySelectorAll，
   * 已移除（2026-09-23 清理）。
   */
  function hideInstallButton() {
    // 提前阻止 FMG 创建安装按钮（localStorage 检查在 FMG installation.js init() 里）
    try { localStorage.setItem('installationDontAsk', 'true'); } catch(e) {}

    // 立即移除已存在的按钮（如果在 localStorage 设置前按钮已被创建）
    findAndHideInstallButton();

    Logger.info('Config', 'Install button hidden');
  }

  function isInstallButton(el) {
    if (!el || el.tagName !== 'BUTTON') return false;
    var cls = el.className || '';
    if (typeof cls !== 'string') return false;
    if (!cls.includes('options') || !cls.includes('glow')) return false;
    var style = el.getAttribute && el.getAttribute('style') || '';
    if (typeof style !== 'string') return false;
    // 安装按钮特征：position: fixed + top: 1em + right: 1em
    return style.indexOf('position: fixed') !== -1 &&
           style.indexOf('top: 1em') !== -1 &&
           style.indexOf('right: 1em') !== -1;
  }

  function findAndHideInstallButton() {
    var buttons = document.querySelectorAll('button.options.glow');
    for (var i = 0; i < buttons.length; i++) {
      if (isInstallButton(buttons[i])) {
        buttons[i].style.display = 'none';
      }
    }
  }

  function patchURLManipulation() {
    if (window.location.hash === '#about') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function init() {
    if (patchApplied) return;
    patchApplied = true;
    Logger.info('Config', 'Initializing Chinese UI & Config patch...');

    removeAboutTab();
    hideInstallButton();
    patchTabSwitching();
    patchURLManipulation();

    waitForElement('distanceUnitInput', applyChineseDefaults);
    waitForFunction('randomizeOptions', patchRandomizeOptions);
    waitForFunction('applyStoredOptions', patchApplyStoredOptions);

    Logger.info('Config', 'Chinese UI & Config patch initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(init, 1000);
  setTimeout(init, 2000);

  // Public API
  window.FMG_CN_CONFIG = {
    applyDefaults: function() {
      localStorage.removeItem('fmg_cn_config_applied');
      ['distanceUnit', 'heightUnit', 'temperatureScale', 'culturesSet', 'points',
       'statesNumber', 'cultures', 'stateLabelsMode', 'temperatureEquator',
       'temperatureNorthPole', 'temperatureSouthPole', 'religionsNumber', 'manors',
       'azgaarAssistant'].forEach(function(k) { localStorage.removeItem(k); });
      location.reload();
    },
    isApplied: function() { return localStorage.getItem('fmg_cn_config_applied') === 'true'; },
    getChineseDefaults: function() {
      return { distanceUnit: 'km', heightUnit: 'm', temperatureScale: '°C',
        culturesSet: 'oriental', points: 5, statesNumber: 25, cultures: 18,
        stateLabelsMode: 'full', temperatureEquator: 28,
        temperatureNorthPole: -30, temperatureSouthPole: -20,
        religionsNumber: 8, manors: 1500, azgaarAssistant: 'hide' };
    }
  };

})();

