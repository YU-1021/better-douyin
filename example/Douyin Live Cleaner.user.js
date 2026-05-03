// ==UserScript==
// @name         Douyin Live Cleaner
// @namespace    https://live.douyin.com/
// @version      0.3
// @description  精简抖音直播页面干扰元素，支持悬停弹幕一键+1/复制，并可自动最高画质与网页全屏。
// @author       Codex
// @match        https://live.douyin.com/*
// @match        https://www.douyin.com/*
// @run-at       document-idle
// @grant        none
// @license		 MIT
// @downloadURL https://update.greasyfork.org/scripts/570262/Douyin%20Live%20Cleaner.user.js
// @updateURL https://update.greasyfork.org/scripts/570262/Douyin%20Live%20Cleaner.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const HIDE_ATTR = 'data-dy-clean-hidden';
  const SAFE_ATTR = 'data-dy-clean-safe';
  const UI_ATTR = 'data-dy-clean-ui';
  const CHAT_BADGE_STYLE_ATTR = 'data-dy-clean-chat-badges';
  const CHAT_BADGE_ROW_MARK_ATTR = 'data-dy-clean-chat-badge-row';
  const CHAT_CONTENT_MARK_ATTR = 'data-dy-clean-chat-content';
  const CHAT_NICKNAME_MARK_ATTR = 'data-dy-clean-chat-nickname';

  const state = {
    enabled: true,
    panelVisible: true,
    hiddenCount: 0,
    mainMediaRect: null,
    modules: {},
    settingsLoaded: false,
    scanTimer: 0,
    observer: null,
    uiBound: false,
    roomKey: '',
    lastPlayerWakeAt: 0,
    lastBestQualityAttemptAt: 0,
    lastWebFullscreenAttemptAt: 0,
    autoBestQualityDone: false,
    autoWebFullscreenDone: false,
    chatReplay: {
      actionHost: null,
      button: null,
      copyButton: null,
      sourceArea: null,
      sourceList: null,
      lockTop: -1,
      lockRaf: 0,
      resumeTimer: 0,
      pointerX: -1,
      pointerY: -1,
      activeText: '',
      activeContentKey: '',
      activeContentElement: null,
    },
  };

  const SAFE_TEXT_PATTERNS = [
    /说点什么/,
    /发送/,
    /聊天/,
    /公告/,
  ];

  const GIFT_BAR_PATTERNS = [
    /礼物/,
    /送礼/,
    /赠送/,
    /说点什么/,
    /发送/,
    /表情/,
    /福袋/,
    /红包/,
    /粉丝团/,
    /灯牌/,
    /守护/,
  ];

  const CHAT_JOIN_NOTICE_PATTERN = /(?:加入|进入)了直播间/;
  const CHAT_BOTTOM_NOTICE_PATTERN = /(?:来了|为主播点赞了)$/;
  const CHAT_BOTTOM_NOTICE_SELECTOR =
    '[class*="webcast-chatroom___bottom-message"], [class*="webcast-chatroom___bottom_message"]';
  const CHAT_NOTICE_REASONS = new Set(['chat-join-notice', 'chat-bottom-notice']);
  const CHAT_BADGE_REASONS = new Set(['chat-badge']);
  const CHAT_TEXT_CONTENT_SELECTOR =
    `[${CHAT_CONTENT_MARK_ATTR}], .webcast-chatroom___content-with-emoji-text, [class*="webcast-chatroom___content-with-emoji-text"]`;
  const CHAT_MESSAGE_ITEM_SELECTOR = '.webcast-chatroom___item';
  const CHAT_NICKNAME_SELECTOR =
    '.webcast-chatroom___nickname, [class*="webcast-chatroom___nickname"]';
  const CHAT_NICKNAME_BADGE_SELECTOR =
    '.webcast-chatroom___badge, [class*="webcast-chatroom___badge"]';
  const CHAT_DISPLAY_TEXT_SELECTOR =
    '.webcast-chatroom___display-text, [class*="webcast-chatroom___display-text"]';
  const CHAT_REPLAY_LIST_SELECTOR =
    '.webcast-chatroom___list, [class*="webcast-chatroom___list"]';
  const CHAT_UNREAD_SELECTOR =
    '.webcast-chatroom___unread, [class*="webcast-chatroom___unread"]';
  const CHAT_FOLD_SELECTOR = '[class*="chat_room_fold"]';
  const CHAT_REPLAY_TEXT_MAX_LENGTH = 120;
  const TOP_WIDGET_TOOLTIP_PATTERN =
    /(?:帮主播完成心愿吧|心愿|差\d+个完成).*(?:赠送|送\d+个|\d+钻)|(?:赠送|送\d+个|\d+钻).*(?:帮主播完成心愿吧|心愿|差\d+个完成)/;

  const SETTINGS_STORAGE_KEY = 'dy-live-cleaner-settings';

  const MODULE_CONFIGS = [
    {
      id: 'giftBar',
      title: '礼物区域',
      description: '统一控制底部礼物栏、礼物托盘和礼物菜单层',
    },
    {
      id: 'topWidgets',
      title: '右上角广告/榜单',
      description: '统一隐藏展开按钮左侧的广告位、集结位和榜单入口',
    },
    {
      id: 'productButton',
      title: '全部商品按钮',
      description: '隐藏悬浮在直播视频上的“全部商品”按钮',
    },
    {
      id: 'chatNotices',
      title: '入场/点赞提示',
      description: '隐藏弹幕区顶部“加入直播间”和底部“来了/点赞了”提示',
    },
    {
      id: 'chatBadges',
      title: '昵称前等级牌',
      description: '隐藏弹幕区用户名左侧的等级和粉丝团徽章',
    },
    {
      id: 'autoBestQuality',
      title: '自动最高画质',
      description: '自动展开画质列表并选择当前列表第一项',
    },
    {
      id: 'autoWebFullscreen',
      title: '自动网页全屏',
      description: '自动展开播放器并切到网页全屏',
    },
    {
      id: 'hoverPlusOne',
      title: '悬停弹幕+1',
      description: '鼠标移入弹幕时冻结列表，并支持一键填充输入框',
    },
  ];

  const HIDE_MODULE_IDS = new Set(['giftBar', 'topWidgets', 'productButton', 'chatNotices', 'chatBadges']);

  const DEFAULT_SETTINGS = {
    enabled: true,
    panelVisible: true,
    modules: {
      giftBar: true,
      topWidgets: true,
      productButton: true,
      chatNotices: true,
      chatBadges: true,
      autoBestQuality: true,
      autoWebFullscreen: true,
      hoverPlusOne: true,
    },
  };

  const EXPLICIT_SAFE_SELECTORS = [
    '#room_info_bar',
    '[data-e2e="fullscreen-back"]',
    '[data-e2e="rooom-info-bar-anchor"]',
    '[data-e2e="live-followbutton"]',
    '[class*="douyin-player-controls"]',
    '[class*="douyin-player-popup"]',
    '[class*="douyin-player-tooltips"]',
    '[class*="douyin-player-icon"]',
    '[data-e2e="quality"]',
    '[data-e2e="quality-selector"]',
    '[data-e2e="xgplayer-page-full-screen"]',
    '.xgplayer-page-full-screen',
    '#RightPanelLayout',
    '#chatInput',
    '[data-e2e="live-chatting"]',
    '[class*="webcast-chatroom"]',
    CHAT_FOLD_SELECTOR,
    '#DanmakuLayout',
    '.CanvasDanmakuPlugin',
    '#PlayerControlLayout',
  ];

  const MODULE_HIDE_SELECTORS = {
    giftBar: [
      '#BottomLayout',
      '#GiftTrayLayout',
      '#GiftMenuLayout',
      '[data-e2e="gifts-container"]',
      '#giftPanelEntrance',
      '[data-e2e="gift-btn"]',
    ],
    topWidgets: [
      '[data-e2e="hour-rank-entrance"]',
      '[data-e2e="exhibition-banner"]',
      'iframe[src*="live_pc_indicator_container_douyin/pages/index.html"]',
    ],
    productButton: [
      '[data-e2e="yellowCart-container"]',
    ],
  };

  const SAFE_SELECTOR_GROUP = EXPLICIT_SAFE_SELECTORS.join(', ');
  const HIDE_SELECTOR_GROUPS = Object.fromEntries(
    Object.entries(MODULE_HIDE_SELECTORS).map(([key, selectors]) => [key, selectors.join(', ')]),
  );
  const MODULE_HIDE_REASONS = {
    giftBar: new Set(['explicit-giftBar', 'matched']),
    topWidgets: new Set(['explicit-topWidgets', 'indicator-match', 'chat-fold-sibling', 'top-widget-tooltip']),
    productButton: new Set(['explicit-productButton']),
    chatNotices: CHAT_NOTICE_REASONS,
    chatBadges: CHAT_BADGE_REASONS,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const modules = parsed.modules || {};
      const resolveModule = (moduleId) => {
        if (typeof modules[moduleId] === 'boolean') {
          return modules[moduleId];
        }

        if (moduleId === 'giftBar') {
          const bottomGiftBar =
            typeof modules.bottomGiftBar === 'boolean'
              ? modules.bottomGiftBar
              : DEFAULT_SETTINGS.modules.giftBar;
          const giftLayers =
            typeof modules.giftLayers === 'boolean' ? modules.giftLayers : bottomGiftBar;

          return bottomGiftBar && giftLayers;
        }

        if (moduleId === 'topWidgets') {
          const rankEntry =
            typeof modules.rankEntry === 'boolean'
              ? modules.rankEntry
              : DEFAULT_SETTINGS.modules.topWidgets;
          const topBanner =
            typeof modules.topBanner === 'boolean' ? modules.topBanner : rankEntry;

          return rankEntry && topBanner;
        }

        return DEFAULT_SETTINGS.modules[moduleId];
      };

      return {
        enabled:
          typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        panelVisible:
          typeof parsed.panelVisible === 'boolean'
            ? parsed.panelVisible
            : DEFAULT_SETTINGS.panelVisible,
        modules: Object.fromEntries(
          MODULE_CONFIGS.map((module) => [
            module.id,
            resolveModule(module.id),
          ]),
        ),
      };
    } catch (_error) {
      return {
        enabled: DEFAULT_SETTINGS.enabled,
        panelVisible: DEFAULT_SETTINGS.panelVisible,
        modules: { ...DEFAULT_SETTINGS.modules },
      };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          enabled: state.enabled,
          panelVisible: state.panelVisible,
          modules: state.modules,
        }),
      );
    } catch (_error) {
      // ignore storage failures
    }
  }

  function hydrateSettings() {
    if (state.settingsLoaded) {
      return;
    }

    const settings = loadSettings();
    state.enabled = settings.enabled;
    state.panelVisible = settings.panelVisible;
    state.modules = settings.modules;
    state.settingsLoaded = true;
  }

  function isModuleEnabled(moduleId) {
    return state.modules[moduleId] !== false;
  }

  function isHideModule(moduleId) {
    return HIDE_MODULE_IDS.has(moduleId);
  }

  function resetAutomationState(moduleId = '') {
    if (!moduleId || moduleId === 'autoBestQuality') {
      state.lastBestQualityAttemptAt = 0;
      state.autoBestQualityDone = false;
    }

    if (!moduleId || moduleId === 'autoWebFullscreen') {
      state.lastWebFullscreenAttemptAt = 0;
      state.autoWebFullscreenDone = false;
    }
  }

  function syncRoomContext() {
    let nextRoomKey = '';

    if (location.host === 'live.douyin.com') {
      nextRoomKey = location.pathname;
    } else if (location.host === 'www.douyin.com') {
      const match = location.pathname.match(/^\/follow\/live\/[^/?#]+/);
      nextRoomKey = match ? match[0] : '';
    }

    if (state.roomKey === nextRoomKey) {
      return;
    }

    const hadRoomContext = Boolean(state.roomKey);
    state.roomKey = nextRoomKey;
    syncStyleState();
    resetAutomationState();
    closeChatReplayOverlay();

    if (!nextRoomKey && hadRoomContext) {
      revealAll();
    }
  }

  function setCleanerEnabled(nextValue) {
    state.enabled = nextValue;
    syncStyleState();
    resetAutomationState();
    saveSettings();

    if (!state.enabled) {
      if (state.chatReplay.sourceList) {
        resumeChatReplayList();
      } else {
        closeChatReplayOverlay();
      }
      revealAll();
    } else {
      scheduleScan(document.body);
    }

    updateUi();
  }

  function setPanelVisible(nextValue) {
    state.panelVisible = nextValue;
    saveSettings();
    updateUi();
  }

  function setModuleEnabled(moduleId, nextValue) {
    state.modules[moduleId] = nextValue;
    syncStyleState();
    resetAutomationState(moduleId);
    saveSettings();

    if (moduleId === 'hoverPlusOne' && !nextValue) {
      if (state.chatReplay.sourceList) {
        resumeChatReplayList();
      } else {
        closeChatReplayOverlay();
      }
    }

    if (isHideModule(moduleId) && !nextValue) {
      revealModuleHides(moduleId);
    }

    if (state.enabled) {
      scheduleScan(document.body);
    } else {
      updateUi();
    }
  }

  function disableAutomationModuleByUser(moduleId) {
    if (!state.enabled || !isModuleEnabled(moduleId)) {
      return false;
    }

    setModuleEnabled(moduleId, false);
    return true;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function syncStyleState() {
    if (!(document.documentElement instanceof HTMLElement)) {
      return;
    }

    document.documentElement.toggleAttribute(
      CHAT_BADGE_STYLE_ATTR,
      state.enabled && isModuleEnabled('chatBadges') && Boolean(state.roomKey),
    );
  }

  function getTextBundle(element) {
    const parts = [
      element.innerText,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('placeholder'),
      element.getAttribute('alt'),
    ];

    return normalizeText(parts.filter(Boolean).join(' '));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') <= 0.02
    ) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  function markSafe(element, reason, depth = 6) {
    let current = element;
    let remaining = depth;

    while (current && current !== document.body && remaining > 0) {
      if (!current.hasAttribute(SAFE_ATTR)) {
        current.setAttribute(SAFE_ATTR, reason);
      }
      current = current.parentElement;
      remaining -= 1;
    }
  }

  function updateMainMediaRect() {
    let rect = null;
    let maxArea = 0;

    document.querySelectorAll('video, canvas').forEach((node) => {
      if (!isVisible(node)) {
        return;
      }

      const currentRect = node.getBoundingClientRect();
      const area = currentRect.width * currentRect.height;

      if (
        currentRect.width >= Math.max(220, window.innerWidth * 0.18) &&
        currentRect.height >= Math.max(140, window.innerHeight * 0.18) &&
        area > maxArea
      ) {
        maxArea = area;
        rect = currentRect;
      }
    });

    state.mainMediaRect = rect;
  }

  function detectSafeZones() {
    updateMainMediaRect();

    document.querySelectorAll(SAFE_SELECTOR_GROUP).forEach((node) => {
      markSafe(node, 'explicit-safe', 24);
    });

    document.querySelectorAll('video, canvas').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width >= window.innerWidth * 0.2 && rect.height >= window.innerHeight * 0.2) {
        markSafe(node, 'media', 1);
      }
    });

    document
      .querySelectorAll('input, textarea, [contenteditable="true"]')
      .forEach((node) => {
        const text = getTextBundle(node);
        if (SAFE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
          markSafe(node, 'chat-input', 2);
        }
      });
  }

  function containsMedia(element) {
    return Boolean(element.querySelector('video, canvas'));
  }

  function isUserScriptUi(element) {
    return Boolean(element.closest(`[${UI_ATTR}]`));
  }

  function matchesSelectorGroup(element, selectorGroup) {
    if (!selectorGroup) {
      return false;
    }

    try {
      return Boolean(element.closest(selectorGroup));
    } catch (_error) {
      return false;
    }
  }

  function isExplicitSafeElement(element) {
    return matchesSelectorGroup(element, SAFE_SELECTOR_GROUP);
  }

  function isExplicitHideElement(element) {
    return Object.entries(HIDE_SELECTOR_GROUPS).some(
      ([moduleId, selectorGroup]) => isModuleEnabled(moduleId) && matchesSelectorGroup(element, selectorGroup),
    );
  }

  function findCompactNoticeContainer(element, stopNode) {
    const baseText = getTextBundle(element);
    let target = element;
    let current = element.parentElement;

    while (current && current !== stopNode && current !== document.body) {
      const currentText = getTextBundle(current);
      if (
        !currentText ||
        !currentText.includes(baseText) ||
        currentText.length > baseText.length + 24 ||
        current.querySelector('#chatInput, [data-e2e="live-chatting"]')
      ) {
        break;
      }

      target = current;
      current = current.parentElement;
    }

    return target;
  }

  function isChatJoinNoticeElement(element) {
    if (!(element instanceof HTMLElement) || !element.closest('#chatroom')) {
      return false;
    }

    const text = getTextBundle(element);
    const rect = element.getBoundingClientRect();
    if (
      !CHAT_JOIN_NOTICE_PATTERN.test(text) ||
      text.length > 96 ||
      rect.height <= 0 ||
      rect.height > 72 ||
      element.closest(CHAT_BOTTOM_NOTICE_SELECTOR) ||
      element.querySelector(`#chatInput, [data-e2e="live-chatting"], ${CHAT_REPLAY_LIST_SELECTOR}`)
    ) {
      return false;
    }

    return true;
  }

  function isChatBottomNoticeContainer(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const container = element.matches(CHAT_BOTTOM_NOTICE_SELECTOR)
      ? element
      : element.closest(CHAT_BOTTOM_NOTICE_SELECTOR);
    if (!(container instanceof HTMLElement)) {
      return false;
    }

    const text = getTextBundle(container);
    return CHAT_BOTTOM_NOTICE_PATTERN.test(text);
  }

  function isChatReplayEnabled() {
    return state.enabled && isModuleEnabled('hoverPlusOne') && Boolean(state.roomKey);
  }

  function clearChatReplayActiveContent() {
    const replay = state.chatReplay;
    if (replay.activeContentElement instanceof HTMLElement) {
      replay.activeContentElement.removeAttribute('data-dy-clean-replay-active');
    }

    replay.activeContentElement = null;
    replay.activeContentKey = '';
  }

  function cancelChatReplayResume() {
    window.clearTimeout(state.chatReplay.resumeTimer || 0);
    state.chatReplay.resumeTimer = 0;
  }

  function cancelChatReplayScrollLock() {
    window.cancelAnimationFrame(state.chatReplay.lockRaf || 0);
    state.chatReplay.lockRaf = 0;
  }

  function removeChatReplayUiNodes() {
    document
      .querySelectorAll(
        `[${UI_ATTR}="chat-replay-actions"], [${UI_ATTR}="chat-replay-plus"], [${UI_ATTR}="chat-replay-copy"]`,
      )
      .forEach((node) => {
        node.remove();
      });

    state.chatReplay.actionHost = null;
    state.chatReplay.button = null;
    state.chatReplay.copyButton = null;
  }

  function hideChatReplayButton() {
    const replay = state.chatReplay;
    clearChatReplayActiveContent();
    replay.activeText = '';

    if (replay.actionHost instanceof HTMLElement) {
      replay.actionHost.hidden = true;
    }
  }

  function closeChatReplayOverlay() {
    const replay = state.chatReplay;
    cancelChatReplayResume();
    cancelChatReplayScrollLock();
    clearChatReplayActiveContent();
    replay.activeText = '';
    removeChatReplayUiNodes();
    replay.lockTop = -1;
    replay.pointerX = -1;
    replay.pointerY = -1;
    replay.sourceArea = null;
    replay.sourceList = null;
  }

  function getChatReplayListFromElement(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const directList = element.closest(CHAT_REPLAY_LIST_SELECTOR);
    if (directList instanceof HTMLElement) {
      return directList;
    }

    let current = getChatReplayMessageItem(element)?.parentElement || element.parentElement;
    while (current && current !== document.body) {
      if (
        current instanceof HTMLElement &&
        current.closest('#chatroom') &&
        current.querySelector('[data-index]')
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function getChatReplayMessageItem(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const item = element.closest(CHAT_MESSAGE_ITEM_SELECTOR);
    return item instanceof HTMLElement ? item : null;
  }

  function getChatReplayContentElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const item = getChatReplayMessageItem(element);
    const primaryContent = getPrimaryChatContentElement(item);
    if (
      primaryContent instanceof HTMLElement &&
      (primaryContent === element || primaryContent.contains(element))
    ) {
      return primaryContent;
    }

    const directContent = element.closest(CHAT_TEXT_CONTENT_SELECTOR);
    return directContent instanceof HTMLElement ? directContent : null;
  }

  function getChatReplayText(item) {
    if (!(item instanceof HTMLElement)) {
      return '';
    }

    if (
      item.closest(CHAT_BOTTOM_NOTICE_SELECTOR) ||
      item.closest('[data-dy-clean-hidden="chat-bottom-notice"]')
    ) {
      return '';
    }

    const content = getPrimaryChatContentElement(item);
    if (!(content instanceof HTMLElement)) {
      return '';
    }

    const itemText = normalizeText(getTextBundle(item));
    const contentText = normalizeText(getTextBundle(content));
    if (!contentText || contentText.length > CHAT_REPLAY_TEXT_MAX_LENGTH) {
      return '';
    }

    if (
      CHAT_BOTTOM_NOTICE_PATTERN.test(contentText) ||
      CHAT_JOIN_NOTICE_PATTERN.test(itemText) ||
      /为主播点赞了/.test(itemText) ||
      /送出了/.test(itemText)
    ) {
      return '';
    }

    return contentText;
  }

  function findChatReplayScrollContainer(list) {
    if (!(list instanceof HTMLElement)) {
      return null;
    }

    const candidates = [list];
    let current = list.parentElement;

    while (current && current !== document.body) {
      if (!current.closest('#chatroom')) {
        break;
      }

      candidates.push(current);
      current = current.parentElement;
    }

    let fallback = null;

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || !isVisible(candidate)) {
        continue;
      }

      const style = window.getComputedStyle(candidate);
      const allowsScroll =
        /auto|scroll/.test(style.overflowY || '') ||
        /auto|scroll/.test(style.overflow || '') ||
        candidate.scrollHeight > candidate.clientHeight + 4;

      if (!allowsScroll) {
        continue;
      }

      if (!fallback) {
        fallback = candidate;
      }

      const previousTop = candidate.scrollTop;
      candidate.scrollTop = previousTop + 1;
      const didScroll = candidate.scrollTop !== previousTop;
      candidate.scrollTop = previousTop;

      if (didScroll) {
        return candidate;
      }
    }

    return fallback;
  }

  function getChatReplayContentKey(content, text) {
    if (!(content instanceof HTMLElement)) {
      return normalizeText(text);
    }

    const indexHost = content.closest('[data-index]');
    const dataIndex = indexHost instanceof HTMLElement ? indexHost.getAttribute('data-index') : '';
    return `${dataIndex || ''}|${normalizeText(text)}`;
  }

  function ensureChatReplayPaused(content) {
    const list = getChatReplayListFromElement(content);
    const container = findChatReplayScrollContainer(list);
    if (!(container instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return false;
    }

    if (
      state.chatReplay.sourceList instanceof HTMLElement &&
      state.chatReplay.sourceList !== container
    ) {
      resumeChatReplayList();
    }

    if (state.chatReplay.sourceList !== container) {
      state.chatReplay.sourceList = container;
    }
    state.chatReplay.sourceArea = list;

    if (container.scrollHeight > container.clientHeight + 4) {
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nearBottom = maxTop - container.scrollTop <= 6;
      state.chatReplay.lockTop = nearBottom
        ? Math.max(0, maxTop - 1)
        : Math.max(0, container.scrollTop);
      container.scrollTop = state.chatReplay.lockTop;
    }

    cancelChatReplayScrollLock();
    state.chatReplay.lockRaf = window.requestAnimationFrame(function lockChatReplayScroll() {
      const replay = state.chatReplay;
      if (replay.sourceList !== container || !(container instanceof HTMLElement)) {
        return;
      }

      if (Math.abs(container.scrollTop - replay.lockTop) > 1) {
        container.scrollTop = replay.lockTop;
      }

      replay.lockRaf = window.requestAnimationFrame(lockChatReplayScroll);
    });
    cancelChatReplayResume();
    return true;
  }

  function positionChatReplayButton(content) {
    const actionHost = ensureChatReplayActionHost();
    const button = ensureChatReplayButton();
    const copyButton = ensureChatReplayCopyButton();
    if (
      !(actionHost instanceof HTMLElement) ||
      !(button instanceof HTMLButtonElement) ||
      !(copyButton instanceof HTMLButtonElement) ||
      !(content instanceof HTMLElement)
    ) {
      return;
    }

    actionHost.hidden = false;
    const anchorRect = content.getBoundingClientRect();
    const hostWidth = actionHost.offsetWidth || 108;
    const hostHeight = actionHost.offsetHeight || 28;
    const pointerX = state.chatReplay.pointerX;
    let left = pointerX >= 0 ? pointerX - hostWidth / 2 : anchorRect.left + 6;
    const contentMinLeft = Math.round(anchorRect.left);
    const contentMaxLeft = Math.round(anchorRect.right - hostWidth);
    if (contentMaxLeft >= contentMinLeft) {
      left = Math.max(contentMinLeft, Math.min(left, contentMaxLeft));
    } else {
      left = contentMinLeft;
    }

    let top = anchorRect.top - hostHeight + 2;
    left = Math.max(6, Math.min(left, window.innerWidth - hostWidth - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - hostHeight - 6));

    actionHost.style.left = `${Math.round(left)}px`;
    actionHost.style.top = `${Math.round(top)}px`;
  }

  function isPointInsideElementRect(element, clientX, clientY, padding = 0) {
    if (!(element instanceof HTMLElement) || element.hidden) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return (
      clientX >= rect.left - padding &&
      clientX <= rect.right + padding &&
      clientY >= rect.top - padding &&
      clientY <= rect.bottom + padding
    );
  }

  function setActiveChatReplayContent(content, nextText = '') {
    if (!(content instanceof HTMLElement)) {
      hideChatReplayButton();
      return false;
    }

    const item = getChatReplayMessageItem(content);
    const text = normalizeText(nextText || getChatReplayText(item));
    if (!text) {
      hideChatReplayButton();
      return false;
    }

    const replay = state.chatReplay;
    const nextKey = getChatReplayContentKey(content, text);
    const shouldReposition =
      replay.activeContentElement !== content ||
      replay.activeContentKey !== nextKey ||
      !(replay.button instanceof HTMLButtonElement) ||
      replay.button.hidden;

    if (replay.activeContentElement !== content) {
      clearChatReplayActiveContent();
      content.setAttribute('data-dy-clean-replay-active', 'true');
      replay.activeContentElement = content;
    }

    replay.activeContentKey = nextKey;
    replay.activeText = text;
    if (shouldReposition) {
      positionChatReplayButton(content);
    }
    return true;
  }

  function ensureChatReplayActionHost() {
    const replay = state.chatReplay;
    if (replay.actionHost instanceof HTMLElement && replay.actionHost.isConnected) {
      return replay.actionHost;
    }

    const host = document.createElement('div');
    host.setAttribute(UI_ATTR, 'chat-replay-actions');
    host.hidden = true;
    document.body.appendChild(host);

    host.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    host.addEventListener('pointerenter', () => {
      cancelChatReplayResume();
    });

    host.addEventListener('pointerleave', (event) => {
      if (
        event.relatedTarget instanceof Node &&
        state.chatReplay.activeContentElement instanceof HTMLElement &&
        state.chatReplay.activeContentElement.contains(event.relatedTarget)
      ) {
        cancelChatReplayResume();
        return;
      }

      resumeChatReplayList();
    });

    replay.actionHost = host;
    return host;
  }

  function ensureChatReplayButton() {
    const replay = state.chatReplay;
    if (replay.button instanceof HTMLButtonElement && replay.button.isConnected) {
      return replay.button;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(UI_ATTR, 'chat-replay-plus');
    button.textContent = '+1';
    ensureChatReplayActionHost().appendChild(button);

    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (fillChatInputWithReplayText(state.chatReplay.activeText)) {
        resumeChatReplayList();
      }
    });

    replay.button = button;
    return button;
  }

  function ensureChatReplayCopyButton() {
    const replay = state.chatReplay;
    if (replay.copyButton instanceof HTMLButtonElement && replay.copyButton.isConnected) {
      return replay.copyButton;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(UI_ATTR, 'chat-replay-copy');
    button.textContent = '复制';
    ensureChatReplayActionHost().appendChild(button);

    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      copyTextToClipboard(state.chatReplay.activeText).then((copied) => {
        if (copied) {
          resumeChatReplayList();
        }
      });
    });

    replay.copyButton = button;
    return button;
  }

  function fallbackCopyTextToClipboard(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = normalized;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_error) {
      copied = false;
    }

    textarea.remove();
    return copied;
  }

  async function copyTextToClipboard(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (_error) {
        // fall through
      }
    }

    return fallbackCopyTextToClipboard(normalized);
  }

  function resumeChatReplayList() {
    const replay = state.chatReplay;
    cancelChatReplayResume();
    cancelChatReplayScrollLock();

    const container = replay.sourceList;
    const unreadTip =
      container instanceof HTMLElement && container.parentElement
        ? container.parentElement.querySelector(
            CHAT_UNREAD_SELECTOR,
          )
        : null;

    closeChatReplayOverlay();

    if (container instanceof HTMLElement) {
      try {
        if (unreadTip instanceof HTMLElement && isVisible(unreadTip)) {
          if (!invokeReactClick(unreadTip)) {
            clickElement(unreadTip);
          }
        } else {
          container.scrollTop = container.scrollHeight;
        }
      } catch (_error) {
        // keep overlay closed even if Douyin changed resume behavior
      }
    }
  }

  function openChatReplayOverlay(content) {
    if (!isChatReplayEnabled() || !(content instanceof HTMLElement) || content.closest(`[${UI_ATTR}]`)) {
      return false;
    }

    const item = getChatReplayMessageItem(content);
    const text = normalizeText(getChatReplayText(item));
    if (!text) {
      if (state.chatReplay.sourceList) {
        hideChatReplayButton();
      }
      return false;
    }

    if (!ensureChatReplayPaused(content)) {
      resumeChatReplayList();
      return false;
    }

    return setActiveChatReplayContent(content, text);
  }

  function getChatEditableElement() {
    const chatInput = document.querySelector('#chatInput');
    if (!(chatInput instanceof HTMLElement)) {
      return null;
    }

    const editable = chatInput.querySelector('[data-e2e="live-chatting"] [contenteditable="true"]');
    return editable instanceof HTMLElement ? editable : null;
  }

  function selectElementContents(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function dispatchChatEditorEvent(target, type, data = '') {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    try {
      target.dispatchEvent(
        new InputEvent(type, {
          bubbles: true,
          cancelable: type === 'beforeinput',
          composed: true,
          data,
          inputType: 'insertText',
        }),
      );
    } catch (_error) {
      target.dispatchEvent(
        new Event(type, {
          bubbles: true,
          cancelable: type === 'beforeinput',
        }),
      );
    }
  }

  function fillChatInputWithReplayText(text) {
    const normalized = normalizeText(text);
    const inputBox = document.querySelector('#chatInput [data-e2e="live-chatting"]');
    const editable = getChatEditableElement();
    if (!(editable instanceof HTMLElement) || !normalized) {
      return false;
    }

    if (inputBox instanceof HTMLElement) {
      if (!invokeReactClick(inputBox)) {
        clickElement(inputBox);
      }
    }

    editable.focus();
    selectElementContents(editable);
    dispatchChatEditorEvent(editable, 'beforeinput', normalized);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, normalized);
    } catch (_error) {
      inserted = false;
    }

    if (!inserted) {
      try {
        inserted = document.execCommand('insertHTML', false, escapeHtml(normalized));
      } catch (_error) {
        inserted = false;
      }
    }

    if (!inserted) {
      editable.textContent = normalized;
    }

    dispatchChatEditorEvent(editable, 'input', normalized);
    if (inputBox instanceof HTMLElement) {
      dispatchChatEditorEvent(inputBox, 'input', normalized);
    }
    editable.dispatchEvent(new Event('change', { bubbles: true }));
    editable.focus();

    const selection = window.getSelection();
    if (selection && selection.rangeCount >= 1) {
      selection.collapseToEnd();
    }

    return true;
  }
  function scheduleChatReplayResume(delay = 0) {
    cancelChatReplayResume();
    state.chatReplay.resumeTimer = window.setTimeout(() => {
      resumeChatReplayList();
    }, delay);
  }

  function isFoldSiblingElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    let current = element;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) {
        return false;
      }

      const fold = Array.from(parent.children).find(
        (node) => node instanceof HTMLElement && node.matches(CHAT_FOLD_SELECTOR),
      );

      if (fold instanceof HTMLElement) {
        let sibling = fold.previousElementSibling;
        while (sibling) {
          if (sibling === current || sibling.contains(current)) {
            return true;
          }
          sibling = sibling.previousElementSibling;
        }
      }

      current = parent;
    }

    return false;
  }

  function hasProtectedDescendant(element) {
    try {
      return Boolean(element.querySelector(`[${SAFE_ATTR}]`));
    } catch (_error) {
      return false;
    }
  }

  function shouldSkip(element) {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    if (element.hasAttribute(UI_ATTR) || isUserScriptUi(element)) {
      return true;
    }

    const tag = element.tagName;
    if (
      tag === 'HTML' ||
      tag === 'BODY' ||
      tag === 'SCRIPT' ||
      tag === 'STYLE' ||
      tag === 'LINK' ||
      tag === 'META' ||
      tag === 'VIDEO' ||
      tag === 'CANVAS'
    ) {
      return true;
    }

    if (!isVisible(element)) {
      return true;
    }

    return false;
  }

  function getOverlapRatio(rect, mediaRect) {
    if (!mediaRect) {
      return 0;
    }

    const width = Math.max(0, Math.min(rect.right, mediaRect.right) - Math.max(rect.left, mediaRect.left));
    const height = Math.max(0, Math.min(rect.bottom, mediaRect.bottom) - Math.max(rect.top, mediaRect.top));
    const overlapArea = width * height;
    const ownArea = rect.width * rect.height;

    if (overlapArea <= 0 || ownArea <= 0) {
      return 0;
    }

    return overlapArea / ownArea;
  }

  function isVideoBottomOverlay(element) {
    const mediaRect = state.mainMediaRect;
    if (!mediaRect) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < 100 ||
      rect.height < 28 ||
      rect.height > mediaRect.height * 0.34 ||
      rect.top < mediaRect.top + mediaRect.height * 0.48 ||
      rect.bottom > mediaRect.bottom + 24
    ) {
      return false;
    }

    const overlapRatio = getOverlapRatio(rect, mediaRect);
    if (overlapRatio < 0.58) {
      return false;
    }

    const text = getTextBundle(element).slice(0, 240);
    const buttonCount = element.querySelectorAll('button, [role="button"]').length;
    const iconCount = element.querySelectorAll('img, svg').length;
    const inputCount = element.querySelectorAll('input, textarea, [contenteditable="true"]').length;
    const hintMatches = GIFT_BAR_PATTERNS.filter((pattern) => pattern.test(text)).length;
    const bottomGap = Math.abs(mediaRect.bottom - rect.bottom);

    if (hintMatches >= 1) {
      return true;
    }

    if (inputCount >= 1 && (buttonCount + iconCount) >= 2 && rect.height <= 120) {
      return true;
    }

    if (
      bottomGap <= 20 &&
      rect.height <= 110 &&
      rect.width >= mediaRect.width * 0.35 &&
      rect.width <= mediaRect.width * 0.98 &&
      (buttonCount + iconCount) >= 4
    ) {
      return true;
    }

    return false;
  }

  function shouldHide(element) {
    if (isExplicitSafeElement(element)) {
      return false;
    }

    if (!isModuleEnabled('giftBar') && matchesSelectorGroup(element, HIDE_SELECTOR_GROUPS.giftBar)) {
      return false;
    }

    if (
      !isModuleEnabled('topWidgets') &&
      (matchesSelectorGroup(element, HIDE_SELECTOR_GROUPS.topWidgets) || isFoldSiblingElement(element))
    ) {
      return false;
    }

    if (isExplicitHideElement(element)) {
      return true;
    }

    if (containsMedia(element)) {
      return false;
    }

    if (hasProtectedDescendant(element)) {
      return false;
    }

    const isBottomGiftBarOverlay = isModuleEnabled('giftBar') && isVideoBottomOverlay(element);

    if (element.matches('input, textarea, [contenteditable="true"]') && !isBottomGiftBarOverlay) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    if (rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95) {
      return false;
    }

    if (isBottomGiftBarOverlay) {
      return true;
    }

    return false;
  }

  function hideElement(element, reason) {
    if (!(element instanceof HTMLElement) || element.hasAttribute(HIDE_ATTR)) {
      return;
    }

    element.setAttribute(HIDE_ATTR, reason);
  }

  function unhideElement(element) {
    if (!(element instanceof HTMLElement) || !element.hasAttribute(HIDE_ATTR)) {
      return;
    }

    element.removeAttribute(HIDE_ATTR);
  }

  function applyExplicitHides() {
    Object.entries(HIDE_SELECTOR_GROUPS).forEach(([moduleId, selectorGroup]) => {
      if (!isModuleEnabled(moduleId) || !selectorGroup) {
        return;
      }

      document.querySelectorAll(selectorGroup).forEach((node) => {
        hideElement(node, `explicit-${moduleId}`);
      });
    });
  }

  function applyIndicatorHides() {
    if (!isModuleEnabled('topWidgets')) {
      return;
    }

    document
      .querySelectorAll('iframe[src*="live_pc_indicator_container_douyin/pages/index.html"]')
      .forEach((node) => {
        const wrappers = [
          node.closest('[data-e2e="exhibition-banner"]'),
          node.parentElement,
          node.parentElement ? node.parentElement.parentElement : null,
        ];

        wrappers.forEach((wrapper) => {
          if (
            !(wrapper instanceof HTMLElement) ||
            isExplicitSafeElement(wrapper) ||
            wrapper.querySelector(CHAT_FOLD_SELECTOR)
          ) {
            return;
          }

          hideElement(wrapper, 'indicator-match');
        });
      });
  }

  function applyChatFoldSiblingHides() {
    if (!isModuleEnabled('topWidgets')) {
      return;
    }

    document.querySelectorAll(CHAT_FOLD_SELECTOR).forEach((fold) => {
      let sibling = fold.previousElementSibling;

      while (sibling) {
        const rect = sibling.getBoundingClientRect();
        const shouldHideSibling =
          rect.height <= 100 &&
          !isExplicitSafeElement(sibling) &&
          !sibling.querySelector(CHAT_FOLD_SELECTOR);

        if (shouldHideSibling) {
          hideElement(sibling, 'chat-fold-sibling');
        }

        sibling = sibling.previousElementSibling;
      }
    });
  }

  function applyTopWidgetTooltipHides() {
    if (!isModuleEnabled('topWidgets')) {
      return;
    }

    document.querySelectorAll('.dylive-tooltip').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      const text = getTextBundle(node);
      if (TOP_WIDGET_TOOLTIP_PATTERN.test(text)) {
        hideElement(node, 'top-widget-tooltip');
      }
    });
  }

  function applyChatNoticeHides() {
    if (!isModuleEnabled('chatNotices')) {
      return;
    }

    document.querySelectorAll(CHAT_BOTTOM_NOTICE_SELECTOR).forEach((node) => {
      if (isChatBottomNoticeContainer(node)) {
        hideElement(node, 'chat-bottom-notice');
      }
    });

    const chatroom = document.getElementById('chatroom');
    if (!(chatroom instanceof HTMLElement)) {
      return;
    }

    chatroom.querySelectorAll('div').forEach((node) => {
      if (isChatJoinNoticeElement(node)) {
        hideElement(findCompactNoticeContainer(node, chatroom), 'chat-join-notice');
      }
    });
  }

  function isChatNicknameElement(element) {
    return Boolean(
      element instanceof HTMLElement &&
      element.matches(CHAT_NICKNAME_SELECTOR),
    );
  }

  function markChatNickname(element) {
    if (element instanceof HTMLElement && !element.hasAttribute(CHAT_NICKNAME_MARK_ATTR)) {
      element.setAttribute(CHAT_NICKNAME_MARK_ATTR, 'true');
    }
  }

  function markChatBadgeRow(element) {
    if (element instanceof HTMLElement && !element.hasAttribute(CHAT_BADGE_ROW_MARK_ATTR)) {
      element.setAttribute(CHAT_BADGE_ROW_MARK_ATTR, 'true');
    }
  }

  function markChatContent(element) {
    if (element instanceof HTMLElement && !element.hasAttribute(CHAT_CONTENT_MARK_ATTR)) {
      element.setAttribute(CHAT_CONTENT_MARK_ATTR, 'true');
    }
  }

  function isChatNicknameCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (isChatNicknameElement(element)) {
      return true;
    }

    if (
      !(element.previousElementSibling instanceof HTMLElement) ||
      !(element.nextElementSibling instanceof HTMLElement)
    ) {
      return false;
    }

    if (element.querySelector('img, svg, video, canvas')) {
      return false;
    }

    const text = normalizeText(element.textContent);
    if (!text || text.length > 80) {
      return false;
    }

    return /[：:]\s*$/.test(text);
  }

  function getChatNicknameFromRow(row) {
    if (!(row instanceof HTMLElement)) {
      return null;
    }

    const nickname = Array.from(row.children).find(
      (child) => child instanceof HTMLElement && isChatNicknameCandidate(child),
    );
    return nickname instanceof HTMLElement ? nickname : null;
  }

  function getChatContentAfterNickname(nickname) {
    if (!(nickname instanceof HTMLElement)) {
      return null;
    }

    const content = nickname.nextElementSibling;
    if (!(content instanceof HTMLElement)) {
      return null;
    }

    markChatContent(content);
    return content;
  }

  function isLikelyChatBadgeRow(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const children = Array.from(element.children).filter((child) => child instanceof HTMLElement);
    if (children.length < 2 || children.length > 8) {
      return false;
    }

    return children.some((child) => isChatNicknameCandidate(child));
  }

  function hideLeadingChatBadgeSiblings(nickname) {
    if (!(nickname instanceof HTMLElement)) {
      return;
    }

    markChatNickname(nickname);
    getChatContentAfterNickname(nickname);

    let sibling = nickname.previousElementSibling;
    while (sibling instanceof HTMLElement) {
      hideElement(sibling, 'chat-badge');
      sibling = sibling.previousElementSibling;
    }
  }

  function hideInlineChatBadgeChildren(nickname) {
    if (!(nickname instanceof HTMLElement)) {
      return;
    }

    Array.from(nickname.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }

      if (
        child.matches(CHAT_NICKNAME_BADGE_SELECTOR) ||
        child.matches('img, svg') ||
        child.querySelector('img, svg')
      ) {
        hideElement(child, 'chat-badge');
      }
    });
  }

  function hideChatBadgeRow(row) {
    if (!(row instanceof HTMLElement)) {
      return;
    }

    markChatBadgeRow(row);
    const nickname = getChatNicknameFromRow(row);
    if (nickname instanceof HTMLElement) {
      getChatContentAfterNickname(nickname);
    }

    Array.from(row.children).forEach((child) => {
      if (!(child instanceof HTMLElement) || !isChatNicknameCandidate(child)) {
        return;
      }

      hideLeadingChatBadgeSiblings(child);
      hideInlineChatBadgeChildren(child);
    });
  }

  function collectMatchingElements(root, selector) {
    if (!(root instanceof Element)) {
      return [];
    }

    const matched = [];
    if (root.matches(selector)) {
      matched.push(root);
    }

    matched.push(...root.querySelectorAll(selector));
    return matched;
  }

  function collectChatBadgeRows(root) {
    if (!(root instanceof Element)) {
      return [];
    }

    const rows = new Set();
    const pushRow = (node) => {
      if (isLikelyChatBadgeRow(node)) {
        rows.add(node);
      }
    };

    if (isLikelyChatBadgeRow(root)) {
      rows.add(root);
    }

    const rootItem =
      root instanceof HTMLElement && root.matches(CHAT_MESSAGE_ITEM_SELECTOR)
        ? root
        : root.closest(CHAT_MESSAGE_ITEM_SELECTOR);
    if (rootItem instanceof HTMLElement) {
      rootItem.querySelectorAll('div').forEach(pushRow);
    }

    collectMatchingElements(root, CHAT_MESSAGE_ITEM_SELECTOR).forEach((item) => {
      item.querySelectorAll('div').forEach(pushRow);
    });

    collectMatchingElements(root, CHAT_DISPLAY_TEXT_SELECTOR).forEach(pushRow);

    return Array.from(rows);
  }

  function getPrimaryChatContentElement(item) {
    if (!(item instanceof HTMLElement)) {
      return null;
    }

    const row = collectChatBadgeRows(item)[0];
    const nickname = getChatNicknameFromRow(row);
    if (nickname instanceof HTMLElement) {
      const content = getChatContentAfterNickname(nickname);
      if (content instanceof HTMLElement) {
        return content;
      }
    }

    const fallback = item.querySelector(CHAT_TEXT_CONTENT_SELECTOR);
    return fallback instanceof HTMLElement ? fallback : null;
  }

  function isPotentialChatBadgeNode(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      node.matches(CHAT_MESSAGE_ITEM_SELECTOR) ||
      node.closest(CHAT_MESSAGE_ITEM_SELECTOR) ||
      node.querySelector(CHAT_MESSAGE_ITEM_SELECTOR) ||
      isLikelyChatBadgeRow(node),
    );
  }

  function applyChatBadgeHidesInRoot(root) {
    if (!isModuleEnabled('chatBadges') || !(root instanceof Element)) {
      return;
    }

    collectChatBadgeRows(root).forEach((node) => {
      hideChatBadgeRow(node);
    });

    collectMatchingElements(root, `${CHAT_NICKNAME_SELECTOR}, [${CHAT_NICKNAME_MARK_ATTR}]`).forEach((node) => {
      hideLeadingChatBadgeSiblings(node);
      hideInlineChatBadgeChildren(node);
    });
  }

  function applyChatBadgeHides() {
    applyChatBadgeHidesInRoot(document.body);
  }

  function getPrimaryPlayerSurface() {
    const candidates = [
      document.querySelector('#PlayerLayout .douyin-player'),
      document.querySelector('#PlayerLayout [class*="douyin-player"]'),
      document.querySelector('#PlayerLayout'),
      document.querySelector('.__livingPlayer__'),
      document.querySelector('video') ? document.querySelector('video').parentElement : null,
    ];

    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement && isVisible(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  function wakePlayerControls(force = false) {
    const surface = getPrimaryPlayerSurface();
    if (!(surface instanceof HTMLElement)) {
      return false;
    }

    const now = Date.now();
    if (!force && now - state.lastPlayerWakeAt < 320) {
      return true;
    }

    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    state.lastPlayerWakeAt = now;

    const clientX = Math.round(rect.left + Math.min(Math.max(rect.width * 0.76, 48), rect.width - 20));
    const clientY = Math.round(rect.top + Math.max(rect.height - 54, rect.height * 0.82));

    ['mouseover', 'mousemove', 'mouseenter'].forEach((type) => {
      surface.dispatchEvent(
        new MouseEvent(type, {
          bubbles: type !== 'mouseenter',
          cancelable: true,
          view: window,
          clientX,
          clientY,
        }),
      );
    });

    return true;
  }

  function clickElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX,
          clientY,
        }),
      );
    }

    element.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    );

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX,
          clientY,
        }),
      );
    }

    element.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    );
    element.click();
    return true;
  }

  function hoverElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);

    if (typeof PointerEvent === 'function') {
      ['pointerover', 'pointerenter', 'pointermove'].forEach((type) => {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: type !== 'pointerenter',
            cancelable: true,
            view: window,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            clientX,
            clientY,
          }),
        );
      });
    }

    ['mouseover', 'mouseenter', 'mousemove'].forEach((type) => {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: type !== 'mouseenter',
          cancelable: true,
          view: window,
          clientX,
          clientY,
        }),
      );
    });

    return true;
  }

  function getReactProps(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const reactPropsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'));
    if (reactPropsKey && element[reactPropsKey] && typeof element[reactPropsKey] === 'object') {
      return element[reactPropsKey];
    }

    const reactFiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    const fiber = reactFiberKey ? element[reactFiberKey] : null;
    if (fiber && fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
      return fiber.memoizedProps;
    }

    return null;
  }

  function createReactLikeMouseEvent(type, currentTarget, target) {
    const rect = currentTarget.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    let defaultPrevented = false;
    let propagationStopped = false;

    return {
      type,
      target,
      currentTarget,
      nativeEvent: {
        type,
        target,
        currentTarget,
        clientX,
        clientY,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        preventDefault() {},
        stopPropagation() {},
      },
      clientX,
      clientY,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      preventDefault() {
        defaultPrevented = true;
      },
      isDefaultPrevented() {
        return defaultPrevented;
      },
      stopPropagation() {
        propagationStopped = true;
      },
      isPropagationStopped() {
        return propagationStopped;
      },
      persist() {},
    };
  }

  function invokeReactHandler(element, handlerName, eventType) {
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
      const props = getReactProps(current);
      if (props && typeof props[handlerName] === 'function') {
        props[handlerName](createReactLikeMouseEvent(eventType, current, element));
        return true;
      }

      current = current.parentElement;
      depth += 1;
    }

    return false;
  }

  function invokeReactHover(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    let handled = false;
    handled = invokeReactHandler(element, 'onPointerEnter', 'pointerenter') || handled;
    handled = invokeReactHandler(element, 'onMouseEnter', 'mouseenter') || handled;
    handled = invokeReactHandler(element, 'onMouseOver', 'mouseover') || handled;
    handled = invokeReactHandler(element, 'onMouseMove', 'mousemove') || handled;
    return handled;
  }

  function invokeReactClick(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    let handled = false;
    handled = invokeReactHandler(element, 'onPointerDown', 'pointerdown') || handled;
    handled = invokeReactHandler(element, 'onMouseDown', 'mousedown') || handled;
    handled = invokeReactHandler(element, 'onPointerUp', 'pointerup') || handled;
    handled = invokeReactHandler(element, 'onMouseUp', 'mouseup') || handled;
    handled = invokeReactHandler(element, 'onClick', 'click') || handled;
    return handled;
  }

  function hasOwnReactHandler(element, handlerName) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const props = getReactProps(element);
    return Boolean(props && typeof props[handlerName] === 'function');
  }

  function getQualitySelector() {
    const selector = document.querySelector('[data-e2e="quality-selector"]');
    return selector instanceof HTMLElement ? selector : null;
  }

  function getQualityTrigger() {
    const trigger = document.querySelector('[data-e2e="quality"]');
    return trigger instanceof HTMLElement ? trigger : null;
  }

  function getQualityHoverTargets() {
    const trigger = getQualityTrigger();
    if (!(trigger instanceof HTMLElement)) {
      return [];
    }

    return [
      trigger.parentElement,
      trigger.parentElement ? trigger.parentElement.parentElement : null,
      trigger,
    ].filter((node, index, array) => node instanceof HTMLElement && array.indexOf(node) === index);
  }

  function getQualityOptions() {
    const selector = getQualitySelector();
    if (!(selector instanceof HTMLElement)) {
      return [];
    }

    return Array.from(selector.children)
      .map((node) => (node.firstElementChild instanceof HTMLElement ? node.firstElementChild : node))
      .filter((node) => node instanceof HTMLElement && normalizeText(getTextBundle(node)));
  }

  function getQualityOptionFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const selector = target.closest('[data-e2e="quality-selector"]');
    if (!(selector instanceof HTMLElement)) {
      return null;
    }

    let current = target instanceof HTMLElement ? target : target.parentElement;
    while (current && current !== selector) {
      if (current.parentElement === selector) {
        return current.firstElementChild instanceof HTMLElement ? current.firstElementChild : current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function getQualityOptionActionTarget(option) {
    if (!(option instanceof HTMLElement)) {
      return null;
    }

    const candidates = [option.parentElement, option].filter((node) => node instanceof HTMLElement);
    return (
      candidates.find(
        (node) => hasOwnReactHandler(node, 'onClick') || hasOwnReactHandler(node, 'onMouseEnter'),
      ) || option
    );
  }

  function maybeDisableAutoBestQualityByUserTarget(target) {
    if (!state.enabled || !isModuleEnabled('autoBestQuality')) {
      return false;
    }

    const clickedOption = getQualityOptionFromTarget(target);
    if (!(clickedOption instanceof HTMLElement)) {
      return false;
    }

    const highestOption = getQualityOptions()[0];
    if (!(highestOption instanceof HTMLElement)) {
      return disableAutomationModuleByUser('autoBestQuality');
    }

    const clickedLabel = normalizeText(getTextBundle(clickedOption));
    const highestLabel = normalizeText(getTextBundle(highestOption));
    if (!clickedLabel || !highestLabel || clickedLabel === highestLabel) {
      return false;
    }

    return disableAutomationModuleByUser('autoBestQuality');
  }

  function findReactActionTarget(root, handlerNames = ['onClick']) {
    if (!(root instanceof HTMLElement)) {
      return null;
    }

    const candidates = [root, ...root.querySelectorAll('*')].filter((node) => node instanceof HTMLElement);
    return (
      candidates.find((node) => handlerNames.some((handlerName) => hasOwnReactHandler(node, handlerName))) ||
      null
    );
  }

  function isQualityOptionActive(option) {
    if (!(option instanceof HTMLElement)) {
      return false;
    }

    const styleText = String(option.getAttribute('style') || '').replace(/\s+/g, '');
    if (/background:rgba\(242,242,244,0\.08\)/.test(styleText)) {
      return true;
    }

    const computed = window.getComputedStyle(option);
    return (
      computed.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      computed.backgroundColor !== 'transparent' &&
      computed.color === 'rgb(255, 255, 255)'
    );
  }

  function isHighestQualitySelected(trigger, option) {
    if (!(trigger instanceof HTMLElement) || !(option instanceof HTMLElement)) {
      return false;
    }

    if (isQualityOptionActive(option)) {
      return true;
    }

    const triggerLabel = normalizeText(getTextBundle(trigger));
    const optionLabel = normalizeText(getTextBundle(option));
    return Boolean(triggerLabel && optionLabel && triggerLabel === optionLabel);
  }

  function applyAutoBestQuality() {
    if (!isModuleEnabled('autoBestQuality')) {
      return;
    }

    const now = Date.now();
    const trigger = getQualityTrigger();
    const selector = getQualitySelector();
    const highestOption = getQualityOptions()[0];

    if (!(trigger instanceof HTMLElement) || !(selector instanceof HTMLElement) || !(highestOption instanceof HTMLElement)) {
      state.autoBestQualityDone = false;

      if (now - state.lastBestQualityAttemptAt >= 900) {
        state.lastBestQualityAttemptAt = now;
        wakePlayerControls();
        scheduleScan(document.body, 260);
      }
      return;
    }

    if (state.autoBestQualityDone && !isHighestQualitySelected(trigger, highestOption)) {
      disableAutomationModuleByUser('autoBestQuality');
      return;
    }

    if (isHighestQualitySelected(trigger, highestOption)) {
      state.autoBestQualityDone = true;
      return;
    }

    state.autoBestQualityDone = false;

    if (now - state.lastBestQualityAttemptAt < 650) {
      return;
    }

    state.lastBestQualityAttemptAt = now;
    wakePlayerControls(true);

    const highestOptionActionTarget = getQualityOptionActionTarget(highestOption);
    if (highestOptionActionTarget instanceof HTMLElement) {
      invokeReactHover(highestOptionActionTarget);

      if (invokeReactClick(highestOptionActionTarget)) {
        scheduleScan(document.body, 260);
        return;
      }
    }

    if (!isVisible(selector)) {
      const hoverTargets = getQualityHoverTargets();
      hoverTargets.forEach((target) => {
        invokeReactHover(target);
        hoverElement(target);
      });

      if (!isVisible(selector)) {
        if (!invokeReactClick(trigger)) {
          clickElement(trigger);
        }
      }

      scheduleScan(document.body, 180);
      return;
    }

    invokeReactHover(selector);
    invokeReactHover(highestOptionActionTarget || highestOption);
    hoverElement(selector);
    hoverElement(highestOptionActionTarget || highestOption);

    if (
      invokeReactClick(highestOptionActionTarget || highestOption) ||
      clickElement(highestOptionActionTarget || highestOption)
    ) {
      scheduleScan(document.body, 340);
    }
  }

  function resolveSlotContent(slot) {
    if (!(slot instanceof Element)) {
      return null;
    }

    if (slot.firstElementChild instanceof HTMLElement) {
      return slot.firstElementChild;
    }

    if (typeof slot.assignedElements === 'function') {
      const assigned = slot.assignedElements({ flatten: true }).find((node) => node instanceof HTMLElement);
      return assigned instanceof HTMLElement ? assigned : null;
    }

    return null;
  }

  function collectPlayerControlRoots(controlsRoot) {
    if (!(controlsRoot instanceof HTMLElement)) {
      return [];
    }

    const roots = [];
    const pushRoot = (node) => {
      if (node instanceof HTMLElement && !roots.includes(node)) {
        roots.push(node);
      }
    };

    Array.from(controlsRoot.children).forEach((node) => {
      if (node instanceof HTMLElement) {
        pushRoot(node);
      }
    });

    controlsRoot.querySelectorAll('slot').forEach((slot) => {
      pushRoot(resolveSlotContent(slot));
    });

    controlsRoot.querySelectorAll('button, [role="button"]').forEach((node) => {
      pushRoot(node);
      pushRoot(node.parentElement);
    });

    return roots;
  }

  function isXgWebFullscreenControlElement(control) {
    return Boolean(
      control instanceof HTMLElement &&
      (control.matches('[data-e2e="xgplayer-page-full-screen"], .xgplayer-page-full-screen') ||
        control.closest('[data-e2e="xgplayer-page-full-screen"], .xgplayer-page-full-screen')),
    );
  }

  function getWebFullscreenControlScore(control) {
    if (!(control instanceof HTMLElement)) {
      return -1;
    }

    const text = normalizeText([getTextBundle(control), control.textContent].filter(Boolean).join(' '));
    const isXgWebFullscreenControl = isXgWebFullscreenControlElement(control);

    if (!text && !isXgWebFullscreenControl) {
      return -1;
    }

    const hasShortcutY = /(?:^|\s)Y(?:\s|$)/i.test(text);
    if (!/网页全屏/.test(text) && !isXgWebFullscreenControl) {
      return hasShortcutY && !/设置|弹幕|礼物|画质|小窗|旋转|全屏/.test(text) ? 12 : -1;
    }

    let score = 0;
    if (/退出网页全屏/.test(text)) {
      score += 40;
    } else if (/进入网页全屏/.test(text)) {
      score += 36;
    } else {
      score += 32;
    }

    if (hasShortcutY) {
      score += 3;
    }

    if (isXgWebFullscreenControl) {
      score += 8;
    }

    score += isVisible(control) ? 12 : -12;

    const slot = control.closest('slot');
    if (slot instanceof Element && slot.getAttribute('data-index') === '2') {
      score += 1;
    }

    return score;
  }

  function getPlayerControlContainers() {
    return [
      document.getElementById('PlayerControlLayout'),
      document.querySelector('.douyin-player-controls-right'),
      document.querySelector('.xg-right-grid'),
      document.querySelector('xg-right-grid'),
    ].filter((node, index, array) => node instanceof HTMLElement && array.indexOf(node) === index);
  }

  function findWebFullscreenControl() {
    const controlContainers = getPlayerControlContainers();
    const candidates = [];
    const pushCandidate = (candidate) => {
      if (candidate instanceof HTMLElement && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    };

    pushCandidate(document.querySelector('[data-e2e="xgplayer-page-full-screen"]'));
    pushCandidate(document.querySelector('.xgplayer-page-full-screen'));

    controlContainers.forEach((container) => {
      collectPlayerControlRoots(container).forEach((control) => {
        pushCandidate(control);
      });
    });

    const matchedByText = candidates
      .map((control) => ({
        control,
        score: getWebFullscreenControlScore(control),
      }))
      .filter(({ score }) => score >= 0)
      .sort((left, right) => right.score - left.score)[0]?.control;

    if (matchedByText instanceof HTMLElement) {
      return matchedByText;
    }

    if (controlContainers.length <= 0) {
      return null;
    }

    const slotCandidates = [];
    const pushSlot = (slot) => {
      if (slot instanceof HTMLElement && !slotCandidates.includes(slot)) {
        slotCandidates.push(slot);
      }
    };

    controlContainers.forEach((container) => {
      pushSlot(container.querySelector('slot[data-index="2"]'));
    });
    controlContainers.forEach((container) => {
      container.querySelectorAll('slot').forEach(pushSlot);
    });

    for (const slot of slotCandidates) {
      const content = resolveSlotContent(slot);
      if (getWebFullscreenControlScore(content) >= 0) {
        return content;
      }
    }

    return null;
  }

  function getWebFullscreenActionTarget(control) {
    if (!(control instanceof HTMLElement)) {
      return null;
    }

    return (
      findReactActionTarget(control, ['onClick', 'onPointerDown', 'onMouseDown', 'onPointerUp', 'onMouseUp']) ||
      control.querySelector('button, [role="button"]') ||
      control
    );
  }

  function isWebFullscreenControlTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    const control = findWebFullscreenControl();
    return Boolean(control instanceof HTMLElement && (control === target || control.contains(target)));
  }

  function maybeDisableAutoWebFullscreenByUserTarget(target) {
    if (!state.enabled || !isModuleEnabled('autoWebFullscreen')) {
      return false;
    }

    if (!isWebFullscreenControlTarget(target)) {
      return false;
    }

    return disableAutomationModuleByUser('autoWebFullscreen');
  }

  function shouldIgnoreWebFullscreenShortcutEvent(event) {
    if (!(event.target instanceof HTMLElement)) {
      return false;
    }

    return event.target.matches('input, textarea, select') || event.target.isContentEditable;
  }

  function isWebFullscreenActive(control) {
    if (document.fullscreenElement) {
      return true;
    }

    const controlState = normalizeText(control?.getAttribute('data-state'));
    if (controlState && !/^(?:normal|default|inactive|closed|off|false|0)$/i.test(controlState)) {
      return true;
    }

    const text = getTextBundle(control);
    if (/退出网页全屏/.test(text)) {
      return true;
    }

    if (/^(?:进入)?网页全屏$/.test(text) || /(?:^|\s)(?:进入)?网页全屏(?:\s|$)/.test(text)) {
      return false;
    }

    const playerLayout = document.getElementById('PlayerLayout') || getPrimaryPlayerSurface();
    if (playerLayout instanceof HTMLElement) {
      const rect = playerLayout.getBoundingClientRect();
      if (rect.width >= window.innerWidth * 0.78 && rect.height >= window.innerHeight * 0.72) {
        return true;
      }
    }

    return false;
  }

  function applyAutoWebFullscreen() {
    if (!isModuleEnabled('autoWebFullscreen')) {
      return;
    }

    const now = Date.now();
    const control = findWebFullscreenControl();
    if (!(control instanceof HTMLElement)) {
      state.autoWebFullscreenDone = false;

      if (now - state.lastWebFullscreenAttemptAt >= 900) {
        state.lastWebFullscreenAttemptAt = now;
        wakePlayerControls();
        scheduleScan(document.body, 260);
      }
      return;
    }

    const webFullscreenActive = isWebFullscreenActive(control);
    if (state.autoWebFullscreenDone && !webFullscreenActive) {
      disableAutomationModuleByUser('autoWebFullscreen');
      return;
    }

    if (webFullscreenActive) {
      state.autoWebFullscreenDone = true;
      return;
    }

    state.autoWebFullscreenDone = false;

    if (now - state.lastWebFullscreenAttemptAt < 700) {
      return;
    }

    state.lastWebFullscreenAttemptAt = now;
    wakePlayerControls(true);

    const actionTarget = getWebFullscreenActionTarget(control);
    if (!isVisible(control)) {
      scheduleScan(document.body, 260);
      return;
    }

    if (
      (actionTarget instanceof HTMLElement && invokeReactClick(actionTarget)) ||
      clickElement(actionTarget || control)
    ) {
      scheduleScan(document.body, 360);
    }
  }

  function shouldRevealProtectedElement(element) {
    if (!(element instanceof HTMLElement) || isExplicitHideElement(element)) {
      return false;
    }

    if (isModuleEnabled('chatNotices') && CHAT_NOTICE_REASONS.has(element.getAttribute(HIDE_ATTR))) {
      return false;
    }

    if (isModuleEnabled('chatBadges') && CHAT_BADGE_REASONS.has(element.getAttribute(HIDE_ATTR))) {
      return false;
    }

    if (element.hasAttribute(SAFE_ATTR) || isExplicitSafeElement(element) || hasProtectedDescendant(element)) {
      return true;
    }

    return false;
  }

  function revealProtectedElements() {
    document.querySelectorAll(`[${HIDE_ATTR}]`).forEach((node) => {
      if (shouldRevealProtectedElement(node)) {
        unhideElement(node);
      }
    });
  }

  function revealAll() {
    closeChatReplayOverlay();
    document.querySelectorAll(`[${HIDE_ATTR}]`).forEach((node) => {
      node.removeAttribute(HIDE_ATTR);
    });
    state.hiddenCount = 0;
    updateUi();
  }

  function revealModuleHides(moduleId) {
    const reasons = MODULE_HIDE_REASONS[moduleId];
    if (!reasons || reasons.size <= 0) {
      return;
    }

    document.querySelectorAll(`[${HIDE_ATTR}]`).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      const reason = String(node.getAttribute(HIDE_ATTR) || '');
      if (reasons.has(reason)) {
        unhideElement(node);
      }
    });

    state.hiddenCount = document.querySelectorAll(`[${HIDE_ATTR}]`).length;
    updateUi();
  }

  function scan(root = document.body) {
    if (!state.enabled || !(root instanceof HTMLElement)) {
      return;
    }

    syncRoomContext();
    if (!state.roomKey) {
      return;
    }

    detectSafeZones();
    revealProtectedElements();
    applyExplicitHides();
    applyIndicatorHides();
    applyChatFoldSiblingHides();
    applyTopWidgetTooltipHides();
    applyChatNoticeHides();
    applyChatBadgeHides();
    applyAutoBestQuality();
    applyAutoWebFullscreen();

    const nodes = [root, ...root.querySelectorAll('*')];
    for (const node of nodes) {
      if (shouldSkip(node)) {
        continue;
      }

      if (shouldHide(node)) {
        hideElement(node, 'matched');
      }
    }

    state.hiddenCount = document.querySelectorAll(`[${HIDE_ATTR}]`).length;
    updateUi();
  }

  function scheduleScan(root = document.body, delay = 160) {
    if (!state.enabled) {
      return;
    }

    syncRoomContext();
    if (!state.roomKey) {
      return;
    }

    window.clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(() => {
      scan(root instanceof HTMLElement ? root : document.body);
    }, delay);
  }

  function removeUiDock() {
    document.querySelectorAll(`[${UI_ATTR}="dock"]`).forEach((node) => {
      node.remove();
    });
  }

  function getChatInputDockAnchor(chatInput) {
    if (!(chatInput instanceof HTMLElement)) {
      return null;
    }

    const actionButtons = Array.from(chatInput.querySelectorAll('button, [role="button"]')).filter(
      (node) =>
        node instanceof HTMLElement &&
        !node.closest(`[${UI_ATTR}]`) &&
        isVisible(node),
    );

    const emojiButton = actionButtons.find((button) => /表情|emoji/i.test(getTextBundle(button)));
    if (emojiButton instanceof HTMLElement) {
      return emojiButton;
    }

    return actionButtons[actionButtons.length - 1] instanceof HTMLElement
      ? actionButtons[actionButtons.length - 1]
      : null;
  }

  function ensureUiMounted() {
    if (!state.roomKey) {
      removeUiDock();
      return {};
    }

    const chatInput = document.querySelector('#chatInput');
    if (!(chatInput instanceof HTMLElement)) {
      return {};
    }

    let dock = chatInput.querySelector(`[${UI_ATTR}="dock"]`);
    if (!(dock instanceof HTMLElement)) {
      const moduleItems = MODULE_CONFIGS.map(
        (module) => `
          <label class="dy-clean-item">
            <span class="dy-clean-item-title">${module.title}</span>
            <span class="dy-clean-toggle">
              <input type="checkbox" data-module-id="${module.id}">
              <span class="dy-clean-toggle-track"></span>
            </span>
          </label>
        `,
      ).join('');

      dock = document.createElement('div');
      dock.setAttribute(UI_ATTR, 'dock');
      dock.innerHTML = `
        <button type="button" ${UI_ATTR}="trigger" aria-label="直播净化设置" title="直播净化设置">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 7h10M9 12h6m-4 5h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <circle cx="16" cy="7" r="1.8" fill="currentColor"></circle>
            <circle cx="11" cy="12" r="1.8" fill="currentColor"></circle>
            <circle cx="13" cy="17" r="1.8" fill="currentColor"></circle>
          </svg>
        </button>
        <div ${UI_ATTR}="panel" hidden>
          <div class="dy-clean-head">
            <div class="dy-clean-title">直播净化</div>
            <div class="dy-clean-head-actions">
              <button type="button" class="dy-clean-text-btn" data-action="rescan">重扫</button>
              <button type="button" class="dy-clean-icon-btn" data-action="hide-panel" aria-label="隐藏设置">×</button>
            </div>
          </div>
          <div class="dy-clean-summary" data-role="count">已隐藏 0 项</div>
          <div class="dy-clean-stack">
            <label class="dy-clean-item" data-master="true">
              <span class="dy-clean-item-title">总开关</span>
              <span class="dy-clean-toggle">
                <input type="checkbox" data-role="master">
                <span class="dy-clean-toggle-track"></span>
              </span>
            </label>
            ${moduleItems}
          </div>
        </div>
      `;

      const anchor = getChatInputDockAnchor(chatInput);

      if (anchor) {
        chatInput.insertBefore(dock, anchor);
      } else {
        chatInput.appendChild(dock);
      }

      const trigger = dock.querySelector(`[${UI_ATTR}="trigger"]`);
      const panel = dock.querySelector(`[${UI_ATTR}="panel"]`);
      const master = dock.querySelector('[data-role="master"]');
      const rescan = dock.querySelector('[data-action="rescan"]');

      if (trigger instanceof HTMLButtonElement) {
        trigger.addEventListener('click', () => {
          setPanelVisible(!state.panelVisible);
        });
      }

      if (master instanceof HTMLInputElement) {
        master.addEventListener('change', (event) => {
          if (event.currentTarget instanceof HTMLInputElement) {
            setCleanerEnabled(event.currentTarget.checked);
          }
        });
      }

      if (rescan instanceof HTMLButtonElement) {
        rescan.addEventListener('click', () => {
          revealAll();
          if (state.enabled) {
            scheduleScan(document.body);
          } else {
            updateUi();
          }
        });
      }

      dock.querySelectorAll('[data-action="hide-panel"]').forEach((button) => {
        button.addEventListener('click', () => {
          setPanelVisible(false);
        });
      });

      dock.querySelectorAll('[data-module-id]').forEach((node) => {
        node.addEventListener('change', (event) => {
          if (event.currentTarget instanceof HTMLInputElement) {
            setModuleEnabled(event.currentTarget.dataset.moduleId, event.currentTarget.checked);
          }
        });
      });

      if (!(panel instanceof HTMLElement)) {
        return {};
      }
    }

    return {
      chatInput,
      dock,
      panel: dock.querySelector(`[${UI_ATTR}="panel"]`),
      trigger: dock.querySelector(`[${UI_ATTR}="trigger"]`),
    };
  }

  function positionUiDock(chatInput, dock) {
    if (!(chatInput instanceof HTMLElement) || !(dock instanceof HTMLElement)) {
      return;
    }

    const chatInputRect = chatInput.getBoundingClientRect();
    const dockWidth = 30;
    const gap = 6;
    let left = chatInput.clientWidth - dockWidth - 84;

    const anchor = getChatInputDockAnchor(chatInput);
    if (anchor instanceof HTMLElement) {
      const anchorRect = anchor.getBoundingClientRect();
      left = anchorRect.left - chatInputRect.left - dockWidth - gap;
    }

    dock.style.left = `${Math.max(8, Math.round(left))}px`;
  }

  function updateUi() {
    syncStyleState();

    const { chatInput, dock, panel, trigger } = ensureUiMounted();
    if (
      !(chatInput instanceof HTMLElement) ||
      !(dock instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(trigger instanceof HTMLButtonElement)
    ) {
      return;
    }

    positionUiDock(chatInput, dock);
    panel.hidden = !state.panelVisible;
    trigger.dataset.open = state.panelVisible ? 'true' : 'false';
    trigger.setAttribute('aria-pressed', state.panelVisible ? 'true' : 'false');
    trigger.title = state.panelVisible ? '隐藏直播净化设置' : '打开直播净化设置';

    const countText = `已隐藏 ${state.hiddenCount} 项`;

    panel.querySelectorAll('[data-role="count"]').forEach((node) => {
      node.textContent = countText;
    });

    const master = panel.querySelector('[data-role="master"]');
    if (master instanceof HTMLInputElement) {
      master.checked = state.enabled;
    }

    panel.querySelectorAll('[data-module-id]').forEach((node) => {
      if (node instanceof HTMLInputElement) {
        node.checked = isModuleEnabled(node.dataset.moduleId);
      }
    });
  }

  function createUi() {
    if (!document.querySelector(`[${UI_ATTR}="style"]`)) {
      const style = document.createElement('style');
      style.setAttribute(UI_ATTR, 'style');
      style.textContent = `
        [${HIDE_ATTR}] {
          display: none !important;
        }

        html[${CHAT_BADGE_STYLE_ATTR}] [${CHAT_BADGE_ROW_MARK_ATTR}] > *:has(~ [${CHAT_NICKNAME_MARK_ATTR}]),
        html[${CHAT_BADGE_STYLE_ATTR}] ${CHAT_MESSAGE_ITEM_SELECTOR} > * > div > span:first-child:has(img):has(+ span + span),
        html[${CHAT_BADGE_STYLE_ATTR}] ${CHAT_MESSAGE_ITEM_SELECTOR} > * > div > span:first-child:has(svg):has(+ span + span),
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___display-text > *:has(~ [${CHAT_NICKNAME_MARK_ATTR}]),
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___display-text"] > *:has(~ [${CHAT_NICKNAME_MARK_ATTR}]) {
          display: none !important;
        }
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___nickname > img,
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___nickname > svg,
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___nickname > *:has(img),
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___nickname > *:has(svg),
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___nickname"] > img,
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___nickname"] > svg,
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___nickname"] > *:has(img),
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___nickname"] > *:has(svg),
        html[${CHAT_BADGE_STYLE_ATTR}] .webcast-chatroom___nickname > .webcast-chatroom___badge,
        html[${CHAT_BADGE_STYLE_ATTR}] [class*="webcast-chatroom___nickname"] > [class*="webcast-chatroom___badge"] {
          display: none !important;
        }

        [${UI_ATTR}="panel"][hidden] {
          display: none !important;
        }

        #chatInput {
          position: relative;
          overflow: visible !important;
        }

        [${UI_ATTR}="dock"] {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 30px;
          height: 30px;
          z-index: 3;
        }

        [${UI_ATTR}="trigger"] {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.08));
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.2);
          color: rgba(255, 255, 255, 0.74);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, transform 0.18s ease, opacity 0.18s ease;
        }

        [${UI_ATTR}="trigger"]:hover,
        [${UI_ATTR}="trigger"][data-open="true"] {
          background: linear-gradient(180deg, rgba(255, 197, 111, 0.24), rgba(255, 148, 86, 0.16));
          border-color: rgba(255, 196, 117, 0.28);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
          color: #fff7ee;
          transform: translateY(-1px);
        }

        [${UI_ATTR}="panel"] {
          position: absolute;
          right: 0;
          bottom: calc(100% + 12px);
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: min(276px, calc(100vw - 36px));
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          background: rgba(26, 28, 39, 0.97);
          color: #f7f4ee;
          backdrop-filter: blur(14px);
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.32);
          font: 12px/1.45 "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei", sans-serif;
        }

        [${UI_ATTR}="panel"]::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(255, 255, 255, 0.04);
          pointer-events: none;
        }

        [${UI_ATTR}="panel"] button {
          border: 0;
          color: inherit;
          cursor: pointer;
          font: inherit;
        }

        [${UI_ATTR}="panel"] .dy-clean-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        [${UI_ATTR}="panel"] .dy-clean-head-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        [${UI_ATTR}="panel"] .dy-clean-title {
          color: #fff8ef;
          font-size: 14px;
          font-weight: 700;
        }

        [${UI_ATTR}="panel"] .dy-clean-summary {
          padding: 2px 2px 0;
          color: rgba(255, 255, 255, 0.62);
          font-size: 12px;
        }

        [${UI_ATTR}="panel"] .dy-clean-count {
          color: inherit;
          font-size: inherit;
        }

        [${UI_ATTR}="panel"] .dy-clean-stack {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        [${UI_ATTR}="panel"] .dy-clean-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        [${UI_ATTR}="panel"] .dy-clean-item[data-master="true"] {
          background: rgba(255, 177, 71, 0.1);
          border-color: rgba(255, 186, 98, 0.14);
        }

        [${UI_ATTR}="panel"] .dy-clean-item-title {
          color: #fff8ef;
          font-size: 13px;
          font-weight: 700;
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle {
          position: relative;
          flex: none;
          width: 40px;
          height: 24px;
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle input {
          position: absolute;
          inset: 0;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle-track {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          transition: background 0.18s ease, box-shadow 0.18s ease;
          pointer-events: none;
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle-track::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff8ef;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.24);
          transition: transform 0.18s ease;
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle input:checked + .dy-clean-toggle-track {
          background: linear-gradient(135deg, #ffb54a, #ff7f4a);
          box-shadow: 0 0 0 4px rgba(255, 170, 79, 0.12);
        }

        [${UI_ATTR}="panel"] .dy-clean-toggle input:checked + .dy-clean-toggle-track::after {
          transform: translateX(16px);
        }

        [${UI_ATTR}="panel"] .dy-clean-text-btn:hover,
        [${UI_ATTR}="panel"] .dy-clean-icon-btn:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        [${UI_ATTR}="panel"] .dy-clean-icon-btn {
          width: 24px;
          height: 24px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.86);
        }

        [${UI_ATTR}="panel"] .dy-clean-text-btn {
          height: 24px;
          padding: 0 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.82);
          transition: background 0.18s ease;
        }

        [data-dy-clean-replay-active="true"] {
          border-radius: 8px;
          background: rgba(255, 195, 107, 0.18);
          box-shadow: 0 0 0 1px rgba(255, 195, 107, 0.28);
        }

        [${UI_ATTR}="chat-replay-actions"] {
          position: fixed;
          z-index: 2147483647;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        [${UI_ATTR}="chat-replay-plus"] {
          min-width: 38px;
          height: 28px;
          padding: 0 10px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffcf75, #ff8d57);
          color: #23160f;
          font: 700 12px/1 "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei", sans-serif;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
          cursor: pointer;
        }

        [${UI_ATTR}="chat-replay-copy"] {
          min-width: 48px;
          height: 28px;
          padding: 0 12px;
          border: 1px solid rgba(34, 39, 54, 0.16);
          border-radius: 999px;
          background: rgba(255, 250, 242, 0.98);
          color: #1c2230;
          font: 700 12px/1 "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei", sans-serif;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
          cursor: pointer;
        }

        [${UI_ATTR}="chat-replay-plus"]:hover {
          filter: brightness(1.05);
        }

        [${UI_ATTR}="chat-replay-copy"]:hover {
          background: rgba(255, 243, 226, 1);
        }
      `;

      document.documentElement.appendChild(style);
    }

    if (!state.uiBound) {
      document.addEventListener('pointerdown', (event) => {
        const replaySource = state.chatReplay.sourceList;
        const replayArea = state.chatReplay.sourceArea;
        const clickedInsideReplayList =
          replayArea instanceof HTMLElement &&
          event.target instanceof Node &&
          replayArea.contains(event.target);
        const clickedUnreadTip =
          event.target instanceof Element &&
          event.target.closest(CHAT_UNREAD_SELECTOR);

        if (
          event.target instanceof Element &&
          replaySource &&
          !event.target.closest(`[${UI_ATTR}="chat-replay-actions"]`) &&
          !clickedInsideReplayList &&
          !clickedUnreadTip
        ) {
          resumeChatReplayList();
        }

        if (
          state.panelVisible &&
          event.target instanceof Element &&
          !event.target.closest(`[${UI_ATTR}="dock"]`)
        ) {
          setPanelVisible(false);
        }

        if (!event.isTrusted || !(event.target instanceof Element)) {
          return;
        }

        maybeDisableAutoBestQualityByUserTarget(event.target);
        maybeDisableAutoWebFullscreenByUserTarget(event.target);
      });

      document.addEventListener('pointermove', (event) => {
        if (
          !event.isTrusted ||
          !isChatReplayEnabled() ||
          !(event.target instanceof Element)
        ) {
          return;
        }

        const overActionHost = isPointInsideElementRect(
          state.chatReplay.actionHost,
          event.clientX,
          event.clientY,
          0,
        );
        const overActiveContent = isPointInsideElementRect(
          state.chatReplay.activeContentElement,
          event.clientX,
          event.clientY,
          0,
        );

        if (overActionHost || event.target.closest(`[${UI_ATTR}="chat-replay-actions"]`)) {
          cancelChatReplayResume();
          return;
        }

        const content = getChatReplayContentElement(event.target);
        if (
          content instanceof HTMLElement &&
          content.closest('#chatroom') &&
          !content.closest(`[${UI_ATTR}]`)
        ) {
          state.chatReplay.pointerX = event.clientX;
          state.chatReplay.pointerY = event.clientY;
          openChatReplayOverlay(content);
          return;
        }

        if (overActiveContent) {
          cancelChatReplayResume();
          return;
        }

        const replaySource = state.chatReplay.sourceList;
        const insideUnreadTip = Boolean(
          event.target.closest(CHAT_UNREAD_SELECTOR),
        );

        if (insideUnreadTip) {
          resumeChatReplayList();
          return;
        }

        if (replaySource instanceof HTMLElement) {
          resumeChatReplayList();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (
          !event.isTrusted ||
          !state.enabled ||
          !isModuleEnabled('autoWebFullscreen') ||
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          shouldIgnoreWebFullscreenShortcutEvent(event)
        ) {
          return;
        }

        const key = String(event.key || '').toLowerCase();
        if (key === 'y') {
          disableAutomationModuleByUser('autoWebFullscreen');
          return;
        }

        if (key === 'escape') {
          const control = findWebFullscreenControl();
          if (
            control instanceof HTMLElement &&
            (state.autoWebFullscreenDone || isWebFullscreenActive(control))
          ) {
            disableAutomationModuleByUser('autoWebFullscreen');
          }
        }
      });

      window.addEventListener('resize', () => {
        if (state.chatReplay.sourceList) {
          resumeChatReplayList();
        }
      });

      window.addEventListener('blur', () => {
        if (state.chatReplay.sourceList) {
          resumeChatReplayList();
        }
      });

      window.addEventListener('mouseout', (event) => {
        if (state.chatReplay.sourceList && !event.relatedTarget) {
          resumeChatReplayList();
        }
      });

      document.addEventListener(
        'scroll',
        (event) => {
          if (!state.chatReplay.sourceList) {
            return;
          }

          if (
            event.target === state.chatReplay.sourceList ||
            (event.target instanceof Element && event.target.closest('#chatroom'))
          ) {
            return;
          }

          resumeChatReplayList();
        },
        true,
      );
      state.uiBound = true;
    }

    ensureUiMounted();
    updateUi();
  }

  function observeDom() {
    if (state.observer || !document.body) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.enabled) {
        let shouldRefreshUi = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (
              node instanceof HTMLElement &&
              (node.id === 'chatInput' || node.querySelector('#chatInput'))
            ) {
              shouldRefreshUi = true;
              break;
            }
          }

          if (shouldRefreshUi) {
            break;
          }
        }

        if (shouldRefreshUi) {
          createUi();
        }
        return;
      }

      let root = null;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && !isUserScriptUi(node)) {
            if (state.roomKey) {
              const chatItem =
                node.matches(CHAT_MESSAGE_ITEM_SELECTOR)
                  ? node
                  : node.closest(CHAT_MESSAGE_ITEM_SELECTOR);
              if (chatItem instanceof HTMLElement) {
                applyChatBadgeHidesInRoot(chatItem);
              } else if (isPotentialChatBadgeNode(node)) {
                applyChatBadgeHidesInRoot(node);
              }
            }

            root = node;
            break;
          }
        }

        if (root) {
          break;
        }
      }

      scheduleScan(root || document.body);
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    hydrateSettings();
    removeChatReplayUiNodes();
    syncRoomContext();
    syncStyleState();
    createUi();
    observeDom();

    if (state.enabled) {
      scheduleScan(document.body);
    } else {
      updateUi();
    }

    window.setInterval(() => {
      if (state.enabled) {
        scheduleScan(document.body);
      }
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
