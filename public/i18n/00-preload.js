
// ===== iframe/preload.js =====
/**
 * FMGC Preload - Global Utilities & Legacy Compatibility
 *
 * Provides backward-compatible globals for FMG core scripts.
 * Loaded after bootstrap, before FMGC modules.
 */
(function() {
  'use strict';

  if (!window.FMGC) {
    return;
  }

  var FMGC = window.FMGC;

  // ============================================================
  // 1. Re-export utilities for backward compatibility
  // ============================================================

  window.debounce = window.debounce || FMGC.debounce;
  window.throttle = window.throttle || FMGC.throttle;
  window.ra = window.ra || function(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
  };
  window.randArray = window.randArray || window.ra;
  window.ensureEl = window.ensureEl || function(selector, callback) {
    var el = document.querySelector(selector);
    if (el) { if (callback) callback(el); return el; }
    return null;
  };

  // ============================================================
  // 2. Legacy global stubs
  // ============================================================

  var legacyStubs = {
    modules: {},
    customization: 0,
    grid: null,
    pack: { states: [], provinces: [], burgs: [], cultures: [], religions: [], rivers: [] },
    notes: null,
    options: {},
    config: {},
    graphWidth: 1000,
    graphHeight: 1000,
    scaleBar: null,
    distanceScale: 1,
    defs: null,
    coastline: null,
    lakes: null,
    svgWidth: 1000,
    svgHeight: 1000
  };

  for (var key in legacyStubs) {
    if (window[key] === undefined || window[key] === null) {
      window[key] = legacyStubs[key];
    }
  }

  // ============================================================
  // 3. TypeScript module stubs
  // ============================================================

  if (!window.Names || typeof window.Names.getNameBases !== 'function') {
    window.Names = {
      isPreloadedProxy: true,
      getNameBases: function() { return []; },
      getMapName: function() { return ''; },
      getBase: function() { return '???'; },
      getState: function() { return '???'; },
      getCulture: function() { return '???'; },
      getCultureShort: function() { return '?'; },
      getBaseShort: function() { return '?'; }
    };
  }
  if (!window.Burgs) {
    window.Burgs = { getDefaultGroups: function() { return []; }, generate: function() {}, specify: function() {} };
  }
  if (!window.TradeAnimation) {
    window.TradeAnimation = { getDefaultOptions: function() { return {}; } };
  }
  if (!window.Biomes) {
    window.Biomes = { getDefault: function() { return []; }, define: function() {} };
  }
  if (!window.States) {
    window.States = {
      generate: function() { return []; },
      getFullName: function(state) { return state && state.name ? state.name : ''; },
      define: function() {}
    };
  }
  if (!window.Provinces) {
    window.Provinces = { generate: function() { return []; }, define: function() {} };
  }

  // ============================================================
  // 4. DOM element stubs
  // ============================================================

  /**
   * FakeOptionsCollection - mimics HTMLOptionsCollection API
   * Used by select stubs so FMG's applyOption() works correctly
   */
  function FakeOptionsCollection() {
    this._items = [];
    this.length = 0;
    this.selectedIndex = -1;
  }
  FakeOptionsCollection.prototype = {
    _updateLength: function() {
      this.length = this._items.length;
      // Sync numeric index access for Array.from() compatibility
      for (var i = 0; i < this._items.length; i++) {
        this[i] = this._items[i];
      }
    },
    item: function(index) {
      return this._items[index] || null;
    },
    namedItem: function(name) {
      for (var i = 0; i < this._items.length; i++) {
        if (this._items[i].name === name) return this._items[i];
      }
      return null;
    },
    add: function(option, before) {
      if (typeof before === 'number') {
        this._items.splice(before, 0, option);
      } else if (before && typeof before === 'object') {
        var idx = this._items.indexOf(before);
        if (idx >= 0) this._items.splice(idx, 0, option);
        else this._items.push(option);
      } else {
        this._items.push(option);
      }
      this._updateLength();
    },
    remove: function(index) {
      this._items.splice(index, 1);
      this._updateLength();
    },
    // Support Array.from() and for...of iteration
    forEach: function(cb, thisArg) {
      this._items.forEach(cb, thisArg);
    },
    map: function(cb, thisArg) {
      return this._items.map(cb, thisArg);
    },
    some: function(cb, thisArg) {
      return this._items.some(cb, thisArg);
    },
    filter: function(cb, thisArg) {
      return this._items.filter(cb, thisArg);
    }
  };

  // Set up Symbol.iterator if available
  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
    FakeOptionsCollection.prototype[Symbol.iterator] = function() {
      var self = this;
      var idx = 0;
      return {
        next: function() {
          if (idx < self._items.length) {
            return { value: self._items[idx++], done: false };
          }
          return { value: undefined, done: true };
        }
      };
    };
  }

  if (typeof window.createSelectStub !== 'function') {
    window.createSelectStub = function(defaultValue) {
      var items = new FakeOptionsCollection();
      return {
        value: defaultValue !== undefined ? defaultValue : '',
        text: defaultValue !== undefined ? defaultValue : '',
        options: items,
        selectedIndex: 0,
        appendChild: function(child) {
          if (child && child.tagName === 'OPTION') {
            items.add(child);
          }
        },
        addEventListener: function(){},
        removeEventListener: function(){},
        classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
        style: {},
        dataset: {},
        setAttribute: function(){},
        getAttribute: function(){ return null; },
        removeAttribute: function(){},
        getBoundingClientRect: function() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
        focus: function(){},
        blur: function(){},
        click: function(){},
        insertBefore: function(child) {
          if (child && child.tagName === 'OPTION') {
            items.add(child);
          }
        },
        removeChild: function(child) {
          var idx = items._items.indexOf(child);
          if (idx >= 0) items.remove(idx);
        },
        // Helpful for debugging
        tagName: 'SELECT',
        nodeType: 1
      };
    };
  }

  var stubElements = ['distanceUnitInput', 'heightUnit', 'stylePreset', 'templateInput',
                     'mapWidthInput', 'mapHeightInput', 'distanceScaleInput'];
  for (var i = 0; i < stubElements.length; i++) {
    var el = document.getElementById(stubElements[i]);
    if (!el && !window[stubElements[i]]) {
      window[stubElements[i]] = window.createSelectStub('');
    }
  }

  // ============================================================
  // 5. Draw function stubs
  // ============================================================

  if (!window.drawScaleBar) {
    window.drawScaleBar = function(scaleBar, scaleLevel) {
      if (!scaleBar || !scaleBar.size || scaleBar.size() === 0) return;
      try {
        var size = +scaleBar.attr('data-bar-size') || 10;
        var length = 100;
        scaleBar.selectAll('#scaleBarContent').remove();
        var content = scaleBar.append('g').attr('id', 'scaleBarContent');
        content.append('line')
          .attr('x1', 0.5).attr('y1', 0)
          .attr('x2', length + size - 0.5).attr('y2', 0)
          .attr('stroke-width', size).attr('stroke', 'white');
        content.append('line')
          .attr('x1', 0).attr('y1', size)
          .attr('x2', length + size).attr('y2', size)
          .attr('stroke-width', size).attr('stroke', '#3d3d3d');
      } catch (e) { console.warn('[FMGC] drawScaleBar stub render failed:', e.message); }
    };
  }

  if (!window.fitScaleBar) { window.fitScaleBar = function(scaleBar, width, height) {}; }
  if (!window.drawFeatures) { window.drawFeatures = function() {}; }

  // ============================================================
  // 6. Logger (shared across modules)
  // ============================================================

  var Logger = {
    debug: function() {},
    info: function() {},
    warn: function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[FMGC]');
      console.warn.apply(console, args);
    },
    error: function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[FMGC]');
      console.error.apply(console, args);
    }
  };
  FMGC.register('FMG_CN_LOGGER', Logger);

  // Utils object
  var Utils = {
    Logger: Logger,
    waitFor: function(condition, callback, timeout, interval) {
      timeout = timeout || 10000;
      interval = interval || 100;
      var startTime = Date.now();
      function check() {
        if (condition()) { callback(true); return; }
        if (Date.now() - startTime > timeout) { callback(false); return; }
        setTimeout(check, interval);
      }
      check();
    }
  };
  FMGC.register('FMG_CN_UTILS', Utils);

})();

