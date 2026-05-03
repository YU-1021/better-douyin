// ==UserScript==
// @name         更好的抖音
// @namespace    https://github.com/YU-1021/better-douyin
// @version      1.0
// @description  去除抖音网页广告和登录弹窗，支持免登录搜索跳转，增强遮罩层清理
// @author       Yu
// @license      MIT
// @icon         https://www.douyin.com/favicon.ico
// @match        *://*.douyin.com/*
// @match        *://*.iesdouyin.com/*
// @exclude      *://creator.douyin.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const SEARCH_PATH = '/root/search/';
  const REDIRECT_PARAMS = new Set(['source', 'browser_type', 'enter_from']);
  const HIDE_SELECTORS = [
    '[data-e2e="feed-item"] [data-e2e="ad-link"]',
    '[data-e2e="feed-item"] [aria-label*="广告"]',
    '[data-e2e="feed-item"] [aria-label*="直播"]',
    '[class*="login"]',
    '[class*="Login"]',
    '[data-e2e*="login"]',
    '[role="dialog"]',
    '#login-panel-new',
    '[data-bytereplay-mask]',
    '.oMpq4HiN',
    '.GzPW6isY',
    '.BGmBK6_i'
  ];

  const BLOCKED_TEXTS = ['登录', '注册', '手机验证码登录', '扫码登录'];
  const observedRoots = new WeakSet();

  function injectStyle() {
    if (document.getElementById('better-douyin-style')) return;
    const style = document.createElement('style');
    style.id = 'better-douyin-style';
    style.textContent = `
      ${HIDE_SELECTORS.join(',')} {
        display: none !important;
        visibility: hidden !important;
      }
      html, body {
        overflow-x: hidden !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function findSearchKeyword() {
    const input = document.querySelector('input[data-e2e="searchbar-input"]');
    const value = input && typeof input.value === 'string' ? input.value.trim() : '';
    if (value) return value;

    const searchText = Array.from(document.querySelectorAll('input, textarea'))
      .map((el) => (el.value || '').trim())
      .find(Boolean);
    return searchText || '';
  }

  function buildSearchUrl(keyword) {
    const cleanKeyword = encodeURIComponent(keyword.trim());
    if (!cleanKeyword) return '';
    const url = new URL(location.href);
    REDIRECT_PARAMS.forEach((param) => url.searchParams.delete(param));
    return `${url.origin}${SEARCH_PATH}${cleanKeyword}?source=pc_click_hashtag_feed`;
  }

  function redirectSearch() {
    const keyword = findSearchKeyword();
    const target = buildSearchUrl(keyword);
    if (target) location.href = target;
  }

  function isLoginNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const text = (node.textContent || '').trim();
    if (BLOCKED_TEXTS.some((item) => text.includes(item))) return true;
    const role = node.getAttribute('role');
    if (role === 'dialog') return true;
    const cls = node.className;
    return typeof cls === 'string' && /login|Login|auth|Auth/.test(cls);
  }

  function cleanDom(root = document) {
    HIDE_SELECTORS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((el) => el.remove());
    });

    root.querySelectorAll('[role="dialog"], [class*="login"], [class*="Login"], [data-e2e*="login"]').forEach((el) => {
      if (isLoginNode(el)) el.remove();
    });

    root.querySelectorAll('div[id^="login-full-panel"]').forEach((el) => el.remove());

    root.querySelectorAll('div').forEach((el) => {
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed';
      const isFullScreen = style.top === '0px' && style.left === '0px' &&
        (style.width === '100%' || style.width === '100vw') &&
        (style.height === '100%' || style.height === '100vh');
      const hasHighZIndex = parseInt(style.zIndex) >= 1000;
      const hasDarkBg = style.backgroundColor && style.backgroundColor.includes('rgba');

      if (isFixed && isFullScreen && hasHighZIndex && hasDarkBg) {
        const hasLoginChild = el.querySelector('#login-panel-new, [data-bytereplay-mask], [class*="login"]');
        if (hasLoginChild || el.children.length <= 2) {
          el.remove();
        }
      }
    });
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!/douyin\.com/.test(href)) return;
    if (href.includes('/search/') || href.includes('/root/search/')) {
      event.preventDefault();
      event.stopPropagation();
      redirectSearch();
    }
  }

  function observe(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    const observer = new MutationObserver(() => cleanDom(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  function showNotification() {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      padding: 20px 32px;
      border-radius: 12px;
      font-size: 20px;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s, transform 0.3s;
      backdrop-filter: blur(10px);
    `;
    toast.textContent = '免登录和去广告已开启 -Yu';
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function boot() {
    injectStyle();
    cleanDom(document);
    observe(document.body || document.documentElement);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', () => cleanDom(document));
    window.addEventListener('hashchange', () => cleanDom(document));
    showNotification();
    const searchBtn = document.querySelector('button[data-e2e="searchbar-button"]');
    if (searchBtn) {
      searchBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        redirectSearch();
      }, true);
    }
    const searchInput = document.querySelector('input[data-e2e="searchbar-input"]');
    if (searchInput) {
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          redirectSearch();
        }
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
