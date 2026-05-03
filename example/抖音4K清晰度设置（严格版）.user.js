// ==UserScript==
// @name         抖音4K清晰度设置（严格版）
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  自动将抖音视频清晰度设置为4K
// @author       Your name
// @match        https://*.douyin.com/*
// @icon         https://www.douyin.com/favicon.ico
// @run-at       document-end
// @license      MIT
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/521661/%E6%8A%96%E9%9F%B34K%E6%B8%85%E6%99%B0%E5%BA%A6%E8%AE%BE%E7%BD%AE%EF%BC%88%E4%B8%A5%E6%A0%BC%E7%89%88%EF%BC%89.user.js
// @updateURL https://update.greasyfork.org/scripts/521661/%E6%8A%96%E9%9F%B34K%E6%B8%85%E6%99%B0%E5%BA%A6%E8%AE%BE%E7%BD%AE%EF%BC%88%E4%B8%A5%E6%A0%BC%E7%89%88%EF%BC%89.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const QualitySessionKey = "MANUAL_SWITCH";
    
    // 清晰度配置定义（严格按照参考代码）
    const definition = [
        {
            done: 1,
            gearClarity: "20",
            gearName: "超清 4K",
            gearType: -2,
            qualityType: 72,
        },
        {
            done: 1,
            gearClarity: "10",
            gearName: "超清 2K",
            gearType: -1,
            qualityType: 7,
        },
        {
            done: 1,
            gearClarity: "5",
            gearName: "高清 1080P",
            gearType: 1,
            qualityType: 2,
        },
        {
            done: 1,
            gearClarity: "4",
            gearName: "高清 720P",
            gearType: 2,
            qualityType: 15,
        },
        {
            done: 1,
            gearClarity: "3",
            gearName: "标清 540P",
            gearType: 3,
            qualityType: 21,
        },
        {
            done: 1,
            gearClarity: "2",
            gearName: "极速",
            gearType: 4,
            qualityType: 21,
        },
        {
            done: 1,
            gearClarity: "0",
            gearName: "智能",
            gearType: 0,
        },
    ];

    // 日志工具
    const log = {
        info: (msg) => console.log(`%c[抖音清晰度] ${msg}`, 'color: #409EFF'),
        success: (msg) => console.log(`%c[抖音清晰度] ✅ ${msg}`, 'color: #67C23A'),
        error: (msg) => console.log(`%c[抖音清晰度] ❌ ${msg}`, 'color: #F56C6C'),
        warn: (msg) => console.log(`%c[抖音清晰度] ⚠️ ${msg}`, 'color: #E6A23C')
    };

    // 设置视频清晰度的核心函数
    function setVideoQuality(value) {
        window.sessionStorage.setItem(QualitySessionKey, value);
    }

    // 选择并设置清晰度（mode 为 gearType 值）
    function selectVideoQuality(mode) {
        log.info("选择视频清晰度: " + mode);
        
        const choose = definition.find((item) => item.gearType === mode);
        
        if (choose) {
            const chooseStr = JSON.stringify(choose);
            
            // 使用定时器重复设置 10 秒，每 250ms 一次
            const intervalId = setInterval(() => {
                setVideoQuality(chooseStr);
            }, 250);
            
            setTimeout(() => {
                clearInterval(intervalId);
            }, 10 * 1000); // 10秒后停止
            
            log.success("设置当前视频的清晰度: " + choose.gearName);
        } else {
            log.error("该清晰度不存在: " + mode);
        }
    }

    // ==================== 普通视频页面处理 ====================
    
    function handleVideoPage() {
        if (location.href.includes('/live/')) {
            return; // 直播页面不处理
        }
        
        // 设置为 4K (-2)
        selectVideoQuality(-2);
    }

    // 监听URL变化
    function monitorUrlChange() {
        let lastUrl = location.href;
        
        const urlObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                
                // URL变化后延迟执行
                setTimeout(() => {
                    handleVideoPage();
                }, 1000);
            }
        });
        
        urlObserver.observe(document, { subtree: true, childList: true });
    }

    // ==================== 直播页面处理 ====================
    
    let liveQualityInterval = null;

    function clearLiveInterval() {
        if (liveQualityInterval) {
            clearInterval(liveQualityInterval);
            liveQualityInterval = null;
        }
    }

    function handleLivePage() {
        if (!location.href.includes('/live/')) {
            clearLiveInterval();
            return;
        }

        clearLiveInterval(); // 清除旧的定时器
        
        liveQualityInterval = setInterval(function() {
            let curdefinition = "";
            let highestdefinition = "";
            let find = 0;

            const qualityElement = document.querySelector(
                '#_douyin_live_scroll_container_ xg-controls div[data-e2e="quality"]'
            );
            
            if (qualityElement) {
                curdefinition = qualityElement.textContent;
            }

            const qualityOptions = document.querySelectorAll(
                '#_douyin_live_scroll_container_ xg-controls div[data-e2e="quality-selector"] > div'
            );
            
            qualityOptions.forEach(option => {
                highestdefinition = option.textContent;
                
                if ((highestdefinition.indexOf("登录即享") > -1 && highestdefinition.indexOf("高清") < 0) || find > 0) {
                    return;
                }

                if (highestdefinition !== "") {
                    log.info("当前清晰度 " + curdefinition + " 可选最高 " + highestdefinition);
                    
                    if (highestdefinition.indexOf(curdefinition) < 0) {
                        log.info("点击切换清晰度");
                        option.click();
                    } else {
                        clearLiveInterval();
                    }
                    find = 1;
                }
            });
        }, 1000);
    }

    // ==================== 主控制逻辑 ====================
    
    function init() {
        log.info("脚本已启动");
        
        // 初始执行
        setTimeout(() => {
            if (location.href.includes('/live/')) {
                handleLivePage();
            } else {
                handleVideoPage();
            }
        }, 1000);
        
        // 监听URL变化
        let lastUrl = location.href;
        const pageObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                clearLiveInterval();
                
                setTimeout(() => {
                    if (location.href.includes('/live/')) {
                        handleLivePage();
                    } else {
                        handleVideoPage();
                    }
                }, 1000);
            }
        });
        
        pageObserver.observe(document, { subtree: true, childList: true });
    }

    // 页面卸载时清理
    window.addEventListener('unload', () => {
        clearLiveInterval();
    });

    // 启动脚本
    document.addEventListener('DOMContentLoaded', init);
    
    // 页面完全加载后再次执行
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (!location.href.includes('/live/')) {
                handleVideoPage();
            }
        }, 500);
    });

    log.success("脚本加载完成");
})();