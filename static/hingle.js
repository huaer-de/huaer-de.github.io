/* ----

# Hingle Theme (Optimized)
# Based on: https://github.com/Dreamer-Paul/Hingle (MIT)

功能模块：
  1. 页眉交互（菜单 / 夜间模式 / 搜索）
  2. 文章目录树
  3. 外链处理
  4. 图片：jsDelivr CDN 加速（失败自动回退）+ 淡入效果
  5. 代码块：语言标签 + 一键复制（Prism 已由构建时预处理，页面零高亮开销）
  6. 背景音乐播放器（歌单在主题 _config.yml 中配置）
  7. 回到顶部 / 版权提示 / 评论锚点高亮

---- */

(function (window) {
    'use strict';

    /* ---------- 工具 ---------- */
    var CONFIG = window.__HINGLE_CONFIG__ || {};
    var THEME = CONFIG.theme || {};
    var MUSIC = CONFIG.music || null;
    var IMG_CDN = CONFIG.img_cdn || null;

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    // 防抖 / 节流
    function throttle(fn) {
        var ticking = false;
        return function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                fn();
                ticking = false;
            });
        };
    }

    function setCookie(name, value, hours) {
        document.cookie = name + "=" + value + ";path=/;max-age=" + (hours * 3600);
    }

    function copyText(text, done) {
        function legacy() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); } catch (e) { /* noop */ }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, legacy);
        } else {
            legacy();
        }
    }

    /* ---------- 主体 ---------- */
    var Paul_Hingle = function () {
        var body = document.body;
        var content = $(".post-content:not(.is-special), .page-content:not(.is-special)");

        /* 1. 页眉交互 */
        this.header = function () {
            var menu = $(".head-menu");
            var toggle = $(".toggle-btn");

            if (menu && toggle) {
                toggle.addEventListener("click", function () {
                    menu.classList.toggle("active");
                });
                // 点击菜单内的链接后自动收起（手机端）
                menu.addEventListener("click", function (e) {
                    if (e.target.tagName === "A") menu.classList.remove("active");
                });
            }

            var light = $(".light-btn");
            if (light) light.addEventListener("click", this.night);

            var searchBtn = $(".search-btn");
            var bar = $(".head-search");
            if (searchBtn && bar) {
                searchBtn.addEventListener("click", function () {
                    bar.classList.toggle("active");
                    var input = bar.querySelector("input");
                    if (bar.classList.contains("active") && input) input.focus();
                });
            }

            // 百度站内搜索
            var form = $(".head-search");
            if (form) {
                form.addEventListener("submit", function (ev) {
                    ev.preventDefault();
                    var input = form.querySelector("input");
                    var keyword = input ? input.value.trim() : "";
                    if (keyword) {
                        window.open("https://www.baidu.com/s?wd=site:" + location.host + " " + encodeURIComponent(keyword));
                    }
                });
            }
        };

        /* 2. 夜间模式 */
        this.night = function () {
            if (body.classList.contains("dark-theme")) {
                body.classList.remove("dark-theme");
                setCookie("night", "false", 6);
            } else {
                body.classList.add("dark-theme");
                setCookie("night", "true", 6);
            }
        };

        this.initNight = function () {
            var cookie = document.cookie;
            if (THEME.night && cookie.indexOf("night") === -1) {
                var hour = new Date().getHours();
                if (hour <= 5 || hour >= 22) {
                    body.classList.add("dark-theme");
                    setCookie("night", "true", 6);
                }
            } else if (cookie.indexOf("night=true") !== -1) {
                body.classList.add("dark-theme");
            }
        };

        /* 3. 文章目录树 */
        this.tree = function () {
            if (!content) return;
            var headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");
            if (headings.length === 0) return;

            body.classList.add("has-trees");

            // 计算最高起始层级
            var levelCount = { h1: 0, h2: 0, h3: 0 };
            headings.forEach(function (el) {
                var tag = el.tagName.toLowerCase();
                if (levelCount[tag] !== undefined) levelCount[tag]++;
            });

            var firstLevel = 1;
            if (levelCount.h1 === 0 && levelCount.h2 > 0) firstLevel = 2;
            else if (levelCount.h1 === 0 && levelCount.h2 === 0 && levelCount.h3 > 0) firstLevel = 3;

            var trees = document.createElement("section");
            trees.className = "article-list";
            trees.innerHTML = '<h4><span class="title">目录</span></h4>';

            headings.forEach(function (t, index) {
                t.id = "title-" + index;
                var level = Number(t.tagName.substring(1)) - firstLevel + 1;
                var a = document.createElement("a");
                a.className = "item-" + level;
                a.textContent = t.innerText;
                a.href = "#title-" + index;
                trees.appendChild(a);
            });

            var wrap = $(".wrap");
            if (wrap) wrap.appendChild(trees);

            var buttons = $("footer .buttons");
            if (buttons) {
                var btn = document.createElement("button");
                btn.className = "toggle-list";
                btn.type = "button";
                btn.title = "切换文章目录";
                btn.setAttribute("aria-label", "切换文章目录");
                buttons.appendChild(btn);

                btn.addEventListener("click", function () {
                    trees.classList.toggle("active");
                });
            }
        };

        /* 4. 外链新窗口打开 */
        this.links = function () {
            if (!content) return;
            $$("a", content).forEach(function (a) {
                if (a.host && a.host !== location.host) {
                    a.target = "_blank";
                    a.rel = "noopener";
                }
            });
        };

        /* 5. 图片：CDN 加速 + 淡入 */
        this.images = function () {
            if (!content) return;

            $$("img", content).forEach(function (img) {
                var src = img.getAttribute("src");
                if (!src || /^(#|data:|https?:)?\/\//.test(src)) return;

                // jsDelivr CDN 重写，失败自动回退
                if (IMG_CDN && IMG_CDN.enable && IMG_CDN.repo && src.charAt(0) === "/") {
                    var path = src.split("?")[0];
                    if (!img.dataset.cdn) {
                        img.dataset.cdn = "1";
                        img.dataset.origin = src;
                        img.src = "https://cdn.jsdelivr.net/gh/" + IMG_CDN.repo + path;
                        img.addEventListener("error", function () {
                            if (img.dataset.origin) {
                                img.src = img.dataset.origin;
                                delete img.dataset.origin;
                            }
                        });
                    }
                }

                // 懒加载图片淡入（仅在 JS 可用时生效，不影响无 JS 场景）
                if (img.loading === "lazy" && !img.complete) {
                    img.classList.add("img-fade");
                }
            });
        };

        /* 6. 代码块增强：语言标签 + 复制按钮 */
        this.codeBlocks = function () {
            if (!content) return;

            $$("pre", content).forEach(function (pre) {
                if (pre.parentNode && pre.parentNode.classList.contains("code-block")) return;

                // 无语言标识的 <pre><code> 自动补 language-none，保证样式统一
                if (!pre.className.match(/language-[\w-]+/)) {
                    pre.classList.add("language-none");
                    var c = pre.querySelector("code");
                    if (c) c.classList.add("language-none");
                }

                var lang = (pre.getAttribute("data-language") || (pre.className.match(/language-([\w-]+)/) || [])[1] || "text");

                // 外壳 + 头部
                var wrap = document.createElement("div");
                wrap.className = "code-block";

                var head = document.createElement("div");
                head.className = "code-head";

                var label = document.createElement("span");
                label.className = "code-lang";
                label.textContent = lang;

                var copy = document.createElement("button");
                copy.className = "code-copy";
                copy.type = "button";
                copy.textContent = "复制";
                copy.title = "复制代码";
                copy.setAttribute("aria-label", "复制代码");

                head.appendChild(label);
                head.appendChild(copy);
                wrap.appendChild(head);

                pre.parentNode.insertBefore(wrap, pre);
                wrap.appendChild(pre);

                copy.addEventListener("click", function () {
                    var code = pre.querySelector("code") || pre;
                    copyText(code.innerText, function () {
                        copy.textContent = "已复制 ✓";
                        copy.classList.add("copied");
                        setTimeout(function () {
                            copy.textContent = "复制";
                            copy.classList.remove("copied");
                        }, 1600);
                    });
                });
            });
        };

        /* 7. 背景音乐播放器 */
        this.music = function () {
            if (!MUSIC || !MUSIC.enable || !MUSIC.list || !MUSIC.list.length) return;

            var tracks = MUSIC.list;
            var player = $("#music-player");
            if (!player) return;

            var audio = new Audio();
            audio.preload = "none"; // 点击播放后才加载，避免浪费流量

            var els = {
                btn: $(".music-btn", player),
                panel: $(".music-panel", player),
                play: $(".music-play", player),
                prev: $(".music-prev", player),
                next: $(".music-next", player),
                vol: $(".music-vol", player),
                bar: $(".music-bar", player),
                nowBar: $(".music-now-bar", player),
                time: $(".music-time", player),
                title: $(".music-title", player),
                artist: $(".music-artist", player),
                items: $$(".music-item", player)
            };

            var index = 0;
            var playing = false;

            // 恢复上次的音量与曲目
            var savedVol = parseFloat(localStorage.getItem("hingle_music_vol"));
            if (!isNaN(savedVol)) audio.volume = Math.min(1, Math.max(0, savedVol));
            else audio.volume = MUSIC.volume !== undefined ? MUSIC.volume : 0.5;
            els.vol.value = Math.round(audio.volume * 100);

            var savedIndex = parseInt(localStorage.getItem("hingle_music_index"), 10);
            if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < tracks.length) index = savedIndex;

            function fmt(sec) {
                if (!isFinite(sec) || sec < 0) sec = 0;
                var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
                return m + ":" + (s < 10 ? "0" : "") + s;
            }

            function render() {
                var t = tracks[index];
                els.title.textContent = t.title || "未知曲目";
                els.artist.textContent = t.artist || "";
                els.items.forEach(function (item, i) {
                    item.classList.toggle("playing", i === index);
                });
                player.classList.toggle("playing", playing);
            }

            function load(i, autoplay) {
                index = (i + tracks.length) % tracks.length;
                audio.src = tracks[index].url;
                localStorage.setItem("hingle_music_index", String(index));
                els.nowBar.style.width = "0%";
                els.time.textContent = "0:00 / 0:00";
                render();
                if (autoplay) {
                    audio.play().catch(function () { /* 浏览器拦截自动播放时静默 */ });
                }
            }

            function togglePlay() {
                if (playing) { audio.pause(); playing = false; render(); }
                else {
                    if (!audio.src) load(index, false);
                    audio.play().then(function () {
                        playing = true;
                        render();
                    }).catch(function () { /* noop */ });
                }
            }

            // 事件绑定
            els.btn.addEventListener("click", function (e) {
                e.stopPropagation();
                player.classList.toggle("active");
                els.btn.setAttribute("aria-expanded", player.classList.contains("active") ? "true" : "false");
            });
            els.play.addEventListener("click", function () { togglePlay(); });
            els.prev.addEventListener("click", function () { load(index - 1, true); });
            els.next.addEventListener("click", function () { load(index + 1, true); });

            els.vol.addEventListener("input", function () {
                audio.volume = els.vol.value / 100;
                localStorage.setItem("hingle_music_vol", String(audio.volume));
            });

            audio.addEventListener("timeupdate", function () {
                if (!audio.duration) return;
                els.nowBar.style.width = (audio.currentTime / audio.duration * 100) + "%";
                els.time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
            });
            audio.addEventListener("loadedmetadata", function () {
                els.time.textContent = "0:00 / " + fmt(audio.duration);
            });
            audio.addEventListener("ended", function () { load(index + 1, true); });
            audio.addEventListener("error", function () { load(index + 1, true); }); // 曲目失效自动跳过

            els.bar.addEventListener("click", function (e) {
                if (!audio.duration) return;
                var rect = els.bar.getBoundingClientRect();
                var ratio = (e.clientX - rect.left) / rect.width;
                audio.currentTime = ratio * audio.duration;
            });

            // 歌单点击
            els.items.forEach(function (item) {
                item.addEventListener("click", function () {
                    load(parseInt(item.dataset.index, 10) || 0, true);
                });
            });

            // 点击空白处关闭面板
            document.addEventListener("click", function (e) {
                if (!player.contains(e.target)) player.classList.remove("active");
            });
            document.addEventListener("keydown", function (e) {
                if (e.key === "Escape") player.classList.remove("active");
            });

            // 首次加载曲目信息（不播放）
            render();

            // 自动播放（大概率被浏览器拦截，仅作为配置项保留）
            if (MUSIC.autoplay) {
                document.addEventListener("pointerdown", function once() {
                    document.removeEventListener("pointerdown", once);
                    if (!playing) togglePlay();
                });
            }
        };

        /* 8. 回到顶部 */
        this.toTop = function () {
            var btn = $(".to-top");
            if (!btn) return;

            var update = throttle(function () {
                var scroll = window.scrollY || document.documentElement.scrollTop || 0;
                btn.classList.toggle("active", scroll >= window.innerHeight / 2);
            });

            window.addEventListener("scroll", update, { passive: true });
            update();

            btn.addEventListener("click", function () {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        };

        /* 9. 版权提示 */
        this.copyright = function () {
            if (!THEME.copyright) return;
            document.addEventListener("copy", function () {
                ks.notice("复制内容请注明来源并保留版权信息！", { color: "yellow", overlay: true });
            });
        };

        /* 10. 评论锚点高亮 */
        this.commentList = function () {
            if (!content) return;
            $$(".comment-content [href^='#comment']", content).forEach(function (t) {
                var item = $(t.getAttribute("href"));
                if (!item) return;
                t.addEventListener("mouseenter", function () { item.classList.add("active"); });
                t.addEventListener("mouseleave", function () { item.classList.remove("active"); });
            });
        };

        // ---- 初始化 ----
        this.header();
        this.initNight();
        this.toTop();
        this.copyright();

        if (content) {
            this.tree();
            this.links();
            this.images();
            this.codeBlocks();
            this.commentList();

            // 图片灯箱（来自 kico.js）
            if (window.ks) {
                ks.image(".post-content:not(.is-special) img, .page-content:not(.is-special) img");
            }
        }

        this.music();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { new Paul_Hingle(); });
    } else {
        new Paul_Hingle();
    }
})(window);

// 版权声明
if (window.console && window.console.log) {
    console.log("%c Hingle %c https://paugram.com ", "color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;", "margin: 1em 0; padding: 5px 0; background: #efefef;");
}
