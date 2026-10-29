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
