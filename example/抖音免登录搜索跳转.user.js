// ==UserScript==
// @name         抖音免登录搜索跳转
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  拦截抖音搜索页面的点击事件，将关键词拼接到搜索URL[/root/search/${keyword}?source=pc_click_hashtag_feed, /jingxuan/search/${keyword}?source=comment_related_search]并跳转
// @author       SHANGDISHIGE109
// @source       https://github.com/SHANGDISHIGE109/douyin-notlogin-search
// @supportURL   https://github.com/SHANGDISHIGE109/douyin-notlogin-search/issues
// @license      MIT
// @match        https://www.douyin.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douyin.com
// @grant        none
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/574581/%E6%8A%96%E9%9F%B3%E5%85%8D%E7%99%BB%E5%BD%95%E6%90%9C%E7%B4%A2%E8%B7%B3%E8%BD%AC.user.js
// @updateURL https://update.greasyfork.org/scripts/574581/%E6%8A%96%E9%9F%B3%E5%85%8D%E7%99%BB%E5%BD%95%E6%90%9C%E7%B4%A2%E8%B7%B3%E8%BD%AC.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // 搜索按钮
    function getSearchButton() {
        return document.querySelector('button[data-e2e="searchbar-button"]');
    }

    // 搜索输入框
    function getSearchInput() {
        return document.querySelector('input[data-e2e="searchbar-input"]');
    }

    // 历史记录
    function getSearchHistoryList() {
        let container = document.querySelector('div[data-e2e="search-history-container"]');
        if (!container) return [];
        return Array.from(container.children);
    }

    // 猜你想搜
    function getSearchGuessList() {
        let container = document.querySelector('div[data-e2e="search-guess-container"]');
        if (!container) return [];
        return Array.from(container.children);
    }

    // 抖音热点
    function getSearchHotList() {
        let container = document.querySelector('div[data-e2e="search-hot-container"]');
        if (!container) return [];
        return Array.from(container.children);
    }

    // 搜索框输入联想建议
    function getSearchSuggestList() {
        return Array.from(document.querySelectorAll('div[data-isrichsug="0"]'));
    }

    // 获取文本内容的通用函数
    function getTextFromElement(element) {
        return element.textContent.trim();
    }

    // 统一的事件处理函数（避免重复创建函数实例）
    const handleSearchItemClick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        const keyword = getTextFromElement(this);
        redirectToSearch(keyword);
    };

    const handleSearchBtnClick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        const searchInput = getSearchInput();
        const inputText = searchInput ? searchInput.value.trim() : '';
        inputText && redirectToSearch(inputText);
    };

    const handleInputEnter = function(event) {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const searchInput = getSearchInput();
            const inputText = searchInput ? searchInput.value.trim() : '';
            inputText && redirectToSearch(inputText);
            return false;
        }
    };

    // 清理已有事件监听（关键：防止重复绑定）
    function clearExistingListeners() {
        const searchInput = getSearchInput();
        searchInput.removeEventListener('keydown', handleInputEnter);

        const searchBtn = getSearchButton();
        searchBtn.removeEventListener('click', handleSearchBtnClick);
    }

    function clearExistingListenersDynamic() {
        // 清理各类搜索项的点击事件
        const allItems = [
            ...getSearchHistoryList(),
            ...getSearchGuessList(),
            ...getSearchHotList(),
            ...getSearchSuggestList(),
            ...oldDynamicElements
        ];
        allItems.forEach(item => item.removeEventListener('click', handleSearchItemClick));
        oldDynamicElements.length = 0;
    }

    // 拦截元素点击事件的函数
    function interceptClickEvents() {
        // 先清理旧监听，再绑定新监听
        clearExistingListeners();
        // 拦截搜索按钮点击
        getSearchButton().addEventListener('click', handleSearchBtnClick, { once: false, passive: false });
        // 拦截搜索输入框回车事件
        getSearchInput().addEventListener('keydown', handleInputEnter, { once: false, passive: false });

        interceptClickEventsDynamic();
    }
    
    function interceptClickEventsDynamic() {
        // 这几个list是动态插入到DOM中的，需要在父容器上使用事件委托来监听点击事件，避免频繁绑定和解绑
        globalObserver = new MutationObserver(function(mutations) {
            let hasNewNodes = mutations.some(mut => mut.type === 'childList' && mut.addedNodes.length > 0);
            if (hasNewNodes) {
                // 延长一点时间，确保DOM完全渲染，减少无效执行
                setTimeout(() => {
                    clearExistingListenersDynamic();
                    // 拦截历史记录/猜你想搜/热点项点击（优化：事件委托替代逐个绑定）
                    const bindItemEvents = (listGetter) => {
                        const items = listGetter();
                        items.forEach(item => {
                            item.addEventListener('click', handleSearchItemClick, { once: false, passive: false });
                        });
                        oldDynamicElements.push(...items);
                    };
                    bindItemEvents(getSearchHistoryList);
                    bindItemEvents(getSearchGuessList);
                    bindItemEvents(getSearchHotList);
                    bindItemEvents(getSearchSuggestList);
                }, 80);
            }
        });
        globalObserver.observe(getSearchButton().parentNode, {
            childList: true,
            subtree: true,
        });
    }

    // 执行重定向到搜索结果页
    function redirectToSearch(keyword) {
        if (keyword && keyword.trim()) {
            const encodedKeyword = encodeURIComponent(keyword.trim());
            const targetUrl = `https://www.douyin.com/root/search/${keyword}?source=comment_related_search`;
            window.location.href = targetUrl;
        } else {
            console.log("关键词为空，无法跳转");
        }
    }
    
    // 初始化函数
    function initializeSearchInterceptor() {
        // 确保脚本的绑定事件在页面原生事件之后执行
        const hasNativeClick = getSearchButton().onclick;
        if (hasNativeClick) {
            interceptClickEvents();
            console.log('搜索拦截器已初始化');
        }else {
            const intervalId = setInterval(() => {
                const hasNativeClick = getSearchButton().onclick;
                if (hasNativeClick) {
                    clearInterval(intervalId);
                    interceptClickEvents();
                    console.log('搜索拦截器已初始化');
                }
            }, 2000);
            intervalIds.push(intervalId);
        }
    }
    
    // 检查并初始化搜索拦截器
    function checkAndInitialize() {
        // 检查搜索按钮和搜索输入框是否存在
        if (getSearchButton() && getSearchInput()) {
            // 元素存在，直接初始化
            initializeSearchInterceptor();
        } else {
            // 如果没有找到搜索按钮或搜索输入框，则设置定时器每两秒检查一次
            const intervalId = setInterval(function() {
                if (getSearchButton() && getSearchInput()) {
                    clearInterval(intervalId);
                    // 元素已加载，执行初始化
                    initializeSearchInterceptor();
                }
            }, 2000);
            intervalIds.push(intervalId);
        }
    }

    // 销毁所有观察者和定时器
    function destroyResources() {
        // 销毁全局DOM观察者
        if (globalObserver) {
            globalObserver.disconnect();
            globalObserver = null;
        }
        // 清理所有定时器
        intervalIds.forEach(id => clearInterval(id));
        intervalIds = [];
        // 清理事件监听
        clearExistingListeners();
        clearExistingListenersDynamic();
        console.log('已销毁所有资源');
    }

    // 只对非登录用户生效
    if (document.querySelectorAll('.semi-button.semi-button-primary').length == 0) {
        return;
    }

    let globalObserver = null;
    let intervalIds = [];
    let oldDynamicElements = [];

    // 页面卸载时清理所有资源
    window.addEventListener('beforeunload', destroyResources);
    // 检查文档加载状态并相应处理
    if (document.readyState === 'loading') {
        // 文档仍在加载中，监听 DOMContentLoaded 事件
        document.addEventListener('DOMContentLoaded', function() {
            checkAndInitialize();
        });
    } else {
        // 文档已加载完成，直接执行初始化
        checkAndInitialize();
    }
})();