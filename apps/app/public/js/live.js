// LittleSU TV 直播页：加载内置 M3U / 纯文本频道列表并播放
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const PAGE_SIZE = 240;

    let channels = [];
    let groups = [];
    let activeGroup = '全部';
    let query = '';
    let limit = PAGE_SIZE;
    let dp = null;
    let hls = null;
    let currentChannel = null;

    function setStatus(message, isError) {
        const el = $('liveStatus');
        if (!el) return;
        el.textContent = message || '';
        el.classList.toggle('error', !!isError);
    }

    function buildGroups() {
        const set = new Set();
        for (const c of channels) set.add(c.group || '未分组');
        groups = ['全部'].concat(Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN')));
    }

    function renderGroups() {
        const box = $('liveGroups');
        box.innerHTML = '';
        for (const g of groups) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'live-group' + (g === activeGroup ? ' active' : '');
            btn.textContent = g;
            btn.addEventListener('click', () => {
                activeGroup = g;
                limit = PAGE_SIZE;
                renderGroups();
                renderList();
            });
            box.appendChild(btn);
        }
    }

    function filteredChannels() {
        const q = query.trim().toLowerCase();
        return channels.filter((c) => {
            if (activeGroup !== '全部' && c.group !== activeGroup) return false;
            if (!q) return true;
            return c.name.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q);
        });
    }

    function renderList() {
        const list = $('liveList');
        const more = $('liveMore');
        list.innerHTML = '';
        const matched = filteredChannels();
        if (!matched.length) {
            const empty = document.createElement('div');
            empty.className = 'live-empty';
            empty.textContent = channels.length ? '没有匹配的频道' : '暂无频道，请刷新或切换直播源';
            list.appendChild(empty);
            more.classList.add('hidden');
            return;
        }
        for (const ch of matched.slice(0, limit)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'live-channel' + (currentChannel && currentChannel.url === ch.url ? ' active' : '');
            const title = document.createElement('strong');
            title.textContent = ch.name;
            const meta = document.createElement('span');
            meta.textContent = ch.group || '未分组';
            btn.append(title, meta);
            btn.addEventListener('click', () => playChannel(ch));
            list.appendChild(btn);
        }
        more.classList.toggle('hidden', matched.length <= limit);
    }

    function destroyPlayer() {
        if (hls) {
            try { hls.destroy(); } catch (e) { /* ignore */ }
            hls = null;
        }
        if (dp) {
            try { dp.destroy(); } catch (e) { /* ignore */ }
            dp = null;
        }
        const box = $('livePlayer');
        if (box) box.innerHTML = '';
    }

    function isHlsUrl(url) {
        return /\.m3u8(\?|#|$)/i.test(url) || /m3u8/i.test(url);
    }

    function playChannel(ch) {
        if (!ch || !ch.url) return;
        currentChannel = ch;
        destroyPlayer();
        setStatus('正在播放：' + ch.name + ' · ' + (ch.group || '未分组'));
        document.title = ch.name + ' - LittleSU TV 直播';

        const hlsUrl = isHlsUrl(ch.url);
        try {
            dp = new DPlayer({
                container: $('livePlayer'),
                autoplay: true,
                theme: '#818cf8',
                lang: 'zh-cn',
                preload: 'auto',
                hotkey: true,
                screenshot: true,
                video: {
                    url: ch.url,
                    type: hlsUrl ? 'hls' : 'auto',
                    customType: hlsUrl ? {
                        hls: function (video) {
                            const hlsConfig = {
                                enableWorker: true,
                                lowLatencyMode: false,
                                backBufferLength: 30,
                                maxBufferLength: 30,
                                manifestLoadingMaxRetry: 2,
                                fragLoadingMaxRetry: 4,
                            };
                            if (typeof TauriHlsLoader !== 'undefined'
                                && typeof isLikelyTauriEnvironment === 'function'
                                && isLikelyTauriEnvironment()
                                && tauriConstants.invoke) {
                                hlsConfig.loader = TauriHlsLoader;
                            }
                            const instance = new Hls(hlsConfig);
                            hls = instance;
                            instance.loadSource(video.src || ch.url);
                            instance.attachMedia(video);
                            instance.on(Hls.Events.MANIFEST_PARSED, function () {
                                video.play().catch(function () { /* autoplay may be blocked */ });
                            });
                            instance.on(Hls.Events.ERROR, function (event, data) {
                                if (data && data.fatal) {
                                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                                        instance.startLoad();
                                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                                        instance.recoverMediaError();
                                    } else {
                                        setStatus('播放失败：' + (data.details || '频道不可用'), true);
                                    }
                                }
                            });
                        },
                    } : undefined,
                },
            });
        } catch (e) {
            setStatus('播放失败：' + (e && e.message ? e.message : e), true);
            return;
        }
        renderList();
    }

    async function loadSource(index, force) {
        const src = LIVE_SOURCES[index];
        if (!src) return;
        if (!force && channels.length && Number(localStorage.getItem('liveSourceIndex')) === index) {
            return;
        }
        setStatus('正在加载 ' + src.name + ' …');
        channels = [];
        groups = [];
        currentChannel = null;
        activeGroup = '全部';
        query = '';
        limit = PAGE_SIZE;
        if ($('liveSearch')) $('liveSearch').value = '';
        renderGroups();
        renderList();
        try {
            const text = await executeApiRequest(src.url, {
                asText: true,
                timeoutSecs: 25,
                sourceForLog: 'live-' + src.name,
            });
            channels = LivePlaylist.parsePlaylist(String(text || ''));
            if (!channels.length) throw new Error('未解析到频道');
            buildGroups();
            renderGroups();
            renderList();
            localStorage.setItem('liveSourceIndex', String(index));
            setStatus('已加载 ' + channels.length + ' 个频道（' + src.name + '）');
        } catch (e) {
            setStatus('加载失败：' + (e && e.message ? e.message : e), true);
            renderList();
        }
    }

    function init() {
        const select = $('liveSource');
        if (!select) return;
        if (typeof LIVE_SOURCES === 'undefined' || !Array.isArray(LIVE_SOURCES) || !LIVE_SOURCES.length) {
            setStatus('未配置直播源', true);
            return;
        }
        LIVE_SOURCES.forEach((src, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = src.name;
            select.appendChild(opt);
        });
        const saved = Number(localStorage.getItem('liveSourceIndex'));
        const index = Number.isInteger(saved) && saved >= 0 && saved < LIVE_SOURCES.length ? saved : 0;
        select.value = String(index);
        select.addEventListener('change', () => loadSource(Number(select.value), true));

        $('liveSearch').addEventListener('input', (e) => {
            query = e.target.value || '';
            limit = PAGE_SIZE;
            renderList();
        });
        $('liveReload').addEventListener('click', () => loadSource(Number(select.value), true));
        const moreBtn = $('liveMore').querySelector('button');
        if (moreBtn) {
            moreBtn.addEventListener('click', () => {
                limit += PAGE_SIZE;
                renderList();
            });
        }
        loadSource(index, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
