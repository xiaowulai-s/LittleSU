import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSourceListPayload } from './source-list';

describe('sources/littlesu-sources.json', () => {
  const file = path.resolve(process.cwd(), '../../sources/littlesu-sources.json');

  it('parses as SourceList with 25 vod + 4 live sources', () => {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const parsed = parseSourceListPayload(raw);
    expect(parsed.sources).toHaveLength(25);
    expect(parsed.liveSources).toHaveLength(4);
    expect(parsed.sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
    expect(parsed.liveSources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
  });
});
