export interface LiveChannel {
  id: string;
  name: string;
  group: string;
  url: string;
  logo: string;
  tvgId: string;
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) attrs[match[1]] = match[2];
  return attrs;
}

function parseM3U(text: string): LiveChannel[] {
  const out: LiveChannel[] = [];
  let pending: Omit<LiveChannel, 'url'> | null = null;
  let group = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = parseAttributes(line);
      const comma = line.lastIndexOf(',');
      const name = (comma >= 0 ? line.slice(comma + 1) : '').trim() || attrs['tvg-name'] || '未命名频道';
      group = attrs['group-title'] || group || '未分组';
      pending = {
        id: attrs['tvg-id'] || `${group}:${name}`,
        name,
        group,
        logo: attrs['tvg-logo'] || '',
        tvgId: attrs['tvg-id'] || '',
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
        out.push({ ...pending, url: line });
        pending = null;
      } else {
        out.push({
          id: `${group}:${line}`,
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

function parsePlainList(text: string): LiveChannel[] {
  const out: LiveChannel[] = [];
  let group = '未分组';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('#genre#')) {
      group = line.split(',')[0].replace(/#genre#/g, '').trim() || '未分组';
      continue;
    }
    const comma = line.indexOf(',');
    if (comma > 0) {
      const name = line.slice(0, comma).trim();
      const url = line.slice(comma + 1).trim();
      if (/^https?:\/\//i.test(url)) {
        out.push({ id: `${group}:${name}`, name: name || url, group, url, logo: '', tvgId: '' });
      }
      continue;
    }
    if (/^https?:\/\//i.test(line)) {
      out.push({ id: `${group}:${line}`, name: line.split('/').pop() || line, group, url: line, logo: '', tvgId: '' });
    }
  }
  return out;
}

export function parsePlaylist(text: string): LiveChannel[] {
  const list = text.includes('#EXTINF') ? parseM3U(text) : parsePlainList(text);
  const seen = new Set<string>();
  return list.filter((channel) => {
    if (!channel.url || seen.has(channel.url)) return false;
    seen.add(channel.url);
    return true;
  });
}

export function groupChannels(channels: LiveChannel[]): string[] {
  const seen: string[] = [];
  for (const channel of channels) {
    if (!seen.includes(channel.group)) seen.push(channel.group);
  }
  return ['全部', ...seen];
}