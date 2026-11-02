/** 将 SRT 转为 WebVTT；已是 VTT 的内容原样返回。 */
export function normalizeSubtitle(text: string): string {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (/^WEBVTT/i.test(cleaned)) return cleaned;
  return srtToVtt(cleaned);
}

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

const TIMELINE = /^((?:\d{1,3}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}\.\d{3})(.*)$/;

function parseTimestamp(value: string): number {
  const [clock, millis = '0'] = value.split('.');
  const parts = clock.split(':').map(Number);
  const [hours, minutes, seconds] = parts.length >= 3
    ? [parts[0], parts[1], parts[2]]
    : [0, parts[0], parts[1]];
  return hours * 3600 + minutes * 60 + seconds + Number(millis) / 1000;
}

function formatTimestamp(total: number): string {
  let millis = Math.max(0, Math.round(total * 1000));
  const hours = Math.floor(millis / 3600000);
  millis -= hours * 3600000;
  const minutes = Math.floor(millis / 60000);
  millis -= minutes * 60000;
  const seconds = Math.floor(millis / 1000);
  millis -= seconds * 1000;
  const part = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${part(hours)}:${part(minutes)}:${part(seconds)}.${part(millis, 3)}`;
}

function shiftBlock(block: string, offsetSeconds: number): string | null {
  const lines = block.split('\n');
  const index = lines.findIndex((line) => TIMELINE.test(line));
  if (index < 0) return block;
  const match = lines[index].match(TIMELINE);
  if (!match) return block;
  const start = parseTimestamp(match[1]) + offsetSeconds;
  const end = parseTimestamp(match[2]) + offsetSeconds;
  if (end <= 0) return null;
  lines[index] = `${formatTimestamp(Math.max(0, start))} --> ${formatTimestamp(end)}${match[3] || ''}`;
  return lines.join('\n');
}

/** 将 WebVTT 的时间轴整体平移；偏移后结束时间不晚于 0 的 cue 会被丢弃。 */
export function shiftVtt(vtt: string, offsetSeconds: number): string {
  if (!offsetSeconds) return vtt;
  return vtt
    .split(/\n{2,}/)
    .map((block) => (/-->/.test(block) ? shiftBlock(block, offsetSeconds) : block))
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

export function clampSubtitleOffset(value: number): number {
  return Math.min(10, Math.max(-10, Math.round(value * 2) / 2));
}
