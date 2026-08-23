/* ----

# Hingle Theme
# By: Dreamer-Paul
# Last Update: 2024.9.2

一个简洁大气，含夜间模式的 Hexo 博客模板。

本代码为奇趣保罗原创，并遵守 MIT 开源协议。欢迎访问我的博客：https://paugram.com

---- */

var Paul_Hingle = function (config) {
    var body = document.body;
    var content = ks.select(".post-content:not(.is-special), .page-content:not(.is-special)");

    // 菜单按钮
    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];

        ks.select(".toggle-btn").onclick = function () {
            menu.classList.toggle("active");
        };

        ks.select(".light-btn").onclick = this.night;

        var search = document.getElementsByClassName("search-btn")[0];
        var bar = document.getElementsByClassName("head-search")[0];

        search.addEventListener("click", function () {
            bar.classList.toggle("active");
        })
    };

    // 关灯切换
    this.night = function () {
        if(body.classList.contains("dark-theme")){
            body.classList.remove("dark-theme");
            document.cookie = "night=false;" + "path=/;" + "max-age=21600";
        }
        else{
            body.classList.add("dark-theme");
            document.cookie = "night=true;" + "path=/;" + "max-age=21600";
        }
    };

    // 目录树
    this.tree = function () {
        const wrap = ks.select(".wrap");
        const headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");

        if (headings.length === 0) {
            return;
        }

        body.classList.add("has-trees");

        // 计算数量，得出最高层级
        const levelCount = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

        headings.forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            levelCount[tagName]++;
        });

        let firstLevel = 1;
        if (levelCount.h1 === 0 && levelCount.h2 > 0) {
            firstLevel = 2;
        }
        else if (levelCount.h1 === 0 && levelCount.h2 === 0 && levelCount.h3 > 0) {
            firstLevel = 3;
        }

        // 目录树节点
        const trees = ks.create("section", {
            class: "article-list",
            html: `<h4><span class="title">目录</span></h4>`
        });

        ks.each(headings, (t, index) => {
            const text = t.innerText;

            t.id = "title-" + index;

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            trees.appendChild(ks.create("a", { class: className, text, href: `#title-${index}` }));
        });

        wrap.appendChild(trees);

        // 绑定元素
        const buttons = ks.select("footer .buttons");
        const btn = ks.create("button", {
            class: "toggle-list",
            attr: [
                {name: "title", value: "切换文章目录"},
            ],
        });
        buttons.appendChild(btn);

        btn.addEventListener("click", () => {
            trees.classList.toggle("active");
        });
    };

    // 自动添加外链
    this.links = function () {
        var l = content.getElementsByTagName("a");

        if(l){
            ks.each(l, function (t) {
                t.target = "_blank";
            });
        }
    };

    // 图片：jsDelivr CDN 加速（失败自动回退）+ 懒加载淡入
    this.images = function () {
        var imgs = content.querySelectorAll("img");

        if(!imgs) return;

        ks.each(imgs, function (img) {
            var src = img.getAttribute("src");
            if(!src || /^(#|data:|https?:)?\/\//.test(src)) return;

            var cdn = config.img_cdn;
            if(cdn && cdn.enable && cdn.repo && src.charAt(0) === "/" && !img.getAttribute("data-cdn")){
                img.setAttribute("data-cdn", "1");
                img.setAttribute("data-origin", src);
                img.src = "https://cdn.jsdelivr.net/gh/" + cdn.repo + src.split("?")[0];

                img.addEventListener("error", function () {
                    var origin = img.getAttribute("data-origin");
                    if(origin){
                        img.removeAttribute("data-origin");
                        img.src = origin;
                    }
                });
            }

            // 懒加载图片柔和淡入（不影响无 JS 场景）
            if(img.loading === "lazy" && !img.complete){
                img.classList.add("img-fade");
            }
        });
    };

    // 代码块：语言标签 + 复制按钮
    this.codeBlocks = function () {
        var pres = content.querySelectorAll("pre");

        if(!pres) return;

        ks.each(pres, function (pre) {
            if(pre.parentNode && pre.parentNode.className.indexOf("code-block") > -1) return;

            // 无语言标识的 <pre><code> 自动补 language-none
            if(pre.className.indexOf("language-") === -1){
                pre.className += " language-none";
                var c = pre.querySelector("code");
                if(c) c.className += " language-none";
            }

            var lang = pre.getAttribute("data-language");
            if(!lang){
                var m = pre.className.match(/language-([\w-]+)/);
                lang = m ? m[1] : "text";
            }

            var wrap = document.createElement("div");
            wrap.className = "code-block";

            var label = document.createElement("span");
            label.className = "code-lang";
            label.textContent = lang;

            var copy = document.createElement("button");
            copy.className = "code-copy";
            copy.type = "button";
            copy.textContent = "复制";
            copy.title = "复制代码";

            wrap.appendChild(label);
            wrap.appendChild(copy);
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            copy.addEventListener("click", function () {
                var code = pre.querySelector("code") || pre;
                var text = code.innerText || code.textContent;

                var done = function () {
                    copy.textContent = "已复制";
                    copy.classList.add("copied");
                    setTimeout(function () {
                        copy.textContent = "复制";
                        copy.classList.remove("copied");
                    }, 1500);
                };

                if(navigator.clipboard && window.isSecureContext){
                    navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
                }
                else{
                    legacyCopy(text, done);
                }
            });
        });

        function legacyCopy(text, done) {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
            document.body.appendChild(ta);
            ta.select();
            try{ document.execCommand("copy"); done(); }catch(e){}
            document.body.removeChild(ta);
        }
    };

    // 小羊桌宠：可拖动 + 点击播放学习音乐 + 简单互动
    this.pet = function () {
        var pet = document.getElementById("pet");
        if(!pet) return;

        var bubble = pet.querySelector(".pet-bubble");
        var musicCfg = config.music;
        var tracks = (musicCfg && musicCfg.enable && musicCfg.list) ? musicCfg.list : [];
        var audio = null;
        var playing = false;
        var index = 0;

        var msgs = ["咩~ 一起学习吧！", "加油鸭！", "今天也要元气满满哦～", "写代码记得多喝水", "累了就休息一下 QwQ", "坚持就是胜利！"];

        function say(text){
            if(!bubble) return;
            bubble.textContent = text;
            bubble.classList.add("show");
            clearTimeout(say.timer);
            say.timer = setTimeout(function () {
                bubble.classList.remove("show");
            }, 2200);
        }

        // ---- 音乐 ----
        if(tracks.length){
            audio = new Audio();
            audio.preload = "none";

            // 恢复音量
            var savedVol = parseFloat(localStorage.getItem("hingle_music_vol"));
            audio.volume = isNaN(savedVol) ? (musicCfg.volume !== undefined ? musicCfg.volume : 0.5) : savedVol;

            // 恢复曲目
            var savedIndex = parseInt(localStorage.getItem("hingle_music_index"), 10);
            if(!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < tracks.length) index = savedIndex;

            function load(i){
                index = (i + tracks.length) % tracks.length;
                audio.src = tracks[index].url;
                localStorage.setItem("hingle_music_index", String(index));
            }

            function play(){
                if(!audio.src) load(index);
                var p = audio.play();
                if(p && p.then){ // 现代浏览器返回 Promise
                    p.then(function () {
                        playing = true;
                        pet.classList.add("playing");
                    }).catch(function () { /* 浏览器拦截自动播放 */ });
                }
                else{ // 兜底
                    playing = true;
                    pet.classList.add("playing");
                }
            }

            function pause(){
                audio.pause();
                playing = false;
                pet.classList.remove("playing");
            }

            function toggle(){
                playing ? pause() : play();
                say(playing ? "♪ 正在播放：《" + tracks[index].title + "》" : "咩～ 音乐暂停啦");
            }

            function next(){
                load(index + 1);
                if(playing){
                    var p = audio.play();
                    if(p && p.then) p.catch(function(){});
                }
                say("♪ 换一首：《" + tracks[index].title + "》");
            }

            audio.addEventListener("ended", function () {
                load(index + 1);
                if(playing){
                    var p = audio.play();
                    if(p && p.then) p.catch(function(){});
                }
            });
            audio.addEventListener("error", function () { // 曲目失效自动跳过
                load(index + 1);
                if(playing){
                    var p = audio.play();
                    if(p && p.then) p.catch(function(){});
                }
            });

            load(index);
        }

        // ---- 点击 / 双击 ----
        var moved = false;
        var clickTimer = null;

        pet.addEventListener("click", function () {
            if(moved){ moved = false; return; }

            if(clickTimer){ // 双击 → 下一首
                clearTimeout(clickTimer);
                clickTimer = null;
                if(tracks.length){ next(); }
                else{ say(msgs[Math.floor(Math.random() * msgs.length)]); }
                return;
            }

            clickTimer = setTimeout(function () {
                clickTimer = null;
                if(tracks.length){ toggle(); }
                else{ say(msgs[Math.floor(Math.random() * msgs.length)]); }
            }, 260);
        });

        // ---- 拖动（鼠标左键 / 触摸） ----
        var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

        pet.addEventListener("pointerdown", function (e) {
            if(e.button !== undefined && e.button !== 0) return;
            dragging = true;
            moved = false;
            sx = e.clientX;
            sy = e.clientY;
            var r = pet.getBoundingClientRect();
            ox = r.left;
            oy = r.top;
            pet.classList.add("dragging");
            if(pet.setPointerCapture) pet.setPointerCapture(e.pointerId);
        });

        pet.addEventListener("pointermove", function (e) {
            if(!dragging) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if(Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            var left = Math.min(window.innerWidth - 60, Math.max(0, ox + dx));
            var top = Math.min(window.innerHeight - 40, Math.max(0, oy + dy));
            pet.style.left = left + "px";
            pet.style.top = top + "px";
        });

        function endDrag(){
            if(!dragging) return;
            dragging = false;
            pet.classList.remove("dragging");
            if(moved){
                try{
                    localStorage.setItem("hingle_pet_pos", JSON.stringify({left: pet.style.left, top: pet.style.top}));
                }catch(err){}
            }
        }
        pet.addEventListener("pointerup", endDrag);
        pet.addEventListener("pointercancel", endDrag);

        // 恢复上次位置
        try{
            var pos = JSON.parse(localStorage.getItem("hingle_pet_pos"));
            if(pos && pos.left !== undefined){
                pet.style.left = pos.left;
                pet.style.top = pos.top;
            }
        }catch(err){}

        // 欢迎气泡（首次访问才显示引导）
        if(!localStorage.getItem("hingle_pet_welcomed")){
            try{ localStorage.setItem("hingle_pet_welcomed", "1"); }catch(err){}
            setTimeout(function () {
                say(tracks.length
                    ? "咩～ 欢迎来到本站！点击我可以播放学习音乐哦"
                    : "咩～ 欢迎来到本站！");
            }, 800);
        }
    };

    this.comment_list = function () {
        ks(".comment-content [href^='#comment']").each(function (t) {
            var item = ks.select(t.getAttribute("href"));

            t.onmouseover = function () {
                item.classList.add("active");
            };

            t.onmouseout = function () {
                item.classList.remove("active");
            };
        });
    };

    // 返回页首
    this.to_top = function () {
        var btn = document.getElementsByClassName("to-top")[0];
        var scroll = document.documentElement.scrollTop || document.body.scrollTop;

        scroll >= window.innerHeight / 2 ? btn.classList.add("active") : btn.classList.remove("active");
    };

    this.header();

    if(content){
        this.tree();
        this.links();
        this.comment_list();
        this.images();
        this.codeBlocks();
    }

    // 返回页首
    window.addEventListener("scroll", this.to_top);

    // 如果开启自动夜间模式
    if(config.night){
        var hour = new Date().getHours();

        if(document.cookie.indexOf("night") === -1 && (hour <= 5 || hour >= 22)){
            document.body.classList.add("dark-theme");
            document.cookie = "night=true;" + "path=/;" + "max-age=21600";
        }
    }
    else if(document.cookie.indexOf("night") !== -1){
        if(document.cookie.indexOf("night=true") !== -1){
            document.body.classList.add("dark-theme");
        }
        else{
            document.body.classList.remove("dark-theme");
        }
    }

    // 如果开启复制内容提示
    if(config.copyright){
        document.oncopy = function () {
            ks.notice("复制内容请注明来源并保留版权信息！", {color: "yellow", overlay: true})
        };
    }

    //
    // ! Hexo 特别功能
    //

    // Hexo 百度搜索
    this.hexo_search = function () {
        var form = ks.select(".head-search"), input = ks.select(".head-search input");

        form.onsubmit = function (ev) {
            ev.preventDefault();

            window.open("https://www.baidu.com/s?wd=site:" + location.host + " " + input.value.trim());
        }
    }

    this.hexo_search();

    // 小羊桌宠
    this.pet();
};

// 图片缩放
ks.image(".post-content:not(.is-special) img, .page-content:not(.is-special) img");

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Hingle %c https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}
