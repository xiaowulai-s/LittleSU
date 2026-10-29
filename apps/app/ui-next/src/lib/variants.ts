import type { Title } from '../data';
import { normalizeTitleText } from './cms';

export interface VariantCandidate {
  title: Title;
  sourceKey: string;
  sourceName: string;
}

/** 把按片名回查到的同名片源合并进详情，恢复换源列表。 */
export function mergeVariantCandidates(detail: Title, candidates: VariantCandidate[]): Title {
  if (!detail.sourceKey || !detail.vodId) return detail;
  const targetName = normalizeTitleText(detail.name);
  const map = new Map<string, { sourceKey: string; sourceName: string; vodId: string; playable: number }>();
  map.set(`${detail.sourceKey}:${detail.vodId}`, {
    sourceKey: detail.sourceKey,
    sourceName: detail.source,
    vodId: detail.vodId,
    playable: detail.playable || 0,
  });
  candidates.forEach(({ title, sourceKey, sourceName }) => {
    if (!title.vodId || normalizeTitleText(title.name) !== targetName) return;
    map.set(`${sourceKey}:${title.vodId}`, {
      sourceKey,
      sourceName,
      vodId: title.vodId,
      playable: title.playable || 0,
    });
  });
  if (map.size <= 1) return detail;
  const variants = Array.from(map.values()).sort((a, b) => b.playable - a.playable);
  return { ...detail, variants, sources: Array.from(new Set(variants.map((variant) => variant.sourceName))) };
}
