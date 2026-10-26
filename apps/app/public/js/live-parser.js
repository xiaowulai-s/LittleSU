// 直播频道列表解析（M3U / 纯文本 name,url），浏览器与 Node 均可使用
(function (root) {
    'use strict';

    function parseAttributes(line) {
        const attrs = {};
        const re = /([\w-]+)="([^"]*)"/g;
        let m;
        while ((m = re.exec(line))) attrs[m[1]] = m[2];
        return attrs;
    }

    function parseM3U(text) {
        const out = [];
        let pending = null;
        let group = '';
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('#EXTINF')) {
                const attrs = parseAttributes(line);
                const comma = line.lastIndexOf(',');
                const name = (comma >= 0 ? line.slice(comma + 1) : '').trim()
                    || attrs['tvg-name'] || '未命名频道';
                group = attrs['group-title'] || group || '未分组';
                pending = {
                    name: name,
                    group: group,
                    logo: attrs['tvg-logo'] || '',
                    tvgId: attrs['tvg-id'] || '',
                    url: '',
                };
                continue;
            }
            if (line.startsWith('#EXTGRP:')) {
                group = line.slice(8).trim() || group;
                if (pending) pending.group = group;
                continue;
            }
            if (line.startsWith('#')) continue;
            if (/^https?:\/\//i.test(line)) {
                if (pending) {
                    pending.url = line;
                    out.push(pending);
                    pending = null;
                } else {
                    out.push({
                        name: line.split('/').pop() || line,
                        group: group || '未分组',
                        url: line,
                        logo: '',
                        tvgId: '',
                    });
                }
            }
        }
        return out;
    }

    function parsePlainList(text) {
        const out = [];
        let group = '未分组';
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) continue;
            if (line.includes('#genre#')) {
                group = line.split(',')[0].replace(/#genre#/g, '').trim() || '未分组';
                continue;
            }
            if (!line.includes(',')) {
                if (/^https?:\/\//i.test(line)) {
                    out.push({ name: line.split('/').pop() || line, group: group, url: line, logo: '', tvgId: '' });
                }
                continue;
            }
            const idx = line.indexOf(',');
            const name = line.slice(0, idx).trim();
            const url = line.slice(idx + 1).trim();
            if (/^https?:\/\//i.test(url)) {
                out.push({ name: name || url.split('/').pop() || url, group: group, url: url, logo: '', tvgId: '' });
            }
        }
        return out;
    }

    function parsePlaylist(text) {
        const list = text.includes('#EXTINF') ? parseM3U(text) : parsePlainList(text);
        const seen = new Set();
        return list.filter((c) => {
            if (!c.url || seen.has(c.url)) return false;
            seen.add(c.url);
            return true;
        });
    }

    const api = { parsePlaylist: parsePlaylist, parseM3U: parseM3U, parsePlainList: parsePlainList };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LivePlaylist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
