// ==UserScript==
// @name         抖音自动跳过广告和直播 (V2.1)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  自动跳过抖音网页版中的直播与广告视频。支持自定义设置检测间隔，等待时长。跳过后如果想看，可以回头继续浏览香喷喷的广告和直播推荐。
// @author       kwx
// @match        https://www.douyin.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douyin.com
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/569561/%E6%8A%96%E9%9F%B3%E8%87%AA%E5%8A%A8%E8%B7%B3%E8%BF%87%E5%B9%BF%E5%91%8A%E5%92%8C%E7%9B%B4%E6%92%AD%20%28V21%29.user.js
// @updateURL https://update.greasyfork.org/scripts/569561/%E6%8A%96%E9%9F%B3%E8%87%AA%E5%8A%A8%E8%B7%B3%E8%BF%87%E5%B9%BF%E5%91%8A%E5%92%8C%E7%9B%B4%E6%92%AD%20%28V21%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        CHECK_INTERVAL: 400, //每400ms检测1次
        DELAY_BEFORE_SKIP: 300, //识别后等待300ms再跳过
        NOTICE_DURATION: 1500, //弹窗显示时长1.5s
        NOTICE_BG_COLOR: '#2F3035' //弹窗底色
    };

    let isSkipping = false;

    function showNotice(text) {
        const notice = document.createElement('div');
        notice.innerText = `已自动跳过：${text}`;
        Object.assign(notice.style, {
            position: 'fixed', top: '25px', left: '50%', transform: 'translateX(-50%)',
            minWidth: '100px', height: '50px', lineHeight: '50px', padding: '0 25px',
            backgroundColor: CONFIG.NOTICE_BG_COLOR, color: '#FFFFFF', fontSize: '14px',
            fontFamily: '"Microsoft YaHei", sans-serif', borderRadius: '12px',
            zIndex: '99999', textAlign: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            pointerEvents: 'none', opacity: '0', transition: 'opacity 0.4s ease'
        });
        document.body.appendChild(notice);
        setTimeout(() => { notice.style.opacity = '1'; }, 20);
        setTimeout(() => {
            notice.style.opacity = '0';
            setTimeout(() => notice.remove(), 400);
        }, CONFIG.NOTICE_DURATION);
    }

    function performSkip(reason, targetItem) {
        if (targetItem.getAttribute('data-skip-pending') === 'true' || isSkipping) return;
        targetItem.setAttribute('data-skip-pending', 'true');

        console.log(`%c[锁定目标] 发现${reason}...`, "color: #face15");

        setTimeout(() => {
            const rect = targetItem.getBoundingClientRect();
            const isActive = rect.top >= -200 && rect.top <= window.innerHeight / 2;

            if (isActive && !isSkipping) {
                isSkipping = true;
                targetItem.setAttribute('data-user-skipped', 'true');
                showNotice(reason);

                const event = new KeyboardEvent('keydown', {
                    key: 'ArrowDown', keyCode: 40, code: 'ArrowDown', which: 40, bubbles: true
                });
                document.dispatchEvent(event);

                // --- 动态追踪 ---
                let checkMovedCount = 0;
                const checkExited = setInterval(() => {
                    const currentRect = targetItem.getBoundingClientRect();
                    checkMovedCount++;

                    // 只要目标离开了屏幕中心区，就提前释放锁，允许下一个视频被扫描
                    const hasMovedOut = currentRect.bottom <= 200 || currentRect.top >= window.innerHeight - 200;

                    if (hasMovedOut || checkMovedCount > 50) {
                        isSkipping = false; // 提前释放
                        clearInterval(checkExited);
                    }
                }, 80);
            }
            targetItem.removeAttribute('data-skip-pending');
        }, CONFIG.DELAY_BEFORE_SKIP);
    }

    function mainDetector() {
        // 如果正在跳过执行中，且旧视频还没移开，则跳过本次扫描
        if (isSkipping) return;

        const items = document.querySelectorAll('[data-e2e="feed-item"]');
        items.forEach(item => {
            if (item.getAttribute('data-user-skipped') === 'true') return;

            const rect = item.getBoundingClientRect();
            const isInView = rect.top >= -150 && rect.top <= window.innerHeight / 2;

            if (isInView) {
                // 直播识别
                const isLive = item.querySelector('[data-e2e="feed-live"]') || item.querySelector('[aria-label*="直播中"]');
                if (isLive) {
                    performSkip("直播", item);
                    return;
                }

                // 广告识别
                const accountArea = item.querySelector('.account');
                const hasAdSvg = accountArea && accountArea.querySelector('svg') && !accountArea.querySelector('.time');
                const hasAdClass = item.querySelector('.cImFBPwT') !== null;
                const hasAdLink = item.querySelector('[data-e2e="ad-link"]') !== null;

                if (hasAdSvg || hasAdClass || hasAdLink) {
                    performSkip("广告", item);
                    return;
                }
            }
        });
    }

    setInterval(mainDetector, CONFIG.CHECK_INTERVAL);
    window.addEventListener('popstate', () => isSkipping = false);
    console.log("%c抖音跳过广告直播脚本已就绪！", "color: #00ff00; font-weight: bold;");
})();