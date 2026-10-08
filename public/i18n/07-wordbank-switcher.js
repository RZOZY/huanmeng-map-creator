
// ===== iframe/wordbank-switcher.js =====
/**
 * FMGC Wordbank Switcher
 * 运行时切换名称库风格 — fetch JSON → loadProfile → undraw → generate → drawLayers
 */
(function () {
  'use strict';

  var ALL_KEYS = ['culture', 'state', 'burg', 'province', 'river', 'lake', 'mapName', 'religion', 'marker', 'zone'];
  var currentProfile = 'default';
  var profilesCache = null;
  var _isSwitching = false;
  var _switchingProfileId = null;

  // 用户状态（由父页面通过 INIT_CONFIG 注入）
  var fcUser = {
    userId: null,
    tier: 0,
    isPaid: false
  };

  function _isMember() {
    return fcUser.isPaid === true;
  }
  function _isLoggedIn() {
    return fcUser.userId != null;
  }

  // 监听父页面 postMessage（父站 React 工具栏按钮触发 + 用户状态注入）
  window.addEventListener('message', function (event) {
    // 🆕 FMGC-6: source guard — 和 cloud-save/geo-export/watermark 保持一致
    if (event.source !== window.parent) return;

    // origin guard：bootstrap 未注入校验函数时也保守拒绝，防止静默绕过
    if (typeof window.__FMGC_IS_ALLOWED_ORIGIN__ !== 'function' || !window.__FMGC_IS_ALLOWED_ORIGIN__(event.origin)) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;

    // INIT_CONFIG: 父页面注入用户身份
    if (data.type === 'INIT_CONFIG' && data.payload) {
      var p = data.payload;
      fcUser.userId = p.userId != null ? p.userId : null;
      fcUser.tier = p.tier != null ? p.tier : 0;
      fcUser.isPaid = p.isPaid === true;
      try { window.__FC_USER = fcUser; } catch(e) {}
      // 如果弹窗正在打开，重新渲染列表以反映最新权限
      var listEl = document.getElementById('wordbankList');
      if (listEl && profilesCache && listEl.innerHTML) {
        renderProfileList(listEl, profilesCache);
      }
      return;
    }

    if (data.type === 'FC_WORDBANK_OPEN_DIALOG') {

      openWordbankDialog();
    }
  });

  // ============================================================
  // 弹窗逻辑
  // ============================================================
  function openWordbankDialog() {
    var $ = window.jQuery;
    if (!$ || !$.fn.dialog) {
      console.warn('[FMGC Switcher] jQuery UI dialog not available');
      alert('名称库切换需要 FMG jQuery UI 支持');
      return;
    }

    // 检测移动端
    var isMobile = window.matchMedia('(max-width: 767px)').matches;

    // 定位 —— 弹窗放到视口中上偏顶部
    // jQuery UI position 语法：my=对话框锚点, at=目标锚点, +数字=像素偏移
    // 桌面端相对于 svg（地图视口），避开 FMG 顶部工具栏 ~100px
    // 移动端相对于 window，避开 Header 栏 ~60px
    var dialogPosition = isMobile
      ? { my: 'center top', at: 'center top+60', of: window }
      : { my: 'center top', at: 'center top+80', of: (document.querySelector('svg') || window) };

    // 宽度 —— 与 FMG 原生弹窗一致（em 相对根字号自适应），移动端进一步收窄
    var dialogWidth = isMobile ? Math.min(window.innerWidth - 24, 560) : '34em';

    // 如果 dialog DOM 还不存在，先创建完整结构
    if ($('#wordbankDialog').length === 0) {
      console.log('[FMGC Switcher] 创建 #wordbankDialog DOM 元素');
      // 内部不再重复标题 —— jQuery UI dialog title bar 已提供
      var html = '<div id="wordbankDialog" style="display:none; padding: 0;">' +
        '<div id="wordbankLoading" class="is-hidden" style="display:none; padding: 0.55em 0.85em; font-size: 0.85em; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb;"></div>' +
        '<div id="wordbankList" style="padding: 0.4em 0.3em;"></div>' +
      '</div>';
      $('body').append(html);
    }

    var $dialog = $('#wordbankDialog');

    if ($dialog.hasClass('ui-dialog-content')) {
      // 已初始化过 —— 重新打开时刷新尺寸 + 定位（跟随当前设备）
      $dialog.dialog('option', {
        width: dialogWidth,
        position: dialogPosition,
        resizable: !isMobile,
        draggable: true
      });
      $dialog.dialog('open');
      applyResponsiveListHeight(isMobile);
      loadAndRenderProfiles();
      return;
    }

    // 首次初始化 —— 与 FMG 原生弹窗保持一致
    $dialog.dialog({
      modal: false,
      title: '选择名称库风格',
      autoOpen: true,
      width: dialogWidth,
      position: dialogPosition,
      draggable: true,
      resizable: !isMobile,
      close: function () {}
    });

    applyResponsiveListHeight(isMobile);
    loadAndRenderProfiles();
  }

  // 根据设备调整列表区域高度 —— 限制弹窗总高不超过视口的 70%/75%
  function applyResponsiveListHeight(isMobile) {
    var listEl = document.getElementById('wordbankList');
    if (!listEl) return;
    if (isMobile) {
      // 移动端：列表最高 55vh（dialog 总高 ≈ 70vh，留足底部空间）
      listEl.style.maxHeight = '55vh';
      listEl.style.padding = '0.5em 0.5em';
    } else {
      // 桌面端：列表最高 50vh（dialog 总高 ≈ 65vh）
      listEl.style.maxHeight = '50vh';
      listEl.style.padding = '0.4em 0.3em';
    }
    listEl.style.overflowY = 'auto';
  }

  function closeWordbankDialog() {
    var $ = window.jQuery;
    if ($ && $.fn.dialog) {
      $('#wordbankDialog').dialog('close');
    }
  }

  // ============================================================
  // 加载 + 渲染 profile 列表
  // ============================================================
  async function loadAndRenderProfiles() {
    var listEl = document.getElementById('wordbankList');
    var loadingEl = document.getElementById('wordbankLoading');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (loadingEl) {
      loadingEl.classList.remove('is-hidden');
      loadingEl.textContent = '加载词库列表...';
      loadingEl.style.display = 'block';
    }

    try {
      var resp = await fetch('./i18n/wordbanks/index.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var indexData = await resp.json();
      profilesCache = indexData.profiles || [];

      try {
        var debug = window.__FMGC_NAMES_DEBUG__;
        if (debug) currentProfile = debug.profile || 'default';
      } catch (e) {}

      if (loadingEl) {
        loadingEl.style.display = 'none';
        loadingEl.classList.add('is-hidden');
      }
      renderProfileList(listEl, profilesCache);
    } catch (err) {
      console.warn('[FMGC Switcher] 加载词库索引失败:', err);
      if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.classList.remove('is-hidden');
        loadingEl.textContent = '加载失败，请刷新页面 (' + err.message + ')';
      }
      if (profilesCache === null) {
        profilesCache = [
          { id: 'default', name: '中国古代历史', description: '以华夏历史地名风格为基底，通用型' },
          { id: 'xianxia', name: '仙侠修真', description: '修仙宗门、飞升渡劫、三界六道' },
          { id: 'xuanhuan', name: '玄幻异世', description: '异世大陆、种族争霸、天材地宝' },
          { id: 'wuxia', name: '武侠江湖', description: '名门正派 · 邪派魔教 · 游侠江湖 · 隐世高人' },
          { id: 'modern-urban', name: '现代都市', description: '共和政体 · 联邦各州 · 王室领地 · 特区自治' },
          { id: 'mythology', name: '上古神话', description: '天庭神界 · 地府冥界 · 上古部族 · 洪荒神兽' },
          { id: 'dark-fantasy', name: '黑暗奇幻', description: '旧日教团 · 死灵王朝 · 深渊领地 · 暮光残朝' },
          { id: 'high-fantasy', name: '中土奇幻', description: '精灵、矮人、龙、西方奇幻经典' },
          { id: 'republic', name: '民国近现代', description: '北洋军阀 · 国民政府 · 苏区根据地 · 边疆自治' },
          { id: 'commune', name: '人民公社', description: '人民公社 · 生产小队 · 国营农场 · 三线军工' }
        ];
        if (loadingEl) {
          loadingEl.style.display = 'none';
          loadingEl.classList.add('is-hidden');
        }
        renderProfileList(listEl, profilesCache);
      }
    }
  }

  function renderProfileList(listEl, profiles) {
    var isMobile = window.matchMedia('(max-width: 767px)').matches;
    listEl.innerHTML = '';

    // 把总数写到 dialog title bar —— 与 FMG 原生弹窗保持一致
    try {
      var $ = window.jQuery;
      if ($) {
        $('#wordbankDialog').dialog('option', 'title', '选择名称库风格（共 ' + profiles.length + ' 套）');
      }
    } catch (e) {}

    profiles.forEach(function (p) {
      var isCurrent = p.id === currentProfile;
      var isSwitching = p.id === _switchingProfileId && _isSwitching;
      var isDisabled = _isSwitching && !isSwitching;
      var isPremium = (p.tier || 'free') === 'premium';
      var isLocked = isPremium && !_isMember() && !isCurrent;

      var item = document.createElement('div');
      item.className = 'fmgc-wb-item';

      // 根据状态决定样式
      var borderColor, bgColor, fontWeight, titleColor, itemCursor, itemOpacity;
      if (isCurrent) {
        borderColor = '#10b981';
        bgColor = '#ecfdf5';
        fontWeight = '600';
        titleColor = '#047857';
        itemCursor = 'default';
        itemOpacity = '1';
      } else if (isLocked) {
        borderColor = '#e5e7eb';
        bgColor = '#fafafa';
        fontWeight = '400';
        titleColor = '#1f2937';
        itemCursor = 'pointer';
        itemOpacity = '0.72';
      } else {
        borderColor = '#e5e7eb';
        bgColor = '#ffffff';
        fontWeight = '400';
        titleColor = '#1f2937';
        itemCursor = 'pointer';
        itemOpacity = '1';
      }

      // 移动端 item 样式 —— 更大的点击区域 + 允许描述换行 + 纵向堆叠
      var itemPadding = isMobile ? '0.8em 0.9em' : '0.55em 0.85em';
      var itemFontSize = isMobile ? '14px' : '13px';
      var itemBorderRadius = isMobile ? '10px' : '8px';
      var iconWidth = isMobile ? '2.6em' : '2.2em';
      var iconHeight = isMobile ? '2.6em' : '2.2em';
      var iconFontSize = isMobile ? '1.4em' : '1.2em';
      var iconMarginRight = isMobile ? '0.85em' : '0.65em';

      item.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:' + itemPadding,
        'border:1px solid ' + borderColor,
        'border-radius:' + itemBorderRadius,
        'cursor:' + itemCursor,
        'background:' + bgColor,
        'opacity:' + itemOpacity,
        'transition:background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease, opacity 0.18s ease',
        'font-family:inherit',
        'font-size:' + itemFontSize,
        'width:100%',
        'box-sizing:border-box',
        '-webkit-tap-highlight-color:transparent'
      ].join(';');

      // Hover 效果（移动端 touch 设备不需要 hover）
      var interactive = !isCurrent && !isDisabled && !isSwitching;
      if (interactive && !('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
        item.addEventListener('mouseenter', function () {
          if (isLocked) {
            item.style.borderColor = '#f59e0b';
            item.style.background = '#fffbeb';
            item.style.opacity = '1';
            item.style.transform = 'translateY(-1px)';
            item.style.boxShadow = '0 2px 10px rgba(245,158,11,0.18)';
          } else {
            item.style.borderColor = '#60a5fa';
            item.style.background = '#f0f9ff';
            item.style.transform = 'translateY(-1px)';
            item.style.boxShadow = '0 2px 8px rgba(59,130,246,0.12)';
          }
        });
        item.addEventListener('mouseleave', function () {
          item.style.borderColor = borderColor;
          item.style.background = bgColor;
          item.style.opacity = itemOpacity;
          item.style.transform = 'translateY(0)';
          item.style.boxShadow = 'none';
        });
      }
      // 移动端 touch feedback —— active 态
      if (interactive && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
        item.addEventListener('touchstart', function () {
          item.style.background = '#f3f4f6';
        }, { passive: true });
        item.addEventListener('touchend', function () {
          item.style.background = bgColor;
        }, { passive: true });
      }

      // Icon 容器（带圆角背景）
      var iconBgColor = isCurrent ? '#a7f3d0' : (isLocked ? '#f3f4f6' : '#f3f4f6');
      var iconHtml = p.icon
        ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:' + iconWidth + ';height:' + iconHeight + ';font-size:' + iconFontSize + ';margin-right:' + iconMarginRight + ';border-radius:8px;background:' + iconBgColor + ';flex-shrink:0">' + escapeHtml(p.icon) + '</span>'
        : '';

      // Tier Chip — 锁定状态下略灰
      var tierOpacity = isLocked ? '0.85' : '1';
      var tierChipFontSize = isMobile ? '0.75em' : '0.7em';
      var tierChip = isPremium
        ? '<span style="font-size:' + tierChipFontSize + ';padding:0.1em 0.5em;border-radius:8px;background:linear-gradient(135deg,#fde68a,#f59e0b);color:#78350f;font-weight:700;margin-left:0.4em;flex-shrink:0;letter-spacing:0.02em;opacity:' + tierOpacity + '">👑 会员</span>'
        : '<span style="font-size:' + tierChipFontSize + ';padding:0.1em 0.5em;border-radius:8px;background:#f0fdf4;color:#16a34a;font-weight:600;margin-left:0.4em;flex-shrink:0;border:1px solid #bbf7d0">免费</span>';

      // 状态（右侧）— 锁定时显示锁图标 + 引导文字
      var rightBadge = '';
      var rightBadgeFontSize = isMobile ? '0.78em' : '0.72em';
      if (isCurrent && !isSwitching) {
        rightBadge = '<span style="display:inline-flex;align-items:center;gap:2px;font-size:' + rightBadgeFontSize + ';color:#059669;background:#d1fae5;padding:0.15em 0.5em;border-radius:8px;font-weight:600;flex-shrink:0">✓ 使用中</span>';
      } else if (isSwitching) {
        rightBadge = '<span class="fmgc-wb-item__switching-badge" style="font-size:' + rightBadgeFontSize + ';color:#2563eb;font-weight:600;flex-shrink:0">切换中</span><span class="fmgc-wb-spinner"></span>';
      } else if (isDisabled) {
        rightBadge = '<span style="font-size:' + rightBadgeFontSize + ';color:#9ca3af;flex-shrink:0">请稍候...</span>';
      } else if (isLocked) {
        // 未登录 vs 已登录非会员 — 不同引导文字
        var lockHint = _isLoggedIn() ? '🔒 开通会员' : '🔒 登录解锁';
        rightBadge = '<span style="display:inline-flex;align-items:center;gap:2px;font-size:' + rightBadgeFontSize + ';color:#92400e;background:#fef3c7;padding:0.15em 0.55em;border-radius:8px;font-weight:600;flex-shrink:0;border:1px solid #fde68a">' + lockHint + '</span>';
      }

      // 描述区 —— 移动端允许换行，桌面端单行截断
      var descStyle = isMobile
        ? 'font-size:0.88em;color:#6b7280;margin-top:0.25em;line-height:1.5;white-space:normal;word-break:break-word;'
        : 'font-size:0.82em;color:#6b7280;margin-top:0.15em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.35';

      // 名称 —— 移动端也允许必要时换行
      var nameStyle = isMobile
        ? 'font-weight:' + fontWeight + ';color:' + titleColor + ';display:flex;align-items:center;line-height:1.35;flex-wrap:wrap;gap:2px'
        : 'font-weight:' + fontWeight + ';color:' + titleColor + ';display:flex;align-items:center;line-height:1.3';

      var nameTextStyle = isMobile
        ? '' // 移动端允许换行
        : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

      item.innerHTML = [
        iconHtml,
        '<div style="flex:1;min-width:0;display:flex;align-items:center;gap:0.5em">',
        '  <div style="flex:1;min-width:0">',
        '    <div style="' + nameStyle + '">',
        '      <span style="' + nameTextStyle + '">' + escapeHtml(p.name || p.id) + '</span>' + tierChip,
        '    </div>',
        '    <div style="' + descStyle + '">' +
          escapeHtml(p.description || '') +
        '    </div>',
        '  </div>',
        '  ' + rightBadge,
        '</div>'
      ].join('');

      if (isSwitching) item.classList.add('is-switching');
      if (isDisabled) item.classList.add('is-disabled');
      if (isLocked) item.classList.add('is-locked');

      if (!isCurrent && !isDisabled && !isSwitching) {
        item.addEventListener('click', function () {
          if (isLocked) {
            // 通知父页面弹窗引导
            _requestPremiumAccess(p.id, p.name || p.id);
          } else {
            switchToProfile(p.id);
          }
        });
      }

      listEl.appendChild(item);
    });
  }

  // 通知父页面：用户尝试使用会员专享名称库
  function _requestPremiumAccess(profileId, profileName) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'FC_WORDBANK_ACCESS_DENIED',
        source: 'wordbank',
        payload: {
          profileId: profileId,
          profileName: profileName,
          isLoggedIn: _isLoggedIn(),
          isMember: _isMember()
        }
      }, window.__FMGC_GET_TARGET_ORIGIN__(window.parent));
    }
    // 同时给用户一个即时反馈
    var loadingEl = document.getElementById('wordbankLoading');
    if (loadingEl) {
      var hint = _isLoggedIn()
        ? '🔒 「' + profileName + '」为会员专享，正在为您打开升级页面...'
        : '🔒 「' + profileName + '」为会员专享，请先登录或开通会员';
      loadingEl.classList.remove('is-hidden');
      loadingEl.style.display = 'block';
      loadingEl.style.opacity = '1';
      loadingEl.textContent = hint;
      setTimeout(function () {
        loadingEl.classList.add('is-hidden');
        loadingEl.style.display = 'none';
      }, 2200);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ============================================================
  // 切换核心逻辑（分阶段进度）
  // ============================================================
  async function switchToProfile(profileId) {
    if (_isSwitching) {
      console.warn('[FMGC Switcher] 已有切换操作在进行中，忽略');
      return;
    }

    _isSwitching = true;
    _switchingProfileId = profileId;

    // 立即重渲染 —— 点击项高亮 + spinner + 其他项禁用
    var listEl = document.getElementById('wordbankList');
    if (listEl) renderProfileList(listEl, profilesCache);

    var loadingEl = document.getElementById('wordbankLoading');

    function setStage(text) {
      if (loadingEl) {
        loadingEl.classList.remove('is-hidden');
        loadingEl.style.display = 'block';
        loadingEl.style.opacity = '1';
        loadingEl.textContent = text;
      }
    }

    try {
      var profileDir = './i18n/wordbanks/' + profileId;

      // ── Stage 1: 加载词库数据 ──
      setStage('① 正在加载词库数据...');

      var manifestResp = await fetch(profileDir + '/manifest.json');
      if (!manifestResp.ok) throw new Error('manifest.json HTTP ' + manifestResp.status);
      var manifest = await manifestResp.json();

      var promises = ALL_KEYS.map(function (key) {
        return fetch(profileDir + '/' + key + '.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      });
      // 额外 fetch era.json（历法名称池，非必须）
      promises.push(
        fetch(profileDir + '/era.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
      );
      var allDatas = await Promise.all(promises);
      var typeDatas = allDatas.slice(0, ALL_KEYS.length);
      var eraData = allDatas[ALL_KEYS.length]; // 最后一个是 era.json

      var wordBanks = { _profile: profileId };
      var loadedCount = 0;
      for (var i = 0; i < ALL_KEYS.length; i++) {
        var key = ALL_KEYS[i];
        var data = typeDatas[i];
        if (data && data.b) {
          wordBanks[key] = { names: data.b, procedural: data.procedural || null };
          loadedCount++;
        } else {
          wordBanks[key] = { names: '', procedural: null };
        }
      }
      // 注入历法名称池
      if (eraData && Array.isArray(eraData.candidates) && eraData.candidates.length > 0) {
        wordBanks._era = eraData.candidates;
      }
      if (loadedCount === 0) throw new Error('词库数据为空！');

      // ── Stage 2: 注入新词库 ──
      setStage('② 正在注入新词库...');
      await new Promise(function (r) { setTimeout(r, 60); }); // 让 UI 有机会重绘

      var debug = window.__FMGC_NAMES_DEBUG__;
      if (!debug || typeof debug.loadProfile !== 'function') {
        throw new Error('FMGC Names loadProfile 接口不可用');
      }
      debug.loadProfile(wordBanks);
      currentProfile = profileId;

      // 同步更新 nameBases[0].name —— 文化编辑器下拉显示当前 profile 中文名
      try {
        if (typeof window.__FMGC_UPDATE_NAMEBASE_NAME__ === 'function') {
          window.__FMGC_UPDATE_NAMEBASE_NAME__(profileId);
        }
      } catch (e) {
        console.warn('[FMGC Switcher] 更新 nameBases 名称失败: ' + e.message);
      }

      // ── Stage 3: 重新生成地图（最耗时） ──
      var profileLabel = (manifest.name || manifest.description || profileId);
      setStage('③ 正在重新生成地图（' + profileLabel + '）...');

      // map:generated 是 FMG 真正完成地图生成的事件（比 regenerateMap await 更可靠，
      // 因为 regenerateMap 可能有 debounce 包装导致提前 resolve）
      var mapGeneratedPromise = new Promise(function (resolve) {
        var handler = function () {
          window.removeEventListener('map:generated', handler);
          resolve();
        };
        window.addEventListener('map:generated', handler, { once: true });
        // 20s 超时兜底 —— 防止事件不触发时卡死
        setTimeout(function () {
          window.removeEventListener('map:generated', handler);
          resolve();
        }, 20000);
      });

      if (typeof window.regenerateMap === 'function') {
        // FMG 2.0: 使用 window.regenerateMap（完整的重新生成入口）
        // 内部已包含：清理旧地图 → 生成新地图 → 重绘 SVG
        try {
          window.regenerateMap('wordbank switch: ' + profileId);
          await mapGeneratedPromise;
        } catch (genErr) {
          console.error('[FMGC Switcher] ❌ regenerateMap 失败:', genErr);
          throw new Error('地图生成失败: ' + genErr.message);
        }
      } else if (typeof window.generate === 'function') {
        // 旧版 FMG 1.x fallback（理论上不会再走到）
        if (typeof window.undraw === 'function') window.undraw();
        try {
          await window.generate();
        } catch (genErr) {
          console.error('[FMGC Switcher] ❌ generate 失败:', genErr);
          throw new Error('地图生成失败: ' + genErr.message);
        }
        if (typeof window.drawLayers === 'function') window.drawLayers();
      } else {
        throw new Error('FMG 重新生成入口不可用（regenerateMap / generate 均不存在）');
      }

      // ── Stage 4: 完成提示 ──
      setStage('✅ 已切换为「' + profileLabel + '」，地图重新生成完成');

      // 刷新列表选中态 + 取消全局禁用
      _isSwitching = false;
      _switchingProfileId = null;
      if (listEl) renderProfileList(listEl, profilesCache);

      // 1.2s 后自动隐藏 loading + 关闭弹窗
      setTimeout(function () {
        if (loadingEl) {
          loadingEl.classList.add('is-hidden');
          loadingEl.style.display = 'none';
        }
        closeWordbankDialog();
      }, 1200);
    } catch (err) {
      console.error('[FMGC Switcher] ❌ 切换失败:', err);
      setStage('❌ 切换失败: ' + err.message);
      _isSwitching = false;
      _switchingProfileId = null;
      if (listEl) renderProfileList(listEl, profilesCache);
    }
  }

  // ============================================================
  // 劫持 FMG 原生 NamesbaseEditor.open → 打开我们的名称库切换弹窗
  // 覆盖以下 3 个入口：
  //   1. FMG 工具栏按钮 #editNamesBaseButton (tools.js)
  //   2. 快捷键 Shift+N (hotkeys.js)
  //   3. 文化编辑器内的 Namesbase 按钮 (cultures-editor.js)
  // ============================================================
  function hijackNamesbaseEditor() {
    if (window.NamesbaseEditor && typeof window.NamesbaseEditor.open === 'function') {
      if (!window.NamesbaseEditor.open.__fmgcPatched) {
        var origOpen = window.NamesbaseEditor.open;
        window.NamesbaseEditor.open = function () {
          console.log('[FMGC Switcher] NamesbaseEditor.open() → 重定向到自定义名称库切换弹窗');
          openWordbankDialog();
        };
        window.NamesbaseEditor.open.__fmgcPatched = true;
        console.log('[FMGC Switcher] ✅ FMG NamesbaseEditor.open 已劫持');
      }
    } else {
      // 还没注册好，等 DOMContentLoaded 后重试一次
      document.addEventListener('DOMContentLoaded', function () {
        hijackNamesbaseEditor();
      }, { once: true });
    }
  }
  hijackNamesbaseEditor();

  // ============================================================
  // 注入隐藏滚动条样式 —— FMG 控制面板 + 名称库列表
  // 跨浏览器兼容：Webkit / Firefox / IE+Edge
  // 同时注入 jQuery UI dialog 移动端响应式样式
  // ============================================================
  (function injectHiddenScrollbarCSS() {
    var style = document.createElement('style');
    style.setAttribute('data-fmgc-scrollbar', 'hidden');
    style.textContent = [
      // FMG 主控制面板 —— 启用竖向滚动 + 隐藏滚动条
      '#options { max-height: calc(100vh - 80px); overflow-y: auto; }',
      '#options ::-webkit-scrollbar { width: 0; height: 0; }',
      '#options { scrollbar-width: none; }',           // Firefox
      '#options { -ms-overflow-style: none; }',         // IE + Edge Legacy

      // FMG 原生名称库编辑器面板
      '#namesbaseEditor ::-webkit-scrollbar { width: 0; height: 0; }',
      '#namesbaseEditor { scrollbar-width: none; }',
      '#namesbaseEditor { -ms-overflow-style: none; }',

      // 我们自定义的名称库切换弹窗列表
      '#wordbankList ::-webkit-scrollbar { width: 0; height: 0; }',
      '#wordbankList { scrollbar-width: none; }',
      '#wordbankList { -ms-overflow-style: none; }',

      // ========== jQuery UI Dialog 移动端 — 只改尺寸，不改配色 ==========
      '@media (max-width: 767px) {',
      '  .ui-dialog-titlebar-close {',
      '    width: 36px !important; height: 36px !important;',
      '    top: 12px !important; right: 12px !important;',
      '    padding: 0 !important; margin: 0 !important;',
      '    border-radius: 8px !important;',
      '  }',
      '  .ui-dialog-titlebar-close .ui-icon {',
      '    width: 20px !important; height: 20px !important;',
      '    margin: 8px !important;',
      '  }',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
    console.log('[FMGC Switcher] ✅ 隐藏滚动条 + Dialog 响应式样式已注入');
  })();

  // 暴露全局（调试用）
  window.__FMGC_WORDBANK_SWITCHER__ = {
    switchToProfile: switchToProfile,
    getCurrentProfile: function () { return currentProfile; },
    listProfiles: function () { return profilesCache || []; },
    openDialog: openWordbankDialog
  };
})();

